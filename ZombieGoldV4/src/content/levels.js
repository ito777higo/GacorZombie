// Level data: the 13 levels of 一星 in four 大关, one new idea each (大关一 数字门 → 大关二 兵变金币 → 大关三 大怪爆分
// → 大关四 武器技能), plus the fish (the zombie targets of 末日战场 and the Bonus pool), the finales and the 一星 script
// prices. docs/策划案.md explains the design; all numbers are placeholders. The format of a level (every script
// token, its parameters and ranges, the 保存检查) is written up in docs/关卡配置格式.md and checked by
// src/edit/schema.js; the 调参台 edits these objects in place.
//
// A level's run.seq is a list of tokens laid out one after another (TUNE.gap apart, 8.5 units ≈ 1 s) by runsim.js
// layout(): g gates · w horde · ambush · line 纵队 · shield 盾墙 · mb mini-boss · b / row / bb barrels · roll / roll2
// 滚桶 · cage · drop 兵雨 · f leaping fish (bats on screen) / 蝙蝠群 · roller / rollers / saw / hole / wave traps · split · gap.
// run: {stand: true, drift} — 站桩关: the squad stands; everything drifts at it (Top Lords Breakout).

import { TUNE } from './tune.js';
import { JOURNEY_LEVELS,JOURNEY_CHAPTERS } from './journey.js';

export const SHOT = 100;          // coins per cannon shot at bet ×1 (fishing) and the base value of a bonus hit
// 打怪按捕鱼规则赔: from 大关二 on every monster on the road carries a multiple and pays multiple × 炮倍 when it dies.
// The run's 炮倍 is TUNE.stake (500; the 调参台 can change it) — a small base under big multiples (social-casino
// feel); 末日战场 (the fishing room) stays at 1K, the lowest 炮倍 of 二人捕鱼's 1 场.
export const STAKE = TUNE.stake;
export const ENEMY_MULT = { zombie: 2, dog: 3, shield: 5, brute: 15, mb: 50 };
// 结尾惊喜: what each kind of finale is called (ui + the 3-2 结尾转盘)
export const SURPRISES = {
  rainbow: { name: '彩虹滚轮', sub: '兵掉进 ×N 格，每个兵赔 N 个筹码' },
  goldmob: { name: '黄金机甲', sub: '每打一下喷金币，打倒全部 ×2' },
  fishleap: { name: '金蝠来袭', sub: '金色蝙蝠飞过场地，打中按倍数赔' },
  vault: { name: '打爆桶', sub: '10 秒内打碎多少拿多少' },
  egg: { name: '砸金蛋', sub: '一直砸一直喷，砸碎再开倍' },
  bonus: { name: '黄金尸池', sub: '金炮弹打僵尸，黄金机甲 ×50～×200' },
  bricks: { name: '金砖墙', sub: '兵一排排撞碎金砖，越往里越值钱' },
};
// 彩虹滚轮: the nine gaps (multiple, capacity in units of c = the level's par squad ÷ 8; the last one takes the rest)
export const RAINBOW = { m: [1, 2, 3, 5, 8, 10, 20, 50, 100], grow: 1.5, div: 8 };
// 金砖墙: nine rows of gold bricks, each row takes cap soldiers to smash (c = par squad ÷ 8, ×1.5 a row); the
// last row, the vault door, takes everyone left
export const BRICKS = { m: [1, 2, 3, 5, 8, 10, 20, 50, 100], grow: 1.5, div: 8 };
// the 避难所 (stand-in for 二人捕鱼's room select; it opens 末日战场) opens after 3-3 — once 爆分 and the random big
// monsters have been played
export const FISH_AFTER = 8;
// 大关四 waits for the lobby level line (二人捕鱼 LV4); the demo can simulate it
export const LOBBY_LV_CH4 = 4;

// 大关: each one adds a single new idea on the way from a Last War runner to the fishing game.
// The map reads top to bottom as "how the gameplay becomes fishing" (末日战场 in the zombie skin). Each concept
// starts with a one-line story hook in 「」.
export const CHAPTERS = JOURNEY_CHAPTERS;

