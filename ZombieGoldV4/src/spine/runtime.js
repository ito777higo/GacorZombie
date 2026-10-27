// Loads the art team's Spine skeletons (assets/spine/<key>/) for three.js.
//
// The official spine-ts 3.6 runtime (vendor/spine-3.6/spine-webgl.js) is a classic script that defines the
// global `spine`; index.html loads it before any module. Only its core is used here (skeleton data, animation
// state, attachments); drawing is done by three.js through src/spine/geometry.js.
//
// Every texture is exported with premultiplied alpha (PMA), so pages are uploaded as they are and every
// material in src/spine/ blends with (ONE, ONE_MINUS_SRC_ALPHA).
import * as THREE from '../view/three.js';
import { SHADOW_SLOT } from './geometry.js';

const S = () => globalThis.spine;
export const hasSpine = () => typeof globalThis.spine !== 'undefined';

let ROOT = 'assets/spine/';
try { ROOT = new URL('../../assets/spine/', import.meta.url).href; } catch (e) { /* keep the page-relative path */ }

class PageTexture {
  constructor(image) {
    const t = this.texture = new THREE.Texture(image);
    t.flipY = false;                      // Spine's v runs down the page
    t.premultiplyAlpha = false;           // the pixels are premultiplied already
    t.colorSpace = THREE.NoColorSpace;    // sampled and written as they are (see material.js)
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    t.needsUpdate = true;
    this._image = image;
  }
  getImage() { return this._image; }
  setFilters() {}
  setWraps() {}
  dispose() { this.texture.dispose(); }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`${url}: image failed`));
    img.src = url;
  });
}
async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

// One parsed skeleton, shared by every actor and flipbook that draws it.
export class SkeletonAsset {
  constructor(key, data) {
    this.key = key;
    this.data = data;
    this.stateData = new (S().AnimationStateData)(data);
    this.stateData.defaultMix = 0.1;
    this.animations = data.animations.map(a => a.name);
    this.ownShadow = data.slots.some(s => SHADOW_SLOT.test(s.name));   // the art draws its own ground shadow ("yy" = 影子)
    this.boxes = new Map();
  }
  has(name) { return this.animations.includes(name); }
  // the first of `names` this skeleton has (content tables list fallbacks, e.g. ['idle', 'move'])
  pick(...names) { return names.flat().find(n => n && this.has(n)) || null; }
  duration(name) { const a = this.data.findAnimation(name); return a ? a.duration : 0; }

  // Bounding box {x0, y0, x1, y1} (skeleton units, y up, origin at the feet) over `samples` poses of an
  // animation, without the art's shadow slot. Cached.
  box(anim, samples = 8) {
    const k = `${anim}|${samples}`;
    if (this.boxes.has(k)) return this.boxes.get(k);
    const sp = S(), sk = new sp.Skeleton(this.data), a = anim && this.data.findAnimation(anim);
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const v = [];
    for (let i = 0; i < (a ? samples : 1); i++) {
      sk.setToSetupPose();
      if (a) a.apply(sk, 0, a.duration * i / samples, false, null, 1, sp.MixPose.setup, sp.MixDirection.in);
      sk.updateWorldTransform();
      for (const slot of sk.drawOrder) {
        const at = slot.getAttachment();
        if (!at || SHADOW_SLOT.test(slot.data.name) || slot.color.a * at.color.a < 0.05) continue;
        let n = 0;
        if (at instanceof sp.RegionAttachment) { at.computeWorldVertices(slot.bone, v, 0, 2); n = 8; }
        else if (at instanceof sp.MeshAttachment) { n = at.worldVerticesLength; at.computeWorldVertices(slot, 0, n, v, 0, 2); }
        for (let j = 0; j < n; j += 2) {
          if (v[j] < b.x0) b.x0 = v[j]; if (v[j] > b.x1) b.x1 = v[j];
          if (v[j + 1] < b.y0) b.y0 = v[j + 1]; if (v[j + 1] > b.y1) b.y1 = v[j + 1];
        }
      }
    }
    if (!isFinite(b.x0)) Object.assign(b, { x0: -1, y0: 0, x1: 1, y1: 2 });
    this.boxes.set(k, b);
    return b;
  }
}

const cache = new Map();
// Fetches and parses assets/spine/<key>/<name>.json + .atlas.txt + pages. Cached per key; a failed load can retry.
export function loadSkeleton(key) {
  let p = cache.get(key);
  if (p) return p;
  p = (async () => {
    if (!hasSpine()) throw new Error('spine runtime missing (vendor/spine-3.6/spine-webgl.js)');
    const sp = S(), name = key.split('/').pop(), dir = `${ROOT}${key}/`;
    const [json, atlasText] = await Promise.all([fetchText(`${dir}${name}.json`), fetchText(`${dir}${name}.atlas.txt`)]);
    const pages = atlasText.split(/\r?\n/).map(l => l.trim()).filter(l => /\.(png|jpg)$/i.test(l));
    const images = await Promise.all(pages.map(pg => loadImage(dir + pg)));
    const tex = new Map(pages.map((pg, i) => [pg, new PageTexture(images[i])]));
    const atlas = new sp.TextureAtlas(atlasText, path => tex.get(path));
    const data = new sp.SkeletonJson(new sp.AtlasAttachmentLoader(atlas)).readSkeletonData(json);
    return new SkeletonAsset(key, data);
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

export const loadSkeletons = keys => Promise.all([...new Set(keys)].map(loadSkeleton));
