// Real-time synthesised sound effects plus one looping BGM. The effects run through a gentle low-pass and one
// compressor so dense moments (hundreds of shots, coin showers) never clip or get shrill; the music has its own bus.
// Legacy short mallet effects are retained. V4.1 uses an existing dark reference track for music.
import { save } from './save.js';
import { buzz } from './haptics.js';

let ac = null, out = null, master = null, sfxOut = null, noiseBuf = null;
const lastAt = {};
// the mix (v9.5: the 调参台 changes it live, see remix): the effects bus (v9.2: up from 0.55, so the effects sit
// clearly over the music), the music in a run and under a boss, and how far / how long it dips under a key effect
export const MIX = { sfx: 0.8, run: 0.24, boss: 0.18, dip: 0.65, dipSec: 0.3 };

export function unlockAudio() {
  if (save.muted) return;
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      out = ac.createGain(); out.gain.value = 1; out.connect(ac.destination);
      // effects: gain → low-pass (takes the edge off the brightest partials) → compressor → out
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 6;
      comp.attack.value = 0.003; comp.release.value = 0.18;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000; lp.Q.value = 0.5;
      master = ac.createGain(); master.gain.value = MIX.sfx;
      master.connect(lp); lp.connect(comp); comp.connect(out); sfxOut = comp;
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.0, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // a phone in the pocket shouldn't keep playing
      document.addEventListener('visibilitychange', () => {
        if (!ac) return;
        if (document.hidden) ac.suspend(); else if (!save.muted) ac.resume();
      });
    }
    if (ac.state === 'suspended') ac.resume();
    if (mus.mode) music(mus.mode);
  } catch (e) { ac = null; }
}

export function setMuted(m) {
  save.muted = m;
  if (out) out.gain.value = m ? 0 : 1;
  if (!m) unlockAudio();
}

// ---------------------------------------------------------------- BGM
// Existing reference track: Lightless Dawn, Kevin MacLeod, CC BY 4.0.
// Original seconds 32–112, MPEG frame-aligned demo excerpt. No generated composition.
// Attribution and source: assets/audio/MUSIC_LICENSE.txt. Old supplied files are preserved.
const BGM = { url: 'assets/audio/bgm_lightless_dawn_demo.mp3', loop: 80 };
const mus = { mode: null, buf: null, src: null, gain: null, loading: false, failed: false, duckT: 0, dipT: 0 };

function musicLevel() { return save.music === false || !mus.mode ? 0 : MIX[mus.mode] || 0; }
// v9.5: apply a changed MIX at once
export function remix() { if (master) master.gain.value = MIX.sfx; if (mus.gain && mus.mode) rampMusic(musicLevel(), 0.05); }
function rampMusic(v, tau) {
  if (!mus.gain) return;
  const g = mus.gain.gain, t = ac.currentTime;
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(v, t, tau);
}
function loadMusic() {
  if(mus.loading||mus.failed)return;mus.loading=true;
  fetch(BGM.url).then(r=>{if(!r.ok)throw new Error('Music load '+r.status);return r.arrayBuffer();})
    .then(ab=>ac.decodeAudioData(ab))
    .then(buf=>{mus.buf=buf;mus.loading=false;music(mus.mode);})
    .catch(()=>{mus.loading=false;mus.failed=true;});
}
function startMusic() {
  mus.gain=ac.createGain();mus.gain.gain.value=0;mus.gain.connect(out);
  const s=mus.src=ac.createBufferSource();s.buffer=mus.buf;s.loop=true;
  s.loopStart=0;s.loopEnd=Math.min(BGM.loop,mus.buf.duration);
  s.connect(mus.gain);s.start(0,0);
}
function stopMusic() {
  const { src, gain } = mus;
  if (!src) return;
  mus.src = null; mus.gain = null;
  const t = ac.currentTime;
  gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.setTargetAtTime(0, t, 0.25);
  src.stop(t + 1.2);
}
// mode: 'run' | 'boss' | null (fade out; the next run starts the tune from the top). Safe before the first tap.
export function music(mode) {
  if (mode !== undefined) mus.mode = mode;
  if (!ac) return;
  const v = musicLevel();
  if (!v) { stopMusic(); return; }
  if (!mus.buf) { loadMusic(); return; }
  if (!mus.src) startMusic();
  if (performance.now() > mus.duckT) rampMusic(v, mus.mode === 'boss' ? 0.4 : 0.6);
}
// big moments (a big win, the boss walking in, the magician's cards): the music steps back for a while
export function duck(sec = 2.5, k = 0.3) {
  if (!ac || !mus.gain) return;
  mus.duckT = performance.now() + sec * 1000;
  rampMusic(musicLevel() * k, 0.08);
  clearTimeout(mus.duckTimer);
  mus.duckTimer = setTimeout(() => rampMusic(musicLevel(), 0.6), sec * 1000);
}
// a gate, a barrel, a coin shower: the music dips for a beat so the effect reads on top of it
function dip() {
  if (!mus.gain || performance.now() < mus.duckT) return;
  const g = mus.gain.gain, t = ac.currentTime, v = musicLevel();
  g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
  g.setTargetAtTime(v * MIX.dip, t, 0.03); g.setTargetAtTime(v, t + MIX.dipSec, 0.25);
}
// dev: what the music is doing, and the two buses' levels (the harness reads it)
export const audioState = () => ({ ctx: ac ? ac.state : 'none', mode: mus.mode, loaded: !!mus.buf, playing: !!mus.src, failed: mus.failed, url: BGM.url, duration: mus.buf?.duration || 0, loopStart: mus.src?.loopStart || 0, loopEnd: mus.src?.loopEnd || 0, vol: mus.gain ? +mus.gain.gain.value.toFixed(3) : 0 });
export function audioMeter() {
  if (!ac) return null;
  if (!meter) {
    const mk = () => { const a = ac.createAnalyser(); a.fftSize = 2048; return a; };
    meter = { sfx: mk(), all: mk() };
    sfxOut.connect(meter.sfx); out.connect(meter.all);
  }
  const lv = a => { const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d); let e = 0, pk = 0; for (const v of d) { e += v * v; pk = Math.max(pk, Math.abs(v)); } return { rms: 20 * Math.log10(Math.sqrt(e / d.length) + 1e-9), peak: 20 * Math.log10(pk + 1e-9) }; };
  return { sfx: lv(meter.sfx), all: lv(meter.all) };
}
let meter = null;
export function unduck() {
  if (!ac || !mus.gain) return;
  clearTimeout(mus.duckTimer); mus.duckT = 0;
  rampMusic(musicLevel(), 0.6);
}

