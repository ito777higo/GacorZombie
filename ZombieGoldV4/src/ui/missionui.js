import { LEVELS } from '../content/levels.js';
import { GOODS } from '../content/journey.js';
import { save } from '../platform/save.js';
import { fmt } from '../sim/util.js';
import { sfx } from '../platform/audio.js';
import { itemIcon } from '../journey/controller.js';
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function showMissionMap(ui,{current,onStart,onReset}){
  const ov=document.querySelector('#ovMap');let selected=Math.min(current,LEVELS.length-1);
  const unlocked=i=>!i||save.cleared[i-1]||save.cleared[i]||save.unlockAll;
  ov.className='ov journey-map';
  ov.innerHTML=`<header class="route-header"><small>末日之后的第三天 · 17 号车队</small><h1>断线公路</h1><p>每接回一个人，路就多亮一段。</p><button type="button" data-store>行李 / 整备 <span data-map-wallet>${fmt(save.wallet)}</span> 金</button></header><div class="route-nodes">${LEVELS.map((L,i)=>`<button type="button" class="route-node ${save.cleared[i]?'done':''}" data-i="${i}" ${unlocked(i)?'':'disabled'}><b>${save.cleared[i]?'✓':i+1}</b><span>${esc(L.title)}<small>${save.cleared[i]?'已平安归队':unlocked(i)?'可出发':'沿路继续'}</small></span></button>`).join('')}</div><footer class="route-preview"></footer>`;
  ov.hidden=false;
  const select=i=>{selected=i;const L=LEVELS[i],p=L.story.pois[0];
    ov.querySelectorAll('[data-i]').forEach(b=>b.classList.toggle('selected',+b.dataset.i===i));
    ov.querySelector('.route-preview').innerHTML=`<div class="route-heading"><span>第 ${i+1} 站 / 共 5 站</span><b>${p.people} 人等待接应</b></div><h2>${esc(L.title)}</h2><p>${esc(L.story.call)}</p><button type="button" class="story-primary" data-go>${save.cleared[i]?'重走这一段路':'开车出发'} <span>→</span></button>`;
    ov.querySelector('[data-go]').onclick=()=>{sfx('ui');ui.placeMap=null;onStart(selected);};
  };
  ov.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{sfx('ui');select(+b.dataset.i);});
  const lab=document.createElement('button');lab.type='button';lab.className='route-lab';lab.dataset.lab='';lab.textContent='⚙ 实验室';
  ov.querySelector('.route-header').append(lab);
  lab.onclick=()=>{sfx('ui');ui.labSheet({onReset,reopen:()=>showMissionMap(ui,{current,onStart,onReset})});};
  ov.querySelector('[data-store]').onclick=()=>ui.onShelter?.();select(selected);
  ui.placeMap=()=>{if(ov.hidden||!ui.mapView)return;const h=ui.world.h;ui.mapView.fit(140,h-205);for(const n of ui.mapView.layout().nodes){const el=ov.querySelector(`[data-i="${n.i}"]`);el.style.left=n.x+'px';el.style.top=n.y+'px';}};
  ui.placeMap();
}

export function showDebrief(ui,d){
  return new Promise(resolve=>{
    const ov=document.querySelector('#ovResult'),c=d.campaign||{},items=d.win?[...(c.delivered||[]),...(c.items||[])]:c.lost||[],index=LEVELS.findIndex(L=>L.code===d.L.code),last=index===LEVELS.length-1;
    ov.className='ov journey-result';
    ov.innerHTML=`<div class="journey-report"><small>${d.win?'17 号车队 · 人员清点':'17 号车队 · 通讯中断'}</small><div class="report-mark">${d.win?last?'◉':'✓':'!'}</div><h1>${d.win?last?'这里是 17 号车队':'这次，我们一起回来':'还有人没等到我们'}</h1><p class="report-place">${esc(d.L.title)}</p><blockquote>${d.win?esc(c.story||d.L.story.end):'队伍失守，随身物资遗落在路上。车队会重新组织救援。'}</blockquote><div class="report-counts"><span><b>${d.win?c.people||0:0}</b>新救援人员</span><span><b>${d.win?items.length:0}</b>安全带回物品</span><span><b>${d.kills||0}</b>清除感染者</span></div><div class="report-items">${items.map(x=>`<div class="${d.win?'':'lost'}">${itemIcon(x.type)}<b>${GOODS[x.type]?.name}</b><small>${!d.win?'未能带出':x.quest?x.type==='photo'?'留给阿岚':'已交付车队':`入库 · 估值 ${fmt(GOODS[x.type]?.value||0)} 金`}</small></div>`).join('')||'<p>空手回来也比回不来好。下一次，准备好再上路。</p>'}</div><p class="report-money">${d.win?`车队酬金 <b>+${fmt(c.bounty||0)} 金</b><span>物资估值 ${fmt(c.value||0)} 金，出售后到账</span>`:'本次随身物资丢失；原有仓库、金币与装备保留。'}</p>${d.win&&last?'<p class="broadcast-end">广播已恢复。公路向西仍然通行，新的回应正在传来。</p>':''}<button type="button" class="story-primary" data-a="${d.win&&d.hasNext?'next':d.win?'map':'retry'}">${d.win&&d.hasNext?`下一站 · ${esc(LEVELS[index+1].title)}`:d.win?'回到公路地图':'再出发，接他们回来'}</button><div class="report-actions"><button type="button" data-store>整理物资 / 装备</button><button type="button" data-a="map">公路地图</button></div></div>`;
    ov.hidden=false;sfx(d.win?'cashout':'fail');
    ov.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{ov.hidden=true;resolve(b.dataset.a);});
    ov.querySelector('[data-store]').onclick=()=>ui.onShelter?.();
  });
}
