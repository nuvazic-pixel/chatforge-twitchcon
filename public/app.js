'use strict';
/* ChatForge — client overlay.
   Primește `world.snapshot` prin WebSocket (neschimbat) și desenează harta.
   Tot textul din date intră în DOM prin textContent. */

const query = new URLSearchParams(location.search);
const transparent = query.has('transparent');
const demo = query.has('demo');
if (transparent) document.documentElement.classList.add('transparent');

const $ = selector => document.querySelector(selector);
const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => motionQuery.matches;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const TYPES = {
  npc:    { label: 'CHARACTER',  rune: 'ᛗ', frame: '<circle cx="28" cy="28" r="25"/>',                                 iconY: 16, rgb: [127, 224, 195] },
  item:   { label: 'ITEM',    rune: 'ᚠ', frame: '<path d="M28 2 54 28 28 54 2 28Z"/>',                              iconY: 16, rgb: [242, 194, 91] },
  event:  { label: 'EVENT', rune: 'ᛞ', frame: '<path d="M28 2 50.5 15 50.5 41 28 54 5.5 41 5.5 15Z"/>',           iconY: 16, rgb: [183, 156, 255] },
  danger: { label: 'DANGER',   rune: 'ᚦ', frame: '<path d="M28 3 54 49H2Z"/>',                                       iconY: 21, rgb: [255, 111, 94] },
};
const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
const GOLD = [242, 194, 91];
const safeType = type => (Object.prototype.hasOwnProperty.call(TYPES, type) ? type : 'event');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function svgIcon(className, inner, viewBox) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = inner; // doar șiruri constante definite în acest fișier
  return svg;
}
const glyph = type => svgIcon('glyph', '<use href="#i-' + safeType(type) + '"/>', '0 0 24 24');
const medallion = type => {
  const t = TYPES[type];
  return svgIcon('medal', '<g class="frame-shape">' + t.frame + '</g><use href="#i-' + type + '" x="16" y="' + t.iconY + '" width="24" height="24"/>', '0 0 56 56');
};

/* ───── Elemente decorative construite o singură dată ───── */
const map = $('#map');
const markersLayer = $('#markers');
const effectsLayer = $('#effects');

const runeTiles = {};

(function buildDecor() {
  const ring = $('#etch-runes');
  for (let i = 0; ring && i < 28; i++) {
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('y', '-150');
    text.setAttribute('transform', 'rotate(' + (i * 360 / 28) + ')');
    text.textContent = RUNES[i % RUNES.length];
    ring.append(text);
  }
  const legend = $('#legend');
  for (const type of Object.keys(TYPES)) {
    const tile = el('div', 'rune t-' + type);
    tile.append(el('b', null, TYPES[type].rune), el('span', null, TYPES[type].label));
    legend.append(tile);
    runeTiles[type] = tile;
  }
  $('#mode').textContent = demo ? 'SIMULATED DEMO' : 'LIVE';
  $('#mode').classList.add(demo ? 'demo' : 'live');
})();

const SUMMON_SVG = (() => {
  let ticks = '';
  let runes = '';
  for (let i = 0; i < 24; i++) ticks += '<line x1="0" y1="-92" x2="0" y2="-83" transform="rotate(' + i * 15 + ')"/>';
  for (let i = 0; i < 8; i++) runes += '<text y="-74" transform="rotate(' + i * 45 + ')">' + RUNES[(i * 3) % RUNES.length] + '</text>';
  return '<circle class="a" r="92"/><circle class="b" r="68"/>' +
    '<path class="c" d="M0 -62 L53.7 31 L-53.7 31Z M0 62 L53.7 -31 L-53.7 -31Z"/>' +
    '<g class="t">' + ticks + '</g><g class="r">' + runes + '</g>';
})();

/* ───── Efecte pe canvas: particule care converg, scântei, embers ───── */
const fx = { canvas: $('#fx'), ctx: null, w: 0, h: 0, parts: [], embers: [], forge: null, nextEmber: 0, running: false };
fx.ctx = fx.canvas.getContext ? fx.canvas.getContext('2d') : null;

