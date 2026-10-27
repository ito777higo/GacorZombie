// Crowds of Spine figures (the squad, zombie hordes). Each animation is sampled once at load into frames
// of one atlas texture on the GPU ("flipbook"); a figure on screen is then one textured quad showing the
// frame its own clock has reached, so hundreds of animated figures cost one draw call per atlas.
//
//   const book = bakeFlipbook(renderer, [
//     { id: 'helmet', asset, height: 1.15, cell: 112, clips: { run: ['move', 12], die: ['die', 12, false] } },
//   ]);
//   const crowd = new SpriteCrowd(scene, book, 200);
//   crowd.begin(); crowd.put('helmet', 'run', t, x, y, z, face); …; crowd.end(camera);
import * as THREE from '../view/three.js';
import { SkeletonWalker, STRIDE, pose } from './geometry.js';
import { bakeMaterial, crowdMaterial, blobMaterial } from './material.js';

const PAD = 4;           // empty pixels round every cell (mipmaps blur into neighbours otherwise)
const MAX_SIZE = 2048;

/**
 * Bakes figures into one atlas. spec:
 *   id       key for put()
 *   asset    SkeletonAsset (runtime.js)
 *   height   world height of the reference pose
 *   cell     pixel height the reference pose gets in the atlas (≈ its tallest size on a phone screen)
 *   clips    { clipKey: [animation names (first one the skeleton has wins), fps, loop = true] }
 *   ref      animation whose box defines `height` (default: the first clip's animation)
 *   noShadow true to leave out the art's own shadow slot
 */
export function bakeFlipbook(renderer, specs, { maxSize = MAX_SIZE } = {}) {
  const sp = globalThis.spine;
  // 1. measure: cell box per figure (union of every baked frame), pixels per skeleton unit
  const figs = specs.map(s => {
    const clips = {};
    for (const [key, [names, fps, loop = true]] of Object.entries(s.clips)) {
      const name = s.asset.pick(names);
      if (!name) continue;
      const dur = s.asset.duration(name) || 0.5;
      const n = loop ? Math.max(1, Math.round(dur * fps)) : Math.max(2, Math.ceil(dur * fps) + 1);
      clips[key] = { name, fps: n / dur, loop, duration: dur, times: Array.from({ length: n }, (_, i) => (loop ? dur * i / n : dur * i / (n - 1))), frames: [] };
    }
    const refName = s.asset.pick(s.ref || Object.values(s.clips)[0][0]) || Object.values(clips)[0]?.name;
    const rb = s.asset.box(refName);
    const refH = Math.max(1, rb.y1 - Math.min(0, rb.y0));
    const box = { x0: rb.x0, y0: Math.min(0, rb.y0), x1: rb.x1, y1: rb.y1 };
    for (const c of Object.values(clips)) {
      const b = s.asset.box(c.name, c.times.length);
      box.x0 = Math.min(box.x0, b.x0); box.y0 = Math.min(box.y0, b.y0); box.x1 = Math.max(box.x1, b.x1); box.y1 = Math.max(box.y1, b.y1);
    }
    // effects (blood bursts, explosions) can be far bigger than the figure: cap the cell, the rest is cut off
    const capW = refH * 2.4, capH = refH * 1.8, cx = 0;
    box.x0 = Math.max(box.x0, cx - capW / 2); box.x1 = Math.min(box.x1, cx + capW / 2); box.y1 = Math.min(box.y1, box.y0 + capH);
    return { s, clips, refH, box };
  });
  // 2. pack: shelf rows; shrink every cell a step at a time until everything fits
  let k = 1, W = 0, H = 0, cells = null;
  for (let tries = 0; tries < 12; tries++, k *= 0.88) {
    const res = pack(figs, k, maxSize);
    if (res) { ({ W, H, cells } = res); break; }
  }
  if (!cells) throw new Error('flipbook: figures do not fit');
  // 3. draw every frame into its cell
  const rt = new THREE.WebGLRenderTarget(W, H, {
    depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    colorSpace: THREE.NoColorSpace, anisotropy: 4,
  });
  const scene = new THREE.Scene(), walker = new SkeletonWalker();
  const batches = [];   // { page, pos[], uv[], col[], cell[], idx[] } in draw order
  let cur = null, ci = 0;
  const types = {};
  for (const f of figs) {
    const { s, box } = f, sk = new sp.Skeleton(s.asset.data);
    const ppu = cells.ppu[ci] ?? 0;
    const T = types[s.id] = { id: s.id, height: s.height, ownShadow: s.asset.ownShadow && !s.noShadow, clips: {} };
    for (const [key, c] of Object.entries(f.clips)) {
      const anim = s.asset.data.findAnimation(c.name), frames = [];
      for (const t of c.times) {
        const cell = cells.list[ci++];
        pose(sk, anim, t);
        const ox = cell.x + PAD - box.x0 * ppu, oy = cell.y + PAD - box.y0 * ppu;
        const rect = [cell.x + 1, cell.y + 1, cell.x + cell.w - 1, cell.y + cell.h - 1];
        walker.walk(sk, (page, v, n, tris, nt) => {
          if (!cur || cur.page !== page) batches.push(cur = { page, pos: [], uv: [], col: [], cell: [], idx: [] });
          const base = cur.pos.length / 3;
          for (let i = 0; i < n; i++) {
            const j = i * STRIDE;
            cur.pos.push(ox + v[j] * ppu, oy + v[j + 1] * ppu, 0);
            cur.col.push(v[j + 2], v[j + 3], v[j + 4], v[j + 5]);
            cur.uv.push(v[j + 6], v[j + 7]);
            cur.cell.push(rect[0], rect[1], rect[2], rect[3]);
          }
          for (let i = 0; i < nt; i++) cur.idx.push(tris[i] + base);
        }, { noShadow: s.noShadow });
        frames.push([cell.x / W, cell.y / H, (cell.x + cell.w) / W, (cell.y + cell.h) / H]);
      }
      T.clips[key] = { frames, fps: c.fps, loop: c.loop, duration: c.duration };
    }
    // quad in skeleton units and where the feet sit in it (0..1 from the bottom-left)
    const c0 = cells.list[ci - 1];
    T.quadUnits = [c0.w / ppu, c0.h / ppu];
    T.anchor = [(PAD - box.x0 * ppu) / c0.w, (PAD - box.y0 * ppu) / c0.h];
    T.worldPerUnit = s.height / f.refH;
  }
  batches.forEach((b, i) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('spColor', new THREE.Float32BufferAttribute(b.col, 4));
    g.setAttribute('cell', new THREE.Float32BufferAttribute(b.cell, 4));
    g.setIndex(b.idx);
    const m = new THREE.Mesh(g, bakeMaterial(b.page.texture, [W, H]));
    m.frustumCulled = false; m.renderOrder = i;
    scene.add(m);
  });
  const prev = { rt: renderer.getRenderTarget(), auto: renderer.autoClear, color: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;
  renderer.render(scene, new THREE.OrthographicCamera());
  renderer.setRenderTarget(prev.rt);
  renderer.setClearColor(prev.color, prev.alpha);
  renderer.autoClear = prev.auto;
  scene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return { texture: rt.texture, target: rt, size: [W, H], types, dispose: () => rt.dispose() };
}

