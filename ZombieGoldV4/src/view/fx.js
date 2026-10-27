// Instanced crowds, billboard particles, bullets and physical coins.
import * as THREE from './three.js';
import { MAT, coinGeo } from './models.js';
import { glowTexture, netTexture } from './textures.js';
import { imageUrl } from './assets.js';
import { rand } from './random.js';

// v8.1: Kenney Particle Pack textures (CC0, assets/fx/; see assets/CREDITS.md)
const fxCache = new Map();
export function fxTexture(name) {
  if (!fxCache.has(name)) {
    const t = new THREE.TextureLoader().load(imageUrl(`fx/${name}.png`));
    t.colorSpace = THREE.SRGBColorSpace;
    fxCache.set(name, t);
  }
  return fxCache.get(name);
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();


// ---------------------------------------------------------------- billboard particles
const PVS = /* glsl */`
attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSR;
varying vec2 vUv; varying vec4 vCol;
void main() {
  vUv = uv; vCol = iCol;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float c = cos(iSR.y), s = sin(iSR.y);
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iSR.x;
  vec3 w = iPos + right * p.x + up * p.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const PFS = /* glsl */`
uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
void main() { vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vCol.rgb * t.rgb, vCol.a * t.a); }`;

export class Particles {
  constructor(scene, tex, max, additive = true, order = 5) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.sr = new Float32Array(max * 2);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iSR', new THREE.InstancedBufferAttribute(this.sr, 2).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } }, vertexShader: PVS, fragmentShader: PFS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
    scene.add(this.mesh);
    this.list = [];
  }
  // p: {x,y,z, vx,vy,vz, g, life, size0, size1, r,g,b, a0, a1, rot, vr, drag}
  spawn(p) {
    if (this.list.length >= this.max) this.list.shift();
    p.t = 0; p.vx ||= 0; p.vy ||= 0; p.vz ||= 0; p.rot ||= 0; p.vr ||= 0; p.gr ||= 0; p.drag ||= 0;
    if (p.a1 === undefined) p.a1 = 0;
    if (p.size1 === undefined) p.size1 = p.size0;
    this.list.push(p);
    return p;
  }
  update(dt) {
    let n = 0;
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      const k = p.t / p.life;
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.vy -= p.gr * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.vr * dt;
      if (p.follow) { p.x = p.follow.x; p.z = p.follow.z; }
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      const a = p.a0 + (p.a1 - p.a0) * (p.ease ? k * k : k);
      this.col[n * 4] = p.r; this.col[n * 4 + 1] = p.g; this.col[n * 4 + 2] = p.b; this.col[n * 4 + 3] = a;
      this.sr[n * 2] = p.size0 + (p.size1 - p.size0) * (1 - (1 - k) * (1 - k)); this.sr[n * 2 + 1] = p.rot;
      L[n] = p;
      n++;
    }
    L.length = n;
    this.geo.instanceCount = n;
    for (const k of ['iPos', 'iCol', 'iSR']) this.geo.attributes[k].needsUpdate = true;
  }
  clear() { this.list.length = 0; this.geo.instanceCount = 0; }
}

// ---------------------------------------------------------------- effects facade
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.glow = new Particles(scene, glowTexture(), 900, true);
    // v8.1 Kenney particles: soft smoke, shock rings, star glints on every hit, spiky kill bursts, electric sparks
    this.smoke = new Particles(scene, fxTexture('smoke_01'), 300, false, 4);
    this.rings = new Particles(scene, fxTexture('circle_02'), 60, true);
    this.nets = new Particles(scene, netTexture(), 40, true);
    this.stars = new Particles(scene, fxTexture('star_04'), 260, true, 6);
    this.bursts = new Particles(scene, fxTexture('scorch_01'), 80, true, 6);
    this.zaps = new Particles(scene, fxTexture('spark_01'), 80, true, 6);
    this.muzzles = new Particles(scene, fxTexture('muzzle_04'), 40, true, 6);

    // the squad's bullets: short glowing slugs, each with a streak behind it that warms with the gun tier
    this.bulletMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.bullets = new THREE.InstancedMesh(bulletGeo(), this.bulletMat, 1400);
    this.bullets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 1400; i++) this.bullets.setColorAt(i, _c.setRGB(1, 1, 1));
    this.bullets.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.bullets.frustumCulled = false; this.bullets.count = 0;
    scene.add(this.bullets);
    const trg = new THREE.PlaneGeometry(0.1, 1.3); trg.rotateX(-Math.PI / 2); trg.translate(0, 0, 0.95);
    this.trails = new THREE.InstancedMesh(trg, new THREE.MeshBasicMaterial({ map: fxTexture('trace_01'), color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }), 1400);
    this.trails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 1400; i++) this.trails.setColorAt(i, _c.setRGB(1, 1, 1));
    this.trails.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.trails.frustumCulled = false; this.trails.count = 0; this.trails.renderOrder = 4;
    scene.add(this.trails);
    // v9: splats where monsters fall (Kenney scorch, tinted dark red, lying on the road)
    const spg = new THREE.PlaneGeometry(1, 1); spg.rotateX(-Math.PI / 2);
    this.splats = new THREE.InstancedMesh(spg, new THREE.MeshBasicMaterial({ map: fxTexture('scorch_02'), color: 0x7a1010, transparent: true, depthWrite: false, opacity: 0.75 }), 90);
    this.splats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.splats.frustumCulled = false; this.splats.count = 0; this.splats.renderOrder = 1;
    scene.add(this.splats);
    this.splatList = [];
    // the heroes' guns: short yellow tracers (visual only)
    const rg = new THREE.PlaneGeometry(0.22, 1.1); rg.rotateX(-Math.PI / 2);
    this.tracers = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ map: fxTexture('bullet_tracer'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }), 120);
    this.tracers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracers.frustumCulled = false; this.tracers.count = 0;
    scene.add(this.tracers);
    this.tracerList = [];
    // 海鳗 chain lightning: zigzag beams between two points (Kenney trace_03)
    this.beamMat = new THREE.MeshBasicMaterial({ map: fxTexture('trace_03'), color: new THREE.Color(1.4, 1.6, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    this.beams = [];

    // cannon shells (the bonus cannon can have a few hundred in the air)
    const sg = new THREE.SphereGeometry(0.32, 12, 8);
    this.shellMax = 420;
    this.shells = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6), toneMapped: false }), this.shellMax);
    this.shells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shells.frustumCulled = false; this.shells.count = 0;
    if (!this.shells.instanceColor) { for (let i = 0; i < this.shellMax; i++) this.shells.setColorAt(i, _c.setRGB(1, 1, 1)); }
    scene.add(this.shells);

    // physical coins
    this.coinMat = new THREE.MeshStandardMaterial({ color: 0xffc23a, roughness: 0.25, metalness: 1, emissive: 0x8a5200, emissiveIntensity: 0.55 });
    this.coins = new THREE.InstancedMesh(coinGeo(), this.coinMat, 500);
    this.coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coins.frustumCulled = false; this.coins.count = 0; this.coins.castShadow = true;
    scene.add(this.coins);
    this.coinList = [];

    // debris shards
    const tg = new THREE.TetrahedronGeometry(0.25, 0);
    this.shardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.4 });
    this.shards = new THREE.InstancedMesh(tg, this.shardMat, 300);
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 300; i++) this.shards.setColorAt(i, _c.setRGB(1, 1, 1));
    this.shards.frustumCulled = false; this.shards.count = 0;
    scene.add(this.shards);
    this.shardList = [];

    // wooden planks from a broken barrel (v8)
    const pg = new THREE.BoxGeometry(0.16, 0.05, 0.62);
    this.planks = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), 240);
    this.planks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 240; i++) this.planks.setColorAt(i, _c.setRGB(1, 1, 1));
    this.planks.frustumCulled = false; this.planks.count = 0; this.planks.castShadow = true;
    scene.add(this.planks);
    this.plankList = [];
  }
  // a barrel bursting into staves
  splinter(x, y, z, n = 10, color = '#b06d34', power = 1) {
    for (let i = 0; i < n; i++) {
      if (this.plankList.length >= 240) this.plankList.shift();
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3), sp = rand(3, 7) * power;
      this.plankList.push({ x: x + Math.cos(a) * 0.4, y: y + rand(0, 0.9), z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * sp, vy: rand(4, 9) * power, vz: Math.sin(a) * sp,
        rx: rand(0, 6), ry: a, wx: rand(-10, 10), wy: rand(-6, 6), t: 0, life: rand(1.1, 1.6), s: rand(0.8, 1.2), c: i % 4 === 0 ? '#5a3416' : color });
    }
  }

  spark(x, y, z, n = 4, col = [1, 0.85, 0.4], spd = 6, size = 0.5) {
    for (let i = 0; i < n; i++) {
      this.glow.spawn({ x, y, z, vx: rand(-spd, spd), vy: rand(0, spd), vz: rand(-spd, spd), gr: 14, drag: 3, life: rand(0.18, 0.35), size0: size, size1: 0.05, r: col[0], g: col[1], b: col[2], a0: 1 });
    }
  }
  // v9: one arrow landing, by what it hits (Top Lords): flesh takes a small red spark, a barrel sheds a chip, a
  // gate or the boss a short white glint. Only about four in ten draw, so a volley reads as one impact, not confetti.
  hit(x, y, z, kind = 'z') {
    if (Math.random() > 0.38) return;
    if (kind === 'z') {
      this.glow.spawn({ x, y, z, vx: rand(-2.5, 2.5), vy: rand(0.5, 3), vz: rand(-0.5, 2), gr: 12, drag: 3, life: rand(0.1, 0.18), size0: 0.32, size1: 0.05, r: 1, g: 0.35, b: 0.25, a0: 1 });
    } else if (kind === 'b') {
      this.shatter(x, y, z, 1, Math.random() < 0.5 ? '#a8662f' : '#6b3f1c', 0.3);
    } else {
      const big = kind === 'B';
      this.stars.spawn({ x, y, z, life: 0.1, size0: big ? 0.9 : 0.55, size1: 0.15, r: 1, g: kind === 'f' ? 0.9 : 0.97, b: kind === 'f' ? 0.5 : 0.92, a0: 0.9, rot: rand(0, 6) });
    }
  }
  // a dark splat on the road where a monster fell; fades in a few seconds
  splat(x, z, size = 1.1) {
    if (this.splatList.length >= 90) this.splatList.shift();
    this.splatList.push({ x, z, s: size * rand(0.8, 1.2), rot: rand(0, 6), t: 0, life: 3.2 });
  }
  // a kill: a spiky burst, a star and a puff of smoke
  burst(x, y, z, size = 1.4, col = [1, 0.75, 0.35]) {
    this.bursts.spawn({ x, y, z, life: 0.22, size0: size * 0.5, size1: size * 1.6, r: col[0], g: col[1], b: col[2], a0: 1, rot: rand(0, 6) });
    this.stars.spawn({ x, y: y + 0.1, z, life: 0.16, size0: size * 1.1, size1: size * 0.3, r: 1, g: 1, b: 0.9, a0: 1, rot: rand(0, 6) });
    this.puff(x, y - 0.3, z, 3, [0.62, 0.6, 0.58], size * 0.9);
  }
  // electric crackle (海鳗, 海王蟹)
  zap(x, y, z, size = 1.6, col = [0.7, 0.85, 1]) {
    this.zaps.spawn({ x, y, z, life: 0.18, size0: size, size1: size * 1.3, r: col[0], g: col[1], b: col[2], a0: 1, rot: rand(0, 6) });
  }
  muzzle(x, y, z, size = 0.9, rot = 0) {
    this.muzzles.spawn({ x, y, z, life: 0.06, size0: size, size1: size * 1.2, r: 1, g: 0.85, b: 0.5, a0: 1, rot });
  }
  // a short tracer flying from (x, z) toward -z
  tracer(x, y, z, vx = 0, vz = -60) { if (this.tracerList.length < 120) this.tracerList.push({ x, y, z, vx, vz, t: 0, life: 0.32 }); }
  // a lightning beam between two points that flickers for `life` seconds
  beam(a, b, life = 0.35, width = 0.9) {
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 0.01;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, 1), this.beamMat);
    m.userData = { a: { ...a }, b: { ...b }, len, t: 0, life, width };
    m.frustumCulled = false; m.renderOrder = 7;
    this.scene.add(m);
    this.beams.push(m);
  }
  flash(x, y, z, size = 1.4, col = [1, 0.9, 0.6], life = 0.12) {
    this.glow.spawn({ x, y, z, life, size0: size, size1: size * 1.4, r: col[0], g: col[1], b: col[2], a0: 1 });
  }
  puff(x, y, z, n = 6, col = [0.55, 0.6, 0.5], size = 1.0) {
    for (let i = 0; i < n; i++) {
      this.smoke.spawn({ x: x + rand(-0.3, 0.3), y: y + rand(0, 0.5), z: z + rand(-0.3, 0.3), vx: rand(-1.5, 1.5), vy: rand(0.8, 2.2), vz: rand(-1.5, 1.5), drag: 2.5, life: rand(0.5, 0.9), size0: size * 0.6, size1: size * 1.9, r: col[0], g: col[1], b: col[2], a0: 0.7, a1: 0, rot: rand(0, 6), vr: rand(-1, 1) });
    }
  }
  ring(x, y, z, size = 4, col = [1, 0.85, 0.4], life = 0.45) {
    this.rings.spawn({ x, y, z, life, size0: size * 0.2, size1: size, r: col[0], g: col[1], b: col[2], a0: 1, a1: 0 });
  }
  net(x, y, z, size = 2.4, col = [1, 0.92, 0.6]) {
    this.nets.spawn({ x, y, z, life: 0.38, size0: size * 0.3, size1: size, r: col[0], g: col[1], b: col[2], a0: 1, a1: 0, rot: rand(0, 6), vr: 2 });
    this.glow.spawn({ x, y, z, life: 0.2, size0: size * 0.9, size1: size * 0.3, r: col[0], g: col[1], b: col[2], a0: 0.8 });
  }
  boom(x, y, z, size = 3, col = [1, 0.7, 0.3]) {
    this.flash(x, y, z, size * 1.8, [1, 0.95, 0.8], 0.22);
    this.bursts.spawn({ x, y, z, life: 0.3, size0: size, size1: size * 2.6, r: col[0], g: col[1], b: col[2], a0: 1, rot: rand(0, 6) });
    this.ring(x, y + 0.2, z, size * 3, col, 0.5);
    this.spark(x, y, z, 26, col, size * 4, 0.7);
    this.puff(x, y, z, 10, [0.45, 0.42, 0.4], size);
  }
  // coin fountain: n coins launched from (x,y,z)
  coinBurst(x, y, z, n, power = 1, opts = {}) {
    for (let i = 0; i < n; i++) {
      if (this.coinList.length >= 500) this.coinList.shift();
      const a = Math.random() * Math.PI * 2, sp = rand(2, 6) * power;
      this.coinList.push({
        x, y, z, vx: Math.cos(a) * sp, vy: rand(6, 11) * power, vz: Math.sin(a) * sp * (opts.flatZ ?? 1),
        rx: rand(0, 6), ry: rand(0, 6), wx: rand(-14, 14), wy: rand(-10, 10), t: 0, life: rand(1.2, 1.8) + (opts.life || 0), floor: opts.floor ?? 0, s: opts.scale || 1,
      });
    }
  }
  // coins falling out of the sky over an area (金币雨)
  coinRain(x, z, w, d, n, y = 14) {
    for (let i = 0; i < n; i++) {
      if (this.coinList.length >= 500) this.coinList.shift();
      this.coinList.push({
        x: x + rand(-w / 2, w / 2), y: y + rand(0, 4), z: z + rand(-d / 2, d / 2), vx: rand(-0.5, 0.5), vy: rand(-9, -5), vz: rand(-0.5, 0.5),
        rx: rand(0, 6), ry: rand(0, 6), wx: rand(-10, 10), wy: rand(-8, 8), t: 0, life: rand(1.4, 1.9), floor: -0.4, s: 1.2,
      });
    }
  }
  shatter(x, y, z, n, color, power = 1) {
    for (let i = 0; i < n; i++) {
      if (this.shardList.length >= 300) this.shardList.shift();
      const a = Math.random() * Math.PI * 2, sp = rand(3, 9) * power;
      this.shardList.push({ x: x + rand(-0.5, 0.5), y: y + rand(-0.5, 1.5), z: z + rand(-0.5, 0.5), vx: Math.cos(a) * sp, vy: rand(4, 10) * power, vz: Math.sin(a) * sp, rx: 0, ry: 0, wx: rand(-12, 12), wy: rand(-12, 12), t: 0, life: rand(0.9, 1.5), s: rand(0.6, 1.6), c: color });
    }
  }

  setBullets(list) {
    const b = this.bullets, tr = this.trails; let n = 0;
    for (const u of list) {
      if (n >= 1400) break;
      _q.setFromEuler(_e.set(0, Math.atan2(-(u.vx || 0), -(u.vz || -1)), 0));
      const k = Math.min(1.35, u.w || 1);
      _m.compose(_p.set(u.x, u.y ?? 0.75, u.z), _q, _s.set(k, k, k));
      b.setMatrixAt(n, _m);
      // a 散射 shot is a green comet (like the trident's shots in 二人捕鱼): a wider, brighter streak
      if (u.spread) _m.compose(_p, _q, _s.set(k * 3.4, k, k * 1.25));
      tr.setMatrixAt(n, _m);
      b.setColorAt(n, u.spread ? _c.setRGB(0.6, 1.4, 0.5) : _c.setRGB(1, 1, 1));
      // the streak warms with the gun tier: white → gold → the gold heavy gun's fire
      const t = u.tier || 0;
      tr.setColorAt(n, u.spread ? _c.setRGB(0.55, 2.0, 0.4) : t >= 3 ? _c.setRGB(1.6, 0.75, 0.25) : t >= 1 ? _c.setRGB(1.3, 1.05, 0.55) : _c.setRGB(1.1, 1.0, 0.75));
      n++;
    }
    b.count = tr.count = n; b.instanceMatrix.needsUpdate = true; tr.instanceMatrix.needsUpdate = true; if (tr.instanceColor) tr.instanceColor.needsUpdate = true; if (b.instanceColor) b.instanceColor.needsUpdate = true;
  }
  setShells(list) {
    const b = this.shells; let n = 0;
    for (const u of list) {
      if (n >= this.shellMax) break;
      _m.compose(_p.set(u.x, u.y, u.z), _q.identity(), _s.setScalar(u.s || 1));
      b.setMatrixAt(n, _m);
      b.setColorAt(n, u.partner ? _c.setRGB(0.8, 0.5, 1) : u.col ? _c.setRGB(u.col[0], u.col[1], u.col[2]) : _c.setRGB(1, 0.9, 0.55));
      n++;
    }
    b.count = n; b.instanceMatrix.needsUpdate = true; if (b.instanceColor) b.instanceColor.needsUpdate = true;
  }

  update(dt) {
    this.glow.update(dt); this.smoke.update(dt); this.rings.update(dt); this.nets.update(dt);
    this.stars.update(dt); this.bursts.update(dt); this.zaps.update(dt); this.muzzles.update(dt);
    let ns = 0;
    for (const c of this.splatList) {
      c.t += dt;
      if (c.t > c.life) continue;
      const k = c.t < 0.12 ? c.t / 0.12 : 1, fade = c.t > c.life - 0.8 ? (c.life - c.t) / 0.8 : 1;
      _q.setFromEuler(_e.set(0, c.rot, 0));
      _m.compose(_p.set(c.x, 0.03, c.z), _q, _s.set(c.s * k * (0.3 + 0.7 * fade), 1, c.s * k * (0.3 + 0.7 * fade)));
      this.splats.setMatrixAt(ns++, _m);
    }
    this.splatList = this.splatList.filter(c => c.t <= c.life);
    this.splats.count = ns; this.splats.instanceMatrix.needsUpdate = true;
    // hero tracers
    let nt = 0;
    const TL = this.tracerList;
    for (let i = 0; i < TL.length; i++) {
      const c = TL[i];
      c.t += dt;
      if (c.t > c.life) continue;
      c.x += c.vx * dt; c.z += c.vz * dt;
      _q.setFromEuler(_e.set(0, Math.atan2(-c.vx, -c.vz), 0));
      _m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(1, 1, 1));
      this.tracers.setMatrixAt(nt++, _m);
      TL[nt - 1] = c;
    }
    TL.length = nt; this.tracers.count = nt; this.tracers.instanceMatrix.needsUpdate = true;
    // lightning beams: a camera-facing strip from a to b, re-jittered every frame so it crackles
    for (const m of this.beams) {
      const u = m.userData;
      u.t += dt;
      const cam = this.camera;
      _p.set((u.a.x + u.b.x) / 2, (u.a.y + u.b.y) / 2, (u.a.z + u.b.z) / 2);
      m.position.copy(_p);
      const dir = new THREE.Vector3(u.b.x - u.a.x, u.b.y - u.a.y, u.b.z - u.a.z).normalize();
      const view = cam ? new THREE.Vector3().subVectors(cam.position, _p).normalize() : new THREE.Vector3(0, 1, 0);
      const side = new THREE.Vector3().crossVectors(dir, view).normalize();
      const nrm = new THREE.Vector3().crossVectors(side, dir).normalize();
      m.matrixAutoUpdate = false;
      const w = u.width * (0.8 + Math.random() * 0.5) * (1 - u.t / u.life * 0.5);
      m.matrix.makeBasis(side.multiplyScalar(w), dir.multiplyScalar(u.len), nrm).setPosition(_p);
      m.material = this.beamMat;
      m.visible = Math.random() < 0.85;
    }
    this.beams = this.beams.filter(m => { if (m.userData.t < m.userData.life) return true; this.scene.remove(m); m.geometry.dispose(); return false; });
    // coins
    let n = 0;
    const L = this.coinList;
    for (let i = 0; i < L.length; i++) {
      const c = L[i];
      c.t += dt;
      if (c.t > c.life) continue;
      c.vy -= 22 * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      if (c.y < c.floor + 0.05 && c.vy < 0) { c.y = c.floor + 0.05; c.vy *= -0.35; c.vx *= 0.6; c.vz *= 0.6; c.wx *= 0.5; }
      c.rx += c.wx * dt; c.ry += c.wy * dt;
      const fade = c.t > c.life - 0.25 ? (c.life - c.t) / 0.25 : 1;
      _q.setFromEuler(_e.set(c.rx, c.ry, 0));
      _m.compose(_p.set(c.x, c.y, c.z), _q, _s.setScalar(c.s * fade * 1.25));
      this.coins.setMatrixAt(n++, _m);
      L[n - 1] = c;
    }
    L.length = n; this.coins.count = n; this.coins.instanceMatrix.needsUpdate = true;
    // shards
    n = 0;
    const S = this.shardList;
    for (let i = 0; i < S.length; i++) {
      const c = S[i];
      c.t += dt;
      if (c.t > c.life) continue;
      c.vy -= 20 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      if (c.y < 0.05 && c.vy < 0) { c.y = 0.05; c.vy *= -0.3; c.vx *= 0.5; c.vz *= 0.5; }
      c.rx += c.wx * dt; c.ry += c.wy * dt;
      const fade = c.t > c.life - 0.3 ? (c.life - c.t) / 0.3 : 1;
      _q.setFromEuler(_e.set(c.rx, c.ry, 0));
      _m.compose(_p.set(c.x, c.y, c.z), _q, _s.setScalar(c.s * fade));
      this.shards.setMatrixAt(n, _m); this.shards.setColorAt(n, _c.set(c.c));
      n++; S[n - 1] = c;
    }
    S.length = n; this.shards.count = n; this.shards.instanceMatrix.needsUpdate = true; if (this.shards.instanceColor) this.shards.instanceColor.needsUpdate = true;
    // planks: tumble, bounce, lie on the ground a moment
    n = 0;
    const PL = this.plankList;
    for (let i = 0; i < PL.length; i++) {
      const c = PL[i];
      c.t += dt;
      if (c.t > c.life) continue;
      c.vy -= 22 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      if (c.y < 0.04 && c.vy < 0) { c.y = 0.04; c.vy *= -0.25; c.vx *= 0.4; c.vz *= 0.4; c.wx *= 0.3; c.wy *= 0.3; }
      c.rx += c.wx * dt; c.ry += c.wy * dt;
      const fade = c.t > c.life - 0.3 ? (c.life - c.t) / 0.3 : 1;
      _q.setFromEuler(_e.set(c.rx, c.ry, 0));
      _m.compose(_p.set(c.x, c.y, c.z), _q, _s.setScalar(c.s * fade));
      this.planks.setMatrixAt(n, _m); this.planks.setColorAt(n, _c.set(c.c));
      n++; PL[n - 1] = c;
    }
    PL.length = n; this.planks.count = n; this.planks.instanceMatrix.needsUpdate = true; if (this.planks.instanceColor) this.planks.instanceColor.needsUpdate = true;
  }

  clear() {
    this.glow.clear(); this.smoke.clear(); this.rings.clear(); this.nets.clear();
    this.stars.clear(); this.bursts.clear(); this.zaps.clear(); this.muzzles.clear();
    this.splatList.length = 0; this.splats.count = 0;
    this.tracerList.length = 0; this.tracers.count = 0; this.trails.count = 0;
    for (const m of this.beams) { this.scene.remove(m); m.geometry.dispose(); }
    this.beams.length = 0;
    this.coinList.length = 0; this.shardList.length = 0; this.plankList.length = 0;
    this.coins.count = 0; this.shards.count = 0; this.bullets.count = 0; this.shells.count = 0; this.planks.count = 0;
  }
}

// a bullet pointing along −z: a bright slug with a hot tip; vertex-coloured so a thousand of them are one draw
function bulletGeo() {
  const parts = [];
  const add = (geo, col) => {
    const g = geo.toNonIndexed(), n = g.attributes.position.count, c = new Float32Array(n * 3), C = new THREE.Color(...col);
    for (let i = 0; i < n; i++) { c[i * 3] = C.r; c[i * 3 + 1] = C.g; c[i * 3 + 2] = C.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (g.attributes.uv) g.deleteAttribute('uv');
    parts.push(g);
  };
  const slug = new THREE.CapsuleGeometry(0.07, 0.42, 2, 6); slug.rotateX(Math.PI / 2);
  add(slug, [1.9, 1.5, 0.75]);
  const tip = new THREE.SphereGeometry(0.075, 6, 4); tip.translate(0, 0, -0.26);
  add(tip, [2.4, 2.2, 1.8]);
  const out = new THREE.BufferGeometry();
  const cat = k => { const arrs = parts.map(p => p.attributes[k].array), len = arrs.reduce((a, x) => a + x.length, 0), o = new Float32Array(len); let off = 0; for (const a of arrs) { o.set(a, off); off += a.length; } return new THREE.BufferAttribute(o, 3); };
  out.setAttribute('position', cat('position')); out.setAttribute('normal', cat('normal')); out.setAttribute('color', cat('color'));
  out.scale(0.9, 0.9, 0.9);
  out.computeBoundingSphere();
  return out;
}