function sizeFx() {
  const rect = map.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  fx.w = rect.width; fx.h = rect.height;
  fx.canvas.width = Math.max(1, Math.round(rect.width * dpr));
  fx.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  if (fx.ctx) fx.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const glow = $('.forge-glow');
  if (glow) {
    const box = glow.getBoundingClientRect();
    fx.forge = { x: box.left - rect.left + box.width / 2, y: box.top - rect.top + box.height / 2 };
  }
}
if (typeof ResizeObserver === 'function') new ResizeObserver(sizeFx).observe(map);
window.addEventListener('resize', sizeFx);
sizeFx();

const rgba = (rgb, a) => 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
function dot(ctx, x, y, r, rgb, a) {
  ctx.fillStyle = rgba(rgb, a * 0.18);
  ctx.beginPath(); ctx.arc(x, y, r * 3, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba(rgb, a);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

function frame(now) {
  fx.running = false;
  const ctx = fx.ctx;
  if (!ctx) return;
  ctx.clearRect(0, 0, fx.w, fx.h);
  if (reduced()) { fx.parts.length = 0; fx.embers.length = 0; return; }
  ctx.globalCompositeOperation = 'lighter';

  if (fx.forge && now > fx.nextEmber && fx.embers.length < 14) {
    fx.embers.push({ x: fx.forge.x + (Math.random() - 0.5) * 30, y: fx.forge.y - 10, vx: (Math.random() - 0.5) * 8,
      vy: -(14 + Math.random() * 22), t0: now, life: 2600 + Math.random() * 2400, size: 0.8 + Math.random() * 1.4, ph: Math.random() * TAU });
    fx.nextEmber = now + 280 + Math.random() * 420;
  }
  for (let i = fx.embers.length - 1; i >= 0; i--) {
    const e = fx.embers[i];
    const age = now - e.t0;
    if (age > e.life) { fx.embers.splice(i, 1); continue; }
    const k = age / e.life;
    dot(ctx, e.x + e.vx * age / 1000 + Math.sin(age / 500 + e.ph) * 6, e.y + e.vy * age / 1000, e.size, [255, 176, 86], Math.sin(k * Math.PI) * 0.7);
  }

  for (let i = fx.parts.length - 1; i >= 0; i--) {
    const p = fx.parts[i];
    const age = now - p.t0;
    if (p.kind === 'in') {
      const q = (age - p.delay) / p.dur;
      if (q < 0) continue;
      if (q >= 1) { fx.parts.splice(i, 1); continue; }
      const e = q * q;
      const rad = p.r * (1 - e);
      const ang = p.a + p.spin * e;
      const x = p.cx + Math.cos(ang) * rad;
      const y = p.cy + Math.sin(ang) * rad;
      p.trail.push(x, y);
      if (p.trail.length > 14) p.trail.splice(0, 2);
      const a = Math.min(1, q * 3) * (1 - q * 0.35);
      ctx.lineWidth = p.size; ctx.lineCap = 'round';
      for (let j = 2; j < p.trail.length; j += 2) {
        ctx.strokeStyle = rgba(p.rgb, a * (j / p.trail.length) * 0.55);
        ctx.beginPath(); ctx.moveTo(p.trail[j - 2], p.trail[j - 1]); ctx.lineTo(p.trail[j], p.trail[j + 1]); ctx.stroke();
      }
      dot(ctx, x, y, p.size * 1.2, p.rgb, a);
    } else if (p.kind === 'spark') {
      const k = age / p.life;
      if (k >= 1) { fx.parts.splice(i, 1); continue; }
      dot(ctx, p.x + p.vx * age / 1000, p.y + p.vy * age / 1000, p.size, p.rgb, (1 - k) * 0.9);
    } else {
      const k = age / p.life;
      if (k >= 1) { fx.parts.splice(i, 1); continue; }
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(p.rgb, (1 - k) * 0.5);
      ctx.beginPath(); ctx.arc(p.x, p.y, 12 + 78 * (1 - Math.pow(1 - k, 3)), 0, TAU); ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  fx.running = true;
  requestAnimationFrame(frame);
}
function ensureLoop() {
  if (!fx.running && fx.ctx && !reduced()) { fx.running = true; requestAnimationFrame(frame); }
}
if (motionQuery.addEventListener) motionQuery.addEventListener('change', ensureLoop);
ensureLoop();

const pointPx = entity => ({ x: fx.w * entity.x / 100, y: fx.h * entity.y / 100 });
function fxConverge(entity) {
  if (reduced() || !fx.ctx) return;
  const c = pointPx(entity);
  const accent = TYPES[safeType(entity.type)].rgb;
  const t0 = performance.now();
  for (let i = 0; i < 40 && fx.parts.length < 300; i++) {
    fx.parts.push({ kind: 'in', cx: c.x, cy: c.y, a: Math.random() * TAU, r: 90 + Math.random() * 130,
      spin: (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.2), delay: Math.random() * 220, dur: 460 + Math.random() * 180,
      t0, size: 1 + Math.random() * 1.6, rgb: i % 2 ? GOLD : accent, trail: [] });
  }
  ensureLoop();
}
function fxBurst(entity) {
  if (reduced() || !fx.ctx) return;
  const c = pointPx(entity);
  const accent = TYPES[safeType(entity.type)].rgb;
  const t0 = performance.now();
  fx.parts.push({ kind: 'ring', x: c.x, y: c.y, t0, life: 800, rgb: accent });
  for (let i = 0; i < 14 && fx.parts.length < 300; i++) {
    const a = Math.random() * TAU;
    const speed = 40 + Math.random() * 70;
    fx.parts.push({ kind: 'spark', x: c.x, y: c.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 18,
      t0, life: 600 + Math.random() * 300, size: 1 + Math.random() * 1.2, rgb: i % 2 ? GOLD : accent });
  }
  ensureLoop();
}

/* ───── Marcaje și momentul de creație ───── */
const known = new Map();      // id → element marker
const queued = new Set();     // id-uri în așteptarea animației
const queue = [];
let latestState = null;
let lastRevision = -1;
let firstSnapshot = true;
let playing = false;
let epoch = 0;

function addMarker(entity, animate) {
  if (known.has(entity.id)) return;
  const type = safeType(entity.type);
  const marker = el('div', 'marker t-' + type + (animate ? ' entering' : ''));
  marker.style.left = entity.x + '%';
  marker.style.top = entity.y + '%';
  const tag = el('div', 'tag');
  tag.append(el('span', 'name', entity.name), el('span', 'kind', TYPES[type].label));
  marker.append(medallion(type), tag);
  const previous = markersLayer.querySelector('.latest');
  if (previous) previous.classList.remove('latest');
  marker.classList.add('latest');
  markersLayer.append(marker);
  known.set(entity.id, marker);
}

function lightRune(type) {
  const tile = runeTiles[safeType(type)];
  tile.classList.add('lit');
  clearTimeout(tile._timer);
  tile._timer = setTimeout(() => tile.classList.remove('lit'), 1700);
}
function flareForge() {
  if (reduced()) return;
  const forge = $('#forge');
  forge.classList.remove('flare');
  void forge.getBoundingClientRect();
  forge.classList.add('flare');
  clearTimeout(forge._timer);
  forge._timer = setTimeout(() => forge.classList.remove('flare'), 1600);
}
function spawnSummon(entity) {
  if (reduced()) return;
  const circle = el('div', 'summon t-' + safeType(entity.type));
  circle.style.left = entity.x + '%';
  circle.style.top = entity.y + '%';
  circle.append(svgIcon('', SUMMON_SVG, '-100 -100 200 200'));
  effectsLayer.append(circle);
  setTimeout(() => circle.remove(), 1900);
}

function renderCard(entity, animate) {
  const card = $('#latest');
  card.className = 'card';
  card.replaceChildren();
  const head = el('div', 'card-head');
  head.append(el('p', 'eyebrow', 'Fresh from the forge'));
  if (demo) head.append(el('span', 'demo-tag', 'DEMO'));
  card.append(head);
  if (!entity) {
    card.append(el('h2', 'name', 'The forge awaits.'), el('p', 'desc', 'The first chat command ignites a rune and brings the map to life.'));
    return;
  }
  const type = safeType(entity.type);
  card.classList.add('t-' + type);
  const kind = el('div', 'kind');
  kind.append(glyph(type), el('span', null, TYPES[type].label));
  card.append(kind, el('h2', 'name', entity.name), el('p', 'desc', entity.description));
  if (typeof entity.author === 'string' && entity.author.trim()) card.append(el('p', 'author', 'Forged by ' + entity.author.trim()));
  const stats = entity.stats ? Object.entries(entity.stats) : [];
  if (stats.length) {
    const row = el('div', 'stats');
    for (const [key, value] of stats.slice(0, 6)) row.append(el('span', 'stat', key + ' · ' + value));
    if (stats.length > 6) row.append(el('span', 'stat', '+' + (stats.length - 6)));
    card.append(row);
  }
  if (animate && !reduced()) { void card.offsetWidth; card.classList.add('fresh'); }
}

function renderTimeline(state, hidden, animate) {
  const list = $('#history');
  const entities = state.entities.slice(0, Math.max(0, state.entities.length - hidden));
  const history = state.history.slice(0, Math.max(0, state.history.length - hidden));
  if (!history.length) { list.replaceChildren(el('li', 'empty', 'No stories in this world yet.')); return; }
  const items = history.map((text, i) => {
    const entity = entities[entities.length - history.length + i];
    const item = el('li');
    const dotEl = el('span', 'dot' + (entity ? ' t-' + safeType(entity.type) : ''));
    if (entity) { dotEl.append(glyph(entity.type)); item.className = 't-' + safeType(entity.type); }
    item.append(dotEl, el('span', null, text));
    return item;
  }).reverse();
  if (animate && !reduced()) items[0].classList.add('fresh');
  list.replaceChildren(...items);
}

function setCounter(value) { $('#revision').textContent = String(Math.max(0, value)).padStart(2, '0'); }

function finish(entity, animate) {
  const hidden = queue.length;
  setCounter(latestState.revision - hidden);
  renderCard(entity, animate);
  renderTimeline(latestState, hidden, animate);
  reactToWorld(entity, animate);
}

async function reveal(entity, fast, myEpoch) {
  if (!latestState.entities.some(e => e.id === entity.id)) return; // a ieșit între timp din hartă
  const alive = () => myEpoch === epoch;
  lightRune(entity.type);
  if (fast) { addMarker(entity, false); finish(entity, false); return; }
  flareForge();
  spawnSummon(entity);                              // t = 0     : cercul de invocare
  await sleep(150); if (!alive()) return;
  fxConverge(entity);                               // t = 150   : particulele converg
  await sleep(800); if (!alive()) return;
  addMarker(entity, true); fxBurst(entity);         // t = 950   : entitatea se materializează
  await sleep(120); if (!alive()) return;
  finish(entity, true);                             // t = 1070  : cardul, contorul, cronologia
  await sleep(650);                                 // t ≈ 1700
}

async function pump() {
  if (playing) return;
  playing = true;
  try {
    while (queue.length) {
      const myEpoch = epoch;
      const entity = queue.shift();
      queued.delete(entity.id);
      await reveal(entity, reduced() || queue.length >= 3, myEpoch);
    }
  } finally { playing = false; }
}

function hardRender(state) {
  epoch++;
  queue.length = 0; queued.clear();
  for (const marker of known.values()) marker.remove();
  known.clear();
  for (const entity of state.entities) addMarker(entity, false);
  setCounter(state.revision);
  renderCard(state.entities.at(-1) ?? null, false);
  renderTimeline(state, 0, false);
  resetPresentation();
  for (const entity of state.entities) reactToWorld(entity, false);
}

function onSnapshot(state) {
  latestState = state;
  if (firstSnapshot || state.revision < lastRevision) {
    firstSnapshot = false; lastRevision = state.revision;
    hardRender(state);
    return;
  }
  lastRevision = state.revision;
  const ids = new Set(state.entities.map(e => e.id));
  for (const [id, marker] of known) {
    if (!ids.has(id)) { known.delete(id); marker.classList.add('leaving'); setTimeout(() => marker.remove(), 500); }
  }
  for (const entity of state.entities) {
    if (!known.has(entity.id) && !queued.has(entity.id)) { queued.add(entity.id); queue.push(entity); }
  }
  void pump();
}

const isState = s => s && typeof s === 'object' && Array.isArray(s.entities) && Array.isArray(s.history) && Number.isFinite(s.revision);

/* ───── Conexiune WebSocket (fluxul existent, neschimbat) ───── */
let retryDelay = 1000;
let retryTimer;
function setConnection(kind, text) {
  const chip = $('#connection');
  chip.className = 'chip conn ' + kind;
  chip.textContent = text;
}
function connect() {
  setConnection('wait', 'Connecting');
  let socket;
  try { socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host); }
  catch { retryTimer = setTimeout(connect, retryDelay); return; }
  socket.onopen = () => { retryDelay = 1000; setConnection('ok', 'Overlay connected'); };
  socket.onmessage = event => {
    try {
      const message = JSON.parse(event.data);
      if (message.kind === 'world.snapshot' && isState(message.state)) { onSnapshot(message.state); renderCooperative(message.cooperative); renderFeedback(message.feedback); setConnection('ok', 'Overlay connected'); }
    } catch { setConnection('err', 'Data unavailable'); }
  };
  socket.onclose = () => {
    setConnection('wait', 'Reconnecting');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 1.6, 6000);
  };
  socket.onerror = () => socket.close();
}

renderCard(null, false);
renderTimeline({ entities: [], history: [] }, 0, false);
connect();

/* Reacții determinate de tip și distanța până la locație. */
const locations = [...document.querySelectorAll('.landmark[data-map-x][data-map-y]')]
  .map(element => ({ element, x: Number(element.dataset.mapX), y: Number(element.dataset.mapY) }))
  .filter(location => Number.isFinite(location.x) && Number.isFinite(location.y));
let cinematicTimer;
let summaryTimer;
function resetPresentation() {
  clearTimeout(cinematicTimer); clearTimeout(summaryTimer);
  $('#cinematic').hidden = true;
  $('#summary').hidden = true;
  $('#summary-toggle').setAttribute('aria-expanded', 'false');
  for (const location of locations) {
    const landmark = location.element;
    landmark?.classList.remove('world-npc', 'world-item', 'world-event', 'world-danger');
  }
}
function reactToWorld(entity, animate) {
  const closest = locations.length ? locations.reduce((best, location) =>
    Math.hypot(entity.x - location.x, entity.y - location.y) < Math.hypot(entity.x - best.x, entity.y - best.y) ? location : best) : null;
  const landmark = closest?.element;
  landmark?.classList.remove('world-npc', 'world-item', 'world-event', 'world-danger');
  landmark?.classList.add('world-' + safeType(entity.type));
  if ($('#summary').hidden === false) renderSummary();
  if (animate && entity.type === 'event') {
    const banner = $('#cinematic');
    banner.replaceChildren(el('span', 'eyebrow', 'THE WORLD IS CHANGING'), el('h2', null, entity.name));
    banner.hidden = false;
    clearTimeout(cinematicTimer);
    cinematicTimer = setTimeout(() => { banner.hidden = true; }, 2400);
  }
  if (demo && animate && latestState.revision === 4 && queue.length === 0) {
    clearTimeout(summaryTimer);
    summaryTimer = setTimeout(() => { if (latestState.revision === 4) showSummary(true); }, 3200);
  }
}
function renderSummary() {
  const summary = $('#summary');
  const state = latestState;
  if (!state) return;
  const counts = Object.fromEntries(Object.keys(TYPES).map(type => [type, state.entities.filter(e => e.type === type).length]));
  summary.replaceChildren(el('p', 'eyebrow', 'THE COMMUNITY LEGEND'), el('h2', null, 'From chat, an entire world.'),
    el('p', 'summary-total', state.revision + ' creations this session'));
  const row = el('div', 'summary-counts');
  for (const type of Object.keys(TYPES)) {
    const cell = el('div', 't-' + type);
    cell.append(el('strong', null, counts[type]), el('span', null, TYPES[type].label));
    row.append(cell);
  }
  const leaders = Object.entries(state.scores ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  summary.append(el('h3', 'valley-architect', '🏆 Arhitectul Văii: ' + (leaders[0]?.[0] ?? '—')));
  if (leaders.length) summary.append(el('p', 'summary-note', leaders[0][1] + ' points' + (leaders.filter(entry => entry[1] === leaders[0][1]).length > 1 ? ' · Tied score; alphabetical order decides the title.' : '')));
  summary.append(row, el('p', 'summary-note', 'Counts reflect creations currently on the map (up to 15).'));
  const close = el('button', null, 'Back to the map');
  close.type = 'button'; close.onclick = () => showSummary(false);
  summary.append(close);
}
function showSummary(show) {
  renderSummary();
  $('#summary').hidden = !show;
  $('#summary-toggle').setAttribute('aria-expanded', String(show));
}
$('#summary-toggle').addEventListener('click', () => showSummary($('#summary').hidden));

let coopView = null;
function renderCooperative(value) {
  if (value) coopView = value;
  const panel = document.querySelector('#cooperative');
  if (!panel || !coopView) return;
  const c = coopView;
  panel.replaceChildren(el('p', 'eyebrow', 'SAVE THE VALLEY · ROUND ' + c.round));
  const chaos = latestState?.chaosLevel ?? c.chaos;
  const bar = $('#chaos-level'); bar.value = chaos;
  $('#chaos-label').textContent = 'CHAOS ' + chaos + ' / 100';
  bar.style.setProperty('--chaos-color', 'rgb(' + Math.round(242 + 13 * chaos / 100) + ', ' + Math.round(194 - 158 * chaos / 100) + ', ' + Math.round(91 - 55 * chaos / 100) + ')');
  if ($('#summary').hidden === false) renderSummary();
  if (c.phase === 'build') panel.append(el('p', null, 'Build allies and items: ' + c.accepted + '/3 approved creations until the next crisis.'));
  if (c.phase === 'planning') panel.append(el('p', null, 'A new crisis is taking shape…'));
  if (c.crisis) panel.append(el('h3', null, c.crisis.title));
  if (c.phase === 'vote') {
    panel.append(el('p', 'coop-clock', 'VOTING OPEN · ' + Math.max(0, Math.ceil((c.deadline - Date.now()) / 1000)) + 's'));
    c.crisis.choices.forEach((text, index) => panel.append(el('p', 'coop-option', '!vote ' + (index + 1) + ' — ' + text + ' · ' + c.votes[index] + ' votes')));
    panel.append(el('small', null, 'One vote per account. Majority: Chaos −25. Tie / no votes: +15.'));
  }
  if (c.phase === 'result') panel.append(el('p', 'coop-result', c.result), el('small', null, 'The next round starts in a few seconds.'));
}
setInterval(() => { if (coopView?.phase === 'vote') renderCooperative(); }, 1000);

function renderFeedback(messages) {
  const list = document.querySelector('#forge-messages');
  if (!list || !Array.isArray(messages)) return;
  list.replaceChildren(...messages.slice(-3).map(message => {
    const row = el('li'); row.append(el('strong', null, message.author + ': '), document.createTextNode(message.text)); return row;
  }));
}
