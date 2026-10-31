import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isForgeCommand, normalizeOutput, ForgeEntitySchema } from '../src/schema.js';
import { createPipeline } from '../src/pipeline.js';
const entity = { type: 'npc' as const, name: 'Căpitan', description: 'Un căpitan corupt.', impact: 'Introduce tensiune.' };
test('commands accept natural ideas and explicit types but reject empty or bundled commands', () => {
  for (const text of ['hello', '!forgery npc bob', '!forge npc', '!forge npc ', '!forge', '!forge item:', '!forge robots !forge sword', '!forge npc ' + 'x'.repeat(500)]) assert.equal(isForgeCommand(text), false);
  for (const text of ['!forge robots', '!forge a sword made of ice', '!forge dragon bob', '!forge un robot magic', '!forge npc Bob', '!forge item: lanternă', '!FORGE event ploaie']) assert.equal(isForgeCommand(text), true);
});
test('strict schema rejects oversized, unknown and non-finite fields', () => {
  for (const input of [{ ...entity, extra: 1 }, { ...entity, description: 'x'.repeat(201) }, { ...entity, stats: { power: Infinity } }]) assert.equal(ForgeEntitySchema.safeParse(input).success, false);
});
test('normalization supports refusal, stats and rejects duplicates', () => {
  assert.equal(normalizeOutput({ entity: null }), null);
  assert.deepEqual(normalizeOutput({ entity: { ...entity, stats: [{ key: 'power', value: 5 }] } })?.stats, { power: 5 });
  assert.equal(normalizeOutput({ entity: { ...entity, stats: [{ key: 'x', value: 1 }, { key: 'x', value: 2 }] } }), null);
});
test('pipeline filters noise, applies cooldown, serializes and recovers after errors', async () => {
  let calls = 0; const emitted: string[] = [];
  const handle = createPipeline(async () => { calls++; if (calls === 1) throw new Error('offline'); return entity; }, (_, msg) => emitted.push(msg.id));
  const message = (id: string, userId: string, text = '!forge npc Bob') => ({ id, userId, text, username: 'viewer' });
  await handle(message('noise', 'x', 'hello'));
  await Promise.all([handle(message('1', 'a')), handle(message('2', 'a')), handle(message('3', 'b'))]);
  assert.equal(calls, 2); assert.deepEqual(emitted, ['3']);
});

test('natural ideas reach parser and viewers receive actionable feedback instead of silence', async () => {
 const notices: string[] = []; const parsed: string[] = [];
 const handle = createPipeline(async text => { parsed.push(text); return text.includes('nothing') ? null : entity; }, () => notices.push('pending approval'), (_, text) => notices.push(text));
 const msg = (id: string, text: string) => ({id,userId:id,username:'viewer',text});
 await handle(msg('a','!forge robots'));
 assert.deepEqual(parsed, ['!forge robots']); assert.ok(notices.includes('pending approval'));
 await handle(msg('a','!forge another robot')); assert.match(notices.at(-1)!, /5 seconds/);
 await handle(msg('b','!forge robots !forge sword')); assert.match(notices.at(-1)!, /one idea/i);
 await handle(msg('c','!forge nothing')); assert.match(notices.at(-1)!, /rephrasing/);
 const before = notices.length; await handle(msg('d','ordinary chat')); assert.equal(notices.length,before);
});

test('event resolutions survive normalization and require exactly two nonempty short options', () => {
  const crisis = { ...entity, type: 'event', resolutions: ['Defend', 'Evacuate'] };
  assert.deepEqual(normalizeOutput({ entity: { ...crisis, stats: null } })?.resolutions, crisis.resolutions);
  for (const resolutions of [[], ['One'], ['One', 'Two', 'Three'], [' ', 'Two'], ['x'.repeat(141), 'Two']]) {
    assert.equal(ForgeEntitySchema.safeParse({ ...crisis, resolutions }).success, false);
  }
});
