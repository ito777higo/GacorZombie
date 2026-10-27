// This revision changes the player's mission, not the shelter economy.
const TITLES = ['冲出封锁线','搜集武器','汇合救援队','接应车队','守住补给线','穿过感染区','建立撤离信号','坚守桥头','抢救医疗物资','截断追兵','清理感染巢','突破装甲防线','实验体零号'];
export const EVAC_MODES = {
  signal: { name: '信号接应', task: '靠近绿色信标，加快接应车抵达', sub: '尸潮靠近时仍可左右移动；红区出现就躲开' },
  supply: { name: '抢救补给', task: '向左右移动，击碎补给箱再撤离', sub: '能带走多少算多少，先保证队伍活下来' },
  hold: { name: '守住撤离区', task: '挡住最后的追兵，等待接应车', sub: '保持射界，躲开标红区域的扑击' },
};
export const evacPlan = L => ({ mode: ['signal','hold','supply'][Number(L.code.split('-')[1]) % 3], duration: L.ch === 0 ? 9 : 12, waveCount: L.ch === 0 ? 5 : 9 + L.ch * 2, chapter: L.ch });

export function applyExperience(levels, chapters) {
  const concepts = [
    '城市封锁即将合拢。汇合幸存者，搜集武器，带队赶到接应点。',
    '补给车队被困在废港。清掉追兵，保住队伍，打通撤离路线。',
    '感染区里仍有人求救。找到医疗物资，建立信号，守到接应抵达。',
    '实验室外的变异体切断了退路。用新武器突破防线，把人带出来。',
  ];
  chapters.forEach((C,i) => { C.concept=concepts[i]; C.steps=TITLES.slice(i*3,i===3?13:i*3+3); });
  const convert = token => {
    if (!Array.isArray(token)) return token;
    if (token[0]==='f') return ['ambush',token[1],12];
    if (token[0]==='row' || token[0]==='roll2') return token.map((v,i)=>i?convert(v):v);
    if (token[0]==='fish') return ['men',8,token[2]];
    if ((token[0]==='b'||token[0]==='roll')&&token[1]==='fish') return [token[0],'men',8,...token.slice(3)];
    if (token[0]==='g') return token.map(v=>v==='S:lucky'?'S:spread':v==='?'?'+60':v);
    return token;
  };
  levels.forEach((L,i) => {
    L.title=TITLES[i]; L.experience=true;
    L.run.seq=L.run.seq.map(convert);
    L.finale={...L.finale,after:'evac'}; delete L.finale.ladder; delete L.finale.pick;
    delete L.magic; delete L.bonus; delete L.teachBonus; delete L.reward; delete L.teachKills;
    L.hint = L.ch===0 ? '走有利的数字门，汇合队员；最后守住接应点。' : '先扩充队伍、拿武器，躲开重击；Boss 倒下后还有最后一次撤离战。';
    L.learn = i===0 ? '带着活下来的人一起离开' : `${EVAC_MODES[evacPlan(L).mode].name}：${EVAC_MODES[evacPlan(L).mode].task}`;
    if (i===8) L.teach = [{gate:2,pick:1,text:'拿到散射',sub:'覆盖侧路，挡住扑来的感染体'}];
    if (i===5) L.teach = L.teach?.filter(t=>t.gate!==2);
    if (i===12) L.finale.boss={...L.finale.boss,model:'demon',name:'实验体零号'};
    if (L.finale.boss) delete L.finale.boss.escape;
  });
}
