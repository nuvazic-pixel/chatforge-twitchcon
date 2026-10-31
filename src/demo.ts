import { createPipeline } from './pipeline.js';
import { normalizeOutput } from './schema.js';
// Fixture only: no Twitch connection and no AI/API calls.
const handle = createPipeline(async () => normalizeOutput({ entity: {
  type: 'item', name: 'Lantern of Lies', description: 'It glows when someone lies.',
  stats: [{ key: 'utility', value: 10 }], impact: 'Reveals a lie in the tavern.',
} }), entity => console.log(JSON.stringify(entity, null, 2)));
console.log('Offline demo — simulated AI response.');
await handle({ id: 'demo-1', userId: 'viewer-1', username: 'Spectator', text: '!forge item lanterna minciunilor' });
