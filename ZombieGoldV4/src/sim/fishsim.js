// 渔场 simulation (the stand-in for the 2-player fishing game): fish paths, cannon fire, hit judgement,
// payouts. Pure state + events. BonusSim extends it for the free bonus cannon.
import { FISH, SHOT, WHEEL, WHEEL_MEAN } from '../content/levels.js';
import { clamp } from './util.js';
import { Rng } from './rng.js';
import { SPECIALS, critMult } from '../content/specials.js';

export const AREA = { hw: 7.6, near: 3.5, far: 29 };   // the pond relative to the cannon: x ∈ ±hw, z ∈ [-far, -near]
// the 海豹魔术师's average multiple in its real config: 57% ×50, 43% four fish cards summed × a ratio card
export const MAGIC_MEAN = 376;
const SHELL_V = 40;
const FIRE_RATE = 4.2;

export class FishSim {
  // ctx: { platZ, wallet }. The last argument, { seed, rng }, sets where the session's random numbers come from:
  // this.rng is used for every draw (a new Rng(seed), freshly seeded when both are left out)
  constructor(cfg, ctx, emit, { seed, rng } = {}) {
    this.cfg = cfg; this.emit = emit;
    this.rng = rng || new Rng(seed);
    this.cx = 0; this.cz = ctx.platZ;            // cannon position
    this.wallet = ctx.wallet;                    // object with .get/.spend/.add
    this.bets = cfg.bets || [1];
    this.bet = this.bets[0];
    this.fish = []; this.shells = []; this.pshells = [];
    this.t = 0; this.spawnT = 0.2; this.fireT = 0;
    this.auto = true; this.lockId = 0; this.lockAt = 0; this.manualLock = false; this.aiming = false; this.aim = { x: 0, z: this.cz - 20 };
    this.angle = 0;
    this.nextId = 1;
    this.over = false; this.paused = false;
    this.bossesLeft = cfg.bosses || 1;
    this.bossSpawned = 0;
    this.pityHits = 0;
    this.stats = { spent: 0, won: 0, shots: 0, kills: 0, best: 0, bestWin: 0, bossWins: [] };
    this.events = [];
    if (cfg.partner) this.partner = { angle: Math.PI, cd: 0.8, tgt: null, re: 0, bet: 2, won: 0 };
    this.cycleAt = 0; this.nextBoss = cfg.bossAt ?? Infinity; this.nextMagic = cfg.magicAt ?? Infinity; this.magicHits = 0;
    // every shot charges the skill bar; when it is full the player can fire a full-screen laser
    this.charge = 0; this.chargeMax = cfg.chargeMax || 30; this.chargeReady = false;
    this.laserOn = cfg.laser !== false;      // a lab switch, off by default (too much at once for a new player)
    this.freeShots = 0;          // 免费子弹卡
    this.crit = null;            // 海王狩猎: { t, total, n, bet } while every catch is a critical
    this.lockT = 0;              // 锁定卡: the locked fish is caught more often for a while
    this.fill(this.baseCount());
  }
  baseCount() { return this.cfg.count || (this.cfg.dense ? 14 : 10); }

  get timeLeft() { return this.cfg.open ? Infinity : Math.max(0, this.cfg.time - this.t); }
  get canNet() { return !!this.cfg.open && this.t >= (this.cfg.minOpen || 0); }
  shotCost() { return SHOT * this.bet; }

