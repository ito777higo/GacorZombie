// Level flow: Game.start builds a RunSim (logic), a RunView (drawing) and the road; onRun() turns the sim's events into
// coins, sound, camera and UI. One level: intro → run (gates, hordes, barrels) → boss → 结尾惊喜 (彩虹滚轮, 金砖墙,
// 黄金机甲, 金蝠来袭, 打爆桶, 砸金蛋, 黄金尸池, 结尾转盘) → 撤离点 → result (finishLesson). Also 末日战场, the 二人捕鱼
// stand-in (startFishing; "fish" in code = its targets), and the 宝箱怪 (FISH.magic, boss model magician).
// The autopilot (botSteer) plays for the 自动验关 and the regression runs.
import * as THREE from './view/three.js';
import { Journey } from './journey/controller.js';
import { beginExtraction, extractionReward } from './sim/extraction.js';
import { ExtractionView } from './view/extractionview.js';
import { CHAPTERS, LEVELS, SHOT, WHEEL, BONUS_WHEEL, FISHING, FISH_AFTER, LOBBY_LV_CH4, SURPRISES, ITEMS, levelAt, stageLevels } from './content/levels.js';
import { Tutor } from './ui/tutorial.js';
import { ptEvent, ptPerf } from './platform/playtest.js';
import { RunSim, SKILLS, opLabel, squadRadius } from './sim/runsim.js';
import { RunView } from './view/runview.js';
import { prepareCast, castFor } from './view/cast.js';
import { bridge } from './platform/bridge.js';
import { FishSim } from './sim/fishsim.js';
import { BonusSim, DRAGON_WHEEL, cannonTier } from './sim/bonussim.js';
import { magicIntro, magicFlip, magicResult } from './ui/magicui.js';
import { SPECIALS, chestValues, lionFinal, LION_STEPS, ingotValues } from './content/specials.js';
import { targetCard } from './view/cast.js';

// 宝箱怪 (the flip-card boss, model magician) in the runner: the 炮倍 its cards pay at (1 兵 = 100, so ×1 = 10 个兵)
const MAGIC_CANNON = 500;       // the run's base bet (STAKE); the fishing room's magician pays at the room's 炮倍
// 撤离点 (TUNE.exchange): the one exchange rate of the whole game (1 兵 = 100); a great run gets at most
// TUNE.perfMax × its script
export const lab = () => (save.lab ||= {});
import { FishView } from './view/fishview.js';
import { visCount, setTruckHole } from './sim/formation.js';
import { save, persist, fishUnlocked } from './platform/save.js';
import { sfx, music } from './platform/audio.js';
import { fmt, kmb, clamp, damp, easeInOut } from './sim/util.js';
import { weighted } from './view/random.js';
import { randomSeed } from './sim/rng.js';
import { steer } from './sim/bot.js';
import { TUNE } from './content/tune.js';

const V3 = () => new THREE.Vector3();
// finales the squad runs through (soldiers are spent, nobody shoots, no 撤离点 after): 彩虹滚轮, 金砖墙
const RUN_FIN = new Set(['rainbow', 'bricks']);
const FISH_NAME = f => (f && f.F ? f.F.name : '');
const short = kmb;

// weapon tiers shown on the squad (each 换枪 barrel steps up one)
const GUN_NAMES = ['步枪', '冲锋枪', '机枪', '金枪', '黄金重机枪'];

export class Game {
  constructor(world, fx, ui) {
    this.world = world; this.fx = fx; this.ui = ui;
    this.state = 'idle';
    this.timeScale = 1; this.slow = 0;
    this.cam = { pos: V3(), look: V3() };
    this.camT = { pos: V3(), look: V3() };
    this.tw = null;
    this.waits = [];
    this.level = -1;
    this.zoom = 1;
    this.coinCombo = 0; this.coinComboT = 0;
    this.shotSfx = 0;
    this.tutor = new Tutor(this, world);
    this.onTeach = () => { this.ui.hideBanner(); this.ui.callout(null); this.ui.dragHint(false); };
    this.campaign = new Journey(this);
  }

  after(sec, fn) { this.waits.push({ t: sec, fn }); }

  // ---------------------------------------------------------------- setup / teardown
  teardown() {
    this.evacView?.dispose();this.evacView=null;
    this.campaign?.hideHud();
    const pr = this.perf?.end(); if (pr) ptPerf(pr);
    this.runView?.dispose(); this.runView = null;
    this.fishView?.dispose(); this.fishView = null;
    this.sim = null; this.fsim = null; this.bsim = null;
    this.fx.clear();
    this.ui.labels.clear();
    this.ui.flushPending();
    this.ui.bossBar(false); this.ui.session(false); this.ui.fishBar(false); this.ui.progress(false);
    this.ui.homeCounter(false); this.ui.bonusHud(false); this.ui.skills(null); this.ui.dragHint(false); this.ui.broke(false);
    this.ui.callout(null); this.ui.teach(null); this.ui.prompt(null); this.ui.hideBanner();
    this.ui.foes(false); this.ui.finaleHud(false); this.fin = null; this.load = null;
    this.waits.length = 0; this.tw = null; this.camHold = false; this.timeScale = 1; this.slow = 0; this.zoom = 1;
    this.tutor.clear();
    document.querySelector('#chapterCard').hidden=true;
    document.querySelector('#hud').dataset.mode = 'menu';
  }

  // The first level of a 大关 opens with the 大关 card that names its one new idea.
  // 调参台: o.level plays a level config that is not one of the 13 (i = -1), and o.edit = { from, startN, skills }
  // starts it at item `from` of its script with that squad and those skills (the teaching steps are left out then)
  start(i, o = {}) {
    if (!o.edit && !o.planned) return this.campaign.choose(i, o);
    const { L, scale } = o.level ? { L: o.level, scale: 1 } : levelAt(i);
    const first = stageLevels(L.ch)[0] === i;
    if (first && !o.skipIntro) {
      prepareCast(L.ch);
      this.teardown(); this.state = 'stage';
      this.ui.stageIntro(L.ch).then(go => (go ? this.start(i, { ...o, skipIntro: true }) : this.onMap?.()));
      return true;
    }
    // wait for this 大关's models the first time (they keep loading during the 大关 card)
    if (!castFor(L.ch)) {
      this.teardown(); this.state = 'loading';
      this.ui.loading(true, '加载模型');
      prepareCast(L.ch).then(() => { this.ui.loading(false); if (this.state === 'loading') this.start(i, { ...o, skipIntro: true }); });
      return true;
    }
    this.teardown();
    let LL = L;
    const sc = scale;
    // 实验室 宝箱怪战场关: no 宝箱怪 boss; the soldiers go through the 撤离点 and the coins shoot the 宝箱怪
    // in a 末日战场 round at 二人捕鱼's odds (startMagicHunt)
    if (lab().magicCoin && L.magic) LL = { ...L, finale: { after: 'exchange', hunt: true } };
    const ed = o.edit;
    if (!ed) LL = this.campaign.configure(LL);
    if (ed && (ed.from > 0 || ed.startN)) LL = { ...LL, run: { ...LL.run, seq: LL.run.seq.slice(ed.from || 0), startAbs: ed.startN || undefined }, teach: ed.from > 0 ? [] : LL.teach };
    this.editRun = !!ed; this.lastStart = { i, o };
    this.level = i; this.L = LL;
    music('run');
    const C = CHAPTERS[L.ch];
    this.R = { soldiers: 0, road: 0, lucky: 0, bonus: 0, dragon: 0, dragonMult: 0, rain: 0, wheel: null, peak: 0, low: 0, kills: 0, killN: 0, boss: 0, bossMult: 0, fin: 0, finType: '', finUnits: 0, special: 0, specials: [] };
    this.killTick = { coins: 0, n: 0, x: 0, z: 0, t: 0 };
    this.walletStart = save.wallet;
    this.seen = {};
    // the formation leaves a gap for the heroes' pickup when they ride it
    // the formation leaves a gap at the back for the heroes' pickup (a rule of the hero mode, not of what loaded)
    setTruckHole((save.heroMode || 'truck') === 'truck');
    const sim = this.sim = new RunSim(LL, (k, d) => this.onRun(k, d), sc, { seed: randomSeed() });
    for (const k of (ed && ed.skills) || []) sim.squad.skills[k] = true;
    sim.squad.R = squadRadius(sim.squad.N); sim.stats.peak = sim.squad.N;
    this.logStart(L);
    this.perf?.begin(L.code);
    this.runT0 = Date.now();
    bridge.track('level_start', { code: L.code, ch: L.ch });
    this.world.buildLevel(C.theme, sim.length, sim.platZ,{journey:sim});
    this.runView = new RunView(this.world, this.fx, sim);
    this.campaign.begin(sim, !!ed);
    this.runView.heroMode = save.heroMode || 'truck';
    this.runView.par = lab().par && L.ch >= 1 ? L.par || 0 : 0;
    this.runView.coinRate = 0; // People stay people; rewards are counted after evacuation.
    this.world.applyEnv();
    this.world.runPose(0, this.cam);
    this.world.setCamera(this.cam.pos, this.cam.look);
    this.ui.setLevel(i, L);
    this.ui.showWallet(false);
    this.ui.skills(ed && ed.skills && ed.skills.length ? { ...sim.squad.skills } : {});
    this.ui.progress(true, 0, 'skull');
    this.ui.chapterCard(i, L);
    this.tutor.reset(L);
    const teachesDrag = (L.teach || []).some(t => t.at === 'start');
    this.ui.dragHint(!save.dragged && !teachesDrag);
    this.dragged = save.dragged;
    this.state = 'intro';
    this.after(1.1, () => { this.state = 'run'; sim.start(); sfx('whoosh'); });
    persist();
    return true;
  }

  // playtest log: a start right after losing the same level counts as an instant retry
  logStart(L) {
    const lf = this.lastFail;
    if (lf && lf.code === L.code && Date.now() - lf.t < 20000) ptEvent(L.code, 'retry');
    this.lastFail = null;
    ptEvent(L.code, 'start');
  }

  // items from the result screens are spent in 末日战场
  useItem(k) {
    const f = this.fsim;
    if (!f || this.state !== 'fishing' || !(save.items && save.items[k] > 0)) return;
    if (k === 'torpedo' && !f.torpedo()) return;
    save.items[k]--; persist();
    bridge.track('item_use', { item: k });
    if (k === 'bullet') { f.freeShots += 50; this.ui.banner('免费子弹卡', 'gold', '接下来 50 发不花金币', 1.2); }
    else if (k === 'lock') { f.lockT = 20; this.ui.banner('锁定卡', 'blue', '20 秒内锁定的僵尸更容易打中', 1.2); }
    else this.ui.banner('导弹', 'gold', '必中最大的那只', 1.0);
    sfx('upgrade');
    this.ui.items(f);
  }

  startExtraction() {
    if(!beginExtraction(this.sim))return;
    this.tutor.clear();this.ui.hideBanner();this.ui.callout(null);this.ui.dragHint(false);
    this.ui.progress(false);this.ui.bossBar(false);this.ui.foes(false);
    document.querySelector('#chapterCard').hidden=true;
    this.runView.addBarrels(this.sim.barrels);
    if(this.runView.bossMound)this.runView.bossMound.visible=false;
    this.evacView=new ExtractionView(this.world,this.sim);
    this.state='run';sfx('whoosh');
  }

  // ---------------------------------------------------------------- coins
  // coins picked up on the run, counted as road coins or 幸运 drops
  runCoins(base, x, y, z, n, kind = 'road') {
    const amt = Math.round(base);
    save.wallet += amt;
    if (kind === 'lucky') this.R.lucky += amt; else this.R.road += amt;
    // Count recovered value quietly; the debrief reveals the payout.
    return amt;
  }

  // 打怪按捕鱼规则赔: a monster that dies pays its multiple × 炮倍. Small ones are summed for a moment so the screen
  // shows one "+6K" per burst of kills instead of a number per zombie; elites and mini-bosses get their own.
  payKill(z) {
    const amt=Math.round(z.m*this.L.stake);
    save.wallet+=amt;this.R.kills+=amt;this.R.killN++;
    return amt;
  }
  flushKills(dt) {
    const K = this.killTick;
    K.t -= dt;
    if (K.t > 0 || !K.n) return;
    K.t = 0.28;
    const x = K.x / K.n, z = K.z / K.n;
    this.ui.coinsFlyWorld(K.coins, x, 1.2, z, Math.min(4, K.n));
    this.ui.floatWorld(`+${kmb(K.coins)}`, 'ft-kill', x, 2.3, z, { life: 0.75, vy: -55, pop: 1.2 });
    if (K.n >= 3) sfx('coin', Math.min(12, K.n));
    K.coins = 0; K.n = 0; K.x = 0; K.z = 0;
  }
  // a finale's units become coins at its chip
  // 峰终: the single biggest payout of the level, shown first on the result card
  peak(label, amt, mult = 0) { const R = this.R; if (R && amt > ((R.peakM && R.peakM.amt) || 0)) R.peakM = { label, amt: Math.round(amt), mult }; }
  payFinale(units, x, y, z, n = 2, quiet = false) {
    const F = this.fin;
    if (!F || !(units > 0)) return 0;
    const amt = Math.round(units * F.chip);
    save.wallet += amt; this.R.fin += amt; this.R.finUnits += units; F.paid += amt;
    if (!quiet) this.ui.coinsFlyWorld(amt, x, y, z, n);
    else { F.quiet = (F.quiet || 0) + amt; }
    return amt;
  }

