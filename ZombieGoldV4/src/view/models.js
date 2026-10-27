// Procedural low-poly models. Static parts are merged into single vertex-coloured geometries so crowds
// can be drawn as a handful of InstancedMeshes.
import * as THREE from './three.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));
}

const _c = new THREE.Color();
// parts: [geometry, colour | (x,y,z)=>Color, Matrix4?]
export function merge(parts) {
  let n = 0;
  const list = [];
  for (const [geo, color, m] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    if (m) g.applyMatrix4(m);
    list.push([g, color]);
    n += g.attributes.position.count;
  }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const [g, color] of list) {
    const P = g.attributes.position.array, N = g.attributes.normal.array, cnt = g.attributes.position.count;
    pos.set(P, o * 3); nor.set(N, o * 3);
    const fixed = typeof color === 'function' ? null : _c.set(color).clone();
    for (let i = 0; i < cnt; i++) {
      const c = fixed || color(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b;
    }
    o += cnt;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cap = (r, l, s = 8) => new THREE.CapsuleGeometry(r, l, 3, s);
const sph = (r, w = 12, h = 9) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);

export const MAT = {
  actor: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.0 }),
  flat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0, flatShading: true }),
  gold: new THREE.MeshStandardMaterial({ color: 0xffc23a, roughness: 0.22, metalness: 1.0, emissive: 0x6a3a00, emissiveIntensity: 0.35 }),
};


// ---------------------------------------------------------------- props
export function barrelGeo() {
  return merge([
    [cyl(0.52, 0.52, 1.1, 18), '#a8682f', M(0, 0.55, 0)],
    [cyl(0.47, 0.47, 0.02, 18), '#c98a4c', M(0, 1.11, 0)],
    [cyl(0.535, 0.535, 0.07, 18), '#4e2c12', M(0, 0.2, 0)],
    [cyl(0.535, 0.535, 0.07, 18), '#4e2c12', M(0, 0.9, 0)],
  ]);
}
export function barrelBandGeo() {
  return merge([[cyl(0.54, 0.54, 0.24, 18), '#ffffff', M(0, 0.55, 0)]]);
}

export function coinGeo() {
  const g = merge([
    [cyl(0.3, 0.3, 0.07, 20), '#ffffff', M(0, 0, 0, Math.PI / 2)],
    [new THREE.TorusGeometry(0.22, 0.025, 6, 20), '#ffffff', M(0, 0, 0.04)],
    [new THREE.TorusGeometry(0.22, 0.025, 6, 20), '#ffffff', M(0, 0, -0.04)],
  ]);
  return g;
}

export function eggGeo() {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, a = t * Math.PI;
    const y = -Math.cos(a);
    const r = Math.sin(a) * (1 - 0.18 * y);
    pts.push(new THREE.Vector2(Math.max(0.0001, r), y));
  }
  const g = new THREE.LatheGeometry(pts, 40);
  g.scale(1.75, 2.2, 1.75);
  g.translate(0, 2.2, 0);
  g.computeVertexNormals();
  return g;
}



