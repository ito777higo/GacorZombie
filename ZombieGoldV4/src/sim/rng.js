// Seeded random numbers for the logic layer. Every sim (RunSim, FishSim, BonusSim) owns one Rng and draws all of its
// randomness from it, so a seed plus the same inputs replays the same run. randomSeed() is the only Math.random call
// allowed under src/sim/: it picks a fresh seed for callers that want a new game every time.
import { weighted } from './util.js';

export const randomSeed = () => (Math.random() * 0x100000000) >>> 0;

// mulberry32 as a closure: () → [0, 1). The views use it for scenery that must look the same on every visit.
export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The same generator as an object: `seed` is what it started from, `state` is everything needed to resume it.
export class Rng {
  constructor(seed = randomSeed()) {
    this.seed = seed >>> 0;
    this.state = this.seed | 0;
  }
  // [0, 1)
  next() {
    const a = this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // [a, b)
  range(a, b) { return a + this.next() * (b - a); }
  // integer in [0, n)
  int(n) { return Math.floor(this.next() * n); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[this.int(arr.length)]; }
  // items [{ w, ... }]: one item, with probability w / Σw
  weighted(items) { return weighted(items, this.next()); }
}