  // ---------------------------------------------------------------- 结尾惊喜
  // The 3-2 结尾转盘: one spin decides the finale (一星剧本 lands on the level's `pick`; the lab can make it live).
  async pickSurprise() {
    const keys = ['rainbow', 'bricks', 'goldmob', 'fishleap', 'vault', 'egg', 'bonus'];
    const scripted = !lab().pickLive && this.L.finale.pick;
    const k = scripted || keys[Math.floor(Math.random() * keys.length)];
    const sim = this.sim;
    this.state = 'wheel';
    await this.wait(0.6);
    if (this.sim !== sim) return;
    if (!save.seen.pickWheel) { save.seen.pickWheel = 1; persist(); this.ui.callout('<b>结尾转盘</b>：转到哪个结尾，就玩哪个<small>彩虹滚轮、金砖墙、黄金机甲、金蝠、桶阵、金蛋、黄金尸池</small>', 3600); await this.wait(1.0); }
    await this.ui.wheel({ title: '结尾转盘', sub: scripted ? '一星剧本' : '真随机', segments: keys.map(q => ({ label: SURPRISES[q].name })), result: keys.indexOf(k) });
    if (this.sim !== sim) return;
    this.state = 'run';
    this.R.picked = k;
    if (k === 'bonus') { this.L = { ...this.L, bonus: { wheel: false, dragon: 'always' } }; this.startLoad(); }
    else this.startSurprise(k);
  }

  startSurprise(type) {
    const sim = this.sim, s = sim.squad, L = this.L, N = s.N, R = this.R;
    if (N <= 0) { this.finish(true); return; }
    const mult = R.ladder || 1;
    const parN = Math.max(20, L.parN || (L.par ? L.par / mult : N));
    sim.startFinale(type, { parN, div: L.finale.rbDiv });
    const F = sim.fin;
    // 一星剧本: the finale is priced so the level lands on its script × how the run went (as the pool was)
    const scripted = L.coins;
    const perf = scripted ? clamp(0.3 + 0.7 * (N * mult) / (L.par || N * mult || 1), TUNE.perfMin, TUNE.perfMax) : 1;
    const paid = R.kills + R.boss + R.road + R.lucky;
    const exch = RUN_FIN.has(type) ? 0 : N * TUNE.exchange;
    const want = scripted ? Math.max(0, L.coins * perf - paid - exch) : 0;
    const U = this.expectedUnits(F, N);
    let chip = scripted ? want / Math.max(1, U) : (L.stake || TUNE.stake) * 0.5;
    // the 彩虹滚轮 / 金砖墙 pay the soldiers at least what the 撤离点 would (100 each, on average over the rows)
    chip = Math.max(RUN_FIN.has(type) ? TUNE.exchange * N / Math.max(1, U) : TUNE.chipFloor, chip);
    chip = chip >= 1000 ? Math.round(chip / 100) * 100 : Math.round(chip / 10) * 10;
    this.fin = { type, F, chip, chip0: chip, want, paid: 0, perf, U, adj: 0, t0: 0 };
    R.finType = type; R.perf = perf; R.plan = want; R.finChip = chip; R.finSoldiers = N;
    if (RUN_FIN.has(type)) this.runView.hideLabel = true;      // the finale HUD counts the soldiers; the label would cover the rows
    this.runView.finale.chip = chip;
    const S = SURPRISES[type];
    this.ui.progress(false); this.ui.foes(false); this.ui.bossBar(false);
    this.tutor.clear(); this.ui.hideBanner();
    this.ui.banner(S.name, 'gold', S.sub, 1.6);
    sfx('upgrade');
    const tip = { rainbow: '兵越多跑得越远，越后面的格子倍数越大', bricks: '一个兵撞碎一块金砖，越往里的金砖越值钱', goldmob: '左右拖动对准它，8 秒内打倒全部 ×2', fishleap: '左右拖动对准金蝠，倍数大的先打', vault: '左右拖动换一列打，最后一排是金桶', egg: '一直打，每一下都喷金币' }[type];
    this.after(1.4, () => this.ui.betToast(`<b>${S.name}</b> · ${tip}`, 2600));
    if (this.bot) this.botFin = { t: 0 };
  }
  // how many units the finale should pay for this squad, used to price its chip
  expectedUnits(F, N) {
    const sim = this.sim;
    if (F.gaps) {
      let left = N, u = 0;
      for (const g of F.gaps) { const n = Math.min(left, g.cap); u += n * g.m; left -= n; if (left <= 0) break; }
      return u;
    }
    const dpsN = sim.dps(N) * 0.85;
    if (F.type === 'goldmob' || F.type === 'egg') {
      const b = sim.boss, dmg = Math.min(b.maxhp, dpsN * F.dur);
      return F.type === 'egg' ? b.maxhp * F.upd * 3 : dmg >= b.maxhp ? 2 * b.maxhp * F.upd : dmg * F.upd;
    }
    const k = clamp(Math.sqrt(dpsN / sim.dps(F.parN)), 0.35, 1.3);
    if (F.type === 'fishleap') return F.plan.reduce((a, p) => a + p.m, 0) * clamp(0.62 * k, 0.25, 0.95);
    if (F.type === 'vault') return sim.barrels.filter(r => r.vault).reduce((a, r) => a + r.m, 0) * clamp(0.6 * k, 0.25, 1);
    return 1;
  }
  async onEggBreak2(d) {
    const ui = this.ui, F = this.fin;
    this.runView.finale?.onEggBreak();
    sfx('boom'); this.world.shake = 0.8; this.slowmo(0.6, 0.2);
    F.hold = true;
    await this.wait(0.9);
    const T = [{ m: 2, w: 40 }, { m: 3, w: 28 }, { m: 5, w: 18 }, { m: 10, w: 10 }, { m: 20, w: 4 }];
    const m = this.L.coins ? 3 : weighted(T).m;
    const base = Math.round(d.units * F.chip);
    if (this.fin !== F) return;
    await ui.wheel({ title: '金蛋开倍', sub: `整颗金蛋的 ${fmt(base)} 金币再乘一次`, segments: T.map(t => ({ label: '×' + t.m })), result: T.findIndex(t => t.m === m) });
    if (this.fin !== F) return;
    const extra = Math.round(base * (m - 1));
    save.wallet += extra; this.R.fin += extra; this.R.eggMult = m; F.paid += extra;
    this.peak(`金蛋开倍 ×${m}`, base * m, m);
    await ui.bigWin({ tier: m >= 10 ? 2 : m >= 5 ? 1 : 0, label: '金蛋 ×' + m, mult: 0, amount: base * m, sub: `${fmt(base)} × ${m}` });
    ui.coinsFly(extra, this.world.w / 2, this.world.h * 0.45, 22);
    persist();
    F.hold = false;
  }
  onFinaleOver(d) {
    const F = d.fin, ui = this.ui;
    ui.finaleHud(false);
    if (F.type === 'goldmob' && d.reason === 'flee') { this.runView.finale?.onGoldFlee(); ui.banner('黄金机甲跑了', 'blue', '没打倒就不 ×2', 1.2); }
    else if (d.reason === 'time') ui.banner('时间到', 'gold', '', 0.9);
    else if (F.type === 'vault' && d.reason === 'all') ui.banner('全部打爆！', 'gold', '', 1.0);
    if (RUN_FIN.has(F.type) && this.fin.F.quiet) {
      const amt = this.fin.F.quiet; this.fin.F.quiet = 0;
      ui.coinsFly(amt, this.world.w / 2, this.world.h * 0.5, 18);
    }
    const total = this.R.fin;
    this.peak(SURPRISES[F.type].name, total);
    this.after(0.4, () => ui.floatWorld(`${SURPRISES[F.type].name} +${kmb(total)}`, 'ft-boom ft-gate', 0, 4, this.sim.squad.z - 6, { life: 1.6, vy: -30, pop: 1.6 }));
    persist();
  }

  // after a finale: the survivors run through the 撤离点 (1 兵 = 100) and the level ends; no pool
  startExchange() {
    if (this.state !== 'run') return;
    this.state = 'load';
    const sim = this.sim, s = sim.squad, N = s.N;
    sim.bullets.length = 0;
    this.ui.finaleHud(false); this.ui.foes(false); this.ui.bossBar(false); this.ui.progress(false);
    if (N <= 0) { this.finish(true); return; }
    this.R.soldiers = N; this.R.shots = 0; this.R.peak = sim.stats.peak; this.R.low = sim.stats.low;
    this.R.exchange = N * TUNE.exchange;
    this.R.peakX = { label: `撤离点 ${fmt(N)} 个兵`, amt: this.R.exchange };
    this.runView.hideLabel = true;
    const gz = s.z - s.R - 2.2;
    this.runView.showExchangeGate(gz);
    this.runView.jumpArc = 0.35;
    this.runView.setLoadTarget({ x: s.x, y: 0, z: gz - 0.6 });
    this.runView.onJumperArrive = (x, z) => { if (Math.random() < 0.5) this.fx.coinBurst(x, 1.2, z, 2, 0.5, { floor: 0.05, life: 0.2 }); };
    this.load = { t: -0.5, N, shots: 0, mult: 1, vis: this.runView.vis, launched: 0, only: true };
    this.ui.hideBanner(); this.ui.dragHint(false);
    this.ui.homeCounter(true, N, 0, 0, 1, 0);
    sfx('upgrade');
    this.camT.pos.set(0, 15, s.z + 9.5); this.camT.look.set(0, 0.5, gz - 6.5);
  }

