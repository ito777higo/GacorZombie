// Runner + boss simulation. Pure state; the view and UI listen to events.
import { ROAD_HW, PLATFORM_R } from './arena.js';
import { VIS_MAX, visCount, slotPos, holeSlots } from './formation.js';
import { clamp } from './util.js';
import { Rng } from './rng.js';
import { ENEMY_MULT, FISH, RAINBOW, BRICKS } from '../content/levels.js';
// the global numbers (speed, item spacing, fire, arrows, the gold post, hordes, traps, boss rage...) live in tune.js
// so the 调参台 can change them while a level runs
import { TUNE } from '../content/tune.js';
import { tickExtraction } from './extraction.js';
import { startPoint,tickPoint } from './journeysim.js';

export { VIS_MAX, TUNE };
const ROLL_V = 3.4;                  // how fast a rolling barrel comes at the squad (on top of the run)
// losses a 护盾 can stop (a trap, a slam, a rolling barrel, a mini-boss smash), when at least this many fall
const SHIELD_CAUSES = new Set(['trap', 'boss', 'roll', 'mb']);
// each boss's moves, in the order it uses them (see updateSlam)
export const BOSS_MOVES = {
  chubby: ['slam', 'lane', 'summon', 'slam'],
  yeti:   ['slam', 'rain', 'multi', 'slam'],
  demon:  ['lane', 'rain', 'multi', 'slam'],
  mech:   ['rain', 'lane', 'slam', 'multi'],
  kraken: ['slam', 'multi', 'lane', 'rain'],
  magician: ['rain', 'multi', 'rain', 'lane'],    // 海豹魔术师 throws his cards
};
// the kraken's five tentacles relative to the arena (rig.js Kraken: an arc of radius 9.5 round platZ − 9.5)
export const KRAKEN_ARMS = [-1.1, -0.55, 0, 0.55, 1.1].map(a => [Math.sin(a) * 9.5, -9.5 - Math.cos(a) * 9.5]);
const inShape = (q, x, z) => (q.type === 'rect' ? x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 : (x - q.x) ** 2 + ((z - q.z) * 1.1) ** 2 < q.r * q.r);

// the truck's gap in the middle makes the squad that much wider
export const squadRadius = n => 0.45 + 0.29 * Math.sqrt(Math.min(Math.max(n, 1), VIS_MAX) + holeSlots());
// total damage of one volley
const volleyDamage = n => 1.5 + Math.pow(Math.max(n, 0), TUNE.dmgPow);
const damp1 = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// The five fishing-cannon skills, picked up during the run and carried into the bonus cannon.
export const SKILLS = {
  double: { name: '双线', desc: '每次齐射两道弹线' },
  spread: { name: '散射', desc: '三向扇形齐射' },
  pierce: { name: '穿透', desc: '一颗子弹连穿三个' },
  aim:    { name: '瞄准', desc: '子弹自动拐向大目标' },
  lucky:  { name: '幸运', desc: '击杀掉金币，随机翻倍' },
};
export const SKILL_KEYS = Object.keys(SKILLS);

// mystery gate outcomes: mostly good, sometimes painful
const MYSTERY = [
  { op: 'x', v: 3, w: 22 }, { op: 'x', v: 2, w: 30 }, { op: '+', v: 30, w: 14 }, { op: '/', v: 2, w: 22 }, { op: '+', v: -25, w: 12 },
];
const LUCK = [{ m: 1, w: 58 }, { m: 2, w: 24 }, { m: 3, w: 12 }, { m: 5, w: 6 }];

export function parseOp(s) {
  if (s === '?') return { op: '?' };
  if (s[0] === '~') return { op: '~', list: s.slice(1).split(',').map(parseOp), period: 0.5, idx: 0 };
  if (s.startsWith('S:')) return { op: 'skill', k: s.slice(2) };
  const c = s[0], v = parseFloat(s.slice(1));
  if (c === 'x') return { op: 'x', v };
  if (c === '/') return { op: '/', v };
  if (c === '-') return { op: '+', v: -v };
  return { op: '+', v };
}
// the op a gate side applies right now (roulette gates cycle)
export const liveOp = o => (o.op === '~' ? o.list[o.idx] : o);
export function opLabel(o) {
  o = liveOp(o);
  if (o.op === '?') return '?';
  if (o.op === 'skill') return SKILLS[o.k].name;
  if (o.op === 'x') return '×' + o.v;
  if (o.op === '/') return '÷' + o.v;
  const v = Math.round(o.v);
  return (v >= 0 ? '+' : '−') + Math.abs(v);
}
export const opGood = o => { o = liveOp(o); return o.op === '?' || o.op === 'skill' ? true : o.op === '+' ? Math.round(o.v) >= 0 : o.op !== '/'; };
// several gates at once (riding a post): additions first, then multiplications, then divisions
export function applyOps(n, ops) {
  const order = { '+': 0, skill: 0, x: 1, '/': 2 };
  for (const o of [...ops].sort((a, b) => order[a.op] - order[b.op])) {
    if (o.op === '+') n += Math.round(o.v);
    else if (o.op === 'x') n *= o.v;
    else if (o.op === '/') n = Math.ceil(n / o.v);
  }
  return n;
}
// share of the soldiers crossing a trap that it actually takes (some jump clear)
export const LETHAL = { roller: 0.6, saw: 0.75, hole: 0.7, wave: 0.5 };
const BOOM_R = 3.4;            // a burst barrel takes out the zombies this close

export class RunSim {
  // scale > 1 hardens the endless levels after the hand-made ones. The last argument, { seed, rng }, sets where the
  // run's random numbers come from: this.rng is used for every draw (a new Rng(seed), freshly seeded when both are left out)
  constructor(level, emit, scale = 1, { seed, rng } = {}) {
    this.L = level; this.emit = emit; this.scale = scale;
    this.rng = rng || new Rng(seed);
    // from 大关二 on every soldier count on the road is ×army (start, + gates, men barrels, cages, drops), so
    // a good run brings thousands home through the 兑换门; × gates and the +/× trade-offs are unchanged by it
    this.army = level.run.army || 1;
    // 打怪就是打鱼: monsters carry multiples (ENEMY_MULT) when the level has a 炮倍
    this.stake = level.stake || 0;
    this.squad = { x: 0, z: 0, N: level.run.startAbs ?? level.run.startN * this.army, tier: 0, dmg: 1, rate: 1, speed: 0, R: 0, skills: {}, shield: 0 };
    // 站桩关: the squad stands; gates, barrels and hordes drift at it (Top Lords Breakout)
    this.stand = !!level.run.stand; this.drift = level.run.drift || 5.5;
    this.healed = 0;
    this.squad.R = squadRadius(this.squad.N);
    this.gates = []; this.zombies = []; this.barrels = []; this.fish = []; this.bullets = [];this.pois=[];
    this.hazards = []; this.coinsOnRoad = []; this.splits = []; this.drops = []; this.pending = [];
    this.boss = null;
    this.phase = 'ready';           // ready → run → arrive → boss → done | fail
    this.t = 0; this.fireT = 0; this.coins = 0;
    this.stats = { gates: 0, kills: 0, barrels: 0, fish: 0, lost: 0, peak: this.squad.N, low: 0, comebacks: 0, picked: 0, lucky: 0, straddles: 0 };
    this.impacts = [];           // where arrows landed this frame (the view draws a glint and clears it)
    this.decisions = [];            // every gate: what the squad got and what the best choice would have given
    this.swing = { top: this.squad.N, dipFrom: 0 };   // high → low → high tracking
    this.nextId = 1;
    this.layout();
  }

