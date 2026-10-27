// 演员表：游戏里每个角色用哪个 Spine 素材、多高、动作名怎么对应。
// 改这里不用动渲染代码。素材预览及动作：tools/spine3d.html；角色总表：docs/素材清单.md。
//
// 通用字段
//   asset   素材键，对应 assets/spine/catalog.json 里的 key（美术原编号）
//   name    中文名（策划起的；美术只给了编号）
//   height  站立时的高度，单位是世界单位（路宽 ≈ 11；一个兵 ≈ 0.95）
//   cell    只对成群的角色有效：烘焙成序列帧时参考姿势占多少像素高（越大越清楚，越占显存）
//   anims   游戏里的动作 → 素材里的动作名（按顺序找第一个有的）。素材缺这个动作时游戏会用程序动画代替
//   fps     烘焙帧率（成群的角色）
//
// 美术导出的僵尸都朝左；兵（主角背影）朝前。代码按移动方向自动镜像。
// 41100047（金发西装）像在影射真实人物，不收录。没用上的素材和原因见 docs/素材清单.md。

// ---------------------------------------------------------------- 我方
// 队伍里的每个兵：主角的背影，一直举枪朝前射（attack90 = 朝正前方开枪）
export const SQUAD = {
  asset: 'hero/jszc_character01', name: '幸存者', height: 0.95, cell: 120, fps: 18,
  anims: { run: ['attack90'], shoot: ['attack90'], idle: ['idle'] },
};
// 皮卡上的英雄：同一个主角，大一号
export const TRUCK_HERO = { scale: 1.1 };

// ---------------------------------------------------------------- 跑道上的僵尸（成群，烘焙成序列帧）
const Z = (asset, name, height, extra = {}) => ({ asset, name, height, cell: 112, fps: 12, anims: { run: ['move'], die: ['die'], attack: ['attack'] }, ...extra });

export const ZOMBIES = {
  helmet:  Z('batch1/41100001', '钢盔僵尸', 1.1),
  miner:   Z('batch2/41100005', '矿工僵尸', 1.08),
  chef:    Z('batch2/41100012', '厨师僵尸', 1.12),
  punk:    Z('batch2/41100026', '朋克女僵尸', 1.15),
  mummy:   Z('batch2/41100024', '木乃伊', 1.08),
  nurse:   Z('batch2/41100044', '护士僵尸', 1.12),
  stitch:  Z('batch2/41100036', '缝合怪', 1.15),
  gunner:  Z('batch2/41100017', '机枪僵尸', 1.2),
  disco:   Z('batch1/41100025', '音响僵尸', 1.2),
  rocket:  Z('batch1/41100011', '火箭僵尸', 1.2),
  lavabug: Z('batch2/41100006', '熔岩甲虫', 1.15),
  torch:   Z('batch2/41100007', '火把胖子', 1.25),
  // 精英（尸潮里的大块头，倍数 ×15）
  fatty:   Z('batch2/41100003', '大肚僵尸', 2.0, { cell: 168 }),
  // 伏击（从路边扑出来，×3）
  spider:  Z('batch2/41100020', '毒蛛', 0.85),
  // 盾墙（×5，挡子弹）
  shield:  Z('batch2/41100027', '铁盾僵尸', 1.3, { cell: 120 }),
  // 蝙蝠 / 蝙蝠群（关卡积木 f）：成群飞过跑道的吸血蝠
  bat:     Z('batch2/41100015', '吸血蝠', 0.9),
};

// 每个大关的尸潮从这几种里挑（按僵尸编号轮流，所以同一关每次一样）
export const HORDE_BY_CHAPTER = [
  ['helmet', 'miner', 'chef'],
  ['helmet', 'punk', 'chef', 'nurse'],
  ['miner', 'stitch', 'chef', 'punk'],
  ['helmet', 'stitch', 'nurse', 'miner'],
];
// 尸潮里不同身份用哪种
export const ROLES = { brute: 'fatty', ambush: 'spider', shield: 'shield', leaper: 'bat' };

