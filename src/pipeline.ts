import { isForgeCommand, type ForgeEntity } from './schema.js';
export type ChatMessage = { id: string; userId: string; username: string; text: string };
export function createPipeline(parse: (text: string) => Promise<ForgeEntity | null>, emit: (entity: ForgeEntity, message: ChatMessage) => void, feedback: (message: ChatMessage, text: string) => void = () => {}) {
  let pending = 0;
  let tail = Promise.resolve();
  const cooldown = new Map<string, number>();
  return (message: ChatMessage): Promise<void> => {
    if (!/^!forge\b/i.test(message.text.trim())) return Promise.resolve();
    const now = Date.now();
    for (const [id, time] of cooldown) if (now - time >= 5000) cooldown.delete(id);
    if (!isForgeCommand(message.text)) {
      feedback(message, message.text.length > 500 ? 'Please keep your idea under 500 characters.' : 'Send one idea per message. Try: !forge robots or !forge a magic sword.');
      return Promise.resolve();
    }
    if (cooldown.has(message.userId)) { feedback(message, 'Please wait 5 seconds between creations, then try again.'); return Promise.resolve(); }
    if (pending >= 20) { feedback(message, 'The forge is busy. Please try again shortly.'); return Promise.resolve(); }
    cooldown.set(message.userId, now);
    pending++;
    feedback(message, 'Your idea is queued. The forge is working…');
    tail = tail.then(async () => {
      const entity = await parse(message.text);
      if (entity) emit(entity, message);
      else feedback(message, 'Could not create that idea. Try rephrasing it; the AI may also be temporarily unavailable.');
    }).catch(() => { console.error('[Pipeline] Command rejected.'); feedback(message, 'Creation failed. Please try again shortly.'); }).finally(() => { pending--; });
    return tail;
  };
}
