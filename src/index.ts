import { config } from 'dotenv';
import { startOverlay } from './overlay.js';
import { z } from 'zod';
import { createCrisisPlanner } from './crisisPlanner.js';
import { createParser } from './aiParser.js';
import { createPipeline } from './pipeline.js';
import { connectTwitchEventSub } from './twitch.js';
// Local credentials take precedence over inherited environment variables.
config({ override: true, quiet: true });
const Env = z.object({
  PORT: z.coerce.number().int().min(1024).max(65535).default(4173),
  OPENAI_API_KEY: z.string().min(1), OPENAI_MODEL: z.string().min(1).default('gpt-4o-mini'),
  TWITCH_CLIENT_ID: z.string().min(1), TWITCH_ACCESS_TOKEN: z.string().min(1),
  TWITCH_BROADCASTER_ID: z.string().regex(/^\d+$/),
});
async function main() {
  const result = Env.safeParse(process.env);
  if (!result.success) throw new Error('Complete .env: ' + result.error.issues.map(i => i.path.join('.')).join(', '));
  const env = result.data;
  const overlay = startOverlay(env.PORT, { planCrisis: createCrisisPlanner(env.OPENAI_API_KEY, env.OPENAI_MODEL) });
  await overlay.ready;
  const handle = createPipeline(createParser(env.OPENAI_API_KEY, env.OPENAI_MODEL), (entity, message) => {
    const accepted = overlay.propose({ id: message.id, entity, author: message.username });
    overlay.notify(message.username, accepted ? entity.name + ' is ready! Waiting for streamer approval.' : 'The review queue is full or this command was already received.');
    console.log(JSON.stringify({ kind: 'forge.proposal', messageId: message.id, entity }));
  }, (message, text) => overlay.notify(message.username, text));
  let disconnect: () => void;
  try { disconnect = await connectTwitchEventSub({ clientId: env.TWITCH_CLIENT_ID, accessToken: env.TWITCH_ACCESS_TOKEN, broadcasterId: env.TWITCH_BROADCASTER_ID }, async message => {
    if (/^!vote\b/i.test(message.text.trim())) { const accepted = overlay.vote(message.userId, message.text); overlay.notify(message.username, accepted ? 'Your vote has been counted!' : 'Vote not accepted: use !vote 1 or !vote 2 during an open vote. Only your first vote counts.'); return; }
    await handle(message);
  }); } catch (error) { overlay.stop(); throw error; }
  const stop = () => { disconnect(); overlay.stop(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Startup failed.'); process.exitCode = 1; });




