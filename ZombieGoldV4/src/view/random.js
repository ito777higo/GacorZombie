// Unseeded randomness for everything outside the logic layer: particle jitter, sound variety, floating text, and the
// wheel draws game.js makes itself. Never import this from src/sim/ or src/content/: the sims draw from their own
// seeded Rng (src/sim/rng.js) so a run can be replayed from its seed.
import { weighted as weightedBy } from '../sim/util.js';

export const rand = (a, b) => a + Math.random() * (b - a);
// weighted pick: items [{w, ...}]
export const weighted = items => weightedBy(items, Math.random());