// ---------------------------------------------------------------- traps & set pieces
export function rollerGeo(len) {
  const parts = [[cyl(0.5, 0.5, len, 14), '#5a3b22', M(0, 0, 0, 0, 0, Math.PI / 2)]];
  for (let i = 0; i < 9; i++) {
    const x = -len / 2 + 0.35 + i * (len - 0.7) / 8;
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + (i % 2) * Math.PI / 6;
      const d = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      parts.push([cone(0.13, 0.55, 5), '#cfd6e0', new THREE.Matrix4().compose(new THREE.Vector3(x, d.y * 0.68, d.z * 0.68), q, new THREE.Vector3(1, 1, 1))]);
    }
  }
  parts.push([cyl(0.56, 0.56, 0.12, 14), '#2a2a2e', M(-len / 2 + 0.05, 0, 0, 0, 0, Math.PI / 2)], [cyl(0.56, 0.56, 0.12, 14), '#2a2a2e', M(len / 2 - 0.05, 0, 0, 0, 0, Math.PI / 2)]);
  return merge(parts);
}
export function rollerFrameGeo(len) {
  return merge([
    [box(0.25, 1.4, 0.25), '#ffcc22', M(-len / 2 - 0.2, 0.7, 0)], [box(0.25, 1.4, 0.25), '#ffcc22', M(len / 2 + 0.2, 0.7, 0)],
    [box(0.3, 0.12, 0.6), '#1c1c1c', M(-len / 2 - 0.2, 0.05, 0)], [box(0.3, 0.12, 0.6), '#1c1c1c', M(len / 2 + 0.2, 0.05, 0)],
  ]);
}
export function sawBladeGeo(r) {
  const parts = [[cyl(r, r, 0.08, 28), '#c8ced8', M(0, 0, 0, Math.PI / 2)], [cyl(r * 0.3, r * 0.3, 0.14, 16), '#3a3f4a', M(0, 0, 0, Math.PI / 2)]];
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    parts.push([box(0.28, 0.32, 0.07), '#e8ecf2', M(Math.cos(a) * r, Math.sin(a) * r, 0, 0, 0, a + 0.5)]);
  }
  return merge(parts);
}
export function sawRailGeo(w) {
  const parts = [[box(w, 0.18, 0.7), '#2a2a2e', M(0, 0.06, 0)]];
  for (let i = 0; i < Math.floor(w / 0.8); i++) parts.push([box(0.4, 0.2, 0.72), i % 2 ? '#ffcc22' : '#1c1c1c', M(-w / 2 + 0.4 + i * 0.8, 0.08, 0)]);
  return merge(parts);
}
export function cageGeo() {
  const parts = [[box(2.4, 0.18, 1.6), '#5a5f6a', M(0, 0.09, 0)], [box(2.5, 0.16, 1.7), '#6a707c', M(0, 2.2, 0)]];
  for (let i = 0; i < 7; i++) { const x = -1.15 + i * 0.383; parts.push([cyl(0.045, 0.045, 2.1, 6), '#9aa2ae', M(x, 1.15, -0.78)], [cyl(0.045, 0.045, 2.1, 6), '#9aa2ae', M(x, 1.15, 0.78)]); }
  for (let i = 0; i < 4; i++) { const z = -0.78 + i * 0.52; parts.push([cyl(0.045, 0.045, 2.1, 6), '#9aa2ae', M(-1.15, 1.15, z)], [cyl(0.045, 0.045, 2.1, 6), '#9aa2ae', M(1.15, 1.15, z)]); }
  parts.push([box(0.5, 0.4, 0.12), '#ffcc22', M(0, 1.6, -0.86)]);
  return merge(parts);
}
export function makeHelicopter() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3 });
  const body = new THREE.Mesh(merge([
    [cap(0.9, 1.6, 12), '#3b5a2c', M(0, 0, 0, Math.PI / 2, 0, 0)],
    [sph(0.85, 14, 10), '#9fd8ff', M(0, 0.15, -1.3, 0, 0, 0, 0.9, 0.75, 0.8)],
    [cyl(0.22, 0.12, 3.2, 8), '#3b5a2c', M(0, 0.35, 2.6, Math.PI / 2 - 0.08, 0, 0)],
    [box(0.1, 0.9, 0.7), '#2a4020', M(0, 0.8, 4.1)],
    [box(0.12, 0.12, 2.2), '#22262e', M(-0.75, -1.05, -0.2)], [box(0.12, 0.12, 2.2), '#22262e', M(0.75, -1.05, -0.2)],
    [box(0.08, 0.5, 0.08), '#22262e', M(-0.75, -0.8, -0.8)], [box(0.08, 0.5, 0.08), '#22262e', M(0.75, -0.8, -0.8)],
    [box(0.08, 0.5, 0.08), '#22262e', M(-0.75, -0.8, 0.5)], [box(0.08, 0.5, 0.08), '#22262e', M(0.75, -0.8, 0.5)],
    [cyl(0.12, 0.12, 0.4, 8), '#22262e', M(0, 0.95, 0)],
  ]), mat);
  const rotor = new THREE.Mesh(merge([[box(7, 0.05, 0.3), '#1c1f26', M(0, 0, 0)], [box(0.3, 0.05, 7), '#1c1f26', M(0, 0, 0)]]), mat);
  rotor.position.y = 1.18;
  const tail = new THREE.Mesh(merge([[box(0.04, 1.4, 0.18), '#1c1f26', M(0, 0, 0)]]), mat);
  tail.position.set(0.12, 0.8, 4.1);
  g.add(body, rotor, tail);
  g.userData = { rotor, tail };
  return g;
}
// the wall in the middle of a split stretch, `len` long
export function splitWallGeo(len) {
  const parts = [[box(0.7, 1.3, len), '#c9c5bb', M(0, 0.65, -len / 2)]];
  for (let z = 0; z < len; z += 2.4) parts.push([box(0.72, 0.28, 1.2), '#e2402a', M(0, 0.95, -z - 0.6)]);
  return merge(parts);
}
// the barrier between two gates that cannot be ridden: a red-and-white concrete pillar
export function gateWallGeo() {
  const stripes = (x, y) => new THREE.Color(Math.floor(y / 0.45) % 2 ? '#ffffff' : '#e8382c');
  return merge([[cap(0.3, 2.2, 12), stripes, M(0, 1.4, 0)], [cyl(0.42, 0.46, 0.2, 14), '#9aa0a9', M(0, 0.1, 0)]]);
}
// the white pillars at the outer edges of a gate
export function pillarGeo() {
  return merge([[cyl(0.2, 0.22, 2.5, 14), '#f4f6f8', M(0, 1.25, 0)], [sph(0.23, 14, 10), '#ffffff', M(0, 2.55, 0)], [cyl(0.3, 0.32, 0.18, 14), '#a9afb8', M(0, 0.09, 0)]]);
}
// the thin pillar between two gates that the squad can ride to take both
export function goldPillarGeo() {
  return merge([[cyl(0.1, 0.1, 2.5, 12), '#ffd23f', M(0, 1.25, 0)], [sph(0.17, 12, 9), '#fff0a0', M(0, 2.55, 0)], [cyl(0.22, 0.24, 0.12, 12), '#e0a400', M(0, 0.06, 0)]]);
}



