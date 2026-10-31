import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createCooperative } from '../src/cooperative.js';
import { emptyWorld, reduceWorld, type WorldEvent } from '../src/world.js';
const event: WorldEvent = { id: 'one', entity: { type: 'npc', name: 'Blacksmith', description: 'Un aliat.', impact: 'Apără valea.', stats: {} } };
const world = reduceWorld(emptyWorld(), event);
function build(game: ReturnType<typeof createCooperative>) { for (let i = 0; i < 3; i++) game.accepted({ ...event, id: String(i) }, world); }
test('three approved creations open a vote; first vote per user counts and majority resolves', async () => {
 const game = createCooperative(() => {}, undefined, 40);
 try {
 assert.equal(game.vote('u', '!vote 1'), false); build(game); await wait(0);
 assert.equal(game.snapshot().phase, 'vote'); assert.equal(game.snapshot().chaos, 30);
 assert.equal(game.vote('u', '!vote 1'), true); assert.equal(game.vote('u', '!vote 2'), false);
 assert.equal(game.vote('v', '!vote 3'), false); assert.equal(game.vote('v', '!vote 1 extra'), false);
 await wait(65); assert.equal(game.snapshot().phase, 'result'); assert.equal(game.snapshot().chaos, 5);
 assert.equal(game.vote('late', '!vote 2'), false);
 } finally { game.stop(); }
});
test('AI failure falls back, tie and no votes increase chaos', async () => {
 const game = createCooperative(() => {}, async () => { throw new Error('offline'); }, 30);
 try { build(game); await wait(0); assert.ok(game.snapshot().crisis?.choices[0].includes('Blacksmith'));
 game.vote('a', '!vote 1'); game.vote('b', '!vote 2'); await wait(50);
 assert.equal(game.snapshot().chaos, 45); assert.match(game.snapshot().result, /No decision/);
 } finally { game.stop(); }
});
test('stop prevents a late AI response from reopening a vote', async () => {
 let resolve!: (value: { title: string; choices: [string, string] }) => void;
 const game = createCooperative(() => {}, () => new Promise(r => { resolve = r; }));
 build(game); game.stop(); resolve({ title: 'Criza', choices: ['A', 'B'] }); await wait(0);
 assert.equal(game.snapshot().phase, 'planning');
});

test('approved event opens its own sixty-second vote without waiting for three builds', () => {
  const game = createCooperative(() => {});
  try {
    const now = Date.now();
    game.accepted({ id: 'crisis', entity: { type: 'event', name: 'Dragon', description: 'A crisis.', impact: 'Threatens the valley.', resolutions: ['Defend', 'Evacuate'] } }, world);
    const state = game.snapshot();
    assert.equal(state.chaos, 30); assert.equal(state.phase, 'vote');
    assert.deepEqual(state.crisis?.choices, ['Defend', 'Evacuate']);
    assert.ok(state.deadline! >= now + 60_000 && state.deadline! <= Date.now() + 60_000);
    assert.equal(game.vote('viewer', '!vote 2'), true);
  } finally { game.stop(); }
});

test('an approved crisis supersedes a pending AI plan without double chaos', async () => {
  let resolve!: (value: { title: string; choices: [string, string] }) => void;
  const game = createCooperative(() => {}, () => new Promise(r => { resolve = r; }));
  try {
    build(game);
    game.accepted({ id: 'manual', entity: { type: 'event', name: 'Dragon', description: 'A crisis.', impact: 'Threatens the valley.', resolutions: ['Defend', 'Evacuate'] } }, world);
    resolve({ title: 'Stale crisis', choices: ['A', 'B'] }); await wait(0);
    assert.equal(game.snapshot().chaos, 30); assert.equal(game.snapshot().crisis?.title, 'Dragon');
  } finally { game.stop(); }
});
