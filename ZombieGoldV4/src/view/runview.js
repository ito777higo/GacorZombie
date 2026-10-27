// Draws a RunSim: squad formation, zombies, gates (2 or 3 lanes, rideable posts or walls), split walls, traps,
// cages, road coins, helicopter drops, the stand-fight boss, and the soldiers leaping into the bonus cannon.
import * as THREE from './three.js';
import {
  barrelGeo, barrelBandGeo, MAT,
  coinGeo, rollerGeo, rollerFrameGeo, sawBladeGeo, sawRailGeo, cageGeo, makeHelicopter, splitWallGeo, gateWallGeo, pillarGeo, goldPillarGeo, rubbleMound,
} from './models.js';
import { GatePanel, iconTexture, glowTexture, holeTexture, warnTexture, NUM_FONT } from './textures.js';
import { gatePostGeo } from './art.js';
import { PROP_MAT } from './props.js';
import { propGeo, crowdBook, hordeOf, miniBossSpec, bossSpec, targetCard } from './cast.js';
import { SpriteCrowd } from '../spine/flipbook.js';
import { ZOMBIES, ROLES, TRUCK_HERO } from '../content/cast.js';
import { gateFrame } from './gateframe.js';
import { Rig, BossRow } from './rig.js';
import { imageUrl } from './assets.js';
import { ROAD_HW, PLATFORM_R } from '../sim/arena.js';
import { SLOT, CENT, VIS_MAX, LIM, TRUCK, formationX, hole } from '../sim/formation.js';
import { opLabel, opGood, SKILLS } from '../sim/runsim.js';
import { fmt, kmb, damp, clamp, easeOutBack } from '../sim/util.js';
import { rand } from './random.js';
import { woodBarrelGeo, coinStackGeo, goldGunTexture, BadgeLayer, BARREL_H } from './barrel.js';
import { FinaleView } from './finaleview.js';
import { FISH } from '../content/levels.js';

const HIT_FLASH = 0.6;      // how white a zombie turns for the frame it is hit
// what a boss throws in its warned moves (src/content/cast.js BOSSES[…].shot)
function projectileMesh(shot) {
  if (shot === 'coin') {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.2, 20).rotateX(Math.PI / 2), getShared().coinMat);
    m.userData.sharedMat = true;
    return m;
  }
  if (shot === 'ice') return new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), new THREE.MeshStandardMaterial({ color: 0xdff4ff, roughness: 0.6, flatShading: true, emissive: 0x335577 }));
  if (shot === 'orb') return new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 0.8, 2.6), toneMapped: false }));
  if (shot === 'missile') { const g = new THREE.CapsuleGeometry(0.3, 1.4, 2, 8); g.rotateX(Math.PI / 2); return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.7, 0.4), toneMapped: false })); }
  if (shot === 'slime') return new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), new THREE.MeshStandardMaterial({ color: 0x8a3fd0, roughness: 0.3, emissive: 0x3a0a66 }));
  return new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), new THREE.MeshStandardMaterial({ color: 0x6fbf3a, roughness: 0.4, emissive: 0x2a5a10 }));
}
// diagonal red-and-dark stripes for the sweep warning band
let _hazard = null;
function hazardTexture() {
  if (_hazard) return _hazard;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ff3a1a'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(40,0,0,.75)';
  for (let i = -64; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 + 64, 64); g.lineTo(i + 64, 64); g.closePath(); g.fill(); }
  _hazard = new THREE.CanvasTexture(c); _hazard.wrapS = _hazard.wrapT = THREE.RepeatWrapping; _hazard.colorSpace = THREE.SRGBColorSpace;
  return _hazard;
}
// v8.1 supply crates (Quaternius Chest / Chest_Special, the number-gate pack's 可破坏补给箱), sized like a barrel
const CRATE_KINDS = new Set(['gun', 'rate', 'skill', 'shield', 'heal','coin']);
// v9: the number-gate pack's pickup icons for what a rolling barrel holds
const ROLL_ICON = { men: 'pickup_squad', gun: 'pickup_rifle', rate: 'pickup_ammo', shield: 'pickup_shield', heal: 'pickup_heal' };
const ITEM_TEXT = { gun: '换枪', rate: '射速', shield: '护盾', heal: '治疗' };
const crateCache = {};
function crateGeo(kind) {
  const name = kind === 'skill' ? 'PA_Chest_Special' : 'PA_Chest';
  if (crateCache[name] !== undefined) return crateCache[name];
  const geo = propGeo(name);
  if (!geo) return null;
  geo.computeBoundingBox();
  const bb = geo.boundingBox, w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z), k = 1.2 / w;
  return (crateCache[name] = { geo, k, h: (bb.max.y - bb.min.y) * k });
}
// the number-gate pack's 2D pieces (assets/ui/*.svg): drawn once into a canvas so sprites can use them
const uiTex = new Map();
export function uiTexture(name, size = 128, h = size) {
  if (uiTex.has(name)) return uiTex.get(name);
  const c = document.createElement('canvas'); c.width = size; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.shared = true;
  const img = new Image();
  img.onload = () => { c.getContext('2d').drawImage(img, 0, 0, size, h); t.needsUpdate = true; };
  img.src = imageUrl(`ui/${name}.svg`);
  uiTex.set(name, t);
  return t;
}
const SOLDIER_ICON = '<svg viewBox="0 0 16 16"><circle cx="8" cy="4.2" r="3.2"/><path d="M2.5 15c0-4 2.4-6.6 5.5-6.6s5.5 2.6 5.5 6.6z"/></svg>';
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

