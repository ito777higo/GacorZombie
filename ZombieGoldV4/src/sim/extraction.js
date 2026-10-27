import { evacPlan } from '../content/experience.js';
import { clamp } from './util.js';

export function beginExtraction(sim) {
  if (sim.extraction) return false;
  const s=sim.squad;
  sim.phase='extract'; s.speed=0;
  for(const r of sim.barrels)r.alive=false;
  sim.gates=[];sim.hazards=[];sim.barrels=[];sim.fish=[];sim.zombies=[];sim.bullets=[];sim.pending=[];sim.splits=[];
  sim.activeSplit=null; sim.boss=null;
  const e=sim.extraction={...evacPlan(sim.L),elapsed:0,realTime:0,nextWave:.3,waves:0,nextWarning:2.2,warning:null,signal:0,cargo:0,initial:s.N,killsAt:sim.stats.kills,signalX:sim.L.ch%2?-3:3};
  if(e.mode==='supply')for(const x of [-3.5,0,3.5]){
    const r=sim.mkBarrel('coin',4,Math.max(3,Math.ceil(Math.sqrt(s.N)*.8)),x,s.z-14);
    r.evacCargo=true;sim.barrels.push(r);
  }
  sim.emit('extractionStart',{extraction:e});return true;
}

export function tickExtraction(sim,dt) {
  const e=sim.extraction,s=sim.squad;if(!e||e.complete||sim.phase!=='extract')return;
  sim.t+=dt;e.realTime+=dt;
  const linked=e.mode==='signal'&&Math.abs(s.x-e.signalX)<1.6;
  if(linked)e.signal+=dt;
  e.elapsed+=dt*(linked?1.55:1);
  if(e.realTime>=e.nextWave&&e.elapsed<e.duration-1.8){
    const n=e.waveCount,baseHp=Math.max(4,sim.dps(s.N)*.055);
    for(let i=0;i<n;i++){
      const elite=e.mode==='hold'&&i===n-1;
      const z=sim.mkZombie(sim.rng.range(-4.8,4.8),s.z-23-sim.rng.range(0,7),baseHp*(elite?5:1),Math.max(1,Math.ceil(e.initial*(elite?.055:.018))),elite);
      z.active=true;z.speed=elite?2.5:sim.rng.range(3.5,4.7);z.wave=1000+e.waves;
      z.m=0; // Final defence rewards the mission; enemies never become slot-style multipliers.
      sim.zombies.push(z);
    }
    e.waves++;e.nextWave+=3.4;sim.emit('extractionWave',{n});
  }
  if(e.realTime>=e.nextWarning&&!e.warning&&e.elapsed<e.duration-2){
    e.warning={x:clamp(s.x,-3.6,3.6),left:1.6};e.nextWarning+=4;
    sim.emit('extractionWarning',{x:e.warning.x});
  }
  if(e.warning){
    e.warning.left-=dt;
    if(e.warning.left<=0){
      const hit=Math.abs(s.x-e.warning.x)<1.9,n=hit?Math.max(1,Math.ceil(s.N*.12)):0;
      const before=s.N;if(n)sim.setN(s.N-n,'trap');
      sim.emit('extractionImpact',{hit,n:before-s.N,shield:hit&&n>0&&before===s.N,x:e.warning.x});e.warning=null;
    }
  }
  if(sim.phase==='fail')return;
  sim.updateZombies(dt);if(sim.phase==='fail')return;
  sim.fire(dt);sim.updateBullets(dt);
  e.cargo=sim.barrels.filter(r=>r.evacCargo&&!r.alive).length;
  if(e.elapsed>=e.duration&&s.N>0){
    e.complete=true;e.survivors=s.N;e.kills=sim.stats.kills-e.killsAt;
    sim.phase='done';sim.emit('extractionEnd',{extraction:e});
  }
}

export function extractionReward(L,e) {
  if(L.ch===0)return {mission:0,survivors:0,cargo:0,total:0};
  const mission=20000*(L.ch+1),survivors=e.survivors*100,cargo=e.cargo*5000;
  return {mission,survivors,cargo,total:mission+survivors+cargo};
}
