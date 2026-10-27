// 调参台 · 全局: every global number the panel opens — its name, range, the demo's value, when a change shows
// (live = at once; restart = from the next restart, because the level is laid out when it starts; boss = at the next
// boss) and where it acts. Most live in TUNE (tune.js); the rest in the module objects that already held them.
import { TUNE } from '../content/tune.js';
import { ENEMY_MULT, RAINBOW, BRICKS } from '../content/levels.js';
import { LETHAL } from '../sim/runsim.js';
import { MIX, remix } from '../platform/audio.js';

// world.runCam is reached through the world the panel is given (see bindWorld)
const CAM = { h: 11, back: 8.2, ahead: 11 };
export function bindWorld(world) { if (world && world.runCam) CAM.obj = world.runCam; }
const camKey = key => ({ get: () => (CAM.obj || CAM)[key], set: v => { (CAM.obj || CAM)[key] = v; } });
const ref = (obj, key, after) => ({ get: () => obj[key], set: v => { obj[key] = v; after && after(); } });
const tune = key => ref(TUNE, key);

// [group, key, name, demo value, min, max, step, when, where]
const P = [
  ['关卡', 'speed', '前进速度', 8.5, 4, 16, 0.5, 'live', 'runsim.js update()'],
  ['关卡', 'gap', '积木间距（8.5 ≈ 1 秒）', 26, 12, 50, 1, 'restart', 'runsim.js layout()'],
  ['关卡', 'army', '兵力系数（大关二起，开局兵和加兵 ×）', 2, 1, 4, 1, 'restart', 'levels.js / RunSim'],
  ['队伍和射击', 'volleys', '射速（每秒几轮）', 16, 4, 32, 1, 'live', 'runsim.js fire()'],
  ['队伍和射击', 'dmgPow', '每轮伤害 1.5 + 兵数^x 的 x', 0.8, 0.5, 1, 0.05, 'live', 'runsim.js volleyDamage'],
  ['队伍和射击', 'range', '射程', 38, 20, 60, 1, 'live', 'runsim.js aimTarget / updateBullets()'],
  ['队伍和射击', 'bulletV', '子弹速度', 40, 15, 80, 1, 'live', 'runsim.js fire()'],
  ['队伍和射击', 'spreadArc', '散射扇形（弧度，1.1 ≈ ±31°）', 1.1, 0.4, 1.6, 0.05, 'live', 'runsim.js fire()'],
  ['门', 'straddle', '骑金柱判定宽度', 0.75, 0.3, 1.5, 0.05, 'live', 'runsim.js updateGates()'],
  ['门', 'postCut', '骑金柱撞掉比例', 0.15, 0, 0.5, 0.01, 'live', 'runsim.js updateGates()'],
  ['门', 'gateGain', '开枪涨门速度（伤害 × x × 兵力系数）', 0.06, 0, 0.2, 0.005, 'live', 'runsim.js updateBullets()'],
  ['敌人', 'waveN', '数量系数', 1.5, 0.5, 4, 0.05, 'restart', 'runsim.js layout()'],
  ['敌人', 'waveHp', '血量系数', 1.15, 0.3, 4, 0.05, 'restart', 'runsim.js layout()'],
  ['敌人', 'zSpeed', '小僵尸速度 ×', 1, 0.3, 3, 0.05, 'restart', 'runsim.js mkZombie()'],
  ['敌人', 'dogSpeed', '两侧扑出的毒蛛速度 ×', 1, 0.3, 3, 0.05, 'restart', 'runsim.js layout()'],
  ['敌人', 'bruteSpeed', '精英速度 ×', 1, 0.3, 3, 0.05, 'restart', 'runsim.js mkZombie()'],
  ['敌人', 'rushDist', '尸潮开始冲的距离', 46, 20, 90, 1, 'live', 'runsim.js updateZombies()'],
  ['敌人', 'sideDist', '两侧扑出的距离', 15, 5, 40, 1, 'live', 'runsim.js updateZombies()'],
  ['敌人', 'brutePower', '精英撞上扣几个兵', 8, 1, 40, 1, 'restart', 'runsim.js layout()'],
  ['敌人', 'mbCut', '小 Boss 撞上扣兵比例', 0.25, 0.05, 0.6, 0.01, 'live', 'runsim.js updateZombies()'],
  ['敌人', 'mult.zombie', '倍数：小僵尸', 2, 0, 50, 1, 'restart', 'levels.js ENEMY_MULT'],
  ['敌人', 'mult.dog', '倍数：毒蛛（两侧扑出）', 3, 0, 50, 1, 'restart', 'levels.js ENEMY_MULT'],
  ['敌人', 'mult.shield', '倍数：举盾僵尸', 5, 0, 100, 1, 'restart', 'levels.js ENEMY_MULT'],
  ['敌人', 'mult.brute', '倍数：精英', 15, 0, 200, 1, 'restart', 'levels.js ENEMY_MULT'],
  ['敌人', 'mult.mb', '倍数：小 Boss', 50, 0, 500, 1, 'restart', 'levels.js ENEMY_MULT'],
  ['陷阱', 'lethal.roller', '滚筒致死比例', 0.6, 0, 1, 0.05, 'live', 'runsim.js updateHazards() LETHAL'],
  ['陷阱', 'lethal.saw', '电锯致死比例', 0.75, 0, 1, 0.05, 'live', 'runsim.js LETHAL'],
  ['陷阱', 'lethal.hole', '破洞致死比例', 0.7, 0, 1, 0.05, 'live', 'runsim.js LETHAL'],
  ['陷阱', 'lethal.wave', '毒液致死比例', 0.5, 0, 1, 0.05, 'live', 'runsim.js LETHAL'],
  ['陷阱', 'trapCap', '单个陷阱最多扣兵比例', 0.5, 0.1, 1, 0.05, 'live', 'runsim.js updateHazards()'],
  ['Boss', 'tele', '出招预警（秒）', 1.1, 0.4, 3, 0.05, 'boss', 'runsim.js spawnBoss()'],
  ['Boss', 'rageAt', '狂暴：血量低于', 0.5, 0, 1, 0.05, 'live', 'runsim.js updateSlam()'],
  ['Boss', 'rageSlam', '狂暴：出招间隔 ×', 0.7, 0.3, 1, 0.05, 'live', 'runsim.js updateSlam()'],
  ['Boss', 'rageTele', '狂暴：预警 ×', 0.85, 0.3, 1, 0.05, 'live', 'runsim.js updateSlam()'],
  ['Boss', 'hitCap', '一击最多扣兵比例', 0.25, 0.05, 1, 0.01, 'live', 'runsim.js updateSlam()'],
  ['Boss', 'rainCap', '弹雨一击最多扣兵比例', 0.15, 0.05, 1, 0.01, 'live', 'runsim.js updateSlam()'],
  ['结尾', 'rb.grow', '彩虹滚轮：每格容量 ×（逐格）', 1.5, 1, 3, 0.05, 'restart', 'levels.js RAINBOW → runsim.js startFinale()'],
  ['结尾', 'rb.div', '彩虹滚轮：第一格容量 = 一般兵数 ÷', 8, 2, 30, 1, 'restart', 'levels.js RAINBOW'],
  ['结尾', 'br.grow', '金砖墙：每排容量 ×（逐排）', 1.5, 1, 3, 0.05, 'restart', 'levels.js BRICKS'],
  ['结尾', 'br.div', '金砖墙：第一排容量 = 一般兵数 ÷', 8, 2, 30, 1, 'restart', 'levels.js BRICKS'],
  ['经济', 'stake', '炮倍（打怪、Boss、怪牌 × 倍数）', 500, 50, 5000, 50, 'restart', 'levels.js L.stake → RunSim'],
  ['经济', 'exchange', '兑换门单价（每个兵）', 100, 10, 1000, 10, 'live', 'game.js startExchange()'],
  ['经济', 'perfMin', '一星表现系数下限', 0.6, 0.1, 1, 0.05, 'live', 'game.js startSurprise()'],
  ['经济', 'perfMax', '一星表现系数上限', 1.15, 1, 2, 0.05, 'live', 'game.js startSurprise()'],
  ['经济', 'chipFloor', '其他结尾每份筹码下限', 20, 0, 500, 5, 'live', 'game.js startSurprise()'],
  ['道具', 'healRatio', '治疗救回比例', 0.5, 0, 1, 0.05, 'live', 'runsim.js applyBarrel()'],
  ['道具', 'shieldMin', '护盾：一次掉几个兵以上才挡', 3, 1, 50, 1, 'live', 'runsim.js willShield()'],
  ['表现', 'zoomMax', '镜头随兵数拉远（兵 50→240 时多远）', 0.4, 0, 1.2, 0.05, 'live', 'game.js update() 镜头'],
  ['表现', 'standZoom', '站桩关镜头再远', 0.15, 0, 0.8, 0.05, 'live', 'game.js update() 镜头'],
  ['表现', 'cam.h', '跑关镜头高度', 11, 5, 25, 0.5, 'live', 'world.js runPose()'],
  ['表现', 'cam.back', '跑关镜头在队伍后方', 8.2, 2, 20, 0.2, 'live', 'world.js runPose()'],
  ['表现', 'cam.ahead', '跑关镜头看向队伍前方', 11, 2, 30, 0.5, 'live', 'world.js runPose()'],
  ['表现', 'slowmo', '慢动作时长 ×', 1, 0, 3, 0.1, 'live', 'game.js slowmo()'],
  ['表现', 'hapticGap', '同一种震动最小间隔 ×', 1, 0.2, 4, 0.1, 'live', 'haptics.js buzz()'],
  ['声音', 'mix.run', '跑关音乐音量', 0.13, 0, 0.6, 0.01, 'live', 'audio.js MIX'],
  ['声音', 'mix.boss', 'Boss 战音乐音量', 0.08, 0, 0.6, 0.01, 'live', 'audio.js MIX'],
  ['声音', 'mix.sfx', '音效总音量', 0.8, 0, 1.5, 0.05, 'live', 'audio.js MIX'],
  ['声音', 'mix.dip', '关键音效响时音乐降到 ×', 0.5, 0, 1, 0.05, 'live', 'audio.js dip()'],
  ['声音', 'mix.dipSec', '音乐让位多久（秒）', 0.3, 0, 2, 0.05, 'live', 'audio.js dip()'],
];
const access = k => {
  const [a, b] = k.split('.');
  if (!b) return tune(a);
  if (a === 'mult') return ref(ENEMY_MULT, b);
  if (a === 'lethal') return ref(LETHAL, b);
  if (a === 'rb') return ref(RAINBOW, b);
  if (a === 'br') return ref(BRICKS, b);
  if (a === 'cam') return camKey(b);
  if (a === 'mix') return ref(MIX, b, remix);
  throw new Error('unknown param ' + k);
};
export const PARAMS = P.map(([group, k, name, def, min, max, step, when, where]) => ({ group, k, name, def, min, max, step, when, where, ...access(k) }));
export const PARAM = Object.fromEntries(PARAMS.map(p => [p.k, p]));
export const WHEN = { live: '即时', restart: '重开生效', boss: '下个 Boss 生效' };
