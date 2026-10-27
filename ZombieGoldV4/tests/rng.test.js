// Rng: the same stream as mulberry32 (the views' scenery depends on that sequence), resumable from its state, and the
// helpers stay in range.
import { check, eq, done } from './lib.js';
import { Rng, mulberry32, randomSeed } from '../src/sim/rng.js';

const r = new Rng(12345), m = mulberry32(12345);
let same = true;
for (let i = 0; i < 2000; i++) if (r.next() !== m()) same = false;
check(same, 'Rng(seed).next() follows mulberry32(seed)');

const a = new Rng(99);
for (let i = 0; i < 10; i++) a.next();
const b = new Rng(0);
b.state = a.state;
eq(b.next(), a.next(), 'a copy of the state carries on the same stream');
eq(new Rng(7).seed, 7, 'seed is kept');

const q = new Rng(5);
let inRange = true, ints = new Set();
for (let i = 0; i < 5000; i++) {
  const x = q.range(-2, 3), k = q.int(4);
  if (x < -2 || x >= 3 || k < 0 || k > 3 || k !== Math.floor(k)) inRange = false;
  ints.add(k);
}
check(inRange && ints.size === 4, 'range() and int() stay in range and reach every value');

const W = [{ k: 'a', w: 1 }, { k: 'b', w: 3 }, { k: 'c', w: 0 }], n = { a: 0, b: 0, c: 0 };
for (let i = 0; i < 8000; i++) n[q.weighted(W).k]++;
check(n.c === 0 && n.b / n.a > 2.6 && n.b / n.a < 3.4, `weighted() follows the weights (${JSON.stringify(n)})`);

const s1 = randomSeed(), s2 = randomSeed();
check(Number.isInteger(s1) && s1 >= 0 && s1 < 2 ** 32 && s1 !== s2, 'randomSeed() gives fresh 32-bit seeds');
done('rng');
