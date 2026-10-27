// The glTF props (Quaternius CC0 kits: cars, barriers, crates, the heroes' pickup …) as static geometry for
// instancing: every mesh of a model merged into one vertex-coloured geometry (the kits' textures are colour
// palettes, read once per vertex), so a road's worth of props shares one material.
import * as THREE from './three.js';
import { clone as cloneSkinned } from '../../vendor/jsm/SkeletonUtils.js';
import { withRim } from './art.js';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3(), _tn = new THREE.Vector3();
const _sk = new THREE.Matrix4(), _bm = new THREE.Matrix4(), _nm = new THREE.Matrix3();

// the named node a mesh belongs to: its nearest ancestor (or itself) whose name is in `names`
function owner(o, names) {
  for (let p = o; p; p = p.parent) if (names.has(p.name)) return p.name;
  return null;
}

// Pose of one mesh, in the model's root space: positions + normals (skinned if it is a SkinnedMesh).
function snapshotMesh(mesh, rootInv) {
  const g = mesh.geometry, P = g.attributes.position, N = g.attributes.normal;
  const n = P.count, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const world = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
  const skinned = mesh.isSkinnedMesh;
  let si, sw, bones, bindM, bindI;
  if (skinned) {
    mesh.skeleton.update();
    si = g.attributes.skinIndex; sw = g.attributes.skinWeight;
    bones = mesh.skeleton.boneMatrices; bindM = mesh.bindMatrix; bindI = mesh.bindMatrixInverse;
  }
  const e = _sk.elements;
  for (let i = 0; i < n; i++) {
    _v.fromBufferAttribute(P, i);
    if (N) _n.fromBufferAttribute(N, i); else _n.set(0, 1, 0);
    if (skinned) {
      // skin matrix = Σ w · bone; position: bindInverse · skin · bind · p
      e.fill(0);
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (!w) continue;
        const b = si.getComponent(i, k) * 16;
        for (let j = 0; j < 16; j++) e[j] += bones[b + j] * w;
      }
      _bm.multiplyMatrices(_sk, bindM).premultiply(bindI);
      _v.applyMatrix4(_bm);
      _nm.getNormalMatrix(_bm); _n.applyMatrix3(_nm);
    }
    _v.applyMatrix4(world);
    _nm.getNormalMatrix(world); _n.applyMatrix3(_nm).normalize();
    pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
    nor[i * 3] = _n.x; nor[i * 3 + 1] = _n.y; nor[i * 3 + 2] = _n.z;
  }
  return { pos, nor };
}

// Quaternius textures are colour palettes: every face samples one flat swatch. Reading the swatch under each
// vertex once turns textured models into plain vertex colours, so every character and prop shares one material.
const texCache = new WeakMap();
function texels(map) {
  let t = texCache.get(map);
  if (!t) {
    const img = map.image, w = img.width, h = img.height;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
    t = { w, h, d: x.getImageData(0, 0, w, h).data, flip: map.flipY };
    texCache.set(map, t);
  }
  return t;
}
const _tc = new THREE.Color();
function sampleColor(map, u, v, out) {
  const t = texels(map);
  u -= Math.floor(u); v -= Math.floor(v);
  const px = Math.min(t.w - 1, Math.floor(u * t.w)), py = Math.min(t.h - 1, Math.floor((t.flip ? 1 - v : v) * t.h));
  const k = (py * t.w + px) * 4;
  return out.setRGB(t.d[k] / 255, t.d[k + 1] / 255, t.d[k + 2] / 255, THREE.SRGBColorSpace);
}

// Static attributes of a group of meshes merged into one: index and colour (material colour × palette swatch).
function mergeLayout(meshes, palette) {
  let nv = 0, ni = 0;
  for (const m of meshes) { nv += m.geometry.attributes.position.count; ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
  const index = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
  const color = new Float32Array(nv * 3);
  let vo = 0, io = 0;
  for (const m of meshes) {
    const g = m.geometry, n = g.attributes.position.count, mat = m.material;
    const base = (palette && palette[mat.name] && new THREE.Color(palette[mat.name])) || mat.color || new THREE.Color(1, 1, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < n; i++) {
      if (mat.map && uv && !(palette && palette[mat.name])) sampleColor(mat.map, uv.getX(i), uv.getY(i), _tc).multiply(base);
      else _tc.copy(base);
      color[(vo + i) * 3] = _tc.r; color[(vo + i) * 3 + 1] = _tc.g; color[(vo + i) * 3 + 2] = _tc.b;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) index[io + i] = g.index.getX(i) + vo;
    else for (let i = 0; i < n; i++) index[io + i] = i + vo;
    vo += n; io += g.index ? g.index.count : n;
  }
  return { index: new THREE.BufferAttribute(index, 1), color: new THREE.BufferAttribute(color, 3), nv };
}

function poseGeometry(meshes, layout, rootInv) {
  const pos = new Float32Array(layout.nv * 3), nor = new Float32Array(layout.nv * 3);
  let vo = 0;
  for (const m of meshes) {
    const s = snapshotMesh(m, rootInv);
    pos.set(s.pos, vo * 3); nor.set(s.nor, vo * 3);
    vo += m.geometry.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(layout.index);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', layout.color);
  g.computeBoundingSphere();
  return g;
}


// the one material every prop uses: vertex colours and the soft rim light of the procedural models
export function propMaterial(o = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.roughness ?? 0.62, metalness: 0 });
  return withRim(m, o.rim || '#ffffff', o.rimK ?? 0.3);
}

export const PROP_MAT = propMaterial();

/**
 * A static model (prop, vehicle, or a skinned model in its rest pose) merged into one vertex-coloured geometry,
 * ready for an InstancedMesh. opts: scale, yaw, palette, drop (node names), only (keep just these nodes).
 */
export function staticGeometry(gltf, opts = {}) {
  const root = cloneSkinned(gltf.scene);
  root.scale.setScalar(opts.scale || 1);
  root.rotation.y = opts.yaw || 0;
  const holder = new THREE.Group(); holder.add(root);
  holder.updateMatrixWorld(true);
  const drop = new Set(opts.drop || []), only = opts.only ? new Set(opts.only) : null;
  const meshes = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    if (drop.size && owner(o, drop)) return;
    if (only && !owner(o, only)) return;
    meshes.push(o);
  });
  const layout = mergeLayout(meshes, opts.palette);
  const g = poseGeometry(meshes, layout, new THREE.Matrix4());
  g.computeBoundingBox();
  if (opts.ground) {   // stand it on y = 0
    const dy = -g.boundingBox.min.y;
    g.translate(0, dy, 0); g.computeBoundingBox(); g.computeBoundingSphere();
  }
  return g;
}


