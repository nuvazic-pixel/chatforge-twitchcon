import { startOverlay } from './overlay.js';
// Demo simulat: evenimentele pornesc când se conectează primul browser, ca să nu fie consumate înainte să se deschidă pagina.
const examples = [
  { type: 'npc' as const, name: 'The Treacherous Captain', description: 'Gold buys his loyalty.', impact: 'A suspicious captain enters the village.' },
  { type: 'item' as const, name: 'Lantern of Lies', description: 'Its flame turns blue at every lie.', impact: 'A lantern reveals the captain’s plan.' },
  { type: 'danger' as const, name: 'Ash Storm', description: 'Clouds gather above the tower.', impact: 'The storm threatens the forest road.' },
  { type: 'event' as const, name: 'Arrival of the Dragon', description: 'A dragon watches over the village.', impact: 'The dragon lands near the village. The story continues…' },
];
let index = 0;
let started = false;
let timer: ReturnType<typeof setInterval> | undefined;
let delay: ReturnType<typeof setTimeout> | undefined;
function begin() {
  if (started) return;
  started = true;
  const tick = () => {
    const entity = examples[index];
    if (entity) { overlay.apply({ id: 'demo-' + index, entity, author: ['Demo · Mira', 'Demo · Alex', 'Demo · Nova', 'Demo · Radu'][index] }); index++; }
    else clearInterval(timer);
  };
  delay = setTimeout(() => { tick(); timer = setInterval(tick, 3500); }, 1500);
}
const overlay = startOverlay(Number(process.env.PORT ?? 4173), { onClient: begin });
const stop = () => { clearTimeout(delay); clearInterval(timer); overlay.stop(); };
process.once('SIGINT', stop); process.once('SIGTERM', stop);
console.log('SIMULATED DEMO — no Twitch or AI calls. Events start when a browser connects.');


