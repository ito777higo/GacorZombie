import { GOODS,GEAR } from '../content/journey.js';
export const freshJourney=()=>({runs:0,stash:[],gear:{},rescued:{},receipts:{},journal:{}});
export function secureCargo(state,run,win){
  if(state.receipts[run.id])return {duplicate:true,items:[],value:0,people:0};
  state.receipts[run.id]=true;
  if(!win)return {win:false,items:[],lost:run.bag.map(x=>({...x})),value:0,people:0};
  const items=run.bag.filter(x=>!x.quest).map(x=>({...x}));state.stash.push(...items);
  const people=state.rescued[run.code]?0:run.people;
  state.rescued[run.code]=Math.max(state.rescued[run.code]||0,run.people);
  (state.journal||={})[run.code]={people:run.people,delivered:run.bag.filter(x=>x.quest).map(x=>x.type)};
  return {win:true,items,delivered:run.bag.filter(x=>x.quest),value:items.reduce((n,i)=>n+GOODS[i.type].value,0),people};
}
export function sellItem(save,index){
  const state=save.journey,item=state?.stash[index];if(!item)return 0;
  const amount=GOODS[item.type]?.value||0;state.stash.splice(index,1);save.wallet+=amount;return amount;
}
export function buyGear(save,id){
  const gear=GEAR.find(g=>g.id===id),state=save.journey;
  if(!gear||!state||state.gear[id]||save.wallet<gear.price)return false;
  save.wallet-=gear.price;state.gear[id]=true;return true;
}
