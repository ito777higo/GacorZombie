// Boot: builds the world, game and UI, loads the save and the first chapter's models, then either goes straight into
// the run (a new player) or opens the map (once the 避难所 is open), and drives the frame loop. window.__gf holds the
// test hooks (ff, hold, snap, full); #auto=N, #debug and #edit are read here (docs/工程说明.md lists them).
import { World } from './view/world.js';
import { FX } from './view/fx.js';
import { UI } from './ui/ui.js';
import { Game } from './game.js';
import { setupInput } from './platform/input.js';
import { save, loadSave, persist, resetSave, fishUnlocked, gameSpeed, runtime } from './platform/save.js';
import { unlockAudio, setMuted, sfx, music } from './platform/audio.js';
import { LEVELS } from './content/levels.js';
import { ptSession, ptEvent } from './platform/playtest.js';
import { TUNE } from './sim/runsim.js';
import { prepareCast, preloadAll } from './view/cast.js';
import { Perf } from './platform/perf.js';
import { bridge } from './platform/bridge.js';
import { imageUrl } from './view/assets.js';
import { MapView } from './view/mapview.js';

const $ = s => document.querySelector(s);

window.addEventListener('error', e => console.error('[error]', e.message, e.filename + ':' + e.lineno));
window.addEventListener('unhandledrejection', e => console.error('[rejection]', e.reason && (e.reason.stack || e.reason)));

