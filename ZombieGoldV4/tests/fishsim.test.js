// The fishing room (FishSim with the FISHING config) and the bonus cannon (BonusSim) run headless with a fixed seed:
// the auto cannon fires, shells catch fish, catches pay into the wallet, and the same seed replays the same session.
// The wheels and chests game.js would show are resolved at once (game.js onBossBurst / onFishMagic / playSpecial).
import { log, check, eq, digest, done } from './lib.js';
import { FISHING, SHOT, BONUS_TYPES, WHEEL } from '../src/content/levels.js';
import { FishSim } from '../src/sim/fishsim.js';
import { BonusSim } from '../src/sim/bonussim.js';
import { Rng } from '../src/sim/rng.js';
import { chestValues, lionFinal, ingotValues, SPECIALS } from '../src/content/specials.js';

const DT = 1 / 60;

function fishSession(seed, sec = 90) {
  const h = digest(), seen = {};
  let balance = 5e6, sim = null, payBad = 0;
  const wallet = { get: () => balance, spend: c => { balance -= c; }, add: w => { balance += w; } };
  const draws = new Rng(seed ^ 0x68e31da4);         // what game.js draws for the wheels and chests
  const emit = (k, d) => {
    seen[k] = (seen[k] || 0) + 1;
    h.add(`${k}|${Math.round(sim.t * 1000)}|${Math.round(balance)}|${sim.fish.length}`);
    if (k === 'catch' && !d.crit && !d.chain && d.win !== SHOT * d.bet * d.mult) payBad++;
    if (k === 'bossBurst') sim.resolveBoss(d.fixed || draws.weighted(WHEEL).m, d.bet);
    else if (k === 'magicBurst') sim.resolveMagic(SHOT * d.bet * 50, 50, d.bet);
    else if (k === 'special') {
      const m = d.kind === 'chest' ? chestValues(false, draws).values[0] : d.kind === 'lion' ? lionFinal(false, draws) : ingotValues(SPECIALS.ingot.n, draws).reduce((a, v) => a + v, 0);
      sim.resolveSpecial(m, d.bet, d.kind);
    }
  };
  sim = new FishSim({ ...FISHING, laser: true }, { platZ: -60, wallet }, emit, { seed });
  sim.setBet(20);
  const start = balance;
  for (let t = 0; t < sec; t += DT) { sim.update(DT); sim.tickEnd(DT); if (sim.chargeReady) sim.laser(); }
  const st = sim.stats;
  h.add(JSON.stringify(st)); h.add(balance);
  return { st, seen, payBad, start, balance, digest: h.hex };
}

function bonusSession(seed, shots = 400) {
  const h = digest();
  let sim = null, ended = false;
  const emit = (k, d) => {
    h.add(`${k}|${Math.round(sim.t * 1000)}|${Math.round(sim.won)}|${sim.left.toFixed(3)}`);
    if (k === 'bossBurst') sim.resolveDragon(80);
    else if (k === 'eggBreak') sim.resolveEgg(3);
    else if (k === 'special') sim.resolveSpecial(50);
    else if (k === 'bonusEnd') ended = true;
  };
  sim = new BonusSim({ cz: -60, shots, skills: { lucky: true, spread: true }, k: 2, specials: ['haiman', 'zhangyu'], laser: true }, emit, { seed });
  sim.addDragon(); sim.addEgg();
  sim.hold = false;
  let t = 0;
  for (; t < 60 && !ended; t += DT) sim.update(DT);
  const P = sim.parts;
  h.add(JSON.stringify(P)); h.add(sim.won);
  return { sim, ended, t, parts: P, won: sim.won, digest: h.hex };
}

// ---------------------------------------------------------------- 渔场
const A = fishSession(41), B = fishSession(41), C = fishSession(42);
log(`  fishing 90 s: ${A.st.shots} shots, ${A.st.kills} kills, spent ${A.st.spent}, won ${A.st.won}, events ${JSON.stringify(A.seen)}`);
check(A.st.shots > 100, 'the auto cannon fires');
check(A.st.kills > 10 && A.seen.catch > 10, 'shells catch fish');
check(A.st.won > 0, 'catches pay');
eq(A.payBad, 0, 'a plain catch pays SHOT × bet × the fish multiple');
eq(A.balance, A.start - A.st.spent + A.st.won, 'the wallet moves by exactly what was spent and won');
check(A.seen.bossIn > 0 && A.seen.specialIn > 0 && A.seen.tide > 0, 'the timed events come (boss, special fish, tide)');
eq(B.digest, A.digest, 'fishing: same seed, same session');
check(C.digest !== A.digest, 'fishing: another seed, another session');

// ---------------------------------------------------------------- bonus cannon
const X = bonusSession(7), Y = bonusSession(7), Z = bonusSession(8);
log(`  bonus 400 shells: ended ${X.ended} after ${X.t.toFixed(1)} s, won ${Math.round(X.won)}, parts ${JSON.stringify(X.parts)}`);
check(X.ended, 'the bonus ends once the shells, the dragon, the egg and the special fish are done');
check(X.parts.fish > 0 && X.parts.dragon > 0 && X.parts.special > 0 && X.parts.egg > 0, 'every source pays');
check(X.sim.fish.every(f => BONUS_TYPES.includes(f.type) || f.boss || f.special), 'the pond holds bonus fish only');
const sum = X.parts.fish + X.parts.dragon + X.parts.rain + X.parts.special + X.parts.egg;
check(Math.abs(sum - X.won) < 1e-6, `the parts add up to the total (${sum} vs ${X.won})`);
eq(Y.digest, X.digest, 'bonus: same seed, same volley');
check(Z.digest !== X.digest, 'bonus: another seed, another volley');
done('fishsim');