  // ---------------------------------------------------------------- runner events
  onRun(k, d) {
    if(k.startsWith('extraction')){
      if(k==='extractionWarning')sfx('boss');
      if(k==='extractionImpact'){
        if(d.shield){this.ui.betToast('护盾挡住扑击，继续撤离',1000);}
        else if(d.hit){this.ui.hurtFlash();this.world.shake=.4;sfx('hurt');}
        else this.ui.betToast('避开扑击，继续守住撤离区',1000);
      }
      if(k==='extractionEnd'){
        const reward=extractionReward(this.L,d.extraction);
        this.R.extraction={...d.extraction,reward};this.R.soldiers=this.sim.squad.N;
        this.R.exchange=reward.survivors;this.R.fin=reward.mission+reward.cargo;this.R.finType='evac';
        save.wallet+=reward.total;
        this.ui.banner('接应车已到','blue','全员撤离，清点带回的物资',1.2);
        this.after(.8,()=>this.finish(true));
      }
      return;
    }
    this.campaign.event(k, d);
    const ui = this.ui, v = this.runView, s = this.sim?.squad;
    switch (k) {
      case 'gate': this.onGate(d); break;
      case 'gateCycle': v.redrawGate(d.g); if (d.g.z > s.z - 30 && d.g.z < s.z) sfx('tick'); break;
      case 'skill': {
        const S = SKILLS[d.k];
        if (d.from === 'gift' && this.L.gift) {
          // 大关四: the level's skill is handed over at the start, with what it is for
          ui.skills(this.sim.squad.skills, d.k);
          this.after(0.3, () => this.tutor.say(this.L.gift.text, this.L.gift.sub, 3.0));
          sfx('upgrade');
          break;
        }
        ui.skills(this.sim.squad.skills, d.k);
        ui.floatWorld(S.name, 'ft-skill', s.x, 3.4, s.z - 1, { life: 1.3, vy: -40, pop: 1.6 });
        // 大关四: the level's skill is picked up half-way, after its lack has been felt
        if (this.L.gift && d.k === this.L.gift.k) { this.after(0.3, () => this.tutor.say(this.L.gift.text, this.L.gift.sub, 3.0)); this.slowmo(0.5, 0.35); }
        this.fx.ring(s.x, 0.5, s.z, 8, [0.3, 1, 0.9], 0.6);
        this.fx.spark(s.x, 1.5, s.z, 24, [0.4, 1, 0.9], 8, 0.6);
        sfx('upgrade');
        if (!save.seen['skill_' + d.k]) {
          save.seen['skill_' + d.k] = 1; persist();
          ui.callout(`<b>${S.name}</b> ${S.desc}<small>这件武器会一直用到撤离结束</small>`, 3000);
        }
        break;
      }
      case 'skillDup': ui.floatWorld(`已有${SKILLS[d.k].name} · +20 兵`, 'ft-good', s.x, 3.0, s.z - 1, { life: 1.1, vy: -40 }); break;
      case 'drop':
        v.onDrop(d.n);
        ui.banner('兵雨！', 'blue', `空投 +${d.n} 兵`, 1.3);
        sfx('whoosh');
        break;
      case 'splitIn':
        if (!this.seen.split) { this.seen.split = 1; ui.banner('分道', 'red', '选了这边就不能换', 1.2); }
        break;
      case 'count':
        v.onCount(d);
        if (d.after > d.before && d.cause !== 'gate') sfx('pop', 4);
        if (d.cause === 'drop') { ui.floatWorld(`+${d.after - d.before}`, 'ft-good', s.x, 2.8, s.z - 1, { life: 1.1, vy: -45, pop: 1.5 }); this.fx.ring(s.x, 0.4, s.z, 8, [0.5, 0.8, 1], 0.5); }
        break;
      case 'bigLoss':
        ui.hurtFlash();
        this.world.shake = Math.max(this.world.shake, 0.4);
        ui.floatWorld(`−${fmt(d.drop)} 兵`, 'ft-loss', s.x, 3.2, s.z - s.R - 1, { life: 1.3, vy: -35, pop: 1.4 });
        break;
      case 'dip':
        if (this.tutor.cur) break;
        if (!this.seen.dip) {
          // only point at a gate when there is still one ahead that adds or multiplies
          this.seen.dip = 1;
          const ahead = this.sim.gates.filter(g => !g.used && g.z < s.z - 2).flatMap(g => g.ops);
          const sub = ahead.some(o => o.op === 'x') ? '别慌，前面还有 × 门能翻回来' : ahead.some(o => o.op === '+' && o.v > 0) ? '别慌，前面还有加兵的门' : '护住剩下的兵，躲开下一波';
          ui.banner('队伍被打残了', 'red', sub, 1.5);
        }
        break;
      case 'comeback':
        ui.banner('绝地反击！', 'gold', `${fmt(d.from)} → ${fmt(d.to)}`, 1.6);
        sfx('upgrade');
        this.fx.ring(s.x, 0.5, s.z, 9, [1, 0.85, 0.35], 0.6);
        break;
      case 'trap':
        v.onTrap(d.h, d.positions);
        if (d.shield) break;            // the shield takes it (shieldPop says so)
        sfx('hurt'); if (d.h.kind === 'saw' || d.h.kind === 'roller') sfx('crack');
        this.world.shake = Math.max(this.world.shake, 0.25);
        if (!this.seen['trap' + d.h.kind]) {
          this.seen['trap' + d.h.kind] = 1;
          const name = { roller: '尖刺滚筒', saw: '电锯', hole: '路面破洞', wave: '毒液' }[d.h.kind];
          ui.banner(name, 'red', '走空的那一边', 1.1);
        }
        break;
      case 'coinPick': {
        v.onCoinPick(d.c);
        const amt = this.runCoins(d.c.v, d.c.x, 0.9, d.c.z, 1);
        this.coinCombo = this.coinComboT > 0 ? this.coinCombo + 1 : 1; this.coinComboT = 0.5;
        if (this.coinCombo % 4 === 0) ui.coinText(amt * 4, d.c.x, 1.4, d.c.z, false);
        sfx('coin', this.coinCombo);
        break;
      }
      case 'luckyCoin': {
        v.onLucky(d.x, d.z, d.mult);
        const amt = this.runCoins(d.coins, d.x, 1, d.z, d.mult >= 3 ? 4 : 1, 'lucky');
        if (d.mult > 1) {
          ui.floatWorld(`幸运 ×${d.mult}`, 'ft-mult', d.x, 2.6, d.z, { life: 0.9, vy: -40, pop: 1.4, scale: d.mult >= 3 ? 1 : 0.75 });
          ui.coinText(amt, d.x, 1.6, d.z, d.mult >= 3);
          sfx('catch', d.mult * 3);
        } else if (Math.random() < 0.3) sfx('coin', 2);
        break;
      }
      case 'ambush':
        v.onAmbush(d.z);
        if (!this.seen.ambush) { this.seen.ambush = 1; ui.banner('伏击！', 'red top', '两边冲出来了', 1.0); sfx('whoosh'); }
        break;
      case 'mbIn': ui.banner('重型感染体挡路', 'red top', '集中火力，别让它冲散队伍', 1.4); sfx('boss'); this.world.shake = 0.4; break;
      case 'waveIn':
        // the first wave of a level and the waves with an elite are announced, with what they are worth (怪 pay like targets)
        if((d.first||d.elite)&&!this.tutor.cur)ui.banner(d.elite?'重型感染体接近':'前方发现尸潮','red top','保持火力，守住队列',1.1);
        break;
      case 'mbSmash':
        v.onSmash(d.z); sfx('boom'); this.world.shake = 0.9;
        if (!d.shield) ui.banner(`被${d.z.name}冲散了`, 'red', `−${fmt(d.n)} 兵`, 1.4);
        break;
      case 'zhit':
        v.onZombieHit(d.z);
        ui.floatWorld('−' + d.z.power, 'ft-hurt', s.x + (Math.random() - 0.5) * 2, 1.8, s.z - s.R * 0.5, { life: 0.7 });
        sfx('hurt');
        this.world.shake = Math.max(this.world.shake, d.z.brute ? 0.35 : 0.12);
        break;
      case 'zdie':
        v.onZombieDie(d.z, d.boom); sfx('zdie');
        if (d.z.m) {
          this.payKill(d.z);
          // the first paying kill of the game: 怪 pay like the targets of 末日战场, said once with the real numbers
          if (!save.seen.kills) { save.seen.kills=1;persist();this.tutor.say('清掉追兵，保持队形','救援酬金在战后统一清点',2.5); }
        }
        if (d.z.mb) { ui.banner('重型感染体已清除', 'blue', '队伍继续前进', 1.0); sfx('boom'); this.world.shake = 0.5; }
        break;
      case 'zdmg':
        if (d.z.brute && !d.z.mb && Math.random() < 0.25) ui.floatWorld(fmt(d.d), 'ft-dmg', d.z.x + (Math.random() - 0.5), 3.2, d.z.z, { life: 0.5, vy: -40 });
        sfx('hit');
        break;
      case 'gateHit': v.onGateHit(d.g, d.side); sfx('hit'); break;
      case 'bdmg': sfx('hit'); break;
      case 'barrel': {
        const r = d.r;
        v.onBarrel(r); sfx(r.kind === 'cage' ? 'upgrade' : 'barrel');
        if (r.vault) break;
        if ((r.kind === 'coin' || r.kind === 'fish') && r.m && this.L.stake) {
          // a target card on the lid (怪牌) pays like an elite, a coin stack its multiple, both × 炮倍
          const amt = this.runCoins(r.m * this.L.stake, r.x, 1.8, r.z, 8);
          ui.floatWorld('补给已回收', 'ft-good', r.x, 3.2, r.z, { life: 1.1, vy: -35 });
        } else if (r.kind === 'coin') {
          const amt = this.runCoins(r.v, r.x, 1.5, r.z, 8);
          ui.floatWorld('补给已回收', 'ft-good', r.x, 2.4, r.z, { life: 1.1, vy: -35 });
        } else if (r.kind === 'men') {
          // Top Lords: a burst of +1 over the squad as the barrel's soldiers join
          const n = r.v * (this.sim.army || 1);
          ui.floatWorld(`+${fmt(n)} 兵`, 'ft-good', s.x, 3.0, s.z - 1, { life: 1.1, vy: -45, pop: 1.4 });
          for (let i = 0; i < Math.min(6, n); i++) this.after(0.08 * i, () => ui.floatWorld('+1', 'ft-plus1', s.x + (Math.random() - 0.5) * s.R * 2, 1.6 + Math.random(), s.z + (Math.random() - 0.5) * s.R, { life: 0.7, vy: -60 }));
        } else if (r.kind !== 'skill') {
          const gunName = GUN_NAMES[Math.min(GUN_NAMES.length - 1, (v.gunBase || 0) + this.sim.squad.tier)];
          const txt = { cage: `救出 ${r.v} 个兵`, gun: `<i class="ft-ico rifle"></i>UP · 换枪：${gunName}`, rate: '<i class="ft-ico ammo"></i>射速提升',
            shield: '<i class="ft-ico shield"></i>护盾：挡下一次重击', heal: `<i class="ft-ico heal"></i>治疗 +${fmt(r.healN || 0)} 兵` }[r.kind];
          ui.floatWorld(txt, 'ft-good', r.roll ? s.x : r.x, 2.4, r.roll ? s.z - 1 : r.z, { html: true, life: 1.2, vy: -45, pop: 1.3 });
          if (r.kind === 'shield' || r.kind === 'heal') sfx('upgrade');
        }
        // a rolling barrel the squad broke in time
        if (r.pair && this.sim.barrels.every(q => q.pair !== r.pair || !q.alive) && !this.seen.rollBoth) {
          this.seen.rollBoth = 1;
          ui.floatWorld('两边通吃！', 'ft-boom ft-gate', s.x, 3.6, s.z - 2, { life: 1.3, vy: -35, pop: 1.6, scale: 0.9 });
        }
        break;
      }
      // ---------------------------------------------------------------- 滚桶, 护盾, MAX, 小 Boss 的花招
      case 'rollIn':
        if (!save.seen.roll) { save.seen.roll = 1; persist(); ui.banner('滚桶来了', 'red', d.r.pair ? '二选一：站到它前面打爆，拿桶里的道具；被撞到会压死兵' : '打爆它拿道具，被撞到会压死兵', 1.8); this.slowmo(0.8, 0.4); }
        sfx('whoosh');
        break;
      case 'rollHit':
        v.onRollHit(d.r); sfx('boom'); this.world.shake = 0.7;
        if (!d.shield) { ui.hurtFlash(); ui.floatWorld(`被滚桶压到 −${fmt(d.n)}`, 'ft-loss', d.r.x, 2.6, s.z - s.R, { life: 1.1, vy: -35, pop: 1.4 }); }
        break;
      case 'rollMiss': break;
      case 'shieldPop': {
        // said as what it is — the shield took the blow and kept these soldiers — never as a loss
        v.onShieldPop(d.left); sfx('crack', 3); sfx('upgrade'); this.world.shake = Math.max(this.world.shake, 0.3);
        const what = { boss: `${d.from || 'Boss'}的一击`, trap: '陷阱', roll: '滚桶', mb: `${d.from || '小 Boss'}的冲撞` }[d.cause] || '一次伤害';
        ui.banner(`护盾挡下${what}`, 'blue top', `帮你保住 ${fmt(d.saved)} 个兵${d.left ? ` · 还剩 ${d.left} 层` : ' · 护盾用完了'}`, 1.8);
        ui.floatWorld(`保住 ${fmt(d.saved)} 兵`, 'ft-good', s.x, 3.2, s.z - 1, { life: 1.4, vy: -40, pop: 1.5 });
        break;
      }
      case 'gateMax': v.onGateMax(d.g, d.side); sfx('gateGood', 10); break;
      case 'mbFlee': ui.banner('目标正在逃离', 'red', '火力不足时先保住队伍', 1.2); sfx('fail'); break;
      case 'mbEscape':
        ui.floatWorld(`${d.z.name}跑了`, 'ft-loss', d.z.x, 3.4, d.z.z, { life: 1.3, vy: -30, pop: 1.3 });
        if (this.L.teachEscape && !this.seen.mbEscape) { this.seen.mbEscape = 1; this.tutor.say('火力不够，追不上', this.L.teachEscape, 2.6); }
        break;
      case 'mbBlink':
        v.onMbBlink?.(d); sfx('whoosh');
        if (this.L.teachDodge && !this.sim.squad.skills.aim && !this.seen.dodgeT) { this.seen.dodgeT = 1; this.tutor.say('追不上', this.L.teachDodge, 2.4); }
        break;
      case 'barrelBoom':
        v.onBarrelBoom(d.r); sfx('boom'); this.world.shake = Math.max(this.world.shake, 0.35);
        if (d.k >= 3) ui.floatWorld(`炸翻 ${d.k} 个`, 'ft-mult', d.r.x, 3.0, d.r.z, { life: 1.0, vy: -40, pop: 1.3, scale: 0.8 });
        break;
      case 'fishJump': {
        sfx('splash');
        const T = this.L.teachTide;
        if (T && !this.sim.squad.skills.spread && !this.seen.tide1) { this.seen.tide1 = 1; this.tutor.say(T[0], T[1], 2.6); }
        else if (T && this.sim.squad.skills.spread && !this.seen.tide2) { this.seen.tide2 = 1; this.tutor.say('有了散射', '同一波蝙蝠群，三向扇形一扫一片', 2.4); }
        break;
      }
      case 'fishKill': {
        v.onFishKill(d.f);
        if (d.paid) {
          // a leaping fish (a bat on screen) pays like a monster, its card's multiple × 炮倍
          const amt = Math.round(d.mult * this.L.stake);
          save.wallet += amt; this.R.kills += amt; this.R.killN++;
          ui.coinsFlyWorld(amt, d.f.x, d.f.y, d.f.z, 3);
          ui.floatWorld(`×${d.mult}<small>+${kmb(amt)}</small>`, 'ft-mult', d.f.x, d.f.y + 1.6, d.f.z, { html: true, life: 1.0, vy: -40, pop: 1.4, scale: 0.85 });
          sfx('catch', d.mult * 2);
          break;
        }
        ui.floatWorld('×' + d.mult, 'ft-mult', d.f.x, d.f.y + 1.6, d.f.z, { life: 1.0, vy: -40, pop: 1.4, scale: d.mult >= 3 ? 1 : 0.7 });
        const amt = this.runCoins(d.coins, d.f.x, d.f.y, d.f.z, 5);
        ui.coinText(amt, d.f.x, d.f.y + 0.4, d.f.z, d.mult >= 3);
        sfx('catch', d.mult * 4);
        break;
      }
      case 'arrive': ui.progress(true, 1); break;
      case 'tile':
        v.onTile(d.t);
        ui.floatWorld('×' + d.t.m, 'ft-boom ft-gate', 0, 2.6, d.t.z - 1.6, { life: 1.0, vy: -50, pop: 1.6 });
        sfx('gateGood', 6 + d.t.k * 1.2);
        if (d.t.k >= 4) this.world.shake = 0.2;
        break;
      case 'ladderEnd':
        this.R.ladder = d.mult;
        ui.progress(false);
        ui.banner(`倍数跑道 ×${d.mult}`, 'gold', `额外金炮弹 ×${d.mult}`, 1.5);
        sfx('upgrade'); this.slowmo(0.4, 0.3);
        break;
      case 'bossSpawn':
        music('boss');
        ui.progress(false);
        ui.bossBar(true, d.boss.name, 1);
        if (!(this.L.teach || []).some(t => t.boss)) ui.banner(this.L.journey?'动静引来了重感染者':'BOSS 来了', 'red', this.L.story?.scene==='radio'?'广播声惊动了它，掩护维修员撤离！':'集中火力，清出返回车队的路！', 1.5);
        sfx('boss'); this.world.shake = 0.6;
        break;
      case 'bossHit':
        v.onBossHit(d.x, d.z); sfx('hit');
        break;
      case 'bossTele': {
        v.onTele(d.tele); sfx('boss');
        // the first time each move shows up, say how to get out of it
        const M = { slam: ['红圈要砸了！', '拖动队伍躲开'], multi: ['三连砸！', '找没有红圈的空档'], lane: ['整条道要被扫！', '拖到另一边去'], rain: ['到处在砸！', '躲开红点'] }[d.tele.move] || ['红圈要砸了！', '拖动队伍躲开'];
        if (!this.seen['tele_' + d.tele.move]) { this.seen['tele_' + d.tele.move] = 1; ui.banner(M[0], 'red', M[1], 1.2); this.slowmo(0.7, 0.45); }
        break;
      }
      case 'bossFlee':
        ui.banner(`${d.boss.name}要跑了！`, 'red', '它背着金箱跑了，Bonus 炮弹减半', 1.4); sfx('fail');
        break;
      case 'bossEscape': this.R.escaped = true; ui.bossBar(false); break;
      case 'bossBlink': v.onBossBlink?.(d); sfx('whoosh'); break;
      case 'lineIn':
        if (this.L.teachLine && !this.sim.squad.skills.pierce && !this.seen.lineT) { this.seen.lineT = 1; this.tutor.say(this.L.teachLine[0], this.L.teachLine[1], 2.6); }
        break;
      case 'shieldBlock':
        v.onShieldBlock?.(d.z);
        if (this.L.teachShield && !this.sim.squad.skills.pierce && !this.seen.shieldT) { this.seen.shieldT = 1; this.tutor.say('打不穿', this.L.teachShield, 2.4); }
        break;
      case 'bossRage':
        v.onBossRage(); sfx('boss'); this.world.shake = 0.7;
        ui.banner('狂暴！', 'red', 'Boss 出招更快了', 1.1);
        break;
      case 'bossSummon':
        v.onSummon(d.list); sfx('boss'); this.world.shake = 0.35;
        ui.floatWorld('召唤尸群！', 'ft-loss', d.boss.x, 3.4, d.boss.z + 1, { life: 1.0, vy: -40, pop: 1.3 });
        break;
      case 'bossSlam':
        bridge.track('boss_slam', { code: this.L.code, lost: d.shield ? 0 : d.n, dodged: !d.n, shield: !!d.shield });
        v.onSlam(d.tele, d.n); sfx('boom'); this.world.shake = Math.max(this.world.shake, d.n ? 0.8 : 0.5);
        if (d.shield) { /* shieldPop says the shield took it */ }
        else if (d.n) { ui.hurtFlash(); ui.floatWorld(`−${fmt(d.n)}`, 'ft-loss', d.tele.x, 2.4, d.tele.z, { life: 1.1, vy: -35, pop: 1.4 }); }
        else { ui.floatWorld('躲开了！', 'ft-good', s.x, 2.8, s.z - 1, { life: 1.0, vy: -45, pop: 1.5 }); sfx('upgrade'); }
        break;
      case 'bossBite': ui.floatWorld('−' + d.n, 'ft-hurt', s.x + (Math.random() - 0.5) * 2, 1.8, s.z - s.R * 0.6, { life: 0.6 }); sfx('hurt'); this.world.shake = Math.max(this.world.shake, 0.15); break;
      case 'bossDie': {
        music('run');v.onBossDie();sfx('boom');this.world.shake=.6;
        const amt=Math.round((d.boss.m||0)*(this.L.stake||0));
        this.R.boss+=amt;save.wallet+=amt;
        ui.banner('通道已打开','blue','守住撤离区，等接应车抵达',1.4);
        this.after(.8,()=>ui.bossBar(false));break;
      }
      case 'runDone': this.after(d.delay || 0.2, async () => {
        if(this.L.finale.after==='journey'){this.campaign.arrive();return;}
        if(this.L.finale.after==='evac'){this.startExtraction();return;}
        if (this.magicP) { const p = this.magicP; await p; if (this.magicP !== p) return; this.magicP = null; }
        const after = this.L.finale.after;
        if (this.R.escaped && after && after !== 'bonus') { this.startExchange(); return; }   // the boss ran off with the finale
        if (after === 'bonus') this.startLoad();
        else if (after === 'exchange') this.startExchange();
        else if (after === 'pick') this.pickSurprise();
        else if (SURPRISES[after]) this.startSurprise(after);
        else this.finish(true);
      }); break;
      // ---------------------------------------------------------------- 结尾惊喜
      case 'finaleStart': v.startFinale(d.fin); music('run'); break;
      case 'finHit': {
        const amt = this.payFinale(d.units, d.x, 2.6, d.z, 2);
        v.finale?.onFinHit(d.units, d.x, d.z);
        // the 二人捕鱼 egg: every blow's coins stack up over the target
        const k = (this.finStack = ((this.finStack || 0) + 1) % 5);
        if (amt > 0) ui.floatWorld(`+${fmt(amt)}`, 'ft-stack', d.x + (k - 2) * 0.35, 5.2 + k * 0.5, d.z, { life: 0.9, vy: -18, pop: 1.25 });
        if (Math.random() < 0.6) sfx('coin', 6 + k);
        break;
      }
      case 'goldKill': {
        v.finale?.onGoldKill();
        const amt = this.payFinale(d.bonus, this.sim.boss.x, 3, this.sim.boss.z, 18);
        ui.banner('打倒黄金机甲！', 'gold', `全部 ×2 · 再 +${kmb(amt)}`, 1.6);
        sfx('bigwin', 1); this.world.shake = 0.8; this.slowmo(0.5, 0.25);
        break;
      }
      case 'eggCrack': v.finale?.onEggCrack(d.layer); sfx('crack', d.layer); this.world.shake = 0.25 + d.layer * 0.08;
        ui.floatWorld(`金蛋裂了 ${d.layer}/3`, 'ft-mult', 0, 5, this.sim.boss.z, { life: 1.0, vy: -30, pop: 1.4, scale: 0.8 }); break;
      case 'eggBreak': this.onEggBreak2(d); break;
      case 'leapIn': v.finale?.onLeapIn(d.f); if (Math.random() < 0.4) sfx('splash'); break;
      case 'leapOut': v.finale?.onLeapOut(d.f); break;
      case 'leapKill': {
        v.finale?.onLeapKill(d.f);
        const amt = this.payFinale(d.units, d.f.x, d.f.y + 0.5, d.f.z, 4);
        ui.floatWorld(`×${d.units}<small>+${kmb(amt)}</small>`, d.units >= 30 ? 'ft-boom ft-gate' : 'ft-mult', d.f.x, d.f.y + 2.2, d.f.z, { html: true, life: 1.1, vy: -40, pop: 1.5, scale: d.units >= 20 ? 1 : 0.8 });
        sfx('catch', d.units);
        break;
      }
      case 'vaultBreak': {
        const amt = this.payFinale(d.units, d.r.x, 1.6, d.r.z, d.r.gold ? 10 : 3);
        ui.floatWorld(`×${d.units}<small>+${kmb(amt)}</small>`, d.r.gold ? 'ft-boom ft-gate' : 'ft-mult', d.r.x, 3.0, d.r.z, { html: true, life: 1.0, vy: -40, pop: 1.4, scale: d.r.gold ? 1 : 0.75 });
        sfx(d.r.gold ? 'catch' : 'barrel', d.units);
        break;
      }
      case 'rbFall': {
        v.finale?.onFall(d.gap, d.n);
        this.payFinale(d.units, 0, 0.5, d.gap.z, 1, true);
        if (Math.random() < 0.35) sfx('coin', 4 + d.gap.k);
        break;
      }
      case 'rbFull':
        v.finale?.onFull(d.gap); sfx('gateGood', 6 + d.gap.k);
        ui.floatWorld(`×${d.gap.m} 满了`, 'ft-mult', 0, 2.6, d.gap.z, { life: 0.9, vy: -40, pop: 1.3, scale: 0.75 });
        break;
      // 金砖墙
      case 'brHit': {
        v.finale?.onBrickHit(d.gap, d.n);
        this.payFinale(d.units, 0, 0.5, d.gap.z, 1, true);
        if (Math.random() < 0.45) sfx('coin', 4 + d.gap.k);
        if (Math.random() < 0.25) sfx('hit');
        break;
      }
      case 'brBreak': {
        v.finale?.onBrickBreak(d.gap);
        sfx('barrel', 6 + d.gap.k); sfx('gateGood', 6 + d.gap.k);
        this.world.shake = Math.max(this.world.shake, 0.25 + d.gap.k * 0.04);
        const amt = Math.round(d.gap.n * d.gap.m * this.fin.chip);
        ui.floatWorld(`×${d.gap.m} 撞碎了<small>+${kmb(amt)}</small>`, d.gap.k >= 5 ? 'ft-boom ft-gate' : 'ft-mult', 0, 3.2, d.gap.z, { html: true, life: 1.1, vy: -40, pop: 1.5, scale: d.gap.k >= 5 ? 1 : 0.8 });
        break;
      }
      case 'finaleOver': this.onFinaleOver(d); break;
      case 'finaleEnd': this.after(0.3, () => (RUN_FIN.has(d.fin.type) ? this.finish(true) : this.startExchange())); break;
      case 'fail':
        if (d.reason === 'boss' && this.sim.boss && this.sim.boss.alive) { this.bossWins(); break; }
        this.after(0.9, () => this.finish(false, d.reason));
        break;
    }
  }

