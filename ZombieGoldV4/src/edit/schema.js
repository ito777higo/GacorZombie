// 关卡配置格式: what one level is made of, as plain JSON, and the 保存检查 every config passes before it is
// imported or exported. The 调参台 (panel.js) draws its forms from TOKENS; docs/关卡配置格式.md describes the same
// format for people (and for the Cocos team's own config).
//
// A level = { code, ch, title, run: { startN, stand, drift, seq: [token, ...] }, finale: { boss, after, ... }, coins, par }.
// A token is an array: [key, positional values..., {options}] — the same arrays the runner reads (runsim.js layout()).
import { FISH, SURPRISES, CHAPTERS } from '../content/levels.js';
import { SKILLS, SKILL_KEYS } from '../sim/runsim.js';
import { BOSSES } from '../content/cast.js';
import { TUNE } from '../content/tune.js';

export const FORMAT = 'gatefish-level/1';
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// ---------------------------------------------------------------- vocabularies
export const SIDES = [{ v: 'L', label: '左' }, { v: 'C', label: '中' }, { v: 'R', label: '右' }];
export const SKILL_OPTS = SKILL_KEYS.map(k => ({ v: k, label: SKILLS[k].name }));
export const FISH_OPTS = Object.keys(FISH).filter(k => FISH[k].mult > 0 && !FISH[k].special).map(k => ({ v: k, label: `${FISH[k].name} ×${FISH[k].mult}` }));
export const BOSS_MODELS = Object.keys(BOSSES);
export const BOSS_OPTS = [{ v: '', label: '没有 Boss' }, ...BOSS_MODELS.map(k => ({ v: k, label: BOSSES[k].name + ` (${k})` }))];
// what a barrel holds; `val` says what its value means
export const BARREL_KINDS = {
  men: { label: '加兵', val: 'int', vlabel: '兵数（×兵力系数）', def: 10 },
  gun: { label: '换枪', val: 'int', vlabel: '升几级', def: 1 },
  rate: { label: '射速', val: 'int', vlabel: '（不用）', def: 1 },
  coin: { label: '金币堆', val: 'int', vlabel: '倍数（×炮倍）', def: 10 },
  fish: { label: '怪牌', val: 'fish', vlabel: '哪种僵尸', def: 'hudie' },
  skill: { label: '技能', val: 'skill', vlabel: '哪个技能', def: 'double' },
  shield: { label: '护盾', val: 'int', vlabel: '层数', def: 1 },
  heal: { label: '治疗', val: 'int', vlabel: '至少救回几个兵', def: 10 },
};
// 结尾: what happens after the boss. `coin` = pays coins on the 一星 script (a level with 剧本金额 needs one)
export const FINALES = {
  '': { label: '直接结算', coin: false },
  exchange: { label: '兑换门', coin: false },
  rainbow: { label: SURPRISES.rainbow.name, coin: true },
  bricks: { label: SURPRISES.bricks.name, coin: true },
  goldmob: { label: SURPRISES.goldmob.name, coin: true },
  fishleap: { label: SURPRISES.fishleap.name, coin: true },
  vault: { label: SURPRISES.vault.name, coin: true },
  egg: { label: SURPRISES.egg.name, coin: true },
  bonus: { label: SURPRISES.bonus.name, coin: true },
  pick: { label: '结尾转盘', coin: true },
};
export const FINALE_OPTS = Object.keys(FINALES).map(k => ({ v: k, label: FINALES[k].label }));
export const PICK_OPTS = Object.keys(SURPRISES).map(k => ({ v: k, label: SURPRISES[k].name }));

