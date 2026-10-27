import { persist } from '../platform/save.js';

// 自动验关: the autopilot (game.js botSteer: 'best' picks the best gate, 'mostly' the best 70% of the time,
// 'random' anything) plays a level fast-forwarded, N times per bot, and the panel tabulates what came out — pass rate,
// soldiers home, coins by source against the script, the squad in front of every gate. tools/devrun.js uses the same
// runLevel for the dev sweeps and the seeded regression.
export function install() {
  if (window.__errs) return;
  window.__errs = [];
  window.addEventListener('error', e => window.__errs.push(String(e.message) + ' @' + e.filename + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => window.__errs.push('rej ' + ((e.reason && e.reason.stack) || e.reason)));
}

// one run of level i (or of o.level, a config that isn't one of the 13) with the autopilot; o goes to game.start
export async function runLevel(i, bot = 'mostly', maxSec = 240, o = {}) {
  install();
  const G = window.__gf, g = G.game;
  G.ui.hideOverlays();
  G.hold = true;
  g.bot = bot;
  const w0 = G.save.wallet;
  const errorAt = window.__errs.length;
  g.start(i, { skipIntro: true, ...o });
  for (let k = 0; k < 300 && g.state === 'loading'; k++) await new Promise(r => setTimeout(r, 100));
  let t = 0, gates = [];
  const t0 = Date.now();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const shown = id => { const e = document.querySelector(id); return e && !e.hidden; };
  while (t < maxSec && Date.now() - t0 < 240000) {
    // overlays run on real time (wheels, the magician's cards, big wins): wait for them instead of the sim
    if (shown('#ovWheel') || shown('#ovMagic') || shown('#ovWin') || shown('#mgWin') || shown('#ovChest') || shown('#ovLion') || g.state === 'wheel' || g.state === 'magic') {
      if (shown('#ovChest')) document.querySelector('#ovChest .cp-btn')?.click();
      if (shown('#ovWin')) document.querySelector('#ovWin').click();
      if (shown('#mgWin')) document.querySelector('#mgWin').click();
      if (window.__gfMagicAuto && shown('#ovMagic')) window.__gfMagicAuto();
      G.ff(0.1);
      await sleep(150);
      continue;
    }
    G.ff(0.5);
    t += 0.5;
    if (g.sim) for (const q of g.sim.decisions) if (!gates[q.i]) gates[q.i] = q.before;
    const win = document.querySelector('#ovWin'); if (win && !win.hidden) win.click();
    const mg = document.querySelector('#ovMagic');
    if (window.__gfMagicAuto && mg && !mg.hidden) window.__gfMagicAuto();
    const res = document.querySelector('#ovResult');
    if (res && !res.hidden && g.state === 'result') break;
    await new Promise(r => setTimeout(r, 0));
  }
  const R = g.R || {};
  G.hold = false;
  const completed = g.state === 'result' && shown('#ovResult');
  return {
    code: g.L && g.L.code, state: g.state, t, completed, timedOut: !completed,
    coins: G.save.wallet - w0, win: !!(completed && g.sim && g.sim.phase !== 'fail'),
    kills: R.kills, killN: R.killN, boss: R.boss, road: R.road, fin: R.fin, finType: R.finType, chip: R.finChip, exch: R.exchange,
    bonus: (R.bonus || 0) + (R.dragon || 0) + (R.egg || 0) + (R.rain || 0) + (R.special || 0), special: R.special, magic: R.magic, finN: R.finSoldiers || R.soldiers, ladder: R.ladder, plan: R.plan, perf: R.perf, gates,
    errs: window.__errs.slice(errorAt, errorAt + 5),
  };
}

// jobs: [{ i, level, label, coins }] × bots × n runs. onRow(row) after each (level, bot) is done, onProgress(k, total)
// after each run; stop() → true ends it early. Returns one row per (level, bot) with averages.
export async function runBatch(jobs, bots, n, { onRow, onProgress, stop } = {}) {
  const G = window.__gf, rows = [], total = jobs.length * bots.length * n;
  const keepSave = JSON.stringify(G.save);
  const keepHold = G.hold, keepBot = G.game.bot;
  let k = 0;
  try {
    for (const job of jobs) for (const bot of bots) {
      const runs = [];
      for (let r = 0; r < n; r++) {
        if (stop && stop()) return rows;
        // edit: the run leaves the progress alone (no clears, no rewards); level: a config that isn't one of the 13
        const o = { edit: { from: 0 }, ...(job.level ? { level: job.level } : {}) };
        runs.push(await runLevel(job.level ? -1 : job.i, bot, 240, o));
        onProgress && onProgress(++k, total);
      }
      const row = summarize(job, bot, runs);
      rows.push(row);
      onRow && onRow(row);
    }
  } finally {
    // Test runs can persist through teaching steps and result overlays. Restore both memory and storage.
    G.game.teardown(); G.game.state = 'idle'; G.game.bot = keepBot;
    for (const key of Object.keys(G.save)) delete G.save[key];
    Object.assign(G.save, JSON.parse(keepSave));
    persist(); G.hold = keepHold;
    G.ui.hideOverlays();
  }
  return rows;
}

const avg = (a, f) => (a.length ? a.reduce((s, x) => s + (f(x) || 0), 0) / a.length : 0);
function summarize(job, bot, runs) {
  const gateN = [];
  for (const r of runs) r.gates.forEach((v, i) => { if (v !== undefined) (gateN[i] ||= []).push(v); });
  const coins = avg(runs, r => r.coins);
  return {
    label: job.label, bot, n: runs.length, pass: runs.filter(r => r.win).length / Math.max(1, runs.length),
    // the script leaves the 海豹魔术师 (4-4) out: it is paid on top, so the comparison does too
    home: avg(runs, r => r.finN), coins, script: job.coins || 0, diff: job.coins ? (coins - avg(runs, r => r.magic)) / job.coins - 1 : null,
    kills: avg(runs, r => (r.kills || 0) + (r.boss || 0)), exch: avg(runs, r => r.exch), fin: avg(runs, r => r.fin),
    bonus: avg(runs, r => r.bonus), magic: avg(runs, r => r.magic), road: avg(runs, r => r.road),
    gates: gateN.map(a => (a && a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)),
    errs: runs.reduce((s, r) => s + r.errs.length, 0),
  };
}
