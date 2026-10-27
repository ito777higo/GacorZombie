// Teaching moments. Most are light tips: a tag over the gate or trap for a couple of seconds, nothing
// stops. Only a step marked `freeze` (the first drag, the first 蹭边) stops the run, dims the screen except
// what matters, points with a hand and waits until the player does it.
import { ROAD_HW } from '../sim/arena.js';
import { applyOps, liveOp } from '../sim/runsim.js';
import { TUNE } from '../content/tune.js';

const $ = s => document.querySelector(s);
const HAND = '<svg viewBox="0 0 64 64"><path d="M26 10c2.2 0 4 1.8 4 4v14l2-.2c1.6-.1 3 1 3.3 2.6l.1.6 1.2-.2c1.7-.2 3.3.9 3.6 2.6l.1.4.8-.1c1.9-.2 3.6 1.2 3.8 3.1l.1 1.1V48c0 5.5-4.5 10-10 10h-4.4c-3.2 0-6.2-1.6-8-4.2L14.5 41c-1-1.5-.7-3.5.7-4.6 1.4-1.1 3.4-1 4.6.3l2.2 2.4V14c0-2.2 1.8-4 4-4z" fill="#fff" stroke="#0b1424" stroke-width="3" stroke-linejoin="round"/></svg>';
const COMMANDER = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="34" r="22" fill="#ffd2a8"/><path d="M8 30a24 22 0 0 1 48 0z" fill="#75834f"/><rect x="6" y="28" width="52" height="6" rx="3" fill="#3e5234"/><circle cx="24" cy="40" r="3" fill="#2a1a10"/><circle cx="40" cy="40" r="3" fill="#2a1a10"/><path d="M25 49q7 5 14 0" stroke="#2a1a10" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M28 18l4-6 4 6z" fill="#ffd23f"/></svg>';

export class Tutor {
  constructor(game, world) {
    this.game = game; this.world = world;
    const el = this.el = document.createElement('div');
    el.className = 'tutor'; el.hidden = true;
    el.innerHTML = `<svg class="tu-dim" aria-hidden="true"><defs><mask id="tuMask"><rect x="0" y="0" width="100%" height="100%" fill="#fff"/><g id="tuHoles"></g></mask></defs>
        <rect class="tu-shade" x="0" y="0" width="100%" height="100%" mask="url(#tuMask)"/></svg>
      <div class="tu-frame" id="tuFrame"></div>
      <div class="tu-hand" id="tuHand">${HAND}</div>
      <div class="tu-tip" id="tuTip"><b id="tuTipT"></b><small id="tuTipS"></small></div>
      <div class="tu-bubble" id="tuBubble"><i class="tu-avatar">${COMMANDER}</i><div class="tu-say"><b class="tu-who">指挥官</b><p id="tuText"></p><small id="tuSub"></small></div></div>`;
    $('#hud').appendChild(el);
    this.holes = el.querySelector('#tuHoles');
    this.p = { x: 0, y: 0 };
    this.steps = null; this.cur = null;
  }

  reset(L) {
    this.steps = (L.teach || []).map(t => ({ ...t, done: false }));
    this.cur = null;
    this.el.hidden = true;
  }
  clear() { this.steps = null; this.cur = null; this.el.hidden = true; clearTimeout(this._say); }
  // the commander says one line at the top for a few seconds; nothing stops (used outside the run)
  say(text, sub = '', sec = 2.6) {
    if (this.cur) return;
    $('#tuText').textContent = text; $('#tuSub').textContent = sub;
    this.el.hidden = false; this.el.classList.remove('tip'); this.el.classList.add('say');
    this.el.classList.remove('in'); void this.el.offsetWidth; this.el.classList.add('in');
    clearTimeout(this._say);
    this._say = setTimeout(() => { if (!this.cur) { this.el.hidden = true; this.el.classList.remove('say'); } }, sec * 1000);
  }
  get frozen() { return !!(this.cur && this.cur.mode === 'freeze'); }

