// Bonus cannon after the boss. Every surviving soldier becomes one golden shell; the cannon carries the skills
// picked up on the road (plus whatever the bonus wheel adds) and fires them all into a pond of fish in a few
// seconds. Shells are free: more soldiers → more shells → more coins. Pure state + events, drawn by FishView.
import { FishSim, AREA } from './fishsim.js';
import { SHOT, BONUS_TYPES, FISH } from '../content/levels.js';
import { SPECIALS } from '../content/specials.js';
import { clamp } from './util.js';

const SHELL_V = 44;
const FIRE_MAX = 30;                 // visual shots per second at most; heavier shells carry the rest
const RAIN_K = 0.8;                  // 金币雨 pays this many shot values per soldier on top
const LUCK = [{ m: 1, w: 58 }, { m: 2, w: 24 }, { m: 3, w: 12 }, { m: 5, w: 6 }];
// the golden dragon in the bonus: smaller than the fishing boss wheel, and it always pays
// the Bonus pool's big target's wheel (黄金机甲, the 二人捕鱼 金蟾: ×50～×200)
export const DRAGON_WHEEL = [{ m: 50, w: 30 }, { m: 60, w: 24 }, { m: 80, w: 20 }, { m: 100, w: 12 }, { m: 150, w: 8 }, { m: 200, w: 6 }];

// cannon model tier from the skills: 散射 = three barrels, 双线 = two
export const cannonTier = sk => (sk.spread ? 3 : sk.double ? 2 : 1);

export class BonusSim extends FishSim {
  // o: { cz, shots, skills, k: coin multiplier (energy bet × wheel ×2/×3), specials: special fish types, laser }.
  // The last argument, { seed, rng }, is FishSim's: every draw comes from this.rng.
  constructor(o, emit, rngOpts = {}) {
    super({ types: BONUS_TYPES, count: 26, rtp: 1, bossAt: Infinity, boss: {}, endOnBoss: true }, { platZ: o.cz, wallet: null }, emit, rngOpts);
    this.shots = o.shots; this.left = o.shots;
    this.skills = { ...o.skills };
    this.k = o.k;
    this.rain = false; this.rainPool = 0; this.rainT = 0;
    this.dur = clamp(1.5 + Math.sqrt(o.shots) * 0.35, 2.5, 7);
    this.visual = Math.max(1, Math.min(o.shots, Math.round(this.dur * FIRE_MAX)));
    this.w = o.shots / this.visual;            // soldiers carried by one visual shot
    this.interval = this.dur / this.visual;
    this.parts = { fish: 0, lucky: 0, dragon: 0, rain: 0, special: 0 };
    // 二人捕鱼's special fish swim in at these points of the volley (海鳗 early, 章鱼 mid-way)
    const AT = [0.12, 0.36, 0.55];
    this.specials = (o.specials || []).map((type, i) => ({ type, at: AT[i] ?? 0.5, f: null, hits: 0, need: clamp(Math.round(this.visual * 0.035), 3, 9), pending: false }));
    this.won = 0;
    this.dragon = null; this.dragonDone = false; this.dragonHits = 0; this.dragonNeed = 1;
    this.hold = true;
    this.bossLabel = '×30~200';
    this.charge = 0; this.chargeMax = Math.max(16, Math.round(this.visual * 0.32));
    this.laserOn = o.laser !== false;
  }

  addSkill(k) { this.skills[k] = true; }
  addDragon() {
    const zc = this.cz - (AREA.far + AREA.near) / 2;
    const f = this.spawn('boss', { dir: 1, loop: true, path: { ax: -(AREA.hw + 4), az: zc - 3, bx: AREA.hw + 4, bz: zc + 3 } });
    f.s = 0.22;                                  // already on screen
    this.dragon = f;
    // every third shot goes at the dragon; it bursts about two thirds of the way through the shells
    this.dragonNeed = clamp(Math.round(this.visual / 3 * 0.65), 3, 40);
    this.emit('dragonIn', { f });
  }

  // 金蛋: a golden egg floating in the middle of the pond. Every third volley goes at it; each layer that
  // cracks pays out, the last one breaks it and the game spins its multiplier.
  addEgg() {
    const per = clamp(Math.round(this.visual * 0.1), 3, 18);
    this.egg = { x: 0, z: this.cz - 15, r: 1.9, layer: 0, layers: 3, hits: 0, per, alive: true, coins: 0, wob: 0 };
    this.emit('eggIn', { egg: this.egg });
  }
  hitEgg(b) {
    const e = this.egg;
    e.hits++; e.wob = 1;
    this.emit('eggHit', { egg: e });
    if (b.final) e.hits = e.per * e.layers;
    while (e.alive && e.hits >= e.per * (e.layer + 1)) {
      e.layer++;
      const coins = Math.round(SHOT * this.k * Math.max(e.per * 4, this.shots / 12) * e.layer);
      e.coins += coins; this.won += coins; this.parts.egg = (this.parts.egg || 0) + coins;
      this.emit('eggLayer', { egg: e, i: e.layer, coins });
      if (e.layer >= e.layers) { e.alive = false; this.emit('eggBreak', { egg: e }); }
    }
  }
  resolveEgg(m) {
    const extra = Math.round(this.egg.coins * (m - 1));
    this.won += extra; this.parts.egg = (this.parts.egg || 0) + extra;
    return extra;
  }

