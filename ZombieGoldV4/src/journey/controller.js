import {save,persist,runtime} from '../platform/save.js';
import {LEVELS} from '../content/levels.js';
import {GOODS,GEAR,cargoValue} from '../content/journey.js';
import {freshJourney,secureCargo,sellItem,buyGear} from './economy.js';
import {requestSearch,tickPoint} from '../sim/journeysim.js';
import {steer} from '../sim/bot.js';
import {updateJourneyWorld} from '../view/journeyworld.js';
import {sfx,unlockAudio} from '../platform/audio.js';
import {fmt} from '../sim/util.js';

const state=()=>save.journey||=(freshJourney());
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const itemIcon=type=>`<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="13" width="34" height="27" rx="5" fill="${GOODS[type]?.color||'#aeb99e'}" stroke="#253c32" stroke-width="3"/>${type==='meds'?'<path d="M24 18v17M16 26h16" stroke="#a85445" stroke-width="5"/>':type==='fuel'?'<path d="M18 13V8h14v5M15 21l18 13M33 21L15 34" fill="none" stroke="#4d5c40" stroke-width="3"/>':type==='wire'?'<circle cx="24" cy="26" r="9" fill="none" stroke="#735334" stroke-width="5"/>':type==='radio'?'<path d="M33 14L40 3M12 21h17M12 27h17M12 33h17" stroke="#2b493e" stroke-width="3"/><circle cx="35" cy="29" r="3" fill="#edc66e"/>':type==='photo'?'<circle cx="24" cy="24" r="5" fill="#7f8769"/><path d="M15 36q9-16 18 0" fill="#7f8769"/>':'<path d="M15 20h18v13H15zM19 16v4M27 16v4" fill="none" stroke="#405f4e" stroke-width="3"/>'}</svg>`;

