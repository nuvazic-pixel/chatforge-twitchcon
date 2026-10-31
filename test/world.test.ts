import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorld, reduceWorld } from '../src/world.js';
test('world replay is deterministic and ignores repeated event IDs', () => {
  const event = { id: '1', entity: { type: 'npc' as const, name: 'Căpitan', description: 'Corupt.', impact: 'Intră în sat.' } };
  const state = reduceWorld(emptyWorld(), event);
  assert.deepEqual(state, reduceWorld(emptyWorld(), event));
  assert.equal(reduceWorld(state, event), state);
  assert.equal(state.revision, 1);
  assert.equal(emptyWorld().entities.length, 0);
});
test('author is trusted event metadata, validated independently of AI entity', () => {
  const entity = { type: 'npc' as const, name: 'Căpitan', description: 'Corupt.', impact: 'Intră în sat.' };
  const state = reduceWorld(emptyWorld(), { id: 'author-1', entity, author: '  Mira  ' });
  assert.equal(state.entities[0]?.author, 'Mira');
  assert.throws(() => reduceWorld(emptyWorld(), { id: 'bad', entity, author: 'x'.repeat(101) }));
  assert.equal(reduceWorld(emptyWorld(), { id: 'legacy', entity }).entities[0]?.author, undefined);
});

test('approved entities award ten points and event chaos is clamped without mutating prior state', () => {
  const before = emptyWorld();
  const entity = { type: 'event' as const, name: 'Dragon', description: 'A crisis.', impact: 'Threatens the valley.', resolutions: ['Defend', 'Evacuate'] as [string, string] };
  let state = reduceWorld(before, { id: 'crisis', entity, author: 'Mira' });
  assert.equal(before.chaosLevel, 0); assert.deepEqual(before.scores, {});
  assert.equal(state.chaosLevel, 30); assert.equal(state.scores.Mira, 10);
  assert.equal(reduceWorld(state, { id: 'crisis', entity, author: 'Mira' }), state);
  for (let i = 0; i < 4; i++) state = reduceWorld(state, { id: String(i), entity, author: 'Mira' });
  assert.equal(state.chaosLevel, 100); assert.equal(state.scores.Mira, 50);
  assert.equal(reduceWorld(before, { id: 'special', entity, author: '__proto__' }).scores['__proto__'], 10);
});
