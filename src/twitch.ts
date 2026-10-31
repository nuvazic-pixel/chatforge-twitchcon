import WebSocket from 'ws';
import { z } from 'zod';
import type { ChatMessage } from './pipeline.js';
export type TwitchConfig = { clientId: string; accessToken: string; broadcasterId: string };
const BASE = 'wss://eventsub.wss.twitch.tv/ws';
const Envelope = z.object({
  metadata: z.object({ message_id: z.string(), message_type: z.string(), subscription_type: z.string().optional() }),
  payload: z.record(z.string(), z.unknown()),
});
const Session = z.object({ id: z.string(), keepalive_timeout_seconds: z.number().nullable(), reconnect_url: z.string().nullable().optional() });
const Chat = z.object({ message_id: z.string(), chatter_user_id: z.string(), chatter_user_name: z.string(), message: z.object({ text: z.string() }) });
export async function validateToken(config: TwitchConfig): Promise<string> {
  const response = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { Authorization: 'OAuth ' + config.accessToken }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Invalid or expired Twitch token.');
  const token = z.object({ client_id: z.string(), user_id: z.string(), scopes: z.array(z.string()) }).parse(await response.json());
  if (token.client_id !== config.clientId || !token.scopes.includes('user:read:chat')) throw new Error('Client ID mismatch or missing user:read:chat.');
  return token.user_id;
}
export async function connectTwitchEventSub(config: TwitchConfig, onChat: (message: ChatMessage) => Promise<void>) {
  const userId = await validateToken(config);
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  const sockets = new Set<WebSocket>();
  const seen = new Map<string, number>();
  const stop = () => {
    stopped = true;
    clearTimeout(retry);
    for (const socket of sockets) socket.close();
  };
  const schedule = () => {
    if (stopped || retry || sockets.size) return;
    retry = setTimeout(() => { retry = undefined; open(BASE); }, Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)));
  };
  function open(url: string, previous?: WebSocket) {
    if (stopped) return;
    const ws = new WebSocket(url);
    sockets.add(ws);
    let timeoutMs = 15_000;
    let watchdog: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ws.terminate(), timeoutMs);
    };
    arm();
    ws.on('message', raw => {
      void handle(raw.toString()).catch(() => {
        console.error('[Twitch] Invalid message or subscription failed.');
        ws.terminate();
      });
    });
    async function handle(raw: string) {
      const msg = Envelope.parse(JSON.parse(raw));
      arm();
      if (msg.metadata.message_type === 'session_welcome') {
        const session = Session.parse(msg.payload.session);
        timeoutMs = (session.keepalive_timeout_seconds ?? 10) * 1000 + 1000;
        arm();
        if (previous) {
          previous.close();
        } else {
          const result = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
            method: 'POST', signal: AbortSignal.timeout(8000),
            headers: { Authorization: 'Bearer ' + config.accessToken, 'Client-Id': config.clientId, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'channel.chat.message', version: '1',
              condition: { broadcaster_user_id: config.broadcasterId, user_id: userId },
              transport: { method: 'websocket', session_id: session.id } }),
          });
          if (!result.ok) {
            console.error('[Twitch] Subscription HTTP', result.status);
            if ([400, 401, 403].includes(result.status)) { stop(); process.exitCode = 1; return; }
            throw new Error('Subscription failed');
          }
        }
        attempts = 0;
        console.log('[Twitch] Session active.');
      } else if (msg.metadata.message_type === 'session_reconnect') {
        const session = Session.parse(msg.payload.session);
        if (!session.reconnect_url) throw new Error('Missing reconnect URL');
        const target = new URL(session.reconnect_url);
        if (target.protocol !== 'wss:' || target.hostname !== 'eventsub.wss.twitch.tv') throw new Error('Invalid reconnect host');
        if (sockets.size === 1) open(session.reconnect_url, ws);
      } else if (msg.metadata.message_type === 'revocation') {
        console.error('[Twitch] Authorization revoked. Reauthorize the account and restart.');
        stop(); process.exitCode = 1;
      } else if (msg.metadata.message_type === 'notification' && msg.metadata.subscription_type === 'channel.chat.message') {
        const event = Chat.parse(msg.payload.event);
        const now = Date.now();
        for (const [id, time] of seen) if (now - time > 600_000) seen.delete(id);
        if (seen.has(event.message_id)) return;
        seen.set(event.message_id, now);
        if (seen.size > 10_000) seen.delete(seen.keys().next().value!);
        void onChat({ id: event.message_id, userId: event.chatter_user_id, username: event.chatter_user_name, text: event.message.text })
          .catch(() => console.error('[Twitch] Command processing failed.'));
      }
    }
    ws.on('error', () => console.error('[Twitch] Connection error.'));
    ws.on('close', () => { clearTimeout(watchdog); sockets.delete(ws); schedule(); });
  }
  open(BASE);
  const revalidate = setInterval(() => {
    void validateToken(config).catch(() => { console.error('[Twitch] Token validation failed. Reauthorize and restart.'); stop(); process.exitCode = 1; });
  }, 3_600_000);
  revalidate.unref();
  return () => { clearInterval(revalidate); stop(); };
}