  // Called every frame before the simulation; returns the time scale for the run (0 = frozen).
  update(realDt) {
    const g = this.game, sim = g.sim;
    if (!sim || !this.steps) return 1;
    if (this.cur) return this.tick(realDt);
    if (g.state !== 'run') return 1;
    const s = sim.squad;
    for (const st of this.steps) {
      if (st.done) continue;
      if (st.at === 'start' && sim.phase === 'run') return this.begin(st);
      if (st.gate !== undefined) {
        const gt = sim.gates[st.gate];
        if (gt && !gt.used && s.z - gt.z < 12.5) return this.begin(st);
      }
      if (st.hazard !== undefined) {
        const h = sim.hazards[st.hazard];
        if (h && s.z - h.z < 12) return this.begin(st);
      }
      if (st.barrel !== undefined) {
        const r = sim.barrels.filter(b => b.kind !== 'cage')[st.barrel];
        if (r && r.alive && s.z - r.z < 22) return this.begin(st);
      }
      if (st.zombies && sim.zombies.some(z => z.active && z.alive && s.z - z.z < 20)) return this.begin(st);
      if (st.boss && sim.boss) return this.begin(st);
    }
    return 1;
  }

  begin(st) {
    const sim = this.game.sim, s = sim.squad, N = s.N;
    const c = this.cur = { st, mode: 'freeze', t: 0, rects: [], x0: s.x };
    const text = typeof st.text === 'function' ? st.text(N) : st.text;
    let sub = typeof st.sub === 'function' ? st.sub(N) : st.sub;
    if (st.at === 'start') { c.kind = 'start'; }
    else if (st.gate !== undefined) {
      const g = c.gate = sim.gates[st.gate], B = g.bounds, n = g.ops.length;
      c.z = g.z;
      if (st.pick === 'post') {
        let best = 1, bv = -1;
        for (let i = 1; i < n; i++) { const v = applyOps(N, [liveOp(g.ops[i - 1]), liveOp(g.ops[i])]); if (v > bv) { bv = v; best = i; } }
        c.range = [B[best] - TUNE.straddle * 0.6, B[best] + TUNE.straddle * 0.6];
        c.rects = [{ x0: B[best - 1], x1: B[best + 1], y0: 0, y1: 2.6 }];
        c.post = B[best];
        if (typeof st.sub === 'function' && n === 3) sub = st.sub(N);
      } else {
        let best = 0, bv = -Infinity;
        for (let i = 0; i < n; i++) { const v = applyOps(N, [liveOp(g.ops[i])]); if (v > bv) { bv = v; best = i; } }
        if (typeof st.pick === 'number') best = st.pick;
        c.range = [B[best] + (best > 0 ? 0.9 : 0.6), B[best + 1] - (best < n - 1 ? 0.9 : 0.6)];
        c.rects = [{ x0: B[best], x1: B[best + 1], y0: 0, y1: 2.6 }];
      }
    } else if (st.hazard !== undefined) {
      const h = sim.hazards[st.hazard];
      c.z = h.z;
      const left = (h.x0 + h.x1) / 2 < 0;
      c.range = left ? [1.2, ROAD_HW - 0.9] : [-(ROAD_HW - 0.9), -1.2];
      c.rects = [{ x0: h.x0, x1: h.x1, y0: 0, y1: 1.4, dz: 1.2 }];
    } else if (st.barrel !== undefined) {
      const r = sim.barrels.filter(b => b.kind !== 'cage')[st.barrel];
      c.z = r.z; c.mode = 'tip'; c.dur = 2.6;
      c.rects = [{ x0: r.x - 0.8, x1: r.x + 0.8, y0: 0, y1: 2.2 }];
    } else {
      c.mode = 'tip'; c.dur = 2.4;
    }
    if (!st.freeze && c.mode === 'freeze') { c.mode = 'tip'; c.dur = 2.6; }
    $('#tuText').textContent = text;
    $('#tuSub').textContent = sub || '';
    $('#tuTipT').textContent = text;
    $('#tuTipS').textContent = sub || '';
    this.el.hidden = false; this.el.classList.remove('say'); clearTimeout(this._say);
    this.el.classList.toggle('tip', c.mode === 'tip');
    this.el.classList.remove('in'); void this.el.offsetWidth; this.el.classList.add('in');
    this.game.onTeach?.(st);
    return c.mode === 'freeze' ? 0 : 1;
  }

  done() {
    const c = this.cur;
    c.st.done = true;
    this.cur = null;
    this.el.hidden = true;
    if (c.gate && c.mode === 'freeze') this.game.slowmo(0.75, 0.35);
    this.game.onTeachDone?.(c.st);
  }

