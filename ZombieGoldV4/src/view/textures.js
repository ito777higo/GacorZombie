// Canvas-generated textures: road surfaces, gate panels, prop icons, egg cracks.
import * as THREE from './three.js';
import { drawSkill } from './skillicons.js';

export const NUM_FONT = '"Lilita One", "Noto Sans SC", "PingFang SC", sans-serif';
export const UI_FONT = '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", sans-serif';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function speckle(x, w, h, n, colors, rMin = 0.5, rMax = 2) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = colors[i % colors.length];
    x.globalAlpha = 0.25 + Math.random() * 0.35;
    const r = rMin + Math.random() * (rMax - rMin);
    x.fillRect(Math.random() * w, Math.random() * h, r, r);
  }
  x.globalAlpha = 1;
}

// light concrete road with white edge lines and a dashed centre line (Last War highway)
export function roadTexture() {
  const [c, x] = canvas(256, 512);
  x.fillStyle = '#a9a9ab'; x.fillRect(0, 0, 256, 512);
  speckle(x, 256, 512, 1800, ['#b3b3b5', '#9e9ea1', '#bababc'], 1, 2.5);
  // slab joints
  x.fillStyle = 'rgba(80,86,98,.18)'; x.fillRect(0, 255, 256, 2);
  x.fillStyle = '#ffffff';
  x.fillRect(14, 0, 8, 512); x.fillRect(234, 0, 8, 512);
  for (let y = 0; y < 512; y += 128) x.fillRect(124, y + 24, 8, 64);
  return tex(c, true);
}

export function plankTexture() {
  const [c, x] = canvas(256, 256);
  const cols = ['#a7764a', '#b07f52', '#9c6c42', '#b5875a', '#a27148'];
  for (let i = 0; i < 8; i++) {
    x.fillStyle = cols[i % cols.length]; x.fillRect(0, i * 32, 256, 32);
    x.fillStyle = 'rgba(70,40,20,.25)';
    for (let k = 0; k < 6; k++) x.fillRect(Math.random() * 256, i * 32 + 4 + Math.random() * 24, 30 + Math.random() * 70, 1.5);
    x.fillStyle = '#4a2c16'; x.fillRect(0, i * 32 + 29, 256, 3);
    x.fillStyle = 'rgba(58,36,18,.55)';
    const seam = 40 + ((i * 97) % 170);
    x.fillRect(seam, i * 32, 2, 29);
  }
  return tex(c, true);
}

export function groundTexture(kind) {
  const [c, x] = canvas(256, 256);
  const pal = {
    dirt: ['#b59a6a', ['#a3875a', '#c4ab7c', '#8f7a50', '#7e9a4a']],
    desert: ['#ecd5a4', ['#e3c893', '#f3e0b8', '#d9bd86', '#f7e8c8']],
    grass: ['#7aa24a', ['#6a9440', '#8ab25a', '#5e8838', '#a0b860']],
    sand: ['#ecd49a', ['#e2c785', '#f4e0b0', '#d8bc78', '#fff0c8']],
    seabed: ['#d8c28a', ['#c9b078', '#e6d4a0', '#b89e66']],
    asphalt: ['#5f5b56', ['#57534f', '#6b6762', '#4c4946', '#75706a', '#5a4a3e']],
    ash: ['#8a7f70', ['#7d7364', '#978b7a', '#6e6558', '#a09382', '#6b5a48']],
  }[kind];
  x.fillStyle = pal[0]; x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 256, 3000, pal[1], 1, 4);
  for (let i = 0; i < 14; i++) {
    x.fillStyle = pal[1][i % pal[1].length]; x.globalAlpha = 0.25;
    x.beginPath(); x.ellipse(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 30, 6 + Math.random() * 20, Math.random() * 3, 0, 7); x.fill();
  }
  x.globalAlpha = 1;
  return tex(c, true);
}

