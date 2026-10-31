import { z } from 'zod';
import { ForgeEntitySchema } from './schema.js';
import type { WorldEvent } from './world.js';
export type Proposal = WorldEvent & { createdAt: string };
const EventSchema = z.strictObject({
  id: z.string().min(1).max(200), entity: ForgeEntitySchema,
  author: z.string().trim().min(1).max(100).optional(),
});
export function createModeration(publish: (event: WorldEvent) => void, capacity = 50) {
  const pending = new Map<string, Proposal>();
  // Bounded duplicate protection independent of the world's last 15 entities.
  const seen = new Set<string>();
  return {
    propose(input: WorldEvent): boolean {
      const event = EventSchema.parse(input);
      if (seen.has(event.id) || pending.has(event.id) || pending.size >= capacity) return false;
      seen.add(event.id);
      if (seen.size > 10_000) seen.delete(seen.values().next().value!);
      pending.set(event.id, { ...event, createdAt: new Date().toISOString() });
      return true;
    },
    list(): Proposal[] { return structuredClone([...pending.values()]); },
    decide(id: string, action: 'approve' | 'reject', edited?: unknown): boolean {
      const proposal = pending.get(id);
      if (!proposal) return false;
      if (action === 'approve') {
        const entity = ForgeEntitySchema.parse(edited === undefined ? proposal.entity : edited);
        publish({ id: proposal.id, entity, ...(proposal.author ? { author: proposal.author } : {}) });
      }
      pending.delete(id);
      return true;
    },
  };
}

