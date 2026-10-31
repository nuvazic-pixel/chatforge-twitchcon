import { startOverlay } from './overlay.js';
const overlay = startOverlay(Number(process.env.PORT ?? 4173), { demo: true });
const examples = [
  { type: 'npc' as const, name: 'The Treacherous Captain', description: 'Gold buys his loyalty.', impact: 'A suspicious captain enters the village.' },
  { type: 'item' as const, name: 'Lantern of Lies', description: 'Its flame turns blue at every lie.', impact: 'A lantern reveals the captain’s plan.' },
  { type: 'danger' as const, name: 'Ash Storm', description: 'Clouds gather above the tower.', impact: 'The storm threatens the forest road.' },
  { type: 'event' as const, name: 'Arrival of the Dragon', description: 'A dragon watches over the village.', impact: 'The dragon lands near the village. The story continues…' },
];
examples.forEach((entity, index) => overlay.propose({
  id: 'moderation-demo-' + index, entity, author: ['Demo · Mira', 'Demo · Alex', 'Demo · Nova', 'Demo · Radu'][index],
}));
process.once('SIGINT', overlay.stop); process.once('SIGTERM', overlay.stop);
console.log('SIMULATED MODERATION DEMO — four proposals await your decision. No Twitch or AI calls.');

