// Vibration on phones, driven by the same moments as the sound effects.
// Android browsers have the Vibration API. iPhone Safari has none, but since iOS 18 toggling an
// <input type=checkbox switch> ticks the Taptic Engine, so a hidden one is clicked instead; that only
// works inside a tap, so on iPhone the in-run moments stay silent and buttons still tick.
import { save } from './save.js';
import { TUNE } from '../content/tune.js';

// one pattern per sound effect (ms, or [on, off, on, ...]); sounds not listed do not vibrate
const PAT = {
  ui: 8, gateGood: 14, gateBad: [40], hurt: 22, barrel: 25, boss: [30, 40, 70], boom: [60, 30, 90],
  crack: 10, catch: 18, cashout: [25, 35, 25], upgrade: 16, win: [30, 50, 30, 50, 140], bigwin: [60, 40, 60, 40, 220],
  fail: [80, 60, 120], land: 12,
};
// the same sound a few times a second should not turn into one long buzz
const GAP = { hurt: 160, crack: 120, catch: 120, gateGood: 120, barrel: 120 };

let sw = null;
const last = {};
const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

function iosTick() {
  try {
    if (!sw) {
      sw = document.createElement('label');
      sw.setAttribute('aria-hidden', 'true');
      sw.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.setAttribute('switch', ''); input.tabIndex = -1;
      sw.appendChild(input);
      document.body.appendChild(sw);
    }
    sw.click();
  } catch (e) { /* no haptics here */ }
}

export const hapticsOn = () => save.vib !== false;

export function buzz(kind, now = performance.now()) {
  const p = PAT[kind];
  if (p === undefined || !hapticsOn()) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;   // browsers refuse before the first tap
  if (GAP[kind] && now - (last[kind] || -1e9) < GAP[kind] * TUNE.hapticGap) return;
  last[kind] = now;
  if (canVibrate()) { try { navigator.vibrate(p); } catch (e) { /* blocked */ } return; }
  iosTick();
}