  // Gates: one panel, or two when riding a thin post ("先加后乘"). A big multiplication gets a moment of its own.
  onGate(d) {
    const ui = this.ui, s = this.sim.squad;
    this.runView.onGate(d.gate, d.lanes, d.ops);
    const num = d.ops.filter(o => o.op !== 'skill');
    if (!num.length) { sfx('gateGood', 4); return; }
    const good = d.after >= d.before;
    // shown in the order they apply: additions first, then × and ÷ (先加后乘)
    const ord = { '+': 0, x: 1, '/': 2 };
    const labels = [...num].sort((a, b) => ord[a.op] - ord[b.op]).map(o => opLabel(o)).join(' ');
    const mult = num.some(o => o.op === 'x' || o.op === '/');
    const boom = d.after >= d.before * 3 && d.after - d.before >= 30;
    const mystery = d.ops.some(o => o.mystery);
    const html = mult || d.straddle ? `${labels}<small>${fmt(d.before)} → ${fmt(d.after)}</small>` : labels;
    const show = () => ui.floatWorld(html, (boom ? 'ft-boom' : good ? 'ft-good' : 'ft-bad') + ' ft-gate', s.x, 2.8, s.z - 1, { html: true, life: boom ? 1.6 : 1.2, vy: -45, pop: boom ? 1.8 : 1.4 });
    if (mystery) { ui.floatWorld('?', 'ft-mystery', s.x, 3.4, s.z - 1, { life: 0.5, vy: -20, pop: 1.6 }); this.after(0.25, show); }
    else show();
    if (d.straddle) {
      ui.floatWorld(`蹭边！两扇都吃 · 撞柱 −${fmt(d.cut)}`, 'ft-straddle', s.x, 4.4, s.z - 1, { life: 1.3, vy: -30, pop: 1.5 });
      this.fx.spark(s.x, 1.5, s.z - 1, 14, [1, 0.8, 0.3], 6, 0.5);
    }
    if (boom) {
      sfx('upgrade'); sfx('gateGood', 10);
      this.world.shake = 0.35;
      this.slowmo(0.35, 0.35);
      this.fx.ring(s.x, 0.5, s.z, 9, [1, 0.75, 0.2], 0.6);
      this.fx.spark(s.x, 2, s.z, 40, [1, 0.8, 0.25], 10, 0.6);
    } else sfx(good ? 'gateGood' : 'gateBad', Math.log2(Math.max(2, d.after)) * 1.3);   // the bigger the squad, the higher the note
    if (!good) this.world.shake = Math.max(this.world.shake, 0.25);
  }

  // ---------------------------------------------------------------- 兵 → 金炮弹
  // After the boss (or the runway) the squad runs home through the 撤离点 and the level gives the same number of
  // golden shells on top (times the runway multiplier).
  startLoad() {
    if (this.state !== 'run') return;
    this.state = 'load';
    const sim = this.sim, s = sim.squad, N = s.N;
    sim.bullets.length = 0;
    const mult = this.R.ladder || 1;
    const shots = Math.max(1, Math.round(N * mult * (this.R.escaped ? 0.5 : 1)));
    this.R.soldiers = N; this.R.shots = shots; this.R.peak = sim.stats.peak; this.R.low = sim.stats.low;
    const cz = this.cannonZ = sim.platZ - 5.8;
    this.fishView = new FishView(this.world, this.fx, cz, cannonTier(s.skills));
    // 一星剧本: the gifted shells are priced so the level pays its script (L.coins) scaled by how the run went
    let k = 1;
    if (this.L.coins) {
      const perf = clamp(0.3 + 0.7 * (N * mult) / (this.L.par || N * mult || 1), TUNE.perfMin, TUNE.perfMax);
      const want = this.L.coins * perf - N * TUNE.exchange - this.R.road - this.R.lucky - this.R.kills - this.R.boss;
      // what the pool pays per shell, in shell values (measured): ~1.2 plain, more with the wheel, 黄金机甲 and 金蛋
      // special targets: 电击怪 (its own ×20 plus the chain) ~1.6, 爆破矿工宝箱 (×50 in 一星) ~2.0 shell values each
      const SPF = { haiman: 1.6, zhangyu: 2.0 };
      const BC = this.L.bonus || {}, F = 1.2 + (BC.wheel ? 0.9 : 0) + (BC.dragon ? 3.2 : 0) + (BC.egg ? 4.5 : 0) + (BC.specials || []).reduce((a, t) => a + (SPF[t] || 1.5), 0);
      k = clamp(want / (shots * SHOT * F), 0.03, 500);
      this.R.perf = perf; this.R.plan = Math.max(0, want); this.R.adj = 0;
    }
    this.R.shellValue = SHOT * k >= 50 ? Math.round(SHOT * k / 10) * 10 : 0;
    this.ui.shellValue = this.R.shellValue;
    this.bsim = new BonusSim({ cz, shots, skills: s.skills, k, specials: (this.L.bonus || {}).specials, laser: !!lab().laser }, (k, d) => this.onBonus(k, d), { seed: randomSeed() });
    this.runView.hideLabel = true;
    // 撤离点: the squad runs home through a golden "1 兵 = 100" gate and every soldier becomes 100 coins
    this.R.exchange = N * TUNE.exchange;
    this.R.peakX = { label: `撤离点 ${fmt(N)} 个兵`, amt: this.R.exchange };
    const gz = s.z - s.R - 2.2;
    this.runView.showExchangeGate(gz);
    this.runView.jumpArc = 0.35;
    this.runView.setLoadTarget({ x: s.x, y: 0, z: gz - 0.6 });
    // each soldier through the gate pops into coins
    this.runView.onJumperArrive = (x, z) => { if (Math.random() < 0.5) this.fx.coinBurst(x, 1.2, z, 2, 0.5, { floor: 0.05, life: 0.2 }); };
    this.load = { t: -0.7, N, shots, mult, vis: this.runView.vis, launched: 0 };
    this.ui.hideBanner(); this.ui.dragHint(false); this.ui.progress(false);
    this.ui.homeCounter(true, N, 0, shots, mult, 0);
    sfx('upgrade');
    this.camT.pos.set(0, 17, s.z + 9.5); this.camT.look.set(0, 0.5, cz - 6.5);
  }

