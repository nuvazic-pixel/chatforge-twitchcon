import type { WorldState, WorldEvent } from './world.js';
export type Crisis = { title: string; choices: [string, string] };
export type CoopState = { round: number; chaos: number; phase: 'build' | 'planning' | 'vote' | 'result'; accepted: number; crisis: Crisis | null; deadline: number | null; votes: [number, number]; result: string };
export function createCooperative(changed: () => void, plan?: (world: WorldState) => Promise<Crisis>, duration = 60_000) {
  let state: CoopState = { round: 1, chaos: 0, phase: 'build', accepted: 0, crisis: null, deadline: null, votes: [0, 0], result: '' };
  const voters = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let generation = 0;
  function openCrisis(crisis: Crisis) {
    clearTimeout(timer);
    state.crisis = crisis; state.phase = 'vote';
    state.deadline = Date.now() + duration; voters.clear(); state.votes = [0, 0];
    changed();
    schedule(finish, duration);
  }
  function schedule(fn: () => void, ms: number) { timer = setTimeout(fn, ms); timer.unref(); }
  function finish() {
    if (state.phase !== 'vote') return;
    const [a, b] = state.votes;
    const winner = a === b ? null : a > b ? 0 : 1;
    state.chaos = Math.min(100, Math.max(0, state.chaos + (winner === null ? 15 : -25)));
    state.phase = 'result'; state.deadline = null;
    state.result = state.chaos >= 100 ? 'The valley has fallen. A new round begins.' : winner === null ? 'No decision: Chaos +15.' : `${state.crisis!.choices[winner]} — Chaos −25. The valley stands!`;
    changed();
    schedule(() => { state = { round: state.round + 1, chaos: state.chaos >= 100 ? 0 : state.chaos, phase: 'build', accepted: 0, crisis: null, deadline: null, votes: [0, 0], result: '' }; voters.clear(); changed(); }, 10_000);
  }
  return {
    snapshot: () => structuredClone(state),
    accepted(event: WorldEvent, world: WorldState) {
      if (disposed) return;
      if (event.entity.type === 'event') {
        state.chaos = Math.min(100, state.chaos + 30);
        if (event.entity.resolutions) {
          generation++;
          openCrisis({ title: event.entity.name, choices: event.entity.resolutions });
          return;
        }
        changed();
        return;
      }
      if (state.phase !== 'build') return;
      state.accepted++;
      if (state.accepted < 3) return;
      state.phase = 'planning';
      const request = ++generation;
      const assets = world.entities.filter(e => e.type === 'npc' || e.type === 'item').slice(-2);
      const fallback: Crisis = { title: 'Shadows threaten the Valley of Echoes', choices: [`Defend the valley with ${assets[0]?.name ?? 'the village allies'}`, `Protect the villagers with ${assets[1]?.name ?? 'the village supplies'}`] };
      void (plan ? plan(structuredClone(world)) : Promise.resolve(fallback)).catch(() => { console.log('[Coop] Fallback story: AI unavailable.'); return fallback; }).then(crisis => {
        if (disposed || request !== generation) return;
        state.crisis = crisis; state.chaos = Math.min(100, state.chaos + 30);
        openCrisis(crisis);
      });
    },
    vote(userId: string, text: string): boolean {
      const match = /^!vote\s+([12])\s*$/i.exec(text.trim());
      if (!match || state.phase !== 'vote' || !state.deadline || Date.now() >= state.deadline) return false;
      if (voters.has(userId) || voters.size >= 10_000) return false;
      voters.add(userId); const index = Number(match[1]) - 1; state.votes[index]!++; changed(); return true;
    },
    stop() { disposed = true; clearTimeout(timer); },
  };
}
