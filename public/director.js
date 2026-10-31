'use strict';
const $ = selector => document.querySelector(selector);
const labels = { npc: 'CHARACTER', item: 'ITEM', event: 'EVENT', danger: 'DANGER' };
const key = location.hash.slice(1) || sessionStorage.getItem('chatforge.director.key');
if (location.hash) {
  sessionStorage.setItem('chatforge.director.key', key);
  history.replaceState(null, '', location.pathname);
}
let pending = [];
let selectedId = null;
let busy = false;
let transportError = false;
let demoMode = false;
function node(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}
function error(message) { $('#error').textContent = message; $('#error').hidden = !message; }
async function request(method = 'GET', data) {
  if (!key) throw new Error('Open the complete Director link shown in the server terminal.');
  const response = await fetch('/api/director', {
    method, headers: { 'X-Director-Key': key, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
function render(result, force = false) {
  pending = result.pending;
  if (typeof result.demo === 'boolean') demoMode = result.demo;
  $('#overlay-link').href = '/overlay' + (demoMode ? '?demo=1' : '');
  $('#count').textContent = pending.length;
  $('#revision').textContent = result.revision;
  $('#connection').textContent = '● Local engine connected' + (demoMode ? ' · SIMULATED DEMO' : '');
  const previous = selectedId;
  if (!pending.some(item => item.id === selectedId)) selectedId = pending[0]?.id ?? null;
  const list = $('#queue'); list.replaceChildren();
  for (const item of pending) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'proposal' + (item.id === selectedId ? ' selected' : '');
    button.setAttribute('aria-pressed', String(item.id === selectedId));
    button.append(node('span', labels[item.entity.type], 'badge ' + item.entity.type),
      node('strong', item.entity.name), node('span', 'by ' + (item.author || 'unknown author'), 'byline'));
    button.disabled = busy;
    button.onclick = () => { selectedId = item.id; render({ pending, revision: result.revision }, true); };
    list.append(button);
  }
  if (!pending.length) list.append(node('p', 'No pending proposals.', 'queue-empty'));
  $('#empty').hidden = !!selectedId;
  $('#editor').hidden = !selectedId;
  // Polling never overwrites a draft the streamer is currently editing.
  if (selectedId && (force || previous !== selectedId)) {
    const item = pending.find(proposal => proposal.id === selectedId);
    $('#source').replaceChildren(node('span', labels[item.entity.type], 'badge ' + item.entity.type),
      node('p', 'Proposed by ' + (item.author || 'unknown author'), 'author'));
    for (const field of ['type', 'name', 'description', 'impact']) $('#' + field).value = item.entity[field];
    $('#stats').value = item.entity.stats ? JSON.stringify(item.entity.stats, null, 2) : '';
  }
}
function draft() {
  const entity = { type: $('#type').value, name: $('#name').value.trim(), description: $('#description').value.trim(), impact: $('#impact').value.trim() };
  const statsText = $('#stats').value.trim();
  if (statsText) {
    let stats;
    try { stats = JSON.parse(statsText); } catch { throw new Error('Stats must be valid JSON, for example {"power":10}.'); }
    if (!stats || typeof stats !== 'object' || Array.isArray(stats) || Object.entries(stats).some(([k,v]) => !k || typeof v !== 'number' || !Number.isFinite(v))) {
      throw new Error('Stats must contain only keys with numeric values.');
    }
    entity.stats = stats;
  }
  const source = pending.find(item => item.id === selectedId);
  if (entity.type === 'event' && source?.entity.resolutions) entity.resolutions = source.entity.resolutions;
  return entity;
}
async function decide(action) {
  if (busy || !selectedId) return;
  error('');
  let entity;
  try { if (action === 'approve') entity = draft(); } catch (err) { error(err.message); return; }
  busy = true;
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  try {
    const result = await request('POST', { id: selectedId, action, ...(entity ? { entity } : {}) });
    $('#notice').textContent = action === 'approve' ? '✦ Creation approved and sent to the map.' : 'Proposal rejected.';
    selectedId = null;
    render(result, true);
  } catch (err) { error(err.message); }
  finally { busy = false; for (const button of document.querySelectorAll('button')) button.disabled = false; }
}
$('#editor').addEventListener('submit', event => { event.preventDefault(); void decide('approve'); });
$('#reject').addEventListener('click', () => void decide('reject'));
async function poll() {
  if (busy) return;
  try { render(await request()); if (transportError) { error(''); transportError = false; } }
  catch (err) { transportError = true; $('#connection').textContent = '○ Connection unavailable'; error(err.message); }
}
void poll();
setInterval(poll, 1500);



