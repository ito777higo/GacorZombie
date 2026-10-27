// Squad formation shared by the simulation (hazards hit individual soldiers) and the view.
import { ROAD_HW } from './arena.js';

export const VIS_MAX = 240;          // soldiers drawn; the label shows the real count
const GA = 2.399963;                 // golden angle: sunflower packing

// When the heroes ride their pickup inside the squad, the packing leaves a gap the size of the truck
// (plus a soldier's width) just behind the centre, so the soldiers stand round it instead of through it.
export const TRUCK = { hw: 0.56, hl: 1.16, hz: 0.35, pad: 0.3 };
let HOLE = null, skipped = 0;

export const SLOT = [];
export const CENT = [[0, 0]];
function build() {
  SLOT.length = 0; CENT.length = 1; skipped = 0;
  for (let k = 0; SLOT.length < VIS_MAX; k++) {
    const r = 0.3 * Math.sqrt(k + 0.6), x = r * Math.cos(k * GA), z = r * Math.sin(k * GA) * 0.92;
    if (HOLE && Math.abs(x) < HOLE.hx && Math.abs(z - HOLE.hz) < HOLE.hl) { skipped++; continue; }
    SLOT.push([x, z]);
  }
  // centroid of the first n slots, so a squad of any size is centred on its x
  for (let n = 1, sx = 0, sz = 0; n <= VIS_MAX; n++) { sx += SLOT[n - 1][0]; sz += SLOT[n - 1][1]; CENT.push([sx / n, sz / n]); }
}
build();
// on: leave the truck's gap (true while the heroes ride the pickup)
export function setTruckHole(on) {
  const want = on ? { hx: TRUCK.hw + TRUCK.pad, hl: TRUCK.hl + TRUCK.pad, hz: TRUCK.hz } : null;
  if (!!want === !!HOLE) return;
  HOLE = want; build();
}
export const hole = () => HOLE;
// how many slots the gap takes (the squad is that much wider)
export const holeSlots = () => skipped;

export const LIM = ROAD_HW - 0.28;
export const visCount = n => Math.min(VIS_MAX, Math.max(0, Math.round(n)));

// where the squad drawn with `vis` soldiers is centred: the truck keeps the whole formation on the road
export function formationX(vis, sx) {
  const x = sx - CENT[vis][0], m = HOLE ? LIM - HOLE.hx : LIM;
  return x < -m ? -m : x > m ? m : x;
}

// target position of soldier i in a squad drawn with `vis` soldiers centred on (sx, sz)
export function slotPos(i, vis, sx, sz, out) {
  let x = formationX(vis, sx) + SLOT[i][0];
  x = x < -LIM ? -LIM : x > LIM ? LIM : x;
  out[0] = x; out[1] = sz + SLOT[i][1] - CENT[vis][1];
  return out;
}