// ---------------------------------------------------------------- effects
function ok(key, gapMs) {
  if (!ac || save.muted) return false;
  const now = performance.now();
  if (gapMs && lastAt[key] && now - lastAt[key] < gapMs) return false;
  lastAt[key] = now;
  return true;
}

function osc(type, f0, f1, dur, vol, delay = 0, dest = master) {
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.03);
}

function noise(dur, vol, filter = 'bandpass', freq = 1200, q = 1, delay = 0, freqEnd) {
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = filter; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
}

const NOTE = n => 440 * 2 ** ((n - 69) / 12);
// the C major pentatonic, counted in steps from C4: deg(5) = C5, deg(10) = C6
const PENT = [0, 2, 4, 7, 9];
const deg = i => 60 + 12 * Math.floor(i / 5) + PENT[((i % 5) + 5) % 5];
// a soft mallet tone: a sine plus a quiet overtone that dies quickly (marimba-like), never a buzzy wave
function bell(midi, dur, vol, delay = 0) {
  const f = NOTE(midi);
  osc('sine', f, 0, dur, vol, delay);
  osc('sine', f * (f < 700 ? 4 : 2), 0, dur * 0.22, vol * 0.16, delay);
}

const DIP = new Set(['gateGood', 'gateBad', 'barrel', 'crack', 'catch', 'cashout', 'upgrade', 'land', 'win', 'coin', 'hurt']);
export function sfx(k, p = 0) {
  buzz(k);
  if (!ac || save.muted) return;
  if (DIP.has(k) && (k !== 'coin' || p >= 6)) dip();
  switch (k) {
    case 'shot':
      if (!ok(k, 55)) return;
      noise(0.035, 0.025, 'bandpass', 1800, 0.9);
      break;
    case 'hit':
      if (!ok(k, 45)) return;
      noise(0.03, 0.03, 'bandpass', 1900, 1.2);
      break;
    case 'zdie':
      if (!ok(k, 40)) return;
      osc('triangle', 180, 60, 0.12, 0.045);
      noise(0.08, 0.025, 'lowpass', 800);
      break;
    case 'gateGood': {
      const i0 = 7 + Math.min(8, Math.round(p / 2));
      [0, 1, 2, 4].forEach((n, i) => bell(deg(i0 + n), 0.22, 0.055, i * 0.05));
      noise(0.22, 0.025, 'bandpass', 800, 0.8, 0, 2400);
      break;
    }
    case 'gateBad':
      osc('triangle', NOTE(67), NOTE(60), 0.26, 0.06);
      osc('sine', 150, 70, 0.22, 0.07);
      break;
    case 'pop':
      if (!ok(k, 30)) return;
      bell(deg(10 + (p % 5)), 0.07, 0.035);
      break;
    case 'hurt':
      if (!ok(k, 70)) return;
      osc('triangle', 210, 90, 0.12, 0.05);
      noise(0.07, 0.035, 'lowpass', 500);
      break;
    case 'barrel':
      noise(0.16, 0.1, 'lowpass', 1200, 0.7, 0, 300);
      osc('sine', 120, 50, 0.2, 0.1);
      [10, 12, 13].forEach((d, i) => bell(deg(d), 0.16, 0.04, 0.06 + i * 0.05));
      break;
    case 'coin': {
      if (!ok(k, 35)) return;
      const i = 10 + Math.round(Math.min(p, 20) * 0.25);
      bell(deg(i), 0.12, 0.045);
      bell(deg(i + 1), 0.14, 0.032, 0.045);
      break;
    }
    case 'coinTick':
      if (!ok(k, 28)) return;
      osc('sine', NOTE(deg(12 + (p % 5))), 0, 0.04, 0.012);
      break;
    case 'cashout':
      for (let i = 0; i < 8; i++) bell(deg(7 + i), 0.14, 0.035, i * 0.05);
      break;
    case 'boss':
      osc('sine', 70, 45, 0.9, 0.14);
      osc('triangle', NOTE(36), 0, 0.9, 0.06);
      osc('triangle', NOTE(43), 0, 0.9, 0.04);
      noise(0.8, 0.05, 'lowpass', 400, 1, 0, 100);
      duck(1.6, 0.4);
      break;
    case 'boom':
      noise(0.6, 0.15, 'lowpass', 1200, 0.6, 0, 80);
      osc('sine', 130, 30, 0.6, 0.2);
      break;
    case 'crack': {
      noise(0.1, 0.06, 'bandpass', 1600, 0.9);
      osc('triangle', 700, 300, 0.08, 0.04);
      const i0 = 12 + Math.min(p, 6);
      [0, 1, 2].forEach((n, i) => bell(deg(i0 + n), 0.2, 0.045, 0.05 + i * 0.04));
      break;
    }
    case 'cannon':
      if (!ok(k, 60)) return;
      osc('sine', 160, 55, 0.14, 0.08);
      noise(0.05, 0.035, 'bandpass', 1400, 1.2);
      break;
    case 'net':
      if (!ok(k, 50)) return;
      noise(0.12, 0.04, 'bandpass', 1200, 1.4, 0, 500);
      break;
    case 'catch': {
      if (!ok(k, 40)) return;
      const i0 = 9 + Math.min(6, Math.round(p / 4));
      [0, 1, 2].forEach((n, i) => bell(deg(i0 + n), 0.12 + i * 0.03, 0.045, i * 0.06));
      break;
    }
    case 'tick':
      osc('sine', NOTE(88), 0, 0.03, 0.03);
      break;
    case 'land':
      [72, 76, 79, 84, 88].forEach((n, i) => bell(n, 0.26, 0.055, i * 0.06));
      break;
    case 'slowmo':
      osc('sine', 600, 80, 0.8, 0.08);
      noise(0.9, 0.045, 'bandpass', 1800, 0.6, 0, 200);
      break;
    case 'win':
      [72, 76, 79, 84].forEach((n, i) => bell(n, 0.35, 0.06, i * 0.1));
      bell(88, 0.7, 0.05, 0.4);
      break;
    case 'bigwin': {
      // C, then F, then G major for the bigger tiers: all inside the tune's key
      const r = [60, 65, 67][Math.min(2, p)];
      [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => bell(r + n + 12, 0.4, 0.055, i * 0.07));
      [0, 4, 7].forEach(n => osc('triangle', NOTE(r + n - 12), 0, 1.6, 0.03, 0.5));
      [16, 17, 18, 19].forEach((d, i) => bell(deg(d), 0.3, 0.018, 0.55 + i * 0.09));
      duck(2.6, 0.3);
      break;
    }
    case 'fail':
      osc('triangle', NOTE(67), NOTE(55), 0.5, 0.07);
      osc('triangle', NOTE(60), NOTE(48), 0.7, 0.06, 0.25);
      duck(1.4, 0.4);
      break;
    case 'ui':
      bell(84, 0.08, 0.03);
      break;
    case 'upgrade':
      [67, 72, 76, 79, 84].forEach((n, i) => bell(n, 0.16, 0.045, i * 0.05));
      break;
    case 'whoosh':
      noise(0.5, 0.06, 'bandpass', 300, 0.8, 0, 2000);
      break;
    case 'splash':
      noise(0.4, 0.07, 'lowpass', 2200, 0.7, 0, 400);
      break;
    // v8.1: the 雪怪 · 步步高 drum (二人捕鱼's 醒狮; a deep thump and a skin slap, a step up the scale each beat) and the
    // 电击怪 lightning (海鳗)
    case 'drum':
      osc('sine', 95 + p * 6, 45, 0.28, 0.25);
      noise(0.09, 0.09, 'bandpass', 700 + p * 40, 1.2);
      bell(deg(7 + Math.min(p, 10)), 0.14, 0.035, 0.02);
      break;
    case 'zap':
      if (!ok(k, 60)) return;
      noise(0.16, 0.05, 'bandpass', 2600, 0.8, 0, 5200);
      osc('triangle', 1100, 400, 0.12, 0.03);
      break;
  }
}