// The platform at the end of the road (boss arena, the gun's bunker in the shooting room): worn concrete inside
// a yellow-and-black hazard ring.
export function platformTexture() {
  const [c, x] = canvas(512, 512);
  const cx = 256;
  x.fillStyle = '#a9adb3'; x.fillRect(0, 0, 512, 512);
  speckle(x, 512, 512, 4000, ['#9a9fa7', '#bcc0c6', '#8c8f94'], 1, 4);
  x.lineWidth = 26;
  for (let a = 0; a < 40; a++) { x.strokeStyle = a % 2 ? '#1c1c1c' : '#e8b818'; x.beginPath(); x.arc(cx, cx, 230, a * Math.PI / 20, (a + 1) * Math.PI / 20); x.stroke(); }
  x.strokeStyle = 'rgba(255,255,255,.45)'; x.lineWidth = 6; x.beginPath(); x.arc(cx, cx, 150, 0, 7); x.stroke();
  // cracks and old stains
  x.strokeStyle = 'rgba(40,40,40,.35)'; x.lineWidth = 2;
  for (let i = 0; i < 9; i++) { let px = cx + (Math.random() - 0.5) * 300, py = cx + (Math.random() - 0.5) * 300; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (Math.random() - 0.5) * 60; py += (Math.random() - 0.5) * 60; x.lineTo(px, py); } x.stroke(); }
  x.fillStyle = 'rgba(90,20,20,.18)';
  for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(cx + (Math.random() - 0.5) * 260, cx + (Math.random() - 0.5) * 260, 20 + Math.random() * 40, 10 + Math.random() * 25, Math.random() * 3, 0, 7); x.fill(); }
  return tex(c);
}

