// DOM HUD and overlays: the HUD, banners, floating numbers, the map, the result card, the wheels and sheets. Most
// numbers on screen are DOM; the ones painted into the 3D scene are the gate panels, the barrel and ladder ×N plates
// (textures.js) and the 结尾 multiples.
import { showMissionMap,showDebrief } from './missionui.js';
import { fmt, kmb, sgn, clamp, easeOut, lerp } from '../sim/util.js';
import { sfx, music } from '../platform/audio.js';
import { save, persist, fishUnlocked, gameSpeed } from '../platform/save.js';
import { hapticsOn } from '../platform/haptics.js';
import { QUALITY, qualityName } from '../platform/perf.js';
import { bridge } from '../platform/bridge.js';
import { LEVELS, CHAPTERS, LOBBY_LV_CH4, SURPRISES, levelAt, stageLevels } from '../content/levels.js';
import { ptRows, ptSummary, ptText, ptReset } from '../platform/playtest.js';
import { SKILLS } from '../sim/runsim.js';
import { skillSvg, SKILL_PATHS } from '../view/skillicons.js';
import { targetCard } from '../view/cast.js';

const $ = s => document.querySelector(s);
const short = kmb;
// demo speed-up (×1 / ×2 / ×3): overlays that run on real time shorten with it
const SP = gameSpeed;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SOLDIER_SVG = '<svg viewBox="0 0 16 16" fill="#fff"><circle cx="8" cy="4.2" r="3.2"/><path d="M2.5 15c0-4 2.4-6.6 5.5-6.6s5.5 2.6 5.5 6.6z"/></svg>';
const FISH_SVG = '<svg viewBox="0 0 24 24"><path d="M12 3c5 0 8 3.6 8 8.3S17 21 12 21s-8-5-8-9.7S7 3 12 3z" fill="#8fc46a" stroke="#24361a" stroke-width="1.6"/><path d="M7.6 9.8l2.6 2.6M10.2 9.8l-2.6 2.6" stroke="#24361a" stroke-width="1.5" stroke-linecap="round"/><circle cx="15.4" cy="11" r="1.9" fill="#fff" stroke="#24361a" stroke-width="1.1"/><path d="M8.6 16.2c2.2 1 4.6 1 6.8 0" stroke="#24361a" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';   // the target icon (a zombie head)
const EGG_SVG = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="13" rx="7" ry="9" fill="#ffd23f"/><path d="M7 12l2.5 2 2.5-3 2.4 3 2.6-2" fill="none" stroke="#b86a00" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const SPEND_SVG = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#9db0d6"/><path d="M8 12h8" stroke="#1c2640" stroke-width="2.4" stroke-linecap="round"/></svg>';
const LUCKY_SVG = '<svg viewBox="0 0 24 24"><path d="M12 3l2.3 6.3L21 12l-6.7 2.4L12 21l-2.3-6.6L3 12l6.7-2.7z" fill="#ffd23f" stroke="#8a4a00" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const SHELL_SVG = '<svg viewBox="0 0 24 24"><defs><radialGradient id="sh" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fffbe0"/><stop offset=".45" stop-color="#ffd23f"/><stop offset="1" stop-color="#c46f00"/></radialGradient></defs><circle cx="12" cy="12" r="8" fill="url(#sh)"/></svg>';
const SKULL_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2.5c-5 0-8.5 3.4-8.5 8 0 2.7 1.3 4.6 3.2 5.8V20a1.5 1.5 0 0 0 1.5 1.5h7.6a1.5 1.5 0 0 0 1.5-1.5v-3.7c1.9-1.2 3.2-3.1 3.2-5.8 0-4.6-3.5-8-8.5-8z" fill="#ff5a4a" stroke="#5a0a06" stroke-width="1.6"/><circle cx="8.6" cy="11.2" r="2.3" fill="#2a0604"/><circle cx="15.4" cy="11.2" r="2.3" fill="#2a0604"/><path d="M12 13.6l-1.4 2.6h2.8z" fill="#2a0604"/></svg>';
const GIFT_SVG = '<svg viewBox="0 0 24 24"><rect x="3.5" y="9" width="17" height="12" rx="2" fill="#ff5ad0" stroke="#5a0a40" stroke-width="1.5"/><rect x="2.5" y="6" width="19" height="4.5" rx="1.5" fill="#ff8ae0" stroke="#5a0a40" stroke-width="1.5"/><path d="M12 6v15" stroke="#ffd23f" stroke-width="3"/><path d="M12 6c-2-4-6-3.5-5.5-1S11 6 12 6zm0 0c2-4 6-3.5 5.5-1S13 6 12 6z" fill="#ffd23f" stroke="#7a4a00" stroke-width="1.2"/></svg>';
export const ICONS = { soldier: SOLDIER_SVG, fish: FISH_SVG, egg: EGG_SVG, spend: SPEND_SVG, lucky: LUCKY_SVG, shell: SHELL_SVG, skull: SKULL_SVG, gift: GIFT_SVG };
// how the survivor heroes appear in a run (map tool, for comparing with the team)
const HERO_MODES = { truck: '车载', mix: '队内', off: '关' };
// the six result slots, in the order the 大关 teach them (ch = the 大关 that opens the slot)
const RES_SLOTS = [
  { k: 'troops', ch: 0, name: '兵', icon: SOLDIER_SVG, intro: '' },
  { k: 'kills', ch: 1, name: '打怪', icon: SKULL_SVG, intro: '怪带倍数：倍数 × 炮倍，打死就掉金币' },
  { k: 'coins', ch: 1, name: '兵变金币', icon: '<i class="ico-coin"></i>', intro: '撤离点：1 个兵 = 100 金币，打得越好钱越多' },
  { k: 'finale', ch: 1, name: '结尾惊喜', icon: GIFT_SVG, intro: '每关的结尾都不一样：彩虹滚轮、金砖墙、金怪……' },
  { k: 'mult', ch: 2, name: '倍数', icon: '<b class="rs-x">×</b>', intro: '黄金机甲、金蛋、幸运、宝箱怪：一下顶几百发' },
  { k: 'skill', ch: 3, name: '技能', icon: `<svg viewBox="0 0 24 24"><path d="M8 21V7M16 21V7M5 9l3-5 3 5M13 9l3-5 3 5" fill="none" stroke="#7df0ff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`, intro: '吃到的技能，炮台在黄金尸池和末日战场里也有' },
];
const ITEM_SVG = {
  bullet: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="3" fill="#ffd23f" stroke="#8a4a00" stroke-width="1.6"/><path d="M8 12h8M12 8v8" stroke="#8a4a00" stroke-width="2" stroke-linecap="round"/></svg>',
  torpedo: '<svg viewBox="0 0 24 24"><path d="M3 12c0-2 2-3 4-3h9l4 3-4 3H7c-2 0-4-1-4-3z" fill="#9db0d6" stroke="#26304a" stroke-width="1.6"/><path d="M20 12l2-3v6z" fill="#ff5a3a"/><circle cx="8" cy="12" r="1.4" fill="#26304a"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.5" fill="none" stroke="#ff4b3e" stroke-width="2.2"/><circle cx="12" cy="12" r="2.4" fill="#ff4b3e"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#ff4b3e" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

// ---------------------------------------------------------------- projected labels
class Labels {
  constructor(root, world) { this.root = root; this.world = world; this.map = new Map(); this.p = { x: 0, y: 0 }; }
  begin() { for (const v of this.map.values()) v.used = false; }
  at(key, cls, content, x, y, z, html = false) {
    const p = this.world.project(x, y, z, this.p);
    if (!p.vis || p.x < -60 || p.x > this.world.w + 60 || p.y < -40 || p.y > this.world.h + 40) return;
    let v = this.map.get(key);
    if (!v) { const el = document.createElement('div'); this.root.appendChild(el); v = { el, cls: '', c: null }; this.map.set(key, v); }
    if (v.cls !== cls) { v.el.className = 'lb ' + cls; v.cls = cls; }
    if (v.c !== content) { if (html) v.el.innerHTML = content; else v.el.textContent = content; v.c = content; }
    v.el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0) translate(-50%,-50%)`;
    if (v.el.hidden) v.el.hidden = false;
    v.used = true;
  }
  end() { for (const [k, v] of this.map) { if (!v.used) { v.el.remove(); this.map.delete(k); } } }
  clear() { for (const v of this.map.values()) v.el.remove(); this.map.clear(); }
}

export class UI {
  constructor(world) {
    this.world = world;
    this.frame = $('#frame');
    this.labels = new Labels($('#labels'), world);
    this.floatRoot = $('#floaters');
    this.floats = [];
    this.flights = [];
    this.pending = 0;
    this.walletShown = save.wallet;
    this.walletEl = $('#walletNum');
    this.wallet = $('#wallet');
    this.p = { x: 0, y: 0 };
    this.timers = [];
  }

  // ---------------------------------------------------------------- wallet & coin flights
  walletPos() { const r = this.wallet.getBoundingClientRect(), f = this.frame.getBoundingClientRect(); return { x: r.left - f.left + 12, y: r.top - f.top + 12 }; }
  // amount arrives in the wallet as n coins fly in from (sx, sy)
  coinsFly(amount, sx, sy, n = 6, delay = 0) {
    if (amount <= 0) return;
    n = Math.max(1, Math.min(n, 24));
    this.pending += amount;
    const per = amount / n;
    const to = this.walletPos();
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div'); el.className = 'fly-coin';
      el.style.transform = `translate3d(${sx - 13}px,${sy - 13}px,0) scale(0)`;
      this.floatRoot.appendChild(el);
      const ang = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 60;
      this.flights.push({ el, sx, sy, ox: Math.cos(ang) * sp, oy: Math.sin(ang) * sp - 20, tx: to.x, ty: to.y, t: -delay - i * 0.035, dur: 0.62 + Math.random() * 0.2, per, i });
    }
  }
  coinsFlyWorld(amount, x, y, z, n) { const p = this.world.project(x, y, z, this.p); this.coinsFly(amount, p.x, p.y, n); }
  flushPending() { for (const f of this.flights) f.el.remove(); this.flights.length = 0; this.pending = 0; }

  // ---------------------------------------------------------------- floating text
  float(content, cls, sx, sy, o = {}) {
    const el = document.createElement('div');
    el.className = 'ft ' + cls;
    if (o.html) el.innerHTML = content; else el.textContent = content;
    this.floatRoot.appendChild(el);
    // keep wide texts on screen
    const half = Math.min(el.offsetWidth / 2 + 6, this.world.w / 2);
    sx = Math.max(half, Math.min(this.world.w - half, sx));
    this.floats.push({ el, x: sx, y: sy, vy: o.vy ?? -70, t: 0, life: o.life ?? 0.9, pop: o.pop ?? 1, scale: o.scale ?? 1 });
  }
  floatWorld(content, cls, x, y, z, o) { const p = this.world.project(x, y, z, this.p); if (p.vis) this.float(content, cls, p.x, p.y, o); }
  coinText(amount, x, y, z, big, partner) {
    this.floatWorld(`<i class="ico-coin"></i>+${fmt(amount)}`, 'ft-coin' + (big ? ' big' : '') + (partner ? ' partner' : ''), x, y, z, { html: true, life: big ? 1.3 : 0.95, vy: -60 });
  }

  update(dt) {
    // floats
    for (const f of this.floats) {
      f.t += dt;
      const k = f.t / f.life;
      const s = f.t < 0.16 ? lerp(1.8 * f.pop, 1, easeOut(f.t / 0.16)) : 1;
      const a = k > 0.7 ? (1 - k) / 0.3 : 1;
      f.y += f.vy * dt; f.vy *= Math.exp(-2.2 * dt);
      f.el.style.transform = `translate3d(${f.x.toFixed(1)}px,${f.y.toFixed(1)}px,0) translate(-50%,-50%) scale(${(s * f.scale).toFixed(3)})`;
      f.el.style.opacity = a.toFixed(3);
    }
    this.floats = this.floats.filter(f => { if (f.t >= f.life) { f.el.remove(); return false; } return true; });
    // coin flights
    let landed = 0;
    for (const c of this.flights) {
      c.t += dt;
      if (c.t < 0) continue;
      const k = Math.min(1, c.t / c.dur);
      const burst = Math.min(1, c.t / 0.18);
      let x, y, s;
      if (k < 0.25) { const b = easeOut(burst); x = c.sx + c.ox * b; y = c.sy + c.oy * b; s = 0.4 + 0.8 * b; }
      else {
        const q = (k - 0.25) / 0.75, e = q * q;
        const x0 = c.sx + c.ox, y0 = c.sy + c.oy;
        const cx = (x0 + c.tx) / 2 + (c.ox > 0 ? 40 : -40), cy = Math.min(y0, c.ty) - 30;
        x = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * c.tx;
        y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * cy + e * e * c.ty;
        s = 1.2 - 0.45 * e;
      }
      c.el.style.transform = `translate3d(${(x - 13).toFixed(1)}px,${(y - 13).toFixed(1)}px,0) scale(${s.toFixed(3)})`;
      if (k >= 1) { c.done = true; this.pending = Math.max(0, this.pending - c.per); landed++; }
    }
    if (landed) {
      this.flights = this.flights.filter(c => { if (c.done) { c.el.remove(); return false; } return true; });
      this.wallet.classList.remove('bump'); void this.wallet.offsetWidth; this.wallet.classList.add('bump');
      sfx('coinTick', landed);
    }
    if (!this.flights.length) this.pending = 0;
    const target = save.wallet - this.pending;
    const d = target - this.walletShown;
    if (Math.abs(d) < 1) this.walletShown = target; else this.walletShown += d * Math.min(1, dt * 10);
    const txt = this.walletShown >= 1e6 ? short(this.walletShown) : fmt(this.walletShown);
    if (txt !== this._wtxt) { this.walletEl.textContent = txt; this._wtxt = txt; }
  }

  // ---------------------------------------------------------------- HUD
  setLevel(i, L = levelAt(i).L) {
    const C = CHAPTERS[L.ch];
    $('#lvlNum').textContent = L.code;
    $('#hud').dataset.mode = 'run';
    $('#lvlName').innerHTML = `<em class="stg">大关${C.no}</em>` + esc(L.title);
    this.frame.style.setProperty('--chap', C.color);
    this.frame.style.setProperty('--chap-deep', C.deep);
  }
  setFishing(num = '1 场', name = '末日战场 · 免费场') {
    $('#hud').dataset.mode = 'fishing';
    $('#lvlNum').textContent = num;
    $('#lvlName').textContent = name;
    this.frame.style.setProperty('--chap', '#4fb1ff');
    this.frame.style.setProperty('--chap-deep', '#1a59c7');
  }
  showWallet(on) { this.wallet.hidden = !on; }
  progress(show, k = 0, icon = 'skull') {
    const el = $('#runProgress'); el.hidden = !show;
    if (!show) return;
    $('#rpFill').style.width = (clamp(k, 0, 1) * 100).toFixed(1) + '%';
    const e = $('#rpEnd'); const c = 'rp-end' + (icon === 'skull' ? '' : ' ' + icon); if (e.className !== c) e.className = c;
  }
  // o.layers: Top Lords' stacked bar (×8 … ×1, a colour per layer); o.pay: the 大怪's multiple
  bossBar(show, name, frac, gold, o = {}) {
    const el = $('#bossBar'); el.hidden = !show;
    if (!show) { this._lag = undefined; return; }
    el.classList.toggle('gold', !!gold);
    if (name !== this._bbn) { $('#bbName').textContent = name; this._bbn = name; }
    const f = clamp(frac, 0, 1), layers = o.layers || 1;
    const L = Math.max(1, Math.ceil(f * layers - 1e-6)), inner = layers > 1 ? clamp(f * layers - (L - 1), 0, 1) : f;
    if (L !== this._bbL) { this._bbL = L; this._lag = 1; el.dataset.layer = String((L - 1) % 5); el.dataset.under = String(Math.max(0, L - 2) % 5); el.classList.toggle('last', L === 1); }
    $('#bbFill').style.width = (inner * 100).toFixed(2) + '%';
    this._lag = this._lag === undefined || this._lag < inner ? inner : lerp(this._lag, inner, 0.04);
    $('#bbLag').style.width = (this._lag * 100).toFixed(2) + '%';
    $('#bbNum').textContent = layers > 1 ? '×' + L : Math.round(f * 100) + '%';
    const pay = o.pay ? `赔 ×${o.pay}` : '';
    if (pay !== this._bbp) { $('#bbPay').textContent = pay; $('#bbPay').hidden = !pay; this._bbp = pay; }
  }
  // what is still on the road — monsters and what they are worth (怪 pay like targets)
  foes(show, n = 0, coins = 0) {
    const el = $('#foes'); if (!el) return;
    el.hidden = !show;
    if (!show) { this._foe = ''; return; }
    const key = n + '|' + Math.round(coins / 100);
    if (key === this._foe) return;
    this._foe = key;
    el.innerHTML = `${SKULL_SVG}<b>${fmt(n)}</b><span>值 <i class="ico-coin"></i>${kmb(coins)}</span>`;
  }
  // 结尾惊喜 HUD: which finale, the time left (or soldiers left on the 彩虹滚轮), what it paid, what ×1 is worth
  finaleHud(show, o = {}) {
    const el = $('#finHud'); if (!el) return;
    el.hidden = !show;
    $('#hud').classList.toggle('fin-on', !!show);
    if (!show) { this._fh = ''; return; }
    const key = [o.name, o.left === null ? 'r' + o.soldiers : Math.ceil(o.left * 4), Math.round(o.total), o.chip].join('|');
    if (key === this._fh) return;
    this._fh = key;
    const k = o.left === null ? 1 : clamp(o.left / o.dur, 0, 1);
    el.innerHTML = `<div class="fh-l"><b class="fh-name">${esc(o.name)}</b>${o.rainbow ? `<span class="fh-sub">还剩 ${fmt(o.soldiers)} 个兵</span>` : `<span class="fh-sub">${Math.ceil(o.left)} 秒</span><div class="fh-bar"><i style="width:${(k * 100).toFixed(1)}%"></i></div>`}</div>
      <div class="fh-r"><span class="fh-k">${o.rainbow ? '每个兵' : '每 ×1'} = ${kmb(o.chip)}</span><b class="fh-win"><i class="ico-coin"></i>+${fmt(o.total)}</b></div>`;
  }
  // the fishing session: time played (m:ss) and what it has won or lost so far
  session(show, clock, net) {
    const el = $('#session'); el.hidden = !show;
    if (!show) return;
    $('#ssTimer').textContent = clock;
    const n = $('#ssNet'); n.textContent = sgn(net); n.classList.toggle('neg', net < 0);
  }
  banner(text, cls = '', sub = '', dur = 1.4) {
    const el = $('#banner');
    el.className = 'banner stroke ' + cls;
    el.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : '');
    el.hidden = false;
    clearTimeout(this._bt); clearTimeout(this._bt2);
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    this._bt = setTimeout(() => { el.classList.add('out'); this._bt2 = setTimeout(() => { el.hidden = true; }, 300); }, dur * 1000 / SP());
  }
  hideBanner() { clearTimeout(this._bt); clearTimeout(this._bt2); $('#banner').hidden = true; }
  chapterCard(i, L = levelAt(i).L) {
    const C = CHAPTERS[L.ch];
    const el = $('#chapterCard');
    el.innerHTML = `<div class="cc-k">大关${C.no} · ${esc(C.name)}</div><div class="cc-t">${esc(L.code)} ${esc(L.title)}</div><div class="cc-s">${esc(L.hint)}</div>`;
    el.className = 'chapter-card'; el.hidden = false;
    clearTimeout(this._ct); clearTimeout(this._ct2);
    this._ct = setTimeout(() => { el.classList.add('out'); this._ct2 = setTimeout(() => { el.hidden = true; }, 350); }, 2800);
  }
  dragHint(show) { $('#dragHint').hidden = !show; }

  // skills carried by the squad (and later the bonus cannon); `fresh` pops in
  skills(sk, fresh) {
    const el = $('#skills');
    if (!sk) { el.hidden = true; el.innerHTML = ''; return; }
    const keys = Object.keys(sk).filter(k => sk[k]);
    el.hidden = !keys.length;
    el.innerHTML = keys.map(k => `<span class="sk-chip${k === fresh ? ' fresh' : ''}">${skillSvg(k)}<b>${esc(SKILLS[k].name)}</b></span>`).join('');
  }

  fishBar(show, sim, cfg) {
    $('#fishBar').hidden = !show;
    $('#fishTools').hidden = !show;
    $('#hud').classList.toggle('fishing-on', !!show);
    this._chg = '';
    if (!show) { $('#broke').hidden = true; return; }
    const multi = sim.bets.length > 1;
    $('#betBox').classList.toggle('locked', !multi);
    $('#betDown').disabled = !multi; $('#betUp').disabled = !multi;
    $('#btnNet').hidden = !cfg.open;
    $('#fishTools .ft-row').hidden = sim.laserOn === false;      // the 全屏激光 bar only with its lab switch on
    this.updateBet(sim);
    this.setAuto(sim.auto);
  }
  // items carried over from the result screens, and the charged skill bar
  items(sim) {
    const el = $('#fishItems'); if (!el) return;
    const it = save.items || {};
    el.innerHTML = ['bullet', 'torpedo', 'lock'].map(k => `<button class="item-btn" type="button" data-item="${k}" ${it[k] > 0 ? '' : 'disabled'}><i class="item-ico ${k}">${ITEM_SVG[k]}</i><b>×${it[k] || 0}</b></button>`).join('')
      + (sim && sim.freeShots > 0 ? `<em class="free-n">免费 ${sim.freeShots}</em>` : '') + (sim && sim.lockT > 0 ? `<em class="free-n">锁定 ${Math.ceil(sim.lockT)}s</em>` : '');
  }
  charge(sim) {
    const k = sim.chargeReady ? 1 : sim.charge / sim.chargeMax;
    const key = Math.round(k * 50) + '|' + sim.chargeReady + '|' + sim.freeShots + '|' + Math.ceil(sim.lockT);
    if (key === this._chg) return;
    this._chg = key;
    $('#chargeFill').style.width = (k * 100).toFixed(0) + '%';
    $('#chargeTxt').textContent = sim.chargeReady ? '全屏激光 · 点我' : `技能 ${sim.charge}/${sim.chargeMax}`;
    $('#btnLaser').disabled = !sim.chargeReady;
    $('#btnLaser').classList.toggle('ready', sim.chargeReady);
    this.items(sim);
  }
  updateBet(sim, capText) {
    // the 1 场 炮倍 in coins per shot (1K～20K), as 二人捕鱼 shows it
    $('#betNum').textContent = kmb(100 * sim.bet);
    $('#betCap').textContent = capText || '';
    const i = sim.bets.indexOf(sim.bet);
    if (sim.bets.length > 1) { $('#betDown').disabled = i <= 0; $('#betUp').disabled = i >= sim.bets.length - 1; }
  }
  pulseBet() { const b = $('#betBox'); b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); }
  setAuto(on) { $('#btnAuto').classList.toggle('on', on); }
  netButton(enabled, sub) { const b = $('#btnNet'); b.disabled = !enabled; $('#netSub').textContent = sub; }
  // out of coins in the fishing game: the way back is a run
  broke(show) { $('#broke').hidden = !show; }

  // 撤离点 counter: soldiers through the gate become coins (1 兵 = 100), then the gift shells pour in
  homeCounter(show, soldiers, home, shots, mult, gift) {
    let el = this._cv;
    if (!el) { el = this._cv = document.createElement('div'); el.className = 'cv home'; $('#hud').appendChild(el); }
    el.hidden = !show;
    if (!show) return;
    el.innerHTML = `<div class="hc-gate"><span>撤离点</span><b>1 兵 = 100</b></div>
      <div class="hc-row xchg"><span class="hc-k">${SOLDIER_SVG}${fmt(home)} 兵</span><b class="hc-n coin"><i class="ico-coin"></i>+${fmt(home * 100)}</b></div>
      ${shots > 0 ? '' : '<!--'}<div class="hc-row gift ${gift > 0 ? 'on' : ''}"><span class="hc-k">再送黄金尸池${mult > 1 ? ` <em>跑道 ×${mult}</em>` : ''}${this.shellValue ? `<em>每发 ${kmb(this.shellValue)}</em>` : ''}</span><b class="hc-n"><i class="shell-ico"></i>${fmt(gift)}<small> 发金炮弹</small></b></div>${shots > 0 ? '' : '-->'}`;      // the pool row only when there is a pool
  }

  // bonus cannon HUD (a strip under the top bar): shells left and what the bonus has paid so far
  bonusHud(show, sim, chips = [], total = 0) {
    const el = $('#bonusHud'); el.hidden = !show;
    $('#hud').classList.toggle('bonus-on', !!show);
    if (!show) { this._bh = ''; return; }
    const left = Math.ceil(sim.left), k = sim.shots ? left / sim.shots : 0;
    const key = left + '|' + Math.round(total) + '|' + chips.join();
    if (key === this._bh) return;
    this._bh = key;
    el.innerHTML = `<div class="bh-l"><div class="bh-row"><i class="shell-ico"></i><b class="bh-n">${fmt(left)}</b><span class="bh-of">/ ${fmt(sim.shots)} 发</span></div>
      <div class="bh-bar"><i style="width:${(k * 100).toFixed(1)}%"></i></div></div>
      <div class="bh-r"><span class="bh-k">Bonus</span><b class="bh-win"><i class="ico-coin"></i>+${fmt(total)}</b></div>
      ${chips.length ? `<div class="bh-chips">${chips.map(c => `<em>${esc(c)}</em>`).join('')}</div>` : ''}`;
  }

  // small non-blocking card: {title, sub, actions: [{label, cls, on}]}
  prompt(o) {
    const el = $('#promptCard');
    if (!o) { el.hidden = true; el.innerHTML = ''; return; }
    el.innerHTML = `<div class="pc-t">${esc(o.title)}</div>${o.sub ? `<div class="pc-s">${esc(o.sub)}</div>` : ''}<div class="pc-a">${o.actions.map((a, i) => `<button class="btn ${a.cls || 'btn-dark'}" type="button" data-i="${i}">${a.html || esc(a.label)}</button>`).join('')}</div>`;
    el.hidden = false;
    el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { sfx('ui'); o.actions[+b.dataset.i].on(); }));
  }

  // ---------------------------------------------------------------- overlays
  hideOverlays() { for (const id of ['#ovWheel', '#ovWin', '#ovResult', '#ovMap', '#ovPause','#mapSheet']) $(id).hidden = true; }

  // segments: [{label, icon (skill key), locked, lockText}], result index → resolves after landing
  wheel({ title, sub, segments, result }) {
    return new Promise(resolve => {
      const ov = $('#ovWheel');
      const n = segments.length, R = 150, C = 160;
      const cols = ['#ff4b3e', '#ffb21a', '#9a4bff', '#3e9bff', '#ff4b9a', '#2fc46a', '#14b8c4', '#ff7a1a'];
      let segs = '';
      segments.forEach((s, i) => {
        const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 - Math.PI / n, a1 = a0 + (Math.PI * 2) / n;
        const p0 = [C + Math.cos(a0) * R, C + Math.sin(a0) * R], p1 = [C + Math.cos(a1) * R, C + Math.sin(a1) * R];
        const fill = s.locked ? '#2a3348' : cols[i % cols.length];
        segs += `<path d="M${C} ${C}L${p0[0].toFixed(1)} ${p0[1].toFixed(1)}A${R} ${R} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}Z" fill="${fill}" stroke="#fff3c2" stroke-width="3"/>`;
        const am = (a0 + a1) / 2, deg = am * 180 / Math.PI + 90;
        const rr = s.icon ? 0.6 : 0.64;
        const tx = C + Math.cos(am) * R * rr, ty = C + Math.sin(am) * R * rr;
        segs += `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) rotate(${deg.toFixed(1)})"${s.locked ? ' opacity=".55"' : ''}>`;
        const fs = n > 6 ? (s.label.length > 2 ? 17 : 22) : 34;
        if (s.icon) segs += `<g transform="translate(-17 -50) scale(1.42)"><path d="${SKILL_PATHS[s.icon]}" fill="none" stroke="#3a1400" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/><path d="${SKILL_PATHS[s.icon]}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>`;
        segs += `<text y="${s.icon ? 10 : 8}" text-anchor="middle" font-family="Lilita One, Noto Sans SC, sans-serif" font-weight="900" font-size="${fs}" fill="#fff" stroke="#3a1400" stroke-width="5" paint-order="stroke">${esc(s.label)}</text>`;
        if (s.locked) segs += `<text y="${s.icon ? 22 : 26}" text-anchor="middle" font-family="Noto Sans SC, sans-serif" font-weight="900" font-size="11" fill="#ffcf8a">${esc(s.lockText || '')}</text>`;
        segs += '</g>';
      });
      let bulbs = '';
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; bulbs += `<circle class="bulb" cx="${(C + Math.cos(a) * (R + 9)).toFixed(1)}" cy="${(C + Math.sin(a) * (R + 9)).toFixed(1)}" r="4.2" fill="${i % 2 ? '#fff6c8' : '#ffb21a'}"/>`; }
      ov.innerHTML = `<div class="wheel-title">${esc(title)}<small>${esc(sub || '')}</small></div>
        <div class="wheel"><svg class="wheel-face" viewBox="0 0 320 320">
          <circle cx="${C}" cy="${C}" r="${R + 16}" fill="#7a2a00" stroke="#ffd23f" stroke-width="5"/>${bulbs}
          <g class="disc" id="wheelDisc">${segs}</g>
          <circle cx="${C}" cy="${C}" r="30" fill="#ffd23f" stroke="#7a3a00" stroke-width="5"/>
          <text x="${C}" y="${C + 8}" text-anchor="middle" font-family="Noto Sans SC, sans-serif" font-weight="900" font-size="18" fill="#7a3a00">爆</text>
        </svg>
        <svg class="wheel-pointer" viewBox="0 0 40 52"><path d="M20 50L4 14a17 17 0 1 1 32 0z" fill="#ff3a2a" stroke="#fff" stroke-width="4"/><circle cx="20" cy="17" r="6" fill="#fff"/></svg></div>`;
      ov.hidden = false;
      const disc = ov.querySelector('#wheelDisc');
      const segA = 360 / n;
      const final = 360 * 5 + (360 - result * segA) + (Math.random() - 0.5) * segA * 0.6;
      const dur = 2.9 / SP();
      let t0 = null, lastSeg = -1, landed = false;
      const land = () => {
        if (landed) return; landed = true;
        disc.setAttribute('transform', `rotate(${final.toFixed(2)} ${C} ${C})`);
        sfx('land');
        ov.querySelectorAll('.bulb').forEach((b, i) => b.setAttribute('fill', i % 2 ? '#ffffff' : '#ff3a2a'));
        ov.querySelector('.wheel-title small').textContent = '转到「' + segments[result].label + '」';
        setTimeout(() => { ov.hidden = true; resolve(); }, 950 / SP());
      };
      const step = now => {
        if (landed) return;
        if (t0 === null) t0 = now;
        const k = Math.min(1, (now - t0) / 1000 / dur);
        const e = 1 - Math.pow(1 - k, 4);
        const ang = final * e;
        disc.setAttribute('transform', `rotate(${ang.toFixed(2)} ${C} ${C})`);
        const seg = Math.floor((ang + segA / 2) / segA);
        if (seg !== lastSeg) { lastSeg = seg; sfx('tick'); }
        if (k < 1) requestAnimationFrame(step); else land();
      };
      requestAnimationFrame(step);
      setTimeout(land, dur * 1000 + 400);     // rAF stops in a hidden tab
    });
  }

  // tier 0 BIG, 1 MEGA, 2 SUPER
  bigWin({ tier, label, mult, amount, sub, compare }) {
    return new Promise(resolve => {
      const ov = $('#ovWin');
      const names = ['BIG WIN', 'MEGA WIN', 'SUPER WIN'];
      const cls = ['', 'mega', 'super'][tier];
      ov.innerHTML = `<div class="win"><div class="rays"></div>
        <div class="win-tier ${cls}">${esc(label || names[tier])}</div>
        ${mult ? `<div class="win-mult">×${fmt(mult)}</div>` : ''}
        <div class="win-amt"><i class="ico-coin"></i><span id="winNum">0</span></div>
        ${sub ? `<div class="win-sub">${esc(sub)}</div>` : ''}
        ${compare ? `<div class="win-compare">${esc(compare)}</div>` : ''}
        <div class="win-tap">点击收下</div></div>`;
      ov.hidden = false;
      sfx('bigwin', tier);
      const num = ov.querySelector('#winNum');
      const dur = (1.6 + tier * 0.6) / SP();
      let t0 = null, done = false, closed = false, raf;
      const close = () => {
        if (closed) return; closed = true; cancelAnimationFrame(raf); clearTimeout(auto);
        ov.hidden = true; ov.onclick = null; resolve();
      };
      let auto = null;
      const step = now => {
        if (t0 === null) t0 = now;
        const k = Math.min(1, (now - t0) / 1000 / dur);
        num.textContent = fmt(amount * (1 - Math.pow(1 - k, 2.2)));
        if (Math.random() < 0.5) sfx('coinTick', Math.floor(k * 20));
        if (k < 1) raf = requestAnimationFrame(step);
        else { done = true; num.textContent = fmt(amount); auto = setTimeout(close, 1500 / SP()); }
      };
      raf = requestAnimationFrame(step);
      ov.onclick = () => { if (!done) { done = true; cancelAnimationFrame(raf); num.textContent = fmt(amount); auto = setTimeout(close, 900); } else close(); };
    });
  }

  // ---------------------------------------------------------------- special-target wins (二人捕鱼's special fish)
  // 爆破矿工宝箱: three tap targets over the three chests (screen positions from FishView); picks the middle by itself
  // after `auto` seconds. Resolves to the index picked.
  chestPick({ pos, title, sub, auto = 5 }) {
    return new Promise(resolve => {
      const ov = $('#ovChest');
      const fr = $('#frame').getBoundingClientRect();
      ov.innerHTML = `<div class="sp-head"><b>${esc(title)}</b><small>${esc(sub)}</small><em id="cpLeft">${auto}</em></div>` +
        pos.map((p, i) => `<button class="cp-btn" data-i="${i}" type="button" style="left:${(p.x - fr.left).toFixed(0)}px;top:${(p.y - fr.top).toFixed(0)}px"><span>点我</span></button>`).join('');
      ov.hidden = false;
      sfx('upgrade');
      let left = auto, done = false;
      const finish = i => {
        if (done) return; done = true; clearInterval(tick);
        ov.querySelectorAll('.cp-btn').forEach((b, j) => b.classList.add(j === i ? 'picked' : 'other'));
        sfx('ui');
        setTimeout(() => { ov.hidden = true; ov.innerHTML = ''; resolve(i); }, 260);
      };
      const tick = setInterval(() => { left--; const e = $('#cpLeft'); if (e) e.textContent = Math.max(0, left); if (left <= 0) finish(1); }, 1000 / SP());
      ov.querySelectorAll('.cp-btn').forEach(b => { b.onclick = e => { e.stopPropagation(); finish(+b.dataset.i); }; });
    });
  }
  // 雪怪 · 步步高 (二人捕鱼's 醒狮王 · 舞狮连跳): its card dances in the middle; every drum beat the multiple jumps one step until it stops
  lionDance({ card, steps, final, stake, unit = '炮倍' }) {
    return new Promise(resolve => {
      const ov = $('#ovLion');
      const list = steps.filter(m => m <= final);
      ov.innerHTML = `<div class="lion"><div class="rays"></div><img class="lion-card" src="${card}" alt=""><div class="lion-name">雪怪 · 步步高</div>
        <div class="lion-mult">×<b id="lnM">${list[0]}</b></div><div class="lion-steps">${steps.map(m => `<i class="${m === list[0] ? 'on' : ''}" data-m="${m}">${m}</i>`).join('')}</div>
        <div class="lion-sub">鼓点一下跳一格 · ${unit} ${kmb(stake)}</div></div>`;
      ov.hidden = false;
      let i = 0;
      const beat = () => {
        i++;
        if (i >= list.length) { $('#lnM').parentElement.classList.add('stop'); sfx('bigwin', 0); setTimeout(() => { ov.hidden = true; ov.innerHTML = ''; resolve(final); }, 1100 / SP()); return; }
        const m = list[i];
        $('#lnM').textContent = m;
        const el = ov.querySelector('.lion-mult'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
        ov.querySelector('.lion-card').classList.toggle('hop');
        ov.querySelectorAll('.lion-steps i').forEach(e => e.classList.toggle('on', +e.dataset.m <= m));
        sfx('drum', i);
        setTimeout(beat, (520 + i * 60) / SP());
      };
      setTimeout(beat, 700 / SP());
    });
  }
  // 实验室: the 金币炮台 the soldiers were turned into for the 宝箱怪
  cannonBar(show, o = {}) {
    const el = $('#critBar'); el.hidden = !show; el.classList.toggle('cannon', !!show);
    if (!show) return;
    el.innerHTML = `<b>金币炮台 · 打宝箱怪</b><span>每炮 ${kmb(o.bet)} · 打中它 ${o.hits} 次</span><i style="width:${(Math.max(0, o.pool / Math.max(1, o.pool0)) * 100).toFixed(1)}%"></i><em><i class="ico-coin"></i>剩 ${fmt(o.pool)}</em>`;
  }
  // 裹布蛛 · 暴击 (二人捕鱼's 海王狩猎): the 8-second critical window
  critBar(show, left = 0, dur = 8, total = 0) {
    const el = $('#critBar'); el.hidden = !show; el.classList.remove('cannon');
    if (!show) return;
    el.innerHTML = `<b>裹布蛛 · 全场暴击</b><span>${Math.ceil(left)} 秒 · 炮免费</span><i style="width:${(Math.max(0, left / dur) * 100).toFixed(1)}%"></i><em><i class="ico-coin"></i>+${fmt(total)}</em>`;
  }

  // ×1 → ×2 → ×3: the demo plays faster for showing it around
  speedPill() {
    const b = $('#btnSpeed'); if (!b) return;
    const k = SP();
    b.textContent = '×' + k; b.classList.toggle('on', k > 1);
    b.setAttribute('aria-label', `游戏速度 ×${k}`);
  }
  hurtFlash() { const e = $('#hurtFlash'); e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); }
  callout(html, ms = 4000) {
    const e = $('#callout'); clearTimeout(this._co);
    if (!html) { e.hidden = true; return; }
    e.innerHTML = html; e.hidden = false; e.style.animation = 'none'; void e.offsetWidth; e.style.animation = '';
    this._co = setTimeout(() => { e.hidden = true; }, ms);
  }
  betToast(html, ms = 2600) {
    const e = $('#betToast'); clearTimeout(this._bt3);
    e.innerHTML = html; e.hidden = false; e.style.animation = 'none'; void e.offsetWidth; e.style.animation = '';
    this._bt3 = setTimeout(() => { e.hidden = true; }, ms);
  }
  // the boot screen doubles as the model loading screen
  loading(on, text = '') { $('#ovBoot').hidden = !on; if (text) $('#bootSub').textContent = text; }
  teach(html) { const e = $('#teach'); if (!html) { e.hidden = true; return; } e.innerHTML = html; e.hidden = false; }

  // 结算 of a 末日战场 session (收网 in the fishing build), the same card as the level result: the biggest win first, three numbers, the big
  // wins grouped by kind as chips; the grouped list on 详情. Buttons always at the bottom.
  // Resolves to 'again' | 'run' | 'map'.
  fishResult(d) {
    return new Promise(resolve => {
      const ov = $('#ovResult');
      const plus = v => (v < 0 ? '−' : '+') + fmt(Math.abs(v));
      const net = d.won - d.spent;
      const peak = d.best ? `<div class="r-peak"><small>这场最爽的一下</small><b>${esc(d.best.name)}${d.best.mult ? ` ×${fmt(d.best.mult)}` : ''}</b><em><i class="ico-coin"></i>+${kmb(d.best.win)}</em></div>`
        : `<div class="r-peak"><small>这场</small><b>还没打到大怪</b><em>黄金机甲、爆破矿工、雪怪每 60 秒都会来</em></div>`;
      const stats = `<div class="r-stats"><span><b>${plus(net).replace('+', '+')}</b><small>净赚</small></span><span><b>${fmt(d.kills)}</b><small>打倒的僵尸</small></span><span><b>${fmt(d.shots)}</b><small>开炮</small></span></div>`;
      const chips = d.groups.length ? `<div class="r-chips">${d.groups.slice(0, 4).map(g => `<span>${esc(g.name)}${g.n > 1 ? ` ×${g.n}` : ''}</span>`).join('')}${d.groups.length > 4 ? `<span>+${d.groups.length - 4}</span>` : ''}</div>` : '<p class="r-note">这场没有爆分；特殊僵尸会轮流来</p>';
      const rows = [`<div class="rd-row"><i>${ICONS.spend || ''}</i><span><b>开炮花费</b><small>${fmt(d.shots)} 发</small></span><em>−${kmb(d.spent)}</em></div>`,
        `<div class="rd-row"><i>${ICONS.fish || ''}</i><span><b>普通僵尸</b><small>打倒 ${fmt(d.kills)} 只</small></span><em class="gold">+${kmb(d.fishWon)}</em></div>`,
        ...d.groups.map(g => `<div class="rd-row"><i class="ico-coin"></i><span><b>${esc(g.name)}</b><small>${g.n} 次 · 最大 ×${fmt(g.best)}</small></span><em class="gold">+${kmb(g.win)}</em></div>`)].join('');
      const acts = `<button class="btn btn-yellow btn-big r-main" data-a="again" type="button">再来一场</button>
        <button class="btn btn-blue r-side" data-a="run" type="button">去跑一关</button>
        <button class="btn btn-dark r-side r-icon" data-a="map" type="button" aria-label="地图" title="地图"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5l6-2.5 6 2.5 6-2.5v13l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13M15 6.5v13"/></svg></button>`;
      ov.innerHTML = `<div class="result lesson v9"><div class="rays ${net >= 0 ? '' : 'red'}"></div>
        <div class="ribbon">结算</div>
        <div class="panel">
          <p class="r-sub">末日战场 · 1 场</p>
          ${peak}${stats}${chips}
          <div class="rs-total"><span>本场</span><i class="ico-coin"></i><b id="rsTotal">${plus(d.total)}</b><small>钱包 ${kmb(save.wallet)}</small></div>
          <button class="r-more" type="button" data-more>详情 ›</button>
        </div>
        <div class="r-acts">${acts}</div>
        <div class="r-detail" id="rDetail" hidden><div class="rd-head"><b>这场详情</b><button class="rd-close" type="button" aria-label="收起">×</button></div><div class="rd-body">${rows}</div></div></div>`;
      ov.hidden = false;
      sfx(net >= 0 ? 'win' : 'fail');
      const det = ov.querySelector('#rDetail');
      ov.querySelector('[data-more]').onclick = () => { sfx('ui'); det.hidden = false; };
      ov.querySelector('.rd-close').onclick = () => { sfx('ui'); det.hidden = true; };
      const done = v => { sfx('ui'); ov.hidden = true; resolve(v); };
      ov.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => done(b.dataset.a)));
    });
  }

  // ---------------------------------------------------------------- 大关 map, 大关 card, lesson result
  // The map is the story for the boss: four 大关 from the bottom up, each one new idea on the way to fishing — levels
  // 1–13 on one winding road, the 避难所 (stand-in for 二人捕鱼's room select; it opens 末日战场) off 第 9 关, the 二星
  // island locked far out.
  // Players first see it when 3-3 opens the 避难所 (before that the results go straight to the next level).
  // Experiments live behind the 实验室 (lab) switches.
  map(options) { return showMissionMap(this,options); }

  // 避难所 · 选场 (二人捕鱼's room select): the sub-game sends players to the 1 场 (免费场, 炮倍 1K～20K); the bet rooms
  // open inside 二人捕鱼 itself (players read 正式版开放)
  roomSelect(onFish) {
    const sheet = $('#mapSheet');
    if (!sheet) return onFish();
    sheet.innerHTML = `<div class="panel sheet-panel fm-rooms"><div class="ms-k">避难所 · 末日战场</div><h3>选场</h3>
      <button class="fm-room on" type="button" data-room="1"><img src="${targetCard(22)}" alt=""><div><b>1 场 · 免费场</b><span>炮倍 1K～20K · 黄金机甲、宝箱怪都在</span></div><em>进入</em></button>
      <button class="fm-room" type="button" disabled><img src="${targetCard(17)}" alt=""><div><b>2 场</b><span>炮倍 100K 起 · 正式版开放</span></div><em>未开放</em></button>
      <button class="fm-room" type="button" disabled><img src="${targetCard(62)}" alt=""><div><b>3 场</b><span>炮倍 1M 起 · 正式版开放</span></div><em>未开放</em></button>
      <p>钱包 <b>${fmt(save.wallet)}</b> · 在 1 场按 1K 打能打 <b>${fmt(Math.floor(save.wallet / 1000))}</b> 发</p>
      <div class="r-acts"><button class="btn btn-dark" type="button" data-close>关闭</button></div></div>`;
    sheet.hidden = false;
    sheet.querySelector('[data-room="1"]').onclick = () => { sfx('ui'); sheet.hidden = true; onFish(); };
    sheet.querySelector('[data-close]').onclick = () => { sheet.hidden = true; };
  }

  // 实验室: everything still being tried sits behind a switch; with every switch off the game plays as the first release
  labSheet({ onReset, onStart, reopen }) {
    if(LEVELS[0]?.journey)return this.journeyLab({onReset,reopen});
    const sheet = $('#mapSheet'), L7 = save.lab ||= {};
    const row = (k, name, desc, on) => `<div class="lab-row"><div><b>${name}</b><span>${desc}</span></div><button class="lab-sw ${on ? 'on' : ''}" type="button" data-k="${k}" aria-pressed="${on}"><i></i></button></div>`;
    const hero = save.heroMode || 'truck';
    sheet.innerHTML = `<div class="panel sheet-panel lab"><div class="ms-k">实验室 · 都是开关，关掉就是第一版的样子</div>
      ${row('magicLive', '宝箱怪真随机开奖', '关：一星按剧本（4 张怪牌 × 3 = ×1,419）；开：用二人捕鱼的原版开奖', !!L7.magicLive)}
      ${row('pickLive', '结尾转盘真随机', '关：第 8 关的结尾转盘按剧本转到金蝠来袭；开：七种结尾随机抽一个', !!L7.pickLive)}
      ${row('magicCoin', '宝箱怪战场关（实验）', '关：第 13 关拿兵打宝箱怪 Boss；开：跑完路兵过撤离点变成金币，直接进一局末日战场，每炮 1K 按二人捕鱼的概率打宝箱怪，打中翻牌，没打完的金币留着', !!L7.magicCoin)}
      <div class="lab-row"><div><b>试玩宝箱怪战场关</b><span>打开上面的开关，直接进第 13 关</span></div><button class="btn btn-yellow lab-hero" type="button" id="labHunt">试玩</button></div>
      ${this.openEditor ? '<div class="lab-row"><div><b>调参台（测试用）</b><span>边玩边改数：关卡序列、全局数值、自动验关、导入导出</span></div><button class="btn btn-yellow lab-hero" type="button" id="labEdit">打开</button></div>' : ''}
      ${row('par', '保本线（二三星押注预览）', '跑关时显示「带回多少兵才不亏」，结算按步兵 100/兵算一遍输赢', !!L7.par)}
      ${row('release', '正式版规则：过关不能重玩', '和 SLG 一样，打过的关不能再进；测试时先关着', !!L7.release)}
      ${row('unlockAll', '全部解锁', '所有关卡都能直接进', !!save.unlockAll)}
      ${row('vib', '震动', '手机上打中、爆分时震一下', hapticsOn())}
      ${row('laser', '全屏激光', '关：末日战场和黄金尸池里没有充能条和全屏激光（新玩家一次看到的东西太多）；开：打满充能放全屏激光', !!L7.laser)}
      ${row('music', '背景音乐', '跑跑卡丁车村庄曲（内部 demo 占位，上线前换成有授权的曲子）', save.music !== false)}
      <div class="lab-row"><div><b>英雄表现</b><span>车载：坐装甲车在兵群中间；队内：混在队伍里；关：只有兵</span></div><button class="btn btn-dark lab-hero" type="button" id="labHero">${HERO_MODES[hero]}</button></div>
      <div class="r-acts lab-acts"><button class="btn btn-dark" type="button" id="labData">试玩数据</button><button class="btn btn-dark" type="button" id="labReset">清空进度</button><button class="btn btn-yellow" type="button" data-close>好了</button></div></div>`;
    sheet.hidden = false;
    sheet.querySelectorAll('.lab-sw').forEach(b => b.onclick = () => {
      const k = b.dataset.k; sfx('ui');
      if (k === 'unlockAll') { save.unlockAll = !save.unlockAll; b.classList.toggle('on', save.unlockAll); }
      else if (k === 'vib') { save.vib = !hapticsOn(); b.classList.toggle('on', hapticsOn()); }
      else if (k === 'music') { save.music = save.music === false; b.classList.toggle('on', save.music); music(); }
      else { L7[k] = !L7[k]; b.classList.toggle('on', L7[k]); }
      bridge.track('lab', { k, on: b.classList.contains('on') });
      persist();
    });
    sheet.querySelector('#labHero').onclick = e => {
      const ks = Object.keys(HERO_MODES), i = ks.indexOf(save.heroMode || 'truck');
      save.heroMode = ks[(i + 1) % ks.length]; persist(); sfx('ui');
      e.currentTarget.textContent = HERO_MODES[save.heroMode];
    };
    sheet.querySelector('#labData').onclick = () => { sfx('ui'); this.playtestSheet(); };
    sheet.querySelector('#labEdit')?.addEventListener('click', () => { sfx('ui'); sheet.hidden = true; this.openEditor(); });
    sheet.querySelector('#labHunt').onclick = () => { sfx('ui'); L7.magicCoin = true; persist(); sheet.hidden = true; onStart?.(LEVELS.findIndex(q => q.magic)); };
    const rb = sheet.querySelector('#labReset');
    rb.onclick = () => {
      if (rb.dataset.armed) { onReset(); return; }
      rb.dataset.armed = '1'; rb.textContent = '再点一次确认';
      setTimeout(() => { if (rb.isConnected) { delete rb.dataset.armed; rb.textContent = '清空进度'; } }, 2500);
    };
    sheet.querySelector('[data-close]').onclick = () => { sheet.hidden = true; reopen(); };
  }

  journeyLab({onReset,reopen}={}) {
    const sheet=$('#mapSheet');
    sheet.className='ov journey-lab';
    sheet.innerHTML=`<div class="warehouse lab-panel"><small>实验室 · 试玩设置</small><h2>自由查看后面的关卡</h2><p>打开全部解锁即可从公路地图进入任意一关，保留真实通关记录。</p><button type="button" class="lab-setting" data-unlock aria-pressed="${!!save.unlockAll}"><span><b>全部关卡解锁</b><small>五个目的地都可直接试玩</small></span><em>${save.unlockAll?'已开启':'点击开启'}</em></button><button type="button" class="lab-setting" data-music aria-pressed="${save.music!==false}"><span><b>末日氛围音乐</b><small>低频节奏与阴沉氛围</small></span><em>${save.music===false?'已关闭':'已开启'}</em></button><button type="button" class="lab-setting" data-vib aria-pressed="${hapticsOn()}"><span><b>打击震动</b><small>支持震动的设备上生效</small></span><em>${hapticsOn()?'已开启':'已关闭'}</em></button><button class="story-secondary" data-editor>打开调参台</button><button class="story-secondary" data-reset>重置本版进度</button><button class="story-primary" data-close>返回公路地图</button></div>`;
    sheet.hidden=false;
    const toggle=(sel,on,fn)=>{const b=sheet.querySelector(sel);b.onclick=()=>{const next=!on();fn(next);persist();sfx('ui');b.setAttribute('aria-pressed',String(next));b.querySelector('em').textContent=next?'已开启':'已关闭';};};
    toggle('[data-unlock]',()=>!!save.unlockAll,v=>{save.unlockAll=v;});
    toggle('[data-music]',()=>save.music!==false,v=>{save.music=v;music();});
    toggle('[data-vib]',hapticsOn,v=>{save.vib=v;});
    const credit=document.createElement('p');credit.className='lab-music-credit';credit.innerHTML='试听配乐：<a href="https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100655" target="_blank" rel="noopener">Lightless Dawn — Kevin MacLeod</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a><br>仅作氛围参考，已截取片段。';sheet.querySelector('.lab-panel').append(credit);
    sheet.querySelector('[data-editor]').onclick=()=>{sheet.hidden=true;this.openEditor?.();};
    sheet.querySelector('[data-reset]').onclick=e=>{const b=e.currentTarget;if(!b.dataset.armed){b.dataset.armed='1';b.textContent='再点一次，确认重置 V4 进度';return;}sheet.hidden=true;onReset?.();};
    sheet.querySelector('[data-close]').onclick=()=>{sheet.hidden=true;reopen?.();};
  }

  playtestSheet() {
    const sheet = $('#mapSheet');
    const order = LEVELS.map(L => L.code), sm = ptSummary();
    const P = this.perf, dev = P ? `${deviceName()} · ${P.gpu}` : deviceName();
    sheet.innerHTML = `<div class="panel sheet-panel"><h3>试玩数据</h3><p class="sheet-sub">只记在这台设备上 · 打开 ${sm.sessions} 次 · 每次平均玩 ${sm.avgPlays} 关</p>
      <div class="pt-wrap"><table class="pt"><thead><tr><th>关</th><th>开始</th><th>通过</th><th>失败率</th><th>输后重开</th><th>中途退出</th><th>帧率</th></tr></thead><tbody>
      ${ptRows([...order, '渔场']).map(r => `<tr><td>${r.code}</td><td>${r.start}</td><td>${r.win}</td><td>${r.failRate}</td><td>${r.retryRate}</td><td>${r.quitRate}</td><td>${r.fps}</td></tr>`).join('')}</tbody></table></div>
      ${P ? `<div class="pt-dev"><span>${esc(dev)}</span><div class="pt-perf"><button class="btn btn-dark ${P.shown ? 'on' : ''}" type="button" id="ptFps">帧率显示${P.shown ? '开' : '关'}</button><button class="btn btn-dark" type="button" id="ptQ">画质：${qualityName(P.setting())}</button></div><small>帧率 = 平均/最低（每 2 秒一次）。卡顿时「自动」会先降分辨率再关阴影</small></div>` : ''}
      <div class="r-acts"><button class="btn btn-yellow" type="button" id="ptCopy">复制表格</button><button class="btn btn-dark" type="button" id="ptReset">清空数据</button><button class="btn btn-dark" type="button" data-close>关闭</button></div></div>`;
    sheet.hidden = false;
    sheet.querySelector('#ptCopy').onclick = () => {
      const txt = ptText(order, dev);
      const ok = () => this.betToast('已复制，可以直接粘贴到表格里', 1600);
      try { navigator.clipboard.writeText(txt).then(ok, () => this.copyFallback(txt)); } catch (e) { this.copyFallback(txt); }
    };
    sheet.querySelector('#ptReset').onclick = () => { ptReset(); this.playtestSheet(); };
    sheet.querySelector('#ptFps')?.addEventListener('click', () => { P.showOverlay(!P.shown); this.playtestSheet(); });
    sheet.querySelector('#ptQ')?.addEventListener('click', () => { const i = QUALITY.indexOf(P.setting()); P.set(QUALITY[(i + 1) % QUALITY.length]); this.playtestSheet(); });
    sheet.querySelector('[data-close]').onclick = () => { sheet.hidden = true; };
  }

  copyFallback(txt) {
    const ta = document.createElement('textarea'); ta.value = txt; ta.className = 'copy-ta';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); this.betToast('已复制', 1400); } catch (e) { this.betToast('复制失败，请手动选中复制', 1800); }
    setTimeout(() => ta.remove(), 4000);
  }

  // the 大关 card: its one new idea, before its first level. Resolves true to play, false for the map.
  stageIntro(ch) {
    return new Promise(resolve => {
      const C = CHAPTERS[ch], ov = $('#ovResult');
      const prev = ch > 0 ? CHAPTERS[ch - 1] : null;
      ov.innerHTML = `<div class="stage-intro" style="--chap:${C.color};--chap-deep:${C.deep}">
        <div class="si-k">大关${C.no}</div><h2>${esc(C.name)}</h2>
        <div class="si-art">${STAGE_ART[ch]}</div>
        <p class="si-c">${esc(C.concept)}</p>
        ${prev ? `<p class="si-prev">从「${esc(prev.name)}」继续前进，新的威胁就在前方</p>` : '<p class="si-prev">左右拖动带队，别把任何一个幸存者留在尸城</p>'}
        <ol class="si-steps">${C.steps.map((t, k) => `<li><b>${ch + 1}-${k + 1}</b>${esc(t)}</li>`).join('')}</ol>
        <button class="btn btn-yellow btn-big" id="siGo" type="button">开始</button>
        ${fishUnlocked() ? '<button class="si-back" id="siBack" type="button">返回地图</button>' : ''}</div>`;
      ov.hidden = false;
      sfx('upgrade');
      const done = v => { sfx('ui'); ov.hidden = true; resolve(v); };
      ov.querySelector('#siGo').onclick = () => done(true);
      const back = ov.querySelector('#siBack'); if (back) back.onclick = () => done(false);
      ov.querySelector('#siGo').focus({ preventScroll: true });
    });
  }

  // One result card for every level, the same size from 1-1 on (峰终定律): the first screen shows the best moment
  // of the level, three numbers and the six slots (a slot whose idea has not been taught is a grey tile; the first
  // time it opens it glows); everything else — what each slot is made of, what was learnt, the near miss — lives in
  // 详情. The buttons stay at the bottom of the screen however small it is.
  // d: { win, L, ch, N, peak, kills, reason, stageDone, hasNext, reward, tip, home, coins, parts, skills, fishBtn, fishNew, peakMoment, par, release }
  lessonResult(d) { return showDebrief(this,d); }

}
// short device description for the playtest table: OS + browser, from the user agent
function deviceName() {
  const ua = navigator.userAgent;
  let os = 'other';
  const ios = ua.match(/OS (\d+)[_.](\d+)/);
  if (/iPhone|iPad/.test(ua) && ios) os = `iOS ${ios[1]}.${ios[2]}`;
  else if (/Android/.test(ua)) { const m = ua.match(/Android ([\d.]+);\s*([^;)]+)/); os = m ? `Android ${m[1]} ${m[2]}` : 'Android'; }
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  const br = /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : '';
  return `${os} ${br} · ${screen.width}×${screen.height}@${window.devicePixelRatio || 1}x`;
}

