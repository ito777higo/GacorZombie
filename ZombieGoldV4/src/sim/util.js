// Small shared helpers: clamps and easing, weighted picks, number formatting (K / M / B, 3-digit commas). Pure: nothing
// here draws a random number (sims use their Rng, src/sim/rng.js; views use src/view/random.js).
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);
export const easeOut = t => 1 - (1 - t) ** 3;
export const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutBack = t => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
// frame-rate independent exponential approach: k is "per second" sharpness
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

export function fmt(n) {
  n = Math.round(n);
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '-' : '') + s;
}
export const sgn = n => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
// coins in K / M / B (never 万 / 亿): 950 → 950, 12,345 → 12.3K, 2,200,000 → 2.2M, 1,250,000,000,000 → 1,250B
export function kmb(n) {
  n = Math.round(n);
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  if (a < 1000) return sign + a;
  const [u, d] = a < 1e6 ? ['K', 1e3] : a < 1e9 ? ['M', 1e6] : ['B', 1e9];
  const v = a / d, dec = v < 10 ? 2 : v < 100 ? 1 : 0;
  const t = v >= 1000 ? fmt(Math.floor(v)) : (Math.floor(v * 10 ** dec) / 10 ** dec).toFixed(dec).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return sign + t + u;
}

// weighted pick: items [{w, ...}], r a uniform number in [0, 1) from the caller's generator
export function weighted(items, r) {
  let tot = 0;
  for (const it of items) tot += it.w;
  let x = r * tot;
  for (const it of items) { x -= it.w; if (x <= 0) return it; }
  return items[items.length - 1];
}

