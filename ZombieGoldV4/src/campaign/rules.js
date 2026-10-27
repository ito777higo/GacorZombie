// Version two's persistent survival loop. Pure rules; no browser, clocks or random numbers.
export const ACTIONS = {
  rescue: { name: '营救幸存者', icon: '✚', benefit: '沿途两处求救信号，救出的人加入避难所', risk: '救援后会遇到额外尸潮', hint: '先打笼子，再护送他们撤离', color: '#a8d494' },
  scavenge: { name: '搜刮补给', icon: '▣', benefit: '额外物资箱，成功撤离再得 12 零件', risk: '额外精英尸潮，战斗更危险', hint: '左右选物资箱，留意随后的伏击', color: '#e4bc70' },
  evacuate: { name: '稳妥撤离', icon: '➜', benefit: '不绕路，开局额外 4 名队员', risk: '额外救援和物资机会较少', hint: '守住队伍，先打通撤离路线', color: '#9dc6d6' },
};
export const UPGRADES = [
  { name: '加固围墙', parts: 18, people: 8, effect: '每次行动开局多一层护盾' },
  { name: '建起医务站', parts: 36, people: 24, effect: '每次行动有一次免费急救' },
  { name: '修复无线电', parts: 60, people: 48, effect: '每次行动额外 6 名队员' },
];
export const newCamp = () => ({ parts: 0, people: 0, level: 0, medkits: 2, runs: 0, wins: 0, claimed: {} });
export const cloneCamp = camp => ({ ...newCamp(), ...camp, claimed: { ...(camp?.claimed || {}) } });

export function buildExpedition(level, action, camp) {
  if (!ACTIONS[action]) throw new Error('Unknown expedition: ' + action);
  const L = JSON.parse(JSON.stringify(level)), seq = L.run.seq;
  const at = Math.min(2, seq.length), late = Math.max(at, Math.floor(seq.length * .62));
  if (action === 'rescue') {
    // No new gates/traps: original tutorial references keep their indexes.
    seq.splice(late, 0, ['cage', 6, 18, 'C'], ['w', 4 + L.ch * 2, 6 + L.ch * 3]);
    seq.splice(at, 0, ['cage', 4, 8, 'C']);
  } else if (action === 'scavenge') {
    seq.splice(late, 0, ['row', ['coin', 4, 12], ['coin', 6, 18], ['coin', 4, 12]], ['w', 6 + L.ch * 2, 10 + L.ch * 4, { brute: 1 }]);
  }
  const army = L.run.army || 1;
  L.run.startAbs = L.run.startN * army + (action === 'evacuate' ? 4 : 0) + (camp.level >= 3 ? 6 : 0);
  L.campaignAction = action;
  return L;
}

export function settleExpedition(camp, result) {
  if (camp.claimed[result.runId]) return { duplicate: true, parts: 0, people: 0 };
  const people = result.win ? Math.max(0, Math.min(result.rescued, result.extracted)) : 0;
  const parts = result.win
    ? 10 + Math.min(8, result.crates) * 3 + Math.floor(Math.min(100, result.kills) / 20) + (result.action === 'scavenge' ? 12 : 0)
    : Math.floor(Math.min(8, result.crates) * 1.5);
  camp.parts += parts; camp.people += people;
  camp.wins += result.win ? 1 : 0;
  if (result.win && camp.wins % 2 === 0) camp.medkits = Math.min(3, camp.medkits + 1);
  camp.claimed[result.runId] = true;
  // Only the recent receipts are needed to reject repeated result callbacks.
  const receipts = Object.keys(camp.claimed);
  if (receipts.length > 100) for (const key of receipts.slice(0, receipts.length - 100)) delete camp.claimed[key];
  return { parts, people, win: result.win, action: result.action, crates: result.crates, rescued: result.rescued };
}

export function upgradeCamp(camp) {
  const next = UPGRADES[camp.level];
  if (!next || camp.parts < next.parts || camp.people < next.people) return false;
  camp.parts -= next.parts; camp.level++;
  return true;
}

export function healAmount(sim) {
  const lost = Math.max(0, sim.stats.lost - (sim.healed || 0));
  return Math.min(lost, Math.max(1, Math.ceil(sim.stats.peak * .3)));
}