  layout() {
    let z = -30;
    const HW = ROAD_HW, S = this.scale;
    const sideX = s => (s === 'L' ? -HW / 2 : s === 'R' ? HW / 2 : 0);
    const range = s => (s === 'L' ? [-HW, -0.35] : s === 'R' ? [0.35, HW] : [-2.4, 2.4]);
    for (const it of this.L.run.seq) {
      const k = it[0];
      // 站桩关: things come a little closer together (the drift is slower than the run)
      let gap = this.stand ? TUNE.gap * 0.8 : TUNE.gap;
      if (k === 'gap') { z -= it[1]; continue; }
      if(k==='poi'){
        const def=this.L.story.pois.find(p=>p.id===it[1]);
        const p={...def,z,x:this.pois.length%2?4:-4,done:false};this.pois.push(p);
        for(let i=0;i<p.guards;i++){
          const zb=this.mkZombie(-3.8+(i%4)*2.4,z-3-Math.floor(i/4)*3,p.guardHp,1,false);
          zb.guardPoint=p.id;zb.m=0;this.zombies.push(zb);
        }
        gap+=16;
      } else if (k === 'g') {
        const last = it[it.length - 1];
        const opts = typeof last === 'object' && !Array.isArray(last) ? last : {};
        const vals = it.slice(1).filter(v => typeof v === 'string');
        const n = vals.length;
        const bounds = n === 3 ? [-HW, -HW / 3, HW / 3, HW] : [-HW, 0, HW];
        // only gates marked {post: true} have a gold post that can be ridden; the rest have a plain divider
        // ({wall: true} puts a red-and-white wall there instead). {shoot: true}: bullets raise its numbers.
        const plain = !opts.post && !opts.wall;
        const ops = vals.map(parseOp);
        const scaleOp = o => { if (o.op === '+') o.v *= this.army; if (o.op === '~') o.list.forEach(scaleOp); };
        ops.forEach(scaleOp);
        for (const o of ops) if (o.op === '+') o.v0 = o.v;
        // from 大关二 on every gate with a + or − panel can be shot bigger (Top Lords)
        const shoot = opts.shoot ?? (this.army > 1 && ops.some(o => o.op === '+') && !ops.some(o => o.op === 'skill'));
        this.gates.push({ id: this.nextId++, idx: this.gates.length, z, ops, bounds, wall: !!opts.wall || plain || this.inSplit(z), plain, shoot, used: false, chosen: [], flash: new Array(n).fill(0) });
        if (opts.gap) gap = opts.gap;
      } else if (k === 'w') {
        const [, n0, hp0, o = {}] = it;
        const n = Math.round(n0 * TUNE.waveN), hp = hp0 * TUNE.waveHp * S;
        const wave = this.waves = (this.waves || 0) + 1;
        for (let i = 0; i < n; i++) {
          const brute = o.brute && i === n - 1;
          const zb = this.mkZombie(this.rng.range(-HW + 0.8, HW - 0.8), z - this.rng.range(0, 11), brute ? hp * 9 : hp * this.rng.range(0.85, 1.15), brute ? TUNE.brutePower : (o.power || 1), brute);
          if (brute) zb.m = this.mult('brute');
          zb.wave = wave;
          this.zombies.push(zb);
        }
      } else if (k === 'ambush') {
        // zombies that leap out from both roadsides once the squad is close
        const [, n0, hp0] = it;
        const n = Math.round(n0 * TUNE.waveN);
        for (let i = 0; i < n; i++) {
          const zb = this.mkZombie(0, z, hp0 * TUNE.waveHp * S * this.rng.range(0.85, 1.15), 1, false);
          zb.ambush = { side: i % 2 ? 1 : -1, delay: (i >> 1) * 0.12 };
          zb.speed = this.rng.range(2.6, 3.4) * TUNE.dogSpeed; zb.m = this.mult('dog');
          this.zombies.push(zb);
        }
      } else if (k === 'shield') {
        // 盾墙 (大关四 穿透): a row across the road; a plain bullet only chips the shield, a piercing one goes through
        const [, n, hp0] = it;
        this.shieldRow(z, n, hp0 * TUNE.waveHp * S);
        gap = TUNE.gap + 4;
      } else if (k === 'line') {
        // 穿透 teaching: monsters stacked one behind another in a few lanes; a plain arrow stops at the front
        // one, a piercing arrow goes on through three
        const [, lanes, depth, hp0, o = {}] = it;
        const hp = hp0 * TUNE.waveHp * S;
        for (let l = 0; l < lanes; l++) {
          const x = lanes > 1 ? -HW * 0.72 + (2 * HW * 0.72) * l / (lanes - 1) : 0;
          for (let d = 0; d < depth; d++) {
            const zb = this.mkZombie(x, z - d * 0.95, hp, o.power || 1, false);
            zb.line = true; zb.speed = 1.3; zb.r = 0.5;
            this.zombies.push(zb);
          }
        }
        gap = TUNE.gap + depth * 0.95;
      } else if (k === 'mb') {
        // mini-boss walking down the road: kill it before it arrives or it smashes 35% of the squad
        const [, hp, , name, o = {}] = it;
        const zb = this.mkZombie(0, z - 4, hp * S, 0, true);
        zb.mb = true; zb.r = 1.7; zb.speed = 0.9; zb.name = name || '巨尸'; zb.m = this.mult('mb');
        // {escape: s} runs off with its gold after s seconds (双线 teaching); {dodgy} strafes and blinks (瞄准)
        if (o.escape) { zb.escT = o.escape; zb.speed = 0.5; }
        if (o.dodgy) { zb.dodgy = true; zb.tx = 0; zb.moveT = 0.8; zb.blinkN = 0; zb.r = 1.2; }
        this.zombies.push(zb);
        gap = TUNE.gap + 8;
      } else if (k === 'br') {
        this.zombies.push(this.mkZombie(this.rng.range(-2, 2), z, it[1] * S, it[2], true));
      } else if (k === 'b') {
        const [, kind, v, hp, side] = it;
        this.barrels.push(this.mkBarrel(kind, v, hp * S, sideX(side), z));
      } else if (k === 'row') {
        // Top Lords: three barrels across the road, the reward standing on top of each
        it.slice(1).forEach((b, i) => { if (b) this.barrels.push(this.mkBarrel(b[0], b[1], b[2], (i - 1) * HW * 0.64, z)); });
        gap = TUNE.gap - 6;
      } else if (k === 'roll') {
        // 滚桶 (Last War): rolls at the squad; shoot it open for its item or it crushes the soldiers it hits
        const [, kind, v, hp, side, o = {}] = it;
        const r = this.mkBarrel(kind, v, hp * S, side === 'C' || !side ? 0 : sideX(side), z);
        r.roll = { v: o.speed || ROLL_V, on: false, spin: 0 };
        this.barrels.push(r);
        gap = TUNE.gap + 6;
      } else if (k === 'roll2') {
        // two rolling barrels side by side, an item in each: break one (二选一), or both if the squad is strong
        const o = (typeof it[3] === 'object' && !Array.isArray(it[3])) ? it[3] : {};
        const pairId = this.nextId;
        [it[1], it[2]].forEach((b, i) => {
          const r = this.mkBarrel(b[0], b[1], b[2] * S, (i ? 1 : -1) * HW * 0.5, z);
          r.roll = { v: o.speed || ROLL_V, on: false, spin: 0 }; r.pair = pairId;
          this.barrels.push(r);
        });
        gap = TUNE.gap + 6;
      } else if (k === 'bb') {
        this.barrels.push(this.mkBarrel(it[1][0], it[1][1], it[1][2] * S, -HW / 2, z));
        this.barrels.push(this.mkBarrel(it[2][0], it[2][1], it[2][2] * S, HW / 2, z));
      } else if (k === 'cage') {
        const [, n, hp, side] = it;
        this.barrels.push(this.mkBarrel('cage', n, hp * S, sideX(side || 'C'), z));
      } else if (k === 'f') {
        // golden fish leaping across the road; {tide}: a 飞鱼潮, many fish close together (散射 teaching);
        // with a 炮倍 each pays its card's multiple × 炮倍
        const [, n, o = {}] = it, sp = o.tide ? 1.6 : 4.5, type = o.type || 'dayan';
        for (let i = 0; i < n; i++) {
          const dir = i % 2 ? 1 : -1;
          this.fish.push({ id: this.nextId++, z: z - i * sp, dir, x: dir * -(HW + 4), y: -1, t: -1, dur: o.tide ? 2.3 : 1.9, hi: o.tide ? 6.0 : 4.2, alive: true, started: false, type, m: this.stake ? FISH[type].mult : 0 });
        }
        if (o.tide) gap = TUNE.gap + n * sp;
      } else if (k === 'coins') {
        const [, pattern, n, v = 100] = it;
        for (let i = 0; i < n; i++) {
          let x = 0, cz = z - i * 2.2;
          if (pattern === 'zig') x = Math.sin(i * 0.5) * 3.4;
          else if (pattern === 'L' || pattern === 'R') { x = (pattern === 'L' ? -1 : 1) * (2.2 + (i % 3) * 1.1); cz = z - Math.floor(i / 3) * 1.4; }
          else if (pattern === 'split') { x = (i % 2 ? 1 : -1) * 3.2; cz = z - Math.floor(i / 2) * 1.6; }
          this.coinsOnRoad.push({ id: this.nextId++, x, z: cz, v, alive: true, ph: i * 0.4 });
        }
        gap = Math.max(TUNE.gap, n * 2.2 + 8);
      } else if (k === 'roller' || k === 'hole' || k === 'wave') {
        const [, side, len = 0] = it;
        const [x0, x1] = range(side);
        this.hazards.push({ id: this.nextId++, kind: k, z, side, x0, x1, len: k === 'hole' ? (len || 7) : k === 'wave' ? 8 : 0.9, rel: -1e9, hits: 0 });
      } else if (k === 'rollers') {
        this.hazards.push({ id: this.nextId++, kind: 'roller', z, side: 'L', x0: -HW, x1: -0.35, len: 0.9, rel: -1e9, hits: 0 });
        this.hazards.push({ id: this.nextId++, kind: 'roller', z: z - 10, side: 'R', x0: 0.35, x1: HW, len: 0.9, rel: -1e9, hits: 0 });
        gap = TUNE.gap + 10;
      } else if (k === 'saw') {
        const [, amp = 3.3, speed = 1.6] = it;
        this.hazards.push({ id: this.nextId++, kind: 'saw', z, amp, speed, r: 1.15, phase: this.rng.range(0, 6), x0: 0, x1: 0, len: 0.6, rel: -1e9, hits: 0 });
      } else if (k === 'split') {
        // a central wall: the squad commits to one side for the whole stretch (gates inside become one-lane)
        this.splits.push({ z0: z + 6, z1: z - it[1], side: 0 });
        gap = 0;
      } else if (k === 'drop') {
        this.drops.push({ z, n: it[1] * this.army, done: false });
      }
      z -= gap;
    }
    // 倍数跑道: glowing tiles before the platform; the squad lights every tile it has enough soldiers for
    const LD = this.L.finale && this.L.finale.ladder;
    if (LD) {
      this.ladder = { tiles: [], reached: 0, stopped: false };
      let tz = z + TUNE.gap - 10;
      LD.steps.forEach((m, k) => { this.ladder.tiles.push({ k, z: tz, m, cost: Math.round(LD.base * Math.pow(LD.grow || 1.6, k)), lit: false }); tz -= 3.6; });
      z = tz - TUNE.gap + 6;
    }
    this.endZ = z + TUNE.gap - 24;                       // where the road meets the platform edge
    this.platZ = this.endZ - PLATFORM_R + 1;
    this.standZ = this.platZ + 3.2;
    this.length = -this.endZ;
    this.len0 = -this.endZ;
  }
  inSplit(z) { return this.splits.some(s => z <= s.z0 && z >= s.z1); }

