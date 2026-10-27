// Draws the shooting room (the 二人捕鱼 stand-in) and the Bonus pool after a run: the hero at the gun, the
// skill turrets, the partner across the yard, the zombies walking the yard (the fish table's targets), shells
// and the lock ring. Small targets are one flipbook crowd; the big ones (boss, specials, the 宝箱怪) are live.
import * as THREE from './three.js';
import { MAT, eggGeo } from './models.js';
import { glowTexture, ringTexture, CrackMap, groundTexture } from './textures.js';
import { AREA } from '../sim/fishsim.js';
import { SHOT, FISH } from '../content/levels.js';
import { kmb } from '../sim/util.js';
import { rand } from './random.js';
import { propGeo, skeleton, roomBook } from './cast.js';
import { model as gltfModel } from './assets.js';
import { SPECIALS } from '../content/specials.js';
import { TARGETS, BIG_TARGETS, ROOM_HERO, ROOM_PARTNER, TURRET, ZOMBIES } from '../content/cast.js';
import { SpineActor } from '../spine/actor.js';
import { SpriteCrowd } from '../spine/flipbook.js';
import { Rig } from './rig.js';
import { PROP_MAT } from './props.js';
import { sfx } from '../platform/audio.js';

const short = kmb;
// the hero's shooting animations, by the angle of the shot (90 = straight ahead)
const AIMS = [30, 50, 70, 90, 110, 130, 150];
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3();
// 元宝: a gold ingot — a boat-shaped body with raised ends and a dome in the middle
let _ingot = null;
function ingotGeo() {
  if (_ingot) return _ingot;
  const g = new THREE.SphereGeometry(1, 20, 12), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ends = Math.abs(x) ** 2.2;               // the two ends curl up
    p.setXYZ(i, x * 0.9, y > 0 ? y * 0.28 + ends * 0.42 : y * 0.32, z * 0.55);
  }
  g.computeVertexNormals();
  const dome = new THREE.SphereGeometry(0.34, 16, 10); dome.translate(0, 0.22, 0);
  const merged = mergeGeos([g, dome]);
  return (_ingot = merged);
}
function mergeGeos(list) {
  const out = new THREE.BufferGeometry();
  const geos = list.map(q => q.toNonIndexed());
  for (const k of ['position', 'normal']) {
    const n = geos.reduce((a, q) => a + q.attributes[k].array.length, 0), arr = new Float32Array(n);
    let o = 0; for (const q of geos) { arr.set(q.attributes[k].array, o); o += q.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, 3));
  }
  out.computeBoundingSphere();
  return out;
}



