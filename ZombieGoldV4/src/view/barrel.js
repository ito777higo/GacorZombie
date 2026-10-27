// v8 Top Lords barrels, drawn by hand: a bulging wooden barrel of twelve staves with dark seams, three iron hoops
// and a lid; the hits left are a big white number on its front (a DOM label, ui.js), the reward stands on top.
import * as THREE from './three.js';
import { merge, M } from './models.js';
import { NUM_FONT } from './textures.js';

const STAVES = 12, SEG = 5;               // radial segments per stave; the first one of each is the seam
const WOOD = ['#c07a3e', '#b06d34', '#c98647', '#a9652f', '#bb7739', '#b47035'];

// profile of the barrel: radius over height (0 … H), widest in the middle
const H = 1.25, R0 = 0.47, R1 = 0.56;
const radiusAt = y => R0 + (R1 - R0) * Math.sin(Math.PI * y / H);

export function woodBarrelGeo(kind = 'wood') {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const y = H * i / 12; pts.push(new THREE.Vector2(radiusAt(y), y)); }
  const body = new THREE.LatheGeometry(pts, STAVES * SEG).toNonIndexed();
  body.computeVertexNormals();
  // colour by stave: each triangle takes the colour of the stave its centre lies in, seams dark
  const P = body.attributes.position.array, n = P.length / 9;
  const col = new Float32Array(P.length);
  const c = new THREE.Color(), seam = new THREE.Color(kind === 'gold' ? '#8a5a00' : '#5a3416');
  const pal = kind === 'gold' ? ['#ffd23f', '#ffc21a', '#ffdc5a', '#f5b81a'] : kind === 'red' ? ['#d8402c', '#c93724', '#e04a33', '#c23322'] : WOOD;
  for (let t = 0; t < n; t++) {
    const cx = (P[t * 9] + P[t * 9 + 3] + P[t * 9 + 6]) / 3, cz = (P[t * 9 + 2] + P[t * 9 + 5] + P[t * 9 + 8]) / 3;
    const a = (Math.atan2(cz, cx) / (Math.PI * 2) + 1) % 1;
    const seg = Math.floor(a * STAVES * SEG + 1e-4), stave = Math.floor(seg / SEG);
    if (seg % SEG === 0) c.copy(seam); else c.set(pal[stave % pal.length]);
    // a little darker toward the ends, like Top Lords' painted barrels
    const cy = (P[t * 9 + 1] + P[t * 9 + 4] + P[t * 9 + 7]) / 3;
    const k = 0.82 + 0.18 * Math.sin(Math.PI * cy / H);
    for (let v = 0; v < 3; v++) { col[t * 9 + v * 3] = c.r * k; col[t * 9 + v * 3 + 1] = c.g * k; col[t * 9 + v * 3 + 2] = c.b * k; }
  }
  body.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const hoop = kind === 'gold' ? '#fff2a8' : '#3b4048';
  const parts = [
    [new THREE.TorusGeometry(radiusAt(0.16) + 0.01, 0.035, 6, 36), hoop, M(0, 0.16, 0, Math.PI / 2)],
    [new THREE.TorusGeometry(radiusAt(H - 0.16) + 0.01, 0.035, 6, 36), hoop, M(0, H - 0.16, 0, Math.PI / 2)],
    [new THREE.TorusGeometry(R1 + 0.012, 0.03, 6, 36), hoop, M(0, H * 0.5, 0, Math.PI / 2)],
    [new THREE.CylinderGeometry(R0 - 0.03, R0 - 0.03, 0.04, 24), kind === 'gold' ? '#ffe680' : '#d49a5c', M(0, H - 0.05, 0)],
    [new THREE.CylinderGeometry(R0 - 0.2, R0 - 0.2, 0.05, 20), kind === 'gold' ? '#f0c030' : '#a86a34', M(0, H - 0.03, 0)],
  ];
  const rest = merge(parts);
  return mergeTwo(body, rest);
}
export const BARREL_H = H;

function mergeTwo(a, b) {
  const pa = a.attributes.position.array, pb = b.attributes.position.array;
  const na = a.attributes.normal.array, nb = b.attributes.normal.array;
  const ca = a.attributes.color.array, cb = b.attributes.color.array;
  const pos = new Float32Array(pa.length + pb.length), nor = new Float32Array(na.length + nb.length), col = new Float32Array(ca.length + cb.length);
  pos.set(pa); pos.set(pb, pa.length); nor.set(na); nor.set(nb, na.length); col.set(ca); col.set(cb, ca.length);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  a.dispose(); b.dispose();
  return g;
}

// a short stack of coins for coin barrels
export function coinStackGeo() {
  const parts = [];
  for (let i = 0; i < 5; i++) parts.push([new THREE.CylinderGeometry(0.2, 0.2, 0.07, 18), '#ffc23a', M((i % 2) * 0.03, 0.04 + i * 0.075, (i % 3) * 0.02)]);
  parts.push([new THREE.CylinderGeometry(0.2, 0.2, 0.07, 18), '#ffd86a', M(0.26, 0.04, 0.05)]);
  parts.push([new THREE.CylinderGeometry(0.2, 0.2, 0.07, 18), '#ffc23a', M(0.26, 0.11, 0.05)]);
  return merge(parts);
}

