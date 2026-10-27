import {check,eq,done} from './lib.js';
import {JOURNEY_LEVELS as LEVELS,GEAR} from '../src/content/journey.js';
import {RunSim} from '../src/sim/runsim.js';
import {startPoint,requestSearch,tickPoint} from '../src/sim/journeysim.js';
import {freshJourney,secureCargo,sellItem,buyGear} from '../src/journey/economy.js';
for(const L of LEVELS){
  eq(L.finale.after,'journey',L.code+' ends at convoy');eq(L.stake,0,L.code+' no kill payout');
  eq(L.story.pois.filter(p=>p.required).length,1,L.code+' one main destination');
  check(L.story.pois.some(p=>!p.required&&p.alarm),L.code+' optional announced risk');
  check(!L.run.seq.some(t=>['f','fish','mb'].includes(t[0])),L.code+' no fishing or cash monster');
}
const make=()=>{const events=[],s=new RunSim(LEVELS[0],(k,d)=>events.push({k,d}),1,{seed:42});s.start();s.zombies=[];s.squad.z=s.pois[0].z+18;startPoint(s,s.pois[0]);return{s,events};};
const quiet=make(),N=quiet.s.squad.N;check(requestSearch(quiet.s),'clear approach searches');for(let i=0;i<90;i++)tickPoint(quiet.s,1/60);
eq(quiet.events.filter(e=>e.k==='pointFound').length,1,'search completes once');eq(quiet.s.squad.N,N,'three civilians do not become soldiers');eq(quiet.events.filter(e=>e.k==='pointAlarm').length,0,'quiet rescue causes no alarm');
const force=make(),z=force.s.mkZombie(0,force.s.squad.z-35,999,1,false);z.guardPoint=force.s.activePoint.id;force.s.zombies.push(z);
check(requestSearch(force.s),'search allowed with guards alive');check(force.s.activePoint.forced,'records breach risk');for(let i=0;i<90;i++)tickPoint(force.s,1/60);check(force.s.activePoint,'breaching is slower');for(let i=0;i<90;i++)tickPoint(force.s,1/60);eq(force.events.filter(e=>e.k==='pointAlarm').length,1,'breaching draws actual enemies');check(force.s.zombies.length>1,'reinforcements exist in combat state');
const save={wallet:0,journey:freshJourney()},run={id:'1',code:'1-1',people:3,bag:[{type:'photo',quest:true},{type:'wire',quest:false}]};
const out=secureCargo(save.journey,run,true);eq(out.people,3,'rescue recorded');eq(save.journey.stash.length,1,'only tradable goods enter stash');eq(out.delivered.length,1,'photo retained by story');eq(save.wallet,0,'estimated value does not auto-credit');eq(out.value,180,'visible item value');check(secureCargo(save.journey,run,true).duplicate,'cannot pay same run twice');
const old=JSON.stringify(save.journey.stash);const fail=secureCargo(save.journey,{...run,id:'2'},false);eq(fail.lost.length,2,'failure loses all unsecured cargo');eq(JSON.stringify(save.journey.stash),old,'failure preserves secured cargo');eq(sellItem(save,0),180,'selling credits exact amount');eq(save.wallet,180,'wallet receives sale');check(!buyGear(save,'mag'),'cannot buy without funds');save.wallet=GEAR[0].price;check(buyGear(save,'mag'),'purchase succeeds');eq(save.wallet,0,'deducts price');check(!buyGear(save,'mag'),'cannot buy duplicate');check(save.journey.gear.mag,'gear ownership persists');
const retry=secureCargo(save.journey,{...run,id:'3'},true);eq(retry.people,0,'replaying same rescue does not invent residents');
done('journey');
