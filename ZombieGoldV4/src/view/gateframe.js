// v8.1: the number-gate pack's gate frame (project-original, assets/models/NG_gate_<colour>.glb): two posts, a top
// bar, wide feet and a faint panel, laid out again for any width and height. v9: every number gate wears one, in
// the pack's colours (blue +, green ×, red − ÷, gold for ×5 and up, the 兑换门 and the vault). Falls back to boxes.
import * as THREE from './three.js';
import { model } from './assets.js';

const tinted = new Map();
function tint(mat, color, opacity = 1) {
  const key = mat.uuid + '|' + color + '|' + opacity;
  if (!tinted.has(key)) {
    const m = mat.clone(); m.color.set(color);
    if (opacity < 1) { m.transparent = true; m.opacity = opacity; m.depthWrite = false; }
    tinted.set(key, m);
  }
  return tinted.get(key);
}

export function gateFrame(w, h, { panel = false, thick = 1.6, name = 'NG_gate_gold', color = null, opacity = 1 } = {}) {
  const G = model(name) || model('NG_gate_gold');
  if (!G) {
    const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: color || 0xf3ba38, metalness: 0.2, roughness: 0.5 });
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.2 * thick, h, 0.24 * thick), mat); p.position.set(sx * w / 2, h / 2, 0); g.add(p); }
    const t = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2 * thick, 0.2 * thick, 0.24 * thick), mat); t.position.y = h; g.add(t);
    return g;
  }
  const g = G.scene.clone(true);
  const part = n => g.getObjectByName(n);
  for (const [n, sx] of [['left', -1], ['right', 1]]) {
    const p = part(n); if (!p) continue;
    p.position.set(sx * w / 2, h / 2, 0); p.scale.set(0.2 * thick, h, 0.24 * thick);
    const f = part(n + '_foot'); if (f) { f.position.x = sx * w / 2; f.scale.set(0.5 * thick, 0.16 * thick, 0.5 * thick); f.position.y = 0.08 * thick; }
  }
  const top = part('top'); if (top) { top.position.set(0, h - 0.1 * thick, 0); top.scale.set(w + 0.2 * thick, 0.2 * thick, 0.24 * thick); }
  const pn = part('panel'); if (pn) { pn.visible = panel; pn.position.y = h / 2; pn.scale.set(w - 0.2, h - 0.3, 0.035); }
  g.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.userData.sharedGeo = true;
    if (color && o.name !== 'panel' && !o.name.endsWith('_foot')) o.material = tint(o.material, color, opacity);
    o.material.userData.shared = true;
  });
  return g;
}