  updateLoad(dt) {
    const c = this.load;
    c.t += dt;
    if (c.t < 0) return;
    const D = clamp(0.9 + c.N * 0.003, 1.1, 2.0);
    const k = Math.min(1, c.t / D);
    const want = Math.floor(c.vis * k);
    if (want > c.launched) { this.runView.launchToCannon(want - c.launched); c.launched = want; }
    // second beat: the gift, golden shells pouring into the cannon
    const g = Math.min(1, Math.max(0, (c.t - D - 0.3) / 1.0));
    this.ui.homeCounter(true, c.N, Math.round(c.N * k), c.shots, c.mult, Math.round(c.shots * g));
    if (k < 1 && Math.random() < 0.4) { sfx('coin', Math.floor(k * 14)); this.runView.pulseExchangeGate(); }
    if (c.only) {
      if (k >= 1 && !c.homeDone) {
        c.homeDone = true; this.sim.squad.N = 0; sfx('cashout');
        save.wallet += this.R.exchange;
        this.ui.coinsFly(this.R.exchange, this.world.w / 2, this.world.h * 0.62, 18);
        const first = !save.seen.exchange; save.seen.exchange = 1;
        this.tutor.say(`${fmt(c.N)} 名幸存者撤离 · +${fmt(this.R.exchange)} 金币赏金`, first ? '撤离点：每名幸存者带回 100 金币救援赏金' : '撤离赏金：每名幸存者 100 金币', first ? 3.0 : 2.0);
        // 实验室 宝箱怪战场关: those coins go straight into a 末日战场 round against the 宝箱怪
        this.after(first ? 2.2 : 1.3, () => (this.L.finale.hunt ? this.startMagicHunt(this.R.exchange) : this.finish(true)));
      }
      return;
    }
    if (g > 0 && g < 1) {
      const P = this.fishView.hopper();
      if (Math.random() < 0.6) this.fx.coinBurst(P.x + (Math.random() - 0.5) * 2, P.y + 4, P.z, 1, 0.3, { floor: P.y });
      if (Math.random() < 0.5) sfx('coin', Math.floor(g * 16));
    }
    if (k >= 1 && !c.homeDone) {
      c.homeDone = true; this.sim.squad.N = 0; sfx('cashout');
      // the exchange is the coin moment of the level: the whole squad, at a rate that never changes
      save.wallet += this.R.exchange;
      this.ui.coinsFly(this.R.exchange, this.world.w / 2, this.world.h * 0.62, 18);
      const first = !save.seen.exchange; save.seen.exchange = 1;
      this.tutor.say(first ? `${fmt(c.N)} 名幸存者撤离 · +${fmt(this.R.exchange)} 金币赏金` : `再送你 ${fmt(c.shots)} 发金炮弹`, first ? '撤离点：每名幸存者带回 100 金币救援赏金' : '去黄金尸池打僵尸，打中就掉金币', 2.8);
    }
    if (g >= 1 && !c.done) {
      c.done = true;
      this.after(0.5, () => this.startBonus());
    }
  }

  // ---------------------------------------------------------------- bonus wheel + bonus cannon
  async startBonus() {
    const ui = this.ui, B = this.L.bonus, bsim = this.bsim;
    this.state = 'wheel';
    this.runView?.hideExchangeGate();      // its frame would cross the pond's view
    const from = { pos: this.world.camPos.clone(), look: this.world.camLook.clone() };
    this.tw = { t: 0, dur: 1.2, from, to: this.world.fishPose(this.cannonZ, { pos: V3(), look: V3() }) };
    await this.wait(1.25);
    if (this.bsim !== bsim) return;
    ui.homeCounter(false);
    if (B.wheel) {
      const owned = bsim.skills;
      // before 大关四 the wheel has no cannon skills: luck and multiples come first
      const banned = t => !!(B.noSkills && SKILLS[t.k]);
      const pool = BONUS_WHEEL.filter(t => !owned[t.k] && !banned(t));
      const res = B.dragon === true ? BONUS_WHEEL.find(t => t.k === 'dragon') : weighted(pool.filter(t => !(B.egg && t.k === 'dragon')));
      if (B.first || !save.seen.wheel) {
        save.seen.wheel = 1; persist();
        ui.callout(`<b>Bonus 转盘</b>：转到什么，炮台就加上什么<small>${B.noSkills ? '' : '技能、'}全部 ×2 ×3、黄金机甲、金币雨</small>`, 3600);
        await this.wait(1.2);
      }
      await ui.wheel({
        title: 'Bonus 转盘', sub: `${fmt(bsim.shots)} 发金炮弹 · 转到的加到炮台上`,
        segments: BONUS_WHEEL.map(t => ({ label: t.label, icon: SKILLS[t.k] ? t.k : '', locked: !!owned[t.k] || banned(t), lockText: banned(t) ? '大关四' : '已有' })),
        result: BONUS_WHEEL.indexOf(res),
      });
      if (this.bsim !== bsim) return;
      this.R.wheel = res;
      this.applyWheel(res);
      await this.wait(1.0);
    }
    if (this.state !== 'wheel') return;
    if (B.dragon === 'always' && !bsim.dragon) bsim.addDragon();
    if (B.egg) bsim.addEgg();
    this.state = 'bonus';
    ui.bonusHud(true, bsim, this.bonusChips());
    bsim.hold = false;
    sfx('whoosh');
    const tb = this.L.teachBonus;
    if (tb && tb.fire) this.tutor.say(tb.fire, '', 2.6);
  }

  applyWheel(res) {
    const ui = this.ui, bsim = this.bsim;
    const cz = this.cannonZ;
    if (SKILLS[res.k]) {
      bsim.addSkill(res.k);
      this.fishView.setTier(cannonTier(bsim.skills));
      ui.skills(bsim.skills, res.k);
      ui.banner(`炮台加上「${res.label}」`, 'blue', SKILLS[res.k].desc, 1.4);
      sfx('upgrade');
    } else if (res.k === 'x2' || res.k === 'x3') {
      const m = res.k === 'x2' ? 2 : 3;
      bsim.k *= m; this.R.wheelMult = m;
      ui.banner(`Bonus 全部 ×${m}`, 'gold', '这一炮打出的金币都翻倍', 1.4);
      this.fx.ring(0, 1.2, cz, 10, [1, 0.85, 0.4], 0.6);
      sfx('upgrade');
    } else if (res.k === 'dragon') {
      bsim.addDragon();
    } else if (res.k === 'rain') {
      bsim.rain = true;
      ui.banner('金币雨', 'gold', '每发炮弹都多下一场金币', 1.4);
      this.fx.coinRain(0, cz - 15, 14, 18, 40);
      sfx('cashout');
    }
  }

  bonusChips() {
    const chips = [];
    if (this.R.wheelMult) chips.push(`转盘 ×${this.R.wheelMult}`);
    if (this.bsim?.rain) chips.push('金币雨');
    return chips;
  }

  onBonus(k, d) {
    const ui = this.ui, fv = this.fishView;
    switch (k) {
      case 'shoot':
        fv.onShoot();
        if (this.shotSfx <= 0) { sfx('cannon'); this.shotSfx = 0.07; }
        break;
      case 'net': if (Math.random() < 0.6) fv.onNet(d.x, d.z, false); break;
      case 'catch': {
        const big = d.mult >= 12 || d.luck >= 3;
        fv.onCatch(d.f, big);
        this.R.bonus += d.win;
        save.wallet += d.win;
        ui.coinsFlyWorld(d.win, d.f.x, 0.4, d.f.z, Math.min(8, 1 + Math.floor(d.mult / 3) + (d.luck > 1 ? 2 : 0)));
        if (big || d.mult >= 8 || Math.random() < 0.3) ui.coinText(d.win, d.f.x, 0.6, d.f.z, big);
        if (d.luck > 1) ui.floatWorld(`幸运 ×${d.luck}`, 'ft-mult', d.f.x, 1.6, d.f.z - 1, { life: 0.9, vy: -40, pop: 1.4, scale: d.luck >= 3 ? 1 : 0.75 });
        sfx('catch', d.mult);
        save.best = Math.max(save.best, d.mult * d.luck);
        break;
      }
      case 'rain': {
        this.R.rain += d.amount;
        save.wallet += d.amount;
        this.fx.coinRain(0, this.cannonZ - 15, 14, 20, 6);
        ui.coinsFly(d.amount, this.world.w * (0.3 + Math.random() * 0.4), this.world.h * 0.3, 2);
        break;
      }
      case 'dragonIn':
        ui.banner('黄金机甲来了', 'gold', '打爆它：转盘 ×50～×200', 1.6);
        ui.bossBar(true, '黄金机甲', 1, true);
        sfx('boss');
        break;
      case 'dragonHit': ui.bossBar(true, '黄金机甲', 1 - d.k, true); break;
      case 'finalShot': ui.banner('最后一发', 'gold', d.egg ? '砸开金蛋' : d.special ? `专打${FISH_NAME(d.f)}` : '专打黄金机甲', 0.9); sfx('cannon'); break;
      // special targets (二人捕鱼's special fish)
      case 'specialIn': this.onSpecialIn(d.f); break;
      case 'chain': {
        fv.onChain(d.f, d.list);
        this.R.special += d.base; save.wallet += d.base; this.R.specials.push('电击怪连锁');
        this.peak(`电击怪连锁 ${d.list.length + 1} 只`, d.win);
        ui.coinsFlyWorld(d.base, d.f.x, 0.6, d.f.z, 8);
        this.after(0.2 + d.list.length * 0.09, () => ui.banner('闪电连锁', 'blue', `一串电倒 ${d.list.length + 1} 只 · +${kmb(d.win)}`, 1.4));
        sfx('boom'); this.world.shake = 0.5;
        break;
      }
      case 'special': this.playSpecial(d, 'bonus'); break;
      case 'eggIn': this.fishView.ensureEgg(d.egg); break;
      case 'eggHit': if (Math.random() < 0.4) sfx('crack', d.egg.layer); break;
      case 'eggLayer': {
        const e = d.egg;
        this.fishView.onEggLayer(e, d.i);
        this.R.egg = (this.R.egg || 0) + d.coins; save.wallet += d.coins;
        ui.floatWorld(`<i class="ico-coin"></i>+${fmt(d.coins)}`, 'ft-coin big', e.x, this.fishView.wy + 4, e.z, { html: true, life: 1.2, vy: -50, pop: 1.5 });
        ui.coinsFlyWorld(d.coins, e.x, this.fishView.wy + 2, e.z, 8);
        sfx('crack', d.i); this.world.shake = 0.2 + d.i * 0.08;
        break;
      }
      case 'eggBreak': this.onEggBreak(d.egg); break;
      case 'bossBurst': this.onDragonBurst(d); break;
      case 'laser':
        fv.onLaser(d.hits); sfx('boom'); this.world.shake = 0.5;
        ui.banner('全屏激光', 'gold', `扫中 ${d.hits.length} 只`, 1.0);
        break;
      case 'bonusEnd':
        this.peak('黄金尸池', this.R.bonus + this.R.dragon + (this.R.special || 0) + (this.R.egg || 0) + this.R.rain);
        this.after(0.4, () => this.finish(true)); break;
    }
  }

  async onEggBreak(e) {
    const ui = this.ui, bsim = this.bsim;
    bsim.paused = true;
    this.fishView.onEggBreak(e);
    sfx('boom'); this.world.shake = 0.8; this.slowmo(0.6, 0.2);
    await this.wait(0.9);
    const T = [{ m: 2, w: 40 }, { m: 3, w: 28 }, { m: 5, w: 18 }, { m: 10, w: 10 }, { m: 20, w: 4 }];
    // 一星剧本: the egg always opens ×3 (the wheel still spins); the live draw only outside the script
    const m = this.L.coins ? 3 : weighted(T).m;
    await ui.wheel({ title: '金蛋开倍', sub: `整颗金蛋的 ${fmt(e.coins)} 金币再乘一次`, segments: T.map(t => ({ label: '×' + t.m })), result: T.findIndex(t => t.m === m) });
    if (this.bsim !== bsim) return;
    const extra = bsim.resolveEgg(m);
    this.R.egg = (this.R.egg || 0) + extra; this.R.eggMult = m;
    this.peak(`金蛋开倍 ×${m}`, e.coins * m, m);
    await ui.bigWin({ tier: m >= 10 ? 2 : m >= 5 ? 1 : 0, label: '金蛋 ×' + m, mult: 0, amount: e.coins * m, sub: `${fmt(e.coins)} × ${m}` });
    save.wallet += extra;
    ui.coinsFly(extra, this.world.w / 2, this.world.h * 0.45, 22);
    persist();
    bsim.paused = false;
  }