// ---------------------------------------------------------------- 小 Boss（实时骨骼动画，一次一两个）
// 关卡表里 ['mb', 血量, 宽度, 名字] 的名字决定用哪个
const M = (asset, name, height, extra = {}) => ({ asset, name, height, anims: { walk: ['move'], attack: ['attack'], die: ['die'], hit: [], idle: ['idle', 'move'] }, ...extra });
export const MINI_BOSSES = {
  '巨尸': M('batch2/41100035', '钻头巨人', 2.6),
  '雪怪': M('batch2/41100014', '雪怪', 2.5),
  '恶魔': M('batch2/41100018', '爆破矿工', 2.6),
  '机甲': M('batch2/41100033', '双生机甲', 2.7),
  '运钞怪': M('batch2/43100001', '运钞怪', 2.3),
  '幻影': M('batch2/41100042', '忍者僵尸', 2.4),
};
export const MINI_BOSS_DEFAULT = '巨尸';

// ---------------------------------------------------------------- Boss（实时骨骼动画）
// 键是关卡表 finale.boss.model 的值。动作：walk 走近，attack 砸地（地上会先出红圈），roar 出场，die 倒下
// color：它的招式（飞弹、冲击波）的颜色 [r, g, b]；shot：它扔出来的东西
const B = (asset, name, height, extra = {}) => ({
  asset, name, height,
  anims: { walk: ['move'], attack: ['attack'], roar: ['attack2', 'attack'], hit: ['sj'], die: ['die'], idle: ['idle', 'move'] },
  color: [1, 0.55, 0.25], shot: 'rock', ...extra,
});
export const BOSSES = {
  raider:   B('batch2/41100035', '矿区重感染者', 5.4),
  hulk:     B('batch2/41100003', '肿胀巨尸', 5.6, {color:[0.65,0.75,0.35],shot:'slime'}),
  chubby:   B('batch2/41300004', '毒泥巨怪', 6.0, { color: [0.7, 0.35, 1], shot: 'slime' }),
  yeti:     B('batch2/41300003', '冰霜巨兽', 6.2, { color: [0.6, 0.9, 1], shot: 'ice' }),
  demon:    B('batch2/41300005', '紫晶机器人', 6.0, { color: [0.85, 0.4, 1], shot: 'orb' }),
  mech:     B('batch2/41300001', '钢铁蛛', 5.6, { color: [1, 0.6, 0.2], shot: 'missile' }),
  // 散射关的 Boss：五块墓碑在场地远端排开，一块一块砸下来
  kraken:   B('batch2/41100045', '尸坟', 4.2, { color: [0.5, 1, 0.45], shot: 'slime', arms: 5, anims: { walk: ['idle'], attack: ['attack', 'attack2'], roar: ['attack2'], hit: [], die: ['die'], idle: ['idle'] } }),
  // 最后一关的 Boss（原来的海豹魔术师）：打倒后打开宝箱翻牌
  // keep: 倒下后不淡出（宝箱一直开着，翻牌时还在）
  magician: B('boss/baoxiangguai', '宝箱怪', 5.6, { color: [1, 0.82, 0.3], shot: 'coin', keep: true, anims: { walk: ['move'], attack: ['attack'], roar: ['jump'], hit: [], die: ['open', 'die'], idle: ['idle'] } }),
};
// 名字里带这些字的 Boss 换素材（运钞巨尸背着金袋跑）
export const BOSS_BY_NAME = {
  '运钞': B('batch2/43100001', '运钞巨尸', 5.4, { color: [1, 0.85, 0.3], shot: 'coin' }),
};
// 结尾惊喜「黄金机甲」（finale 键 goldmob）的金色大怪；黄金尸池的大目标也是它
export const GOLD_GIANT = B('batch2/43300001', '黄金机甲', 6.0, { color: [1, 0.85, 0.3], shot: 'coin' });

