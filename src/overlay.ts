import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { createCooperative, type Crisis } from './cooperative.js';
import type { WorldState } from './world.js';
import { createModeration } from './moderation.js';
import { emptyWorld, reduceWorld, type WorldEvent } from './world.js';

const Decision = z.strictObject({
  id: z.string().min(1).max(200), action: z.enum(['approve', 'reject']), entity: z.unknown().optional(),
});
export function startOverlay(port = 4173, options: { onClient?: () => void; quiet?: boolean; demo?: boolean; planCrisis?: (world: WorldState) => Promise<Crisis> } = {}) {
  let state = emptyWorld();
  const feedback: { author: string; text: string; at: number }[] = [];
  function notify(author: string, text: string) {
    feedback.push({ author: author.slice(0, 100), text: text.slice(0, 240), at: Date.now() });
    if (feedback.length > 4) feedback.shift();
    broadcast();
  }
  const directorKey = randomBytes(32).toString('hex');
  const coop = createCooperative(broadcast, options.planCrisis);
  const snapshot = () => JSON.stringify({ kind: 'world.snapshot', state, cooperative: coop.snapshot(), feedback });
  function broadcast() { state = { ...state, chaosLevel: coop.snapshot().chaos }; for (const client of ws.clients) if (client.readyState === WebSocket.OPEN) client.send(snapshot()); }
  function apply(event: WorldEvent) {
    const next = reduceWorld(state, event);
    if (next === state) return;
    state = next;
    feedback.push({ author: event.author ?? 'Director', text: event.entity.name + ' is now on the map!', at: Date.now() });
    if (feedback.length > 4) feedback.shift();
    coop.accepted(event, state);
    broadcast();
  }
  const moderation = createModeration(apply);
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body));
  };
  function authorized(req: IncomingMessage) {
    const header = req.headers['x-director-key'];
    if (typeof header !== 'string') return false;
    const supplied = Buffer.from(header);
    const expected = Buffer.from(directorKey);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }
  async function body(req: IncomingMessage) {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16_384) throw new Error('too-large');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  }
  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'");
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    const expectedHost = '127.0.0.1:' + actualPort;
    if (req.headers.host !== expectedHost) { json(res, 403, { error: 'Use the local address 127.0.0.1.' }); return; }
    const path = (req.url ?? '/').split('?')[0]!;
    if (path === '/api/director') {
      if (!authorized(req)) { json(res, 401, { error: 'Open the Director link shown in the terminal.' }); return; }
      if (req.method === 'GET') { json(res, 200, { pending: moderation.list(), revision: state.revision, demo: options.demo === true }); return; }
      if (req.method !== 'POST') { json(res, 405, { error: 'Method not allowed.' }); return; }
      if (req.headers.origin !== 'http://' + expectedHost || !req.headers['content-type']?.startsWith('application/json')) {
        json(res, 403, { error: 'Request not allowed.' }); return;
      }
      let input: z.infer<typeof Decision>;
      try {
        input = Decision.parse(await body(req));
        const found = moderation.decide(input.id, input.action, input.entity);
        if (!found) { json(res, 409, { error: 'This proposal has already been processed.' }); return; }
      } catch {
        json(res, 400, { error: 'Invalid data. Check the name, description, impact and stats.' }); return;
      }
      json(res, 200, { pending: moderation.list(), revision: state.revision, demo: options.demo === true });
      return;
    }
    if (req.method !== 'GET') { json(res, 405, { error: 'Method not allowed.' }); return; }
    const paths: Record<string, string> = {
      '/': 'index.html', '/overlay': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css',
      '/vote-focus.js': 'vote-focus.js', '/vote-focus.css': 'vote-focus.css',
      '/assets/vale-realista-v2.png': 'assets/vale-realista-v2.png',
      '/director': 'director.html', '/director.js': 'director.js', '/director.css': 'director.css',
    };
    const file = paths[path];
    if (!file) { res.writeHead(404); res.end(); return; }
    try {
      const content = await readFile(new URL('../public/' + file, import.meta.url));
      res.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8');
      // Progressive enhancement: preserve the existing map, renderer, OBS mode and director.
      // Serve a separate voting HUD rather than modifying the original public app.js.
      if (file === 'index.html') {
        const html = content.toString('utf8');
        const css = '<link rel="stylesheet" href="/vote-focus.css">';
        const js = '<script defer src="/vote-focus.js"></script>';
        res.end(((/<\/head>/i.test(html) ? html.replace(/<\/head>/i, css + '</head>') : css + html))
          .replace(/<\/body>/i, js + '</body>'));
      } else {
        res.end(content);
      }
    } catch { res.writeHead(500); res.end('Resource unavailable'); }
  }
  const server = createServer((req, res) => {
    void handle(req, res).catch(() => { if (!res.headersSent) json(res, 500, { error: 'Local error.' }); else res.end(); });
  });
  server.requestTimeout = 10_000;
  const ws = new WebSocketServer({ server, maxPayload: 1024 });
  ws.on('error', () => {}); // HTTP server reports startup failures through ready.
  ws.on('connection', socket => { socket.send(snapshot()); socket.on('error', () => {}); options.onClient?.(); });
  server.on('error', () => { console.error('[Overlay] Port unavailable.'); process.exitCode = 1; });
  const ready = new Promise<{ url: string; directorUrl: string }>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      const url = 'http://127.0.0.1:' + actualPort;
      const directorUrl = url + '/director#' + directorKey;
      if (!options.quiet) console.log('Overlay: ' + url + '\nDirector (private, local): ' + directorUrl);
      resolve({ url, directorUrl });
    });
  });
  void ready.catch(() => {});
  return {
    ready, apply, notify,
    vote: coop.vote,
    propose: moderation.propose,
    stop() { coop.stop(); for (const client of ws.clients) client.terminate(); ws.close(); server.close(); },
  };
}



