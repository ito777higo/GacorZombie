// Every level played headless by the autopilot ('best'), with a fixed seed, at 1/60 s steps: the road, the boss, and
// what game.js starts after it (结尾惊喜 finale, 兑换门, or the bonus cannon). Checks that nothing throws, that every
// level ends within the cap, and that the same seed replays the same run.
//
// What this leaves to game.js (so a level cannot yet be run end to end without it):
//  - The flow between stages: Game.onRun 'runDone' / 'finaleEnd' / 'fail' decide what comes next (startLoad,
//    startExchange, pickSurprise, startSurprise, finish, bossWins). playLevel() below copies that order by hand.
//  - startSurprise: the finale's parN (from L.par / L.parN and the 倍数跑道 multiple) and the 一星 chip price;
//    Game.expectedUnits and Game.updateFin re-price the chip while the finale runs. The sim only counts units.
//  - startExchange / startLoad / updateLoad: the 兑换门 (N × TUNE.exchange coins) and the shell count of the bonus
//    cannon (N × ladder, halved when the boss escaped), plus BonusSim's coin multiple k, priced from the 一星 script;
//    Game.update re-prices bsim.k again at 40% and 15% shells left. Here k = 1.
//  - startBonus / applyWheel: the Bonus 转盘 (skill, ×2/×3, 金蟾, 金币雨) is drawn and applied by game.js (unseeded,
//    src/view/random.js) behind a DOM wheel; B.dragon 'always' / B.egg are added there too.
//  - onDragonBurst / onEggBreak / playSpecial: pause the bonus, spin a DOM wheel or chest pick, then call
//    resolveDragon / resolveEgg / resolveSpecial. Here they resolve at once with the 一星 values (×80, ×3, ×50 / ×120).
//  - playMagic (4-4 海豹魔术师): the card flip (src/magic, DOM) runs before runDone continues; skipped here.
//  - Coins: every payout (payKill, runCoins, payFinale, the boss's m × 炮倍) is game.js reacting to events.
//  - Game.start: 兵营 upgrades (save.barracks) and the 每日挑战 / 调参台 variants edit the squad after construction;
//    setTruckHole (formation.js module state, from the view's hero mode) changes the squad's shape and so the hits.
//  - Tutor (src/ui/tutorial.js): teaching moments freeze or slow the sim's dt, and under the autopilot they move
//    squad.x into the taught lane; slow-motion (Game.slowmo) scales dt. Headless runs see neither.
import { log, check, eq, digest, done } from './lib.js';
import { LEVELS, SURPRISES } from '../src/content/levels.js';
import { TUNE } from '../src/content/tune.js';
import { RunSim } from '../src/sim/runsim.js';
import { BonusSim } from '../src/sim/bonussim.js';
import { setTruckHole } from '../src/sim/formation.js';
import { steer } from '../src/sim/bot.js';
import { beginExtraction } from '../src/sim/extraction.js';
import {requestSearch} from '../src/sim/journeysim.js';

const DT = 1 / 60, CAP = 400;           // sim seconds per level, all stages together
const RUN_FIN = new Set(['rainbow', 'bricks']);
setTruckHole(false);                      // module state: keep it fixed so the runs compare