  update(dt) {
    if (!this.hold && !this.paused) this.spawnT -= dt;      // the pond refills twice as fast during the bonus
    super.update(dt);
    if (this.over || this.paused || this.hold) return;
    if (this.rainPool > 0) {
      this.rainT -= dt;
      if (this.rainT <= 0 || this.left <= 1e-6) {
        this.rainT = 0.22;
        const a = Math.round(this.rainPool); this.rainPool = 0;
        this.parts.rain += a; this.won += a;
        this.emit('rain', { amount: a });
      }
    }
    const dragonLeft = (this.dragon && !this.dragonDone) || (this.egg && (this.egg.alive || this.eggPending)) || this.specials.some(q => q.pending || (q.f && q.f.alive) || (!q.f && this.left > 1e-6));
    if (this.left <= 1e-6 && !this.shells.length && !dragonLeft && this.rainPool <= 0) {
      this.endT = (this.endT ?? 0.9) - dt;
      if (this.endT <= 0) this.end('done');
    }
  }
  end(reason) { if (this.over) return; this.over = true; this.emit('bonusEnd', { reason }); }

  // the cannon tracks the bigger fish, switching often (the dragon is handled per volley)
  lockTarget() {
    const cur = this.fish.find(f => f.id === this.lockId);
    if (cur && this.inArea(cur) && this.t - this.lockAt < 0.6) return cur;
    const c = this.fish.filter(f => this.inArea(f) && !f.boss && !f.special && f.z < this.cz - AREA.near - 2);
    if (!c.length) { this.lockId = 0; return null; }
    const f = this.rng.weighted(c.map(q => ({ q, w: Math.pow(q.mult, 0.8) * (q.id === this.lockId ? 0.3 : 1) }))).q;
    this.lockId = f.id; this.lockAt = this.t;
    return f;
  }

  updateCannon(dt) {
    if (this.hold) return;
    const tgt = this.lockTarget();
    if (tgt) {
      const want = Math.atan2(tgt.x - this.cx, -(tgt.z - this.cz));
      this.angle += clamp(want - this.angle, -12 * dt, 12 * dt);
    }
    if (this.left <= 1e-6) { this.finalShot(); return; }
    this.fireT -= dt;
    let guard = 0;
    while (this.fireT <= 0 && this.left > 1e-6 && guard++ < 4) {
      this.fireT += this.interval;
      const w = Math.min(this.w, this.left);
      this.left = Math.max(0, this.left - w);
      this.volley(w, tgt);
    }
  }

  volley(w, tgt) {
    const sk = this.skills;
    const done = this.stats.shots / this.visual;
    for (const S of this.specials) if (!S.f && done >= S.at) {
      const zc = this.cz - (AREA.far + AREA.near) / 2, dir = S.type === 'zhangyu' ? -1 : 1;
      const f = S.f = this.spawn(S.type, { dir, loop: true, path: { ax: -dir * (AREA.hw + 3), az: zc + 2, bx: dir * (AREA.hw + 3), bz: zc - 2 } });
      f.special = FISH[S.type].special; f.s = 0.18;
      this.emit('specialIn', { f });
    }
    const S = this.specials.find(q => q.f && q.f.alive && this.inArea(q.f));
    if (S && this.stats.shots % 3 === 2) tgt = S.f;
    // every third volley goes at the dragon while it swims, another third at the egg
    if (this.dragon && !this.dragonDone && this.inArea(this.dragon) && this.stats.shots % 3 === 0) tgt = this.dragon;
    if (this.egg && this.egg.alive && this.stats.shots % 3 === 1) {
      const e = this.egg, a = Math.atan2(e.x - this.cx, -(e.z - this.cz)) + (this.rng.next() - 0.5) * 0.08;
      this.shells.push({ x: this.cx + Math.sin(a) * 3.6, y: 1.4, z: this.cz - Math.cos(a) * 3.6, vx: Math.sin(a) * SHELL_V, vz: -Math.cos(a) * SHELL_V, target: 0, egg: true, w, t: 0, pierce: 0, hitIds: [], s: 1.2, col: [1, 0.62, 0.12] });
      this.stats.shots++;
      this.emit('shoot', { w });
      return;
    }
    const lines = sk.double ? [-0.42, 0.42] : [0];
    const fan = sk.spread ? [-0.3, 0, 0.3] : [0];
    const s = 1 + Math.min(0.9, Math.log10(Math.max(1, w)) * 0.55);
    for (const off of lines) for (const f of fan) {
      const a = this.angle + f + (this.rng.next() - 0.5) * 0.06;
      const dx = Math.sin(a), dz = -Math.cos(a);
      const px = Math.cos(this.angle) * off, pz = Math.sin(this.angle) * off;
      // every shell seeks a fish (the centre one the locked target, side ones whatever lies along their line);
      // 瞄准 makes the centre shells catch more often
      const x0 = this.cx + dx * 3.6 + px, z0 = this.cz + dz * 3.6 + pz;
      const seek = f === 0 && tgt ? tgt : this.alongLine(x0, z0, dx, dz);
      this.shells.push({ x: x0, y: 1.4, z: z0, vx: dx * SHELL_V, vz: dz * SHELL_V,
        target: seek ? seek.id : 0, aimed: f === 0 && !!tgt && !!sk.aim, w, t: 0, pierce: sk.pierce ? 2 : 0, hitIds: [], s, col: sk.pierce ? [0.4, 1, 1] : [1, 0.62, 0.12] });
    }
    if (this.rain) this.rainPool += SHOT * w * this.k * RAIN_K;
    this.stats.shots++;
    // the skill bar fills with the volley; in the bonus the laser fires by itself
    if (this.laserOn && ++this.charge >= this.chargeMax) { this.charge = 0; this.bonusLaser(w); }
    this.emit('shoot', { w });
  }

