import { check, eq, done } from './lib.js';
import { ACTIONS, newCamp, buildExpedition, settleExpedition, upgradeCamp, healAmount } from '../src/campaign/rules.js';
import { LEVELS } from '../src/content/levels.js';

for (const L of LEVELS) {
  const before = JSON.stringify(L), gateCount = L.run.seq.filter(x=>x[0]==='g').length;
  for (const action of Object.keys(ACTIONS)) {
    const plan = buildExpedition(L, action, newCamp());
    eq(plan.run.seq.filter(x=>x[0]==='g').length, gateCount, `${L.code}/${action} keeps teaching gate indexes`);
    check(plan.run.startAbs > 0, `${L.code}/${action} starts with a squad`);
    if (action==='rescue') eq(plan.run.seq.filter(x=>x[0]==='cage').length, L.run.seq.filter(x=>x[0]==='cage').length+2, 'two real rescue cages');
  }
  eq(JSON.stringify(L), before, `${L.code} original table stays unchanged`);
}
const c = newCamp();
const result = {runId:'1',action:'rescue',rescued:10,crates:2,extracted:8,kills:42,win:true};
const reward = settleExpedition(c,result);
eq(reward.people,8,'only surviving rescued people enter camp');eq(reward.parts,18,'parts reflect recovered crates and kills');
check(upgradeCamp(c),'wall can be repaired with enough people and parts');eq(c.level,1,'upgrade level');eq(c.parts,0,'parts spent');eq(c.people,8,'people are residents, not spent');
const once = JSON.stringify(c);check(settleExpedition(c,result).duplicate,'same result cannot pay twice');eq(JSON.stringify(c),once,'duplicate leaves camp unchanged');
check(!upgradeCamp(c),'cannot upgrade without resources');
const fail = settleExpedition(c,{...result,runId:'2',win:false});eq(fail.people,0,'no residents from failed rescue');eq(fail.parts,3,'failure preserves only part of collected supplies');
const gain = settleExpedition(c,{...result,runId:'3',action:'scavenge',rescued:0});eq(gain.parts,reward.parts+12,'scavenge has larger salvage reward');
eq(c.medkits,3,'every second successful extraction replenishes a medkit, capped at three');
const boosted = buildExpedition({...LEVELS[0],run:{...LEVELS[0].run,startN:3}},'evacuate',{...newCamp(),level:3});eq(boosted.run.startAbs,13,'legacy camp fixture: evacuation and radio add immediate squad support');
eq(healAmount({stats:{lost:20,peak:100},healed:12}),8,'cannot revive more than remaining injured');eq(healAmount({stats:{lost:0,peak:100},healed:0}),0,'no heal when uninjured');
eq(healAmount({stats:{lost:90,peak:100},healed:0}),30,'healing is limited to 30 percent of peak');
done('campaign');