// Gate panel: rebuilt whenever the value changes.
export class GatePanel {
  // aspect = panel width / height, so narrow three-lane panels are not squashed
  constructor(aspect = 2) {
    this.W = Math.round(180 * aspect); this.H = 180;
    [this.c, this.x] = canvas(this.W, this.H);
    this.tex = tex(this.c);
    this.label = null; this.good = null;
  }
  // Last War gate: a coloured band that is solid at the bottom and fades toward the top, a big white
  // number with a soft shadow. Blue = good, red = bad; purple '?', gold for big multipliers and roulettes,
  // teal with a glyph for skills.
  draw(label, good, flash = 0, kind = '') {
    if (label === this.label && good === this.good && kind === this.kind && !flash) return;
    this.label = label; this.good = good; this.kind = kind;
    const x = this.x, W = this.W, H = this.H;
    const skill = kind.startsWith('skill:') ? kind.slice(6) : '';
    x.clearRect(0, 0, W, H);
    // v9: the number-gate pack's colours — blue +, green ×, red − and ÷, gold for big multipliers
    const base = kind === 'mystery' ? [150, 70, 255] : skill ? [18, 196, 172] : kind === 'gold' || kind === 'roulette' ? [255, 176, 20] : kind === 'mul' ? [28, 190, 132] : good ? [136, 151, 83] : [240, 70, 84];
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(${base},${0.28 + flash * 0.3})`);
    g.addColorStop(0.45, `rgba(${base},${0.55 + flash * 0.3})`);
    g.addColorStop(1, `rgba(${base},${0.92})`);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // light top edge and a brighter bottom edge
    x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(0, 0, W, 5);
    x.fillStyle = `rgba(${base.map(v => Math.round(v * 0.7))},1)`; x.fillRect(0, H - 10, W, 10);
    const sheen = x.createLinearGradient(0, 0, W, 0);
    sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(0.5, 'rgba(255,255,255,.12)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = sheen; x.fillRect(0, 0, W, H);
    if (kind === 'roulette' || kind === 'gold') {
      x.fillStyle = '#fff6c8';
      const n = Math.floor((W - 40) / 26);
      for (let i = 0; i <= n; i++) { x.beginPath(); x.arc(20 + i * 26, 14, 4, 0, 7); x.fill(); }
    }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    const ink = kind === 'mystery' ? 'rgba(40,6,80,.85)' : skill ? 'rgba(2,50,44,.85)' : kind === 'gold' || kind === 'roulette' ? 'rgba(110,56,0,.85)' : kind === 'mul' ? 'rgba(4,70,44,.85)' : good ? 'rgba(37,54,25,.9)' : 'rgba(110,8,8,.8)';
    const text = (str, px, py, size, font) => {
      x.font = `${font} ${size}px ${font === '400' ? NUM_FONT : UI_FONT}`;
      x.save(); x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 10; x.shadowOffsetY = 5;
      x.lineWidth = size * 0.1; x.strokeStyle = ink; x.strokeText(str, px, py);
      x.fillStyle = '#ffffff'; x.fillText(str, px, py); x.restore();
      x.fillStyle = '#ffffff'; x.fillText(str, px, py);
    };
    if (skill && W >= 280) {
      drawSkill(x, skill, W * 0.3, H / 2 + 6, 104, '#ffffff', ink);
      text(label, W * 0.66, H / 2 + 8, 62, '900');
    } else if (skill) {
      drawSkill(x, skill, W / 2, H * 0.4, Math.min(88, W * 0.42), '#ffffff', ink);
      text(label, W / 2, H * 0.8, 42, '900');
    } else {
      const big = label.length > 4 ? 104 : 128;
      text(label, W / 2, H / 2 + 10, W < 280 ? Math.round(big * 0.8) : big, '400');
    }
    this.tex.needsUpdate = true;
  }
}

export function iconTexture(kind) {
  const [c, x] = canvas(128, 128);
  const skill = kind.startsWith('skill:') ? kind.slice(6) : '';
  const bg = skill ? ['#3ae0c8', '#0e8a7c'] : { men: ['#a5af7a', '#546642'], gun: ['#ffb24a', '#d0560a'], rate: ['#6af07a', '#14963a'], coin: ['#ffe066', '#e08a00'] }[kind];
  const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
  x.fillStyle = '#0b1424'; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill();
  x.fillStyle = g; x.beginPath(); x.arc(64, 64, 53, 0, 7); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 5; x.beginPath(); x.arc(64, 64, 53, 0, 7); x.stroke();
  x.fillStyle = '#fff'; x.strokeStyle = '#0b1424'; x.lineWidth = 6; x.lineJoin = 'round';
  const path = () => { x.stroke(); x.fill(); };
  if (skill) { drawSkill(x, skill, 64, 64, 70, '#ffffff', '#04352f'); return tex(c); }
  if (kind === 'men') {
    x.beginPath(); x.arc(64, 40, 14, 0, 7); path();
    x.beginPath(); x.moveTo(40, 96); x.quadraticCurveTo(40, 60, 64, 60); x.quadraticCurveTo(88, 60, 88, 96); x.closePath(); path();
  } else if (kind === 'gun') {
    x.beginPath(); x.moveTo(28, 52); x.lineTo(100, 52); x.lineTo(100, 66); x.lineTo(62, 66); x.lineTo(58, 86); x.lineTo(44, 86); x.lineTo(46, 66); x.lineTo(28, 66); x.closePath(); path();
  } else if (kind === 'rate') {
    x.beginPath(); x.moveTo(72, 22); x.lineTo(40, 70); x.lineTo(62, 70); x.lineTo(54, 106); x.lineTo(90, 54); x.lineTo(66, 54); x.closePath(); path();
  } else {
    x.beginPath(); x.arc(64, 64, 26, 0, 7); x.fillStyle = '#fff3b8'; path();
    x.font = `400 34px ${NUM_FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#c47800'; x.fillText('$', 64, 66);
  }
  return tex(c);
}

export class CrackMap {
  constructor() {
    [this.c, this.x] = canvas(512, 512);
    this.x.fillStyle = '#000'; this.x.fillRect(0, 0, 512, 512);
    this.tex = tex(this.c);
  }
  add(n) {
    const x = this.x;
    for (let k = 0; k < n; k++) {
      let px = Math.random() * 512, py = 120 + Math.random() * 300;
      const pts = [[px, py]];
      let a = Math.random() * Math.PI * 2;
      for (let i = 0; i < 9; i++) { a += (Math.random() - 0.5) * 1.4; px += Math.cos(a) * 26; py += Math.sin(a) * 26; pts.push([px, py]); }
      for (const [w, col] of [[14, 'rgba(255,170,40,.25)'], [7, 'rgba(255,220,120,.6)'], [2.5, '#fffbe8']]) {
        x.strokeStyle = col; x.lineWidth = w; x.lineJoin = 'round'; x.lineCap = 'round';
        x.beginPath(); pts.forEach(([u, v], i) => (i ? x.lineTo(u, v) : x.moveTo(u, v))); x.stroke();
      }
    }
    this.tex.needsUpdate = true;
  }
}

export function skyTexture(top, mid, bottom) {
  const [c, x] = canvas(4, 256);
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top); g.addColorStop(0.62, mid); g.addColorStop(1, bottom);
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  return tex(c);
}