let shared = null;
function getShared() {
  if (shared) return shared;
  shared = {
    barrel: barrelGeo(), band: barrelBandGeo(), cage: cageGeo(), coin: coinGeo(),
    icons: { men: iconTexture('men'), gun: iconTexture('gun'), rate: iconTexture('rate'), coin: iconTexture('coin'),
      'skill:double': iconTexture('skill:double'), 'skill:spread': iconTexture('skill:spread'), 'skill:pierce': iconTexture('skill:pierce'),
      'skill:aim': iconTexture('skill:aim'), 'skill:lucky': iconTexture('skill:lucky') },
    gateWall: gateWallGeo(), pillar: pillarGeo(), goldPillar: goldPillarGeo(),
    postBlue: gatePostGeo('#9da86a'), postRed: gatePostGeo('#ff4a3d'), postGold: gatePostGeo('#ffb21a'), postPurple: gatePostGeo('#9a5aff'), postTeal: gatePostGeo('#1fc4ae'), postGray: gatePostGeo('#c9ced6'),
    glow: glowTexture('rgba(255,220,120,1)', 'rgba(255,180,40,0)'),
    hole: holeTexture(), warn: warnTexture(),
    coinMat: new THREE.MeshStandardMaterial({ color: 0xffc23a, roughness: 0.25, metalness: 1, emissive: 0x8a5200, emissiveIntensity: 0.6 }),
    // v8: hand-drawn Top Lords barrels
    wood: woodBarrelGeo('wood'), woodGold: woodBarrelGeo('gold'), coinStack: coinStackGeo(), gunTex: goldGunTexture(),
  };
  return shared;
}
const panelKind = o => (o.op === '?' ? 'mystery' : o.op === '~' ? 'roulette' : o.op === 'skill' ? 'skill:' + o.k : o.op === 'x' && o.v >= 5 ? 'gold' : o.op === 'x' ? 'mul' : '');
// v9: the gold MAX that flashes over a panel shot as far as it goes
let maxTex = null;
function maxTexture() {
  if (maxTex) return maxTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  x.font = `400 76px ${NUM_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  x.lineWidth = 14; x.strokeStyle = '#6a3000'; x.strokeText('MAX', 128, 52);
  const g = x.createLinearGradient(0, 18, 0, 86); g.addColorStop(0, '#fff6b0'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#ff9a1a');
  x.fillStyle = g; x.fillText('MAX', 128, 52);
  maxTex = new THREE.CanvasTexture(c); maxTex.colorSpace = THREE.SRGBColorSpace; maxTex.userData.shared = true;
  return maxTex;
}

export class RunView {
  constructor(world, fx, sim) {
    this.world = world; this.fx = fx; this.sim = sim;
    const S = getShared();
    const scene = this.group = new THREE.Group();
    world.scene.add(scene);
    // every figure — squad, heroes, zombies, soldiers on barrels — is one flipbook crowd, so they sort together
    this.book = crowdBook(world.renderer, sim.L.ch || 0);
    this.crowd = new SpriteCrowd(scene, this.book, VIS_MAX + 640);
    this.horde = hordeOf(sim.L.ch || 0);
    this.man = (x, y, z, clip, t, s = 1, roll = 0, alpha = 1, face = -1) => this.crowd.put('squad', clip, t, x, y, z, face, s, null, alpha, roll);
    // the heroes ride an armoured pickup at the back of the column (save.heroMode: truck | mix | off)
    const tg = propGeo('Vehicle_Pickup_Armored');
    if (tg) {
      this.truck = new THREE.Mesh(tg, PROP_MAT);
      this.truck.castShadow = true; this.truck.userData.sharedGeo = true;
      tg.computeBoundingBox();
      this.truckLen = tg.boundingBox.max.z - tg.boundingBox.min.z; this.truckTop = tg.boundingBox.max.y;
      this.truckW = tg.boundingBox.max.x - tg.boundingBox.min.x;
      scene.add(this.truck);
      this.truckX = 0; this.truckZ = null;
    }
    this.teles = [];       // boss slam warnings on the ground
    // v8: the multiple over every monster (one draw call), soldiers standing on barrels, soldiers joining from them
    this.badges = new BadgeLayer(scene, 360);
    this.joiners = [];
    this.cardTex = new Map();
    this.sx = new Float32Array(VIS_MAX); this.sz = new Float32Array(VIS_MAX); this.born = new Float32Array(VIS_MAX).fill(-9);
    this.vis = Math.min(VIS_MAX, sim.squad.N);
    for (let i = 0; i < this.vis; i++) { this.sx[i] = sim.squad.x + SLOT[i][0]; this.sz[i] = sim.squad.z + SLOT[i][1]; }
    this.dying = [];       // soldiers
    this.zdying = [];      // zombies
    this.jumpers = [];     // soldiers leaping into the bonus cannon
    this.t = 0; this.lastSZ = sim.squad.z;
    this.hurt = 0;
    this.buildGates(); this.buildSplits(); this.buildLadder(); this.buildBarrels(); this.buildFish(); this.buildHazards(); this.buildCoins();
    // v9 护盾: the number-gate pack's blue selection ring round the squad while a shield is up
    this.shieldRing = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: uiTexture('selection_ring_blue', 256), transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }));
    this.shieldRing.rotation.x = -Math.PI / 2; this.shieldRing.visible = false; this.shieldRing.renderOrder = 2;
    this.group.add(this.shieldRing);
    // v9.3: and a half-dome over it — clear in the middle, brighter towards the rim (fresnel), a slow light band
    // running up it; it flashes when it takes a blow and bursts when the last layer is spent
    this.shieldDome = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uHit: { value: 0 }, uFade: { value: 1 } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uT; uniform float uHit; uniform float uFade; varying vec3 vN; varying vec3 vV; varying float vY;
        void main() {
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          float band = smoothstep(0.08, 0.0, abs(fract(vY * 0.9 - uT * 0.35) - 0.5) - 0.42);
          vec3 c = mix(vec3(0.55, 0.85, 1.0), vec3(0.9, 0.98, 1.0), f + uHit * 0.6);
          float a = (0.06 + 0.5 * f + 0.1 * band + uHit * 0.45) * uFade;
          gl_FragColor = vec4(c, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    this.shieldDome.visible = false; this.shieldDome.renderOrder = 5; this.shieldHit = 0; this.shieldGone = 0;
    this.group.add(this.shieldDome);
    // v8.1: the number-gate pack's chequered finish line where the road meets the boss arena
    if (sim.platZ !== undefined && !sim.L.journey) {
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HW * 2, ROAD_HW * 2 / 4), new THREE.MeshStandardMaterial({ map: uiTexture('finish_line', 512, 128), roughness: 0.9 }));
      fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.025, sim.platZ + PLATFORM_R + 1.6); fl.receiveShadow = true;
      this.group.add(fl);
    }
    this.drops = [];      // helicopters and parachuting reinforcements
    this.mbs = new Map();
    // a little brightness variety across a horde; which way each zombie faces (the art faces left)
    this.zTint = new Map();
    this.zFace = new Map();
    for (const z of sim.zombies) {
      const k = rand(0.86, 1.06);
      this.zTint.set(z.id, new THREE.Color(k, k * rand(0.96, 1.03), k * rand(0.95, 1.04)));
    }
  }

  // which crowd figure a zombie is drawn as (src/content/cast.js)
  zType(z) {
    return z.brute ? ROLES.brute : z.ambush ? ROLES.ambush : z.shield ? ROLES.shield : this.horde[z.id % this.horde.length];
  }
  // zombies turn toward the squad; a small dead zone stops them flickering when they are straight ahead
  zFacing(z) {
    const dx = this.sim.squad.x - z.x;
    let f = this.zFace.get(z.id) || (z.id % 2 ? 1 : -1);
    if (Math.abs(dx) > 0.5) f = dx > 0 ? 1 : -1;
    this.zFace.set(z.id, f);
    return f;
  }

  // ---------------------------------------------------------------- builders
  // Gates are Last War ribbons: a band that fades upward between thin posts in the gate's colour.
  // Between two gates: a glowing gold pillar that can be ridden, a plain grey post, or a red-and-white wall.
  buildGates() {
    const S = getShared();
    this.gates = [];
    const h = 1.85, y0 = 1.32;
    const postFor = (o, kind) => kind === 'mystery' ? S.postPurple : kind.startsWith('skill') ? S.postTeal : kind === 'gold' || kind === 'roulette' ? S.postGold : opGood(o) ? S.postBlue : S.postRed;
    for (const g of this.sim.gates) {
      const grp = new THREE.Group(); grp.position.z = g.z;
      const panels = [], n = g.ops.length, B = g.bounds;
      for (let s = 0; s < n; s++) {
        const x0 = B[s], x1 = B[s + 1], w = x1 - x0 - 0.16;
        const P = new GatePanel(w / h);
        const o = g.ops[s], kind = panelKind(o), good = opGood(o);
        P.draw(opLabel(o), good, 0, kind);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: P.tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
        mesh.position.set((x0 + x1) / 2, y0, 0);
        mesh.renderOrder = 3;
        grp.add(mesh);
        panels.push({ P, mesh, good, s, kind, mat: mesh.material });
      }
      // v9.3: one light, thin frame (the number-gate pack's) round the whole gate instead of a heavy coloured one per
      // panel: the panels carry the colour, and the middle stays clear so the gold post to ride is easy to see
      const frame = gateFrame(B[n] - B[0] - 0.05, 2.62, { name: 'NG_gate_gold', color: '#e9f2ff', thick: 0.8, opacity: 0.85 });
      frame.position.x = (B[0] + B[n]) / 2; grp.add(frame);
      const posts = [];
      for (let i = 1; i < n; i++) {
        let post;
        if (g.plain) { post = new THREE.Mesh(S.postGray, MAT.actor); post.userData.sharedGeo = true; }
        else if (g.wall) {
          post = new THREE.Mesh(S.gateWall, MAT.actor); post.userData.sharedGeo = true;
          // v8.1: a red-and-white road barrier (number-gate pack) across the lane line at its foot
          const bg = propGeo('PA_TrafficBarrier_1');
          if (bg) { const bar = new THREE.Mesh(bg, PROP_MAT); bar.userData.sharedGeo = true; bar.rotation.y = Math.PI / 2; bar.castShadow = true; post.add(bar); }
        }
        else {
          post = new THREE.Mesh(S.goldPillar, new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb000, emissiveIntensity: 1.0, roughness: 0.3, metalness: 0.2 }));
          post.scale.set(1.5, 1.1, 1.5);
          post.userData.sharedGeo = true;
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8, toneMapped: false }));
          glow.scale.set(2.2, 2.2, 1); glow.position.y = 0.4;
          post.add(glow);
        }
        post.position.x = B[i]; post.castShadow = true;
        grp.add(post); posts.push(post);
      }
      // crosshair badge over each panel of a gate that can be shot bigger
      const aims = [];
      if (g.shoot) for (const p of panels) {
        const a = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.icons['skill:aim'], depthWrite: false, toneMapped: false }));
        a.scale.set(0.95, 0.95, 1); a.position.set(p.mesh.position.x, 2.75, 0); a.renderOrder = 4;
        grp.add(a); aims.push(a);
      }
      this.group.add(grp);
      this.gates.push({ g, grp, panels, posts, aims, fade: 0 });
    }
  }

  // 倍数跑道: one glowing tile per multiplier, lit as the squad reaches it; a few soldiers stay on each lit tile
  buildLadder() {
    this.tiles = [];
    const L = this.sim.ladder;
    if (!L) return;
    const cols = ['#3d8bff', '#22c4d6', '#2fd07a', '#a3d93a', '#ffd23f', '#ffa21a', '#ff7a2a', '#ff4b6a', '#c46cff', '#ff3ad0'];
    L.tiles.forEach((t, k) => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 160;
      const x = c.getContext('2d');
      const col = cols[k % cols.length];
      x.fillStyle = col; x.globalAlpha = 0.9; x.fillRect(0, 0, 512, 160); x.globalAlpha = 1;
      x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 10; x.strokeRect(5, 5, 502, 150);
      x.font = '400 104px "Lilita One", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 14; x.strokeStyle = 'rgba(0,0,0,.35)'; x.strokeText('×' + t.m, 256, 86);
      x.fillStyle = '#fff'; x.fillText('×' + t.m, 256, 86);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, opacity: 0.55 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HW * 2 - 0.4, 3.3), mat);
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.03, t.z - 1.65); m.renderOrder = 1;
      this.group.add(m);
      this.tiles.push({ t, m, mat, men: [] });
    });
  }

  buildSplits() {
    for (const sp of this.sim.splits) {
      const len = sp.z0 - sp.z1;
      const m = new THREE.Mesh(splitWallGeo(len), MAT.actor);
      m.position.set(0, 0, sp.z0); m.castShadow = true;
      this.group.add(m);
    }
  }

  buildBarrels() { this.barrels = []; this.addBarrels(this.sim.barrels); }
  // the picture of the target a fish-table card stands for (a zombie portrait), shared by everything showing it
  cardTexture(card) {
    let t = this.cardTex.get(card);
    if (!t) { t = new THREE.TextureLoader().load(targetCard(card)); t.colorSpace = THREE.SRGBColorSpace; this.cardTex.set(card, t); }
    return t;
  }
  addBarrels(list) {
    const S = getShared();
    for (const r of list) {
      if (this.barrels.some(b => b.r === r)) continue;
      const grp = new THREE.Group(); grp.position.set(r.x, 0, r.z);
      if (r.kind !== 'cage') {
        // v8 Top Lords barrel: the hits left on its front, the reward standing on its lid.
        // v8.1: weapons, fire rate and skills come in the number-gate pack's supply crates (green; red for skills)
        // v9 滚桶: a barrel lying on its side rolls at the squad, the item it holds (number-gate pack icon) over it
        if (r.roll) {
          const body = new THREE.Mesh(S.wood, MAT.actor); body.castShadow = true; body.userData.sharedGeo = true;
          body.position.y = -BARREL_H / 2;
          const axis = new THREE.Group(); axis.rotation.z = Math.PI / 2; axis.add(body);
          const spin = new THREE.Group(); spin.position.y = 0.62; spin.add(axis);
          grp.add(spin);
          const icon = ROLL_ICON[r.kind] ? uiTexture(ROLL_ICON[r.kind]) : r.kind === 'skill' ? S.icons['skill:' + r.v] : S.icons[r.kind] || S.icons.men;
          const top = new THREE.Sprite(new THREE.SpriteMaterial({ map: icon, transparent: true, depthWrite: false, toneMapped: false }));
          top.scale.set(1.25, 1.25, 1); top.position.y = 2.2; grp.add(top);
          grp.scale.setScalar(1.2);
          this.group.add(grp);
          this.barrels.push({ r, grp, icon: top, body, spin, gone: 0, cage: false, inmates: [], v8: true, h: 1.24, rolling: true });
          continue;
        }
        const cg = !r.vault && CRATE_KINDS.has(r.kind) && crateGeo(r.kind);
        const body = cg ? new THREE.Mesh(cg.geo, PROP_MAT) : new THREE.Mesh(r.gold ? S.woodGold : S.wood, MAT.actor); body.castShadow = true; body.userData.sharedGeo = true;
        if (cg) { body.scale.setScalar(cg.k); body.position.y = 0.02; }
        const bh = cg ? cg.h : BARREL_H;
        grp.add(body);
        let top = null;
        if (r.kind === 'gun') top = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.gunTex, depthWrite: false, toneMapped: false }));
        else if (r.kind === 'shield' || r.kind === 'heal') top = new THREE.Sprite(new THREE.SpriteMaterial({ map: uiTexture(ROLL_ICON[r.kind]), transparent: true, depthWrite: false, toneMapped: false }));
        else if (r.kind === 'rate') top = new THREE.Sprite(new THREE.SpriteMaterial({ map: uiTexture('pickup_ammo'), transparent: true, depthWrite: false, toneMapped: false }));
        else if (r.kind === 'fish') { top = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.cardTexture(FISH[r.v] ? FISH[r.v].card : 4), transparent: true, depthWrite: false, toneMapped: false })); top.userData.card = true; }
        else if (r.kind === 'coin') { top = new THREE.Sprite(new THREE.SpriteMaterial({map:uiTexture('pickup_ammo'),transparent:true,depthWrite:false,toneMapped:false})); }
        else if (r.kind !== 'men') top = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.icons[r.kind === 'skill' ? 'skill:' + r.v : r.kind], depthWrite: false, toneMapped: false }));
        if (top && top.isSprite) { top.scale.set(top.userData.card ? 1.25 : 1.15, top.userData.card ? 1.75 : 1.15, 1); top.position.y = bh + 0.85; }
        if (top) grp.add(top);
        grp.scale.setScalar(r.vault ? 1.05 : 1.2);
        this.group.add(grp);
        this.barrels.push({ r, grp, icon: top, body, gone: 0, cage: false, inmates: [], v8: true, h: bh, crate: !!cg });
        continue;
      }
      // a cage of survivors to set free; update() draws them with the crowd
      const cage = new THREE.Mesh(S.cage, MAT.actor); cage.castShadow = true; cage.userData.sharedGeo = true;
      grp.add(cage);
      grp.scale.setScalar(1.35);
      this.group.add(grp);
      const inmates = [0, 1, 2, 3].map(i => ({ x: -0.75 + i * 0.5, z: i % 2 ? 0.25 : -0.2 }));
      this.barrels.push({ r, grp, icon: null, gone: 0, cage: true, inmates });
    }
  }

  // the leaping-fish tokens: bats swooping across the road (drawn by the crowd)
  buildFish() {
    this.fishes = this.sim.fish.map((f, i) => ({ f, i }));
  }

  buildHazards() {
    const S = getShared();
    this.hazards = [];
    for (const h of this.sim.hazards) {
      const grp = new THREE.Group(); grp.position.z = h.z;
      const v = { h, grp };
      if (h.kind === 'roller') {
        const len = h.x1 - h.x0 - 0.3, cx = (h.x0 + h.x1) / 2;
        const roll = new THREE.Mesh(rollerGeo(len), MAT.actor); roll.position.set(cx, 0.68, 0); roll.castShadow = true;
        const frame = new THREE.Mesh(rollerFrameGeo(len), MAT.actor); frame.position.x = cx;
        const warn = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.7), new THREE.MeshBasicMaterial({ map: S.warn, toneMapped: false }));
        warn.rotation.x = -Math.PI / 2; warn.position.set(cx, 0.02, 1.4);
        grp.add(roll, frame, warn);
        v.spin = roll;
      } else if (h.kind === 'saw') {
        const rail = new THREE.Mesh(sawRailGeo(ROAD_HW * 2), MAT.actor); rail.receiveShadow = true;
        const blade = new THREE.Mesh(sawBladeGeo(h.r), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.85 }));
        blade.position.y = 0.95; blade.castShadow = true;
        grp.add(rail, blade);
        v.blade = blade;
      } else if (h.kind === 'hole') {
        const w = h.x1 - h.x0, cx = (h.x0 + h.x1) / 2;
        const deco = new THREE.Mesh(new THREE.PlaneGeometry(w, h.len), new THREE.MeshBasicMaterial({ map: S.hole, toneMapped: false }));
        deco.rotation.x = -Math.PI / 2; deco.position.set(cx, 0.03, -h.len / 2);
        const warn = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.6), new THREE.MeshBasicMaterial({ map: S.warn, toneMapped: false }));
        warn.rotation.x = -Math.PI / 2; warn.position.set(cx, 0.03, 1.2);
        grp.add(deco, warn);
      } else if (h.kind === 'wave') {
        const w = h.x1 - h.x0, cx = (h.x0 + h.x1) / 2, side = h.side === 'L' ? -1 : 1;
        const geo = new THREE.CylinderGeometry(2.6, 2.6, h.len, 24, 1, true, 0, Math.PI);
        geo.rotateX(Math.PI / 2);
        const water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2fa6d4, transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.1, side: THREE.DoubleSide, emissive: 0x0a4a7a, emissiveIntensity: 0.35 }));
        water.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        water.position.set(cx + side * w * 0.25, 0.2, -h.len / 2);
        const warn = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.6), new THREE.MeshBasicMaterial({ map: S.warn, toneMapped: false }));
        warn.rotation.x = -Math.PI / 2; warn.position.set(cx, 0.03, 1.2);
        grp.add(water, warn);
        v.water = water; v.cx = cx; v.w = w;
      }
      this.group.add(grp);
      this.hazards.push(v);
    }
  }

  buildCoins() {
    const S = getShared();
    const n = this.sim.coinsOnRoad.length;
    this.roadCoins = null;
    if (!n) return;
    const m = new THREE.InstancedMesh(S.coin, S.coinMat, n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = true; m.userData.sharedGeo = true;
    this.group.add(m);
    this.roadCoins = m;
  }

  ensureBoss() {
    const b = this.sim.boss;
    if (!b || this.boss || b.passive) return;
    const spec = bossSpec(b.kind, b.name);
    if (b.kind === 'kraken') {
      // the figures stand in an arc just past the far edge of the arena
      const k = new BossRow(spec, spec.arms || 5, b.big ? 1.25 : 1.05);
      k.root.position.set(0, 0, this.sim.platZ - 9.5);
      this.group.add(k.root);
      this.boss = { rig: k, row: true, fall: 0, spec };
    } else {
      const r = new Rig(spec, b.big ? 1.25 : 1);
      r.play(r.K.roar, { once: true, then: r.K.walk });
      this.group.add(r.root);
      this.boss = { rig: r, fall: 0, spec, x: b.x };
      // a boss that waits beyond the platform stands on a mound of rubble (the far side can be water)
      if (!this.sim.L.journey && b.z < this.sim.platZ - PLATFORM_R - 1) {
        const m = rubbleMound(b.r + 1.2); m.position.x = b.x; m.position.z = b.z;
        this.bossMound=m;
        this.group.add(m);
      }
    }
    this.fx.puff(b.x, 0.5, b.z, 10, [0.6, 0.55, 0.5], 2.4);
  }

  updateBoss(dt) {
    const b = this.sim.boss, V = this.boss, R = V.rig;
    R.update(dt);
    if (V.fall > 0) {
      // it plays its death and fades away (the 宝箱怪 stays open while its cards are drawn)
      V.fall += dt;
      if (V.spec.keep) return;
      const a = V.fall < 2.2 ? 1 : Math.max(0, 1 - (V.fall - 2.2) / 1.2);
      for (const r of V.row ? R.arms : [R]) r.alpha = a;
      if (a <= 0) R.root.visible = false;
      return;
    }
    if (!V.row) {
      R.root.position.set(b.x, 0, b.z);
      if (Math.abs(b.x - V.x) > 0.004) R.face(b.x - V.x);
      V.x = b.x;
    }
    if (b.flash > 0) R.flash(1);
    if (b.tele && V.tele !== b.tele) {
      // wind up so the blow lands as the warning runs out
      V.tele = b.tele;
      const arm = V.row ? R.armAt(b.tele.x) : R;
      const dur = arm.duration(arm.K.attack);
      arm.play(arm.K.attack, { once: true, speed: dur / (b.tele.dur + 0.3), then: V.row ? arm.K.idle : arm.K.walk });
    } else if (!V.row && !R.then) {
      if (b.eating) R.play(R.K.attack, { speed: 1.25 });
      else R.play(R.K.walk, { speed: 0.85 });
    }
  }

  // Boss warnings on the ground: red circles that fill up, or a striped band where a sweep will pass. Thrown moves
  // (rain, multi) show what is coming in the air the whole time and it lands as the warning runs out.
  onTele(T) {
    const b = this.sim.boss, spec = b ? bossSpec(b.kind, b.name) : null;
    const v = { T, parts: [], fills: [], rings: [], shots: [], band: null };
    // warnings draw over the crowd (no depth test), so a circle under 300 soldiers still reads
    const add = m => { m.renderOrder = 5; if (!m.userData.shot) m.material.depthTest = false; this.group.add(m); v.parts.push(m); return m; };
    for (const q of T.shapes) {
      if (q.type === 'rect') {
        const w = q.x1 - q.x0, h = q.z1 - q.z0, cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2;
        const tex = hazardTexture().clone(); tex.needsUpdate = true; tex.repeat.set(w / 2.2, h / 2.2);
        const band = add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: 0xff3a1a, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false })));
        band.rotation.x = -Math.PI / 2; band.position.set(cx, 0.07, cz);
        // the sweep's leading edge crosses the band as the warning fills
        const edge = add(new THREE.Mesh(new THREE.PlaneGeometry(0.35, h), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false })));
        edge.rotation.x = -Math.PI / 2; edge.position.set(q.side > 0 ? q.x1 : q.x0, 0.08, cz);
        v.band = { band, edge, q, tex };
      } else {
        const ring = add(new THREE.Mesh(new THREE.RingGeometry(q.r - 0.16, q.r, 48), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false })));
        const fill = add(new THREE.Mesh(new THREE.CircleGeometry(q.r, 48), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false })));
        for (const m of [ring, fill]) { m.rotation.x = -Math.PI / 2; m.position.set(q.x, 0.07, q.z); }
        v.rings.push(ring); v.fills.push(fill);
        if ((T.move === 'rain' || T.move === 'multi') && b) {
          const pm = projectileMesh(spec.shot); pm.userData.shot = true; pm.castShadow = true;
          const m = add(pm);
          const from = new THREE.Vector3(b.x + rand(-1.2, 1.2), b.still ? 1.5 : 4.2, b.still ? this.sim.platZ - 8 : b.z + 0.8);
          m.position.copy(from);
          v.shots.push({ m, from, to: new THREE.Vector3(q.x, 0.3, q.z), spin: rand(4, 9), delay: T.move === 'multi' ? 0 : rand(0, 0.35), col: spec.color });
        }
      }
    }
    this.teles.push(v);
  }
  onSlam(T, n) {
    const b = this.sim.boss, col = b ? bossSpec(b.kind, b.name).color : [1, 0.55, 0.25];
    for (const q of T.shapes) {
      if (q.type === 'rect') {
        // the sweep: a wall of blasts across the band
        const cz = (q.z0 + q.z1) / 2;
        for (let i = 0; i <= 6; i++) {
          const x = q.x0 + (q.x1 - q.x0) * (q.side > 0 ? 1 - i / 6 : i / 6);
          this.fx.boom(x, 0.5, cz + rand(-1.5, 1.5), 2.2, col);
          this.fx.puff(x, 0.4, cz + rand(-2.5, 2.5), 3, [0.6, 0.55, 0.5], 2.2);
        }
        this.fx.ring((q.x0 + q.x1) / 2, 0.2, cz, 7, col, 0.4);
      } else {
        const big = q.r >= 2.2;
        this.fx.boom(q.x, 0.4, q.z, big ? 2.6 : 1.9, col);
        this.fx.ring(q.x, 0.2, q.z, q.r * 2.6, col, 0.45);
        this.fx.puff(q.x, 0.3, q.z, big ? 14 : 6, [0.7, 0.62, 0.55], big ? 2.6 : 1.8);
        this.fx.spark(q.x, 0.6, q.z, big ? 14 : 6, col, 7, 0.5);
      }
    }
    if (!n) this.fx.spark(this.sim.squad.x, 1.4, this.sim.squad.z, 18, [0.5, 1, 0.6], 6, 0.5);
    this.dropTele(T);
  }
  // 兑换门: a golden gate across the arena; the squad runs through it on the way home and turns into coins
  showExchangeGate(z, label = '1 兵 = 100') {
    const S = getShared(), h = 2.3, w = (ROAD_HW + 0.6) * 2;
    const grp = new THREE.Group(); grp.position.z = z;
    const P = new GatePanel(w / h); P.draw(label, true, 0, 'gold');
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: P.tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    mesh.position.y = 1.5; mesh.renderOrder = 3; grp.add(mesh);
    // v8.1: framed by the number-gate pack's gold gate
    grp.add(gateFrame(w + 0.3, 3.05, { thick: 1.8 }));
    grp.scale.set(1, 0.01, 1);
    this.group.add(grp);
    this.xgate = { grp, P, mesh, t: 0 };
    this.fx.ring(0, 0.3, z, 12, [1, 0.85, 0.35], 0.5);
  }
  pulseExchangeGate() { if (this.xgate) this.xgate.flash = 1; }
  hideExchangeGate() { if (this.xgate) this.xgate.grp.visible = false; }
  onBossBlink(d) {
    const b = this.sim.boss; if (!b) return;
    for (const x of [d.from, d.to]) { this.fx.puff(x, 1.5, b.z, 10, [0.75, 0.45, 1], 2.4); this.fx.spark(x, 2, b.z, 14, [1, 0.8, 1], 7, 0.5); }
  }
  onShieldBlock(z) { this.fx.spark(z.x, 1.1, z.z + 0.6, 4, [0.7, 0.9, 1], 5, 0.25); }
  onBossRage() {
    const V = this.boss, b = this.sim.boss;
    if (V && V.rig && V.rig.setRage) V.rig.setRage(true);
    if (b) { this.fx.boom(b.x, 2, b.still ? this.sim.platZ - 9 : b.z, 3.2, [1, 0.25, 0.15]); this.fx.ring(b.x, 0.3, b.still ? this.sim.platZ - 9 : b.z, 9, [1, 0.3, 0.2], 0.5); }
  }
  onSummon(list) { for (const z of list) this.fx.puff(z.x, 0.4, z.z, 4, [0.45, 0.6, 0.4], 1.6); }
  dropTele(T) {
    for (const v of this.teles) if (v.T === T) { v.done = true; for (const m of v.parts) { this.group.remove(m); m.geometry.dispose(); if (m.userData.sharedMat) continue; if (m.material.map) m.material.map.dispose(); m.material.dispose(); } }
    this.teles = this.teles.filter(v => !v.done);
  }
  updateTeles(dt = 0.016) {
    for (const v of this.teles) {
      const k = Math.min(1, v.T.t / v.T.dur);
      for (const f of v.fills) { f.scale.setScalar(0.15 + k * 0.85); f.material.opacity = 0.25 + k * 0.3; }
      for (const r of v.rings) r.material.opacity = 0.6 + Math.abs(Math.sin(this.t * (8 + k * 14))) * 0.4;
      if (v.band) {
        const { band, edge, q, tex } = v.band;
        tex.offset.x = -this.t * 1.6 * q.side;
        band.material.opacity = 0.4 + Math.abs(Math.sin(this.t * (6 + k * 12))) * 0.35;
        const x = q.side > 0 ? q.x1 - (q.x1 - q.x0) * k : q.x0 + (q.x1 - q.x0) * k;
        edge.position.x = x;
      }
      for (const sh of v.shots) {
        const e = clamp((v.T.t - sh.delay) / Math.max(0.2, v.T.dur - sh.delay), 0, 1);
        sh.m.position.lerpVectors(sh.from, sh.to, e);
        sh.m.position.y = sh.from.y * (1 - e) + sh.to.y * e + Math.sin(e * Math.PI) * 5.5;
        sh.m.rotation.x += sh.spin * dt; sh.m.rotation.z += sh.spin * dt * 0.7;
        sh.m.visible = e > 0;
        if (e > 0 && e < 1 && Math.random() < 0.6) this.fx.puff(sh.m.position.x, sh.m.position.y, sh.m.position.z, 1, sh.col || [1, 0.7, 0.4], 0.9);
      }
    }
    const b = this.sim.boss;
    if (!b || !b.alive) for (const v of [...this.teles]) this.dropTele(v.T);
  }

  // v8 结尾惊喜
  startFinale(F) {
    this.finale = new FinaleView(this, F);
    if (F.type === 'vault') this.addBarrels(this.sim.barrels.filter(r => r.vault));
    // the boss (if any) is gone by now; the passive targets are drawn by FinaleView
    if (this.boss) this.boss.rig.root.visible = false;
  }

  // where soldiers leap to during the 兵 → 金炮弹 load (the bonus cannon's hopper)
  setLoadTarget(p) { this.loadTarget = p; }
  // send the outermost n drawn soldiers flying into the cannon
  launchToCannon(n) {
    const k = Math.min(n, this.vis);
    for (let j = 0; j < k; j++) {
      const i = this.vis - 1 - j;
      this.jumpers.push({ x0: this.sx[i], z0: this.sz[i], t: -j * 0.012, dur: (this.jumpArc !== undefined && this.jumpArc < 1 ? 1.1 : 0.42) + Math.random() * 0.12, spin: rand(-6, 6) });
    }
    this.vis -= k;
  }

  // ---------------------------------------------------------------- event hooks (called by game)
  onCount({ before, after, positions, cause }) {
    if (after >= before * 1.8 && after - before >= 20) this.boost = 0.9;
    const vb = Math.min(VIS_MAX, before), va = Math.min(VIS_MAX, after);
    const s = this.sim.squad;
    if (va > vb) {
      for (let i = vb; i < va; i++) {
        this.sx[i] = s.x + SLOT[i][0]; this.sz[i] = s.z + SLOT[i][1]; this.born[i] = this.t + (i - vb) * 0.004;
      }
      this.fx.spark(s.x, 1, s.z, Math.min(18, va - vb), [0.5, 0.8, 1], 5, 0.5);
    } else if (va < vb && (cause === 'rainbow' || cause === 'bricks')) {
      // into a gap of the 彩虹滚轮 / against the 金砖墙 (FinaleView draws them falling or charging)
    } else if (va < vb) {
      if (positions) {
        // trap kills: the soldiers die where the trap caught them; the rest of the squad closes ranks
        positions.slice(0, 60).forEach((p, j) => {
          this.dying.push({ x: p[0], z: p[1], t: 0, dir: rand(-1, 1), back: rand(0.6, 1) });
          if (j < 10) this.fx.spark(p[0], 0.8, p[1], 3, [1, 0.25, 0.15], 4, 0.5);
        });
      } else {
        for (let i = va; i < vb; i++) {
          this.dying.push({ x: this.sx[i], z: this.sz[i], t: 0, dir: rand(-1, 1), back: rand(0.6, 1) });
          if (i - va < 8) this.fx.spark(this.sx[i], 0.8, this.sz[i], 2, [1, 0.3, 0.2], 3, 0.45);
        }
      }
      if (vb - va >= Math.max(4, vb * 0.08)) this.hurt = 0.5;
    }
    this.vis = va;
  }
  onZombieDie(z, boom) {
    if (z.mb) { const v = this.mbs.get(z.id); if (v) { v.fall = 0.0001; v.rig?.play(v.rig.K.die, { once: true }); } this.fx.boom(z.x, 2.5, z.z, 3); return; }
    this.zdying.push({ x: z.x, z: z.z, type: this.zType(z), face: this.zFace.get(z.id) || -1, brute: z.brute, t: 0, tint: this.zTint.get(z.id), boom: !!boom });
    // v9: a monster falls with a splat on the road; only elites burst
    this.fx.splat(z.x, z.z, z.brute ? 2.2 : 1.1);
    if (z.brute || boom) this.fx.burst(z.x, 1.2, z.z, z.brute ? 2.4 : 1.6, [1, 0.7, 0.35]);
    else this.fx.puff(z.x, 0.5, z.z, 2, [0.42, 0.3, 0.28], 0.7);
    this.fx.spark(z.x, 0.9, z.z, z.brute ? 10 : 3, [1, 0.5, 0.3], 4, 0.3);
  }
  // v9 滚桶 crushing the front of the squad, 护盾 breaking, the 幻影 mini-boss blinking
  onRollHit(r) {
    this.fx.splinter(r.x, 0.4, r.z, 14, '#b06d34', 1.2);
    this.fx.burst(r.x, 0.8, r.z, 2.6, [1, 0.7, 0.4]);
    this.fx.puff(r.x, 0.4, r.z, 6, [0.75, 0.7, 0.62], 1.6);
  }
  onShieldPop(left) {
    const s = this.sim.squad;
    this.shieldHit = 1;
    if (!left) this.shieldGone = 0.6;      // the last layer: the dome bursts outward and fades
    this.fx.ring(s.x, 0.4, s.z, (s.R + 1) * 2.4, [0.5, 0.8, 1], 0.5);
    this.fx.zap(s.x, 1.2, s.z, 3, [0.6, 0.85, 1]);
  }
  onMbBlink(d) { for (const x of [d.from, d.to]) { this.fx.puff(x, 1.2, d.z.z, 8, [0.75, 0.45, 1], 2); this.fx.zap(x, 1.4, d.z.z, 2.2, [0.85, 0.6, 1]); } }
  onZombieHit(z) { this.fx.burst(z.x, 0.8, z.z + 0.6, 1.2, [1, 0.45, 0.3]); this.fx.splat(z.x, z.z + 0.6, 0.9); }
  onSmash(z) {
    const v = this.mbs.get(z.id); if (v) v.fall = 0.0001;
    this.fx.boom(z.x, 1.5, z.z + 1, 4, [1, 0.4, 0.2]);
    this.fx.ring(z.x, 0.3, z.z + 1, 12, [1, 0.3, 0.2], 0.5);
  }
  onAmbush(z) { this.fx.puff(z.x, 0.5, z.z, 4, [0.75, 0.65, 0.5], 1.2); }
  onBarrel(r) {
    const b = this.barrels.find(q => q.r === r);
    if (b && b.v8) {
      const y = BARREL_H * 0.7;
      this.fx.splinter(r.x, 0.3, r.z, 12, b.crate ? (r.kind === 'skill' ? '#8f2f2a' : '#557a35') : r.gold ? '#ffc21a' : '#b06d34', 1);
      if (b.crate) this.fx.burst(r.x, 0.8, r.z, 2.2, [1, 0.85, 0.5]);
      this.fx.puff(r.x, 0.6, r.z, 5, [0.8, 0.72, 0.6], 1.1);
      this.fx.flash(r.x, y, r.z, 2.4, [1, 0.85, 0.5], 0.12);
      if (r.kind === 'men') {
        // the soldier on the lid (and his mates) jump into the squad
        const n = Math.min(6, 1 + Math.floor((r.v * (this.sim.army || 1)) / 20));
        for (let i = 0; i < n; i++) this.joiners.push({ x0: r.x + rand(-0.4, 0.4), y0: BARREL_H * 1.2, z0: r.z, t: -i * 0.05, dur: 0.55 + Math.random() * 0.15 });
      } else if (r.kind === 'coin' || r.kind === 'fish') {
        this.fx.spark(r.x,y+.6,r.z,8,[.6,.75,.45],4,.4);
        if (r.kind === 'fish') this.fx.spark(r.x, y + 1, r.z, 16, [1, 0.85, 0.3], 6, 0.5);
      } else if (r.kind === 'gun') this.fx.spark(r.x, y + 1, r.z, 22, [1, 0.8, 0.25], 8, 0.6);
      if (b.icon && b.icon.isSprite) {
        // the reward flies off the lid
        const ic = b.icon; b.grp.remove(ic); ic.position.set(r.x, BARREL_H * 1.2 + 0.85, r.z); this.group.add(ic);
        this.flyers = this.flyers || []; this.flyers.push({ m: ic, t: 0, to: r.kind === 'gun' ? 'squad' : 'up' });
      }
      b.gone = 0.001;
      return;
    }
    if (r.kind === 'cage') {
      this.fx.shatter(r.x, 1.2, r.z, 22, '#9aa2ae', 1.1);
      this.fx.spark(r.x, 1.2, r.z, 22, [0.5, 0.8, 1], 7, 0.6);
      this.fx.ring(r.x, 1, r.z, 7, [0.5, 0.8, 1], 0.5);
    } else {
      this.fx.shatter(r.x, 0.6, r.z, 16, '#a8682f', 0.9);
      this.fx.puff(r.x, 0.6, r.z, 6, [0.8, 0.75, 0.6], 1.2);
      this.fx.spark(r.x, 1.2, r.z, 16, r.kind === 'coin' ? [1, 0.85, 0.3] : r.kind === 'men' ? [0.5, 0.8, 1] : r.kind === 'gun' ? [1, 0.6, 0.2] : [0.5, 1, 0.5], 7, 0.6);
      if (r.kind === 'coin') this.fx.coinBurst(r.x, 1, r.z, 14, 0.9);
    }
    if (b) b.gone = 0.001;
  }
  onBarrelBoom(r) {
    this.fx.boom(r.x, 1.0, r.z, 2.6, [1, 0.55, 0.2]);
    this.fx.ring(r.x, 0.4, r.z, 7, [1, 0.6, 0.25], 0.5);
    this.fx.puff(r.x, 1.2, r.z, 12, [0.45, 0.4, 0.38], 2.4);
    this.fx.flash(r.x, 1.2, r.z, 6, [1, 0.6, 0.2], 0.2);
  }
  onLucky(x, z, mult) {
    this.fx.coinBurst(x, 0.8, z, mult >= 3 ? 8 : 3, 0.7);
    if (mult >= 2) this.fx.ring(x, 0.6, z, 3 + mult, [1, 0.85, 0.3], 0.4);
  }
  onCoinPick(c) {
    this.fx.glow.spawn({ x: c.x, y: 1, z: c.z, vy: 3, life: 0.35, size0: 1.1, size1: 0.2, r: 1, g: 0.85, b: 0.35, a0: 1 });
  }
  onTrap(h, positions) {
    const v = this.hazards.find(q => q.h === h);
    if (h.kind === 'hole' || h.kind === 'wave') positions.slice(0, 8).forEach(p => this.fx.puff(p[0], -0.2, p[1], 2, [0.85, 0.95, 1], 0.9));
    if (v && v.spin) v.kick = 0.25;
  }
  redrawGate(g) {
    const v = this.gates.find(q => q.g === g);
    if (!v) return;
    for (const p of v.panels) {
      const o = g.ops[p.s];
      if (o.op !== '~') continue;
      const good = opGood(o);
      p.P.draw(opLabel(o), good, 0, 'roulette');
      p.good = good;
    }
  }
  onGateHit(g, side) {
    const v = this.gates.find(q => q.g === g);
    if (!v) return;
    const p = v.panels[side];
    const o = g.ops[side];
    if (o.op !== '+') return;
    const good = opGood(o);
    // v9: redraw only when the number changes (hundreds of arrows a second land on a gate)
    if (opLabel(o) !== p.P.label || good !== p.good) p.P.draw(opLabel(o), good, 0.35, p.kind);
    if (good !== p.good) this.fx.ring(p.mesh.position.x, 1.2, g.z, 4, [0.5, 0.75, 1], 0.4);
    p.good = good;
    p.pulse = 1;
  }
  // v9: a panel shot to its limit wears a flashing gold MAX
  onGateMax(g, side) {
    const v = this.gates.find(q => q.g === g);
    if (!v) return;
    const p = v.panels[side];
    if (p.maxSp) return;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: maxTexture(), transparent: true, depthWrite: false, toneMapped: false }));
    sp.material.userData.shared = false;
    sp.scale.set(2.2, 0.82, 1); sp.position.set(p.mesh.position.x, 3.25, 0.05); sp.renderOrder = 5;
    v.grp.add(sp); p.maxSp = sp;
    this.fx.ring(p.mesh.position.x, 1.4, g.z, 5, [1, 0.85, 0.3], 0.45);
  }
  onTile(t) {
    const v = this.tiles.find(q => q.t === t);
    if (!v) return;
    v.mat.opacity = 1; v.flash = 1;
    for (let i = 0; i < 6; i++) v.men.push({ x: -3.6 + i * 1.45 + rand(-0.3, 0.3), z: t.z - 1.6 + rand(-0.6, 0.6), ph: rand(0, 6) });
    this.fx.ring(0, 0.3, t.z - 1.6, 9, [1, 0.9, 0.4], 0.5);
    this.fx.spark(0, 1, t.z - 1.6, 20, [1, 0.85, 0.35], 8, 0.6);
  }
  // lanes: the panels the squad went through; ops: what they turned out to be (mystery revealed)
  onGate(g, lanes, ops) {
    const v = this.gates.find(q => q.g === g);
    if (!v) return;
    v.fade = 0.0001; v.lanes = lanes;
    lanes.forEach((ln, j) => {
      const p = v.panels[ln], op = ops[j];
      const good = opGood(op);
      if (op.mystery) { p.P.draw(opLabel(op), good, 0.5, ''); this.fx.spark(p.mesh.position.x, 1.8, g.z, 24, [0.8, 0.5, 1], 8, 0.6); }
      this.fx.ring(p.mesh.position.x, 1.2, g.z, 5, good ? [0.35, 0.6, 1] : [1, 0.35, 0.25], 0.45);
      this.fx.flash(p.mesh.position.x, 1.3, g.z, 2.6, good ? [0.3, 0.5, 0.9] : [0.9, 0.3, 0.2], 0.14);
    });
    if (lanes.length > 1) {
      const x = (v.panels[lanes[0]].mesh.position.x + v.panels[lanes[1]].mesh.position.x) / 2;
      this.fx.spark(x, 2.4, g.z, 30, [1, 0.8, 0.25], 9, 0.6);
      this.fx.ring(x, 1.2, g.z, 7, [1, 0.75, 0.2], 0.55);
    }
  }
  // 兵雨: a helicopter crosses and reinforcements float down onto the squad
  onDrop(n) {
    const heli = makeHelicopter();
    heli.scale.setScalar(1.1);
    heli.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.group.add(heli);
    const fall = [];
    // they leave the helicopter as it passes over the middle of the road
    for (let i = 0; i < Math.min(36, n); i++) fall.push({ i, ox: rand(-2.6, 2.6), oz: rand(-1.6, 1.6), t: -0.75 - i * 0.012, dur: 0.75 + Math.random() * 0.25, x0: 0, y0: 8, z0: 0 });
    this.drops.push({ heli, t: 0, fall });
  }

  onFishKill(f) {
    this.fx.coinBurst(f.x, f.y, f.z, 10, 0.8);
    this.fx.flash(f.x, f.y, f.z, 3, [1, 0.85, 0.4], 0.2);
    this.fx.spark(f.x, f.y, f.z, 14, [1, 0.85, 0.3], 6, 0.6);
  }
  onBossHit(x, z) { if (Math.random() < 0.35) this.fx.spark(x, 2 + Math.random() * 2, z, 2, [1, 0.6, 0.3], 4, 0.4); }
  onBossDie() {
    const b = this.sim.boss;
    // the last boss (宝箱怪) opens: gold coins circle it once before the flip screen opens
    if (b.kind === 'magician') {
      this.orbit = { t: 0, x: b.x, z: b.z, cards: [] };
      for (let i = 0; i < 5; i++) { const m = projectileMesh('coin'); m.renderOrder = 6; this.group.add(m); this.orbit.cards.push(m); }
    }
    this.fx.boom(b.x, 2.5, b.z, 3.5);
    this.fx.puff(b.x, 1, b.z, 14, [0.5, 0.45, 0.45], 3);
    if (this.boss) {
      this.boss.fall = 0.0001;
      const R = this.boss.rig;
      R.play(R.K.die, { once: true });
    }
  }
  // ---------------------------------------------------------------- per frame
  update(dt, labels) {
    this.t += dt;
    const sim = this.sim, s = sim.squad;
    const dzs = s.z - this.lastSZ; this.lastSZ = s.z;
    const running = s.speed > 0.5;
    const standing = sim.phase === 'boss';
    this.hurt = Math.max(0, this.hurt - dt);

    // soldiers: the hero's back view firing ahead; the heroes ride the pickup or march inside the squad
    const CR = this.crowd, man = this.man; CR.begin();
    const fx0 = formationX(this.vis, s.x), cz = CENT[this.vis][1];
    const drawMax = this.drawMax || VIS_MAX;
    const mode = this.heroMode || 'truck';
    for (let i = 0; i < this.vis; i++) {
      const tx = clamp(fx0 + SLOT[i][0], -LIM, LIM), tz = s.z + SLOT[i][1] - cz;
      this.sz[i] += dzs;
      this.sx[i] = damp(this.sx[i], tx, 42, dt);
      this.sz[i] = damp(this.sz[i], tz, 20, dt);
      const age = this.t - this.born[i];
      const sc = age < 0 ? 0 : age < 0.28 ? easeOutBack(age / 0.28) : 1;
      if (sc <= 0 || i >= drawMax || (i < 4 && mode === 'mix')) continue;
      const bob = running ? Math.abs(Math.sin(this.t * 11 + i * 0.77)) * 0.05 : 0;
      man(this.sx[i], bob, this.sz[i], 'run', this.t + i * 0.173, sc);
    }
    // the fallen topple sideways, sink and fade (the hero art has no death animation)
    for (const d of this.dying) {
      d.t += dt;
      const k = Math.min(1, d.t / 0.35), sink = d.t > 1.0 ? (d.t - 1.0) * 1.2 : 0;
      man(d.x, -sink, d.z + Math.min(d.t, 0.3) * 1.2, 'idle', 0, 1, d.dir * k * 1.35, d.t > 0.9 ? Math.max(0, 1 - (d.t - 0.9) * 1.6) : 1);
    }
    this.dying = this.dying.filter(d => d.t < 1.6);
    // soldiers left cheering on the lit 倍数 tiles
    for (const v of this.tiles) {
      if (v.flash) v.flash = Math.max(0, v.flash - dt * 2);
      for (const m of v.men) man(m.x, Math.abs(Math.sin(this.t * 7 + m.ph)) * 0.12, m.z, 'idle', this.t + m.ph);
    }
    // reinforcements floating down from the helicopter
    for (const d of this.drops) for (const f of d.fall) {
      if (f.t < 0 || f.t > f.dur) continue;
      const q = f.t / f.dur, e = 1 - (1 - q) * (1 - q);
      const x = f.x0 + (s.x + f.ox - f.x0) * e, z = f.z0 + (s.z + f.oz - f.z0) * e;
      const y = (1 - q) * f.y0 + Math.sin(this.t * 7 + f.ox) * 0.15 * (1 - q);
      man(x, y, z, 'idle', 0.25 + q * 0.5, 1, Math.sin(this.t * 5 + f.oz) * 0.25 * (1 - q));
    }
    if (this.jumpers.length) {
      const P = this.loadTarget;
      for (const j of this.jumpers) {
        j.t += dt;
        if (j.t < 0) { man(j.x0, 0, j.z0, 'run', this.t); continue; }
        const k = Math.min(1, j.t / j.dur);
        const walk = this.jumpArc !== undefined && this.jumpArc < 1;
        // walking (the 兑换门 run) keeps each soldier's lane; jumping (into a hopper) converges on the target
        const x = walk ? j.x0 : j.x0 + (P.x - j.x0) * k, z = j.z0 + (P.z - j.z0) * k;
        const y = (P.y - 0.4) * k + Math.sin(k * Math.PI) * (this.jumpArc ?? 2.6);
        if (walk) man(x, Math.abs(Math.sin(j.t * 14)) * 0.06, z, 'run', j.t * 1.3);
        else man(x, y, z, 'idle', k * 0.9, 1 - k * 0.5, j.spin * k * 0.3);
        if (k >= 1 && !j.done) { j.done = true; this.onJumperArrive?.(x, z); }
      }
      this.jumpers = this.jumpers.filter(j => !j.done);
    }
    // the heroes: four on the pickup at the back of the column, or the four slots at the squad's heart
    const HS = TRUCK_HERO.scale;
    if (this.truck) this.truck.visible = mode === 'truck' && this.vis > 0;
    if (this.truck && this.vis > 0 && mode === 'truck') {
      // the pickup sits in the gap the formation leaves for it and follows the hand exactly as the soldiers do
      // (same target, same damping), so it never slides into them
      const T = this.truck, H = hole(), tzz = s.z + (H ? H.hz : TRUCK.hz) - cz;
      const prevX = this.truckX;
      this.truckX = this.truckZ === null ? fx0 : damp(this.truckX, fx0, 42, dt);
      this.truckZ = this.truckZ === null ? tzz : damp(this.truckZ + dzs, tzz, 20, dt);
      const vx = dt > 0 ? (this.truckX - prevX) / dt : 0;
      this.truckYaw = damp(this.truckYaw || 0, -clamp(vx * 0.02, -0.12, 0.12), 10, dt);
      T.position.set(this.truckX, running ? Math.abs(Math.sin(this.t * 9)) * 0.03 : 0, this.truckZ);
      T.rotation.set(0, this.truckYaw, running ? -0.015 : 0);
      // two in the bed, two on the roof rack, all firing ahead with short tracers
      const bedY = this.truckTop * 0.5, roofY = this.truckTop * 0.98, L = this.truckLen;
      const seats = [[-0.27, bedY, L * 0.3], [0.27, bedY, L * 0.3], [-0.25, roofY, L * 0.02], [0.25, roofY, L * 0.02]];
      const c = Math.cos(T.rotation.y), sn = Math.sin(T.rotation.y);
      const ft = this.heroFire || (this.heroFire = [0, 0, 0, 0]);
      for (let h = 0; h < 4; h++) {
        const [ox, oy, oz] = seats[h];
        const hx = this.truckX + ox * c + oz * sn, hy = T.position.y + oy, hz = this.truckZ - ox * sn + oz * c;
        man(hx, hy, hz, 'shoot', this.t + h * 0.31, HS, 0, 1, h % 2 ? 1 : -1);
        if (!sim.bullets.length) continue;
        ft[h] -= dt;
        if (ft[h] <= 0) {
          ft[h] = 0.11 + h * 0.013;
          const mx = hx + 0.1, my = hy + 1.1, mz = hz - 0.4;
          this.fx.tracer(mx, my, mz, (Math.random() - 0.5) * 3, -58);
          this.fx.muzzle(mx, my, mz - 0.15, 0.55, Math.random() * 0.6 - 0.3);
        }
      }
    } else if (this.vis > 0 && mode === 'mix') {
      for (let h = 0; h < Math.min(4, this.vis); h++) man(this.sx[h], 0, this.sz[h] - 0.05, running ? 'run' : 'shoot', this.t + h * 0.31, HS);
    }
    // soldiers jumping off broken barrels into the squad
    for (const j of this.joiners) {
      j.t += dt;
      if (j.t < 0) continue;
      const k = Math.min(1, j.t / j.dur), x = j.x0 + (s.x - j.x0) * k, z = j.z0 + (s.z - j.z0) * k, y = j.y0 * (1 - k) + Math.sin(k * Math.PI) * 2.2;
      man(x, y, z, 'idle', 0.2 + k * 0.6);
      if (k >= 1 && !j.done) { j.done = true; this.fx.spark(x, 1, z, 4, [0.5, 0.8, 1], 4, 0.4); }
    }
    this.joiners = this.joiners.filter(j => !j.done);
    if (this.finale) this.finale.drawCrowd(CR, man, dt);
    // rewards flying off broken barrels
    if (this.flyers) {
      for (const f of this.flyers) {
        f.t += dt;
        if (f.to === 'squad') { const k = Math.min(1, f.t / 0.5); f.m.position.x += (s.x - f.m.position.x) * k * 0.3; f.m.position.z += (s.z - f.m.position.z) * k * 0.3; f.m.position.y += dt * 2; }
        else f.m.position.y += dt * 5;
        f.m.scale.multiplyScalar(1 + dt * 1.2); f.m.material.opacity = Math.max(0, 1 - f.t * 1.8); f.m.material.transparent = true;
        if (f.t > 0.6) { this.group.remove(f.m); f.m.material.dispose(); f.dead = true; }
      }
      this.flyers = this.flyers.filter(f => !f.dead);
    }

    // zombies (mini-bosses are live skeletons, below); the multiple each one pays floats over its head
    const BG = this.badges; BG.begin();
    for (const z of sim.zombies) {
      if (!z.alive || !z.active || z.mb) continue;
      const id = this.zType(z);
      if (!sim.L.experience && z.m && z.z > s.z - 46) BG.put(z.x, ZOMBIES[id].height + 0.5, z.z, z.m, z.brute ? 0.62 : 0.4);
      CR.put(id, 'run', z.ph * 0.075, z.x, 0, z.z, this.zFacing(z), 1, this.zTint.get(z.id), 1, 0, z.flash > 0 ? HIT_FLASH : 0);
    }
    // shot: the death animation where it stood; burnt by a barrel: thrown back first
    for (const d of this.zdying) {
      d.t += dt;
      const sink = d.t > 1.2 ? (d.t - 1.2) * 1.0 : 0;
      const fly = d.boom ? Math.min(d.t, 0.35) : 0, lift = d.boom ? Math.sin(Math.min(1, d.t / 0.35) * Math.PI) * 0.8 : 0;
      CR.put(d.type, 'die', d.t, d.x, lift - sink, d.z - fly * 4, d.face, 1, d.tint, d.t > 1.2 ? Math.max(0, 1 - (d.t - 1.2) * 1.7) : 1);
    }
    this.zdying = this.zdying.filter(d => d.t < 1.8);
    BG.end();

    // mini-bosses
    for (const z of sim.zombies) {
      if (!z.mb) continue;
      let v = this.mbs.get(z.id);
      if (!v && z.active) {
        const rig = new Rig(miniBossSpec(z.name));
        rig.play(rig.K.walk, { speed: 0.8 });
        this.group.add(rig.root);
        v = { rig, fall: 0, x: z.x };
        this.mbs.set(z.id, v);
      }
      if (!v) continue;
      const R = v.rig;
      R.update(dt);
      if (v.fall > 0) {
        v.fall += dt;
        R.alpha = v.fall < 2.0 ? 1 : Math.max(0, 1 - (v.fall - 2.0) / 1.0);
        if (R.alpha <= 0) R.root.visible = false;
        continue;
      }
      R.root.position.set(z.x, 0, z.z);
      R.face(Math.abs(z.x - v.x) > 0.004 ? z.x - v.x : s.x - z.x);
      v.x = z.x;
      if (z.flash > 0) R.flash(1);
      // the pack's enemy health bar under the name
      const bar = `<i class="mbbar"><b style="width:${(clamp(z.hp / (z.maxhp || 1), 0, 1) * 100).toFixed(0)}%"></b></i>`;
      if (z.alive) labels.at('z' + z.id, 'lb-hp mb', (z.m ? `${z.name} <em>×${z.m}</em> ${fmt(Math.ceil(z.hp))}` : `${z.name} ${fmt(Math.ceil(z.hp))}`) + bar, z.x, R.height + 0.7, z.z, true);
    }

    // gates
    for (const v of this.gates) {
      const g = v.g;
      v.grp.position.z = g.z;                // 站桩关: gates drift at the squad
      const near = g.z > s.z - 70;
      v.grp.visible = near && v.fade < 1;
      if (!v.grp.visible) continue;
      for (const p of v.panels) {
        if (p.pulse) { p.pulse = Math.max(0, p.pulse - dt * 5); p.mesh.scale.setScalar(1 + p.pulse * 0.06); }
        if (p.maxSp) { p.maxSp.visible = !g.used; p.maxSp.material.opacity = 0.55 + Math.abs(Math.sin(this.t * 7)) * 0.45; p.maxSp.scale.set(2.2 * (1 + Math.sin(this.t * 7) * 0.05), 0.82, 1); }
        if (p.kind === 'gold' && !g.used) p.mesh.position.y = 1.5 + Math.sin(this.t * 6) * 0.05;
        if (p.kind === 'mystery' && !g.used) p.mesh.position.y = 1.5 + Math.sin(this.t * 4 + p.s) * 0.06;
      }
      if (!g.wall && !g.used) for (const post of v.posts) post.material.emissiveIntensity = 0.5 + Math.sin(this.t * 6) * 0.35;
      for (const a of v.aims) { a.visible = !g.used; a.scale.setScalar(0.9 + Math.sin(this.t * 5) * 0.08); }
      if (v.fade > 0) {
        v.fade += dt * 3.2;
        const k = Math.min(1, v.fade);
        for (const p of v.panels) {
          const chosen = v.lanes.includes(p.s);
          p.mesh.material.opacity = chosen ? 1 - k : (1 - k) * 0.4;
          if (chosen) p.mesh.scale.setScalar(1 + k * 0.35);
        }
      }
    }

    // traps
    for (const v of this.hazards) {
      const h = v.h;
      v.grp.position.z = h.z;
      v.grp.visible = h.z > s.z - 75 && h.z < s.z + 12 + (h.len || 0);
      if (!v.grp.visible) continue;
      if (v.spin) { v.kick = Math.max(0, (v.kick || 0) - dt); v.spin.rotation.x -= dt * (6 + v.kick * 30); }
      if (v.blade) {
        const x = Math.sin(sim.t * h.speed + h.phase) * h.amp;
        v.blade.position.x = x; v.blade.rotation.z -= dt * 18;
        if (Math.random() < dt * 20) this.fx.spark(x, 0.15, h.z, 1, [1, 0.8, 0.4], 3, 0.25);
      }
      if (v.water) {
        const k = (Math.sin(this.t * 2.2 + h.id) + 1) / 2;
        v.water.scale.set(1, 0.85 + k * 0.3, 1);
        if (Math.random() < dt * 8) this.fx.puff(v.cx + rand(-v.w / 2, v.w / 2), 1.5, h.z - rand(0, h.len), 1, [0.9, 0.97, 1], 1.2);
      }
    }

    // helicopter drops: the helicopter crosses ahead of the squad; soldiers drop from it
    for (const d of this.drops) {
      d.t += dt;
      const k = d.t / 2.4;
      const hx = -18 + k * 36, hy = 11 - Math.sin(Math.min(1, k) * Math.PI) * 1.2, hz = s.z - 15;
      d.heli.position.set(hx, hy, hz);
      d.heli.rotation.set(0, Math.PI / 2, -0.12 + Math.sin(this.t * 3) * 0.03);
      d.heli.userData.rotor.rotation.y += dt * 38; d.heli.userData.tail.rotation.x += dt * 50;
      for (const f of d.fall) {
        const was = f.t;
        f.t += dt;
        if (was < 0 && f.t >= 0) { f.x0 = hx; f.y0 = hy - 1; f.z0 = hz; }
        if (was < f.dur && f.t >= f.dur && f.i < 12) this.fx.spark(s.x + f.ox, 0.4, s.z + f.oz, 3, [0.5, 0.8, 1], 4, 0.4);
      }
      if (d.t > 3.0) { this.group.remove(d.heli); d.heli.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } }); d.done = true; }
    }
    this.drops = this.drops.filter(d => !d.done);

    // road coins
    if (this.roadCoins) {
      const m = this.roadCoins; let n = 0;
      for (const c of sim.coinsOnRoad) {
        if (!c.alive || c.z > s.z + 4 || c.z < s.z - 80) continue;
        _q.setFromEuler(_e.set(0, this.t * 3 + c.ph, 0));
        _m.compose(_p.set(c.x, 0.75 + Math.sin(this.t * 4 + c.ph) * 0.12, c.z), _q, _s.setScalar(1.35));
        m.setMatrixAt(n++, _m);
      }
      m.count = n; m.instanceMatrix.needsUpdate = true;
    }

    // barrels & cages
    for (const b of this.barrels) {
      const r = b.r;
      if (b.v8) {
        if (b.gone > 0) { b.gone += dt; b.grp.visible = false; continue; }
        if (!r.alive || (!r.vault && r.z > s.z + 6)) { b.grp.visible = false; continue; }
        b.grp.visible = r.vault || r.z > s.z - 72;
        if (!b.grp.visible) continue;
        b.grp.position.z = r.z;                 // rolling barrels and 站桩关 drift
        const sc = (r.vault ? 1.05 : 1.2) * (1 + (r.flash > 0 ? 0.07 : 0));
        b.grp.scale.setScalar(sc);
        if (b.rolling) {
          b.spin.rotation.x = r.roll.spin;
          b.spin.position.y = 0.62 + (r.roll.on ? Math.abs(Math.sin(r.roll.spin * 2)) * 0.05 : 0);
          if (r.roll.on && Math.random() < dt * 6) this.fx.puff(r.x + (Math.random() - 0.5), 0.15, r.z + 0.6, 1, [0.75, 0.72, 0.68], 0.5);
          b.icon.position.y = 2.2 + Math.sin(this.t * 4 + r.id) * 0.1;
          labels.at('b' + r.id, 'lb-hp barrel v8 roll' + (r.flash > 0 ? ' hit' : ''), Math.ceil(r.hp), r.x, 0.75, r.z + 0.9);
          const what = r.kind === 'men' ? `+${fmt(r.v * (sim.army || 1))} 兵` : r.kind === 'skill' ? (SKILLS[r.v] ? SKILLS[r.v].name : '技能') : ITEM_TEXT[r.kind] || '';
          if (what) labels.at('bt' + r.id, 'lb-btop item ' + r.kind, what, r.x, 3.4, r.z);
          r.flash = Math.max(0, r.flash - dt);
          continue;
        }
        b.body.rotation.y = r.flash > 0 ? Math.sin(this.t * 60) * 0.05 : 0;
        const topY = b.h * sc;
        if (b.icon && b.icon.isSprite) { b.icon.position.y = b.h + 0.85 + Math.sin(this.t * 3 + r.id) * 0.1; if (!b.icon.userData.card) b.icon.material.rotation = Math.sin(this.t * 2 + r.id) * 0.15; }
        if (b.icon && !b.icon.isSprite) b.icon.rotation.y += dt * 1.5;
        if (r.kind === 'men') man(r.x, topY, r.z, 'idle', this.t + r.id * 0.3, 1.25);
        // the hits left, big on the barrel's front (Top Lords); the reward over the lid
        labels.at('b' + r.id, 'lb-hp barrel v8' + (r.flash > 0 ? ' hit' : '') + (r.vault ? ' vault' : ''), Math.ceil(r.hp), r.x, topY * 0.52, r.z + 0.7 * sc);
        const what = r.kind==='coin'&&sim.L.experience?'补给':r.kind === 'men' ? `+${fmt(r.v * (sim.army || 1))}` : r.kind === 'fish' || r.gold || (r.kind === 'coin' && r.m && !r.vault) ? `×${r.m}` : ITEM_TEXT[r.kind] || '';
        if (what) labels.at('bt' + r.id, 'lb-btop ' + r.kind + (r.gold ? ' gold' : ''), what, r.x, topY + (r.kind === 'men' ? 2.2 : 2.25), r.z);
        r.flash = Math.max(0, r.flash - dt);
        continue;
      }
      if (b.gone > 0) {
        b.gone += dt;
        if (b.cage) { b.grp.visible = false; continue; }
        b.grp.children[0].visible = b.grp.children[1].visible = false;
        b.icon.position.y = 2.05 + b.gone * 6; b.icon.material.opacity = Math.max(0, 1 - b.gone * 1.6);
        b.icon.scale.setScalar(1.15 + b.gone * 1.5);
        if (b.gone > 0.7) b.grp.visible = false;
        continue;
      }
      if (!r.alive || r.z > s.z + 6) { b.grp.visible = false; continue; }
      b.grp.visible = r.z > s.z - 70;
      b.grp.position.z = r.z;
      if (b.cage) {
        b.grp.scale.setScalar(r.flash > 0 ? 1.4 : 1.35);
        if (b.grp.visible) b.inmates.forEach((m, i) => man(r.x + m.x * 1.35, 0.25 + Math.abs(Math.sin(this.t * 6 + i)) * 0.12, r.z + m.z * 1.35, 'idle', this.t + i * 0.4, 0.9));
        if (b.grp.visible) { labels.at('c' + r.id, 'lb-cage', `+${r.v} 兵`, r.x, 3.0, r.z); labels.at('b' + r.id, 'lb-hp barrel', Math.ceil(r.hp), r.x, 1.0, r.z + 1); }
      } else {
        b.grp.scale.setScalar(1.15 * (1 + (r.flash > 0 ? 0.06 : 0)));
        b.icon.position.y = 2.05 + Math.sin(this.t * 3 + r.id) * 0.12;
        if (b.grp.visible) labels.at('b' + r.id, 'lb-hp barrel', Math.ceil(r.hp), r.x, 1.35, r.z + 0.6);
      }
      r.flash = Math.max(0, r.flash - dt);
    }

    // brute HP labels
    for (const z of sim.zombies) if (z.brute && !z.mb && z.alive && z.active) labels.at('z' + z.id, 'lb-hp', Math.ceil(z.hp), z.x, 3.9, z.z);

    // bats swooping across the road; out of sight while the arc is below the road
    for (const v of this.fishes) {
      const f = v.f;
      if (!f.started || !f.alive) continue;
      const a = clamp((f.y + 0.6) / 0.6, 0, 1);
      if (a <= 0) continue;
      const k = f.t / f.dur;
      CR.put(ROLES.leaper, 'run', this.t + v.i * 0.3, f.x, f.y + 0.9, f.z, f.dir > 0 ? 1 : -1, 1.3, null, a, -f.dir * Math.cos(k * Math.PI) * 0.35);
      if (f.y > 0 && Math.random() < 0.4) this.fx.glow.spawn({ x: f.x, y: f.y + 0.9, z: f.z, life: 0.45, size0: 0.6, size1: 0.1, r: 1, g: 0.85, b: 0.35, a0: 0.9 });
    }
    CR.end(this.world.camera);

    // boss
    this.ensureBoss();
    // a fallen boss keeps fading out even after the sim has let go of it
    if (this.boss && (this.boss.fall > 0 || (sim.boss && !sim.boss.passive))) this.updateBoss(dt);
    this.updateTeles(dt);
    if (this.orbit) {
      const O = this.orbit; O.t += dt;
      O.cards.forEach((m, i) => {
        const a = O.t * 4.2 + i * Math.PI * 2 / 5, r = 2.6 + Math.sin(O.t * 3) * 0.3;
        m.position.set(O.x + Math.cos(a) * r, 3 + Math.sin(a * 2) * 0.5, O.z + Math.sin(a) * r * 0.6);
        m.rotation.set(0, -a, Math.sin(O.t * 5 + i) * 0.4);
        m.scale.setScalar(Math.min(1, O.t * 3) * (O.t > 1.4 ? Math.max(0, 1 - (O.t - 1.4) * 3) : 1));
      });
      if (O.t > 1.8) { for (const m of O.cards) { this.group.remove(m); m.geometry.dispose(); } this.orbit = null; }
    }
    if (this.finale) this.finale.update(dt, labels);
    if (this.xgate) {
      const X = this.xgate; X.t += dt;
      X.grp.scale.y = Math.min(1, X.grp.scale.y + dt * 4);
      X.flash = Math.max(0, (X.flash || 0) - dt * 3);
      X.P.draw('1 兵 = 100', true, X.flash, 'gold');
    }

    // squad label; it swells for a moment after a big jump in numbers
    this.boost = Math.max(0, (this.boost || 0) - dt);
    const showLabel = !this.hideLabel && s.N > 0 && sim.phase !== 'fail';
    if (showLabel) {
      const cls = 'lb-squad' + (this.hurt > 0 ? ' hurt' : '') + (this.boost > 0 ? ' boost' : '') + (s.N >= 1000 ? ' gold' : '');
      // from 大关二 on the bubble also shows what the squad is worth in coins (兵 = 钱)
      const coin = this.coinRate ? `<small><i class="ico-coin"></i>${kmb(s.N * this.coinRate)}</small>` : '';
      // 实验室 保本线: how many soldiers the squad must bring home for a 二星 stake to break even
      const par = this.par ? `<small class="par ${s.N >= this.par ? 'ok' : 'bad'}">保本 ${fmt(this.par)}</small>` : '';
      labels.at('squad', cls + (coin ? ' with-coin' : '') + (par ? ' with-par' : ''), `<span>${SOLDIER_ICON}${fmt(s.N)}</span>${coin}${par}`, s.x, 1.6, s.z - s.R - 0.6, true);
    }

    // 护盾
    const SR = this.shieldRing, SD = this.shieldDome;
    this.shieldGone = Math.max(0, this.shieldGone - dt);
    SR.visible = SD.visible = (s.shield > 0 || this.shieldGone > 0) && s.N > 0;
    if (SR.visible) {
      // the pack ring is an ellipse (rx 112, ry 48 of 256): stretched so it lies round on the road, just outside the squad
      const k = (s.R + 0.7) / 0.4375 * (1 + Math.sin(this.t * 4) * 0.02);
      const cx = formationX(this.vis, s.x), cz = s.z - CENT[this.vis][1];
      SR.scale.set(k, k * 2.33, 1); SR.position.set(cx, 0.06, cz);
      this.shieldHit = Math.max(0, this.shieldHit - dt * 2.2);
      const r = (s.R + 0.8) * (1 + (this.shieldGone ? (0.6 - this.shieldGone) * 0.8 : 0) + this.shieldHit * 0.06);
      SD.scale.set(r, Math.min(r * 0.62, 3.2), r); SD.position.set(cx, 0.02, cz);
      const u = SD.material.uniforms;
      u.uT.value = this.t; u.uHit.value = this.shieldHit; u.uFade.value = this.shieldGone ? this.shieldGone / 0.6 : 1;
      SR.material.opacity = 0.7 * u.uFade.value;
    }
    this.fx.setBullets(sim.bullets);
    // v8.1: a white star glint wherever an arrow landed this frame
    if (sim.impacts.length) { for (const q of sim.impacts) this.fx.hit(q.x, q.y, q.z, q.k); sim.impacts.length = 0; }
  }

  splash(x, z) {
    this.fx.puff(x, -0.3, z, 6, [0.85, 0.95, 1], 1.0);
    this.fx.spark(x, -0.2, z, 8, [0.8, 0.95, 1], 4, 0.45);
  }

  dispose() {
    const S = getShared();
    const keepGeo = new Set([S.barrel, S.band, S.cage, S.coin, S.gateWall, S.pillar, S.goldPillar, S.postBlue, S.postRed, S.postGold, S.postPurple, S.postTeal, S.postGray, S.wood, S.woodGold, S.coinStack]);
    const keepMap = new Set([...Object.values(S.icons), S.glow, S.hole, S.warn, S.gunTex, ...this.cardTex.values()]);
    for (const d of this.drops) this.group.remove(d.heli);
    this.crowd.dispose();
    if (this.boss) this.boss.rig.dispose();
    if (this.finale) this.finale.dispose();
    this.badges.dispose();
    for (const t of this.cardTex.values()) t.dispose();
    for (const v of this.mbs.values()) v.rig.dispose();
    for (const v of [...this.teles]) this.dropTele(v.T);
    this.group.traverse(o => {
      if (!(o.isMesh || o.isSprite)) return;
      if (o.isInstancedMesh) o.dispose();
      if (o.geometry && !keepGeo.has(o.geometry) && !o.userData.sharedGeo) o.geometry.dispose();
      const m = o.material;
      if (m && !Object.values(MAT).includes(m) && m !== S.coinMat && m !== PROP_MAT && !m.userData.rig && !m.userData.shared) { if (m.map && !keepMap.has(m.map) && !m.map.userData.shared) m.map.dispose(); m.dispose?.(); }
    });
    this.world.scene.remove(this.group);
  }
}
