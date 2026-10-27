// Loads the packed Quaternius prop models (assets/models/*.glb, built by tools/pack_models.py) and resolves image
// paths under assets/. The Artifact page sets globalThis.__GF_MODEL_FMT = 'json' and reads assets/models/*.json
// instead, because Artifacts serve no .glb (see tools/build_artifact.py).
import { GLTFLoader } from '../../vendor/jsm/GLTFLoader.js';

const BASE = new URL('../../assets/models/', import.meta.url).href;
const loader = new GLTFLoader();
const pending = new Map();
const ready = new Map();

function b64(s) {
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function loadModel(name) {
  if (!pending.has(name)) {
    pending.set(name, (async () => {
      let buf;
      if (globalThis.__GF_MODEL_FMT === 'json') {
        const r = await fetch(BASE + name + '.json');
        if (!r.ok) throw new Error(`model ${name}: HTTP ${r.status}`);
        buf = b64((await r.json()).glb);
      } else {
        const r = await fetch(BASE + name + '.glb');
        if (!r.ok) throw new Error(`model ${name}: HTTP ${r.status}`);
        buf = await r.arrayBuffer();
      }
      const gltf = await loader.parseAsync(buf, '');
      ready.set(name, gltf);
      return gltf;
    })());
  }
  return pending.get(name);
}
export const loadModels = names => Promise.all(names.map(loadModel));
// synchronous access once loaded (null before)
export const model = name => ready.get(name) || null;
export const hasModels = names => names.every(n => ready.has(n));

// Images under assets/ (particles, UI pieces, the flip-card art), by path.
const IMG_BASE = new URL('../../assets/', import.meta.url).href;
export const imageUrl = path => IMG_BASE + path;
