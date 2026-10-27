// dev only: run levels headless-ish with an autopilot and report what they paid (used to calibrate the 一星剧本)
//   const m = await import('/tools/devrun.js'); await m.runLevel(4, 'mostly')
// the autopilot run itself lives in src/edit/autotest.js (the 调参台's 自动验关 uses it too)
import { install, runLevel } from '../src/edit/autotest.js';
export { install, runLevel };

export async function runAll(bot = 'mostly', from = 3, to = 12) {
  const out = [];
  for (let i = from; i <= to; i++) out.push(await runLevel(i, bot));
  return out;
}

// run level i with the autopilot until cond(game) holds, then a few more seconds; for screenshots
export async function goTo(i, cond, extra = 0, maxT = 220, bot = 'mostly') {
  install();
  const G = window.__gf, g = G.game;
  G.ui.hideOverlays(); G.hold = true; g.bot = bot;
  g.start(i, { skipIntro: true });
  for (let k = 0; k < 300 && g.state === 'loading'; k++) await new Promise(r => setTimeout(r, 100));
  let t = 0;
  const shown = id => { const e = document.querySelector(id); return e && !e.hidden; };
  while (t < maxT && !cond(g)) {
    if (shown('#ovWin')) document.querySelector('#ovWin').click();
    if (shown('#mgWin')) document.querySelector('#mgWin').click();
    if (g.state === 'wheel' || g.state === 'magic' || shown('#ovWheel') || shown('#ovMagic') || shown('#ovChest') || shown('#ovLion')) { if (window.__gfMagicAuto && shown('#ovMagic')) window.__gfMagicAuto(); if (shown('#ovChest')) document.querySelector('#ovChest .cp-btn')?.click(); G.ff(0.1); await new Promise(r => setTimeout(r, 150)); continue; }
    G.ff(0.25); t += 0.25;
  }
  G.ff(extra);
  return t;
}

// every gate of the last run: the squad before it, what each panel (and each rideable post) would have given
export function gateReport() {
  const g = window.__gf.game, sim = g.sim;
  const out = [];
  for (const q of sim.decisions) {
    const gate = sim.gates[q.i], N = q.before;
    const opts = gate.ops.map(o => { const l = o.op === '~' ? o.list[0] : o; return { label: l.op === '+' ? (l.v >= 0 ? '+' : '') + Math.round(l.v) : l.op === 'x' ? 'x' + l.v : l.op === '/' ? '/' + l.v : l.op, v: l.op === '+' ? N + l.v : l.op === 'x' ? N * l.v : l.op === '/' ? Math.ceil(N / l.v) : null }; });
    const vals = opts.map(o => o.v).filter(v => v !== null).sort((a, b) => b - a);
    out.push({ i: q.i, N, opts: opts.map(o => o.label + '=' + o.v).join(' | '), ratio: vals.length > 1 ? +(vals[0] / Math.max(1, vals[1])).toFixed(2) : null, chosen: q.chosen, after: q.after });
  }
  return out;
}

export async function sweep(bots = ['mostly', 'mostly', 'best', 'random'], from = 3, to = 12) {
  window.__rows = [];
  for (const bot of bots) for (let i = from; i <= to; i++) {
    const r = await runLevel(i, bot);
    window.__rows.push({ bot, code: r.code, win: r.win ? 1 : 0, N: r.finN, lad: r.ladder || 1, kills: r.kills, boss: r.boss, exch: r.exch || 0, fin: r.fin || 0, ft: r.finType, bonus: r.bonus || 0, magic: r.magic || 0, road: r.road || 0, coins: r.coins, perf: r.perf, errs: r.errs.length });
  }
  return window.__rows;
}

// v9.5 regression: the same autopilot runs with Math.random seeded per run, so two builds can be compared run by
// run. Before every run the save is reset to one snapshot (a fresh save with everything unlocked and the sound off),
// so tutorial flags and lab switches are the same in both builds.
export function seedRandom(seed) {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export async function regressSnapshot() {
  const G = window.__gf, S = await import('../src/platform/save.js');
  S.resetSave();
  Object.assign(G.save, { unlockAll: true, dragged: true, muted: true, music: false, fishOpen: true, energyAt: 0 });
  return JSON.stringify(G.save);
}
export async function regress(bots = ['best', 'mostly', 'random'], from = 0, to = 12, seed = 7, snap = null) {
  const G = window.__gf, real = Math.random, rows = [];
  snap ||= await regressSnapshot();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try {
    for (const bot of bots) for (let i = from; i <= to; i++) {
      const s = JSON.parse(snap);
      for (const k of Object.keys(G.save)) delete G.save[k];
      Object.assign(G.save, s);
      seedRandom(seed * 1000 + i * 10 + bots.indexOf(bot));
      const r = await runLevel(i, bot);
      const g = G.game, st = g.sim ? g.sim.stats : {};
      rows.push({ bot, code: r.code, win: r.win ? 1 : 0, N: r.finN ?? (g.sim && g.sim.squad.N), coins: Math.round(r.coins), t: +(g.sim ? g.sim.t : 0).toFixed(2), peak: st.peak, kills: st.kills, errs: r.errs.length });
      Math.random = real;
      G.ui.hideOverlays();
      await sleep(1500);
    }
  } finally { Math.random = real; }
  return rows;
}
