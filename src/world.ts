import { z } from 'zod';
import { ForgeEntitySchema, type ForgeEntity } from './schema.js';
export type WorldEvent = { id: string; entity: ForgeEntity; author?: string };
export type WorldState = { revision: number; chaosLevel: number; scores: Record<string, number>; entities: (ForgeEntity & { id: string; x: number; y: number; author?: string })[]; history: string[] };
export const emptyWorld = (): WorldState => ({ revision: 0, chaosLevel: 0, scores: {}, entities: [], history: [] });
// 15 sloturi fixe parcurse cu pasul 4 (coprim cu 15): primele creații se răsfiră pe hartă, iar ultimele 15 nu se suprapun.
const slotPosition = (index: number) => { const slot = (index * 4) % 15; return { x: 12 + (slot % 5) * 18, y: 20 + Math.floor(slot / 5) * 28 }; };
export function reduceWorld(state: WorldState, event: WorldEvent): WorldState {
  if (state.entities.some(e => e.id === event.id)) return state;
  const entity = ForgeEntitySchema.parse(event.entity);
  const author = z.string().trim().min(1).max(100).optional().parse(event.author);
  const index = state.revision;
  return { revision: index + 1,
    chaosLevel: Math.min(100, state.chaosLevel + (entity.type === 'event' ? 30 : 0)),
    scores: author ? { ...state.scores, [author]: (Object.hasOwn(state.scores, author) ? state.scores[author]! : 0) + 10 } : state.scores,
    entities: [...state.entities, { ...entity, id: event.id, ...(author ? { author } : {}), ...slotPosition(index) }].slice(-15),
    history: [...state.history, entity.impact].slice(-6) };
}