export class Journey {
  constructor(game){
    this.game=game;const frame=document.querySelector('#frame');
    this.hud=document.createElement('div');this.hud.className='cargo-hud';this.hud.hidden=true;
    this.radio=document.createElement('div');this.radio.className='story-radio';this.radio.hidden=true;
    this.panel=document.createElement('div');this.panel.className='point-panel';this.panel.hidden=true;
    this.overlay=document.createElement('div');this.overlay.className='ov cargo-overlay';this.overlay.hidden=true;
    this.reveal=document.createElement('div');this.reveal.className='loot-reveal';this.reveal.hidden=true;
    frame.append(this.hud,this.radio,this.panel,this.overlay,this.reveal);
    this.hud.onclick=e=>{if(e.target.closest('[data-heal]'))this.heal();};
  }
  choose(i,options={}){
    const L=LEVELS[i];if(!L)return false;
    const c=state();c.runs++;this.pending={id:String(c.runs),code:L.code,policy:options.policy||'greedy'};
    this.overlay.hidden=true;runtime.pause=false;persist();
    return this.game.start(i,{...options,planned:true,skipIntro:true});
  }
  configure(L){return L;}
  begin(sim,editing){
    this.active={...(editing?{id:'edit',code:sim.L.code,policy:'greedy'}:this.pending),editing,bag:[],people:0,usedHeal:false,boarding:0};this.pending=null;this.outcome=null;
    this.game.tutor.clear();this.game.tutor.reset(sim.L);
    if(!editing){
      const gear=state().gear;
      if(gear.mag)sim.squad.rate*=1.2;
      if(gear.barrel){sim.squad.dmg*=1.25;sim.squad.tier++;}
      if(gear.vest)sim.squad.shield++;
      this.say(sim.L.story.speaker,sim.L.story.call,5);
    }
  }
  say(who,text,seconds=4){this.radio.innerHTML=`<span class="radio-avatar">${esc(who.slice(0,1))}</span><div><small>车队电台 · ${esc(who)}</small><p>${esc(text)}</p></div><i>◖))</i>`;this.radio.hidden=false;this.radioT=seconds;}
  hideHud(){this.hud.hidden=true;this.radio.hidden=true;this.panel.hidden=true;this.reveal.hidden=true;}
  event(k,d){
    if(!this.active)return;
    if(k==='pointStart'){this.game.tutor.clear();this.game.ui.hideBanner();this.game.ui.dragHint(false);document.querySelector('#chapterCard').hidden=true;this.say(this.game.L.story.speaker,d.p.people?'停下掩护！点击下方按钮开门，把里面的人接出来。':d.p.line,6);sfx('ui');}
    if(k==='pointFound'){
      const p=d.p,a=this.active;a.people+=p.people;
      for(const type of p.items){if(a.bag.length>=6)break;a.bag.push({type,quest:p.required&&['meds','fuel','tools','circuit','photo'].includes(type),id:`${a.id}-${p.id}-${a.bag.length}`});}
      this.panel.hidden=true;this.say(p.people?this.game.L.story.speaker:'车队',p.found||'物资拿到了。带到车上，才算真正属于我们。',4);sfx('upgrade');
      this.reveal.innerHTML=`<small>${p.people?`接到 ${p.people} 人 · 还需护送上车`:'搜索完成 · 尚未安全带出'}</small><div>${p.items.map(type=>`<span>${itemIcon(type)}<b>${GOODS[type].name}</b><em>${p.required&&['meds','fuel','tools','circuit','photo'].includes(type)?'任务/纪念物':`${fmt(GOODS[type].value)} 金`}</em></span>`).join('')}</div>`;
      this.reveal.hidden=false;this.revealT=3.1;
    }
    if(k==='searchStart'&&d.p.forced){this.say('司机','直接破门！我们掩护，动静可能把附近的感染者引来。',3);}
    if(k==='pointAlarm'){this.say('司机',d.p.alarm?'警报把后院的感染者引来了！带着东西往前走，车队在等。':'破门声引来了附近的感染者！别停，车队在等。',4);sfx('boss');}
  }
  heal(){
    const a=this.active,g=this.game,s=g.sim;if(!a||a.usedHeal||!s||s.squad.N<=0||s.stats.lost===0)return false;
    const n=Math.min(s.stats.lost-(s.healed||0),Math.max(2,Math.ceil(s.stats.peak*.25)));if(n<=0)return false;
    a.usedHeal=true;s.healed+=n;s.setN(s.squad.N+n,'heal');sfx('upgrade');this.say('阿岚',`${n} 名队员已经包扎好，继续走。`,2);return true;
  }
  arrive(){
    const g=this.game,a=this.active;if(!a){g.finish(true);return;}
    if(g.sim.pois.some(p=>p.required&&!p.done)){g.finish(false,'objective');return;}
    this.board();
  }
  board(){
    const a=this.active,g=this.game;if(!a||a.boarding)return;
    if(g.sim.squad.N<=0)return;
    a.boarding=.001;g.state='boarding';g.sim.phase='search';g.sim.activePoint=null;g.ui.hideBanner();g.ui.progress(false);g.ui.bossBar(false);this.panel.hidden=true;this.reveal.hidden=true;
    this.say('司机','接应车到了！再掩护两秒，让大家上车！',3);sfx('land');
  }
  finish(win){
    const a=this.active;if(!a)return null;
    if(a.editing){this.active=null;this.hideHud();return null;}
    const result=secureCargo(state(),a,win);
    if(win&&!result.duplicate){result.bounty=this.game.L.story.reward;save.wallet+=result.bounty;}
    this.outcome={...result,parts:0,story:this.game.L.story.end,scene:this.game.L.story.scene};this.active=null;this.hideHud();persist();return this.outcome;
  }
  update(dt=0){
    const g=this.game,a=this.active,sim=g.sim;
    if(this.radioT>0){this.radioT-=dt;if(this.radioT<=0)this.radio.hidden=true;}
    if(this.revealT>0){this.revealT-=dt;if(this.revealT<=0)this.reveal.hidden=true;}
    if(!a||!sim){this.hud.hidden=true;this.panel.hidden=true;return;}
    this.hud.hidden=!['run','intro','boarding'].includes(g.state);
    const html=`<div><small>随身物资 · 未安全带出</small><b>${a.bag.length}/6 格 <em>估值 ${fmt(cargoValue(a.bag.filter(x=>!x.quest)))} 金</em></b><span>${a.bag.map(i=>itemIcon(i.type)).join('')}</span></div><button type="button" data-heal ${a.usedHeal?'disabled':''}>${a.usedHeal?'包扎已用':'包扎 ×1'}</button>`;
    if(html!==this.hudHtml){this.hudHtml=html;this.hud.innerHTML=html;}
    if(a.boarding){if(g.state==='boarding'){if(g.bot)steer(sim,g.bot,dt);else if(g.keyDir)sim.squad.x=sim.clampX(sim.squad.x+g.keyDir*13*dt);tickPoint(sim,dt);if(sim.phase!=='fail'){a.boarding+=dt;if(a.boarding>2.2){sim.phase='done';g.finish(true);}}}updateJourneyWorld(g.world,sim,dt,a.boarding);return;}
    updateJourneyWorld(g.world,sim,dt);
    const p=sim.activePoint;
    if(!p||sim.phase!=='search'){this.panel.hidden=true;return;}
    const guards=sim.zombies.filter(z=>z.guardPoint===p.id&&z.alive).length;
    if(g.bot&&!p.searching&&!guards){if(!p.required&&a.policy==='safe')this.board();else requestSearch(sim);}
    this.panel.hidden=false;
    // Keep interactive nodes alive from pointerdown to pointerup. Serialized innerHTML differs
    // from boolean/data attributes in a template and used to replace this button every frame.
    if(this.panelPoint!==p){
      this.panelPoint=p;
      this.panel.innerHTML=`<small>${p.required?'停靠救援 · 需要点击操作':'可选搜索 · 也可直接接应'}</small><h3>${esc(p.name)}</h3><p data-point-status aria-live="polite"></p><div class="point-guide" data-point-guide>↓ 点击下面的按钮继续</div><div class="search-track" data-point-progress hidden><i></i></div><div class="point-actions"><button type="button" data-search></button>${!p.required?'<button type="button" data-leave>带着已有物资回车队</button>':''}</div>`;
      this.panel.querySelector('[data-search]').onclick=()=>{if(sim.activePoint!==p||p.searching)return;unlockAudio();sfx('ui');requestSearch(sim);};
      this.panel.querySelector('[data-leave]')?.addEventListener('click',()=>{unlockAudio();this.board();});
    }
    const action=p.action||(p.people?'打开门 · 救出被困人员':'继续搜索 · 会触发警报');
    const status=p.searching?`${p.forced?'正在破门':'正在开门搜索'} · ${Math.round(Math.min(1,p.progress)*100)}%，左右移动继续掩护。`:
      guards?`门前还有 ${guards} 只感染者：左右移动清理，或点按钮直接破门（更慢，会引来追兵）。`:
      p.required?`门前已清空。点击「${action}」继续，不用对着车门开枪。`:'任务物资已拿到。继续搜索会触发警报，也可以点击下方接应按钮结束行动。';
    const label=a.bag.length>=6?'背包已满':guards?(p.people?`点击破门 · 救出 ${p.people} 人`:'点击破门搜索 · 会引来追兵'):`点击${action}`;
    const button=this.panel.querySelector('[data-search]');
    if(button.textContent!==label)button.textContent=label;
    button.disabled=!!p.searching||a.bag.length>=6;
    this.panel.querySelector('[data-point-status]').textContent=status;
    this.panel.querySelector('[data-point-guide]').hidden=!!p.searching;
    this.panel.querySelector('.point-actions').hidden=!!p.searching;
    const progress=this.panel.querySelector('[data-point-progress]');progress.hidden=!p.searching;progress.firstElementChild.style.width=Math.min(1,p.progress||0)*100+'%';
  }
  shelter(){this.warehouse();}
  warehouse(){
    const was=runtime.pause;runtime.pause=true;
    const render=()=>{
      const c=state();this.overlay.hidden=false;
      this.overlay.innerHTML=`<div class="warehouse"><small>17 号车队 · 行李与整备</small><h2>带回来的，才是你的</h2><p class="warehouse-balance">金币 <b>${fmt(save.wallet)}</b></p><h3>安全仓库 <span>${c.stash.length} 件</span></h3><div class="warehouse-items">${c.stash.map((i,n)=>`<button type="button" data-sell="${n}">${itemIcon(i.type)}<b>${GOODS[i.type].name}</b><em>出售 +${GOODS[i.type].value} 金</em></button>`).join('')||'<p>还没有安全带回的物资。行动中找到的东西，成功回车队后会放在这里。</p>'}</div><button type="button" class="story-secondary" data-sellall ${c.stash.length?'':'disabled'}>出售全部可交易物资</button><h3>出发装备</h3><div class="gear-list">${GEAR.map(x=>`<button type="button" data-buy="${x.id}" ${c.gear[x.id]||save.wallet<x.price?'disabled':''}><b>${x.name}</b><span>${x.desc}</span><em>${c.gear[x.id]?'已装配':`${x.price} 金`}</em></button>`).join('')}</div><button type="button" class="story-primary" data-close>装好行李，继续上路</button></div>`;
      this.overlay.querySelectorAll('[data-sell]').forEach(b=>b.onclick=()=>{sellItem(save,+b.dataset.sell);persist();sfx('cashout');render();});
      this.overlay.querySelector('[data-sellall]').onclick=()=>{while(c.stash.length)sellItem(save,0);persist();sfx('cashout');render();};
      this.overlay.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>{if(buyGear(save,b.dataset.buy)){persist();sfx('upgrade');render();}});
      this.overlay.querySelector('[data-close]').onclick=()=>{this.overlay.hidden=true;runtime.pause=was;gRefresh();};
    };
    const gRefresh=()=>{document.querySelectorAll('[data-map-wallet]').forEach(e=>e.textContent=fmt(save.wallet));};render();
  }
  confirmExit(){
    if(!this.active||!['run','intro','boarding'].includes(this.game.state))return false;
    runtime.pause=true;this.overlay.hidden=false;this.overlay.innerHTML='<div class="warehouse exit-confirm"><small>行动暂停</small><h2>物资还没有带出去</h2><p>现在放弃，随身物资会丢失。之前仓库里的物资和装备保留。</p><button class="story-primary" data-resume>继续这次救援</button><button class="story-secondary" data-abandon>放弃随身物资，回路线</button></div>';
    this.overlay.querySelector('[data-resume]').onclick=()=>{this.overlay.hidden=true;runtime.pause=false;};
    this.overlay.querySelector('[data-abandon]').onclick=()=>{this.active=null;this.overlay.hidden=true;runtime.pause=false;this.game.onMap?.();};return true;
  }
}