// ---------------------------------------------------------------- scenery (instanced per type)
// smooth rounded rock with a lighter top
function stone(r, col, col2) {
  const g = new THREE.IcosahedronGeometry(r, 2);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const k = 0.86 + 0.14 * Math.sin(P.getX(i) * 5.1 + P.getZ(i) * 3.7) * Math.cos(P.getY(i) * 4.3);
    P.setXYZ(i, P.getX(i) * k, P.getY(i) * k * 0.72, P.getZ(i) * k);
  }
  g.computeVertexNormals();
  return [g, (x, y) => new THREE.Color(col).lerp(new THREE.Color(col2), Math.min(1, Math.max(0, y / r + 0.3)))];
}
export function sceneryGeo(kind) {
  switch (kind) {
    case 'jersey': return merge([
      [box(0.62, 0.42, 2.9), '#d9dce1', M(0, 0.21, 0)],
      [box(0.4, 0.34, 2.9), '#e6e8ec', M(0, 0.58, 0)],
      [cap(0.2, 2.5, 8), '#eef0f3', M(0, 0.76, 0, Math.PI / 2, 0, 0, 1, 1, 0.6)],
      [box(0.64, 0.08, 2.92), '#c2c6cc', M(0, 0.03, 0)],
    ]);
    case 'stone': { const [g, c] = stone(1, '#c98e5a', '#e8b27a'); return merge([[g, c, M(0, 0.25, 0)]]); }
    case 'mesa': { const [g, c] = stone(1, '#c27a4a', '#e5a56c'); return merge([[g, c, M(0, 0, 0, 0, 0, 0, 1, 1.6, 1)]]); }
    case 'cactus': return merge([
      [cap(0.22, 1.3, 10), '#4fae4a', M(0, 0.85, 0)],
      [cap(0.14, 0.45, 8), '#5cbf55', M(0.36, 1.05, 0, 0, 0, -0.1)],
      [cap(0.12, 0.25, 8), '#5cbf55', M(0.24, 0.8, 0, 0, 0, Math.PI / 2)],
      [cap(0.13, 0.35, 8), '#4fae4a', M(-0.34, 1.25, 0, 0, 0, 0.1)],
      [cap(0.11, 0.22, 8), '#4fae4a', M(-0.22, 1.05, 0, 0, 0, Math.PI / 2)],
    ]);
    case 'shrub': return merge([[sph(0.42, 10, 7), '#a7b05a', M(0, 0.25, 0, 0, 0, 0, 1.2, 0.7, 1)], [sph(0.3, 9, 6), '#bcc56a', M(0.35, 0.22, 0.12)], [sph(0.26, 9, 6), '#949d4c', M(-0.3, 0.2, -0.1)]]);
    case 'tires': return merge([
      [new THREE.TorusGeometry(0.34, 0.15, 8, 16), '#2a2c31', M(0, 0.15, 0, Math.PI / 2)],
      [new THREE.TorusGeometry(0.34, 0.15, 8, 16), '#33363c', M(0.05, 0.43, 0.03, Math.PI / 2)],
      [new THREE.TorusGeometry(0.34, 0.15, 8, 16), '#2a2c31', M(-0.04, 0.71, -0.02, Math.PI / 2)],
    ]);
    case 'oildrum': return merge([[cyl(0.34, 0.34, 0.92, 16), '#e2412f', M(0, 0.46, 0)], [cyl(0.355, 0.355, 0.06, 16), '#b52a1d', M(0, 0.3, 0)], [cyl(0.355, 0.355, 0.06, 16), '#b52a1d', M(0, 0.64, 0)], [cyl(0.3, 0.3, 0.02, 16), '#f0d23a', M(0, 0.93, 0)]]);
    case 'pine': return merge([
      [cyl(0.12, 0.18, 1.0, 6), '#6b4a2a', M(0, 0.5, 0)],
      [cone(1.0, 1.6, 7), '#2f7a3a', M(0, 1.6, 0)],
      [cone(0.8, 1.3, 7), '#3b9446', M(0, 2.3, 0)],
      [cone(0.55, 1.0, 7), '#4aa852', M(0, 2.9, 0)],
    ]);
    case 'tree': return merge([
      [cyl(0.14, 0.2, 1.2, 6), '#6b4a2a', M(0, 0.6, 0)],
      [ico(1.0, 1), '#4caf50', M(0, 1.9, 0, 0, 0, 0, 1, 0.9, 1)],
      [ico(0.7, 1), '#5cc160', M(0.45, 2.3, 0.2)],
      [ico(0.6, 1), '#3d9a45', M(-0.4, 2.2, -0.3)],
    ]);
    case 'deadtree': return merge([
      [cyl(0.1, 0.18, 2.0, 6), '#5d4a3a', M(0, 1.0, 0)],
      [cyl(0.05, 0.08, 1.0, 5), '#5d4a3a', M(0.3, 1.7, 0, 0, 0, -0.8)],
      [cyl(0.04, 0.07, 0.8, 5), '#5d4a3a', M(-0.25, 1.5, 0.1, 0.2, 0, 0.9)],
    ]);
    case 'rock': return merge([[new THREE.DodecahedronGeometry(0.7, 0), '#8d8a84', M(0, 0.3, 0, 0.3, 0.5, 0, 1.2, 0.7, 1)], [new THREE.DodecahedronGeometry(0.4, 0), '#a29e96', M(0.6, 0.15, 0.3, 0.6, 0, 0.4)]]);
    case 'bush': return merge([[ico(0.55, 1), '#3f9a45', M(0, 0.35, 0, 0, 0, 0, 1.2, 0.8, 1)], [ico(0.4, 1), '#58b85a', M(0.45, 0.3, 0.1)]]);
    case 'car': return merge([
      [box(1.7, 0.6, 3.4), '#9a4a2a', M(0, 0.55, 0)],
      [box(1.5, 0.55, 1.7), '#7a3a22', M(0, 1.1, 0.2)],
      [box(1.4, 0.45, 1.5), '#2a3a4a', M(0, 1.12, 0.2, 0, 0, 0, 1.02, 0.85, 1.02)],
      [cyl(0.34, 0.34, 0.3, 10), '#1a1a1a', M(-0.86, 0.34, 1.05, 0, 0, Math.PI / 2)],
      [cyl(0.34, 0.34, 0.3, 10), '#1a1a1a', M(0.86, 0.34, 1.05, 0, 0, Math.PI / 2)],
      [cyl(0.34, 0.34, 0.3, 10), '#1a1a1a', M(-0.86, 0.34, -1.05, 0, 0, Math.PI / 2)],
      [cyl(0.34, 0.34, 0.3, 10), '#1a1a1a', M(0.86, 0.34, -1.05, 0, 0, Math.PI / 2)],
    ]);
    case 'barrier': return merge([
      [box(0.5, 0.75, 2.4), '#c9c5bb', M(0, 0.38, 0)],
      [box(0.52, 0.16, 0.5), '#e2402a', M(0, 0.55, -0.85)], [box(0.52, 0.16, 0.5), '#e2402a', M(0, 0.55, 0)], [box(0.52, 0.16, 0.5), '#e2402a', M(0, 0.55, 0.85)],
    ]);
    case 'sandbags': {
      const p = [];
      for (let r = 0; r < 2; r++) for (let i = 0; i < 4 - r; i++) p.push([cap(0.2, 0.5, 6), r ? '#bfa774' : '#a8925e', M(0, 0.2 + r * 0.32, -0.95 + i * 0.62 + r * 0.31, Math.PI / 2, 0, 0, 1, 1, 0.75)]);
      return merge(p);
    }
    case 'palm': {
      const p = [];
      for (let i = 0; i < 6; i++) p.push([cyl(0.15 - i * 0.012, 0.17 - i * 0.012, 0.65, 7), i % 2 ? '#8a6a3a' : '#9a7a48', M(i * i * 0.012, 0.32 + i * 0.6, 0, 0, 0, -i * 0.04)]);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        p.push([box(1.8, 0.05, 0.42), k % 2 ? '#3fae4a' : '#2f9a3e', new THREE.Matrix4().compose(V(0.4 + Math.cos(a) * 0.8, 3.75, Math.sin(a) * 0.8), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, -0.45, 'YXZ')), V(1, 1, 1))]);
      }
      p.push([sph(0.18, 8, 6), '#6a4a1a', M(0.4, 3.6, 0.1)], [sph(0.18, 8, 6), '#6a4a1a', M(0.25, 3.58, -0.15)]);
      return merge(p);
    }
    case 'umbrella': return merge([[cyl(0.04, 0.04, 2.0, 6), '#eeeeee', M(0, 1.0, 0)], [cone(1.2, 0.5, 10), (x, y, z) => new THREE.Color(Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 5)) % 2 ? '#ff5a4a' : '#ffffff'), M(0, 2.1, 0)]]);
    case 'post': return merge([[cyl(0.22, 0.24, 4.4, 8), '#6a4428', M(0, -1.6, 0)], [cyl(0.25, 0.25, 0.12, 8), '#4a2e1a', M(0, 0.62, 0)]]);
    case 'rail': return merge([[cyl(0.06, 0.06, 1.0, 6), '#7a5232', M(0, 0.5, 0)], [box(0.08, 0.08, 3.0), '#8a6040', M(0, 0.95, 0)], [box(0.06, 0.06, 3.0), '#8a6040', M(0, 0.55, 0)]]);
    case 'lamp': return merge([[cyl(0.06, 0.08, 3.2, 8), '#30333a', M(0, 1.6, 0)], [box(0.5, 0.06, 0.06), '#30333a', M(0.22, 3.15, 0)], [sph(0.16, 10, 8), '#fff4c0', M(0.45, 3.05, 0)]]);
    case 'buoy': return merge([[cyl(0.35, 0.45, 0.6, 12), (x, y) => new THREE.Color(y > 0.1 ? '#ffffff' : '#ff3a2a'), M(0, 0.2, 0)], [cone(0.3, 0.6, 12), '#ff3a2a', M(0, 0.8, 0)], [sph(0.1, 8, 6), '#ffe060', M(0, 1.15, 0)]]);
    case 'island': return merge([[cone(6, 5, 9), '#4a8a4a', M(0, 1.5, 0)], [cyl(7, 7.5, 1, 9), '#e2c88a', M(0, -0.3, 0)], [cone(3, 3, 7), '#5aa05a', M(2.5, 1.8, 1)]]);
    case 'lighthouse': return merge([
      [cyl(0.9, 1.3, 7, 12), (x, y) => new THREE.Color(Math.floor((y + 3.5) / 1.4) % 2 ? '#ffffff' : '#e2402a'), M(0, 3.5, 0)],
      [cyl(1.1, 1.1, 0.3, 12), '#30333a', M(0, 7.1, 0)], [cyl(0.7, 0.7, 1.0, 12), '#fff4c0', M(0, 7.7, 0)], [cone(0.9, 0.9, 12), '#e2402a', M(0, 8.6, 0)],
      [cyl(2.2, 2.6, 1.0, 10), '#8d8a84', M(0, -0.2, 0)],
    ]);
    case 'boat': return merge([
      [box(2.2, 0.8, 5.0), (x, y) => new THREE.Color(y < 0.45 ? '#e2402a' : '#ffffff'), M(0, 0.4, 0)],
      [cone(1.1, 1.6, 4), '#ffffff', M(0, 0.4, -3.2, -Math.PI / 2, Math.PI / 4)],
      [box(1.4, 1.0, 1.6), '#f0f0f0', M(0, 1.3, 0.8)], [box(1.3, 0.3, 1.5), '#3a6ab8', M(0, 1.6, 0.8)],
    ]);
    case 'crate': return merge([[box(1.0, 1.0, 1.0), '#b07a3e', M(0, 0.5, 0)], [box(1.02, 0.12, 1.02), '#7a4e22', M(0, 0.5, 0)], [box(0.8, 0.8, 0.8), '#c08a4e', M(0.15, 1.4, 0.1, 0, 0.4, 0)]]);
    case 'drum': return merge([[cyl(0.35, 0.35, 0.9, 12), '#3a7a4a', M(0, 0.45, 0)], [cyl(0.36, 0.36, 0.06, 12), '#2a5a3a', M(0, 0.3, 0)], [cyl(0.36, 0.36, 0.06, 12), '#2a5a3a', M(0, 0.62, 0)]]);
  }
  return null;
}

// a mound of earth and rubble for a figure that stands beyond the platform, where the far side can be water;
// its top is at y = 0
const MOUND_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1, flatShading: true });
export function rubbleMound(r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 1.2, 4.4, 14, 1), MOUND_MAT);
  m.position.y = -2.2; m.receiveShadow = true; m.userData.sharedMat = true;
  return m;
}
