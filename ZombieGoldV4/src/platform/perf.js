// Phones: watch the frame rate, show it on request, and step quality down when it stays low.
// Quality 0 = full (render scale up to 2×, soft shadows), 1 = render scale 1.5×, 2 = 1× and no shadows.
// 'auto' only ever steps down, after two low two-second windows in a row, so it never flickers.
import { save, persist } from './save.js';

const STEPS = [
  { name: '高', dpr: 2, shadow: true },
  { name: '中', dpr: 1.5, shadow: true },
  { name: '低', dpr: 1, shadow: false },
];
export const QUALITY = ['auto', 0, 1, 2];
export const qualityName = q => (q === 'auto' ? '自动' : STEPS[q].name);

export class Perf {
  constructor(world) {
    this.world = world;
    this.level = 0;
    this.win = { t: 0, n: 0 };
    this.lowWins = 0;
    this.fps = 60; this.calls = 0; this.tris = 0;
    this.track = null;             // per-level frame-rate record while playing
    this.el = document.createElement('div');
    this.el.className = 'perf';
    this.el.hidden = true;
    document.getElementById('frame').appendChild(this.el);
    this.gpu = gpuName(world.renderer);
    this.el.hidden = !this.shown;
    const q = this.setting();
    this.apply(q === 'auto' ? 0 : q);
  }
  setting() { const p = save.perf || {}; return p.q === undefined ? 'auto' : p.q; }
  set(q) { save.perf = { ...(save.perf || {}), q }; persist(); this.lowWins = 0; this.apply(q === 'auto' ? 0 : q); }
  showOverlay(on) { save.perf = { ...(save.perf || {}), show: on }; persist(); this.el.hidden = !on; }
  get shown() { return !!(save.perf && save.perf.show); }

  apply(level) {
    this.level = level;
    const S = STEPS[level], W = this.world, r = W.renderer;
    const dpr = Math.min(window.devicePixelRatio || 1, S.dpr);
    if (dpr !== r.getPixelRatio()) { r.setPixelRatio(dpr); if (W.w) W.resize(W.w, W.h); }
    // switching the light's shadow off recompiles the lit materials without the shadow lookups
    W.sun.castShadow = S.shadow;
  }

  // call once per rendered frame with the real frame time; `playing` is true while a level or the fishing runs
  tick(dt, playing) {
    const info = this.world.renderer.info.render;
    this.calls = info.calls; this.tris = info.triangles;
    const w = this.win; w.t += dt; w.n++;
    if (w.t < 2) return;
    this.fps = w.n / w.t;
    w.t = 0; w.n = 0;
    if (this.track && playing) { this.track.sum += this.fps; this.track.n++; this.track.min = Math.min(this.track.min, this.fps); }
    if (playing && this.setting() === 'auto' && this.level < STEPS.length - 1) {
      this.lowWins = this.fps < 45 ? this.lowWins + 1 : 0;
      if (this.lowWins >= 2) { this.lowWins = 0; this.apply(this.level + 1); }
    }
    if (this.shown) this.el.textContent = `${Math.round(this.fps)} fps · ${this.calls} draws · ${Math.round(this.tris / 1000)}k tris · 画质${STEPS[this.level].name}${this.setting() === 'auto' ? '(自动)' : ''}`;
  }

  // per-level record for the playtest table
  begin(code) { this.track = { code, sum: 0, n: 0, min: 999 }; }
  end() {
    const t = this.track; this.track = null;
    if (!t || !t.n) return null;
    return { code: t.code, avg: Math.round(t.sum / t.n), min: Math.round(t.min), q: STEPS[this.level].name };
  }
}

function gpuName(r) {
  try {
    const gl = r.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  } catch (e) { return 'unknown'; }
}
