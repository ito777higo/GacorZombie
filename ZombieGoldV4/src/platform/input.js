// Touch / mouse / keyboard. The runner uses relative drag: the squad moves exactly as far as the
// finger does on screen, applied the moment the event arrives (no smoothing on the squad centre).
import * as THREE from '../view/three.js';
import { unlockAudio } from './audio.js';
import { save, persist, runtime } from './save.js';

export function setupInput(game, world, ui) {
  const el = document.getElementById('frame');
  const tmp = new THREE.Vector3();
  let drag = null;
  const local = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  el.addEventListener('pointerdown', e => {
    if (e.target.closest('button, .ov, .broke, .prompt-card, .fish-tools')) return;
    unlockAudio();
    const [px, py] = local(e);
    if (['run','intro','boarding'].includes(game.state) && game.sim) {
      const s = game.sim.squad;
      drag = { id: e.pointerId, px, x0: s.x, ppu: world.pxPerUnit(0, s.z) };
      if (!game.dragged) { game.dragged = true; ui.dragHint(false); save.dragged = true; persist(); }
    } else if (game.state === 'fishing' && game.fsim && !game.fsim.hold) {
      const p = world.unproject(px, py, -0.4, tmp);
      if (game.fsim.tapAt(p.x, p.z)) return;
      game.fsim.aiming = true; game.fsim.aim.x = p.x; game.fsim.aim.z = p.z;
      drag = { id: e.pointerId, aim: true };
    } else return;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
  });

  el.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    const [px, py] = local(e);
    if (drag.aim) {
      if (!game.fsim) return;
      const p = world.unproject(px, py, -0.4, tmp);
      game.fsim.aim.x = p.x; game.fsim.aim.z = p.z;
      return;
    }
    if (!game.sim) return;
    const want = drag.x0 + (px - drag.px) / drag.ppu;
    const x = game.sim.clampX(want);
    game.sim.squad.x = x;
    if (x !== want) drag.px = px - (x - drag.x0) * drag.ppu;   // re-anchor so reversing responds at once
  });

  const release = e => {
    if (!drag || (e && drag.id !== e.pointerId)) return;
    if (drag.aim && game.fsim) game.fsim.aiming = false;
    drag = null;
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);

  const held = new Set();
  const dir = () => { game.keyDir = (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0); };
  // v9.5: typing in the 调参台 never steers the squad or speeds the game up
  const typing = e => e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
  window.addEventListener('keydown', e => {
    if (typing(e)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat && !runtime.speedHold) { runtime.speedHold = Math.min(3, Math.max(1, save.speed || 1) + 1); ui.speedPill(); }
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') { held.add('l'); dir(); }
    else if (k === 'arrowright' || k === 'd') { held.add('r'); dir(); }
    else if (game.fsim && (k === 'arrowup' || k === 'w')) game.fsim.stepBet(1);
    else if (game.fsim && (k === 'arrowdown' || k === 's')) game.fsim.stepBet(-1);
    else return;
    unlockAudio();
    if (!game.dragged && game.state === 'run') { game.dragged = true; ui.dragHint(false); }
  });
  window.addEventListener('keyup', e => {
    if (typing(e) && e.code !== 'Space') return;
    if (e.code === 'Space') { e.preventDefault(); runtime.speedHold = 0; ui.speedPill(); return; }
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') held.delete('l');
    if (k === 'arrowright' || k === 'd') held.delete('r');
    dir();
  });
  window.addEventListener('blur', () => { held.clear(); dir(); release(); if (runtime.speedHold) { runtime.speedHold = 0; ui.speedPill(); } });
}