function pack(figs, k, maxSize) {
  const list = [], ppu = [];
  for (const f of figs) {
    const p = f.s.cell * k / f.refH;
    const w = Math.ceil((f.box.x1 - f.box.x0) * p) + PAD * 2, h = Math.ceil((f.box.y1 - f.box.y0) * p) + PAD * 2;
    for (const c of Object.values(f.clips)) for (let i = 0; i < c.times.length; i++) { list.push({ w, h }); ppu.push(p); }
  }
  // ppu is indexed by the first cell of each figure in bakeFlipbook, so keep one entry per cell
  let x = 0, y = 0, rowH = 0, W = 0;
  for (const c of list) {
    if (c.w > maxSize) return null;
    if (x + c.w > maxSize) { y += rowH; x = 0; rowH = 0; }
    c.x = x; c.y = y; x += c.w; rowH = Math.max(rowH, c.h); W = Math.max(W, x);
  }
  const H = y + rowH;
  if (H > maxSize) return null;
  const pow2 = n => 2 ** Math.ceil(Math.log2(Math.max(64, n)));
  return { W: pow2(W), H: pow2(H), cells: { list, ppu } };
}

const _v = new THREE.Vector3();

/** Draws flipbook figures. Between begin() and end(camera), put() one figure per call. */
export class SpriteCrowd {
  constructor(parent, book, max, { renderOrder = 2, blobs = true } = {}) {
    this.book = book; this.max = max; this.n = 0;
    const g = this.geo = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 3, 0]);
    const attr = (name, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
    this.A = { iPos: attr('iPos', 3), iQuad: attr('iQuad', 4), iUV: attr('iUV', 4), iTint: attr('iTint', 4), iFx: attr('iFx', 4) };
    g.instanceCount = 0;
    this.mesh = new THREE.Mesh(g, crowdMaterial(book.texture));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = renderOrder;
    parent.add(this.mesh);
    // the figures' records for this frame, sorted far to near in end()
    this.rec = Array.from({ length: max }, () => ({ x: 0, y: 0, z: 0, w: 0, h: 0, ax: 0, ay: 0, uv: null, r: 1, g: 1, b: 1, a: 1, flash: 0, roll: 0, flip: 1, d: 0, shadow: false }));
    this.order = [];
    if (blobs) {
      const bg = this.blobGeo = new THREE.InstancedBufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
      bg.setIndex([0, 1, 2, 2, 3, 0]);
      const battr = (name, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size); a.setUsage(THREE.DynamicDrawUsage); bg.setAttribute(name, a); return a; };
      this.B = { iPos: battr('iPos', 3), iSize: battr('iSize', 3) };
      bg.instanceCount = 0;
      this.blobs = new THREE.Mesh(bg, blobMaterial());
      this.blobs.frustumCulled = false; this.blobs.renderOrder = 0;
      parent.add(this.blobs);
    }
  }
  has(id) { return !!this.book.types[id]; }
  clip(id, key) { const T = this.book.types[id]; return T && (T.clips[key] || Object.values(T.clips)[0]); }
  frameOf(c, t) {
    const n = c.frames.length, f = Math.floor(t * c.fps);
    return c.loop ? ((f % n) + n) % n : Math.max(0, Math.min(n - 1, f));
  }
  begin() { this.n = 0; }

  /**
   * One figure. face: -1 = as drawn, +1 = mirrored (the zombie art faces left, the hero faces away from us).
   * s scales the figure's height; tint is a THREE.Color or null; alpha fades it; roll tilts it about the feet;
   * flash (0..1) whitens it for a hit.
   */
  put(id, key, t, x, y, z, face = -1, s = 1, tint = null, alpha = 1, roll = 0, flash = 0) {
    if (this.n >= this.max) return;
    const T = this.book.types[id];
    if (!T) return;
    const c = T.clips[key] || Object.values(T.clips)[0];
    const r = this.rec[this.n++], k = T.worldPerUnit * s;
    r.x = x; r.y = y; r.z = z;
    r.w = T.quadUnits[0] * k; r.h = T.quadUnits[1] * k; r.ax = T.anchor[0]; r.ay = T.anchor[1];
    r.uv = c.frames[this.frameOf(c, t)];
    if (tint) { r.r = tint.r; r.g = tint.g; r.b = tint.b; } else r.r = r.g = r.b = 1;
    r.a = alpha; r.flash = flash; r.roll = roll; r.flip = face > 0 ? -1 : 1;
    r.shadow = !T.ownShadow;
    r.sw = T.height * s * 0.32;
  }

  end(camera) {
    const n = this.n, A = this.A;
    // far to near, so the soft edges of near figures blend over the ones behind them
    camera.getWorldDirection(_v);
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const order = this.order; order.length = n;
    for (let i = 0; i < n; i++) { const r = this.rec[i]; r.d = (r.x - cx) * _v.x + (r.y - cy) * _v.y + (r.z - cz) * _v.z; order[i] = r; }
    order.sort((p, q) => q.d - p.d);
    const P = A.iPos.array, Q = A.iQuad.array, U = A.iUV.array, C = A.iTint.array, F = A.iFx.array;
    let nb = 0;
    for (let i = 0; i < n; i++) {
      const r = order[i], i3 = i * 3, i4 = i * 4;
      P[i3] = r.x; P[i3 + 1] = r.y; P[i3 + 2] = r.z;
      Q[i4] = r.w; Q[i4 + 1] = r.h; Q[i4 + 2] = r.ax; Q[i4 + 3] = r.ay;
      U[i4] = r.uv[0]; U[i4 + 1] = r.uv[1]; U[i4 + 2] = r.uv[2]; U[i4 + 3] = r.uv[3];
      C[i4] = r.r; C[i4 + 1] = r.g; C[i4 + 2] = r.b; C[i4 + 3] = r.a;
      F[i4] = r.flash; F[i4 + 1] = r.roll; F[i4 + 2] = r.flip; F[i4 + 3] = 0;
      if (this.B && r.shadow && r.a > 0.05) {
        // a blob on the ground under the feet, fading as the figure leaves the ground
        const bp = this.B.iPos.array, bs = this.B.iSize.array, b3 = nb * 3;
        bp[b3] = r.x; bp[b3 + 1] = 0; bp[b3 + 2] = r.z;
        bs[b3] = r.sw; bs[b3 + 1] = r.sw * 0.55; bs[b3 + 2] = r.a * Math.max(0, 1 - Math.abs(r.y) * 0.6);
        nb++;
      }
    }
    for (const a of Object.values(A)) a.needsUpdate = true;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (this.B) {
      this.B.iPos.needsUpdate = this.B.iSize.needsUpdate = true;
      this.blobGeo.instanceCount = nb; this.blobs.visible = nb > 0;
    }
  }
  setVisible(v) { this.mesh.visible = v && this.n > 0; if (this.blobs) this.blobs.visible = v; }
  dispose() {
    this.geo.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent();
    if (this.blobs) { this.blobGeo.dispose(); this.blobs.material.dispose(); this.blobs.removeFromParent(); }
  }
}