  async onDragonBurst({ f }) {
    const ui = this.ui, bsim = this.bsim;
    bsim.paused = true;
    ui.bossBar(false);
    this.fishView.onBossBurst(f);
    sfx('slowmo'); sfx('boom');
    this.world.shake = 1.0;
    this.slowmo(0.9, 0.12);
    this.fishView.bossCoins(f, 40);
    await this.wait(1.0);
    // 一星剧本: the 黄金机甲 always lands on ×80; the live draw only outside the script
    const m = this.L.coins ? 80 : weighted(DRAGON_WHEEL).m;
    await ui.wheel({
      title: '黄金机甲爆了！', sub: `转出几倍，就赢 ${fmt(Math.round(SHOT * bsim.k * Math.max(1, bsim.shots / 25)))} × 几倍`,
      segments: DRAGON_WHEEL.map(t => ({ label: '×' + t.m })), result: DRAGON_WHEEL.findIndex(t => t.m === m),
    });
    if (this.bsim !== bsim) return;
    const win = bsim.resolveDragon(m);
    this.R.dragon += win; this.R.dragonMult = m;
    this.peak(`黄金机甲 ×${m}`, win, m);
    this.fishView.bossCoins(f, 60);
    await ui.bigWin({ tier: m >= 150 ? 2 : m >= 80 ? 1 : 0, mult: m, amount: win, sub: `${fmt(Math.round(win / m))} × ${m} 倍` });
    save.wallet += win;
    ui.coinsFly(win, this.world.w / 2, this.world.h * 0.45, 22);
    save.best = Math.max(save.best, m); save.bestWin = Math.max(save.bestWin, win);
    persist();
    bsim.paused = false;
  }

  // 宝箱怪 down: the real Seal Flip-Flip (二人捕鱼's 海豹魔术师). 一星 follows the script unless the lab switches it to the live draw.
  async playMagic() {
    await this.wait(1.0);
    // the 金币炮台 experiment draws for real: it is the fishing room's odds end to end
    const live = !!lab().magicLive;
    const res = magicResult({ cannon: MAGIC_CANNON, scripted: !live });
    this.state = 'magic';
    await magicFlip(res, { cannon: MAGIC_CANNON, where: live ? '真随机开奖' : '一星剧本' });
    save.wallet += res.reward;
    this.R.magic = res.reward; this.R.magicMult = res.multiple;
    this.peak(`宝箱怪 ×${fmt(res.multiple)}`, res.reward, res.multiple);
    this.ui.coinsFly(res.reward, this.world.w / 2, this.world.h * 0.45, 22);
    bridge.track('magic', { where: 'run', stage: res.stage, multiple: res.multiple, reward: res.reward, scripted: !live });
    persist();
    this.state = 'run';
  }

  // 实验室 宝箱怪战场关 (第 13 关): the soldiers just became coins at the 撤离点; now they are the cannon's coins in a
  // 末日战场 round — 1K a shot, the 宝箱怪 caught at 二人捕鱼's odds (0.97 / 376 a hit, demo pity 60), its cards
  // flipped for real. Whatever is not spent stays in the wallet; out of coins and the 宝箱怪 runs off.
  startMagicHunt(budget) {
    this.huntRun = this.sim;      // the run's numbers, for the result
    this.runView?.dispose(); this.runView = null;
    this.fx.clear(); this.ui.labels.clear();
    this.ui.progress(false); this.ui.homeCounter(false); this.ui.skills(null); this.ui.dragHint(false); this.ui.hideBanner();
    this.tutor.clear(); this.load = null;
    this.state = 'fishing';
    music(null);
    const platZ = -60, cz = this.cannonZ = platZ - 5.8;
    this.world.buildLevel('reef', 70, platZ);
    const H = this.hunt = { budget, spent: 0, over: false };
    const wallet = { get: () => Math.min(save.wallet, H.budget - H.spent), spend: c => { save.wallet -= c; H.spent += c; }, add: w => { save.wallet += w; } };
    const cfg = { ...FISHING, laser: false, bossAt: Infinity, bossEvery: 0, bosses: 0, specials: [], bomb: [], tide: 0, shark: 0, partner: false, bets: [10], magicAt: 3, magicEvery: 4, onlyMagic: true };
    const fsim = this.fsim = new FishSim(cfg, { platZ: cz, wallet }, (k, d) => this.onFish(k, d), { seed: randomSeed() });
    this.fishView = new FishView(this.world, this.fx, cz, cannonTier(this.huntRun.squad.skills));
    this.world.fishPose(cz, this.cam);
    this.world.setCamera(this.cam.pos, this.cam.look);
    this.fishStart = save.wallet;
    this.ui.setFishing(this.L.code, '宝箱怪战场关');
    this.ui.showWallet(true);
    this.ui.fishBar(true, fsim, cfg);
    this.ui.updateBet(fsim, '炮倍固定 1K');
    this.ui.cannonBar(true, { bet: SHOT * 10, hits: 0, pool: budget, pool0: budget });
    this.ui.banner('宝箱怪战场关', 'gold', `${fmt(Math.round(budget / TUNE.exchange))} 个兵 = ${kmb(budget)} 金币 · 每炮 1K`, 2.2);
    this.after(2.4, () => this.hunt && this.ui.callout('<b>金币炮台（实验）</b> 每炮 1K，按原版概率打中宝箱怪就翻牌；没打完的金币留在钱包<small>金币打光还没打中，宝箱怪就跑了</small>', 5200));
    sfx('whoosh');
  }
  finishHunt() {
    const H = this.hunt;
    if (!H || H.over) return;
    H.over = true;
    const fs = this.fsim;
    this.R.cannon = { pool: H.budget, spent: H.spent, back: H.budget - H.spent, hits: fs ? fs.magicHits : 0, shots: Math.round(H.spent / (SHOT * 10)), won: !!this.R.magic, soldiers: Math.round(H.budget / TUNE.exchange) };
    if (!this.R.magic) this.R.escaped = true;
    this.ui.cannonBar(false); this.ui.fishBar(false); this.ui.session(false); this.ui.broke(false); this.ui.callout(null); this.ui.critBar(false);
    this.fishView?.dispose(); this.fishView = null; this.fsim = null;
    this.sim = this.huntRun; this.huntRun = null; this.hunt = null;
    this.state = 'run';            // finishLesson takes it from here
    this.finish(true);
  }

  // the boss ate the last of the squad — the camera comes down in front of it, slowed, for its victory roar;
  // then the result
  bossWins() {
    const b = this.sim.boss, v = this.runView;
    const bz = b.still ? this.sim.platZ - 9 : b.z, big = b.big || b.still;
    const from = { pos: this.world.camPos.clone(), look: this.world.camLook.clone() };
    // a little to the side and below its eyes, far enough back for the whole of it (the big ones need room)
    const to = { pos: new THREE.Vector3(b.x + (big ? 3.6 : 2.6), big ? 6.2 : 3.8, bz + (big ? 16 : 9)), look: new THREE.Vector3(b.x, big ? 4.4 : 2.4, bz) };
    this.tw = { t: 0, dur: 1.1, from, to }; this.camHold = true;
    this.slowmo(1.1, 0.45);
    this.ui.bossBar(false); this.ui.dragHint(false); this.ui.progress(false); this.tutor.clear();
    this.after(0.5, () => { v?.onBossRage(); sfx('boss'); this.world.shake = 0.6; this.ui.banner(`${b.name}赢了`, 'red low', '队伍被吃光了', 1.6); });
    this.after(2.4, () => this.finish(false, 'boss'));
  }

  // ---------------------------------------------------------------- result
  finish(win, reason) {
    if (this.state === 'result') return;
    this.finishLesson(win, reason);
  }

  // result of a teaching level: what was learnt, how the squad went, and the next step
  finishLesson(win, reason) {
    this.state = 'result';
    music(null);
    const ui = this.ui, L = this.L, st = this.sim.stats, R = this.R;
    ui.bossBar(false); ui.progress(false); ui.bonusHud(false); ui.homeCounter(false); ui.skills(null);
    this.evacView?.dispose();this.evacView=null;
    this.tutor.clear();
    const campaignResult = this.campaign.finish(win);
    const list = stageLevels(L.ch), last = list[list.length - 1] === this.level;
    const counts = !this.editRun;      // 调参台 runs leave the progress alone
    const firstClear = win && counts && !save.cleared[this.level];
    if (win && counts) { save.cleared[this.level] = true; save.next = Math.max(save.next, this.level + 1); }
    ptEvent(L.code, win ? 'win' : 'fail');
    if (!win) this.lastFail = { code: L.code, t: Date.now() };
    // the item for a first clear (spent in 末日战场)
    let reward = null;
    const rw = this.editRun ? null : LEVELS[this.level].reward;
    if (firstClear && rw) { save.items ||= {}; save.items[rw[0]] = (save.items[rw[0]] || 0) + rw[1]; reward = { k: rw[0], n: rw[1], ...ITEMS[rw[0]] }; }
    // the gate that cost the most: on a loss it explains why, on a win it says what more was there
    let tip = null;
    // gates that hand out a skill are a different trade (a skill for soldiers), so they never count as a mistake
    const worst = this.sim.decisions.filter(q => q.best > q.after && !q.skill).sort((a, b) => b.best / b.after - a.best / a.after)[0];
    if (worst && worst.best >= worst.after * (win ? 1.6 : 1.15)) tip = { gate: worst.i + 1, best: worst.best, bestLabel: worst.bestLabel, after: worst.after, chosen: worst.chosen };
    // what the unified result shows in its slots (兵变金币 / 黄金尸池 / 倍数 / 技能)
    const coins = save.wallet - this.walletStart;
    const parts = { road: R.road, lucky: R.lucky, bonus: R.bonus, dragon: R.dragon, dragonMult: R.dragonMult, egg: R.egg, eggMult: R.eggMult, rain: R.rain, magic: R.magic, magicMult: R.magicMult, exchange: R.exchange, escaped: R.escaped, shellValue: R.shellValue,
      special: R.special, specials: R.specials, cannon: R.cannon,
      kills: R.kills, killN: R.killN, boss: R.boss, bossMult: R.bossMult, fin: R.fin, finType: R.finType, finChip: R.finChip, finUnits: R.finUnits, finSoldiers: R.finSoldiers, picked: R.picked, ladder: R.ladder };
    const owned = { ...(this.sim.squad.skills || {}), ...(this.bsim ? this.bsim.skills : {}) };
    const skills = Object.keys(owned).filter(k => owned[k]);
    // 3-3 (after the 爆分 lessons and a random big monster) opens the fishing entrance; every result after has it
    const fishNew = false;
    persist();
    // the host (main game / server) gets the run to check and credit; see docs/接入方案.md
    const result = {
      code: L.code, win, reason: reason || '',
      soldiers: this.homeN(win), shots: R.shots || 0, peak: st.peak, kills: st.kills,
      coins, ms: Date.now() - (this.runT0 || Date.now()), gates: this.sim.decisions.length, firstClear,
    };
    bridge.track('level_end', result);
    bridge.runResult(result);
    const reasons = { dead: '兵打光了', boss: 'Boss 把队伍吃光了' };
    this.after(win ? 0.7 : 0.3, async () => {
      const act = await ui.lessonResult({
        win, L, ch: L.ch, N: this.homeN(win), peak: st.peak, low: st.low, kills: st.kills, peakMoment: R.peakM || R.peakX, campaign: campaignResult,
        reason: reasons[reason] || '', stageDone: win && last && !this.editRun, hasNext: !this.editRun && this.level + 1 < LEVELS.length,
        coins, parts, skills, reward, tip,
        home: L.finale.after && win ? { soldiers: R.finSoldiers || R.soldiers, shots: R.shots, mult: R.ladder || 1 } : null,
        fishNew, fishBtn: false, extraction: R.extraction,
        par: lab().par && L.ch >= 1 && L.par ? { par: L.par, N: win ? this.homeN(win) : 0 } : null,
        release: !!lab().release,
      });
      this.onResultAction(act);
    });
  }

  // the squad the level brought home: at the 结尾惊喜 (or the 撤离点 / pool) when there is one, else what is left
  homeN(win) {
    const R = this.R, L = this.L;
    if (!win || !L.finale.after) return this.sim.squad.N;
    return R.finSoldiers || R.soldiers || this.sim.squad.N;
  }

  // the 宝箱怪 in 末日战场: the live draw (this is how 二人捕鱼's 海豹魔术师 plays), paid at the current 炮倍
  async onFishMagic(d) {
    const fs = this.fsim, fv = this.fishView, cannon = SHOT * d.bet;
    fs.paused = true;
    fv.onBossBurst(d.f); fv.bossCoins(d.f, 40); sfx('boom'); this.world.shake = 0.8;
    await this.wait(0.9);
    const res = magicResult({ cannon, scripted: false });
    await magicFlip(res, { cannon, where: '真随机开奖' });
    fs.resolveMagic(res.reward, res.multiple, d.bet);
    if (this.hunt) {
      this.R.magic = res.reward; this.R.magicMult = res.multiple;
      this.peak(`宝箱怪 ×${fmt(res.multiple)}`, res.reward, res.multiple);
      this.after(1.2, () => this.finishHunt());
    }
    this.ui.coinsFly(res.reward, this.world.w / 2, this.world.h * 0.45, 22);
    save.best = Math.max(save.best, res.multiple); save.bestWin = Math.max(save.bestWin, res.reward);
    bridge.track('magic', { where: 'fishing', stage: res.stage, multiple: res.multiple, reward: res.reward, bet: d.bet });
    persist();
    fs.paused = false;
  }

  onResultAction(act) {
    if(act==='camp'){this.campaign.shelter();return;}
    if(act==='next')this.start(this.level+1);
    else if(act==='retry'&&this.editRun)this.start(this.lastStart.i,this.lastStart.o);
    else if(act==='retry')this.start(this.level,{skipIntro:true});
    else if(act==='run')this.start(Math.min(save.next,LEVELS.length-1));
    else this.onMap?.();
  }

