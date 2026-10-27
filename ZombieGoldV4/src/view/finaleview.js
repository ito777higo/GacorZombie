// 结尾惊喜, drawn: the 彩虹滚轮 bridge, the 金砖墙, the golden giant (黄金雪怪), the 金蛋, the golden bats swooping
// over the arena (鱼跃金鱼) and the coin piles they leave. The 打爆桶 barrels are drawn by RunView with the road
// barrels (RunView.addBarrels); the finale's soldiers and bats go into RunView's crowd (drawCrowd).
import * as THREE from './three.js';
import { ROAD_HW } from '../sim/arena.js';
import { Rig } from './rig.js';
import { gateFrame } from './gateframe.js';
import { model } from './assets.js';
import { GOLD_GIANT, ROLES } from '../content/cast.js';
import { eggGeo, coinGeo, rubbleMound } from './models.js';
import { CrackMap, glowTexture, NUM_FONT } from './textures.js';
import { fmt, kmb, clamp } from '../sim/util.js';
import { rand } from './random.js';

// 彩虹道: one flat colour per roller, red → violet down the road like a painted rainbow, matte (no glow)
export const RB_ROAD = ['#e94b3c', '#f2772f', '#f7a531', '#f6cf38', '#8fc744', '#3fb878', '#2fa6c9', '#3b7fd4', '#5b5fc7', '#8a55c4'];
// a gap takes the colour of the roller before it
export const RB_COLS = RB_ROAD.slice(0, 9);