  bonusLaser(w) {
    const hits = [];
    for (const f of this.fish) {
      if (!this.inArea(f) || f.boss || f.special) continue;
      hits.push(f);
      this.killFish(f, w * 2);
    }
    this.emit('laser', { hits });
  }

  // the fish closest to a shell's flight line, in front of it
  alongLine(x, z, dx, dz, skip) {
    let best = null, bd = 3.2;
    for (const f of this.fish) {
      if (!this.inArea(f) || f.boss || (skip && skip.includes(f.id))) continue;
      const rx = f.x - x, rz = f.z - z, along = rx * dx + rz * dz;
      if (along < 1) continue;
      const off = Math.abs(rx * dz - rz * dx);
      if (off < bd) { bd = off; best = f; }
    }
    return best;
  }

  // out of shells with the dragon still swimming: one last big shell that always finishes it
  finalShot() {
    const S = this.specials.find(q => q.f && q.f.alive && !q.finalOut && this.inArea(q.f));
    if (S) {
      S.finalOut = true;
      const f = S.f, a = Math.atan2(f.x - this.cx, -(f.z - this.cz));
      this.shells.push({ x: this.cx, y: 1.6, z: this.cz - 3.6, vx: Math.sin(a) * SHELL_V, vz: -Math.cos(a) * SHELL_V, target: f.id, w: 0, t: 0, pierce: 0, hitIds: [], s: 2.4, final: true, col: [0.5, 0.9, 1] });
      this.emit('finalShot', { f, special: true });
      return;
    }
    if (this.egg && this.egg.alive && !this.eggFinal) {
      this.eggFinal = true;
      const e = this.egg, a = Math.atan2(e.x - this.cx, -(e.z - this.cz));
      this.shells.push({ x: this.cx, y: 1.6, z: this.cz - 3.6, vx: Math.sin(a) * SHELL_V, vz: -Math.cos(a) * SHELL_V, target: 0, egg: true, final: true, w: 0, t: 0, pierce: 0, hitIds: [], s: 2.6, col: [1, 0.35, 0.15] });
      this.emit('finalShot', { egg: true });
      return;
    }
    if (!this.dragon || this.dragonDone || this.finalOut || !this.inArea(this.dragon)) return;
    this.finalOut = true;
    const f = this.dragon, a = Math.atan2(f.x - this.cx, -(f.z - this.cz));
    this.shells.push({ x: this.cx, y: 1.6, z: this.cz - 3.6, vx: Math.sin(a) * SHELL_V, vz: -Math.cos(a) * SHELL_V, target: f.id, w: 0, t: 0, pierce: 0, hitIds: [], s: 2.6, final: true, col: [1, 0.35, 0.15] });
    this.emit('finalShot', { f });
  }