  // ---------------------------------------------------------------- spawning
  fill(n) { for (let i = 0; i < n; i++) this.spawn(this.pickType(), { inside: true }); }
  pickType() {
    const items = this.cfg.types.map(t => ({ t, w: FISH[t].w }));
    return this.rng.weighted(items).t;
  }
  spawn(type, o = {}) {
    const F = FISH[type];
    const z0 = this.cz - AREA.far, z1 = this.cz - AREA.near;
    const dir = o.dir ?? (this.rng.next() < 0.5 ? 1 : -1);
    const hw = AREA.hw + F.size + 1.5;
    let ax, az, bx, bz;
    if (o.path) ({ ax, az, bx, bz } = o.path);
    else {
      const zA = this.rng.range(z0 + 2, z1 - 2), zB = clamp(zA + this.rng.range(-10, 10), z0 + 2, z1 - 2);
      ax = -dir * hw; bx = dir * hw; az = zA; bz = zB;
      if (this.rng.next() < 0.25 && type !== 'boss') { ax = this.rng.range(-AREA.hw + 1, AREA.hw - 1); az = z0 - F.size - 2; bx = clamp(ax + this.rng.range(-8, 8), -AREA.hw, AREA.hw); bz = z1 + 2; }
    }
    const len = Math.hypot(bx - ax, bz - az);
    const f = {
      id: this.nextId++, type, F, mult: F.mult, size: F.size * (o.scale || 1),
      ax, az, bx, bz, len, s: o.inside ? this.rng.range(0.1, 0.8) : 0, speed: F.speed * this.rng.range(0.85, 1.15) * (o.speedK || 1),
      wob: this.rng.range(1.5, 3) * (type === 'boss' ? 0.6 : 1), wobA: type === 'boss' ? 2.2 : this.rng.range(0.3, 1.4), ph: this.rng.range(0, 6),
      x: ax, z: az, heading: 0, alive: true, dying: 0, hits: 0, flash: 0, boss: type === 'boss', loop: !!o.loop,
    };
    this.fish.push(f);
    return f;
  }
  spawnBoss() {
    this.bossSpawned++;
    this.pityHits = 0;
    const second = this.bossSpawned === 2;
    const dir = second ? -1 : 1;
    const loop = !!this.cfg.endOnBoss;
    const zc = this.cz - (AREA.far + AREA.near) / 2;
    const f = this.spawn('boss', { dir, loop, path: { ax: -dir * (AREA.hw + 4), az: zc + (second ? 6 : -4), bx: dir * (AREA.hw + 4), bz: zc + (second ? -2 : 4) } });
    if (this.cfg.boss.fixed) f.mult = this.cfg.boss.fixed;
    if (this.cfg.script === 'missThenWin') { if (this.bossSpawned === 1) f.escape = true; else f.sure = 16; }
    this.emit('bossIn', { f, second });
  }
  spawnMagic() {
    const dir = this.rng.next() < 0.5 ? 1 : -1, zc = this.cz - (AREA.far + AREA.near) / 2;
    const f = this.spawn('magic', { dir, loop: true, path: { ax: -dir * (AREA.hw + 4), az: zc - 2, bx: dir * (AREA.hw + 4), bz: zc + 3 } });
    f.magic = true; f.loops = 2;
    this.emit('magicIn', { f });
  }
  // a special fish crosses the middle of the pond (loop: it stays until it is caught or has crossed twice)
  spawnSpecial(type, o = {}) {
    const dir = this.rng.next() < 0.5 ? 1 : -1, zc = this.cz - (AREA.far + AREA.near) / 2;
    const f = this.spawn(type, { dir, loop: true, path: { ax: -dir * (AREA.hw + 3), az: zc + this.rng.range(-5, 3), bx: dir * (AREA.hw + 3), bz: zc + this.rng.range(-3, 5) }, ...o });
    f.special = FISH[type].special; f.loops = o.loops ?? 1;
    this.emit('specialIn', { f });
    return f;
  }
  spawnTide() {
    const dir = this.rng.next() < 0.5 ? 1 : -1;
    const zc = this.cz - (AREA.far + AREA.near) / 2;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) {
      const type = r === 1 ? 'redai' : 'huang';
      const z = zc + (r - 1) * 4.5;
      this.spawn(type, { dir, speedK: 1.1, path: { ax: -dir * (AREA.hw + 3 + c * 2.2), az: z, bx: dir * (AREA.hw + 3 + 14 - c * 2.2), bz: z } });
    }
    this.emit('tide', {});
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    if (this.over || this.paused) return;
    this.t += dt;
    const cfg = this.cfg;
    // timed events. Open sessions repeat them: a boss every bossEvery seconds, sharks / bombs / tides every cycle.
    if (cfg.bossEvery) {
      if (this.t >= this.nextBoss && !this.fish.some(f => f.boss && f.alive)) { this.spawnBoss(); this.nextBoss = this.t + cfg.bossEvery; }
    } else if (this.bossSpawned < (cfg.bosses || 1) && this.t >= cfg.bossAt + (this.bossSpawned ? 2.5 : 0)) this.spawnBoss();
    if (cfg.cycle && this.t - this.cycleAt >= cfg.cycle) {
      this.cycleAt += cfg.cycle;
      this.sharkDone = this.shark2 = this.tideDone = false;
      for (const bt of cfg.bomb || []) this['bomb' + bt] = false;
      for (const [, k] of cfg.specials || []) this['sp_' + k] = false;
    }
    const ct = this.t - this.cycleAt;
    if (cfg.shark && !this.sharkDone && ct >= cfg.shark) { this.sharkDone = true; this.spawn('shark'); this.emit('sharkIn', {}); }
    if (cfg.shark && this.sharkDone && ct >= cfg.shark + 22 && !this.shark2) { this.shark2 = true; this.spawn('shark'); }
    if (cfg.bomb) for (const bt of cfg.bomb) { const k = 'bomb' + bt; if (!this[k] && ct >= bt) { this[k] = true; this.spawn('bomb'); } }
    if (cfg.tide && !this.tideDone && ct >= cfg.tide) { this.tideDone = true; this.spawnTide(); }
    for (const [at, k] of cfg.specials || []) if (!this['sp_' + k] && ct >= at) { this['sp_' + k] = true; this.spawnSpecial(k); }
    if (this.crit) { this.crit.t -= dt; if (this.crit.t <= 0) { const c = this.crit; this.crit = null; this.emit('critEnd', { total: c.total, n: c.n }); } }
    // 海豹魔术师 (the real 二人捕鱼 special fish): crosses the pond now and then; a capture deals the cards
    if (this.t >= this.nextMagic && !this.fish.some(f => f.magic && f.alive)) { this.spawnMagic(); this.nextMagic = this.t + (cfg.magicEvery || 75); }
    const target = this.baseCount() + Math.floor(Math.min(this.t, 30) / 10);
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.fish.filter(f => f.alive && !f.boss).length < target) { this.spawnT = this.rng.range(0.35, 0.8); this.spawn(this.pickType()); }

    for (const f of this.fish) {
      if (!f.alive) { f.dying += dt; continue; }
      f.flash = Math.max(0, f.flash - dt);
      f.s += (f.speed / f.len) * dt;
      if (f.s >= 1) {
        if (f.loop && f.loops !== undefined && --f.loops < 0) { f.alive = false; f.gone = true; this.emit(f.special ? 'specialOut' : 'magicOut', { f }); continue; }
        if (f.loop) { [f.ax, f.bx] = [f.bx, f.ax]; [f.az, f.bz] = [f.bz + this.rng.range(-4, 4), f.az + this.rng.range(-4, 4)]; f.s = 0; f.len = Math.hypot(f.bx - f.ax, f.bz - f.az); }
        else { f.alive = false; f.gone = true; if (f.boss) this.emit('bossOut', { f }); continue; }
      }
      const px = f.ax + (f.bx - f.ax) * f.s, pz = f.az + (f.bz - f.az) * f.s;
      const nx = -(f.bz - f.az) / f.len, nz = (f.bx - f.ax) / f.len;
      const w = Math.sin(f.s * Math.PI * f.wob + f.ph) * f.wobA;
      const x = px + nx * w, z = pz + nz * w;
      if (Math.hypot(x - f.x, z - f.z) > 1e-4) f.heading = Math.atan2(-(z - f.z), x - f.x);
      f.x = x; f.z = z;
    }
    this.fish = this.fish.filter(f => !f.gone && (f.alive || f.dying < 1.2));

    this.lockT = Math.max(0, this.lockT - dt);
    this.updateCannon(dt);
    this.shells = this.moveShells(this.shells, dt);
    if (this.partner) { this.updatePartner(dt); this.pshells = this.moveShells(this.pshells, dt); }

    if (!cfg.open && cfg.time && this.t >= cfg.time) this.end('time');
  }

  end(reason) { if (this.over) return; this.over = true; this.emit('fishEnd', { reason }); }

  inArea(f) { return f.alive && Math.abs(f.x) < AREA.hw + 0.5 && f.z < this.cz - AREA.near + 0.5 && f.z > this.cz - AREA.far - 1; }

  // Auto targeting: the boss (or a special fish, or the 海豹魔术师) whenever it is on screen — that is the climax;
  // otherwise rotate through fish weighted toward bigger multipliers, so coins keep coming in between the big moments.
  // cfg.onlyMagic (the lab's 魔术师捕鱼关): the auto cannon waits for the magician and shoots nothing else.
  lockTarget() {
    const cur = this.fish.find(f => f.id === this.lockId);
    const big = f => f.boss || f.special || f.magic;
    const boss = this.fish.find(f => (this.cfg.onlyMagic ? f.magic : big(f)) && this.inArea(f));
    if (cur && this.inArea(cur)) {
      if (this.manualLock || big(cur)) return cur;
      if (!(this.auto && boss) && this.t - this.lockAt < 2.4) return cur;
    }
    this.manualLock = false;
    if (!this.auto) { this.lockId = 0; return null; }
    let pickF = boss;
    if (!pickF && this.cfg.onlyMagic) { this.lockId = 0; return null; }
    if (!pickF) {
      const c = this.fish.filter(f => this.inArea(f) && f.z < this.cz - AREA.near - 1);
      if (!c.length) { this.lockId = 0; return null; }
      const items = c.map(f => ({ f, w: Math.pow(f.mult, 0.6) * (f.id === this.lockId ? 0.2 : 1) }));
      pickF = this.rng.weighted(items).f;
    }
    this.lockId = pickF.id; this.lockAt = this.t;
    return pickF;
  }

  updateCannon(dt) {
    if (this.hold) return;
    this.fireT -= dt;
    let tx = null, tz = null, tgt = null;
    if (this.aiming) { tx = this.aim.x; tz = this.aim.z; }
    else { tgt = this.lockTarget(); if (tgt) { tx = tgt.x; tz = tgt.z; } }
    if (tx === null) return;
    const want = Math.atan2(tx - this.cx, -(tz - this.cz));
    this.angle += clamp(want - this.angle, -10 * dt, 10 * dt);
    if (this.fireT > 0) return;
    const free = this.freeShots > 0 || !!this.crit;
    const cost = free ? 0 : this.shotCost();
    if (this.wallet.get() < cost) { if (!this.broke) { this.broke = true; this.emit('broke', {}); } this.fireT = 0.25; return; }
    if (this.broke) { this.broke = false; this.emit('unbroke', {}); }
    this.fireT = 1 / (FIRE_RATE * (this.crit ? 2 : 1));
    if (free && !this.crit) this.freeShots--;
    this.wallet.spend(cost);
    this.stats.spent += cost; this.stats.shots++;
    if (this.laserOn && !this.chargeReady && ++this.charge >= this.chargeMax) { this.chargeReady = true; this.emit('chargeFull', {}); }
    const dx = Math.sin(this.angle), dz = -Math.cos(this.angle);
    const sx = this.cx + dx * 3.6, sz = this.cz + dz * 3.6;
    this.shells.push({ x: sx, y: 1.4, z: sz, vx: dx * SHELL_V, vz: dz * SHELL_V, target: tgt ? tgt.id : 0, bet: this.bet, alive: true, t: 0 });
    this.emit('shoot', { x: sx, z: sz, angle: this.angle, cost });
  }

  moveShells(list, dt) {
    const keep = [];
    for (const b of list) {
      b.t += dt;
      if (b.target) {
        const f = this.fish.find(q => q.id === b.target && q.alive);
        if (f) { const dx = f.x - b.x, dz = f.z - b.z, d = Math.hypot(dx, dz) || 1; b.vx = dx / d * SHELL_V; b.vz = dz / d * SHELL_V; }
        else b.target = 0;
      }
      b.x += b.vx * dt; b.z += b.vz * dt;
      b.y = Math.max(0.2, b.y - dt * 1.2);
      if (b.t > 2.2 || Math.abs(b.x) > AREA.hw + 4 || b.z < this.cz - AREA.far - 6 || b.z > this.cz + 2) continue;
      let hit = null;
      for (const f of this.fish) {
        if (!f.alive) continue;
        if (b.target && f.id !== b.target) continue;
        const r = f.size * (f.boss || f.magic ? 0.42 : 0.6) + 0.3;
        if ((f.x - b.x) ** 2 + (f.z - b.z) ** 2 < r * r) { hit = f; break; }
      }
      if (hit) this.hit(hit, b); else keep.push(b);
    }
    return keep;
  }

  killChance(f, bet) {
    const rtp = this.cfg.rtp;
    // the bet never enters the odds: it only scales cost and payout
    if (f.boss) return f.mult ? rtp / f.mult : rtp / WHEEL_MEAN;
    if (f.magic) return rtp / MAGIC_MEAN;
    if (f.special) return rtp / SPECIALS[f.special].E;
    if (f.type === 'bomb') return rtp / (f.mult + 12);
    return Math.min(0.92, rtp / f.mult);
  }

  hit(f, b) {
    f.hits++; f.flash = 0.08;
    this.emit('net', { x: b.x, z: b.z, f, partner: b.partner });
    if (b.partner) { if (this.rng.next() < this.killChance(f, b.bet)) this.kill(f, b.bet, true); return; }
    let p = this.killChance(f, b.bet);
    if (this.lockT > 0 && f.id === this.lockId) p = Math.min(0.95, p * 1.6);
    if (f.magic) {
      // demo pity: the magician never takes more than about 60 hits, so a session gets to see the cards
      if (++this.magicHits >= (this.cfg.magicPity || 60)) p = 1;
    } else if (f.special) {
      // demo pity: a special fish never takes more than about 24 hits, so its 爆分 is seen
      if (f.hits >= (this.cfg.specialPity || 24)) p = 1;
    } else if (f.boss) {
      this.pityHits++;
      if (this.cfg.pity && this.pityHits >= this.cfg.pity) p = 1;
      // a scripted first boss (lessons): it gets away, so the next one, which always bursts, is a relief
      if (this.cfg.script === 'missThenWin' && f.escape) p = 0;
      if (f.sure && this.pityHits >= f.sure) p = 1;
    } else if (f.mult >= 12) {
      // big fish: never on the first two hits, always by about 1.3 times the expected number of hits
      if (f.hits < 3) p = 0;
      else if (f.hits >= Math.ceil(1.3 / Math.max(0.01, p))) p = 1;
    }
    if (this.rng.next() < p) this.kill(f, b.bet, false);
    // the net also sweeps small fish around the impact point, so a shot aimed at a big fish still pays now and then
    const R = 1.9;
    for (const o of this.fish) {
      if (o === f || !o.alive || o.boss || o.magic || o.mult > 12) continue;
      if ((o.x - b.x) ** 2 + (o.z - b.z) ** 2 > R * R) continue;
      if (this.rng.next() < this.killChance(o, b.bet) * 0.5) this.kill(o, b.bet, false);
    }
  }

  kill(f, bet, partner) {
    f.alive = false; f.dying = 0;
    if (f.id === this.lockId) this.lockId = 0;
    if (f.magic) {
      if (partner) { this.emit('partnerMagic', { f, win: SHOT * bet * 50 }); return; }
      this.magicHits = 0;
      this.emit('magicBurst', { f, bet });
      return;
    }
    if (f.special) {
      if (partner) { const w = SHOT * bet * 30; this.partner.won += w; this.emit('partnerCatch', { f, win: w }); return; }
      this.killSpecial(f, bet);
      return;
    }
    if (f.boss) {
      if (partner) { const m = this.rng.weighted(WHEEL).m; this.emit('partnerBoss', { f, mult: m, win: SHOT * bet * m }); return; }
      this.pityHits = 0;
      this.bossesLeft--;
      this.emit('bossBurst', { f, bet, fixed: f.mult || 0 });
      return;
    }
    let win = SHOT * bet * f.mult;
    if (partner) { this.partner.won += win; this.emit('partnerCatch', { f, win }); return; }
    // 海王狩猎: every catch is a critical
    let crit = 0;
    if (this.crit) { crit = critMult(this.rng); win *= crit; this.crit.total += win; this.crit.n++; }
    this.payout(win, f.mult * (crit || 1), bet, f.F.name + (crit ? ' 暴击' : ''));
    this.stats.kills++;
    this.emit('catch', { f, win, mult: f.mult, bet, crit });
    if (f.type === 'bomb') {
      const near = this.fish.filter(o => o.alive && !o.boss && o !== f && Math.hypot(o.x - f.x, o.z - f.z) < 6.5);
      this.emit('bomb', { f, n: near.length });
      for (const o of near) { o.alive = false; o.dying = 0; const w = SHOT * bet * o.mult; this.payout(w, o.mult, bet); this.stats.kills++; this.emit('catch', { f: o, win: w, mult: o.mult, bet, chain: true }); }
    }
  }

  // special fish: 海鳗 and 海王蟹 play out here; 章鱼, 醒狮王 and 财神爷 hand over to the game (resolveSpecial)
  killSpecial(f, bet) {
    const S = SPECIALS[f.special];
    if (f.special === 'chain') {
      let total = 0;
      if (f.mult) { total += SHOT * bet * f.mult; this.payout(SHOT * bet * f.mult, f.mult, bet); }
      const list = this.fish.filter(o => o.alive && o !== f && !o.boss && !o.magic && !o.special && this.inArea(o) && Math.hypot(o.x - f.x, o.z - f.z) < S.radius)
        .sort((a, b) => Math.hypot(a.x - f.x, a.z - f.z) - Math.hypot(b.x - f.x, b.z - f.z)).slice(0, S.links);
      for (const o of list) {
        o.alive = false; o.dying = 0;
        const w = SHOT * bet * o.mult; total += w;
        this.payout(w, o.mult, bet); this.stats.kills++;
        this.emit('catch', { f: o, win: w, mult: o.mult, bet, chain: true });
      }
      this.stats.bossWins.push({ mult: Math.round(total / (SHOT * bet)), bet, win: total, special: 'chain' });
      if (total > this.stats.bestWin) { this.stats.bestWin = total; this.stats.bestName = '电击怪连锁'; this.stats.bestMult = Math.round(total / (SHOT * bet)); }
      this.emit('chain', { f, list, win: total, bet });
    } else if (f.special === 'crit') {
      const w = SHOT * bet * (f.mult || 30);
      this.payout(w, f.mult, bet);
      this.crit = { t: S.dur, total: w, n: 0, bet };
      this.emit('critStart', { f, win: w, bet });
    } else this.emit('special', { f, kind: f.special, bet });
  }
  resolveSpecial(mult, bet, kind) {
    const win = SHOT * bet * mult;
    this.payout(win, mult, bet, { chest: '爆破宝箱', lion: '雪怪步步高', ingot: '运钞元宝' }[kind] || '');
    this.stats.bossWins.push({ mult, bet, win, special: kind });
    return win;
  }

  payout(win, mult, bet, name = '') {
    this.wallet.add(win);
    this.stats.won += win;
    this.stats.best = Math.max(this.stats.best, mult * bet);
    if (win > this.stats.bestWin) { this.stats.bestWin = win; this.stats.bestName = name; this.stats.bestMult = mult; }
  }

  resolveMagic(reward, multiple, bet) {
    this.payout(reward, multiple, bet, '宝箱怪');
    this.stats.bossWins.push({ mult: multiple, bet, win: reward, magic: true });
    return reward;
  }
  resolveBoss(mult, bet) {
    const win = SHOT * bet * mult;
    this.payout(win, mult, bet, '黄金机甲');
    this.stats.bossWins.push({ mult, bet, win });
    if (this.cfg.endOnBoss && this.bossesLeft <= 0) this.endSoon = 1.6;
    return win;
  }

  tickEnd(dt) {
    if (this.endSoon !== undefined && !this.over && !this.paused) { this.endSoon -= dt; if (this.endSoon <= 0) this.end('boss'); }
  }

  updatePartner(dt) {
    const p = this.partner;
    const ox = 0, oz = this.cz - AREA.far - 1.5;
    p.re -= dt;
    if (!p.tgt || !p.tgt.alive || p.re <= 0) {
      const c = this.fish.filter(f => this.inArea(f));
      p.tgt = c.length ? (this.rng.next() < 0.3 ? c.reduce((a, f) => (f.mult > a.mult || f.boss ? f : a), c[0]) : this.rng.pick(c)) : null;
      p.re = this.rng.range(1.2, 2.4); p.bet = this.rng.pick([1, 2, 2, 5]);
    }
    if (!p.tgt) return;
    const want = Math.atan2(p.tgt.x - ox, -(p.tgt.z - oz));
    p.angle += clamp(want - p.angle, -8 * dt, 8 * dt);
    p.cd -= dt;
    if (p.cd <= 0) {
      p.cd = 1 / 3.4;
      const dx = Math.sin(p.angle), dz = -Math.cos(p.angle);
      this.pshells.push({ x: ox + dx * 2.2, y: 1.4, z: oz + dz * 2.2, vx: dx * SHELL_V, vz: dz * SHELL_V, target: p.tgt.id, bet: p.bet, partner: true, t: 0 });
    }
  }

  // 全屏激光 (the charged skill): every ordinary fish on screen is caught, the big ones take a heavy hit
  laser() {
    if (!this.chargeReady) return false;
    this.chargeReady = false; this.charge = 0;
    const hits = [];
    for (const f of this.fish) {
      if (!this.inArea(f)) continue;
      hits.push(f);
      if (f.boss) { this.pityHits += 12; f.hits += 12; continue; }
      if (f.mult <= 20 || this.rng.next() < this.killChance(f, this.bet) * 3) this.kill(f, this.bet, false);
    }
    this.emit('laser', { hits });
    return true;
  }
  // 鱼雷: the biggest ordinary fish on screen is caught for sure; against a boss it is worth many hits
  torpedo() {
    const c = this.fish.filter(f => this.inArea(f));
    if (!c.length) return false;
    const big = c.filter(f => !f.boss).sort((a, b) => b.mult - a.mult)[0];
    const boss = c.find(f => f.boss);
    const f = big || boss;
    this.emit('torpedo', { f });
    if (f.boss) { this.pityHits += 30; if (!f.escape && (this.rng.next() < 0.4 || (this.cfg.pity && this.pityHits >= this.cfg.pity))) this.kill(f, this.bet, false); }
    else this.kill(f, this.bet, false);
    return true;
  }

  setBet(b) { if (this.bets.includes(b)) { this.bet = b; this.emit('bet', { bet: b }); } }
  stepBet(d) { const i = this.bets.indexOf(this.bet); const j = clamp(i + d, 0, this.bets.length - 1); this.setBet(this.bets[j]); }
  tapAt(x, z) {
    let best = null, bd = 1e9;
    for (const f of this.fish) { if (!this.inArea(f)) continue; const d = Math.hypot(f.x - x, f.z - z) - f.size * 0.6; if (d < bd) { bd = d; best = f; } }
    if (best && bd < 1.6) { this.lockId = best.id; this.manualLock = true; this.lockAt = this.t; this.emit('lock', { f: best }); return true; }
    return false;
  }
}
