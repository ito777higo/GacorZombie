import { ACTIONS, UPGRADES, newCamp, buildExpedition, settleExpedition, upgradeCamp, healAmount } from './rules.js';
import { save, persist, runtime } from '../platform/save.js';
import { LEVELS, CHAPTERS } from '../content/levels.js';
import { sfx, unlockAudio } from '../platform/audio.js';

const esc = x => String(x).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const camp = () => (save.camp ||= newCamp());
export class Campaign {
  constructor(game) {
    this.game = game;
    this.overlay = document.createElement('div'); this.overlay.id = 'campOverlay'; this.overlay.className = 'ov camp-overlay'; this.overlay.hidden = true;
    this.hud = document.createElement('div'); this.hud.className = 'exp-hud'; this.hud.hidden = true;
    this.launch = document.createElement('button'); this.launch.className = 'camp-launch'; this.launch.textContent = '⌂ 避难所'; this.launch.type = 'button';
    this.launch.onclick = () => this.shelter();
    document.getElementById('frame').append(this.overlay, this.hud, this.launch);
    this.hud.addEventListener('click', e => { if (e.target.closest('[data-medkit]')) this.heal(); });
  }
  resources() {
    const c = camp();
    return `<div class="camp-res"><span><b>${c.people}</b> 幸存者</span><span><b>${c.parts}</b> 零件</span><span><b>${c.medkits}</b> 急救包</span></div>`;
  }
  choose(i, options) {
    const g = this.game, L = LEVELS[i];
    if (!L) return false;
    const go = action => {
      const c = camp(); c.runs++;
      this.pending = { id: String(c.runs), action, code: L.code };
      this.overlay.hidden = true; runtime.pause = false; persist();
      return g.start(i, { ...options, planned: true, skipIntro: true });
    };
    if (g.bot) return go(options.action || 'rescue');
    g.teardown(); g.state = 'plan'; g.ui.hideOverlays();
    this.overlay.innerHTML = `<div class="camp-panel"><div class="camp-k">末日突围 · 行动简报</div><h2>${esc(CHAPTERS[L.ch].name)}</h2><p class="camp-lead">${esc(L.code)} ${esc(L.title)} · 这一次，先救人还是先找物资？</p>${this.resources()}<div class="exp-choices">${Object.entries(ACTIONS).map(([k,a]) => `<button type="button" data-action="${k}" style="--action:${a.color}"><i>${a.icon}</i><div><h3>${a.name}</h3><p>${a.benefit}</p><small>${a.risk}</small></div><b>出发 ›</b></button>`).join('')}</div><p class="camp-note">救出的人要活着撤离，才会加入避难所。零件用来修复围墙、医务站和无线电。</p><button type="button" class="camp-link" data-shelter>查看避难所与支援</button></div>`;
    this.overlay.hidden = false;
    this.overlay.querySelectorAll('[data-action]').forEach(b => b.onclick = () => { unlockAudio(); sfx('ui'); go(b.dataset.action); });
    this.overlay.querySelector('[data-shelter]').onclick = () => this.shelter(() => this.choose(i, options));
    return true;
  }
  configure(L) { return this.pending ? buildExpedition(L, this.pending.action, camp()) : L; }
  begin(sim, editing) {
    this.active = editing || !this.pending ? null : { ...this.pending, rescued: 0, crates: 0, usedHeal: false };
    this.pending = null; this.outcome = null;
    if (this.active && camp().level >= 1) sim.squad.shield = (sim.squad.shield || 0) + 1;
    this.update();
  }
  hideHud() { this.hud.hidden = true; }
  event(k, d) {
    const a = this.active;
    if (!a || k !== 'barrel' || !d.r || d.r.vault) return;
    const r = d.r;
    if (r.kind === 'cage') { a.rescued += r.v * this.game.sim.army; this.game.ui.banner(`救出 ${r.v * this.game.sim.army} 名幸存者`, 'gold', '护送他们到撤离点', 1.4); }
    else if (r.kind === 'coin' || r.kind === 'men' || r.kind === 'heal') a.crates++;
  }
  heal() {
    const g = this.game, a = this.active, c = camp(), sim = g.sim;
    if (!a || a.usedHeal || !sim || g.state !== 'run' || !['run','arrive','boss','extract'].includes(sim.phase) || sim.squad.N <= 0) return false;
    const amount = healAmount(sim), free = c.level >= 2;
    if (!amount || (!free && !c.medkits)) { g.ui.betToast('有队员受伤后才能急救', 1300); return false; }
    if (!free) c.medkits--;
    a.usedHeal = true; sim.healed = (sim.healed || 0) + amount; sim.setN(sim.squad.N + amount, 'heal');
    persist(); sfx('upgrade'); g.ui.banner('医疗支援抵达', 'gold', `${amount} 名伤员归队 · 本次急救已使用`, 1.6); this.update();
    return true;
  }
  finish(win) {
    const a = this.active, g = this.game;
    if (!a) return null;
    const result = settleExpedition(camp(), { runId: a.id, action: a.action, rescued: a.rescued, crates: a.crates, extracted: g.homeN(win), kills: g.sim.stats.kills, win });
    this.active = null; this.hud.hidden = true; this.outcome = result; persist();
    return result;
  }
  update() {
    const g = this.game, a = this.active;
    const show = !!a && ['intro','run','load','bonus','magic','wheel'].includes(g.state);
    this.hud.hidden = !show;
    this.launch.hidden = !['idle','plan','stage','result','run','intro'].includes(g.state);
    if (!show) return;
    const c = camp(), html = `<div><small>${ACTIONS[a.action].name} · 护送到撤离点</small><b>已救出 ${a.rescued} 人 <em>物资箱 ${a.crates}</em></b></div><button type="button" data-medkit ${a.usedHeal || (!c.medkits && c.level < 2) ? 'disabled' : ''}>${a.usedHeal ? '急救已用' : c.level >= 2 ? '医务站急救' : `急救 ×${c.medkits}`}</button>`;
    if (this.hud.innerHTML !== html) this.hud.innerHTML = html;
  }
  shelter(back = null) {
    const g = this.game, was = runtime.pause;
    runtime.pause = true;
    const render = () => {
      const c = camp(), next = UPGRADES[c.level], ready = next && c.parts >= next.parts && c.people >= next.people;
      this.overlay.innerHTML = `<div class="camp-panel shelter-panel"><div class="camp-k">避难所 · 第 ${c.runs} 次行动后</div><h2>让活下来的人有家可回</h2><p class="camp-lead">修好三个设施，为下一次突围争取更多机会。</p>${this.resources()}<div class="shelter-buildings">${UPGRADES.map((u,i) => `<div class="${i<c.level?'built':''}"><span>${['▥','✚','⌁'][i]}</span><h3>${u.name}</h3><p>${u.effect}</p><small>${i<c.level?'已修复':`${u.parts} 零件 · 需要 ${u.people} 名幸存者`}</small></div>`).join('')}</div>${next ? `<button class="btn btn-yellow" type="button" id="campUpgrade" ${ready?'':'disabled'}>修复${next.name} · ${next.parts} 零件</button><p class="camp-note">${ready?'人员已到位，可以施工。':`还需 ${Math.max(0,next.parts-c.parts)} 零件、${Math.max(0,next.people-c.people)} 名幸存者`}</p>` : '<p class="camp-note">无线电已修复！避难所准备好接应更多幸存者。</p>'}<button class="btn btn-dark" type="button" id="campBack">${back?'返回行动选择':'继续当前进程'}</button></div>`;
      this.overlay.hidden = false;
      this.overlay.querySelector('#campUpgrade')?.addEventListener('click', () => { if (upgradeCamp(c)) { persist(); sfx('upgrade'); render(); } });
      this.overlay.querySelector('#campBack').onclick = () => { this.overlay.hidden = true; runtime.pause = was; if(back) back(); };
    };
    render();
  }
}
