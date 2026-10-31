import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('occupied overlay port rejects startup cleanly without an unhandled WebSocket error', { timeout: 15_000 }, () => {
  // A separate process keeps the intentional startup failure's exitCode out of this test runner.
  const script = [
    "import assert from 'node:assert/strict';",
    "import { createServer } from 'node:http';",
    "import { once } from 'node:events';",
    "import { startOverlay } from './src/overlay.ts';",
    "const blocker = createServer();",
    "blocker.listen(0, '127.0.0.1');",
    "await once(blocker, 'listening');",
    "const address = blocker.address();",
    "const overlay = startOverlay(address.port, { quiet: true });",
    "try {",
    "  await assert.rejects(overlay.ready, error => error.code === 'EADDRINUSE');",
    "  console.log('startup_rejected_cleanly');",
    "} finally {",
    "  overlay.stop();",
    "  await new Promise(resolve => blocker.close(resolve));",
    "}",
  ].join('\n');
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    input: script,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 16_384,
  });
  assert.ifError(child.error);
  assert.equal(child.signal, null, child.stderr);
  assert.equal(child.status, 1, 'startup failure should set a failing exit status');
  assert.match(child.stdout, /startup_rejected_cleanly/, child.stderr);
  assert.doesNotMatch(child.stderr, /Unhandled 'error' event|node:events:\d+/);
});