  mkZombie(x, z, hp, power, brute) {
    return { id: this.nextId++, x, z, z0: z, hp, maxhp: hp, power, brute, r: brute ? 0.85 : 0.42, speed: brute ? this.rng.range(1.0, 1.3) * TUNE.bruteSpeed : this.rng.range(1.5, 2.3) * TUNE.zSpeed, alive: true, active: false, flash: 0, ph: this.rng.range(0, 6), m: this.mult('zombie') };
  }
  // the multiple a monster pays when it dies (0 before 大关二: no coins there)
  mult(kind) { return this.stake ? ENEMY_MULT[kind] || 0 : 0; }
  shieldRow(z, n, hp, active = false) {
    const HW = ROAD_HW - 0.9, list = [];
    for (let i = 0; i < n; i++) {
      const zb = this.mkZombie(n > 1 ? -HW + (2 * HW) * i / (n - 1) : 0, z, hp, 2, false);
      zb.shield = true; zb.r = 0.62; zb.speed = 0.75; zb.active = active; zb.m = this.mult('shield');
      this.zombies.push(zb); list.push(zb);
    }
    return list;
  }
  // hp = hits (one per bullet); fish barrels pay their fish's multiple, coin barrels their value as a multiple
  mkBarrel(kind, v, hp, x, z) {
    const m = kind === 'fish' ? (FISH[v] ? FISH[v].mult : 10) : kind === 'coin' && this.stake ? v : 0;
    return { id: this.nextId++, kind, v, hp: Math.max(1, Math.round(hp)), maxhp: Math.max(1, Math.round(hp)), x, z, alive: true, flash: 0, m };
  }

  start() {
    this.phase = 'run';
    // 大关四: each level hands its skill over at the start (pure teaching, no choice)
    if (this.L.run.giveSkill) this.addSkill(this.L.run.giveSkill, 'gift');
  }

  get R() { return this.squad.R; }
  // inside a split stretch the squad stays on its side of the wall
  clampX(x) {
    const lim = ROAD_HW - 0.9, sp = this.activeSplit;
    if (sp) return sp.side < 0 ? clamp(x, -lim, -1.1) : clamp(x, 1.1, lim);
    return clamp(x, -lim, lim);
  }

  // 护盾: stops one heavy loss (3 soldiers or more) from a trap, the boss, a rolling barrel or a mini-boss. The blow's
  // own event says so (shield: true) so the game shows it as blocked, not as a loss
  willShield(cause, lost) { return this.squad.shield > 0 && SHIELD_CAUSES.has(cause) && lost >= TUNE.shieldMin; }
  setN(n, cause, extra) {
    const s = this.squad, before = s.N;
    if (this.willShield(cause, before - Math.round(n))) {
      s.shield--;
      this.emit('shieldPop', { cause, saved: before - Math.round(n), left: s.shield, from: extra && extra.from });
      return;
    }
    s.N = Math.max(0, Math.round(n));
    s.R = squadRadius(s.N);
    if (s.N > this.stats.peak) this.stats.peak = s.N;
    if (s.N < before) this.stats.lost += before - s.N;
    this.emit('count', { before, after: s.N, cause, ...extra });
    this.trackSwing(before);
    if (s.N <= 0 && this.phase !== 'fail' && this.phase !== 'done' && this.phase !== 'finale') this.fail(cause === 'boss' ? 'boss' : 'dead');
  }

  // A "dip" starts when the squad falls to 65% of its recent top; recovering past that top is a comeback.
  trackSwing(before) {
    const s = this.squad, w = this.swing;
    if (this.phase !== 'run' && this.phase !== 'arrive') return;
    const drop = before - s.N;
    if (drop > 0 && (drop >= 20 || drop >= before * 0.2)) this.emit('bigLoss', { before, after: s.N, drop });
    if (!w.dipFrom) {
      if (s.N > w.top) w.top = s.N;
      if (w.top >= 20 && s.N <= w.top * 0.65) {
        w.dipFrom = w.top;
        if (!this.stats.low || s.N < this.stats.low) this.stats.low = s.N;
        this.emit('dip', { from: w.top, to: s.N });
      }
    } else {
      if (s.N < this.stats.low) this.stats.low = s.N;
      if (s.N >= w.dipFrom) { this.stats.comebacks++; this.emit('comeback', { from: w.dipFrom, to: s.N }); w.dipFrom = 0; w.top = s.N; }
    }
  }

  fail(reason) { this.phase = 'fail'; this.failReason = reason; this.emit('fail', { reason }); }

  addSkill(k, from) {
    const s = this.squad;
    if (s.skills[k]) { this.setN(s.N + 20 * this.army, 'skill'); this.emit('skillDup', { k, from }); return; }
    s.skills[k] = true;
    this.emit('skill', { k, from });
  }

  update(dt) {
    if(this.phase==='search'){tickPoint(this,dt);return;}
    if(this.phase==='extract'){tickExtraction(this,dt);return;}
    if (this.phase === 'ready' || this.phase === 'done' || this.phase === 'fail') return;
    this.t += dt;
    const s = this.squad;
    if (this.phase === 'finale') { this.updateFinale(dt); return; }
    if (this.phase === 'run' && this.stand) {
      // 站桩关: the world comes to the squad
      s.speed = 0;
      this.shiftWorld(this.drift * Math.min(1, this.t / 1.2) * dt);
      if (this.endZ >= s.z) this.standArrive();
    } else if (this.phase === 'run') {
      s.speed = Math.min(TUNE.speed, s.speed + TUNE.speed * 2.5 * dt);
      s.z -= s.speed * dt;
      if (s.z <= this.endZ) { this.phase = 'arrive'; this.emit('arrive', {}); }
    } else if (this.phase === 'arrive') {
      const dz = this.standZ - s.z;
      s.speed = Math.max(1.5, Math.min(TUNE.speed, Math.abs(dz) * 2.2));
      s.z += Math.sign(dz) * Math.min(Math.abs(dz), s.speed * dt);
      s.x += (0 - s.x) * Math.min(1, dt * 3);
      if (Math.abs(dz) < 0.05) {
        s.speed = 0;
        const F = this.L.finale;
        if (F.boss) this.spawnBoss(F.boss);
        else { this.phase = 'done'; this.emit('runDone', {}); }
      }
    }
    if(this.phase==='run'&&!this.activePoint){const p=this.pois.find(p=>!p.done&&s.z-p.z<18&&s.z>p.z);if(p)startPoint(this,p);}
    this.updateSplits();
    this.updateDrops(dt);
    this.updateGates();
    this.updateLadder();
    this.updateHazards();
    this.updateCoins();
    this.updateRolls(dt);
    this.updateZombies(dt);
    this.updateFish(dt);
    if (this.boss) this.updateBoss(dt);
    this.fire(dt);
    this.updateBullets(dt);
  }

  // 站桩关: everything on the road drifts toward the squad by d
  shiftWorld(d) {
    for (const g of this.gates) g.z += d;
    for (const r of this.barrels) if (!r.vault) r.z += d;
    for (const z of this.zombies) { z.z += d; z.z0 += d; }
    for (const f of this.fish) f.z += d;
    for (const c of this.coinsOnRoad) c.z += d;
    for (const h of this.hazards) h.z += d;
    for (const dr of this.drops) dr.z += d;
    for (const sp of this.splits) { sp.z0 += d; sp.z1 += d; }
    this.endZ += d;
  }
  // the last of the road has passed: the boss walks in to where the squad stands
  standArrive() {
    const s = this.squad;
    this.standZ = s.z; this.platZ = s.z - 3.2;
    this.emit('arrive', {});
    const F = this.L.finale;
    if (F.boss) this.spawnBoss(F.boss);
    else { this.phase = 'done'; this.emit('runDone', {}); }
  }
  // 滚桶: a rolling barrel starts rolling when the squad is near, crushes the soldiers it reaches
  updateRolls(dt) {
    const s = this.squad;
    if (this.phase !== 'run' && this.phase !== 'arrive') return;
    for (const r of this.barrels) {
      if (!r.roll || !r.alive) continue;
      const R = r.roll;
      if (!R.on) { if (s.z - r.z < 52) { R.on = true; this.emit('rollIn', { r }); } else continue; }
      r.z += R.v * dt; R.spin += R.v * dt / 0.6;
      if (r.z + 0.7 < s.z - s.R * 0.75) continue;
      if (Math.abs(r.x - s.x) < s.R * 0.85 + 0.7 && s.N > 0) {
        r.alive = false;
        const n = Math.min(Math.ceil(s.N * 0.3), Math.max(3, Math.round(r.maxhp * 0.3 + s.N * 0.08)));
        const vis = visCount(s.N), p = [0, 0], positions = [];
        for (let i = 0; i < vis && positions.length < n; i++) { slotPos(i, vis, s.x, s.z, p); if (Math.abs(p[0] - r.x) < 1.6) positions.push([p[0], p[1]]); }
        this.emit('rollHit', { r, n, shield: this.willShield('roll', n) });
        this.setN(s.N - n, 'roll', { positions });
      } else if (r.z > s.z + 4) { r.alive = false; this.emit('rollMiss', { r }); }
    }
  }

  updateSplits() {
    const s = this.squad;
    this.activeSplit = null;
    for (const sp of this.splits) {
      if (s.z > sp.z0 || s.z < sp.z1) continue;
      if (!sp.side) { sp.side = s.x < 0 ? -1 : 1; this.emit('splitIn', { sp }); }
      this.activeSplit = sp;
      s.x = this.clampX(s.x);
    }
  }