  // ---------------------------------------------------------------- special targets (二人捕鱼's special fish)
  onSpecialIn(f) {
    const S = SPECIALS[f.special];
    this.ui.banner(`${f.F.name}来了`, f.special === 'crit' ? 'red' : 'gold', `${S.name.split(' · ')[1]}：${S.sub}`, 1.6);
    sfx('boss');
  }
  // 爆破矿工宝箱 / 雪怪步步高 / 运钞怪元宝: ctx 'bonus' (the level's 黄金尸池, priced by the 一星剧本) or 'fish' (末日战场)
  async playSpecial(d, ctx) {
    const sim = ctx === 'bonus' ? this.bsim : this.fsim, fv = this.fishView, ui = this.ui, f = d.f;
    if (!sim) return;
    const scripted = ctx === 'bonus' && this.L && this.L.coins;
    const stake = ctx === 'bonus' ? Math.round(SHOT * sim.k * Math.max(1, sim.shots / 25)) : SHOT * d.bet;
    const pay = m => {
      const win = ctx === 'bonus' ? sim.resolveSpecial(m) : sim.resolveSpecial(m, d.bet, d.kind);
      if (ctx === 'bonus') { save.wallet += win; this.R.special += win; }
      save.best = Math.max(save.best, m); save.bestWin = Math.max(save.bestWin, win);
      return win;
    };
    if (d.kind === 'ingot') {
      // the fishing goes on while the ingots fall; each pays as it lands
      const vals = ingotValues(SPECIALS.ingot.n);
      fv.onBossBurst(f); sfx('boom');
      ui.banner(SPECIALS.ingot.name, 'gold', `${vals.length} 个元宝 · 每个 ×3～×30`, 1.6);
      let total = 0, landed = 0;
      fv.ingotRain(vals, (i, x, z) => {
        const win = pay(vals[i]); total += win; landed++;
        ui.coinText(win, x, 0.6, z, vals[i] >= 10); ui.coinsFlyWorld(win, x, 0.6, z, 4);
        sfx('catch', vals[i]); this.world.shake = Math.max(this.world.shake, 0.25);
        if (landed === vals.length) this.after(0.5, () => { ui.banner('喜从天降', 'gold', `${vals.length} 个元宝 · +${kmb(total)}`, 1.6); sfx('cashout'); if (ctx === 'bonus') this.R.specials.push('运钞元宝'); });
      });
      return;
    }
    sim.paused = true; fv.quiet = true;
    fv.onBossBurst(f); fv.bossCoins(f, 30);
    sfx('slowmo'); sfx('boom'); this.world.shake = 0.8; this.slowmo(0.6, 0.15);
    await this.wait(0.8);
    if (sim !== (ctx === 'bonus' ? this.bsim : this.fsim)) return;
    let m;
    if (d.kind === 'chest') {
      fv.showChests(); ui.hideBanner(); ui.bossBar(false);
      await this.wait(0.7);
      const i = await ui.chestPick({ pos: fv.chestScreen(), title: SPECIALS.chest.name, sub: `点一个宝箱 · ${ctx === 'bonus' ? '每 ×1' : '炮倍'} ${kmb(stake)}`, auto: 5 });
      const V = chestValues(scripted);
      let vals;
      if (V.scripted) { const rest = V.rest.slice().sort(() => Math.random() - 0.5); vals = [0, 1, 2].map(j => (j === i ? V.best : rest.pop())); }
      else vals = V.values;
      m = vals[i];
      fv.openChest(i, m); sfx('cashout'); this.world.shake = 0.5;
      await this.wait(1.0);
      fv.revealChests(vals, i);
      await this.wait(1.0);
      if (ctx === 'bonus') this.R.specials.push(`爆破宝箱 ×${m}`);
    } else if (d.kind === 'lion') {
      m = lionFinal(scripted);
      ui.hideBanner();
      await ui.lionDance({ card: targetCard(57), steps: LION_STEPS, final: m, stake, unit: ctx === 'bonus' ? '每 ×1' : '炮倍' });
      if (ctx === 'bonus') this.R.specials.push(`雪怪 ×${m}`);
    }
    if (sim !== (ctx === 'bonus' ? this.bsim : this.fsim)) return;
    const win = pay(m);
    if (ctx === 'bonus') this.peak(`${d.kind === 'chest' ? '爆破宝箱' : '雪怪步步高'} ×${m}`, win, m);
    await ui.bigWin({ tier: m >= 100 ? 2 : m >= 40 ? 1 : 0, label: d.kind === 'chest' ? '爆破宝箱' : '雪怪步步高', mult: m, amount: win, sub: `${kmb(stake)} × ${m} 倍` });
    ui.coinsFly(win, this.world.w / 2, this.world.h * 0.45, 22);
    fv.hideChests(); fv.quiet = false;
    persist();
    sim.paused = false;
  }

  // ---------------------------------------------------------------- 末日战场 (stand-in for the real fishing game, 二人捕鱼)
  startFishing() {
    this.ui.betToast('狙击玩法待后续设计，本版先体验突围与撤离。');return;
    this.fishT0 = Date.now(); bridge.track('fishing_start', { wallet: save.wallet, items: { ...(save.items || {}) } });
    this.perf?.begin('渔场');      // '渔场' stays the playtest key of this room (saved data)
    this.teardown();
    this.state = 'fishing';
    music(null);
    this.level = -1; this.L = null;
    const platZ = -60, cz = this.cannonZ = platZ - 5.8;
    this.world.buildLevel('reef', 70, platZ);
    const wallet = { get: () => save.wallet, spend: c => { save.wallet -= c; }, add: w => { save.wallet += w; } };
    const fsim = this.fsim = new FishSim({ ...FISHING, laser: !!lab().laser }, { platZ: cz, wallet }, (k, d) => this.onFish(k, d), { seed: randomSeed() });
    this.fishView = new FishView(this.world, this.fx, cz, 3);
    this.fishView.addPartner();
    this.world.fishPose(cz, this.cam);
    this.world.setCamera(this.cam.pos, this.cam.look);
    this.fishStart = save.wallet;
    this.ui.setFishing();
    this.ui.showWallet(true);
    this.ui.fishBar(true, fsim, FISHING);
    this.ui.updateBet(fsim, this.betText(fsim));
    this.ui.items(fsim);
    this.ui.banner('末日战场 · 1 场', 'blue', '和伙伴一起打 · 金币就是炮弹', 1.6);
    sfx('whoosh');
    if (!save.fishSeen) { save.fishSeen = true; persist(); this.after(1.8, () => this.teachBet(fsim)); }
  }

  teachBet(fsim) {
    const hi = fsim.bets[fsim.bets.length - 1];
    this.ui.teach(`<h4>炮倍 = 下注 · <em>不加威力</em></h4>
      <div class="teach-rows">
        <div class="teach-col"><span>炮倍 ${kmb(SHOT * fsim.bets[0])}</span><b>花 ${fmt(SHOT * fsim.bets[0])}</b><i>打中木乃伊 ×15 赢 ${fmt(SHOT * fsim.bets[0] * 15)}</i></div>
        <div class="teach-col big"><span>炮倍 ${kmb(SHOT * hi)}</span><b>花 ${fmt(SHOT * hi)}</b><i>打中木乃伊 ×15 赢 ${fmt(SHOT * hi * 15)}</i></div>
      </div><p>命中率完全一样，输赢一起放大 ${hi / fsim.bets[0]} 倍</p>`);
    this.ui.pulseBet();
    this.teachOpen = true;
    this.after(8, () => { if (this.teachOpen) { this.ui.teach(null); this.teachOpen = false; } });
  }

  betText(fsim) { return `1 场 · 1K～20K`; }

  onFish(k, d) {
    const ui = this.ui, fv = this.fishView, f = d && d.f;
    switch (k) {
      case 'shoot': fv.onShoot(); sfx('cannon'); break;
      case 'net': fv.onNet(d.x, d.z, d.partner); if (!d.partner) sfx('net'); break;
      case 'catch':
        fv.onCatch(f, d.mult >= 12 || d.crit >= 5);
        ui.coinText(d.win, f.x, 0.6, f.z, d.mult >= 12 || d.crit >= 5);
        if (d.crit) ui.floatWorld(`暴击 ×${d.crit}`, 'ft-crit', f.x, 1.6, f.z - 1, { life: 0.9, vy: -40, pop: 1.5, scale: d.crit >= 8 ? 1.15 : 0.85 });
        ui.coinsFlyWorld(d.win, f.x, 0.4, f.z, Math.min(10, 2 + Math.floor(d.mult / 3)));
        sfx('catch', d.mult);
        if (d.mult >= 20) { this.world.shake = 0.35; ui.floatWorld('×' + d.mult, 'ft-mult', f.x, 1.2, f.z - 1.5, { life: 1.1, vy: -30, pop: 1.5 }); }
        save.best = Math.max(save.best, d.mult);
        break;
      case 'bomb': fv.onBomb(f); sfx('boom'); this.world.shake = 0.6; ui.banner('火箭僵尸', 'gold', `一炸 ${d.n + 1} 只`, 1.2); break;
      // special targets (二人捕鱼's special fish)
      case 'specialIn': this.onSpecialIn(f); break;
      case 'specialOut': ui.banner(`${FISH_NAME(f)}跑了`, 'blue', '', 1.0); break;
      case 'chain':
        fv.onChain(f, d.list); sfx('boom'); this.world.shake = 0.5;
        this.after(0.2 + d.list.length * 0.09, () => ui.banner('闪电连锁', 'blue', `一串电倒 ${d.list.length + 1} 只 · +${kmb(d.win)}`, 1.4));
        save.bestWin = Math.max(save.bestWin, d.win);
        break;
      case 'critStart':
        fv.onBossBurst(f); sfx('boss'); this.world.shake = 0.7;
        ui.banner(SPECIALS.crit.name, 'red', SPECIALS.crit.sub, 1.6);
        ui.coinText(d.win, f.x, 0.6, f.z, true);
        break;
      case 'critEnd':
        ui.critBar(false);
        ui.banner('暴击结束', 'gold', `暴击 ${d.n} 只 · +${kmb(d.total)}`, 1.6); sfx('cashout');
        save.bestWin = Math.max(save.bestWin, d.total);
        break;
      case 'special': this.playSpecial(d, 'fish'); break;
      case 'bossIn': {
        const bet = this.fsim.bet;
        ui.banner('黄金机甲来了', 'gold', `转盘 ×50～×200 · 炮倍 ${kmb(SHOT * bet)}，最高赢 ${short(200 * SHOT * bet)}`, 1.9);
        sfx('upgrade');
        break;
      }
      case 'sharkIn': ui.banner('鲨鱼怪 ×68', 'blue', '一发入魂', 1.3); break;
      case 'magicIn':
        // the 宝箱怪战场关 keeps calling it back: its entrance line only the first time
        if (this.hunt) { if (this.hunt.intro) break; this.hunt.intro = true; }
        magicIntro();
        break;
      case 'magicOut': ui.banner('宝箱怪跑了', 'blue', this.hunt ? '马上还会回来' : '', 1.1); break;
      case 'magicBurst': this.onFishMagic(d); break;
      case 'partnerMagic': fv.onBossBurst(d.f); ui.banner('伙伴打中宝箱怪 ×50', 'blue', `+${fmt(d.win)}`, 1.6); break;
      case 'tide': ui.banner('尸潮来了', 'blue', '', 1.2); sfx('whoosh'); break;
      case 'bossBurst': this.onBossBurst(d); break;
      case 'bossOut':
        if (d.f.escape) ui.banner('差一点！', 'blue', `黄金机甲带着 ${Math.min(95, 40 + d.f.hits * 3)}% 的伤跑了 · 下一只一定爆`, 2.0);
        else ui.banner('黄金机甲跑了', 'blue', '', 1.2);
        break;
      case 'partnerCatch': if (d.f.mult >= 8) ui.coinText(d.win, d.f.x, 0.6, d.f.z, false, true); fv.onCatch(d.f, false); break;
      case 'partnerBoss':
        fv.onBossBurst(d.f); fv.bossCoins(d.f, 30); sfx('boom');
        ui.banner(`伙伴爆了 ×${d.mult}`, 'blue', `+${fmt(d.win)}`, 1.8);
        break;
      case 'broke':
        if (this.hunt) {
          // the last shells may still land; then the 宝箱怪 runs off with the cards
          this.after(1.6, () => { if (this.hunt && !this.fsim.paused) { ui.banner('炮台的金币打光了', 'red', '宝箱怪跑了', 1.6); sfx('fail'); this.after(1.8, () => this.finishHunt()); } });
          break;
        }
        ui.broke(true);
        break;
      case 'unbroke': ui.broke(false); break;
      case 'lock': sfx('ui'); break;
      case 'bet':
        ui.updateBet(this.fsim, this.betText(this.fsim));
        sfx(d.bet > 1 ? 'coin' : 'ui', d.bet);
        ui.betToast(`炮倍 <b>${kmb(SHOT * d.bet)}</b>：每发花 <b>${fmt(SHOT * d.bet)}</b> · 打中的僵尸按倍数赢<br><em>命中率不变，输赢一起放大</em>`);
        if (this.teachOpen) { this.teachOpen = false; this.after(1.2, () => this.ui.teach(null)); }
        break;
      case 'chargeFull': ui.charge(this.fsim); sfx('upgrade'); ui.betToast('技能充满了：点 <b>全屏激光</b>，扫光整片僵尸', 2200); break;
      case 'laser': fv.onLaser(d.hits); sfx('boom'); this.world.shake = 0.6; ui.banner('全屏激光', 'gold', `扫中 ${d.hits.length} 只`, 1.0); ui.charge(this.fsim); break;
      case 'torpedo': fv.onTorpedo(d.f); sfx('boom'); this.world.shake = 0.5; break;
      case 'fishEnd': this.after(0.6, () => this.finishFishing()); break;
    }
  }

