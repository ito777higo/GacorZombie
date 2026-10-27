// v9.5 全局数值: the global numbers the 调参台 opens, in one object. The modules read them from TUNE at the moment
// they use them, so a change shows at once (or on the next restart, for what is laid out when a level starts).
// The defaults are the demo's numbers; src/edit/params.js lists them with names, ranges and where each one acts.
// Nothing here imports another module, so anything can read it.
export const TUNE = {
  // 关卡
  speed: 8.5,         // forward speed, world units / s (8.5 units ≈ 1 s of road)
  gap: 26,            // default space between two script items
  army: 2,            // 兵力系数: from 大关二 on, start soldiers and every + are × this
  // 队伍和射击
  volleys: 16,        // volleys a second at fire rate ×1
  dmgPow: 0.8,        // one volley does 1.5 + N^dmgPow damage
  range: 38,          // how far ahead the bullets reach
  bulletV: 40,        // bullet speed (v9: slow, so every bullet is seen)
  spreadArc: 1.1,     // 散射 fan, edge to edge (radians)
  // 门
  straddle: 0.75,     // ride within this distance of a gold post to take both gates
  postCut: 0.15,      // share of the squad the post knocks off
  gateGain: 0.06,     // a shot gate panel climbs by damage × this × army
  // 敌人
  waveN: 1.5, waveHp: 1.15,           // count and hp multipliers on the level data
  zSpeed: 1, dogSpeed: 1, bruteSpeed: 1,
  rushDist: 46,       // a horde starts running at the squad this far ahead
  sideDist: 15,       // roadside ambushes leap out when the squad is this close
  brutePower: 8,      // soldiers an elite takes when it reaches the squad
  mbCut: 0.25,        // share of the squad a mini-boss smashes
  trapCap: 0.5,       // one trap never takes more than this share
  // Boss
  tele: 1.1,          // warning before each move (s)
  rageAt: 0.5, rageSlam: 0.7, rageTele: 0.85,   // rage below this health share: pauses and warnings shorter
  hitCap: 0.25, rainCap: 0.15,        // one blow never takes more than this share (the rain of small circles less)
  // 经济
  stake: 500,         // 炮倍: a monster pays multiple × this (v9.4: small base, big multiples)
  exchange: 100,      // 兑换门: coins per soldier
  perfMin: 0.6, perfMax: 1.15,        // 一星: how far a run's pay may move from its script
  chipFloor: 20,      // the least a finale unit pays (the 彩虹滚轮 / 金砖墙 pay at least the 兑换门 rate)
  // 道具
  healRatio: 0.5,     // 治疗 brings back this share of the soldiers lost so far
  shieldMin: 3,       // a 护盾 layer only spends itself on a loss of at least this many
  // 表现
  zoomMax: 0.4,       // the camera pulls back by up to this much as the squad grows from 50 to 240 drawn
  standZoom: 0.15,    // 站桩关: that much further still
  slowmo: 1,          // every slow-motion moment lasts × this
  hapticGap: 1,       // the least time between two vibrations of one kind, × this
};