// the golden weapon that floats over a gun barrel (Top Lords shows a golden crossbow)
let _gun = null;
export function goldGunTexture() {
  if (_gun) return _gun;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.translate(64, 64); x.rotate(-0.55);
  const gold = x.createLinearGradient(0, -30, 0, 30); gold.addColorStop(0, '#fff3a6'); gold.addColorStop(0.5, '#ffc21a'); gold.addColorStop(1, '#b86a00');
  x.lineJoin = 'round'; x.lineCap = 'round';
  // crossbow: stock, bow arc, string
  x.strokeStyle = '#4a2a00'; x.lineWidth = 16;
  x.beginPath(); x.moveTo(-44, 0); x.lineTo(44, 0); x.stroke();
  x.beginPath(); x.arc(30, 0, 40, -1.25, 1.25); x.stroke();
  x.strokeStyle = gold; x.lineWidth = 9;
  x.beginPath(); x.moveTo(-44, 0); x.lineTo(44, 0); x.stroke();
  x.beginPath(); x.arc(30, 0, 40, -1.25, 1.25); x.stroke();
  x.strokeStyle = '#fff8d8'; x.lineWidth = 2.5;
  x.beginPath(); x.moveTo(43, -38); x.lineTo(2, 0); x.lineTo(43, 38); x.stroke();
  x.fillStyle = '#ffe680'; x.strokeStyle = '#4a2a00'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(-50, -8); x.lineTo(-30, -8); x.lineTo(-24, 12); x.lineTo(-44, 14); x.closePath(); x.fill(); x.stroke();
  _gun = new THREE.CanvasTexture(c); _gun.colorSpace = THREE.SRGBColorSpace;
  return _gun;
}

// a small badge atlas for the multiples over the monsters: ×2 ×3 ×5 ×15 ×50 (gold on a dark pill)
export const BADGES = [2, 3, 5, 15, 50];
let _badge = null;
export function badgeAtlas() {
  if (_badge) return _badge;
  const W = 128, Hh = 64, c = document.createElement('canvas'); c.width = W * BADGES.length; c.height = Hh;
  const x = c.getContext('2d');
  BADGES.forEach((m, i) => {
    const ox = i * W;
    x.fillStyle = 'rgba(20,10,0,.62)';
    x.beginPath(); x.roundRect(ox + 10, 12, W - 20, Hh - 24, 18); x.fill();
    x.font = `400 38px ${NUM_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 7; x.strokeStyle = '#5a2a00'; x.strokeText('×' + m, ox + W / 2, Hh / 2 + 2);
    const g = x.createLinearGradient(0, 14, 0, Hh - 14); g.addColorStop(0, '#fff6b0'); g.addColorStop(1, '#ffb21a');
    x.fillStyle = g; x.fillText('×' + m, ox + W / 2, Hh / 2 + 2);
  });
  _badge = new THREE.CanvasTexture(c); _badge.colorSpace = THREE.SRGBColorSpace; _badge.anisotropy = 4;
  return _badge;
}

// Billboard badges drawn in one call: put(x, y, z, multiple, size) between begin() and end()
const BVS = /* glsl */`
attribute vec3 iPos; attribute vec2 iCell; varying vec2 vUv; varying float vA;
uniform float uCells;
void main() {
  vUv = vec2((uv.x + iCell.x) / uCells, uv.y); vA = 1.0;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 w = iPos + (right * position.x * 2.0 + up * position.y) * iCell.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;
const BFS = /* glsl */`
uniform sampler2D map; varying vec2 vUv; varying float vA;
void main() { vec4 t = texture2D(map, vUv); if (t.a < 0.02) discard; gl_FragColor = t; }`;
export class BadgeLayer {
  constructor(scene, max = 300) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    this.pos = new Float32Array(max * 3); this.cell = new Float32Array(max * 2);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iCell', new THREE.InstancedBufferAttribute(this.cell, 2).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { map: { value: badgeAtlas() }, uCells: { value: BADGES.length } }, vertexShader: BVS, fragmentShader: BFS,
      transparent: true, depthWrite: false, depthTest: false,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this.n = 0;
  }
  begin() { this.n = 0; }
  put(x, y, z, m, size = 0.42) {
    const i = BADGES.indexOf(m);
    if (i < 0 || this.n >= this.max) return;
    const n = this.n++;
    this.pos[n * 3] = x; this.pos[n * 3 + 1] = y; this.pos[n * 3 + 2] = z;
    this.cell[n * 2] = i; this.cell[n * 2 + 1] = size;
  }
  end() {
    this.geo.instanceCount = this.n;
    this.geo.attributes.iPos.needsUpdate = true; this.geo.attributes.iCell.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); this.mesh.material.dispose(); }
}
