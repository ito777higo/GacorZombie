import {check,eq,done} from './lib.js';
import {LEVELS} from '../src/content/levels.js';
import {RunSim} from '../src/sim/runsim.js';
import {beginExtraction,extractionReward} from '../src/sim/extraction.js';
import {steer} from '../src/sim/bot.js';

for(const L of LEVELS){
 check(L.experience&&L.finale.after==='evac',L.code+' uses combat extraction');
 check(!L.magic&&!L.bonus&&!L.reward&&!L.finale.ladder,L.code+' removes casino finale and fishing rewards');
 check(!JSON.stringify(L.run.seq).includes('"fish"')&&!L.run.seq.some(t=>t[0]==='f'),L.code+' no fishing targets');
 const events=[],s=new RunSim(L,(k,d)=>events.push(k),1,{seed:71});
 s.squad.N=100;s.squad.R=2;beginExtraction(s);
 check(!beginExtraction(s),'cannot restart the same extraction');
 for(let t=0;t<20&&s.phase==='extract';t+=1/60){steer(s,'best',1/60);s.update(1/60);}
 check(s.extraction.complete&&s.phase==='done',L.code+' extraction finishes with active enemies');
 eq(events.filter(k=>k==='extractionEnd').length,1,'one completion');
}
const fixture=()=>{const s=new RunSim(LEVELS[3],()=>{},1,{seed:2});s.squad.N=100;s.squad.R=2;beginExtraction(s);s.extraction.nextWave=100;s.extraction.nextWarning=100;s.extraction.warning={x:0,left:.05};return s;};
const hit=fixture();hit.update(.1);eq(hit.squad.N,88,'standing in announced danger loses 12 percent');
const dodge=fixture();dodge.squad.x=3.5;dodge.update(.1);eq(dodge.squad.N,100,'moving out prevents danger damage');
const shield=fixture();shield.squad.shield=1;shield.update(.1);eq(shield.squad.N,100,'existing shelter shield blocks impact');eq(shield.squad.shield,0,'shield actually consumed');
const dead=fixture();dead.setN(0,'zombie');eq(dead.phase,'fail','zero squad fails extraction');dead.update(20);check(!dead.extraction.complete,'failure cannot become extraction success');
eq(extractionReward(LEVELS[3],{survivors:12,cargo:2}).total,51200,'explicit reward formula: mission + survivors + cargo');
eq(extractionReward(LEVELS[0],{survivors:12,cargo:2}).total,0,'first chapter stays coin-free');
done('extraction');
