import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import { createModeration } from '../src/moderation.js';
import type { WorldEvent } from '../src/world.js';

const event = (id = 'chat-1'): WorldEvent => ({
  id, author: 'Mira',
  entity: { type: 'npc', name: 'Căpitanul', description: 'Un căpitan corupt.', impact: 'Intră în sat.', stats: { loyalty: 0 } },
});

test('proposals remain hidden from the world until explicitly approved', () => {
  const published: WorldEvent[] = [];
  const queue = createModeration(value => published.push(value));
  const proposal = event();
  assert.equal(queue.propose(proposal), true);
  assert.equal(published.length, 0);
  const pending = queue.list();
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.id, proposal.id);
  assert.ok(Number.isFinite(Date.parse(pending[0]!.createdAt)));
  assert.equal(queue.decide(proposal.id, 'approve'), true);
  assert.deepEqual(published, [proposal]);
  assert.equal(queue.list().length, 0);
});

test('reject discards a proposal without emitting and cannot be repeated', () => {
  const published: WorldEvent[] = [];
  const queue = createModeration(value => published.push(value));
  queue.propose(event());
  assert.equal(queue.decide('chat-1', 'reject'), true);
  assert.equal(queue.decide('chat-1', 'reject'), false);
  assert.equal(queue.decide('chat-1', 'approve'), false);
  assert.equal(queue.decide('unknown', 'approve'), false);
  assert.deepEqual(published, []);
  assert.deepEqual(queue.list(), []);
  assert.equal(queue.propose(event()), false);
});

test('approve accepts validated edits while preserving source ID and author', () => {
  const published: WorldEvent[] = [];
  const queue = createModeration(value => published.push(value));
  queue.propose(event());
  const edited = { type: 'item', name: 'Lanterna', description: 'Arată minciunile.', impact: 'Aprinde camera.', stats: { utility: 8 } };
  assert.equal(queue.decide('chat-1', 'approve', edited), true);
  assert.deepEqual(published, [{ id: 'chat-1', author: 'Mira', entity: edited }]);
  assert.equal(queue.decide('chat-1', 'approve'), false);
  assert.equal(queue.propose(event()), false);
});

test('invalid edits leave the proposal pending and publish nothing', () => {
  const published: WorldEvent[] = [];
  const queue = createModeration(value => published.push(value));
  queue.propose(event());
  for (const edited of [{ ...event().entity, description: 'x'.repeat(201) }, { ...event().entity, author: 'Spoofed' }, null]) {
    assert.throws(() => queue.decide('chat-1', 'approve', edited), ZodError);
    assert.equal(queue.list().length, 1);
    assert.equal(published.length, 0);
  }
  assert.equal(queue.decide('chat-1', 'approve'), true);
  assert.equal(published.length, 1);
});

test('queue capacity bounds pending work and frees a slot after a decision', () => {
  const queue = createModeration(() => {}, 2);
  assert.equal(queue.propose(event('1')), true);
  assert.equal(queue.propose(event('2')), true);
  assert.equal(queue.propose(event('3')), false);
  assert.equal(queue.propose(event('1')), false);
  assert.equal(queue.list().length, 2);
  assert.equal(queue.decide('1', 'reject'), true);
  assert.equal(queue.propose(event('3')), true);
  assert.deepEqual(queue.list().map(value => value.id), ['2', '3']);
});

test('proposal input and list snapshots cannot mutate pending entities or nested stats', () => {
  const published: WorldEvent[] = [];
  const queue = createModeration(value => published.push(value));
  const input = event();
  queue.propose(input);
  input.author = 'Changed input';
  input.entity.name = 'Changed input name';
  input.entity.stats!.loyalty = 999;
  const snapshot = queue.list();
  snapshot[0]!.author = 'Changed snapshot';
  snapshot[0]!.entity.name = 'Changed snapshot name';
  snapshot[0]!.entity.stats!.loyalty = 500;
  snapshot.length = 0;
  assert.equal(queue.list().length, 1);
  assert.equal(queue.decide('chat-1', 'approve'), true);
  assert.deepEqual(published, [event()]);
});

test('malformed source ID, author and entity cannot enter the moderation queue', () => {
  const queue = createModeration(() => {});
  for (const input of [{ ...event(), id: '' }, { ...event(), author: 'x'.repeat(101) }, { ...event(), entity: { ...event().entity, type: 'dragon' } }]) {
    assert.throws(() => queue.propose(input as WorldEvent), ZodError);
  }
  assert.equal(queue.list().length, 0);
});
test('an old pending ID cannot be overwritten after duplicate-cache eviction', () => {
  const queue = createModeration(() => {});
  queue.propose(event('old-pending'));
  for (let i = 0; i < 10_001; i++) {
    const id = 'decided-' + i;
    queue.propose(event(id));
    queue.decide(id, 'reject');
  }
  const altered = event('old-pending');
  altered.entity.name = 'Replacement';
  assert.equal(queue.propose(altered), false);
  assert.equal(queue.list()[0]?.entity.name, 'Căpitanul');
});
