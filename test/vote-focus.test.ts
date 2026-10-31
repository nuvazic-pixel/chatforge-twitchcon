import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startOverlay } from '../src/overlay.js';

test('overlay serves prominent voting HUD without changing the original app or transparent mode', { timeout: 10_000 }, async t => {
  const overlay = startOverlay(0, { quiet: true });
  t.after(() => overlay.stop());
  const { url } = await overlay.ready;
  const response = await fetch(url + '/?transparent=1');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /href="\/vote-focus\.css"/);
  assert.match(html, /src="\/vote-focus\.js"/);
  const js = await fetch(url + '/vote-focus.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type') ?? '', /javascript/);
  const script = await js.text();
  assert.match(script, /!vote 1 OR !vote 2 IN TWITCH CHAT/);
  assert.match(script, /world\.snapshot/);
  assert.match(script, /\.textContent\s*=/, 'untrusted event text must be rendered as text, not HTML');
  const css = await fetch(url + '/vote-focus.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type') ?? '', /text\/css/);
  assert.match(await css.text(), /cf-focus__options/);
});