// ---------------------------------------------------------------- 打僵尸房（二人捕鱼的替身）和结尾的 Bonus 尸池
// 鱼表（levels.js 的 FISH）每一种对应一个僵尸，倍数、速度、出现概率都还是鱼表里的。
// 小的成群烘焙（ZOMBIES 里的键）；大的（Boss、特殊鱼、魔术师）用实时骨骼动画。
Object.assign(ZOMBIES, {
  puffer:  Z('batch2/41100002', '木乃伊鱼', 1.0),
  tribal:  Z('batch2/41100039', '野人僵尸', 1.2),
  pilot:   Z('batch2/41100043', '飞行员僵尸', 1.3, { cell: 120 }),
  scarab:  Z('batch2/jiakechong202606', '法老金甲虫', 0.9, { anims: { run: ['fly'], die: [] } }),
  hover:   Z('batch2/41100030', '滑板电击僵尸', 1.3),
  shark:   Z('batch2/41100032', '鲨鱼怪', 1.2),
});
export const TARGETS = {
  huang: 'helmet', redai: 'miner', dayan: 'chef', xiaochou: 'punk', hetun: 'puffer', hudie: 'nurse', wugui: 'mummy',
  longxia: 'tribal', jianyu: 'pilot', denglong: 'scarab', ciyao: 'hover', shark: 'shark', bomb: 'rocket',
};
export const BIG_TARGETS = {
  boss: GOLD_GIANT,                                                // 金蟾 → 黄金机甲
  haiman: M('batch2/41100028', '电击怪', 2.6),                      // 海鳗：闪电连锁
  zhangyu: M('batch2/41100018', '爆破矿工', 2.6),                   // 章鱼宝箱：炸出三个宝箱
  xingshi: M('batch2/41100014', '雪怪', 2.6),                       // 醒狮王
  caishen: M('batch2/43100001', '运钞怪', 2.4),                     // 财神爷：元宝雨
  haiwangxie: M('batch2/41100023', '裹布蛛', 2.4),                  // 海王蟹：暴击
  magic: BOSSES.magician,                                          // 海豹魔术师 → 宝箱怪
};
// 房间里的主角：按瞄准角度播 attack30～attack150；技能炮台在两边
export const ROOM_HERO = { asset: 'hero/jszc_character01', height: 3.4 };
export const ROOM_PARTNER = { asset: 'hero/jszc_character01s', height: 3.2 };   // 对面的队友（正面）
export const TURRET = { asset: 'turret/jszc_turret01', height: 1.6 };

// 谁演谁：素材键 → 它在游戏里的角色（素材预览页和 docs/素材清单.md 的总表都从这里读）
export function castRoles() {
  const roles = new Map();
  const add = (asset, label) => { if (asset) (roles.get(asset) || roles.set(asset, []).get(asset)).push(label); };
  add(SQUAD.asset, '队伍里的兵；皮卡上的英雄');
  const ROLE_NAMES = { brute: '精英', ambush: '伏击', shield: '盾墙', leaper: '蝙蝠' };
  const where = id => [
    HORDE_BY_CHAPTER.some(l => l.includes(id)) && '尸潮',
    ...Object.keys(ROLES).filter(k => ROLES[k] === id).map(k => ROLE_NAMES[k]),
    Object.values(TARGETS).includes(id) && '末日战场',
  ].filter(Boolean);
  for (const [id, z] of Object.entries(ZOMBIES)) add(z.asset, `僵尸「${z.name}」（${where(id).join('、') || '未上场'}）`);
  for (const [k, m] of Object.entries(MINI_BOSSES)) add(m.asset, `小 Boss「${m.name}」（关卡里叫 ${k}）`);
  for (const [k, b] of Object.entries(BOSSES)) add(b.asset, `Boss「${b.name}」（${k}）`);
  for (const b of Object.values(BOSS_BY_NAME)) add(b.asset, `Boss「${b.name}」`);
  add(GOLD_GIANT.asset, `结尾惊喜「${GOLD_GIANT.name}」、黄金尸池的大目标`);
  for (const [k, b] of Object.entries(BIG_TARGETS)) if (k !== 'boss' && k !== 'magic') add(b.asset, `末日战场特殊目标「${b.name}」`);
  add(BIG_TARGETS.magic.asset, '末日战场的宝箱怪（翻牌）');
  add(ROOM_HERO.asset, '末日战场的主角（按角度开枪）');
  add(ROOM_PARTNER.asset, '末日战场对面的队友');
  add(TURRET.asset, '技能炮台');
  return roles;
}