  async onBossBurst({ f, bet }) {
    const ui = this.ui, fsim = this.fsim;
    fsim.paused = true;
    this.fishView.onBossBurst(f);
    sfx('slowmo'); sfx('boom');
    this.world.shake = 1.0;
    this.slowmo(0.9, 0.12);
    this.fishView.bossCoins(f, 40);
    await this.wait(1.0);
    const pool = this.fsim.cfg.script === 'missThenWin' ? WHEEL.filter(t => t.m >= 100) : WHEEL;
    const mult = weighted(pool).m, stake = SHOT * bet;
    await ui.wheel({
      title: '黄金机甲爆了！', sub: `炮倍 ${kmb(stake)}：转出几倍，就赢 ${fmt(stake)} × 几倍`,
      segments: WHEEL.map(t => ({ label: '×' + t.m })), result: WHEEL.findIndex(t => t.m === mult),
    });
    const win = stake * mult;
    this.fishView.bossCoins(f, 60);
    const top = fsim.bets[fsim.bets.length - 1];
    const lo = fsim.bets[0];
    const compare = bet > lo ? `同一只黄金机甲，炮倍 ${kmb(SHOT * lo)} 只赢 ${fmt(SHOT * lo * mult)}` : `如果是炮倍 ${kmb(SHOT * top)}，这一下赢 ${fmt(SHOT * top * mult)}`;
    await ui.bigWin({ tier: mult >= 150 ? 2 : mult >= 100 ? 1 : 0, label: '黄金机甲', mult, amount: win, sub: `炮倍 ${kmb(stake)} × ${mult} 倍`, compare });
    fsim.resolveBoss(mult, bet);
    ui.coinsFly(win, this.world.w / 2, this.world.h * 0.45, 22);
    save.best = Math.max(save.best, mult); save.bestWin = Math.max(save.bestWin, win);
    persist();
    fsim.paused = false;
  }

  // leave 末日战场: the 结算 summary
  finishFishing(next) {
    if (this.hunt) { this.finishHunt(); return; }
    if (this.state !== 'fishing') return;
    this.state = 'result';
    music(null);
    const ui = this.ui, fs = this.fsim.stats;
    ui.fishBar(false); ui.session(false); ui.broke(false); ui.teach(null); ui.prompt(null);
    const bossWon = fs.bossWins.reduce((a, b) => a + b.win, 0);
    bridge.track('fishing_end', { shots: fs.shots, spent: fs.spent, won: fs.won, kills: fs.kills, boss: bossWon, ms: Date.now() - (this.fishT0 || Date.now()) });
    // 峰终: one summary, the big wins grouped by kind (not one line per win); details on a second layer
    const NAME = { chain: '电击怪连锁', chest: '爆破宝箱', lion: '雪怪步步高', ingot: '运钞元宝', crit: '裹布蛛暴击' };
    const groups = new Map();
    for (const b of fs.bossWins) {
      const k = b.special ? NAME[b.special] || b.special : b.magic ? '宝箱怪' : '黄金机甲';
      const g = groups.get(k) || { name: k, n: 0, win: 0, best: 0 };
      g.n++; g.win += b.win; g.best = Math.max(g.best, b.mult);
      groups.set(k, g);
    }
    persist();
    if (next === 'run') { this.start(save.next); return; }
    this.after(0.3, async () => {
      const act = await ui.fishResult({ shots: fs.shots, spent: fs.spent, won: fs.won, kills: fs.kills, fishWon: fs.won - bossWon,
        best: fs.bestWin ? { name: fs.bestName || '大怪', mult: fs.bestMult || 0, win: fs.bestWin } : null, groups: [...groups.values()].sort((a, b) => b.win - a.win), total: save.wallet - this.fishStart });
      if (act === 'again') this.startFishing();
      else this.onResultAction(act);
    });
  }

  // ---------------------------------------------------------------- time helpers
  slowmo(realSec, scale) { this.slow = realSec * TUNE.slowmo; this.slowScale = scale; }
  wait(sec) { return new Promise(r => this.after(sec, r)); }

  // ---------------------------------------------------------------- frame
  update(realDt) {
    this.campaign.update(realDt);
    for (const w of this.waits) w.t -= realDt;
    const due = this.waits.filter(w => w.t <= 0);
    this.waits = this.waits.filter(w => w.t > 0);
    for (const w of due) w.fn();

    if (this.slow > 0) { this.slow -= realDt; this.timeScale = this.slowScale; } else this.timeScale = damp(this.timeScale, 1, 8, realDt);
    // a teaching moment freezes (or slows) the run until the player does what it shows
    const tscale = this.tutor.update(realDt);
    const dt = realDt * this.timeScale * tscale;
    const ui = this.ui;
    ui.labels.begin();
    this.coinComboT = Math.max(0, this.coinComboT - realDt);
    this.shotSfx -= realDt;

    if (this.sim) {
      const st = this.state;
      if (st === 'run' || st === 'intro' || st === 'load') {
        if (st === 'run' && this.keyDir) this.sim.squad.x = this.sim.clampX(this.sim.squad.x + this.keyDir * 13 * (tscale ? dt : realDt));
        if (this.bot && st === 'run') this.botSteer(dt);
        this.sim.update(dt);
        const s = this.sim.squad;
        if (this.sim.phase === 'run' || this.sim.phase === 'arrive') ui.progress(true, this.sim.stand ? Math.min(1, 1 - (s.z - this.sim.endZ) / this.sim.len0) : Math.min(1, -s.z / -this.sim.endZ));
        const BB = this.sim.boss;
        // Top Lords: the boss bar comes in layers (×8 → ×1); it also says what the 大怪 pays
        if (BB && st !== 'load' && !this.camHold) ui.bossBar(BB.alive && !BB.escaping, BB.name, BB.hp / BB.maxhp, !!BB.passive, { layers: BB.passive ? 1 : BB.big ? 8 : 5, pay: 0 });
        this.flushKills(dt);
        const ph = this.sim.phase;
        if (ph === 'boss') ui.foes(false);
        else if (this.L.stake && (ph === 'run' || ph === 'arrive')) {
          this.foesT = (this.foesT || 0) - dt;
          if (this.foesT <= 0) { this.foesT = 0.2; const f = this.sim.foes(); ui.foes(false); }
        }
        if (ph === 'finale' && this.fin) this.updateFin(dt);
      }
      if (st === 'load') this.updateLoad(dt);
      // low quality draws at most 120 of the squad (the count bubble still shows the real number)
      if (this.runView) this.runView.drawMax = this.perf && this.perf.level >= 2 ? 120 : 0;
      this.runView?.update(dt, ui.labels);
      this.evacView?.update();
    }
    // 一星剧本 keeps each level near its script: at 40% and 15% shells left, the rest are re-priced from what
    // the pool has already paid (a lucky early hit makes the rest of the pool cheaper, a dry run makes it richer)
    if (this.bsim && this.state === 'bonus' && this.R.plan !== undefined && this.R.adj < 2) {
      const B = this.bsim, at = this.R.adj === 0 ? 0.4 : 0.15;
      if (B.left <= B.shots * at) {
        const paid = this.R.bonus + this.R.dragon + (this.R.egg || 0) + this.R.rain + (this.R.special || 0);
        const per = SHOT * 1.2 * Math.max(1, B.left);
        B.k = clamp((this.R.plan - paid) / per, 0.02, B.k * 3);
        this.R.adj++;
      }
    }
    const fsim = this.bsim || this.fsim;
    if (fsim) {
      fsim.update(dt);
      if (this.fsim) this.fsim.tickEnd(dt);
      this.fishView.update(dt, fsim, ui.labels, { showLock: !fsim.hold });
      if (this.bsim && this.state === 'bonus') ui.bonusHud(true, this.bsim, this.bonusChips(), this.R.bonus + this.R.dragon + this.R.rain + (this.R.special || 0));
      if (this.fsim && this.state === 'fishing') this.ui.charge(this.fsim);
      if (this.hunt && this.fsim) ui.cannonBar(true, { bet: SHOT * 10, hits: this.fsim.magicHits, pool: this.hunt.budget - this.hunt.spent, pool0: this.hunt.budget });
      if (this.fsim && this.fsim.crit) ui.critBar(true, this.fsim.crit.t, 8, this.fsim.crit.total);
      if (this.fsim && this.state === 'fishing' && !this.fsim.hold) {
        const t = Math.floor(this.fsim.t), net = this.fsim.stats.won - this.fsim.stats.spent;
        ui.session(true, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, net);
        ui.netButton(true, '结算本场');
      }
    }

    // camera
    if (this.tw) {
      const tw = this.tw; tw.t += realDt;
      const k = easeInOut(Math.min(1, tw.t / tw.dur));
      this.cam.pos.lerpVectors(tw.from.pos, tw.to.pos, k);
      this.cam.look.lerpVectors(tw.from.look, tw.to.look, k);
      this.world.setCamera(this.cam.pos, this.cam.look);
      if (tw.t >= tw.dur) this.tw = null;
    } else if (this.camHold) {
      // a cut-in (the boss's victory) keeps its framing until the result
    } else if (this.sim && (this.state === 'run' || this.state === 'intro')) {
      const s = this.sim.squad;
      if (this.sim.phase === 'extract' || this.sim.phase === 'boss' || (this.sim.phase === 'finale' && this.sim.fin && !RUN_FIN.has(this.sim.fin.type)) || (this.sim.phase === 'done' && this.fin && !RUN_FIN.has(this.fin.type))) {
        // the finales look further ahead and down on their targets (the barrel wall from higher up)
        const fz = this.fin && !RUN_FIN.has(this.fin.type);
        const vault = fz && this.fin.type === 'vault';
        this.camT.pos.set(0, vault ? 24 : 18.5, s.z + (vault ? 9 : 13)); this.camT.look.set(0, fz ? 0.4 : 1.4, s.z - (vault ? 14 : fz ? 15 : 13));
        this.world.camPos.lerp(this.camT.pos, 1 - Math.exp(-3 * dt)); this.world.camLook.lerp(this.camT.look, 1 - Math.exp(-3 * dt));
      } else if (this.sim.fin && RUN_FIN.has(this.sim.fin.type)) {
        // 彩虹滚轮 / 金砖墙: ride along just behind the squad, looking down into the gaps or at the next walls
        const br = this.sim.fin.type === 'bricks';
        this.camT.pos.set(0, br ? 12 : 14, s.z + (br ? 10 : 11)); this.camT.look.set(0, br ? 0.4 : -0.6, s.z - (br ? 10 : 9));
        this.world.camPos.lerp(this.camT.pos, 1 - Math.exp(-4 * dt)); this.world.camLook.lerp(this.camT.look, 1 - Math.exp(-4 * dt));
      } else {
        // the camera pulls back as the squad grows (Last War style)
        const want = 1 + clamp((visCount(s.N) - 50) / 190, 0, 1) * TUNE.zoomMax + (this.sim.stand ? TUNE.standZoom : 0);
        this.zoom = damp(this.zoom, this.sim.phase==='search'?1.18:want, 1.6, dt);
        this.world.runPose(s.z, this.cam, this.zoom);
        this.poiPan=damp(this.poiPan||0,this.sim.activePoint?Math.sign(this.sim.activePoint.x)*1.6:0,3,dt);
        this.cam.look.x=this.poiPan;this.cam.pos.x=this.poiPan*.25;
        if (this.sim.phase === 'arrive') { this.world.camPos.lerp(this.cam.pos, 1 - Math.exp(-6 * dt)); this.world.camLook.lerp(this.cam.look, 1 - Math.exp(-6 * dt)); }
        else this.world.setCamera(this.cam.pos, this.cam.look);
      }
    } else if (this.state === 'load') {
      this.world.camPos.lerp(this.camT.pos, 1 - Math.exp(-2.4 * realDt)); this.world.camLook.lerp(this.camT.look, 1 - Math.exp(-2.4 * realDt));
    }

    this.fx.update(dt);
    this.world.update(dt);
    ui.labels.end();
  }

  // the finale HUD and the 一星剧本 re-pricing of the timed finales (fish and barrels pay on what the squad hits)
  updateFin(dt) {
    const Fn = this.fin, F = Fn.F;
    const run = RUN_FIN.has(Fn.type);
    this.ui.finaleHud(!F.over, { name: SURPRISES[Fn.type].name, left: run ? null : Math.max(0, F.dur - F.t), dur: F.dur, total: this.R.fin, chip: Fn.chip, rainbow: run, soldiers: this.sim.squad.N });
    if ((Fn.type === 'fishleap' || Fn.type === 'vault') && Fn.want && Fn.adj < 2) {
      const at = Fn.adj === 0 ? 0.5 : 0.8;
      if (F.t >= F.dur * at) {
        Fn.adj++;
        // what is still to win: the barrels left (at the rate they are falling), or the fish still to come (at the
        // share of fish the squad has been catching)
        let left;
        if (Fn.type === 'vault') {
          const rest = this.sim.barrels.filter(r => r.vault && r.alive).reduce((a, r) => a + r.m, 0);
          left = Math.min(rest, F.units / Math.max(0.5, F.t) * (F.dur - F.t) * 1.2);
        } else {
          const spawned = F.fish.reduce((a, f) => a + f.m, 0), rest = F.plan.reduce((a, p) => a + p.m, 0) + F.fish.filter(f => f.alive).reduce((a, f) => a + f.m, 0);
          left = rest * clamp(F.units / Math.max(1, spawned - F.fish.filter(f => f.alive).reduce((a, f) => a + f.m, 0)), 0.2, 1);
        }
        Fn.chip = clamp((Fn.want - Fn.paid) / Math.max(1, left), Fn.chip0 * 0.5, Fn.chip0 * 1.6);
      }
    }
  }

  // Autopilot for testing ('best' | 'mostly' | 'random', see src/sim/bot.js). Its own random stream comes from the
  // sim's seed (bot.js botRng), so a seeded run replays with the same bot choices.
  botSteer(dt) { steer(this.sim, this.bot, dt); }
}
