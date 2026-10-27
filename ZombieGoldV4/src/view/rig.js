// Bosses and mini-bosses: one live Spine skeleton (src/spine/actor.js) driven by the arena's moves — walk in,
// wind up and slam, roar, fall — plus the hit flash and the rage tint. Which art each boss uses is in
// src/content/cast.js. BossRow is the 散射 level's boss: several figures spread across the far end of the arena.
import * as THREE from './three.js';
import { SpineActor } from '../spine/actor.js';
import { skeleton } from './cast.js';
import { rubbleMound } from './models.js';

export class Rig {
  // spec: an entry of BOSSES / MINI_BOSSES; size scales its height
  constructor(spec, size = 1) {
    this.spec = spec;
    const asset = skeleton(spec.asset);
    if (!asset) throw new Error('skeleton not loaded: ' + spec.asset);
    this.actor = new SpineActor(asset, { height: spec.height * size, ref: asset.pick(spec.anims.idle, spec.anims.walk) });
    this.root = new THREE.Group();
    this.root.add(this.actor);
    // the animation names this skeleton has for each move (null when it has none)
    this.K = Object.fromEntries(Object.entries(spec.anims).map(([k, names]) => [k, asset.pick(names)]));
    this.K.walk ||= this.K.idle; this.K.idle ||= this.K.walk;
    this.flashT = 0; this.t = 0;
    this.alpha = 1;             // fades it out after it falls
    this.then = null; this.onceT = 0; this.onceDur = 0;
  }
  get height() { return this.actor.worldBox.h; }
  duration(name) { return name ? this.actor.asset.duration(name) || 1 : 1; }
  // play a move; once = hold the last frame (death) or go on to `then` when done
  play(name, { once = false, speed = 1, then = null } = {}) {
    if (!name) { if (then) this.play(then); return; }
    this.actor.speed = speed;
    if (!once && this.actor.anim === name && this.actor.loop) return;
    this.actor.play(name, !once);
    if (once) this.actor.state.getCurrent(0).trackTime = 0;
    this.then = once ? then : null;
    this.onceDur = once ? this.duration(name) / speed : 0; this.onceT = 0;
  }
  flash(k = 1) { this.flashT = Math.max(this.flashT, 0.08 * k); }
  // below half health: a red throb, and the boss swells a little
  setRage(on) { this.rage = on; }
  // the art faces left; mirror it to face the way it moves (dir > 0 = right)
  face(dir) { if (dir) this.actor.flip = dir > 0; }
  update(dt) {
    this.t += dt;
    if (this.then && (this.onceT += dt) >= this.onceDur) { const n = this.then; this.then = null; this.play(n); }
    this.flashT = Math.max(0, this.flashT - dt);
    const A = this.actor;
    A.flash = this.flashT > 0.1 ? 0.45 : this.flashT > 0 ? 0.15 : 0;
    if (this.rage) { const p = 0.5 + 0.5 * Math.sin(this.t * 7); A.tint.set(1, 0.72 - 0.18 * p, 0.66 - 0.2 * p, this.alpha); }
    else A.tint.set(1, 1, 1, this.alpha);
    const sc = this.rage ? 1.12 : 1;
    this.root.scale.setScalar(this.root.scale.x + (sc - this.root.scale.x) * Math.min(1, dt * 3));
    A.update(dt);
  }
  dispose() { this.actor.dispose(); this.root.removeFromParent(); }
}

// Several figures in an arc beyond the arena; the one nearest a blow's target does the slam.
export class BossRow {
  constructor(spec, n = 5, size = 1) {
    this.root = new THREE.Group();
    this.arms = [];
    for (let i = 0; i < n; i++) {
      const r = new Rig(spec, size * (i === (n >> 1) ? 1.15 : 0.85 + (i % 2) * 0.1));
      const a = (i / (n - 1) - 0.5) * 2.2;          // spread across ±63°
      r.root.position.set(Math.sin(a) * 9.5, 0, -Math.cos(a) * 9.5 + 3);
      r.face(Math.sin(a) < 0 ? 1 : -1);             // turned toward the middle
      r.play(r.K.idle, { speed: 0.8 + i * 0.07 });
      r.actor.state.update(i * 0.37);
      // each stands on its own mound of earth (the arena's far side can be water)
      const mound = rubbleMound(i === (n >> 1) ? 2.2 : 1.7);
      mound.position.x = r.root.position.x; mound.position.z = r.root.position.z;
      this.root.add(r.root, mound);
      this.arms.push(r);
    }
    this.K = this.arms[0].K;
  }
  play(name, o) { for (const r of this.arms) r.play(name, o); }
  armAt(x) {
    let best = this.arms[0], bd = 1e9;
    for (const r of this.arms) { const d = Math.abs(r.root.position.x - x); if (d < bd) { bd = d; best = r; } }
    return best;
  }
  duration(name) { return this.arms[0].duration(name); }
  flash(k) { for (const r of this.arms) r.flash(k); }
  setRage(on) { for (const r of this.arms) r.setRage(on); }
  update(dt) { for (const r of this.arms) r.update(dt); }
  dispose() { for (const r of this.arms) r.dispose(); this.root.removeFromParent(); }
}