export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const [c, x] = canvas(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.6)')); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return tex(c);
}

export function netTexture() {
  const [c, x] = canvas(256, 256);
  x.strokeStyle = 'rgba(255,240,180,1)'; x.lineWidth = 5;
  x.beginPath(); x.arc(128, 128, 116, 0, 7); x.stroke();
  x.lineWidth = 2.5;
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.cos(a) * 116, 128 + Math.sin(a) * 116); x.stroke(); }
  for (const r of [40, 78]) { x.beginPath(); for (let i = 0; i <= 12; i++) { const a = i * Math.PI / 6; x.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } x.stroke(); }
  return tex(c);
}

export function ringTexture() {
  const [c, x] = canvas(256, 256);
  const g = x.createRadialGradient(128, 128, 70, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,1)'); g.addColorStop(0.85, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return tex(c);
}

export function holeTexture() {
  const [c, x] = canvas(256, 512);
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#0b3a58'); g.addColorStop(1, '#0e5476');
  x.fillStyle = g; x.fillRect(0, 0, 256, 512);
  x.strokeStyle = 'rgba(160,230,255,.35)'; x.lineWidth = 3;
  for (let i = 0; i < 26; i++) { const y = Math.random() * 512, cx = Math.random() * 256; x.beginPath(); x.arc(cx, y, 10 + Math.random() * 30, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); }
  // broken plank stubs along both long edges
  for (const side of [0, 1]) {
    for (let y = 0; y < 512; y += 32) {
      const w = 14 + Math.random() * 36;
      x.fillStyle = ['#a7764a', '#9c6c42', '#b07f52'][(y / 32) % 3];
      x.beginPath();
      if (side === 0) { x.moveTo(0, y + 2); x.lineTo(w, y + 4 + Math.random() * 6); x.lineTo(w * 0.7, y + 28); x.lineTo(0, y + 29); }
      else { x.moveTo(256, y + 2); x.lineTo(256 - w, y + 4 + Math.random() * 6); x.lineTo(256 - w * 0.7, y + 28); x.lineTo(256, y + 29); }
      x.closePath(); x.fill();
    }
  }
  return tex(c);
}

export function warnTexture() {
  const [c, x] = canvas(256, 64);
  for (let i = -2; i < 12; i++) { x.fillStyle = i % 2 ? '#1c1c1c' : '#ffcc22'; x.beginPath(); x.moveTo(i * 28, 0); x.lineTo(i * 28 + 28, 0); x.lineTo(i * 28 + 4, 64); x.lineTo(i * 28 - 24, 64); x.closePath(); x.fill(); }
  return tex(c, true);
}
