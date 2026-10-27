// 特殊目标 (二人捕鱼的特殊鱼): the big wins of the shooting room (末日战场) besides the 黄金机甲 wheel. Each kind is a
// different shape of 爆分, taken from the real game's special fish (BY_FishConfig; its fish in brackets): 电击怪 (海鳗)
// chains lightning through the targets around it, 爆破矿工 (章鱼) offers three treasure chests, 雪怪 (醒狮王) drums its
// multiple up beat by beat, 运钞怪 (财神爷) drops gold ingots from the sky, 裹布蛛 (海王蟹) starts 8 seconds of 全场暴击.
// Tables only; FishSim / BonusSim play them, FishView and ui.js draw them.
// The draws take the caller's Rng (src/sim/rng.js); without one they use a freshly seeded one.
import { Rng } from '../sim/rng.js';

export const SPECIALS = {
  chain: { name: '电击怪 · 闪电连锁', sub: '闪电连到附近的僵尸，一串全电倒', E: 70, links: 8, radius: 10 },
  chest: { name: '爆破矿工 · 炸出宝箱', sub: '炸出三个宝箱，选一个，金币喷出来', E: 55 },
  lion: { name: '雪怪 · 步步高', sub: '鼓点一下倍数跳一格，最高 ×400', E: 60 },
  ingot: { name: '运钞怪 · 喜从天降', sub: '元宝从天上砸下来，每个都有倍数', E: 60, n: 8 },
  crit: { name: '裹布蛛 · 暴击', sub: '8 秒全场暴击，每只僵尸 ×2～×12，炮免费', E: 110, dur: 8 },
};

// 宝箱: three multiples behind three chests (shuffled); the one-star script hands the player ×50 and shows ×10 and ×20 in the others
const CHEST = [{ m: 10, w: 24 }, { m: 20, w: 26 }, { m: 30, w: 20 }, { m: 50, w: 14 }, { m: 80, w: 9 }, { m: 100, w: 5 }, { m: 150, w: 2 }];
export function chestValues(scripted, rng = new Rng()) {
  if (scripted) return { scripted: true, best: 50, rest: [10, 20] };
  return { values: [rng.weighted(CHEST).m, rng.weighted(CHEST).m, rng.weighted(CHEST).m] };
}
// 雪怪 · 步步高 (醒狮王): the multiple climbs these steps, one per drum beat, and stops at the drawn final
export const LION_STEPS = [10, 20, 30, 50, 80, 120, 180, 250, 320, 400];
const LION = [{ m: 20, w: 30 }, { m: 30, w: 25 }, { m: 50, w: 20 }, { m: 80, w: 12 }, { m: 120, w: 7 }, { m: 180, w: 3.5 }, { m: 250, w: 1.5 }, { m: 400, w: 1 }];
export const lionFinal = (scripted, rng = new Rng()) => (scripted ? 120 : rng.weighted(LION).m);
// 运钞怪 (财神爷): eight ingots, each with a multiple
const INGOT = [{ m: 3, w: 30 }, { m: 5, w: 28 }, { m: 8, w: 20 }, { m: 10, w: 12 }, { m: 15, w: 6 }, { m: 20, w: 3 }, { m: 30, w: 1 }];
export const ingotValues = (n, rng = new Rng()) => Array.from({ length: n }, () => rng.weighted(INGOT).m);
// 裹布蛛 · 暴击 (海王狩猎): the critical multiple of every catch while it lasts
const CRIT = [{ m: 2, w: 40 }, { m: 3, w: 28 }, { m: 5, w: 18 }, { m: 8, w: 10 }, { m: 12, w: 4 }];
export const critMult = (rng = new Rng()) => rng.weighted(CRIT).m;
