// Autopilot for testing: steers a RunSim's squad the way a player would drag it. Used by the 自动验关 and the
// regression runs (through Game.botSteer) and by the headless tests.
//   'best'   picks the best lane (riding a post when two together are better) and steps around traps and slams;
//   'mostly' gets 70% of the gates right and still dodges;
//   'random' guesses and never dodges.
// The bot has its own random stream, separate from the sim's, so the sim's draws do not depend on the style: by default
// one Rng per sim, seeded from the sim's seed ('best' never draws from it).
import { clamp } from './util.js';
import { Rng } from './rng.js';

const BOT_SALT = 0x5bd1e995;
const rngs = new WeakMap();
export function botRng(sim) {
  let r = rngs.get(sim);
  if (!r) { r = new Rng((sim.rng ? sim.rng.seed : 0) ^ BOT_SALT); rngs.set(sim, r); }
  return r;
}

// move the squad for one step of dt seconds; call it before sim.update(dt)
export function steer(sim, style, dt, rng = botRng(sim)) {
  const s = sim.squad;
  if(sim.phase==='search'){
    const z=sim.zombies.filter(z=>z.alive&&z.active).sort((a,b)=>b.z-a.z)[0];
    const tx=z?z.x:0;s.x=sim.clampX(s.x+clamp(tx-s.x,-10*dt,10*dt));return;
  }
  if(sim.phase==='extract'){
    const e=sim.extraction,warning=e.warning;
    const box=sim.barrels.find(r=>r.evacCargo&&r.alive);
    const z=sim.zombies.find(z=>z.alive&&z.active);
    let tx=e.mode==='signal'?e.signalX:box?box.x:z?z.x:0;
    if(warning&&Math.abs(tx-warning.x)<2.3)tx=warning.x<0?3.5:-3.5;
    if(style==='random')tx=s.x;
    s.x=sim.clampX(s.x+clamp(tx-s.x,-10*dt,10*dt));return;
  }
  if (sim.phase === 'finale' && sim.fin) {
    // finales: face the big target, chase the most valuable fish, or work down the barrel column with the most left
    const F = sim.fin;
    let tx = 0;
    if (F.fish) { const f = F.fish.filter(q => q.alive && q.y > -0.2).sort((a, b) => b.m - a.m)[0]; if (f) tx = f.x + (style === 'random' ? (rng.next() - 0.5) * 4 : 0); }
    else if (F.type === 'vault') {
      const cols = {}; for (const r of sim.barrels) if (r.vault && r.alive) cols[r.x] = (cols[r.x] || 0) + r.m;
      const best = Object.entries(cols).sort((a, b) => b[1] - a[1])[0]; if (best) tx = +best[0];
    } else if (sim.boss) tx = sim.boss.x;
    s.x = sim.clampX(s.x + clamp(tx - s.x, -10 * dt, 10 * dt));
    return;
  }
  const g = sim.gates.find(q => !q.used && q.z < s.z && q.z > s.z - 40);
  let tx = s.x;
  if (g) {
    const B = g.bounds, n = g.ops.length;
    const val = o => {
      o = o.op === '~' ? o.list[o.idx] : o;
      return o.op === '+' ? s.N + o.v : o.op === 'x' ? s.N * o.v : o.op === '/' ? s.N / o.v : o.op === '?' ? s.N * 1.6 : o.op === 'skill' ? s.N * 1.3 + 25 : s.N;
    };
    const opts = [];
    for (let i = 0; i < n; i++) opts.push({ x: (B[i] + B[i + 1]) / 2, v: val(g.ops[i]) });
    if (!g.wall && !sim.activeSplit) for (let i = 1; i < n; i++) {
      const a = g.ops[i - 1], b = g.ops[i];
      const ok = [a, b].every(o => o.op !== '~' && o.op !== '?');
      if (ok) opts.push({ x: B[i] + (s.x < B[i] ? -0.3 : 0.3), v: pairVal(s.N, a, b) });
    }
    if (sim.activeSplit) for (const o of opts) if (Math.sign(o.x) !== sim.activeSplit.side) o.v = -1;
    const sorted = [...opts].sort((p, q) => q.v - p.v);
    const roulette = g.ops.some(o => o.op === '~');
    if (g.botPick === undefined || (roulette && style === 'best')) {
      g.botPick = style === 'random' ? opts[rng.int(opts.length)] : style === 'mostly' && rng.next() > 0.7 ? sorted[sorted.length - 1] : sorted[0];
    }
    tx = g.botPick.x;
  }
  if (style !== 'random') {
    // a rolling barrel coming in: stand in front of the one worth most and shoot it open
    const PREF = { gun: 5, skill: 6, men: 4, fish: 3, shield: 3, heal: 2, rate: 2, coin: 1 };
    const rolls = sim.barrels.filter(r => r.roll && r.alive && r.roll.on && r.z < s.z && r.z > s.z - 34).sort((a, b) => (PREF[b.kind] || 1) - (PREF[a.kind] || 1));
    // a mini-boss in range: stand in front of it (the 运钞怪 can only be caught with the whole squad on it)
    const mb = sim.zombies.find(z => z.mb && z.alive && z.active && z.z < s.z && z.z > s.z - 30 && !z.fleeing);
    const objective = sim.L.campaignAction && sim.barrels.find(r => r.alive && !r.roll && (r.kind === 'cage' || r.kind === 'coin') && r.z < s.z && r.z > s.z - 34);
    if (rolls.length && (!g || g.z < rolls[0].z - 4)) tx = rolls[0].x;
    else if (mb && (!g || g.z < mb.z - 4)) tx = mb.x;
    else if (objective && (!g || g.z < objective.z - 4)) tx = objective.x;
    else if (!g && sim.stand) {
      // 站桩关: meet a horde head-on, otherwise go shoot the barrels on the side
      const zs = sim.zombies.filter(z => z.alive && z.active && z.z < s.z && z.z > s.z - 20);
      const bs = sim.barrels.filter(r => r.alive && !r.roll && r.z < s.z && r.z > s.z - 32);
      if (zs.length >= 3) tx = zs.reduce((a, z) => a + z.x, 0) / zs.length;
      else if (bs.length) tx = bs.sort((a, b) => b.z - a.z)[0].x;
    }
  }
  // boss slam: step out of the red circle to the roomier side
  const T = sim.boss && sim.boss.tele;
  if (T && style !== 'random') tx = sim.safeX();
  if (style !== 'random' && !T) {
    const h = sim.hazards.find(q => q.z < s.z + 2 && q.z > s.z - 22);
    if (h && h.kind !== 'saw') {
      const mid = (h.x0 + h.x1) / 2;
      tx = h.side === 'C' ? (s.x < 0 ? -4.4 : 4.4) : mid < 0 ? 3.2 : -3.2;
    } else if (h && h.kind === 'saw') {
      const x = Math.sin((sim.t + 0.6) * h.speed + h.phase) * h.amp;
      tx = x > 0 ? -3.4 : 3.4;
    }
  }
  s.x = sim.clampX(s.x + clamp(tx - s.x, -10 * dt, 10 * dt));
}

// what riding the post between gate panels a and b would leave of n soldiers (the bot's estimate)
export function pairVal(n, a, b) {
  const ord = { '+': 0, skill: 0, x: 1, '/': 2 };
  for (const o of [a, b].sort((p, q) => ord[p.op] - ord[q.op])) {
    if (o.op === '+') n += o.v; else if (o.op === 'x') n *= o.v; else if (o.op === '/') n /= o.v; else if (o.op === 'skill') n += 25;
  }
  return n * 0.85;     // riding the post knocks 15% off
}