  // 兵雨: a helicopter drops reinforcements a moment after it flies over
  updateDrops(dt) {
    const s = this.squad;
    for (const d of this.drops) {
      if (d.done || s.z - d.z > 18) continue;
      d.done = true;
      this.emit('drop', { n: d.n });
      this.pending.push({ t: 1.1, n: d.n });
    }
    for (const p of this.pending) {
      p.t -= dt;
      if (p.t <= 0 && !p.done) { p.done = true; if (this.squad.N > 0) this.setN(this.squad.N + p.n, 'drop'); }
    }
  }

  updateGates() {
    const s = this.squad;
    for (const g of this.gates) {
      for (let i = 0; i < g.flash.length; i++) g.flash[i] = Math.max(0, g.flash[i] - 0.05);
      for (const o of g.ops) if (o.op === '~' && !g.used) {
        const idx = Math.floor(this.t / o.period) % o.list.length;
        if (idx !== o.idx) { o.idx = idx; this.emit('gateCycle', { g }); }
      }
      if (g.used || s.z > g.z) continue;
      g.used = true;
      // which panels the squad goes through: the one under its centre, plus a neighbour when riding a thin post
      const n = g.ops.length, B = g.bounds;
      let lane = 0;
      while (lane < n - 1 && s.x > B[lane + 1]) lane++;
      const hit = [lane];
      if (!g.wall) {
        if (lane > 0 && s.x - B[lane] < TUNE.straddle) hit.push(lane - 1);
        if (lane < n - 1 && B[lane + 1] - s.x < TUNE.straddle) hit.push(lane + 1);
      }
      g.chosen = hit;
      const ops = hit.map(i => {
        let o = liveOp(g.ops[i]);
        if (o.op === '?') { o = { ...this.rng.weighted(MYSTERY), mystery: true }; if (o.op === '+') o.v *= this.army; }
        return o;
      });
      const before = s.N;
      this.stats.gates++;
      const straddle = hit.length > 1;
      if (straddle) this.stats.straddles++;
      let after = Math.max(1, Math.round(applyOps(s.N, ops)));   // a gate never wipes the squad out on its own
      const cut = straddle ? Math.round(after * TUNE.postCut) : 0;
      after = Math.max(1, after - cut);
      this.logDecision(g, before, after, ops);
      this.emit('gate', { gate: g, lanes: hit, ops, before, after, straddle, cut });
      for (const o of ops) if (o.op === 'skill') this.addSkill(o.k, 'gate');
      this.setN(after, 'gate');
    }
  }

  // what each choice at this gate would have given (mystery panels are skipped), for the failure card
  logDecision(g, before, after, ops) {
    const n = g.ops.length, alts = [];
    for (let i = 0; i < n; i++) {
      const o = liveOp(g.ops[i]);
      if (o.op === '?') continue;
      alts.push({ v: Math.max(1, Math.round(applyOps(before, [o]))), label: opLabel(o) });
    }
    if (!g.wall) for (let i = 1; i < n; i++) {
      const a = liveOp(g.ops[i - 1]), b = liveOp(g.ops[i]);
      if (a.op === '?' || b.op === '?') continue;
      const v = Math.max(1, Math.round(applyOps(before, [a, b])));
      const ord = { '+': 0, skill: 0, x: 1, '/': 2 }, [p1, p2] = [a, b].sort((m, n2) => ord[m.op] - ord[n2.op]);
      alts.push({ v: Math.max(1, v - Math.round(v * TUNE.postCut)), label: `${opLabel(p1)} ${opLabel(p2)} 蹭边` });
    }
    const best = alts.reduce((p, q) => (q.v > p.v ? q : p), alts[0] || { v: after, label: '' });
    this.decisions.push({ i: g.idx, before, after, best: best.v, bestLabel: best.label, chosen: ops.map(o => opLabel(o)).join(' '), skill: ops.some(o => o.op === 'skill') || g.ops.some(o => o.op === 'skill') });
  }

  // 倍数跑道: tiles are lit while the squad has enough soldiers; at the first one it cannot afford it stops
  updateLadder() {
    const L = this.ladder, s = this.squad;
    if (!L || L.stopped || this.phase !== 'run') return;
    for (const t of L.tiles) {
      if (t.lit || s.z > t.z) continue;
      if (s.N >= t.cost) { t.lit = true; L.reached = t.k + 1; this.emit('tile', { t }); }
      else { this.stopLadder(); return; }
    }
    if (L.reached === L.tiles.length && s.z < L.tiles[L.tiles.length - 1].z - 2) this.stopLadder();
  }
  stopLadder() {
    const L = this.ladder, s = this.squad;
    L.stopped = true;
    L.mult = L.reached ? L.tiles[L.reached - 1].m : 1;
    s.speed = 0;
    this.phase = 'done';
    this.emit('ladderEnd', { mult: L.mult, reached: L.reached });
    this.emit('runDone', { delay: 1.6 });
  }

  // Traps hit individual soldiers: as the squad moves through a trap line, every soldier that crosses it
  // inside the trap's span may die (or fall into the sea).
  updateHazards() {
    const s = this.squad;
    if (this.phase !== 'run' || s.N <= 0) return;
    const vis = visCount(s.N), p = [0, 0];
    for (const h of this.hazards) {
      const rel = h.z - s.z;
      if (rel < -s.R - 1 || h.rel > s.R + 1) { h.rel = rel; continue; }
      if (h.kind === 'saw') { const x = Math.sin(this.t * h.speed + h.phase) * h.amp; h.x0 = x - h.r; h.x1 = x + h.r; }
      const lo = h.rel, hi = rel;
      h.rel = rel;
      if (hi <= lo) continue;
      const dead = [];
      for (let i = 0; i < vis; i++) {
        slotPos(i, vis, s.x, s.z, p);
        const dz = p[1] - s.z;
        if (dz > lo && dz <= hi && p[0] >= h.x0 && p[0] <= h.x1 && this.rng.next() < (LETHAL[h.kind] || 1)) dead.push([p[0], p[1]]);
      }
      if (!dead.length) continue;
      // one trap never takes more than half of the squad that ran into it
      if (h.cap === undefined) h.cap = Math.ceil(s.N * TUNE.trapCap);
      let n = vis < s.N ? Math.round(dead.length * s.N / vis) : dead.length;
      n = Math.min(n, h.cap - h.hits);
      if (n <= 0) continue;
      if (dead.length > n) dead.length = n;
      h.hits += n;
      this.emit('trap', { h, positions: dead, n, shield: this.willShield('trap', n) });
      this.setN(s.N - n, 'trap', { positions: dead });
      if (s.N <= 0) return;
    }
  }

  updateCoins() {
    const s = this.squad;
    if (s.N <= 0) return;
    const rr = s.R + 0.45;
    for (const c of this.coinsOnRoad) {
      if (!c.alive || c.z > s.z + 3 || c.z < s.z - rr) continue;
      const dx = c.x - s.x, dz = (c.z - s.z) * 1.1;
      if (dx * dx + dz * dz < rr * rr) { c.alive = false; this.coins += c.v; this.stats.picked += c.v; this.emit('coinPick', { c }); }
    }
  }

  updateZombies(dt) {
    const s = this.squad;
    for (const z of this.zombies) {
      if (!z.alive) continue;
      z.flash = Math.max(0, z.flash - dt);
      if (!z.active) {
        if (z.ambush) {
          if (s.z - z.z0 > TUNE.sideDist) continue;
          if ((z.ambush.delay -= dt) > 0) continue;
          z.active = true; z.x = z.ambush.side * (ROAD_HW + 2.6); z.z = s.z - this.rng.range(5, 13);
          this.emit('ambush', { z });
        } else {
          if (z.z <= s.z - TUNE.rushDist) continue;
          z.active = true;
          if (z.line && !this.lineSeen) { this.lineSeen = true; this.emit('lineIn', { z }); }
          if (z.mb) {
            // 运钞怪: 0.9× what the squad's fire puts out in its time on the road; about 3/4 of the arrows hit it, so
            // plain fire falls short (~1.2× the time) and 双线 (×1.5) gets there (~0.8×)
            if (z.escT !== undefined) z.hp = z.maxhp = this.dps(s.N) * Math.max(1, z.escT - 1.2) * 0.9;
            // 幻影: ~2.4 s of the squad's fire; it is ~4 s in range, so aimed arrows (they all land) kill it and
            // straight ones (a third land, it strafes and blinks) let it walk into the squad
            if (z.dodgy) z.hp = z.maxhp = this.dps(s.N) * 2.4;
            this.emit('mbIn', { z });
          }
          // Top Lords' "enemy approaching": the first monster of a wave announces the whole wave and its worth
          if (z.wave && !(this.waveSeen ||= {})[z.wave]) {
            this.waveSeen[z.wave] = 1;
            let n = 0, m = 0, elite = false;
            for (const q of this.zombies) if (q.wave === z.wave && q.alive) { n++; m += q.m || 0; elite ||= q.brute; }
            this.emit('waveIn', { n, m, elite, first: z.wave === 1 });
          }
        }
        // soft rubber band: a weak squad meets softer zombies, a big one meets tougher hordes
        if (!z.brute) { const k = clamp(0.45 + s.N / 80, 0.55, 1.35); z.hp *= k; z.maxhp *= k; }
      }
      z.ph += dt * (z.brute ? 6 : 9);
      // mini-boss tricks: the 运钞 one runs ahead and gets away with its gold, the 幻影 one strafes and blinks
      if (z.mb && z.escT !== undefined) {
        if (z.fleeing) { z.fleeing += dt; z.z -= 11 * dt; if (z.fleeing > 1.3) { z.alive = false; this.emit('mbEscape', { z }); } continue; }
        z.escT -= dt;
        if (z.escT <= 0) { z.fleeing = 0.001; this.emit('mbFlee', { z }); continue; }
        if (z.z > s.z - 15) z.z = s.z - 15;
      }
      if (z.mb && z.dodgy) {
        z.moveT -= dt;
        if (z.moveT <= 0) {
          z.moveT = this.rng.range(0.9, 1.5);
          let nx = this.rng.range(-4.2, 4.2); if (Math.abs(nx - z.x) < 2.4) nx = z.x > 0 ? this.rng.range(-4.2, -1.2) : this.rng.range(1.2, 4.2);
          if (++z.blinkN % 2 === 0) { this.emit('mbBlink', { z, from: z.x, to: nx }); z.x = nx; }
          z.tx = nx;
        }
        z.x += clamp(z.tx - z.x, -6 * dt, 6 * dt);
      }
      if (z.ambush) {
        const dx = s.x - z.x, dz = s.z - z.z, d = Math.hypot(dx, dz) || 1;
        z.x += dx / d * z.speed * dt; z.z += dz / d * z.speed * dt * 0.6 + 1.2 * dt;
      } else {
        z.z += z.speed * dt;
        const dz = s.z - z.z;
        if (dz < 16 && dz > -2 && !z.mb && !z.shield && !z.line) {
          const dx = s.x - z.x;
          z.x += clamp(dx, -1, 1) * Math.min(Math.abs(dx), 1.8 * dt);
        }
      }
      const rr = s.R + z.r;
      const ex = z.x - s.x, ez = (z.z - s.z) * 1.15;
      if (ex * ex + ez * ez < rr * rr && s.N > 0) {
        z.alive = false;
        if (z.mb) {
          const n = Math.max(3, Math.round(s.N * TUNE.mbCut));
          this.emit('mbSmash', { z, n, shield: this.willShield('mb', n) });
          this.setN(s.N - n, 'mb', { from: z.name });
        } else {
          this.emit('zhit', { z });
          this.setN(s.N - z.power, 'zombie');
        }
        continue;
      }
      if (z.z > s.z + 4) z.alive = false;     // slipped past behind the squad
    }
  }