function playLevel(L, seed, style = 'best') {
  const h = digest();
  const R = { events: 0, ladder: 1, escaped: false, bossKilled: false, home: null, fin: '', units: 0, bonus: 0, exchange: 0, stage: 'run' };
  let sim = null, bsim = null, next = null;
  const note = (k, t, a, b) => { R.events++; h.add(`${k}|${t}|${a}|${b}`); };
  const emit = (k, d) => {
    const s = sim ? sim.squad : { N: 0, x: 0 };
    note(k, Math.round((sim ? sim.t : 0) * 1000), s.N, Math.round(s.x * 1000));
    if (k === 'ladderEnd') R.ladder = d.mult;
    else if (k === 'bossDie') R.bossKilled = true;
    else if (k === 'bossEscape') R.escaped = true;
    else if (k === 'runDone') next = 'run';
    else if (k === 'finaleEnd') next = 'finale';
    else if (k === 'extractionEnd') next = 'extraction';
  };
  const emitB = (k, d) => {
    note(k, Math.round(bsim.t * 1000), Math.round(bsim.won), bsim.left.toFixed(3));
    // game.js pauses the pool for a wheel or a chest here; the 一星 script's results
    if (k === 'bossBurst') bsim.resolveDragon(80);
    else if (k === 'eggBreak') bsim.resolveEgg(3);
    else if (k === 'special') bsim.resolveSpecial(d.kind === 'lion' ? 120 : 50);
    else if (k === 'bonusEnd') next = 'bonus';
  };

  const finish = () => { R.stage = 'done'; };
  const exchange = () => { R.exchange = sim.squad.N * TUNE.exchange; finish(); };
  const surprise = type => {
    const N = sim.squad.N;
    if (N <= 0) return finish();
    const parN = Math.max(20, L.parN || (L.par ? L.par / R.ladder : N));
    sim.startFinale(type, { parN, div: L.finale.rbDiv });
    R.fin = type; R.stage = 'finale';
  };
  const bonus = B => {
    const s = sim.squad, shots = Math.max(1, Math.round(s.N * R.ladder * (R.escaped ? 0.5 : 1)));
    bsim = new BonusSim({ cz: sim.platZ - 5.8, shots, skills: s.skills, k: 1, specials: B.specials, laser: false }, emitB, { seed: seed ^ 0x2545f491 });
    if (B.dragon === 'always') bsim.addDragon();
    if (B.egg) bsim.addEgg();
    bsim.hold = false;
    R.stage = 'bonus';
  };
  // Game.onRun 'runDone'
  const afterRun = () => {
    R.home = sim.squad.N;
    const after = L.finale.after;
    if(after==='evac'){beginExtraction(sim);R.fin='evac';return;}
    if (R.escaped && after && after !== 'bonus') exchange();
    else if (after === 'bonus') bonus(L.bonus || {});
    else if (after === 'exchange') exchange();
    else if (after === 'pick') { if (L.finale.pick === 'bonus') bonus({ wheel: false, dragon: 'always' }); else surprise(L.finale.pick); }
    else if (SURPRISES[after]) surprise(after);
    else finish();
  };

  sim = new RunSim(L, emit, 1, { seed });
  sim.start();
  let t = 0;
  while (t < CAP && R.stage !== 'done') {
    if (R.stage === 'bonus') bsim.update(DT);
    else { if(sim.phase==='search'&&!sim.zombies.some(z=>z.alive&&z.guardPoint===sim.activePoint?.id))requestSearch(sim);steer(sim, style, DT); sim.update(DT); }
    t += DT;
    if (sim.phase === 'fail') { R.stage = 'done'; R.failed = sim.failReason; break; }
    const n = next; next = null;
    if (n === 'run') afterRun();
    else if (n === 'finale') { R.units = sim.fin.units; if (RUN_FIN.has(sim.fin.type)) finish(); else exchange(); }
    else if (n === 'bonus') { R.bonus = bsim.won; finish(); }
    else if (n === 'extraction') finish();
  }
  R.t = t; R.N = sim.squad.N; R.ended = R.stage === 'done';
  R.stats = JSON.stringify(sim.stats);
  h.add(R.stats); h.add(R.N); h.add(R.units); h.add(R.bonus);
  R.digest = h.hex;
  return R;
}

const pad = (v, n) => String(v).padEnd(n);
log('  code  home   end    boss     finale     units    bonus    sim s  events  digest');
let differs = 0;
LEVELS.forEach((L, i) => {
  if (L.type === 'fish') { log(`  ${pad(L.code, 5)} (a fishing lesson: no road to run)`); return; }
  const seed = 1000 + i;
  let a, b, c;
  try { a = playLevel(L, seed); b = playLevel(L, seed); c = playLevel(L, seed + 7919); }
  catch (e) { check(false, `${L.code}: threw ${e && e.stack || e}`); return; }
  check(a.ended, `${L.code}: ends within ${CAP} s (stuck in ${a.stage})`);
  check(!a.failed,`${L.code}: best route survives with the base loadout`);
  eq(b.digest, a.digest, `${L.code}: same seed, same event log`);
  eq(b.N, a.N, `${L.code}: same seed, same squad`);
  if (c.digest !== a.digest) differs++;
  const boss = L.finale.boss ? (a.bossKilled ? 'killed' : a.escaped ? 'escaped' : 'alive') : '-';
  log(`  ${pad(L.code, 5)} ${pad(a.home ?? '-', 6)} ${pad(a.failed ? 'FAIL:' + a.failed : a.N, 6)} ${pad(boss, 8)} ${pad(a.fin || (L.finale.after === 'bonus' ? 'bonus' : a.exchange ? 'exchange' : '-'), 10)} ${pad(Math.round(a.units), 8)} ${pad(Math.round(a.bonus), 8)} ${pad(a.t.toFixed(1), 6)} ${pad(a.events, 7)} ${a.digest}`);
});
check(differs > 0, 'a different seed changes at least one level');
log(`  a different seed changed ${differs} of ${LEVELS.length} levels`);
done('runsim');