// a gate panel: +N −N xN /N, ? (mystery), ~a,b,c (roulette), S:skill
export function gateOk(s) {
  if (typeof s !== 'string') return false;
  if (s === '?') return true;
  if (s[0] === '~') { const l = s.slice(1).split(','); return l.length >= 2 && l.every(q => q !== '~' && gateOk(q) && q[0] !== '~'); }
  if (s.startsWith('S:')) return SKILL_KEYS.includes(s.slice(2));
  return /^[+\-x/]\d+(\.\d+)?$/.test(s) && !(s[0] === '/' && parseFloat(s.slice(1)) === 0);
}
export function gateLabel(s) {
  if (!gateOk(s)) return String(s);
  if (s === '?') return '?';
  if (s[0] === '~') return '轮盘 ' + s.slice(1).split(',').map(gateLabel).join('/');
  if (s.startsWith('S:')) return SKILLS[s.slice(2)].name;
  return s.replace(/^x/, '×').replace(/^\//, '÷').replace(/^-/, '−');
}

// ---------------------------------------------------------------- the tokens
// A field is positional (`at`: index in the token array) or an option (`opt`: key of the trailing {options} object).
// type: gate | int | num | text | bool | side | sel (options) | fish | skill | barrel (a [kind, value, hits] triple;
// `flat` = laid out at at, at+1, at+2 of the token itself instead of nested)
const F = {
  count: (at, def = 8, max = 200) => ({ at, label: '只数', type: 'int', min: 1, max, def }),
  hp: (at, def = 8) => ({ at, label: '血量', type: 'num', min: 1, max: 20000, def }),
  hits: (at, def = 30) => ({ at, label: '要打几下', type: 'int', min: 1, max: 5000, def }),
  side: (at, def = 'C') => ({ at, label: '位置（空 = 中）', type: 'side', def, optional: true }),
};
export const TOKENS = {
  g: { name: '门', group: '门', fields: [
    { at: 1, label: '第 1 扇', type: 'gate', def: '+10' },
    { at: 2, label: '第 2 扇', type: 'gate', def: 'x2' },
    { at: 3, label: '第 3 扇（空 = 两扇）', type: 'gate', optional: true },
    { opt: 'post', label: '金柱可骑', type: 'bool' },
    { opt: 'wall', label: '中间是隔墙', type: 'bool' },
    { opt: 'shoot', label: '可开枪涨数（空 = 大关二起有加法门就可以）', type: 'tri' },
    { opt: 'gap', label: '到下一项的距离（空 = 默认）', type: 'num', min: 4, max: 120, optional: true },
  ], sum: (it, o) => `${it.slice(1).filter(v => typeof v === 'string').map(gateLabel).join(' / ')}${o.post ? ' · 金柱' : ''}${o.wall ? ' · 隔墙' : ''}` },
  w: { name: '尸潮', group: '敌人', fields: [F.count(1), F.hp(2), { opt: 'brute', label: '带一个精英', type: 'bool' }, { opt: 'power', label: '每只撞上扣几个兵（空 = 1）', type: 'int', min: 1, max: 10, optional: true }],
    sum: (it, o) => `${it[1]} 只 · 血 ${it[2]}${o.brute ? ' · 精英' : ''}${o.power ? ` · 扣 ${o.power}` : ''}` },
  ambush: { name: '两侧扑出', group: '敌人', fields: [F.count(1, 10), F.hp(2, 9)], sum: it => `${it[1]} 只 · 血 ${it[2]}` },
  line: { name: '纵队', group: '敌人', fields: [{ at: 1, label: '几路', type: 'int', min: 1, max: 6, def: 4 }, { at: 2, label: '每路几只', type: 'int', min: 1, max: 12, def: 6 }, F.hp(3, 20), { opt: 'power', label: '撞上扣兵（空 = 1）', type: 'int', min: 1, max: 10, optional: true }],
    sum: it => `${it[1]} 路 × ${it[2]} 只 · 血 ${it[3]}` },
  shield: { name: '盾墙', group: '敌人', fields: [{ at: 1, label: '几个举盾僵尸', type: 'int', min: 1, max: 12, def: 7 }, F.hp(2, 45)], sum: it => `${it[1]} 个 · 血 ${it[2]}` },
  mb: { name: '小 Boss', group: '敌人', fields: [F.hp(1, 900), { at: 2, label: '（保留位，不用）', type: 'int', min: 0, max: 100, def: 20, hidden: true }, { at: 3, label: '名字', type: 'text', def: '巨尸' },
    { opt: 'escape', label: '几秒打不倒就背着金子跑（空 = 不跑）', type: 'num', min: 1, max: 30, optional: true }, { opt: 'dodgy', label: '会横移、闪现（幻影）', type: 'bool' }],
    sum: (it, o) => `${it[3] || '巨尸'} · 血 ${it[1]}${o.escape ? ` · ${o.escape} 秒跑` : ''}${o.dodgy ? ' · 会闪' : ''}` },
  b: { name: '木桶', group: '桶和道具', fields: [{ at: 1, type: 'barrel', flat: true, label: '桶' }, F.side(4)], sum: it => `${barrelLabel([it[1], it[2], it[3]])} · ${sideLabel(it[4])}` },
  row: { name: '一排三个桶', group: '桶和道具', fields: [{ at: 1, type: 'barrel', label: '左', optional: true }, { at: 2, type: 'barrel', label: '中', optional: true }, { at: 3, type: 'barrel', label: '右', optional: true }],
    sum: it => [it[1], it[2], it[3]].map(b => (b ? barrelLabel(b, true) : '空')).join(' / ') },
  bb: { name: '左右两个桶', group: '桶和道具', fields: [{ at: 1, type: 'barrel', label: '左' }, { at: 2, type: 'barrel', label: '右' }], sum: it => `${barrelLabel(it[1], true)} / ${barrelLabel(it[2], true)}` },
  roll: { name: '滚桶', group: '桶和道具', fields: [{ at: 1, type: 'barrel', flat: true, label: '桶', roll: true }, F.side(4), { opt: 'speed', label: '滚速（空 = 3.4）', type: 'num', min: 0.5, max: 12, optional: true }],
    sum: it => `${barrelLabel([it[1], it[2], it[3]])}${it[4] && it[4] !== 'C' ? ' · ' + sideLabel(it[4]) : ''}` },
  roll2: { name: '二选一滚桶', group: '桶和道具', fields: [{ at: 1, type: 'barrel', label: '左', roll: true }, { at: 2, type: 'barrel', label: '右', roll: true }, { opt: 'speed', label: '滚速（空 = 3.4）', type: 'num', min: 0.5, max: 12, optional: true }],
    sum: it => `${barrelLabel(it[1], true)} / ${barrelLabel(it[2], true)}` },
  cage: { name: '笼子', group: '桶和道具', fields: [{ at: 1, label: '关着几个兵', type: 'int', min: 1, max: 500, def: 10 }, F.hits(2, 30), F.side(3)], sum: it => `${it[1]} 兵 · ${it[2]} 下` },
  drop: { name: '兵雨', group: '路上', fields: [{ at: 1, label: '空投几个兵（×兵力系数）', type: 'int', min: 1, max: 2000, def: 30 }], sum: it => `+${it[1]}` },
  f: { name: '蝙蝠', group: '路上', fields: [{ at: 1, label: '几只', type: 'int', min: 1, max: 40, def: 12 }, { opt: 'tide', label: '蝙蝠群（一大群挨着）', type: 'bool' }, { opt: 'type', label: '按哪种僵尸的倍数（空 = 厨师僵尸）', type: 'fish', optional: true }],
    sum: (it, o) => `${it[1]} 只${o.tide ? ' · 蝙蝠群' : ''}${o.type ? ' · ' + FISH[o.type].name : ''}` },
  roller: { name: '滚筒', group: '陷阱', fields: [F.side(1, 'L')], sum: it => sideLabel(it[1]) },
  rollers: { name: '两个滚筒', group: '陷阱', fields: [], sum: () => '左、右各一个' },
  saw: { name: '电锯', group: '陷阱', fields: [{ at: 1, label: '摆幅', type: 'num', min: 0.5, max: 5, def: 3.3 }, { at: 2, label: '速度', type: 'num', min: 0.2, max: 5, def: 1.6 }], sum: it => `摆幅 ${it[1] ?? 3.3}` },
  hole: { name: '破洞', group: '陷阱', fields: [F.side(1, 'L'), { at: 2, label: '长度', type: 'num', min: 2, max: 20, def: 7, optional: true }], sum: it => sideLabel(it[1]) },
  wave: { name: '毒液', group: '陷阱', fields: [F.side(1, 'L')], sum: it => sideLabel(it[1]) },
  split: { name: '分道墙', group: '路上', fields: [{ at: 1, label: '长度', type: 'num', min: 10, max: 200, def: 40 }], sum: it => `长 ${it[1]}` },
  gap: { name: '空档', group: '路上', fields: [{ at: 1, label: '多空出多少（8.5 ≈ 1 秒）', type: 'num', min: 1, max: 200, def: 10 }], sum: it => `${it[1]}` },
  coins: { name: '路上金币（已去掉）', group: '路上', legacy: true, fields: [{ at: 1, label: '排法', type: 'sel', options: ['line', 'zig', 'split', 'L', 'R'].map(v => ({ v, label: v })), def: 'line' }, F.count(2, 10), { at: 3, label: '每枚', type: 'int', min: 1, max: 10000, def: 100 }], sum: it => `${it[2]} 枚` },
  br: { name: '精英（旧）', group: '敌人', legacy: true, fields: [F.hp(1, 60), { at: 2, label: '撞上扣兵', type: 'int', min: 1, max: 30, def: 8 }], sum: it => `血 ${it[1]}` },
};
export const TOKEN_ORDER = ['g', 'w', 'ambush', 'line', 'shield', 'mb', 'roll', 'roll2', 'b', 'row', 'bb', 'cage', 'drop', 'f', 'roller', 'rollers', 'saw', 'hole', 'wave', 'split', 'gap'];

const sideLabel = s => (SIDES.find(q => q.v === (s || 'C')) || SIDES[1]).label;
export function barrelLabel(b, short) {
  if (!Array.isArray(b)) return '空';
  const K = BARREL_KINDS[b[0]];
  if (!K) return String(b[0]);
  const v = b[0] === 'fish' ? (FISH[b[1]] ? FISH[b[1]].name : b[1]) : b[0] === 'skill' ? (SKILLS[b[1]] ? SKILLS[b[1]].name : b[1]) : b[0] === 'men' ? b[1] : b[0] === 'coin' ? '×' + b[1] : b[0] === 'heal' ? b[1] : '';
  return `${K.label}${v !== '' && v !== undefined ? ' ' + v : ''}${short ? '' : `（${b[2]} 下）`}`;
}
// the value at a position of a token (the trailing options object is not a positional value)
export const posVal = (it, at) => { const v = it[at]; return v && typeof v === 'object' && !Array.isArray(v) ? undefined : v; };
// the options object at the end of a token (shared, so edits land in the token)
export function optsOf(it, create) {
  const last = it[it.length - 1];
  if (last && typeof last === 'object' && !Array.isArray(last)) return last;
  if (!create) return {};
  const o = {}; it.push(o); return o;
}
export function summary(it) {
  const T = TOKENS[it[0]];
  if (!T) return `未知积木 ${it[0]}`;
  return `${T.name} ${T.sum(it, optsOf(it))}`;
}
// a new token of this kind, from the field defaults
export function newToken(k) {
  const T = TOKENS[k], it = [k];
  for (const f of T.fields) {
    if (f.opt || (f.optional && f.type !== 'barrel')) continue;
    if (f.type === 'barrel') {
      const b = ['men', 10, f.roll ? 60 : 20];
      if (f.flat) { it[f.at] = b[0]; it[f.at + 1] = b[1]; it[f.at + 2] = b[2]; } else it[f.at] = b;
    } else it[f.at] = f.def;
  }
  for (let i = 1; i < it.length; i++) if (it[i] === undefined) it[i] = null;
  return it;
}

// ---------------------------------------------------------------- level ⇄ config
const EXTRA = ['learn', 'hint', 'challenge', 'magic', 'gift', 'bonus', 'teachKills', 'teachEscape', 'teachTide', 'teachLine', 'teachShield', 'teachDodge', 'teachBonus'];
export function toConfig(L) {
  const c = { format: FORMAT, code: L.code, ch: L.ch, title: L.title };
  for (const k of EXTRA) if (L[k] !== undefined) c[k] = clone(L[k]);
  c.run = { startN: L.run.startN };
  if (L.run.stand) { c.run.stand = true; c.run.drift = L.run.drift; }
  if (L.run.coinValue) c.run.coinValue = true;
  c.run.seq = clone(L.run.seq);
  c.finale = clone(L.finale || {});
  if (L.coins) c.coins = L.coins;
  if (L.par) c.par = L.par;
  return c;
}
// write a config into a level object (keeps what a config does not carry: the teaching steps, rewards)
export function applyConfig(L, c) {
  L.code = c.code; L.ch = c.ch; L.title = c.title;
  for (const k of EXTRA) { if (c[k] !== undefined) L[k] = clone(c[k]); else delete L[k]; }
  L.run = { ...(L.run || {}), startN: c.run.startN, seq: clone(c.run.seq) };
  if (c.run.stand) { L.run.stand = true; L.run.drift = c.run.drift || 5.5; } else { delete L.run.stand; delete L.run.drift; }
  if (c.run.coinValue) L.run.coinValue = true; else delete L.run.coinValue;
  L.finale = clone(c.finale || {});
  if (c.coins) L.coins = c.coins; else delete L.coins;
  if (c.par) L.par = c.par; else delete L.par;
  // derived from the global numbers: from 大关二 on the soldiers are × 兵力系数 and the monsters pay × 炮倍
  if (L.ch >= 1) { L.run.army = TUNE.army; L.stake = TUNE.stake; } else { delete L.run.army; delete L.stake; }
  return L;
}

// ---------------------------------------------------------------- 保存检查
// Every problem as { at (seq index, or null for the level), msg }. A config with any problem can't be imported or exported.
export function validate(c, teach) {
  const out = [], err = (at, msg) => out.push({ at, msg });
  if (!c || typeof c !== 'object') { err(null, '不是一个关卡配置（要一个 JSON 对象）'); return out; }
  if (c.format && c.format !== FORMAT) err(null, `格式版本 ${c.format} 不认识（应为 ${FORMAT}）`);
  if (!c.code || typeof c.code !== 'string') err(null, '缺少关卡编号 code（如 "2-1"）');
  if (!(c.ch >= 0 && c.ch < CHAPTERS.length)) err(null, `大关 ch 要在 0～${CHAPTERS.length - 1}（0 = 大关一）`);
  if (!c.title) err(null, '缺少关卡名 title');
  const run = c.run || {};
  if (!(Number.isInteger(run.startN) && run.startN >= 1 && run.startN <= 999)) err(null, '开局兵数 run.startN 要是 1～999 的整数');
  if (run.stand && !(run.drift > 0)) err(null, '站桩关要有飘过来的速度 run.drift（如 6）');
  const seq = Array.isArray(run.seq) ? run.seq : (err(null, '缺少积木序列 run.seq'), []);
  let gates = 0, hazards = 0;
  seq.forEach((it, i) => {
    if (!Array.isArray(it) || !it.length) { err(i, '这一项不是积木（要一个数组，如 ["g","+10","x2"]）'); return; }
    const T = TOKENS[it[0]];
    if (!T) { err(i, `积木「${it[0]}」不认识`); return; }
    if (it[0] === 'g') {
      gates++;
      const vals = it.slice(1).filter(v => typeof v === 'string');
      if (vals.length < 2 || vals.length > 3) err(i, `门：一排要 2～3 扇，现在是 ${vals.length} 扇`);
    }
    if (['roller', 'hole', 'wave', 'saw'].includes(it[0])) hazards++;
    if (it[0] === 'rollers') hazards += 2;
    const o = optsOf(it);
    for (const f of T.fields) {
      const v = f.opt ? o[f.opt] : f.type === 'barrel' ? barrelOf(it, f) : posVal(it, f.at);
      const where = `${T.name}·${f.label.replace(/（.*）/, '')}`;
      if (v === undefined || v === null || v === '') { if (!f.optional && !f.opt && f.type !== 'tri' && !f.hidden) err(i, `${where}：没填`); continue; }
      checkField(f, v, m => err(i, `${where}：${m}`));
    }
  });
  if (!gates) err(null, '至少要有一扇门');
  const fin = c.finale || {};
  if (fin.after !== undefined && !(fin.after in FINALES)) err(null, `结尾 finale.after「${fin.after}」不认识`);
  if (fin.after === 'pick' && fin.pick && !(fin.pick in SURPRISES)) err(null, `结尾转盘的一星结果 finale.pick「${fin.pick}」不认识`);
  if (fin.boss) {
    if (fin.boss.model && !BOSS_MODELS.includes(fin.boss.model)) err(null, `Boss 模型「${fin.boss.model}」没有（有：${BOSS_MODELS.join('、')}）`);
    if (!(fin.boss.hp > 0)) err(null, 'Boss 血量 finale.boss.hp 要大于 0');
    if (fin.boss.slam !== undefined && !(fin.boss.slam > 0)) err(null, 'Boss 出招间隔 finale.boss.slam 要大于 0');
  }
  if (c.coins) {
    if (!(c.ch >= 1)) err(null, '大关一不出现金币，不能有剧本金额 coins');
    if (!(FINALES[fin.after || ''] || {}).coin) err(null, `有剧本金额的关，结尾要能出金币（${Object.keys(FINALES).filter(k => FINALES[k].coin).map(k => FINALES[k].label).join('、')}）`);
    if (!(c.coins > 0)) err(null, '剧本金额 coins 要大于 0');
  }
  // the teaching steps of the level must still find their gate / trap
  for (const t of teach || []) {
    if (t.gate !== undefined && t.gate >= gates) err(null, `教学引用了第 ${t.gate + 1} 扇门，但这关只有 ${gates} 扇`);
    if (t.hazard !== undefined && t.hazard >= hazards) err(null, `教学引用了第 ${t.hazard + 1} 个陷阱，但这关只有 ${hazards} 个`);
  }
  return out;
}
function checkField(f, v, bad) {
  const num = x => typeof x === 'number' && isFinite(x);
  switch (f.type) {
    case 'gate': if (!gateOk(v)) bad(`「${v}」不是门的值（+N −N ×N 写 xN ÷N 写 /N、?、~a,b,c、S:技能）`); break;
    case 'int': if (!Number.isInteger(v)) bad(`要整数，现在是 ${v}`); else if (v < f.min || v > f.max) bad(`要在 ${f.min}～${f.max}，现在是 ${v}`); break;
    case 'num': if (!num(v)) bad(`要数字，现在是 ${v}`); else if (v < f.min || v > f.max) bad(`要在 ${f.min}～${f.max}，现在是 ${v}`); break;
    case 'side': if (!SIDES.some(q => q.v === v)) bad('位置只能是 L / C / R'); break;
    case 'fish': if (!FISH[v]) bad(`没有这种目标「${v}」`); break;
    case 'skill': if (!SKILL_KEYS.includes(v)) bad(`没有这个技能「${v}」`); break;
    case 'sel': if (!f.options.some(q => q.v === v)) bad(`「${v}」不在可选项里`); break;
    case 'bool': case 'tri': if (typeof v !== 'boolean' && v !== 0 && v !== 1) bad('要 true / false（或 1 / 0）'); break;
    case 'text': if (typeof v !== 'string') bad('要文字'); break;
    case 'barrel': {
      if (!Array.isArray(v) || v.length < 3) { bad('桶要写成 [种类, 值, 要打几下]'); break; }
      const K = BARREL_KINDS[v[0]];
      if (!K) { bad(`桶的种类「${v[0]}」不认识（${Object.keys(BARREL_KINDS).join(' / ')}）`); break; }
      if (K.val === 'fish' && !FISH[v[1]]) bad(`没有这种目标「${v[1]}」`);
      if (K.val === 'skill' && !SKILL_KEYS.includes(v[1])) bad(`没有这个技能「${v[1]}」`);
      if (K.val === 'int' && !(Number.isInteger(v[1]) && v[1] >= 0)) bad(`${K.vlabel} 要非负整数`);
      if (!(Number.isInteger(v[2]) && v[2] >= 1)) bad('要打几下 要是正整数');
      break;
    }
  }
}
// the barrel of a field, whether nested or laid out flat in the token
export function barrelOf(it, f) { return f.flat ? (it[f.at] ? [it[f.at], it[f.at + 1], it[f.at + 2]] : null) : it[f.at] || null; }
export function setBarrel(it, f, b) {
  if (f.flat) { it[f.at] = b[0]; it[f.at + 1] = b[1]; it[f.at + 2] = b[2]; } else it[f.at] = b;
}
