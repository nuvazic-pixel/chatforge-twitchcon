import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { startOverlay } from '../src/overlay.js';
import type { WorldState } from '../src/world.js';

const entity = { type: 'npc' as const, name: 'Căpitan', description: 'Un căpitan suspect.', impact: 'Intră în sat.' };
const timeout = () => AbortSignal.timeout(3000);

test('director approval is the publication boundary, validated edits retain provenance', { timeout: 10_000 }, async t => {
  const overlay = startOverlay(0, { quiet: true });
  t.after(() => overlay.stop());
  const { url, directorUrl } = await overlay.ready;
  const headers = { 'x-director-key': new URL(directorUrl).hash.slice(1) };
  const snapshots: WorldState[] = [];
  const socket = new WebSocket(url.replace('http:', 'ws:'));
  t.after(() => socket.terminate());
  socket.on('message', raw => {
    snapshots.push((JSON.parse(raw.toString()) as { state: WorldState }).state);
  });
  await once(socket, 'message', { signal: timeout() });
  assert.equal(snapshots[0]?.revision, 0);
  assert.deepEqual(snapshots[0]?.scores, {});
  assert.equal(snapshots[0]?.chaosLevel, 0);
  assert.equal(overlay.propose({ id: 'proposal-1', entity, author: 'Mira' }), true);
  const pending = await fetch(url + '/api/director', { headers, signal: timeout() });
  assert.equal(pending.status, 200);
  const queued = await pending.json() as { revision: number; pending: { id: string }[] };
  assert.equal(queued.revision, 0);
  assert.equal(queued.pending.length, 1);
  assert.equal(snapshots.length, 1, 'enqueue must not send a world snapshot');

  const nextSnapshot = once(socket, 'message', { signal: timeout() });
  const edited = { ...entity, name: 'Căpitanul Iertat', impact: 'Ajută satul.' };
  const approval = await fetch(url + '/api/director', {
    method: 'POST',
    headers: { ...headers, origin: url, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'proposal-1', action: 'approve', entity: edited }),
    signal: timeout(),
  });
  assert.equal(approval.status, 200);
  await nextSnapshot;
  assert.equal(snapshots.length, 2, 'one successful decision sends one update');
  assert.equal(snapshots[1]?.revision, 1);
  assert.equal(snapshots[1]?.scores.Mira, 10);
  assert.equal(snapshots[1]?.entities[0]?.name, edited.name);
  assert.equal(snapshots[1]?.entities[0]?.author, 'Mira');
  assert.equal(snapshots[1]?.entities[0]?.id, 'proposal-1');

  const repeat = await fetch(url + '/api/director', {
    method: 'POST',
    headers: { ...headers, origin: url, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'proposal-1', action: 'approve' }), signal: timeout(),
  });
  assert.equal(repeat.status, 409);
  assert.equal(snapshots.length, 2);

  overlay.propose({ id: 'proposal-2', entity });
  const rejection = await fetch(url + '/api/director', {
    method: 'POST',
    headers: { ...headers, origin: url, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'proposal-2', action: 'reject' }), signal: timeout(),
  });
  assert.equal(rejection.status, 200);
  const rejectedState = await rejection.json() as { pending: unknown[]; revision: number };
  assert.deepEqual(rejectedState.pending, []);
  assert.equal(rejectedState.revision, 1);
  assert.equal(snapshots.length, 2, 'rejection does not broadcast a world update');
});

test('director denies unauthenticated and cross-origin requests and keeps invalid edits pending', { timeout: 10_000 }, async t => {
  const overlay = startOverlay(0, { quiet: true });
  t.after(() => overlay.stop());
  const { url, directorUrl } = await overlay.ready;
  const key = new URL(directorUrl).hash.slice(1);
  const headers = { 'x-director-key': key, origin: url, 'content-type': 'application/json' };
  overlay.propose({ id: 'pending', entity, author: 'Alex' });
  for (const requestHeaders of [{} as Record<string, string>, { 'x-director-key': 'incorrect' }]) {
    const response = await fetch(url + '/api/director', { headers: requestHeaders, signal: timeout() });
    assert.equal(response.status, 401);
  }
  const attack = await fetch(url + '/api/director', {
    method: 'POST', headers: { ...headers, origin: 'https://example.invalid' },
    body: JSON.stringify({ id: 'pending', action: 'approve' }), signal: timeout(),
  });
  assert.equal(attack.status, 403);

  const invalid = await fetch(url + '/api/director', {
    method: 'POST', headers,
    body: JSON.stringify({ id: 'pending', action: 'approve', entity: { ...entity, name: '' } }),
    signal: timeout(),
  });
  assert.equal(invalid.status, 400);
  const current = await fetch(url + '/api/director', { headers, signal: timeout() });
  const data = await current.json() as { pending: { id: string }[]; revision: number };
  assert.equal(data.pending[0]?.id, 'pending');
  assert.equal(data.revision, 0);

  const unknown = await fetch(url + '/api/director', {
    method: 'POST', headers,
    body: JSON.stringify({ id: 'missing', action: 'reject' }), signal: timeout(),
  });
  assert.equal(unknown.status, 409);
});


test('approved creations and votes reach overlay snapshots and reconnect preserves voting state', { timeout: 10_000 }, async t => {
  const overlay = startOverlay(0, { quiet: true }); t.after(() => overlay.stop());
  const { url, directorUrl } = await overlay.ready;
  const socket = new WebSocket(url.replace('http:', 'ws:')); t.after(() => socket.terminate());
  const messages: any[] = []; socket.on('message', raw => messages.push(JSON.parse(raw.toString())));
  await once(socket, 'message', { signal: timeout() });
  for (let i = 0; i < 3; i++) {
    overlay.propose({ id: 'coop-' + i, entity });
    const r = await fetch(url + '/api/director', { method: 'POST', headers: { 'x-director-key': new URL(directorUrl).hash.slice(1), origin: url, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'coop-' + i, action: 'approve' }), signal: timeout() });
    assert.equal(r.status, 200);
  }
  const fresh = new WebSocket(url.replace('http:', 'ws:')); t.after(() => fresh.terminate());
  const [raw] = await once(fresh, 'message', { signal: timeout() });
  assert.equal(JSON.parse(raw.toString()).cooperative.phase, 'vote');
  const voted = once(fresh, 'message', { signal: timeout() });
  assert.equal(overlay.vote('twitch-account', '!vote 2'), true);
  const [update] = await voted;
  assert.deepEqual(JSON.parse(update.toString()).cooperative.votes, [0, 1]);
  assert.equal(overlay.vote('twitch-account', '!vote 1'), false);
});
