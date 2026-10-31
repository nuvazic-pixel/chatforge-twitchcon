/* ChatForge — minimal vote-first HUD. Overlay-only; no commands or user inputs. */
(() => {
  'use strict';

  const root = document.createElement('section');
  root.className = 'cf-focus';
  root.setAttribute('aria-label', 'Live Twitch vote');
  root.setAttribute('aria-live', 'polite');
  root.hidden = true;

  const element = (tag, className, parent, text = '') => {
    const el = document.createElement(tag);
    el.className = className;
    if (text) el.textContent = text;
    parent.appendChild(el);
    return el;
  };

  const header = element('div', 'cf-focus__header', root);
  const badge = element('div', 'cf-focus__badge', header, '⚡ CRISIS · LIVE VOTE');
  const timer = element('div', 'cf-focus__timer', header, '01:00');
  const title = element('h2', 'cf-focus__title', root, 'The valley needs your help');
  const subtitle = element('p', 'cf-focus__subtitle', root, 'Choose how the story continues.');
  const options = element('div', 'cf-focus__options', root);
  const choicePanels = [0, 1].map(index => {
    const panel = element('div', 'cf-focus__option cf-focus__option--' + (index + 1), options);
    const optionHeader = element('div', 'cf-focus__option-head', panel);
    element('span', 'cf-focus__number', optionHeader, String(index + 1));
    const cmd = element('strong', 'cf-focus__command', optionHeader, '!vote ' + (index + 1));
    const choice = element('div', 'cf-focus__choice', panel);
    const bar = element('div', 'cf-focus__bar', panel);
    const fill = element('div', 'cf-focus__bar-fill', bar);
    const tally = element('div', 'cf-focus__tally', panel, '0 votes');
    return { panel, cmd, choice, fill, tally };
  });
  const footer = element('div', 'cf-focus__footer', root);
  const instruction = element('span', 'cf-focus__instruction', footer, '⌨ TYPE !vote 1 OR !vote 2 IN TWITCH CHAT');
  element('span', 'cf-focus__rule', footer, 'One vote per viewer · First vote counts');

  // Explicitly append only to the viewer page. Director requests never serve this script.
  document.body.appendChild(root);

  let current = null;
  let reportedChange = null;
  let lastRound = null;
  let socket = null;
  let reconnectTimer = null;
  let disposed = false;

  const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const countLabel = value => value + (value === 1 ? ' vote' : ' votes');
  const displayTime = ms => {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  };

  function paint() {
    if (!current || !['vote', 'result'].includes(current.phase) || !current.crisis) {
      root.hidden = true;
      return;
    }

    const isVote = current.phase === 'vote';
    root.hidden = false;
    root.dataset.phase = current.phase;

    const [first, second] = [numeric(current.votes?.[0]), numeric(current.votes?.[1])];
    const total = first + second;
    title.textContent = String(current.crisis.title || 'The valley needs your help');
    const labels = Array.isArray(current.crisis.choices) ? current.crisis.choices : [];
    for (const [index, parts] of choicePanels.entries()) {
      const votes = index === 0 ? first : second;
      parts.choice.textContent = String(labels[index] || 'Option ' + (index + 1));
      parts.tally.textContent = countLabel(votes);
      parts.fill.style.width = (total ? (votes / total) * 100 : 0) + '%';
      parts.panel.classList.toggle('cf-focus__option--winner', !isVote && first !== second && votes > 0 && votes === Math.max(first, second));
    }

    if (isVote) {
      badge.textContent = '⚡ CRISIS · LIVE VOTE';
      timer.textContent = displayTime(numeric(current.deadline) - Date.now());
      timer.classList.toggle('cf-focus__timer--urgent', numeric(current.deadline) - Date.now() <= 10_000);
      subtitle.textContent = 'Your choice decides what happens to the valley.';
      instruction.textContent = '⌨ TYPE !vote 1 OR !vote 2 IN TWITCH CHAT';
      root.classList.remove('cf-focus--result');
    } else {
      badge.textContent = '🏆 VOTE CLOSED · ROUND ' + String(current.round || '?');
      timer.textContent = total + ' TOTAL ' + (total === 1 ? 'VOTE' : 'VOTES');
      timer.classList.remove('cf-focus__timer--urgent');
      const winner = first === second ? null : first > second ? 0 : 1;
      subtitle.textContent = winner === null
        ? (total === 0 ? 'No votes were cast.' : 'It was a tie.') + ' The chaos rises.'
        : 'WINNER: OPTION ' + (winner + 1) + ' — ' + String(labels[winner] || '');
      const change = reportedChange;
      instruction.textContent = (typeof change === 'number'
        ? 'CHAOS ' + (change > 0 ? '+' : '') + change + ' · '
        : 'CHAOS ' + numeric(current.chaos) + '/100 · ') + String(current.result || 'The round has ended.');
      root.classList.add('cf-focus--result');
    }
  }

  function acceptSnapshot(snapshot) {
    if (!snapshot || snapshot.kind !== 'world.snapshot' || !snapshot.cooperative) return;
    const incoming = snapshot.cooperative;
    if (incoming.phase === 'result' && current?.phase === 'vote' && current.round === incoming.round) {
      reportedChange = numeric(incoming.chaos) - numeric(current.chaos);
    } else if (incoming.phase !== 'result' || incoming.round !== lastRound) {
      reportedChange = null;
    }
    current = incoming;
    lastRound = incoming.round;
    paint();
  }

  function connect() {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      socket = new WebSocket(scheme + '//' + location.host);
      socket.addEventListener('message', event => {
        try { acceptSnapshot(JSON.parse(event.data)); } catch { /* Ignore malformed frames. */ }
      });
      socket.addEventListener('close', () => {
        socket = null;
        if (!disposed) reconnectTimer = window.setTimeout(connect, 1500);
      });
      socket.addEventListener('error', () => { socket?.close(); });
    } catch {
      if (!disposed) reconnectTimer = window.setTimeout(connect, 1500);
    }
  }

  const tick = window.setInterval(() => {
    if (current?.phase === 'vote' && !root.hidden) paint();
  }, 250);
  window.addEventListener('pagehide', () => {
    disposed = true;
    window.clearInterval(tick);
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    if (socket) socket.close();
  }, { once: true });
  connect();
})();