  tick(dt) {
    const c = this.cur, g = this.game, sim = g.sim, s = sim.squad;
    c.t += dt;
    if (c.mode === 'tip') {
      this.layoutTip(c);
      if (c.t >= c.dur || (c.gate && c.gate.used)) { this.done(); return 1; }
      return 1;
    }
    // the autopilot used for testing does what the hand shows
    if (g.bot) {
      if (c.kind === 'start') s.x = c.x0 + 2;
      else s.x = (c.range[0] + c.range[1]) / 2;
    }
    const ok = c.kind === 'start' ? Math.abs(s.x - c.x0) > 1.4 : s.x >= c.range[0] && s.x <= c.range[1];
    if (ok) c.okT = (c.okT || 0) + dt; else c.okT = 0;
    this.layout(c);
    if (ok && c.t > 0.35 && c.okT > 0.18) { this.done(); return 1; }
    return 0;
  }

  // a tag over the target (or at the top when there is none) that follows it on screen
  layoutTip(c) {
    const w = this.world, tip = $('#tuTip');
    let x = w.w / 2, y = w.h * 0.3;
    if (c.rects.length) {
      const r = c.rects[0];
      const a = w.project((r.x0 + r.x1) / 2, r.y1 + 0.6, c.z, { x: 0, y: 0 });
      x = a.x; y = a.y;
    }
    const half = Math.min(150, w.w / 2 - 8);
    x = Math.max(half, Math.min(w.w - half, x));
    tip.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
  }

  // dim everything except the target and the squad; move the hand between them
  layout(c) {
    const w = this.world, s = this.game.sim.squad, p = this.p;
    const W = w.w, H = w.h;
    let holes = '';
    let frame = null;
    for (const r of c.rects) {
      const z = c.z;
      const a = w.project(r.x0, r.y0, z + (r.dz || 0), { x: 0, y: 0 }), b = w.project(r.x1, r.y1, z - (r.dz || 0), { x: 0, y: 0 });
      const x = Math.min(a.x, b.x) - 10, y = Math.min(a.y, b.y) - 10, ww = Math.abs(b.x - a.x) + 20, hh = Math.abs(b.y - a.y) + 20;
      holes += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${ww.toFixed(1)}" height="${hh.toFixed(1)}" rx="16" fill="#000"/>`;
      frame = { x, y, ww, hh };
    }
    const q = w.project(s.x, 0.6, s.z, { x: 0, y: 0 });
    const rr = Math.max(46, s.R * w.pxPerUnit(s.x, s.z) + 26);
    holes += `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${rr.toFixed(1)}" fill="#000"/>`;
    if (holes !== this._holes) { this.holes.innerHTML = holes; this._holes = holes; }
    const fr = $('#tuFrame');
    if (frame && c.mode === 'freeze') {
      fr.hidden = false;
      fr.style.transform = `translate(${frame.x.toFixed(1)}px,${frame.y.toFixed(1)}px)`;
      fr.style.width = frame.ww.toFixed(1) + 'px'; fr.style.height = frame.hh.toFixed(1) + 'px';
    } else fr.hidden = true;
    // hand: from the squad toward where the squad has to go (same screen row as the squad)
    const hand = $('#tuHand');
    if (c.mode !== 'freeze') { hand.hidden = true; return; }
    hand.hidden = false;
    let fx = q.x, tx;
    if (c.kind === 'start') { const k = Math.sin(c.t * 3.2); tx = q.x + k * W * 0.22; fx = tx; }
    else {
      const target = (c.range[0] + c.range[1]) / 2;
      const tp = w.project(target, 0.6, s.z, p);
      const k = (c.t % 1.5) / 1.5, e = k < 0.75 ? 1 - Math.pow(1 - k / 0.75, 3) : 1;
      fx = q.x; tx = q.x + (tp.x - q.x) * e;
      if (Math.abs(tp.x - q.x) < 8) tx = q.x + Math.sin(c.t * 6) * 6;
    }
    hand.style.transform = `translate(${(tx - 10).toFixed(1)}px,${(q.y + 8).toFixed(1)}px)`;
    hand.classList.toggle('press', c.kind !== 'start' && (c.t % 1.5) / 1.5 < 0.08);
    void fx; void H;
  }
}
