// The player's progress on this device (localStorage 'zombie-gold-journey-v4'): wallet, camp, cleared levels, items, seen tutorials,
// lab switches, settings. A host app can own the wallet instead (bridge.js). The 调参台 keeps its own changes apart
// (localStorage 'zombie-gold-journey-edit-v4', edit/panel.js).

const KEY = 'zombie-gold-journey-v4';

const DEFAULTS = () => ({
  wallet: 0,
  cleared: {},      // level index -> true
  next: 0,          // first level not cleared yet (13 = all done)
  fishOpen: false,  // the 避难所 (entrance to 末日战场), opened once 3-3 (第 9 关) is cleared
  speed: 1,         // demo speed-up ×1 / ×2 / ×3
  heroMode: 'truck', // how the survivor heroes ride with the squad: truck | mix | off
  fishSeen: false,  // first visit to the fishing game shows the bet card
  best: 0,          // biggest multiplier hit
  bestWin: 0,       // biggest single payout
  muted: false,
  dragged: false,
  seen: {},         // one-off teaching callouts already shown
});

export const save = DEFAULTS();

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(save, DEFAULTS(), JSON.parse(raw));
  } catch (e) { /* storage blocked: play with defaults */ }
}

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}

export function resetSave() {
  for (const key of Object.keys(save)) delete save[key];
  Object.assign(save, DEFAULTS());
  persist();
}

// Never saved: speedHold = holding Space plays at the next speed (×1 → ×2, ×2 → ×3) until it is let go, for live
// demos; pause = the 调参台's pause button (the game clock stops, the screen keeps drawing).
export const runtime = { speedHold: 0, pause: false };
export const gameSpeed = () => Math.max(1, runtime.speedHold || save.speed || 1);

// the 避难所 opens after 3-3 (levels.js FISH_AFTER = 8)
export const fishUnlocked = () => !!(save.fishOpen || save.cleared[8] || save.unlockAll);