// FISH = the targets of the shooting room (末日战场) and of the Bonus pool (黄金尸池), played by fishing rules; in code
// "fish" means such a target. In the zombie skin each one is a zombie: only `name` is the zombie's (content/cast.js
// TARGETS / BIG_TARGETS pick the art). The keys, card numbers and multiples are still the real 二人捕鱼 fish — the card
// art from Fish_Card_Icon (assets/fish/<card>.png) and the multiples from the game's fish config (BY_FishConfig.lua).
// mult = payout multiple of the shot cost.
export const FISH = {
  huang:    { name: '钢盔僵尸',     card: 1,  mult: 2,  speed: 3.0, size: 1.3, w: 26 },
  redai:    { name: '矿工僵尸',     card: 3,  mult: 3,  speed: 2.9, size: 1.4, w: 22 },
  dayan:    { name: '厨师僵尸',     card: 4,  mult: 5,  speed: 2.4, size: 1.5, w: 16 },
  xiaochou: { name: '朋克女僵尸',   card: 6,  mult: 6,  speed: 2.4, size: 1.5, w: 14 },
  hetun:    { name: '木乃伊鱼',     card: 7,  mult: 8,  speed: 2.0, size: 1.7, w: 10 },
  hudie:    { name: '护士僵尸',     card: 12, mult: 10, speed: 2.1, size: 1.9, w: 9 },
  wugui:    { name: '木乃伊',       card: 11, mult: 15, speed: 1.5, size: 2.4, w: 7 },
  longxia:  { name: '野人僵尸',     card: 19, mult: 20, speed: 1.6, size: 2.5, w: 5 },
  jianyu:   { name: '飞行员僵尸',   card: 14, mult: 40, speed: 2.3, size: 3.1, w: 3 },
  denglong: { name: '法老金甲虫',   card: 9,  mult: 50, speed: 1.6, size: 2.7, w: 2 },
  ciyao:    { name: '滑板电击僵尸', card: 15, mult: 60, speed: 1.6, size: 3.5, w: 1.5 },
  shark:    { name: '鲨鱼怪',       card: 16, mult: 68, speed: 1.8, size: 4.5, w: 0 },
  bomb:     { name: '火箭僵尸',     card: 24, mult: 55, speed: 1.6, size: 2.1, w: 0 },
  boss:     { name: '黄金机甲',     card: 22, mult: 0,  speed: 1.2, size: 5.4, w: 0 },
  // the special targets (二人捕鱼's special fish), each with its own 爆分 (BY_FishConfig fishType = card; see specials.js)
  haiman:   { name: '电击怪',       card: 55, mult: 20, speed: 2.0, size: 3.2, w: 0, special: 'chain' },
  zhangyu:  { name: '爆破矿工',     card: 53, mult: 0,  speed: 1.5, size: 3.2, w: 0, special: 'chest' },
  xingshi:  { name: '雪怪',         card: 57, mult: 0,  speed: 1.4, size: 3.6, w: 0, special: 'lion' },
  caishen:  { name: '运钞怪',       card: 61, mult: 0,  speed: 1.2, size: 3.6, w: 0, special: 'ingot' },
  haiwangxie: { name: '裹布蛛',     card: 65, mult: 30, speed: 1.4, size: 3.4, w: 0, special: 'crit' },
  magic:    { name: '宝箱怪',       card: 69, mult: 0, speed: 1.05, size: 6.0, w: 0 },
};

// The 黄金机甲 wheel (FISH.boss: the room's boss and the bonus pool's big target; 二人捕鱼's 金蟾 / Katak Emas).
// It pays ×50～×200 as in 二人捕鱼; the bet scales coins, never the odds
export const WHEEL = [
  { m: 50, w: 30 }, { m: 60, w: 24 }, { m: 80, w: 18 }, { m: 100, w: 13 }, { m: 120, w: 8 }, { m: 150, w: 5 }, { m: 200, w: 2 },
];
export const WHEEL_MEAN = WHEEL.reduce((a, t) => a + t.m * t.w, 0) / WHEEL.reduce((a, t) => a + t.w, 0);

// Bonus wheel: decides what the bonus cannon gets on top of the skills picked up in the run.
export const BONUS_WHEEL = [
  { k: 'double', label: '双线', w: 16 },
  { k: 'spread', label: '散射', w: 16 },
  { k: 'pierce', label: '穿透', w: 14 },
  { k: 'aim', label: '瞄准', w: 10 },
  { k: 'x2', label: '×2', w: 16 },
  { k: 'x3', label: '×3', w: 6 },
  { k: 'dragon', label: '黄金机甲', w: 10 },
  { k: 'rain', label: '金币雨', w: 12 },
];
export const BONUS_TYPES = ['huang', 'redai', 'dayan', 'xiaochou', 'hetun', 'hudie', 'wugui', 'longxia'];

// 末日战场, the stand-in for 二人捕鱼's 1 场 (免费场): 炮倍 1K～20K (bet × SHOT); the 宝箱怪 (FISH.magic) comes
// through now and then
export const FISHING = {
  open: true, minOpen: 0, rtp: 0.97, pity: 110, bossAt: 18, bossEvery: 70, boss: { wheel: true }, bets: [10, 20, 50, 100, 200],
  shark: 6, bomb: [12, 34], tide: 26, cycle: 60, partner: true, magicAt: 30, magicEvery: 75,
  // the special targets come round once a cycle, at these seconds (电击怪, 爆破矿工, 雪怪, 裹布蛛, 运钞怪)
  specials: [[9, 'haiman'], [20, 'zhangyu'], [32, 'xingshi'], [44, 'haiwangxie'], [53, 'caishen']],
  types: ['huang', 'redai', 'dayan', 'xiaochou', 'hetun', 'hudie', 'wugui', 'longxia', 'jianyu', 'denglong', 'ciyao'], dense: 1.2,
};

export const LEVELS = JOURNEY_LEVELS;
export const ITEMS = {};
export const levelAt = i => ({ L: LEVELS[Math.min(i, LEVELS.length - 1)], scale: 1 });
export const stageLevels = ch => LEVELS.map((L,i)=>L.ch===ch?i:-1).filter(i=>i>=0);
