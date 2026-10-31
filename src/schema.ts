import { z } from 'zod';
export const ForgeEntitySchema = z.strictObject({
  type: z.enum(['npc', 'item', 'event', 'danger']),
  name: z.string().min(2).max(80),
  description: z.string().min(1).max(200),
  stats: z.record(z.string().min(1).max(32), z.number().finite()).optional(),
  impact: z.string().min(1).max(200),
  resolutions: z.tuple([z.string().trim().min(1).max(140), z.string().trim().min(1).max(140)]).optional(),
});
export type ForgeEntity = z.infer<typeof ForgeEntitySchema>;
export const ParserOutputSchema = z.strictObject({
  entity: z.strictObject({
    type: z.enum(['npc', 'item', 'event', 'danger']),
    name: z.string(), description: z.string(), impact: z.string(),
    resolutions: z.array(z.string()).nullable().optional(),
    stats: z.array(z.strictObject({ key: z.string(), value: z.number() })).nullable(),
  }).nullable(),
});
export function normalizeOutput(input: unknown): ForgeEntity | null {
  const { entity } = ParserOutputSchema.parse(input);
  if (!entity) return null;
  if (entity.stats && (entity.stats.length > 16 || new Set(entity.stats.map(s => s.key)).size !== entity.stats.length)) return null;
  return ForgeEntitySchema.parse({ ...entity, resolutions: entity.resolutions ?? undefined, stats: entity.stats === null ? undefined : Object.fromEntries(entity.stats.map(s => [s.key, s.value])) });
}
export function isForgeCommand(text: string): boolean {
  if (text.length > 500 || !/^!forge\s+\S/i.test(text.trim())) return false;
  const idea = text.trim().replace(/^!forge\s+/i, '').trim();
  return !/^(?:npc|item|event|danger)\s*:?\s*$/i.test(idea) && !/!forge\b/i.test(idea);
}