// a roller: its colour with a few soft darker bands round it so the spin reads, and a pale rim at each end
function rollerTexture(col) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = col; x.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(0,0,0,.10)'; x.fillRect(i * 32, 0, 12, 64); }
  x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(0, 0, 256, 5); x.fillRect(0, 59, 256, 5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
// the floor of a gap: a clean block of its colour with the multiple in white
function slotTexture(m, col) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = col; x.fillRect(0, 0, 512, 128);
  x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, 0, 512, 10); x.fillRect(0, 118, 512, 10);
  x.font = `400 96px ${NUM_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 14; x.strokeStyle = 'rgba(0,0,0,.35)'; x.strokeText('×' + m, 256, 70);
  x.fillStyle = '#fff'; x.fillText('×' + m, 256, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const GOLD = new THREE.Color(1.25, 1.0, 0.45);   // the bonus bats are painted gold

export class FinaleView {
  constructor(rv, F) {
    this.rv = rv; this.sim = rv.sim; this.F = F; this.fx = rv.fx;
    this.group = new THREE.Group(); rv.group.add(this.group);
    this.t = 0; this.fallers = []; this.chargers = []; this.fish = new Map();
    this.pile = null; this.pileN = 0;
    if (F.type === 'rainbow') this.buildRainbow();
    if (F.type === 'bricks') this.buildBricks();
    if (F.type === 'goldmob') this.buildGoldmob();
    if (F.type === 'egg') this.buildEgg();
    if (F.type === 'goldmob' || F.type === 'egg') this.buildPile();
  }

  // ---------------------------------------------------------------- 彩虹滚轮
  buildRainbow() {
    const F = this.F, W = ROAD_HW * 2 + 0.4, GL = 2.2;
    const capMat = new THREE.MeshStandardMaterial({ color: 0xf4eee2, roughness: 0.7 });
    this.rollers = [];
    const edges = [this.sim.platZ - 7.0];
    for (const g of F.gaps) { edges.push(g.z + GL / 2); edges.push(g.z - (g.k === F.gaps.length - 1 ? 3.6 : GL / 2)); }
    // drums between the gaps: their tops are the road the squad runs on
    for (let i = 0, k = 0; i < edges.length - 1; i += 2, k++) {
      const z0 = edges[i], z1 = edges[i + 1], L = z0 - z1, r = Math.max(0.6, L / 2);
      const geo = new THREE.CylinderGeometry(r, r, W, 40, 1, false); geo.rotateZ(Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ map: rollerTexture(RB_ROAD[k % RB_ROAD.length]), roughness: 0.78, metalness: 0 });
      const m = new THREE.Mesh(geo, mat); m.position.set(0, -r + 0.02, (z0 + z1) / 2); m.receiveShadow = true;
      this.group.add(m); this.rollers.push(m);
      // cream end caps
      for (const sx of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.18, 32).rotateZ(Math.PI / 2), capMat); cap.position.set(sx * W / 2, -r + 0.02, (z0 + z1) / 2); this.group.add(cap); }
    }
    // the gaps: a pit in the colour of the roller before it, its multiple painted on the floor
    this.slots = F.gaps.map(g => {
      const last = g.k === F.gaps.length - 1, len = last ? GL + 2.5 : GL, zc = last ? g.z - 1.25 : g.z;
      const col = last ? '#f2b632' : RB_COLS[g.k];
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, len), new THREE.MeshStandardMaterial({ map: slotTexture(g.m, col), roughness: 0.8 }));
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, -1.6, zc); this.group.add(floor);
      const walls = new THREE.Mesh(new THREE.BoxGeometry(W, 1.6, len, 1, 1, 1).translate(0, -0.8, 0), new THREE.MeshStandardMaterial({ color: new THREE.Color(col).multiplyScalar(0.62), roughness: 0.85, side: THREE.BackSide }));
      walls.position.z = zc; this.group.add(walls);
      return { g, floor, walls, zc, len, flash: 0 };
    });
    // a treasure chest past the ×100 pit
    const chest = model('Prop_Chest_Gold');
    if (chest) { const c = chest.scene.clone(); c.scale.setScalar(2.2); c.position.set(0, 0, F.gaps[F.gaps.length - 1].z - 6); this.group.add(c); }
  }
  // soldiers dropping into a gap (the squad label already counts them out)
  onFall(gap, n) {
    const s = this.sim.squad, rv = this.rv;
    const k = Math.min(n, 14);
    for (let i = 0; i < k; i++) this.fallers.push({ x0: clamp(s.x + rand(-s.R, s.R) * 0.8, -ROAD_HW + 0.5, ROAD_HW - 0.5), z0: s.z - s.R * 0.5 + rand(-0.4, 0.4), x1: rand(-ROAD_HW + 0.6, ROAD_HW - 0.6), z1: gap.z + rand(-0.6, 0.6), t: -i * 0.02, dur: 0.45 });
    const v = this.slots && this.slots[gap.k];
    if (v) v.flash = 1;
    if (Math.random() < 0.5) this.fx.spark(0, 0.2, gap.z, 6, [1, 0.9, 0.5], 4, 0.4);
    void rv;
  }
  onFull(gap) {
    const v = this.slots[gap.k];
    this.fx.ring(0, 0.3, v.zc, 10, [1, 0.9, 0.5], 0.5);
    this.fx.spark(0, 0.5, v.zc, 20, [1, 0.85, 0.35], 7, 0.6);
  }

  // ---------------------------------------------------------------- 金砖墙
  // Every row is a wall of gold bars, three layers laid like bricks; bars come off as the row's soldiers smash
  // into it, and the row bursts into gold when it is full. The last row is the vault behind a golden arch.
  buildBricks() {
    const F = this.F, W = ROAD_HW * 2 - 0.2, BL = 1.34, BH = 0.42, BD = 0.7;
    const prof = new THREE.Shape();
    prof.moveTo(-BD / 2, 0); prof.lineTo(BD / 2, 0); prof.lineTo(BD * 0.34, BH); prof.lineTo(-BD * 0.34, BH); prof.closePath();
    const geo = new THREE.ExtrudeGeometry(prof, { depth: BL - 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 1 });
    geo.translate(0, 0, -(BL - 0.08) / 2); geo.rotateY(Math.PI / 2);      // the bar's length along x
    const mat = new THREE.MeshStandardMaterial({ color: 0xf5b431, metalness: 0.55, roughness: 0.36, emissive: 0x4a2600, emissiveIntensity: 0.3 });
    const bars = [];
    this.walls = F.gaps.map(g => {
      const last = g.k === F.gaps.length - 1, layers = last ? 4 : 3, list = [];
      for (let l = 0; l < layers; l++) {
        const off = l % 2 ? BL / 2 : 0;
        for (let x = -W / 2 + BL / 2 - off; x <= W / 2 - BL / 2 + 0.01 + off; x += BL) {
          if (x < -W / 2 + BL * 0.3 || x > W / 2 - BL * 0.3) continue;
          list.push({ x, y: l * (BH + 0.02), z: g.z, l, i: bars.length, gone: false });
          bars.push(list[list.length - 1]);
        }
      }
      // remove from the top layer down, the middle of each layer first (where the squad hits)
      list.sort((a, b) => b.l - a.l || Math.abs(a.x) - Math.abs(b.x));
      return { g, list, last, shake: 0, taken: 0 };
    });
    this.bars = new THREE.InstancedMesh(geo, mat, bars.length);
    this.bars.castShadow = true; this.bars.receiveShadow = true;
    this.barList = bars;
    this.group.add(this.bars);
    this.syncBars();
    // the vault: a golden arch over the last row and a chest behind it
    const lastG = F.gaps[F.gaps.length - 1];
    const arch = gateFrame(W + 1.2, 3.4, { thick: 2 });
    arch.position.set(0, 0, lastG.z - 0.2); this.group.add(arch);
    const chest = model('Prop_Chest_Gold');
    if (chest) { const c = chest.scene.clone(); c.scale.setScalar(2.2); c.position.set(0, 0, lastG.z - 4); this.group.add(c); }
  }
  syncBars() {
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const w of this.walls) {
      const sh = w.shake > 0 ? Math.sin(this.t * 60) * 0.05 * w.shake : 0;
      for (const b of w.list) {
        if (b.gone) M.makeScale(0, 0, 0);
        else M.compose(p.set(b.x + sh, b.y, b.z), q.identity(), sc.set(1, 1, 1));
        this.bars.setMatrixAt(b.i, M);
      }
    }
    this.bars.instanceMatrix.needsUpdate = true;
  }
  onBrickHit(gap, n) {
    const s = this.sim.squad, w = this.walls[gap.k];
    w.shake = 1;
    // soldiers sprint into the wall and pop into coins
    const k = Math.min(n, 10);
    for (let i = 0; i < k; i++) this.chargers.push({ x0: clamp(s.x + rand(-s.R, s.R) * 0.8, -ROAD_HW + 0.5, ROAD_HW - 0.5), z0: s.z - s.R * 0.4 + rand(-0.3, 0.3), x1: rand(-ROAD_HW + 0.8, ROAD_HW - 0.8), z1: gap.z + 0.5, t: -i * 0.03, dur: 0.28 });
    // bars come off in proportion to how full the row is
    if (gap.cap < 1e9) {
      const want = Math.floor(w.list.length * Math.min(1, gap.n / gap.cap) * 0.85);
      while (w.taken < want) {
        const b = w.list[w.taken++]; b.gone = true;
        this.fx.shatter(b.x, b.y + 0.3, b.z, 3, '#ffc43a', 0.7);
        if (Math.random() < 0.6) this.fx.coinBurst(b.x, b.y + 0.4, b.z + 0.3, 2, 0.6);
      }
    } else if (Math.random() < 0.5) this.fx.coinBurst(rand(-3, 3), 1.2, gap.z + 0.4, 2, 0.7);
  }
  onBrickBreak(gap) {
    const w = this.walls[gap.k];
    for (const b of w.list) if (!b.gone) { b.gone = true; if (Math.random() < 0.5) this.fx.shatter(b.x, b.y + 0.3, b.z, 2, '#ffd34d', 1); }
    this.fx.coinBurst(0, 1, gap.z + 0.3, 16 + gap.k * 2, 1.1);
    this.fx.burst(0, 0.8, gap.z + 0.3, 4, [1, 0.85, 0.4]);
    this.fx.ring(0, 0.3, gap.z, 12, [1, 0.85, 0.4], 0.5);
  }

  // ---------------------------------------------------------------- 黄金雪怪 / 金蛋
  buildGoldmob() {
    const b = this.sim.boss;
    const r = this.rig = new Rig(GOLD_GIANT, 1.2);
    r.root.position.set(b.x, 0, b.z);
    const mound = rubbleMound(b.r + 1.4); mound.position.x = b.x; mound.position.z = b.z; this.group.add(mound);
    r.play(r.K.roar, { once: true, then: r.K.idle });
    this.group.add(r.root);
    const aura = this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,220,120,1)', 'rgba(255,180,40,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, toneMapped: false }));
    aura.scale.set(9, 9, 1); aura.position.set(b.x, 3, b.z - 0.5); this.group.add(aura);
    this.fx.boom(b.x, 2, b.z, 3, [1, 0.85, 0.3]);
  }
  buildEgg() {
    const b = this.sim.boss;
    const crack = this.crack = new CrackMap();
    const mat = this.eggMat = new THREE.MeshStandardMaterial({ color: 0xffb21f, roughness: 0.18, metalness: 1.0, emissive: 0xffd890, emissiveMap: crack.tex, emissiveIntensity: 1.4 });
    const m = this.eggM = new THREE.Mesh(eggGeo(), mat);
    m.scale.setScalar(0.85); m.castShadow = true; m.position.set(b.x, 0, b.z);
    // a purple bow round its middle, like the 二人捕鱼 egg
    const bow = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.16, 8, 40), new THREE.MeshStandardMaterial({ color: 0x9a4bff, roughness: 0.4, emissive: 0x3a0a80, emissiveIntensity: 0.5 }));
    bow.rotation.x = Math.PI / 2; bow.position.y = 2.0; m.add(bow);
    const nest = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.55, 8, 32), new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 0.9 }));
    nest.rotation.x = Math.PI / 2; nest.position.set(b.x, 0.2, b.z); this.group.add(nest);
    const aura = this.aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,220,120,1)', 'rgba(255,180,40,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6, toneMapped: false }));
    aura.scale.set(8, 8, 1); aura.position.set(b.x, 2, b.z);
    this.group.add(m, aura);
    this.wob = 0;
  }
  onEggCrack(layer) {
    const b = this.sim.boss;
    this.crack.add(3 + layer * 2); this.eggMat.emissiveIntensity = 1.4 + layer * 0.6;
    this.fx.coinBurst(b.x, 2.6, b.z, 18 + layer * 6, 1.1, { floor: 0.05 });
    this.fx.spark(b.x, 2, b.z, 24, [1, 0.85, 0.3], 8, 0.7);
    this.fx.ring(b.x, 1.5, b.z, 10, [1, 0.8, 0.3], 0.45);
  }
  onEggBreak() {
    const b = this.sim.boss;
    if (this.eggM) this.eggM.visible = false;
    this.fx.shatter(b.x, 1.5, b.z, 70, '#ffc83a', 1.5);
    this.fx.boom(b.x, 1.8, b.z, 5, [1, 0.85, 0.3]);
    this.fx.coinBurst(b.x, 1.8, b.z, 110, 1.5, { life: 0.6, floor: 0.05 });
    // the crater it leaves (the 二人捕鱼 video ends on the empty hole)
    const crater = new THREE.Mesh(new THREE.RingGeometry(0.4, 2.4, 40), new THREE.MeshBasicMaterial({ color: 0x3a1e0e, transparent: true, opacity: 0.85, depthWrite: false }));
    crater.rotation.x = -Math.PI / 2; crater.position.set(b.x, 0.03, b.z); this.group.add(crater);
  }
  // coins that stay on the ground around the target and pile up as it pays
  buildPile() {
    const m = this.pile = new THREE.InstancedMesh(coinGeo(), new THREE.MeshStandardMaterial({ color: 0xffc23a, roughness: 0.25, metalness: 1, emissive: 0x8a5200, emissiveIntensity: 0.55 }), 420);
    m.count = 0; m.castShadow = true; m.frustumCulled = false;
    this.group.add(m);
    this.pileN = 0;
  }
  addPile(n) {
    const b = this.sim.boss || { x: 0, z: this.sim.platZ - 12 };
    const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1.25, 1.25, 1.25);
    for (let i = 0; i < n && this.pileN < 420; i++) {
      const k = this.pileN++, a = Math.random() * Math.PI * 2, rr = 1.6 + Math.sqrt(Math.random()) * 3.6;
      const h = Math.max(0, 1.1 - (rr - 1.6) / 3.6) * Math.min(1.4, k / 160);
      p.set(b.x + Math.cos(a) * rr, 0.06 + h * Math.random(), b.z + Math.sin(a) * rr * 0.8);
      q.setFromEuler(e.set(Math.PI / 2 + rand(-0.5, 0.5), rand(0, 6), rand(-0.5, 0.5)));
      M4.compose(p, q, sc); this.pile.setMatrixAt(k, M4);
    }
    this.pile.count = this.pileN; this.pile.instanceMatrix.needsUpdate = true;
  }
  onFinHit(units, x, z) {
    const b = this.sim.boss;
    if (this.rig && Math.random() < 0.25) this.rig.flash(2);
    this.wob = 1;
    this.fx.coinBurst(x, 2.4, z, Math.min(6, 1 + Math.round(units / 2)), 0.9, { floor: 0.05 });
    this.addPile(Math.min(8, 1 + Math.round(units)));
    void b;
  }
  onGoldKill() {
    const b = this.sim.boss;
    if (this.rig) this.rig.play(this.rig.K.die, { once: true });
    this.fx.boom(b.x, 2.5, b.z, 4.5, [1, 0.85, 0.3]);
    this.fx.coinBurst(b.x, 2.5, b.z, 120, 1.6, { life: 0.6, floor: 0.05 });
    this.addPile(120);
    this.dead = 0.0001;
  }
  onGoldFlee() { this.flee = 0.0001; if (this.rig) this.rig.play(this.rig.K.walk, { speed: 1.4 }); }

  // ---------------------------------------------------------------- 鱼跃金鱼: golden bats swoop over the arena
  onLeapIn(f) {
    const s = 1.2 + Math.min(1.2, f.m / 30);
    // a golden glow behind each one: these are bonus targets
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,220,120,1)', 'rgba(255,180,40,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6, toneMapped: false }));
    glow.scale.set(s * 2.4, s * 2.4, 1);
    this.group.add(glow);
    this.fish.set(f.id, { f, glow, s });
    this.fx.puff(f.x, 0.3, f.z, 5, [0.75, 0.68, 0.58], 1.0);
  }
  onLeapKill(f) {
    const v = this.fish.get(f.id);
    if (v) { v.dead = 0.0001; }
    this.fx.coinBurst(f.x, f.y, f.z, 10 + Math.min(16, f.m / 2), 0.9);
    this.fx.flash(f.x, f.y, f.z, 3.4, [1, 0.85, 0.4], 0.2);
    this.fx.spark(f.x, f.y, f.z, 18, [1, 0.85, 0.3], 7, 0.6);
  }
  onLeapOut(f) { const v = this.fish.get(f.id); if (v) { this.group.remove(v.glow); v.glow.material.dispose(); this.fish.delete(f.id); } this.fx.puff(f.x, 0.3, f.z, 4, [0.75, 0.68, 0.58], 0.9); }

  // ---------------------------------------------------------------- per frame
  update(dt, labels) {
    this.t += dt;
    const F = this.F, sim = this.sim;
    if (this.rollers) {
      const sp = F.speed || 0;
      for (const r of this.rollers) r.rotation.x -= dt * (0.8 + sp * 0.6);
      const sz = sim.squad.z;
      for (const v of this.slots) {
        v.flash = Math.max(0, v.flash - dt * 3);
        // only the gaps around the squad are labelled; far ones crowd together in perspective
        if (v.zc < sz - 19 || v.zc > sz + 9) continue;
        v.floor.material.color.setScalar(1 + v.flash * 0.25);
        const g = v.g, full = g.n >= g.cap;
        const txt = g.n ? `<b>×${g.m}</b><small>${fmt(g.n)} 兵 · +${kmb(g.n * g.m * (this.chip || 0))}</small>` : `<b>×${g.m}</b>${g.cap < 1e9 ? `<small>装 ${fmt(g.cap)} 兵</small>` : '<small>剩下的全进来</small>'}`;
        labels.at('rb' + g.k, 'lb-slot' + (full ? ' full' : g.n ? ' on' : '') + (g.k === F.gaps.length - 1 ? ' jackpot' : ''), txt, 0, 1.2, v.zc, true);
      }
    }
    if (this.walls) {
      const sz = sim.squad.z;
      let dirty = false, shown = 0;
      for (const w of this.walls) {
        if (w.shake > 0) { w.shake = Math.max(0, w.shake - dt * 4); dirty = true; }
        const g = w.g;
        // label the row being smashed and the next one only
        if (g.z > sz + 2 || (g.cap < 1e9 && g.n >= g.cap) || shown >= 2) continue;
        shown++;
        const txt = g.n ? `<b>×${g.m}</b><small>撞了 ${fmt(g.n)} 兵 · +${kmb(g.n * g.m * (this.chip || 0))}</small>` : `<b>×${g.m}</b>${g.cap < 1e9 ? `<small>要 ${fmt(g.cap)} 个兵撞开</small>` : '<small>金库：剩下的全撞进来</small>'}`;
        labels.at('br' + g.k, 'lb-slot brick' + (g.n ? ' on' : '') + (w.last ? ' jackpot' : ''), txt, 0, 2.2, g.z, true);
      }
      if (dirty || this.t < 0.1) this.syncBars();
    }
    if (this.rig) {
      const b = sim.boss;
      this.rig.update(dt);
      if (b && b.flash > 0) this.rig.flash(1);
      if (this.flee) { this.flee += dt; this.rig.root.position.z -= dt * 7; if (this.flee > 2) this.rig.root.visible = false; }
      if (this.dead) { this.dead += dt; this.rig.alpha = this.dead < 2.2 ? 1 : Math.max(0, 1 - (this.dead - 2.2) / 1.2); }
      if (this.aura) this.aura.material.opacity = this.dead || this.flee ? Math.max(0, this.aura.material.opacity - dt) : 0.45 + Math.sin(this.t * 3) * 0.12;
    }
    if (this.eggM && this.eggM.visible) {
      this.wob = Math.max(0, (this.wob || 0) - dt * 4);
      this.eggM.rotation.z = Math.sin(this.t * 34) * this.wob * 0.07;
      this.eggM.position.y = Math.sin(this.t * 1.6) * 0.08;
      this.aura.material.opacity = 0.5 + Math.sin(this.t * 3) * 0.12;
    } else if (this.aura && F.type === 'egg') this.aura.material.opacity = Math.max(0, this.aura.material.opacity - dt);
    for (const [id, v] of this.fish) {
      const f = v.f;
      if (v.dead) {
        v.dead += dt;
        v.glow.material.opacity = Math.max(0, 0.6 - v.dead * 2);
        if (v.dead > 0.5) { this.group.remove(v.glow); v.glow.material.dispose(); this.fish.delete(id); }
        continue;
      }
      v.glow.position.set(f.x, f.y + 1.1, f.z - 0.1);
      if (f.alive && f.y > -0.2) labels.at('lf' + f.id, 'lb-leap' + (f.m >= 30 ? ' big' : ''), `×${f.m}`, f.x, f.y + 2.6, f.z);
    }
  }
  // the finale's figures, drawn into RunView's crowd: soldiers falling into gaps or charging the gold wall
  // (man = RunView.man), and the golden bats
  drawCrowd(crowd, man, dt) {
    for (const f of this.fallers) {
      f.t += dt;
      if (f.t < 0) continue;
      const k = Math.min(1, f.t / f.dur);
      const x = f.x0 + (f.x1 - f.x0) * k, z = f.z0 + (f.z1 - f.z0) * k, y = Math.sin(k * Math.PI) * 1.1 - k * 1.2;
      man(x, y, z, 'idle', 0.25 + k * 0.6, 1, (f.x1 - f.x0) * k * 0.2);
    }
    this.fallers = this.fallers.filter(f => f.t < f.dur);
    for (const f of this.chargers) {
      f.t += dt;
      if (f.t < 0) continue;
      const k = Math.min(1, f.t / f.dur);
      man(f.x0 + (f.x1 - f.x0) * k, Math.sin(k * Math.PI) * 0.25, f.z0 + (f.z1 - f.z0) * k, 'run', f.t * 2);
      if (k >= 1 && !f.done) { f.done = true; if (Math.random() < 0.5) this.fx.coinBurst(f.x1, 0.9, f.z1 + 0.2, 1, 0.5); this.fx.hit(f.x1, 0.7, f.z1 + 0.2, 'g'); }
    }
    this.chargers = this.chargers.filter(f => !f.done);
    for (const v of this.fish.values()) {
      const f = v.f, k = f.t / f.dur;
      const a = v.dead ? Math.max(0, 1 - v.dead * 2.2) : 1;
      crowd.put(ROLES.leaper, 'run', this.t * 1.2 + f.id * 0.3, f.x, f.y + 1.1 + (v.dead ? v.dead * 3 : 0), f.z, f.side > 0 ? 1 : -1, v.s, GOLD, a, -f.side * Math.cos(k * Math.PI) * 0.4, f.flash > 0 ? 0.6 : 0);
    }
    if (!this.slots) return;
    // a filled gap shows its soldiers standing in it, heads at road level (the bridge Count Masters style)
    for (const v of this.slots) {
      const g = v.g;
      if (!g.n) continue;
      const shown = Math.min(48, Math.ceil(48 * Math.min(1, g.n / Math.min(g.cap, 400))));
      const rows = v.len > 3 ? 4 : 3, cols = Math.ceil(shown / rows);
      for (let i = 0; i < shown; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        const x = -ROAD_HW + 0.7 + (cols > 1 ? c * (ROAD_HW * 2 - 1.4) / (cols - 1) : ROAD_HW - 0.7), z = v.zc - v.len / 2 + 0.4 + r * (v.len - 0.8) / Math.max(1, rows - 1);
        man(x + Math.sin(i * 7.3) * 0.12, -0.75, z, 'idle', this.t + i * 0.37);
      }
    }
  }
  dispose() {
    if (this.rig) this.rig.dispose();
    this.group.traverse(o => { if (o.isMesh || o.isSprite) { if (o.isInstancedMesh) o.dispose(); o.geometry?.dispose(); const m = o.material; if (m) { m.map?.dispose?.(); m.dispose?.(); } } });
    this.group.removeFromParent();
  }
}
