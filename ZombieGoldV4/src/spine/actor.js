// A live Spine skeleton in the 3D world: bosses, the hero, anything drawn a few at a time and big enough
// that a baked flipbook would be blurry. It is an Object3D: position = the feet, scale = world units per
// skeleton unit (setHeight picks it from the art). Crowds use flipbook.js instead.
import * as THREE from '../view/three.js';
import { SkeletonWalker, STRIDE } from './geometry.js';
import { liveMaterial } from './material.js';

const walker = { w: null };
const getWalker = () => (walker.w ||= new SkeletonWalker());
const SLOT_STEP = 0.0015;   // world units towards the camera per drawn attachment (see liveMaterial)

export class SpineActor extends THREE.Mesh {
  constructor(asset, o = {}) {
    const geo = new THREE.BufferGeometry();
    super(geo, []);
    this.asset = asset;
    this.skeleton = new globalThis.spine.Skeleton(asset.data);
    this.state = new globalThis.spine.AnimationState(asset.stateData);
    this.skeleton.setToSetupPose();
    this.frustumCulled = false;
    this.renderOrder = o.renderOrder ?? 1;
    this.anim = null; this.loop = false;
    this.speed = 1;
    this.flip = false;          // mirror the art (zombies are drawn facing left)
    this.roll = 0;              // radians, about the feet
    this.tint = new THREE.Vector4(1, 1, 1, 1);
    this.flash = 0;             // 0..1 white hit flash
    this.noShadow = !!o.noShadow;
    this.cap = 0;
    this.mats = new Map();      // page → material
    this.ref = o.ref || asset.pick('idle', 'move', asset.animations[0]);
    if (o.height) this.setHeight(o.height);
  }

  // Scales the actor so the reference animation's box is `h` world units tall.
  setHeight(h) {
    const b = this.asset.box(this.ref);
    this.scale.setScalar(h / Math.max(1, b.y1 - Math.min(0, b.y0)));
    return this;
  }
  // skeleton box of the reference pose in world units (for hit areas, labels over the head)
  get worldBox() {
    const b = this.asset.box(this.ref), s = this.scale.x;
    return { w: (b.x1 - b.x0) * s, h: (b.y1 - Math.min(0, b.y0)) * s };
  }

  // Starts the first of `names` the skeleton has, unless it is already playing. Returns the name or null.
  play(names, loop = true, mix = true) {
    const pick = this.asset.pick(names);
    if (!pick) return null;
    if (pick === this.anim && loop === this.loop) return pick;
    this.anim = pick; this.loop = loop;
    if (mix) this.state.setAnimation(0, pick, loop);
    else { this.state.clearTracks(); this.skeleton.setToSetupPose(); this.state.setAnimation(0, pick, loop); }
    return pick;
  }
  // queue `names` after the current one-shot (e.g. back to idle after an attack)
  then(names, loop = true, delay = 0) {
    const pick = this.asset.pick(names);
    if (pick) { this.state.addAnimation(0, pick, loop, delay); }
    return pick;
  }
  // seconds left in the current one-shot (0 when looping or done)
  get remaining() {
    const e = this.state.getCurrent(0);
    return !e || e.loop ? 0 : Math.max(0, e.animationEnd - e.trackTime);
  }

  update(dt) {
    this.state.update(dt * this.speed);
    this.state.apply(this.skeleton);
    this.skeleton.updateWorldTransform();
    this.rebuild();
  }

  pageMaterial(page) {
    let m = this.mats.get(page);
    if (!m) { m = liveMaterial(page.texture); this.mats.set(page, m); }
    const u = m.uniforms;
    u.uFlip.value = this.flip ? -1 : 1; u.uRoll.value = this.roll; u.uTint.value.copy(this.tint); u.uFlash.value = this.flash;
    return m;
  }

  rebuild() {
    let nv = 0, ni = 0, order = 0;
    const runs = [];
    // first pass counts, so the buffers grow at most once
    getWalker().walk(this.skeleton, (page, v, n, tris, nt) => {
      const last = runs[runs.length - 1];
      if (last && last.page === page) last.count += nt; else runs.push({ page, start: ni, count: nt });
      nv += n; ni += nt;
    }, { noShadow: this.noShadow });
    if (nv > this.cap) this.alloc(Math.ceil(nv * 1.5), Math.ceil(ni * 1.5));
    const P = this.pos, UV = this.uvs, C = this.cols, I = this.idx;
    let vo = 0, io = 0;
    getWalker().walk(this.skeleton, (page, v, n, tris, nt) => {
      const z = order++ * SLOT_STEP;
      for (let i = 0; i < n; i++) {
        const k = i * STRIDE, o = (vo + i);
        P[o * 3] = v[k]; P[o * 3 + 1] = v[k + 1]; P[o * 3 + 2] = z;
        C[o * 4] = v[k + 2]; C[o * 4 + 1] = v[k + 3]; C[o * 4 + 2] = v[k + 4]; C[o * 4 + 3] = v[k + 5];
        UV[o * 2] = v[k + 6]; UV[o * 2 + 1] = v[k + 7];
      }
      for (let t = 0; t < nt; t++) I[io + t] = tris[t] + vo;
      vo += n; io += nt;
    }, { noShadow: this.noShadow });
    const g = this.geometry;
    g.clearGroups();
    const mats = [];
    runs.forEach((r, i) => { g.addGroup(r.start, r.count, i); mats.push(this.pageMaterial(r.page)); });
    this.material = mats;
    g.setDrawRange(0, ni);
    for (const k of ['position', 'uv', 'spColor']) g.attributes[k].needsUpdate = true;
    g.index.needsUpdate = true;
  }

  alloc(nv, ni) {
    this.cap = nv;
    this.pos = new Float32Array(nv * 3); this.uvs = new Float32Array(nv * 2); this.cols = new Float32Array(nv * 4);
    this.idx = new Uint32Array(ni);
    const g = this.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('spColor', new THREE.BufferAttribute(this.cols, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
  }

  dispose() {
    this.geometry.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.removeFromParent();
  }
}