  updateFish(dt) {
    const s = this.squad;
    for (const f of this.fish) {
      if (!f.alive) continue;
      if (!f.started) { if (s.z - f.z < 26) { f.started = true; f.t = 0; this.emit('fishJump', { f }); } else continue; }
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) { f.alive = false; this.emit('fishSplash', { f }); continue; }
      // a 飞鱼潮 fish leaves the water low at one roadside and flies high over the squad to land far off the other side,
      // so it can only be hit near where it jumped: straight fire gets one side at best, 散射's fan both
      const x0 = -f.dir * (ROAD_HW + 4), x1 = f.dir * (ROAD_HW + (f.hi > 4.2 ? 12 : 4));
      f.x = x0 + (x1 - x0) * k;
      f.y = -0.6 + Math.sin(k * Math.PI) * (f.hi || 4.2);
    }
  }

  // cfg.model picks the boss (see rig.js BOSS_KINDS); cfg.slam (seconds) makes it slam a warned circle that
  // kills the soldiers standing in it — the squad can be dragged out of the way. The 海怪 never walks over:
  // it stays in the sea beyond the arena and only slams.
  spawnBoss(cfg) {
    const big = !!cfg.big;
    const kind = cfg.model || (big ? 'demon' : 'chubby');
    const still = kind === 'kraken';
    // the fight lasts about `sec` seconds whatever the squad size (the squad's fire grows with it)
    const dps = 6 * (1.5 + Math.pow(this.squad.N, 0.8)) * this.squad.dmg;
    // never more than ~2.2× that, so a small squad's fight doesn't drag on (it still has the slams to survive)
    const hp = this.L.journey ? Math.min(cfg.hp*this.scale,dps*(cfg.sec||6)) : Math.min(Math.max(cfg.hp * this.scale, dps * (cfg.sec || 6)), dps * (cfg.sec || 6) * 2.2);
    this.boss = {
      x: 0, z: still ? this.standZ - 13 : this.platZ - 19, hp, maxhp: hp, r: still ? 9 : big ? 3.2 : 2.7, speed: still ? 0 : big ? 1.0 : 1.15,
      name: cfg.name, kind, still, big, eat: 0, flash: 0, alive: true, ph: 0, t: 0,
      slam: cfg.slam || 0, slamT: cfg.slam ? (cfg.slamFirst ?? 1.6) : 0, slamR: cfg.slamR || 2.7, teleDur: cfg.tele || TUNE.tele, tele: null, slams: 0, dodged: 0,
      moves: cfg.moves || BOSS_MOVES[kind] || ['slam'], atk: 0, rage: false,
      // 4-1: the boss runs off with its gold after `escape` seconds; 4-4: the magician dodges, so only 瞄准 keeps up
      escT: cfg.escape || 0, escaping: 0, dodgy: !!cfg.dodgy, tx: 0, moveT: 1.2, blinkN: 0,
      m: this.stake ? cfg.m || 0 : 0,       // the boss is a 大怪 and pays m × 炮倍 when it falls
    };
    if (kind === 'magician') { this.boss.r = 1.7; this.boss.z = this.platZ - 15; this.boss.speed = 0; }
    if (cfg.shieldWall) this.shieldRow(this.boss.z + 7, cfg.shieldWall, 9 + Math.pow(this.squad.N, 0.62), true);
    this.phase = 'boss';
    this.emit('bossSpawn', { boss: this.boss });
  }
  updateBoss(dt) {
    const b = this.boss, s = this.squad;
    if (!b.alive) return;
    b.t += dt; b.flash = Math.max(0, b.flash - dt);
    if (b.escaping) {
      // running off with the gold: no more attacks, gone after a moment
      b.escaping += dt; b.z -= 9 * dt; b.ph += dt * 8; b.eating = false; b.tele = null;
      if (b.escaping > 1.6) { b.alive = false; this.emit('bossEscape', { boss: b }); this.phase = 'done'; this.emit('runDone', { delay: 0.6 }); }
      return;
    }
    if (b.escT > 0) {
      b.escT -= dt;
      if (b.escT <= 0) { b.escaping = 0.001; this.emit('bossFlee', { boss: b }); return; }
    }
    if (b.dodgy) {
      // strafe from side to side, now and then vanishing and reappearing somewhere else
      b.moveT -= dt;
      if (b.moveT <= 0) {
        b.moveT = this.rng.range(1.4, 2.4) * (b.rage ? 0.7 : 1);
        let nx = this.rng.range(-4.4, 4.4); if (Math.abs(nx - b.x) < 2.5) nx = b.x > 0 ? this.rng.range(-4.4, -1) : this.rng.range(1, 4.4);
        if (++b.blinkN % 3 === 0) { this.emit('bossBlink', { boss: b, from: b.x, to: nx }); b.x = nx; }
        b.tx = nx;
      }
      b.x += clamp(b.tx - b.x, -6 * dt, 6 * dt);
      b.ph += dt * 3;
    }
    if (b.slam) this.updateSlam(b, dt);
    if (b.dodgy) return;
    if (b.still) { b.ph += dt * 2; return; }
    const front = s.z - s.R - 0.2;
    if (b.tele) { b.eating = false; return; }          // stops to wind up the slam
    if (b.z + b.r < front) { b.z += b.speed * dt; b.ph += dt * 4; b.eating = false; }
    else {
      b.eating = true; b.ph += dt * 6;
      b.eat += dt * (this.L.finale.boss.bite || (b.big ? 8 : 6));
      if (b.eat >= 1) { const k = Math.floor(b.eat); b.eat -= k; this.emit('bossBite', { n: k }); this.setN(s.N - k, 'boss'); }
    }
  }
  // Each boss cycles through its own moves (BOSS_MOVES), every one warned on the ground first and dodged by
  // dragging the squad: slam = a circle on the squad; multi = three circles across the road with one gap; lane = the
  // half of the road the squad is on is swept; rain = small circles all around the squad; summon = a pack of zombies.
  // Below half health the boss goes into a rage: shorter pauses and shorter warnings.
  updateSlam(b, dt) {
    const s = this.squad;
    if (!b.rage && b.hp < b.maxhp * TUNE.rageAt) {
      b.rage = true; b.slam *= TUNE.rageSlam; b.teleDur *= TUNE.rageTele; b.slamT = Math.min(b.slamT, 0.6);
      this.emit('bossRage', { boss: b });
    }
    if (!b.tele) {
      b.slamT -= dt;
      if (b.slamT > 0) return;
      const move = b.moves[b.atk++ % b.moves.length];
      if (move === 'summon') { this.bossSummon(b); b.slamT = b.slam * 0.8; return; }
      b.tele = this.bossShapes(b, move);
      this.emit('bossTele', { boss: b, tele: b.tele });
      return;
    }
    const T = b.tele;
    T.t += dt;
    if (T.t < T.dur) return;
    b.tele = null; b.slamT = b.slam; b.slams++;
    const vis = visCount(s.N), p = [0, 0], dead = [];
    for (let i = 0; i < vis; i++) {
      slotPos(i, vis, s.x, s.z, p);
      if (T.shapes.some(q => inShape(q, p[0], p[1]))) dead.push([p[0], p[1]]);
    }
    let n = vis ? Math.round(dead.length * s.N / vis) : 0;
    n = Math.min(n, Math.ceil(s.N * (T.move === 'rain' ? TUNE.rainCap : TUNE.hitCap)));     // 一星: one blow never takes more than a quarter
    if (dead.length > 60) dead.length = 60;
    if (!n) b.dodged++;
    this.emit('bossSlam', { boss: b, tele: T, n, positions: dead, shield: this.willShield('boss', n) });
    if (n) this.setN(s.N - n, 'boss', { positions: dead, from: b.name });
  }
  // the warned shapes of one move, aimed where the squad is now; x/z = where the blow is centred (for the text)
  bossShapes(b, move) {
    const s = this.squad, lim = ROAD_HW - 1.2, x = clamp(s.x, -lim, lim), z = s.z - 0.4;
    const T = { move, x, z, r: b.slamR, t: 0, dur: b.teleDur, shapes: [] };
    if (move === 'multi') {
      // four lanes, three of them hit; the open one is never the squad's own
      const lanes = [-4.2, -1.4, 1.4, 4.2], mine = lanes.reduce((a, l, i) => (Math.abs(l - s.x) < Math.abs(lanes[a] - s.x) ? i : a), 0);
      let gap = this.rng.int(3); if (gap >= mine) gap++;
      lanes.forEach((l, i) => { if (i !== gap) T.shapes.push({ type: 'circle', x: l, z, r: 1.75 }); });
      T.dur = b.teleDur * 1.25;
    } else if (move === 'lane') {
      // sweep the half of the road the squad stands on
      const side = s.x >= 0 ? 1 : -1;
      T.shapes.push({ type: 'rect', x0: side > 0 ? -0.3 : -ROAD_HW - 0.4, x1: side > 0 ? ROAD_HW + 0.4 : 0.3, z0: z - 3.4, z1: z + 3.4, side });
      T.x = side * ROAD_HW / 2; T.dur = b.teleDur * 1.1;
    } else if (move === 'rain') {
      T.shapes.push({ type: 'circle', x, z, r: 1.35 });
      for (let i = 0; i < 5; i++) T.shapes.push({ type: 'circle', x: clamp(x + this.rng.range(-4.2, 4.2), -lim, lim), z: z + this.rng.range(-2.4, 2.4), r: 1.25 });
      T.dur = b.teleDur * 1.35;
    } else T.shapes.push({ type: 'circle', x, z, r: b.slamR });
    return T;
  }
  bossSummon(b) {
    const s = this.squad, n = 6 + Math.min(8, Math.round(s.N / 25)), hp = 4 + Math.pow(s.N, 0.55);
    const list = [];
    for (let i = 0; i < n; i++) {
      const zb = this.mkZombie(clamp(b.x + this.rng.range(-3.5, 3.5), -ROAD_HW + 0.6, ROAD_HW - 0.6), b.z + 1.5 + this.rng.range(0, 2), hp, 1, false);
      zb.active = true; zb.speed *= 1.25;
      this.zombies.push(zb); list.push(zb);
    }
    this.emit('bossSummon', { boss: b, list });
  }
  // the safest x for the squad right now (autopilot): out of every warned shape, as close as possible
  safeX() {
    const s = this.squad, T = this.boss && this.boss.tele;
    if (!T) return s.x;
    const lim = ROAD_HW - 0.6, pad = Math.min(1.4, s.R * 0.7);
    let best = s.x, bv = 1e9;
    for (let x = -lim; x <= lim + 1e-6; x += 0.35) {
      let hit = 0;
      for (const q of T.shapes) for (const dx of [-pad, 0, pad]) if (inShape(q, x + dx, s.z)) hit++;
      const v = hit * 100 + Math.abs(x - s.x);
      if (v < bv) { bv = v; best = x; }
    }
    return best;
  }
  damageBoss(d, x, z) {
    const b = this.boss;
    if (b.passive) { this.hitPassive(b, d, x, z); return; }
    b.hp -= d; b.flash = 0.06;
    this.emit('bossHit', { d, x, z });
    if (b.hp <= 0 && b.alive) {
      b.alive = false; b.hp = 0;
      this.emit('bossDie', { boss: b });
      this.phase = 'done';
      this.emit('runDone', { delay: 1.4 });
    }
  }

  // the most valuable thing in range, for the 瞄准 skill
  aimTarget(x0) {
    const s = this.squad;
    if (this.boss && this.boss.alive) return this.boss;
    if (this.fin && this.fin.fish) {
      let bf = null, bm = -1;
      for (const f of this.fin.fish) if (f.alive && f.y > 0.6 && f.m - Math.abs(f.x - x0) * 0.5 > bm) { bm = f.m - Math.abs(f.x - x0) * 0.5; bf = f; }
      if (bf) return bf;
    }
    let best = null, bv = -1;
    for (const z of this.zombies) {
      if (!z.alive || !z.active || z.z < s.z - TUNE.range || z.z > s.z) continue;
      const v = (z.mb ? 1000 : z.brute ? 100 : 1) - Math.abs(z.x - x0) * 0.1;
      if (v > bv) { bv = v; best = z; }
    }
    for (const r of this.barrels) {
      if (!r.alive || r.z < s.z - TUNE.range || r.z > s.z) continue;
      const v = 50 - Math.abs(r.x - x0) * 0.1;
      if (v > bv) { bv = v; best = r; }
    }
    return best;
  }

  // Volleys come out in ranks, Top Lords style: evenly spaced columns across the squad, all straight ahead and on
  // the same beat (alternate volleys shift half a column so the lanes fill in). TUNE.volleys sets how often they come,
  // not the damage: each carries 6 / TUNE.volleys of volleyDamage, so the squad deals 6 × volleyDamage a second.
  fire(dt) {
    const s = this.squad;
    if (s.N <= 0) return;
    const shooting = this.phase === 'search' || this.phase === 'extract' || this.phase === 'run' || this.phase === 'arrive' || this.phase === 'boss' || (this.phase === 'finale' && this.fin && !this.fin.gaps && !this.fin.over);
    if (!shooting) return;
    const sk = s.skills;
    this.fireT -= dt;
    let guard = 0;
    while (this.fireT <= 0 && guard++ < 3) {
      this.fireT += 1 / (TUNE.volleys * s.rate);
      this.volleyN = (this.volleyN || 0) + 1;
      const k = clamp(Math.round(Math.sqrt(s.N) * 1.5), 1, 22);
      let per = volleyDamage(s.N) * s.dmg / k * (6 / TUNE.volleys);
      const lines = sk.double ? [-0.13, 0.13] : [0];
      const fan = sk.spread ? [-0.26, 0, 0.26] : [0];
      if (sk.double) per *= 0.75;
      if (sk.spread) per *= 0.6;
      const boss = this.boss && this.boss.alive ? this.boss : null;
      const w = Math.min(s.R * 0.8, ROAD_HW - 0.4), step = k > 1 ? (2 * w) / (k - 1) : 0;
      const shift = (this.volleyN % 2 ? 0.25 : -0.25) * step;   // every other volley sits between the last one's lanes
      const z = s.z - s.R * 0.5;
      // an arrow on a barrel counts for more when the squad is big or the crossbow better (Top Lords: a strong
      // army smashes the barrels it walks into, a small one has to pick one)
      const hw = 1 + Math.floor(s.N / 300) + s.tier;
      for (let i = 0; i < k; i++) {
        const u = k > 1 ? i / (k - 1) - 0.5 : 0;             // -0.5 … 0.5 across the squad
        const x = s.x + (k > 1 ? -w + i * step + shift : 0);
        // arrows fly straight; only 瞄准 bends them toward targets (the boss included)
        const tgt = sk.aim ? (boss || this.aimTarget(x)) : null;
        for (const off of lines) for (let q = 0; q < fan.length; q++) {
          let bx = x + off, vx = 0, vz = -TUNE.bulletV;
          if (sk.spread) {
            // 散射 (二人捕鱼's trident): the volley opens like a fan from one point behind the squad — the further
            // out an arrow starts, the wider it flies — so no two arrows ever cross
            const n3 = k * fan.length, uu = n3 > 1 ? (i * fan.length + q) / (n3 - 1) - 0.5 : 0, th = uu * TUNE.spreadArc;
            bx = s.x + uu * 2 * (w + 0.5) + off;
            vx = Math.sin(th) * TUNE.bulletV; vz = -Math.cos(th) * TUNE.bulletV;
          }
          // aimed fire converges in tidy lines on the target, spread over its width
          const homes = tgt && fan[q] === 0;
          if (homes) { const tx = tgt.x + u * Math.min(tgt.r || 1, 2.2); vx = (tx - bx) / Math.max(1, (z - tgt.z)) * TUNE.bulletV; vz = -TUNE.bulletV; }
          this.bullets.push({ x: bx, z: sk.spread ? z : z - ((i * 5) % 4) * 0.9, vx, vz, dmg: per, alive: true, y: 0.75, pierce: sk.pierce ? 2 : 0, last: 0, tgt: homes ? tgt : null, tier: s.tier, hw, spread: !!sk.spread });
        }
      }
      this.emit('volley', { k });
    }
  }

  updateBullets(dt) {
    const s = this.squad;
    const keep = [];
    for (const b of this.bullets) {
      const zPrev = b.z;
      if (b.tgt && b.tgt.alive && b.tgt.z < b.z - 1) b.vx += ((b.tgt.x - b.x) / Math.max(1, b.z - b.tgt.z) * TUNE.bulletV - b.vx) * Math.min(1, dt * 8);
      b.x += b.vx * dt; b.z += b.vz * dt;
      if (b.z < s.z - TUNE.range || Math.abs(b.x) > ROAD_HW + 8) continue;
      let hit = false;
      // gates (bullet crossing the gate plane): shooting a + / − gate raises its number
      // gates with a crosshair: each bullet raises the number (a red −N climbs toward a blue +N)
      for (const g of this.gates) {
        if (!g.shoot || g.used || !(g.z <= zPrev && g.z > b.z)) continue;
        const B = g.bounds;
        let side = 0;
        while (side < g.ops.length - 1 && b.x > B[side + 1]) side++;
        const o = g.ops[side];
        // a shot panel climbs with the damage put into it (more soldiers, better crossbows: faster), up to
        // +24 (×army) or its own size more, so even the reddest panel can be shot blue; there it flashes MAX
        if (o.op === '+') {
          o.max ??= o.v0 + Math.max(24 * this.army, Math.abs(o.v0) + 8 * this.army);
          if (!o.full) {
            o.v = Math.min(o.max, o.v + b.dmg * TUNE.gateGain * this.army); g.flash[side] = 1;
            if (o.v >= o.max) { o.full = true; this.emit('gateMax', { g, side }); }
          }
        }
        hit = true; this.emit('gateHit', { g, side, x: b.x });
        this.impact(b.x, 1.3, g.z, 'g');
        break;
      }
      if (!hit) for (const z of this.zombies) {
        if (!z.alive || !z.active || z.id === b.last) continue;
        if (Math.abs(b.x - z.x) < z.r + 0.12 && z.z - 0.5 - (z.mb ? 1 : 0) <= zPrev + 0.2 && z.z + 0.5 + (z.mb ? 1 : 0) >= b.z) {
          const blocked = z.shield && !(b.pierce > 0);
          z.hp -= blocked ? b.dmg * 0.15 : b.dmg; z.flash = 0.07;
          if (!z.mb && !blocked) z.z -= z.brute ? 0.02 : 0.07;      // every arrow knocks it back a little
          if (blocked && this.rng.next() < 0.08) this.emit('shieldBlock', { z });
          this.emit('zdmg', { z, d: b.dmg });
          this.impact(b.x, z.mb ? 1.6 : 0.9, z.z + 0.3, blocked ? 'g' : 'z');
          if (z.hp <= 0) { z.alive = false; this.stats.kills++; this.emit('zdie', { z }); this.luckyDrop(z); }
          if (b.pierce > 0) { b.pierce--; b.last = z.id; continue; }
          hit = true;
          break;
        }
      }
      if (!hit) for (const r of this.barrels) {
        if (!r.alive) continue;
        const w = r.kind === 'cage' ? 1.7 : 0.75;
        if (Math.abs(b.x - r.x) < w && r.z - 0.6 <= zPrev && r.z + 0.6 >= b.z && b.last !== r.id) {
          r.hp -= b.hw || 1; r.flash = 0.07; hit = true;
          this.emit('bdmg', { r, d: 1 });
          this.impact(b.x, 0.8, r.z + 0.5, 'b');
          if (r.hp <= 0) { r.alive = false; this.stats.barrels++; this.applyBarrel(r); }
          if (b.pierce > 0) { b.pierce--; b.last = r.id; hit = false; continue; }
          break;
        }
      }
      if (!hit) for (const f of this.fish) {
        if (!f.alive || !f.started || f.y < 0.2 || f.y > 3.2) continue;
        if (Math.abs(b.x - f.x) < 0.9 && f.z - 0.8 <= zPrev && f.z + 0.8 >= b.z) {
          f.alive = false; hit = true; this.stats.fish++;
          this.impact(b.x, f.y + 0.4, f.z, 'f');
          // with a 炮倍 a fish pays its card's multiple × 炮倍, like the monsters (paid by the game)
          if (f.m) { this.emit('fishKill', { f, mult: f.m, paid: true }); break; }
          const mult = this.rng.weighted([{ m: 1, w: 40 }, { m: 2, w: 30 }, { m: 3, w: 18 }, { m: 5, w: 12 }]).m;
          const coins = 300 * mult;
          this.coins += coins;
          this.emit('fishKill', { f, mult, coins });
          break;
        }
      }
      if (!hit && this.fin && this.fin.fish) for (const f of this.fin.fish) {
        if (!f.alive || f.y < 0.3 || f.id === b.last) continue;
        if (Math.abs(b.x - f.x) < f.r && f.z - 1.1 <= zPrev && f.z + 1.1 >= b.z) {
          f.hp -= b.dmg; f.flash = 0.07; hit = true;
          this.impact(b.x, f.y + 0.4, f.z + 0.4, 'f');
          if (f.hp <= 0) { f.alive = false; this.fin.units += f.m; this.fin.kills++; this.emit('leapKill', { f, units: f.m }); }
          if (b.pierce > 0) { b.pierce--; b.last = f.id; hit = false; continue; }
          break;
        }
      }
      if (!hit && this.boss && this.boss.alive) {
        const B = this.boss;
        if (B.kind === 'kraken') {
          // 章鱼触角: only an arrow that meets one of the five tentacles counts; straight volleys reach the ones in
          // front of the squad, 散射 fans out to the ones at the sides
          for (const [ax, az] of KRAKEN_ARMS) {
            const Z = this.platZ + az;
            if (Math.abs(b.x - ax) < 1.15 && Z - 1 <= zPrev && Z + 1.2 >= b.z) { hit = true; this.damageBoss(b.dmg, b.x, Z + 1); this.impact(b.x, this.rng.range(1.5, 3.5), Z + 0.8, 'B'); break; }
          }
        } else if (Math.abs(b.x - B.x) < B.r + 0.3 && B.z - 1.6 <= zPrev && B.z + 1.6 >= b.z) { hit = true; this.damageBoss(b.dmg, b.x, B.z + 1); this.impact(b.x, this.rng.range(1.2, 3.2), B.z + B.r * 0.6, 'B'); }
      }
      if (!hit) keep.push(b);
    }
    this.bullets = keep;
  }

  impact(x, y, z, k) { if (this.impacts.length < 60) this.impacts.push({ x, y, z, k }); }

  // 幸运: every kill drops coins with a random multiplier
  luckyDrop(z) {
    if (!this.squad.skills.lucky) return;
    const m = this.rng.weighted(LUCK).m;
    const base = z.mb ? 1500 : z.brute ? 200 : 20;
    const coins = base * m;
    this.coins += coins; this.stats.lucky += coins;
    this.emit('luckyCoin', { x: z.x, z: z.z, coins, mult: m });
  }

  applyBarrel(r) {
    const s = this.squad;
    if (r.vault) { this.fin.units += r.m; this.fin.broken++; this.emit('vaultBreak', { r, units: r.m }); return; }
    if (r.kind === 'men' || r.kind === 'cage') this.setN(s.N + r.v * this.army, r.kind);
    else if (r.kind === 'gun') { s.tier++; s.dmg *= 1.4; }
    else if (r.kind === 'rate') { s.rate *= 1.25; }
    else if (r.kind === 'coin' && !r.m) { this.coins += r.v; }
    else if (r.kind === 'skill') this.addSkill(r.v, 'barrel');
    else if (r.kind === 'shield') { s.shield = (s.shield || 0) + 1; }
    else if (r.kind === 'heal') {
      // 治疗: half of the soldiers lost so far come back
      const k = Math.max(r.v * this.army, Math.round((this.stats.lost - this.healed) * TUNE.healRatio));
      this.healed += k; r.healN = k;
      this.setN(s.N + k, 'heal');
    }
    this.emit('barrel', { r });
    // a barrel goes up in flames: the zombies around it burn with it
    if (r.kind === 'cage') return;
    let k = 0;
    for (const z of this.zombies) {
      if (!z.alive || !z.active || z.mb) continue;
      const dx = z.x - r.x, dz = z.z - r.z;
      if (dx * dx + dz * dz > BOOM_R * BOOM_R) continue;
      if (z.brute) { z.hp -= z.maxhp * 0.5; z.flash = 0.1; if (z.hp > 0) continue; }
      z.alive = false; this.stats.kills++; k++;
      this.emit('zdie', { z, boom: true }); this.luckyDrop(z);
    }
    this.emit('barrelBoom', { r, k });
  }

  // ---------------------------------------------------------------- 结尾惊喜
  // After the boss the squad stays on the arena (or runs the 彩虹滚轮) and plays the level's finale. The sim only
  // counts "units" (multiples); the game turns units into coins at the finale's chip, priced by the 一星剧本.
  // o: { parN (the squad an average run brings here; sets how tough the targets are), dur }
  dps(n) { return 6 * volleyDamage(n) * this.squad.dmg * this.squad.rate; }
  startFinale(type, o = {}) {
    const s = this.squad, HW = ROAD_HW;
    this.bullets.length = 0;
    this.boss = null;
    this.phase = 'finale';
    const parN = Math.max(20, o.parN || s.N);
    const F = this.fin = { type, t: 0, dur: o.dur || 8, units: 0, kills: 0, broken: 0, over: false, endT: 0, acc: 0, accT: 0, parN };
    const dps0 = this.dps(parN);
    // targets are laid out in front of where the squad stands (the arena, or the last lit tile of a runway)
    const base = Math.min(s.z - 3.2, this.platZ + 4);
    F.base = base;
    if (type === 'goldmob' || type === 'egg') {
      // 黄金雪怪 / 金蛋: one big target that never strikes back; every hit spits coins (a par squad: 10 units a second)
      const egg = type === 'egg';
      F.dur = egg ? 9 : 8;
      const hp = dps0 * (egg ? 6 : 6.5);
      F.upd = 10 / dps0;
      F.layers = egg ? 3 : 0; F.layer = 0;
      this.boss = { kind: type, passive: true, x: 0, z: base - (egg ? 10 : 13), hp, maxhp: hp, r: egg ? 2.2 : 2.9, alive: true, flash: 0, t: 0, ph: 0,
        name: egg ? '金蛋' : '黄金机甲', big: true, still: true, slam: 0, moves: [], tele: null, m: 0 };
    } else if (type === 'fishleap') {
      // 鱼跃金鱼: golden fish leap across in front of the squad in waves; each carries a multiple
      F.dur = 10; F.fish = []; F.plan = [];
      const LIST = [[5, 4], [8, 6], [10, 12], [15, 7], [20, 19], [30, 14], [50, 9]];
      let t = 0.4;
      for (let i = 0; i < 18; i++) {
        const [m, card] = LIST[Math.min(LIST.length - 1, Math.floor(i / 3) + (i % 3 === 2 ? 1 : 0))];
        F.plan.push({ t, m, card, side: i % 2 ? 1 : -1, z: base - 6 - (i % 3) * 3.2, hp: dps0 * (0.12 + m * 0.012) });
        t += i % 3 === 2 ? 0.95 : 0.22;
      }
    } else if (type === 'vault') {
      // 打爆桶: a wall of barrels across the arena; 10 seconds to break as many as possible (hits, like the road)
      F.dur = 10;
      const k = clamp(Math.round(Math.sqrt(parN) * 1.5), 1, 22);
      const perLane = k * 16 * 1.6 / (2 * Math.min(squadRadius(parN) * 0.8, HW - 0.4)) * (s.skills.pierce ? 2.2 : 1);
      const budget = perLane * F.dur * 0.75;     // what an average squad puts into one column in the time
      // four rows of three (Top Lords): coins up front, fish cards behind, golden barrels at the back
      const ROWS = [[0.08, 'coin', [3, 4, 3]], [0.16, 'fish', [10, 20, 10]], [0.28, 'coin', [8, 12, 8]], [0.48, 'gold', [40, 80, 40]]];
      const xs = [-3.5, 0, 3.5], FK = { 10: 'hudie', 20: 'longxia' };
      ROWS.forEach(([f, kind, ms], row) => xs.forEach((x, c) => {
        const mm = ms[c];
        const r = this.mkBarrel(kind === 'fish' ? 'fish' : 'coin', kind === 'fish' ? FK[mm] : mm, budget * f, x, base - 4.8 - row * 3.6);
        r.vault = true; r.m = mm; r.gold = kind === 'gold'; r.row = row;
        this.barrels.push(r);
      }));
    } else if (type === 'rainbow') {
      // 彩虹滚轮: the squad runs over spinning rainbow rollers; every gap swallows soldiers until it is full
      const c = Math.max(1, parN / (o.div || RAINBOW.div));
      F.gaps = RAINBOW.m.map((m, k) => ({ k, m, cap: k === RAINBOW.m.length - 1 ? Infinity : Math.max(1, Math.round(c * Math.pow(RAINBOW.grow, k))), n: 0, z: this.platZ - 11.8 - k * 5.6 }));
      F.dur = 60; F.speed = 0;
    } else if (type === 'bricks') {
      // 金砖墙: rows of gold bricks across the road; the squad runs into the next row and every soldier smashes
      // one brick (and pays the row's multiple) until the row breaks, then on to the next, worth more
      const c = Math.max(1, parN / (o.div || BRICKS.div));
      F.gaps = BRICKS.m.map((m, k) => ({ k, m, cap: k === BRICKS.m.length - 1 ? Infinity : Math.max(1, Math.round(c * Math.pow(BRICKS.grow, k))), n: 0, z: this.platZ - 9 - k * 4.4 }));
      F.dur = 60; F.speed = 0;
    }
    this.emit('finaleStart', { fin: F });
  }

  updateFinale(dt) {
    const F = this.fin, s = this.squad;
    if (!F) return;
    F.t += dt;
    if (F.over) {
      F.endT += dt;
      if (F.endT > 1.0 && !F.ended) { F.ended = true; this.phase = 'done'; this.emit('finaleEnd', { fin: F }); }
      this.updateBullets(dt);
      return;
    }
    if (F.type === 'rainbow') { this.updateRainbow(dt); return; }
    if (F.type === 'bricks') { this.updateBricks(dt); return; }
    const left = F.dur - F.t;
    if (this.boss && this.boss.passive) {
      const b = this.boss;
      b.t += dt; b.ph += dt * 2; b.flash = Math.max(0, b.flash - dt);
      F.accT += dt;
      if (F.acc > 0 && F.accT > 0.14) { this.emit('finHit', { units: F.acc, x: b.x, z: b.z }); F.acc = 0; F.accT = 0; }
      if (left <= 0) {
        if (b.kind === 'egg') this.hitPassive(b, b.hp + 1, b.x, b.z, true);        // the last hammer: the egg always breaks
        else { b.alive = false; this.finEnd('flee'); }
      }
    } else if (F.type === 'fishleap') {
      while (F.plan.length && F.plan[0].t <= F.t) {
        const p = F.plan.shift();
        const f = { id: this.nextId++, m: p.m, card: p.card, side: p.side, z: p.z, x: -p.side * (ROAD_HW + 5), y: -1, t: 0, dur: 2.5, hp: p.hp, maxhp: p.hp, r: 1.1, alive: true, flash: 0 };
        F.fish.push(f);
        this.emit('leapIn', { f });
      }
      for (const f of F.fish) {
        if (!f.alive) continue;
        f.t += dt; f.flash = Math.max(0, f.flash - dt);
        const k = f.t / f.dur;
        if (k >= 1) { f.alive = false; f.gone = true; this.emit('leapOut', { f }); continue; }
        const x0 = -f.side * (ROAD_HW + 5), x1 = f.side * (ROAD_HW + 5);
        f.x = x0 + (x1 - x0) * k;
        f.y = -0.8 + Math.sin(k * Math.PI) * 5.2;
      }
      if (!F.plan.length && F.fish.every(f => !f.alive)) this.finEnd('done');
      else if (left <= 0 && !F.plan.length) { for (const f of F.fish) if (f.alive) { f.alive = false; f.gone = true; this.emit('leapOut', { f }); } this.finEnd('time'); }
    } else if (F.type === 'vault') {
      const rest = this.barrels.filter(r => r.vault && r.alive);
      if (!rest.length) this.finEnd('all');
      else if (left <= 0) this.finEnd('time');
    }
    this.fire(dt);
    this.updateBullets(dt);
  }
  finEnd(reason) {
    const F = this.fin;
    if (F.over) return;
    F.over = true; F.reason = reason;
    this.bullets.length = 0;
    this.emit('finaleOver', { fin: F, reason });
  }
  // a hit on the 黄金雪怪 or the 金蛋: the damage it took, in units
  hitPassive(b, d, x, z, final) {
    const F = this.fin;
    if (!b.alive || !F || F.over) return;
    const dd = Math.min(d, b.hp);
    b.hp -= dd; b.flash = 0.06;
    const du = dd * F.upd;
    F.units += du; F.acc += du;
    this.emit('bossHit', { d: dd, x, z: b.z + 1 });
    if (b.kind === 'egg') {
      while (F.layer < F.layers && b.hp <= b.maxhp * (1 - (F.layer + 1) / F.layers) + 1e-6) { F.layer++; this.emit('eggCrack', { layer: F.layer, final }); }
    }
    if (b.hp <= 1e-6) {
      b.alive = false;
      if (F.acc > 0) { this.emit('finHit', { units: F.acc, x: b.x, z: b.z }); F.acc = 0; }
      if (b.kind === 'egg') this.emit('eggBreak', { units: F.units, final });
      else { const bonus = F.units; F.units *= 2; this.emit('goldKill', { bonus, units: F.units }); }
      this.finEnd(b.kind === 'egg' ? 'break' : 'kill');
    }
  }
  updateRainbow(dt) {
    const F = this.fin, s = this.squad;
    const gap = F.gaps.find(g => g.n < g.cap && s.z - s.R * 0.4 <= g.z + 1.1);
    const filling = gap && s.N > 0;
    const want = filling ? 2.6 : 6.5;
    F.speed = damp1(F.speed, want, 5, dt);
    s.z -= F.speed * dt; s.speed = F.speed;
    s.x += (0 - s.x) * Math.min(1, dt * 3);
    if (filling) {
      const rate = gap.rate ||= Math.max((gap.cap === Infinity ? s.N / 0.9 : gap.cap / 0.45), 30);
      gap.flow = (gap.flow || 0) + rate * dt;
      let n = Math.floor(gap.flow);
      if (n > 0) {
        n = Math.min(n, gap.cap - gap.n, s.N);
        gap.flow -= n;
        gap.n += n;
        F.units += n * gap.m;
        this.setN(s.N - n, 'rainbow');
        this.emit('rbFall', { gap, n, units: n * gap.m });
        if (gap.n >= gap.cap) this.emit('rbFull', { gap });
      }
    }
    if (s.N <= 0) this.finEnd('done');
  }
  updateBricks(dt) {
    const F = this.fin, s = this.squad;
    const row = F.gaps.find(g => g.n < g.cap);
    const stop = row ? row.z + 0.7 + s.R * 0.45 : -Infinity;      // the squad's centre when its front touches the row
    const contact = row && s.z <= stop + 0.05;
    F.speed = damp1(F.speed, contact ? 0.6 : 7, contact ? 9 : 4, dt);
    s.z = Math.max(stop - 0.25, s.z - F.speed * dt); s.speed = Math.max(F.speed, contact ? 0.8 : 0);
    s.x += (0 - s.x) * Math.min(1, dt * 3);
    if (contact && s.N > 0) {
      const rate = row.rate ||= Math.max((row.cap === Infinity ? s.N / 1.2 : row.cap / 0.6), 24);
      row.flow = (row.flow || 0) + rate * dt;
      let n = Math.floor(row.flow);
      if (n > 0) {
        n = Math.min(n, row.cap - row.n, s.N);
        row.flow -= n;
        row.n += n;
        F.units += n * row.m;
        this.setN(s.N - n, 'bricks');
        this.emit('brHit', { gap: row, n, units: n * row.m });
        if (row.n >= row.cap) this.emit('brBreak', { gap: row });
      }
    }
    if (s.N <= 0) this.finEnd('done');
  }
  // what is still ahead on the road (for the 敌人 counter): monsters alive and in front, and their multiples
  foes() {
    const s = this.squad;
    let n = 0, m = 0;
    for (const z of this.zombies) if (z.alive && z.z < s.z + 2) { n++; m += z.m || 0; }
    if (this.boss && this.boss.alive && !this.boss.passive) { n++; m += this.boss.m || 0; }
    return { n, m };
  }
}