// one picture per 大关, used on the map, the 大关 card and the "next 大关" teaser
const GATE_MINI = (x, col, txt) => `<g transform="translate(${x} 18)"><rect x="0" y="0" width="34" height="34" rx="7" fill="${col}" fill-opacity=".75" stroke="#fff" stroke-width="3"/><text x="17" y="24" text-anchor="middle" font-family="Lilita One, sans-serif" font-size="17" fill="#fff" stroke="#0a2e78" stroke-width="4" paint-order="stroke">${txt}</text></g>`;
const STAGE_ART = [
  `<svg viewBox="0 0 96 64">${GATE_MINI(8, '#2f8cff', '+5')}${GATE_MINI(52, '#2f8cff', '×2')}<rect x="45" y="14" width="5" height="42" rx="2.5" fill="#ffd23f"/><circle cx="47.5" cy="14" r="4.5" fill="#fff0a0"/></svg>`,
  `<svg viewBox="0 0 96 64"><circle cx="18" cy="24" r="9" fill="#ffd2a8"/><path d="M8 22a10 10 0 0 1 20 0z" fill="#2f7df5"/><rect x="11" y="33" width="14" height="16" rx="6" fill="#3d8bff"/><path d="M34 34h14l-4-5M48 34l-4 5" stroke="#fff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="62" cy="34" r="10" fill="#ffd23f" stroke="#c46f00" stroke-width="3"/><path d="M76 34h8" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><circle cx="88" cy="34" r="6" fill="#ffd23f" stroke="#c46f00" stroke-width="2"/></svg>`,
  `<svg viewBox="0 0 96 64"><g transform="translate(4 4)"><path d="M30 12c10 0 17 7 17 17s-7 19-17 19-17-9-17-19 7-17 17-17z" fill="#8fc46a" stroke="#24361a" stroke-width="3"/><path d="M20 25l6 6M26 25l-6 6" stroke="#24361a" stroke-width="3" stroke-linecap="round"/><circle cx="38" cy="28" r="4" fill="#fff" stroke="#24361a" stroke-width="2.4"/><path d="M22 40c5 2.4 11 2.4 16 0" stroke="#24361a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M26 12l3 6 4-5" stroke="#24361a" stroke-width="2.4" fill="none"/></g><text x="76" y="24" text-anchor="middle" font-family="Lilita One, sans-serif" font-size="18" fill="#fff" stroke="#8a2a00" stroke-width="4" paint-order="stroke">×100</text></svg>`,
  `<svg viewBox="0 0 96 64">${['double', 'spread', 'pierce'].map((k, i) => `<g transform="translate(${6 + i * 30} 18) scale(1.15)"><path d="${SKILL_PATHS[k]}" fill="none" stroke="#04352f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="${SKILL_PATHS[k]}" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`).join('')}</svg>`,
  `<svg viewBox="0 0 96 64"><circle cx="20" cy="46" r="11" fill="#2f7df5"/><rect x="17" y="22" width="6" height="22" rx="3" fill="#dfe8f6"/><circle cx="76" cy="46" r="11" fill="#9a5ae0"/><rect x="73" y="22" width="6" height="22" rx="3" fill="#dfe8f6"/><g transform="translate(30 0) scale(0.62)"><path d="M30 12c10 0 17 7 17 17s-7 19-17 19-17-9-17-19 7-17 17-17z" fill="#8fc46a" stroke="#24361a" stroke-width="3"/><path d="M20 25l6 6M26 25l-6 6" stroke="#24361a" stroke-width="3" stroke-linecap="round"/><circle cx="38" cy="28" r="4" fill="#fff" stroke="#24361a" stroke-width="2.4"/><path d="M22 40c5 2.4 11 2.4 16 0" stroke="#24361a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M26 12l3 6 4-5" stroke="#24361a" stroke-width="2.4" fill="none"/></g></svg>`,
];