  moveShells(list, dt) {
    const keep = [];
    for (const b of list) {
      b.t += dt;
      if (b.target) {
        const f = this.fish.find(q => q.id === b.target && q.alive);
        if (f) { const dx = f.x - b.x, dz = f.z - b.z, d = Math.hypot(dx, dz) || 1; b.vx = dx / d * SHELL_V; b.vz = dz / d * SHELL_V; }
        else {
          // the target died first: pick the next fish along the way
          const v = Math.hypot(b.vx, b.vz) || 1, n = b.final ? null : this.alongLine(b.x, b.z, b.vx / v, b.vz / v, b.hitIds);
          b.target = n ? n.id : 0;
        }
      }
      if (b.egg) {
        const e = this.egg;
        if (!e || !e.alive) continue;
        const dx = e.x - b.x, dz = e.z - b.z, d = Math.hypot(dx, dz) || 1;
        b.vx = dx / d * SHELL_V; b.vz = dz / d * SHELL_V;
        b.x += b.vx * dt; b.z += b.vz * dt; b.y = Math.max(0.6, b.y - dt * 0.6);
        if (d < e.r) { this.hitEgg(b); continue; }
        keep.push(b); continue;
      }
      b.x += b.vx * dt; b.z += b.vz * dt;
      b.y = Math.max(0.2, b.y - dt * 1.2);
      if (b.t > 2.4 || Math.abs(b.x) > AREA.hw + 4 || b.z < this.cz - AREA.far - 6 || b.z > this.cz + 2) continue;
      let gone = false;
      for (const f of this.fish) {
        if (!f.alive || b.hitIds.includes(f.id)) continue;
        if (b.target && f.id !== b.target) continue;
        const r = f.size * (f.boss ? 0.42 : 0.6) + 0.35;
        if ((f.x - b.x) ** 2 + (f.z - b.z) ** 2 >= r * r) continue;
        b.hitIds.push(f.id);
        this.hit(f, b);
        // 穿透: the shell keeps flying through to the next fish
        if (b.pierce > 0 && !f.boss) {
          b.pierce--;
          const v = Math.hypot(b.vx, b.vz) || 1, n = this.alongLine(b.x, b.z, b.vx / v, b.vz / v, b.hitIds);
          b.target = n ? n.id : 0;
          continue;
        }
        gone = true; break;
      }
      if (!gone) keep.push(b);
    }
    return keep;
  }

  hit(f, b) {
    f.hits++; f.flash = 0.08;
    this.emit('net', { x: b.x, z: b.z, f, w: b.w });
    if (f.special) {
      const S = this.specials.find(q => q.f === f);
      if (S && (b.final || ++S.hits >= S.need)) { f.alive = false; f.dying = 0; this.specialDie(S, b.w || this.w); }
      return;
    }
    if (f.boss) {
      this.dragonHits++;
      this.emit('dragonHit', { f, k: Math.min(1, this.dragonHits / this.dragonNeed) });
      if (b.final || this.dragonHits >= this.dragonNeed) { f.alive = false; f.dying = 0; this.dragonDone = true; this.emit('bossBurst', { f }); }
      return;
    }
    const p = Math.min(0.9, (b.aimed ? 1.7 : 1.2) / f.mult);
    if (this.rng.next() < p) this.killFish(f, b.w);
  }

  killFish(f, w) {
    f.alive = false; f.dying = 0;
    if (f.id === this.lockId) this.lockId = 0;
    const luck = this.skills.lucky ? this.rng.weighted(LUCK).m : 1;
    const win = Math.round(SHOT * f.mult * w * this.k * luck);
    this.won += win; this.parts.fish += win;
    if (luck > 1) this.parts.lucky += win - Math.round(win / luck);
    this.stats.kills++;
    this.emit('catch', { f, win, mult: f.mult, luck, w });
  }

  // 海鳗 chains through the fish around it right away; 章鱼's chests wait for the player (resolveSpecial)
  specialDie(S, w) {
    const f = S.f, kind = f.special;
    if (kind === 'chain') {
      const R = SPECIALS.chain;
      const list = this.fish.filter(o => o.alive && o !== f && !o.boss && !o.special && this.inArea(o) && Math.hypot(o.x - f.x, o.z - f.z) < R.radius)
        .sort((a, b) => Math.hypot(a.x - f.x, a.z - f.z) - Math.hypot(b.x - f.x, b.z - f.z)).slice(0, R.links);
      const before = this.won;
      const base = Math.round(SHOT * (f.mult || 20) * this.k * Math.max(1, this.shots / 25));
      this.won += base; this.parts.special += base;
      for (const o of list) this.killFish(o, w * 3);
      this.emit('chain', { f, list, win: this.won - before, base });
    } else {
      S.pending = true;
      this.emit('special', { f, kind });
    }
  }
  resolveSpecial(m) {
    const win = Math.round(SHOT * m * this.k * Math.max(1, this.shots / 25));
    this.won += win; this.parts.special += win;
    for (const S of this.specials) S.pending = false;
    return win;
  }

  // the dragon is worth m times a slice of the whole volley, so it always beats the shells around it
  resolveDragon(m) {
    const win = Math.round(SHOT * m * this.k * Math.max(1, this.shots / 25));
    this.won += win; this.parts.dragon += win;
    return win;
  }
}