async function boot() {
  loadSave();
  const frame = $('#frame');
  const world = new World($('#gl'));
  const fx = new FX(world.scene);
  fx.camera = world.camera;
  // the number-gate pack's UI pieces (assets/ui) as CSS variables, resolved the same way as the fish cards
  for (const n of ['icon_drag', 'icon_boss', 'pickup_speed', 'pickup_rifle', 'pickup_ammo', 'pickup_squad', 'pickup_shield', 'pickup_heal', 'health_enemy_frame', 'health_enemy_fill', 'health_boss_frame', 'health_boss_fill', 'progress_track', 'progress_fill', 'squad_count_plate', 'banner_victory', 'banner_defeat', 'finish_line'])
    document.documentElement.style.setProperty('--ui-' + n.replace(/_/g, '-'), `url("${imageUrl('ui/' + n + '.svg')}")`);
  for (const n of ['yellow_star', 'green_icon_checkmark', 'red_icon_cross'])
    document.documentElement.style.setProperty('--ui-' + n.replace(/_/g, '-'), `url("${imageUrl('ui/' + n + '.png')}")`);
  const ui = new UI(world);
  const game = new Game(world, fx, ui);
  ui.openEditor = () => import('./edit/panel.js').then(m => m.openPanel({ game, world, ui }));
  const perf = new Perf(world);
  game.perf = perf; ui.perf = perf;
  // test hooks: hold freezes the game clock, ff(sec) fast-forwards the simulation
  window.__gf = { game, world, ui, fx, save, TUNE, LEVELS, perf, hold: false,
    ff(sec, step = 1 / 60) { for (let i = 0; i < sec / step; i++) { game.update(step); ui.update(step); } },
    // dev only: render one frame and post the 3D canvas to the preview server
    async snap(name = 'snap.jpg') {
      world.render();
      const blob = await new Promise(r => $('#gl').toBlob(r, 'image/jpeg', 0.85));
      await fetch('/capture?name=' + encodeURIComponent(name), { method: 'POST', body: blob });
      return name;
    },
    async full(name) { const m = await import('../tools/devsnap.js'); return m.snapFull(world, name); },
  };

  const resize = () => { const r = frame.getBoundingClientRect(); world.resize(Math.max(1, r.width), Math.max(1, r.height)); ui.placeMap?.(); };
  window.addEventListener('resize', resize);
  resize();

  // gate numbers are painted into canvas textures, so the display font must be ready first
  try {
    await Promise.race([
      Promise.all([document.fonts.load('400 64px "Lilita One"'), document.fonts.load('900 20px "Noto Sans SC"')]),
      new Promise(r => setTimeout(r, 2500)),
    ]);
  } catch (e) { /* fall back to system fonts */ }

  const startLevel = i => { unlockAudio(); ui.prompt(null); ui.hideOverlays(); game.start(i); };
  const openMap = () => {
    game.teardown();
    game.state = 'idle';
    music(null);
    // the map is a 3D scene of its own; the next level's build clears it
    ui.onShelter = () => game.campaign.warehouse(); ui.mapView=new MapView(world);
    ui.map({
      current: save.next,
      onStart: startLevel,
      onFish: () => {
        unlockAudio(); save.fishOpen = true; persist();
        // inside the real app the host opens the 2-player fishing game instead of the stand-in
        if (bridge.openFishing({ wallet: save.wallet, items: { ...(save.items || {}) } })) return;
        ui.hideOverlays(); game.startFishing();
      },
      onReset: () => { resetSave(); openMap(); },
    });
  };
  game.onMap = openMap;

  $('#btnMenu').addEventListener('click', () => {
    if(game.campaign.confirmExit())return;
    sfx('ui');
    if (game.L && ['intro', 'run', 'load', 'wheel', 'bonus', 'fishing'].includes(game.state) && game.level >= 0) ptEvent(game.L.code, 'quit');
    openMap();
  });
  $('#btnLaser').addEventListener('click', () => { if (game.fsim && game.fsim.laser) { game.fsim.laser(); } });
  $('#fishItems').addEventListener('click', e => { const b = e.target.closest('[data-item]'); if (b) game.useItem(b.dataset.item); });
  $('#btnAuto').addEventListener('click', () => { if (!game.fsim) return; game.fsim.auto = !game.fsim.auto; if (!game.fsim.auto) game.fsim.lockId = 0; ui.setAuto(game.fsim.auto); sfx('ui'); });
  $('#betUp').addEventListener('click', () => game.fsim?.stepBet(1));
  $('#betDown').addEventListener('click', () => game.fsim?.stepBet(-1));
  $('#btnNet').addEventListener('click', () => { if (game.fsim?.canNet) { sfx('cashout'); game.fsim.end('net'); } });
  $('#btnRefill').addEventListener('click', () => { save.wallet += 50000; persist(); ui.broke(false); sfx('cashout'); });
  $('#brokeRun').addEventListener('click', () => { if (game.state === 'fishing') { sfx('ui'); game.finishFishing('run'); } });
  $('#btnSpeed').addEventListener('click', () => { save.speed = (Math.max(1, save.speed || 1) % 3) + 1; persist(); ui.speedPill(); sfx('ui'); });
  ui.speedPill();
  $('#btnResume').addEventListener('click', () => { $('#ovPause').hidden = true; paused = false; last = performance.now(); });

  setupInput(game, world, ui);
  ptSession();
  setMuted(save.muted);

  let paused = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persist();
    if (document.hidden && !window.__gf.hold && (game.state === 'run' || game.state === 'bonus' || game.state === 'fishing')) { paused = true; $('#ovPause').hidden = false; }
  });
  window.addEventListener('pagehide', persist);

  // a host app may own the wallet: take its number when it answers
  const hw = await bridge.wallet();
  if (typeof hw === 'number') save.wallet = hw;
  bridge.track('session_start', { connected: bridge.connected, ua: navigator.userAgent.slice(0, 120) });
  // models for the 大关 the player is in (the rest load in the background once the map is up)
  $('#bootSub').textContent = '加载模型';
  const ch0 = LEVELS[Math.min(save.next, LEVELS.length - 1)].ch;
  await Promise.race([prepareCast(ch0), new Promise(r => setTimeout(r, 9000))]);
  // a level behind the first screen so the first frame is never empty
  world.buildLevel('highway', 200, -220);
  world.runPose(-20, { pos: world.camPos, look: world.camLook });
  // a new player goes straight into the run; the map first shows when 3-3 opens the 避难所
  const auto = /auto(?:=(\d+))?/.exec(location.hash);
  openMap();
  $('#ovBoot').hidden = true;
  setTimeout(preloadAll, 1200);
  // 调参台 (test builds only): #edit / ?edit opens it beside the game; #debug / ?debug puts its button in the 实验室
  const flags = location.search + location.hash;
  if (/[?#&](edit|debug)\b/.test(flags)) ui.openEditor = () => import('./edit/panel.js').then(m => m.openPanel({ game, world, ui }));
  if (/[?#&]edit\b/.test(flags)) ui.openEditor();
  // #auto=N plays level N on autopilot (for recording footage); #auto alone plays 1-1
  if (auto) {
    const i = Math.min(LEVELS.length - 1, Math.max(0, (+auto[1] || 1) - 1));
    save.dragged = true; ui.hideOverlays(); game.bot = 'best'; game.start(i, { skipIntro: true }); ui.dragHint(false);
  }

  let last = performance.now();
  const loop = now => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    // speed-up runs the game clock several steps per frame, so the simulation stays exactly the same
    const k = gameSpeed();
    if (!paused && !window.__gf.hold && !runtime.pause) for (let i = 0; i < k; i++) game.update(dt);
    ui.update(dt * k);
    world.render();
    perf.tick(dt, !paused && ['run', 'fishing', 'bonus', 'load', 'wheel'].includes(game.state));
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot().catch(err => {
  console.error(err);
  const s = document.querySelector('#bootSub');
  if (s) s.textContent = '加载失败：' + (err && err.message ? err.message : err);
});