export class FishView {
  constructor(world, fx, platZ, tier) {
    this.world = world; this.fx = fx; this.platZ = platZ;
    // everything stands on the yard: a slab of cracked ground over the area the targets walk
    const wy = this.wy = world.water.visible ? world.water.position.y + 0.3 : 0;
    const g = this.group = new THREE.Group();
    world.scene.add(g);
    const yardW = AREA.hw * 2 + 14, yardD = AREA.far + 16;
    const tex = groundTexture('asphalt'); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(yardW / 6, yardD / 6);
    const yard = new THREE.Mesh(new THREE.BoxGeometry(yardW, 1.2, yardD), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    yard.position.set(0, wy - 0.6, platZ - yardD / 2 + 2); yard.receiveShadow = true;
    g.add(yard);
    this.models = new Map();
    this.t = 0; this.recoil = 0; this.angle = 0;
    // the hero at the gun, rising onto the yard; two skill turrets join from cannon tier 2
    this.hero = new SpineActor(skeleton(ROOM_HERO.asset), { height: ROOM_HERO.height });
    this.hero.position.set(0, -3, platZ); this.hero.play(['idle']);
    g.add(this.hero);
    this.turrets = [-2.2, 2.2].map(x => {
      const a = new SpineActor(skeleton(TURRET.asset), { height: TURRET.height, renderOrder: 2 });
      a.position.set(x, 0.05, platZ + 0.4); a.play(['idle']); a.visible = false; g.add(a);
      return a;
    });
    this.rise = 0;
    this.setTier(tier, true);
    this.crowd = new SpriteCrowd(g, roomBook(world.renderer), 160);

    const lockMat = new THREE.MeshBasicMaterial({ map: ringTexture(), color: new THREE.Color(2.2, 1.7, 0.6), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    this.lock = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lockMat);
    this.lock.rotation.x = -Math.PI / 2; this.lock.visible = false; this.lock.renderOrder = 4;
    g.add(this.lock);
    this.beam = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 0.5), transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    this.beam.rotation.x = -Math.PI / 2; this.beam.visible = false; this.beam.renderOrder = 4;
    g.add(this.beam);
    this.auraTex = glowTexture('rgba(255,210,90,1)', 'rgba(255,160,20,0)');
  }

  // cannon tier (a skill from the bonus wheel): from tier 2 the two skill turrets fire beside the hero
  setTier(tier, quiet = false) {
    if (tier === this.tier) return;
    this.tier = tier;
    for (const t of this.turrets) t.visible = tier >= 2;
    if (quiet) return;
    this.fx.ring(0, 1.2, this.platZ, 8, [1, 0.85, 0.4], 0.6);
    this.fx.spark(0, 2, this.platZ, 30, [1, 0.85, 0.35], 9, 0.7);
  }
  // where the soldiers drop in during the 兵 → 金炮弹 load (the ammo crate behind the hero)
  hopper() { return { x: 0, y: 2.1, z: this.platZ + 1.2 }; }

  // the partner across the yard, facing us
  addPartner() {
    const p = this.partner = new SpineActor(skeleton(ROOM_PARTNER.asset), { height: ROOM_PARTNER.height });
    p.position.set(0, this.wy, this.platZ - AREA.far - 1.5); p.play(['idle']);
    this.group.add(p);
  }

  // one target's drawing: a live rig for the big ones, otherwise a slot in the crowd
  model(f) {
    let v = this.models.get(f.id);
    if (v) return v;
    const big = BIG_TARGETS[f.magic ? 'magic' : f.boss ? 'boss' : f.type];
    v = { die: 0, ph: rand(0, 6), face: Math.cos(f.heading) >= 0 ? 1 : -1 };
    if (big) {
      const rig = v.rig = new Rig(big, f.size * 1.1 / big.height);
      rig.play(rig.K.walk);
      this.group.add(rig.root);
    } else {
      v.id = TARGETS[f.type] || 'helmet';
      v.h = ZOMBIES[v.id].height;
      v.s = f.size * 1.15 / v.h;          // fish were long and flat; a zombie as tall as the fish was long reads right from above
    }
    if (f.boss || f.special || f.magic) {
      const aura = v.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.auraTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8, toneMapped: false }));
      aura.scale.set(f.size * 1.4, f.size * 0.9, 1);
      this.group.add(aura);
    }
    this.models.set(f.id, v);
    return v;
  }

  onShoot() {
    this.recoil = 1;
    const a = this.angle, mx = Math.sin(a) * 1.6, mz = this.platZ - Math.cos(a) * 1.6;
    this.fx.flash(mx, this.wy + 1.9, mz, 1.4, [1, 0.85, 0.5], 0.08);
    this.firing = 0.35;
  }
  onNet(x, z, partner) {
    this.fx.net(x, this.wy + 0.1, z, 2.6, partner ? [0.85, 0.6, 1] : [1, 0.92, 0.6]);
  }
  onCatch(f, big) {
    this.fx.splat(f.x, f.z, big ? 2.4 : 1.2);
    this.fx.coinBurst(f.x, this.wy + 0.65, f.z, big ? 18 : 6 + Math.min(10, f.mult), big ? 1.1 : 0.7, { floor: this.wy + 0.05, life: big ? 0.4 : 0 });
    this.fx.spark(f.x, 0, f.z, big ? 20 : 8, [1, 0.85, 0.35], big ? 8 : 5, 0.5);
    if (big) this.fx.ring(f.x, 0, f.z, 8, [1, 0.85, 0.4], 0.5);
  }
  onBomb(f) {
    this.fx.boom(f.x, 0, f.z, 4, [1, 0.5, 0.2]);
    this.fx.ring(f.x, 0, f.z, 14, [1, 0.6, 0.2], 0.6);
  }
  onBossBurst(f) {
    this.fx.boom(f.x, 0.4, f.z, 4.5, [1, 0.85, 0.35]);
    this.fx.ring(f.x, 0, f.z, 18, [1, 0.9, 0.5], 0.7);
    this.fx.spark(f.x, 0.5, f.z, 40, [1, 0.85, 0.3], 12, 0.8);
  }
  bossCoins(f, n) {
    this.fx.coinBurst(f.x, this.wy + 1.05, f.z, n, 1.5, { floor: this.wy + 0.05, life: 0.8 });
  }

  // 全屏激光: a bright beam sweeps the yard from the gun; every target it touches gets a net and sparks
  onLaser(hits) {
    if (!this.beamL) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.4, 0.6), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2; m.renderOrder = 6;
      const pivot = new THREE.Group(); pivot.position.set(0, this.wy + 0.6, this.platZ); pivot.add(m); m.position.z = -20;
      this.group.add(pivot);
      this.beamL = { pivot, m, t: 1 };
    }
    this.beamL.t = 0; this.beamL.pivot.visible = true;
    hits.forEach((f, i) => setTimeout(() => {
      this.fx.net(f.x, this.wy + 0.25, f.z, 3, [1, 0.95, 0.5]);
      this.fx.spark(f.x, this.wy + 0.6, f.z, 10, [1, 0.9, 0.4], 7, 0.5);
    }, 80 + i * 25));
    this.fx.flash(0, this.wy + 1, this.platZ - 12, 14, [1, 0.9, 0.5], 0.25);
  }
  onTorpedo(f) {
    this.fx.boom(f.x, this.wy + 0.4, f.z, 4.5, [1, 0.6, 0.25]);
    this.fx.ring(f.x, this.wy + 0.2, f.z, 14, [1, 0.7, 0.3], 0.6);
  }

  // the golden egg of the Bonus pool: sits in the middle and cracks layer by layer
  ensureEgg(e) {
    if (this.egg) return this.egg;
    const crack = new CrackMap();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffb21f, roughness: 0.18, metalness: 1.0, emissive: 0xffd890, emissiveMap: crack.tex, emissiveIntensity: 1.4, envMapIntensity: 1 });
    const m = new THREE.Mesh(eggGeo(), mat);
    m.scale.setScalar(2.1); m.castShadow = true;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.auraTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7, toneMapped: false }));
    glow.scale.set(7, 7, 1); glow.position.set(e.x, this.wy + 2.2, e.z);
    m.position.set(e.x, this.wy + 0.1, e.z);
    this.group.add(m, glow);
    this.egg = { m, mat, crack, glow };
    return this.egg;
  }
  onEggLayer(e, i) {
    const v = this.ensureEgg(e);
    v.crack.add(3 + i * 2); v.mat.emissiveIntensity = 1.4 + i * 0.6;
    this.fx.coinBurst(e.x, this.wy + 2.6, e.z, 18 + i * 6, 1.2, { floor: this.wy + 0.05 });
    this.fx.spark(e.x, this.wy + 2, e.z, 24, [1, 0.85, 0.3], 8, 0.7);
    this.fx.ring(e.x, this.wy + 1.5, e.z, 10, [1, 0.8, 0.3], 0.45);
  }
  onEggBreak(e) {
    const v = this.ensureEgg(e);
    v.m.visible = false; v.glow.material.opacity = 1;
    this.fx.shatter(e.x, this.wy + 1.5, e.z, 70, '#ffc83a', 1.5);
    this.fx.boom(e.x, this.wy + 1.8, e.z, 5, [1, 0.85, 0.3]);
    this.fx.coinBurst(e.x, this.wy + 1.8, e.z, 110, 1.5, { life: 0.6, floor: this.wy + 0.05 });
  }

  // ---------------------------------------------------------------- the 二人捕鱼 specials
  // 海鳗 (电击怪): lightning jumps from it to each target it takes, one after another
  onChain(f, list) {
    const y = this.wy + 0.9;
    let from = { x: f.x, y, z: f.z };
    this.fx.zap(f.x, y, f.z, 3.4); this.fx.ring(f.x, this.wy + 0.3, f.z, 10, [0.6, 0.85, 1], 0.5);
    list.forEach((o, i) => {
      const a = from, b = { x: o.x, y, z: o.z };
      setTimeout(() => {
        this.fx.beam(a, b, 0.42, 1.1);
        this.fx.zap(b.x, b.y, b.z, 2.2);
        this.fx.net(b.x, this.wy + 0.25, b.z, 2.4, [0.7, 0.9, 1]);
        sfx('zap');
      }, 90 + i * 85);
      from = b;
    });
  }
  // 章鱼宝箱 (爆破矿工): three treasure chests burst out of the ground (the Pirate Kit gold chest reads as
  // treasure; the number-gate pack's military crates are the supply crates on the road)
  showChests() {
    this.hideChests();
    const gold = gltfModel('Prop_Chest_Gold'), geo = !gold && propGeo('PA_Chest_Special');
    const z = this.platZ - 11, xs = [-4.6, 0, 4.6];
    this.chests = xs.map((x, i) => {
      let m;
      if (gold) { m = gold.scene.clone(); m.scale.setScalar(2.6); m.traverse(o => { o.userData.sharedGeo = true; if (o.isMesh) o.castShadow = true; }); }
      else if (geo) { m = new THREE.Mesh(geo, PROP_MAT); m.userData.sharedGeo = true; m.scale.setScalar(4.4); }
      else m = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 1.8), new THREE.MeshStandardMaterial({ color: 0xa8322a }));
      m.castShadow = true; m.position.set(x, this.wy - 2, z); m.rotation.y = (i - 1) * -0.18;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.auraTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6, toneMapped: false }));
      glow.scale.set(5, 4, 1); glow.position.set(x, this.wy + 1.2, z - 0.2);
      this.group.add(m, glow);
      this.fx.puff(x, this.wy + 0.2, z, 6, [0.72, 0.64, 0.55], 1.6);
      return { m, glow, x, z, t: -i * 0.12, open: 0, val: null };
    });
  }
  // screen positions of the chests (for the tap targets)
  chestScreen() {
    const cam = this.world.camera, r = this.world.renderer.domElement.getBoundingClientRect();
    return (this.chests || []).map(c => { _p0.set(c.x, this.wy + 1.0, c.z).project(cam); return { x: r.left + (_p0.x + 1) / 2 * r.width, y: r.top + (1 - _p0.y) / 2 * r.height }; });
  }
  openChest(i, m) {
    const c = this.chests && this.chests[i]; if (!c) return;
    c.open = 0.0001; c.val = m;
    this.fx.boom(c.x, this.wy + 1.5, c.z, 3, [1, 0.85, 0.35]);
    this.fx.coinBurst(c.x, this.wy + 1.8, c.z, 60, 1.5, { floor: this.wy + 0.05, life: 0.6 });
  }
  revealChests(vals, picked) { (this.chests || []).forEach((c, i) => { c.val = vals[i]; if (i !== picked) c.dim = true; }); }
  hideChests() {
    for (const c of this.chests || []) { this.group.remove(c.m, c.glow); if (!c.m.userData.sharedGeo && c.m.geometry) c.m.geometry.dispose(); c.glow.material.dispose(); }
    this.chests = null;
  }
  // 财神爷 (运钞怪) · 喜从天降: gold ingots fall one by one; onLand(i, x, z) pays each as it hits the ground
  ingotRain(vals, onLand) {
    const geo = ingotGeo(), mat = new THREE.MeshStandardMaterial({ color: 0xffc23a, metalness: 0.75, roughness: 0.28, emissive: 0x6a3a00, emissiveIntensity: 0.3 });
    vals.forEach((m, i) => {
      const x = rand(-AREA.hw + 1.5, AREA.hw - 1.5), z = this.platZ - rand(8, 22);
      const mesh = new THREE.Mesh(geo, mat); mesh.scale.setScalar(1.0 + Math.min(0.8, m / 30)); mesh.castShadow = true; mesh.userData.sharedGeo = true;
      mesh.position.set(x, 18, z); mesh.visible = false;
      this.group.add(mesh);
      (this.ingots ||= []).push({ mesh, x, z, m, i, t: -0.25 - i * 0.32, onLand, landed: false });
    });
  }

  update(dt, sim, labels, opts) {
    this.t += dt;
    // chests rising, the picked one jumping open
    if (this.chests) for (const c of this.chests) {
      c.t += dt;
      const k = Math.min(1, Math.max(0, c.t / 0.5));
      c.m.position.y = this.wy - 2 + (1 - (1 - k) ** 3) * 2.15 + Math.sin(this.t * 2 + c.x) * 0.08;
      if (c.open > 0) { c.open += dt; c.m.rotation.x = -Math.sin(Math.min(1, c.open * 4) * Math.PI) * 0.25; if (Math.random() < dt * 30) this.fx.coinBurst(c.x, this.wy + 1.6, c.z, 1, 1.1, { floor: this.wy + 0.05 }); }
      c.glow.material.opacity = c.dim ? 0.15 : 0.45 + Math.sin(this.t * 4 + c.x) * 0.15 + (c.open > 0 ? 0.4 : 0);
      if (c.val !== null) labels.at('ch' + c.x, 'lb-fish boss' + (c.dim ? '' : ' special'), `×${c.val}`, c.x, this.wy + 3.0, c.z, true);
    }
    // ingots falling
    if (this.ingots) {
      for (const g of this.ingots) {
        g.t += dt;
        if (g.t < 0 || g.landed) continue;
        g.mesh.visible = true;
        const y = Math.max(this.wy + 0.25, 18 - g.t * g.t * 30);
        g.mesh.position.set(g.x, y, g.z); g.mesh.rotation.set(Math.sin(g.t * 3) * 0.3, g.t * 4, 0);
        labels.at('ig' + g.i, 'lb-fish hi', `×${g.m}`, g.x, y + 1.6, g.z, true);
        if (y <= this.wy + 0.25) {
          g.landed = true; g.mesh.rotation.set(0, 0.4, 0);
          this.fx.coinBurst(g.x, this.wy + 0.8, g.z, 14 + g.m, 1.1, { floor: this.wy + 0.05 });
          this.fx.ring(g.x, this.wy + 0.2, g.z, 7, [1, 0.85, 0.4], 0.45); this.fx.burst(g.x, this.wy + 0.6, g.z, 2.2, [1, 0.85, 0.4]);
          g.onLand(g.i, g.x, g.z);
          g.gone = 1.2;
        }
      }
      for (const g of this.ingots) if (g.landed && (g.gone -= dt) <= 0 && g.mesh.parent) { this.group.remove(g.mesh); }
      if (this.ingots.every(g => g.landed && !g.mesh.parent)) this.ingots = null;
    }
    if (this.beamL && this.beamL.t < 1) {
      const b = this.beamL; b.t = Math.min(1, b.t + dt / 0.7);
      b.pivot.rotation.y = 1.0 - b.t * 2.0;
      b.m.material.opacity = 0.85 * (1 - Math.max(0, b.t - 0.8) / 0.2);
      if (b.t >= 1) b.pivot.visible = false;
    }
    if (sim.egg) {
      const v = this.ensureEgg(sim.egg);
      if (sim.egg.alive) {
        v.m.position.y = this.wy + 0.1 + Math.sin(this.t * 1.6) * 0.12;
        v.m.rotation.z = Math.sin(this.t * 30) * sim.egg.wob * 0.06;
        v.glow.material.opacity = 0.5 + Math.sin(this.t * 3) * 0.12;
        sim.egg.wob = Math.max(0, sim.egg.wob - dt * 3);
        labels.at('egg', 'lb-fish boss', `金蛋 ${sim.egg.layer}/${sim.egg.layers}`, sim.egg.x, this.wy + 3.4, sim.egg.z, true);
      } else v.glow.material.opacity = Math.max(0, v.glow.material.opacity - dt);
    }
    // the hero rises onto the yard, then aims: the shot animation nearest the angle while firing
    if (this.rise < 1) {
      this.rise = Math.min(1, this.rise + dt * 1.3);
      this.hero.position.y = -3 + (1 - (1 - this.rise) ** 3) * 3.05;   // up onto the platform (top at y ≈ 0)
    }
    this.angle = sim.angle;
    this.firing = Math.max(0, (this.firing || 0) - dt);
    const deg = 90 - sim.angle * 180 / Math.PI;
    const aim = AIMS.reduce((a, b) => (Math.abs(b - deg) < Math.abs(a - deg) ? b : a));
    this.hero.play([this.firing > 0 ? 'attack' + aim : 'idle'], true);
    this.hero.update(dt);
    for (const t of this.turrets) if (t.visible) { t.play([this.firing > 0 ? 'attack' : 'idle']); t.update(dt); }
    if (this.partner) { this.partner.play([sim.pshells && sim.pshells.length ? 'attack' : 'idle']); this.partner.update(dt); }

    // the targets walk the yard turned the way they go; a hit flashes them, a kill plays the death and fades
    const CR = this.crowd, cam = this.world.camera, seen = new Set();
    CR.begin();
    for (const f of sim.fish) {
      seen.add(f.id);
      const v = this.model(f), y = this.wy;
      if (f.alive) {
        _p0.set(f.x, y, f.z).project(cam); _p1.set(f.x + Math.cos(f.heading), y, f.z - Math.sin(f.heading)).project(cam);
        const dx = _p1.x - _p0.x;
        if (Math.abs(dx) > 0.002) v.face = dx > 0 ? 1 : -1;
      } else v.die += dt;
      const fade = f.alive ? 1 : Math.max(0, 1 - Math.max(0, v.die - 0.7) * 2.5);
      if (v.rig) {
        const R = v.rig;
        if (!f.alive && !v.dead) { v.dead = true; R.play(R.K.die, { once: true }); }
        R.root.position.set(f.x, y, f.z); R.face(v.face); R.alpha = fade;
        if (f.flash > 0) R.flash(1);
        R.update(dt);
      } else {
        CR.put(v.id, f.alive ? 'run' : 'die', f.alive ? this.t * 0.9 + v.ph : v.die, f.x, y, f.z, v.face, v.s, null, fade, 0, f.flash > 0 ? 0.6 : 0);
      }
      if (v.aura) {
        v.aura.position.set(f.x, y + f.size * 0.3, f.z - 0.2);
        v.aura.material.opacity = f.alive ? 0.55 + Math.sin(this.t * 4) * 0.2 : Math.max(0, v.aura.material.opacity - dt * 2);
      }
      if (f.alive && (f.boss || f.magic || f.special) && Math.random() < dt * 14) this.fx.glow.spawn({ x: f.x + rand(-2, 2), y, z: f.z + rand(-1, 1), vy: 1.5, life: 0.6, size0: 0.35, size1: 0.05, r: 1, g: 0.85, b: 0.4, a0: 1 });
      // labels (none while a special's chests or dance hold the screen)
      if (f.alive && sim.inArea(f) && !this.quiet) {
        const locked = f.id === sim.lockId;
        // with a bet above ×1 the labels also show what a kill is worth in coins right now
        const stake = SHOT * sim.bet, showCoins = sim.bets.length > 1;
        const top = y + (v.rig ? v.rig.height + 0.4 : v.h * v.s + 0.5);
        if (f.special) {
          const S = SPECIALS[f.special];
          labels.at('f' + f.id, 'lb-fish boss special' + (locked ? ' lock' : ''), `${FISH[f.type].name}<small>${S.name.split(' · ')[1]}</small>`, f.x, top, f.z, true);
        } else if (f.magic) {
          labels.at('f' + f.id, 'lb-fish boss magic' + (locked ? ' lock' : ''), `${FISH.magic.name}<small>×50～×6000 翻牌</small>`, f.x, top, f.z, true);
        } else if (f.boss) {
          const txt = f.mult ? '×' + f.mult : sim.bossLabel || '×50~200';
          const sub = showCoins ? `<small>最高 ${short((f.mult || 1000) * stake)}</small>` : '';
          labels.at('f' + f.id, 'lb-fish boss' + (locked ? ' lock' : ''), txt + sub, f.x, top, f.z, true);
        } else if (f.mult >= 8 || locked || f.type === 'bomb') {
          const txt = f.type === 'bomb' ? '炸弹' : '×' + f.mult;
          const sub = showCoins && (locked || f.mult >= 12) && f.type !== 'bomb' ? `<small>${short(f.mult * stake)}</small>` : '';
          labels.at('f' + f.id, 'lb-fish' + (f.mult >= 20 ? ' hi' : '') + (f.type === 'bomb' ? ' bomb' : '') + (locked ? ' lock' : '') + (sub ? ' two' : ''), txt + sub, f.x, top, f.z, true);
        }
      }
    }
    CR.end(cam);
    for (const [id, v] of this.models) if (!seen.has(id)) {
      if (v.rig) v.rig.dispose();
      if (v.aura) { this.group.remove(v.aura); v.aura.material.dispose(); }
      this.models.delete(id);
    }

    // lock indicator
    const L = sim.fish.find(f => f.id === sim.lockId && f.alive);
    if (L && !sim.aiming && opts.showLock) {
      this.lock.visible = true;
      const s = L.size * (L.boss ? 0.9 : 1.6) + 0.6;
      this.lock.position.set(L.x, this.wy + 0.05, L.z); this.lock.scale.set(s, s, 1); this.lock.rotation.z += dt * 2.5;
      const dx = L.x - 0, dz = L.z - this.platZ, len = Math.hypot(dx, dz);
      this.beam.visible = true;
      this.beam.position.set(dx / 2, 0.3, this.platZ + dz / 2);
      this.beam.scale.set(1, Math.max(0.1, len - 2.4), 1);
      this.beam.rotation.set(-Math.PI / 2, 0, Math.atan2(-dx, -dz));
    } else { this.lock.visible = false; this.beam.visible = false; }

    // shells
    const list = sim.shells.concat(sim.pshells);
    this.fx.setShells(list);
  }

  dispose() {
    this.hideChests();
    for (const v of this.models.values()) v.rig?.dispose();
    this.crowd.dispose();
    for (const a of [this.hero, ...this.turrets, this.partner]) a?.dispose();
    const shared = Object.values(MAT);
    this.group.traverse(o => { if (o.isMesh || o.isSprite) { if (!o.userData.sharedGeo) o.geometry?.dispose(); if (o.material && !shared.includes(o.material) && o.material.dispose) { o.material.map?.dispose?.(); o.material.dispose(); } } });
    this.world.scene.remove(this.group);
  }
}
