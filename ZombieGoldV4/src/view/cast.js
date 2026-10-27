// Loads what each 大关 draws: the Spine characters listed in src/content/cast.js (crowds baked into one
// flipbook per 大关, bosses and mini-bosses kept as skeletons for live actors) and the Quaternius CC0 props
// (assets/CREDITS.md) merged into static geometries for instancing.
import { loadModels, model, hasModels } from './assets.js';
import { staticGeometry } from './props.js';
import { loadSkeletons } from '../spine/runtime.js';
import { bakeFlipbook } from '../spine/flipbook.js';
import { renderPortraits, portraitUrl } from '../spine/portrait.js';
import { SQUAD, ZOMBIES, HORDE_BY_CHAPTER, ROLES, MINI_BOSSES, MINI_BOSS_DEFAULT, BOSSES, BOSS_BY_NAME, GOLD_GIANT, TARGETS, BIG_TARGETS, ROOM_HERO, ROOM_PARTNER, TURRET } from '../content/cast.js';
import { LEVELS, FISH } from '../content/levels.js';

// ---------------------------------------------------------------- props (glTF)
// the pickup the heroes ride, the gold gate frame (兑换门), supply crates and the road barrier
const RUN_PROPS = ['Vehicle_Pickup_Armored', 'NG_gate_gold', 'PA_Chest', 'PA_Chest_Special', 'PA_TrafficBarrier_1'];
const LAND_PROPS = ['ExplodingBarrel', 'Barrier_Large', 'Barrier_Single', 'Container_Long', 'Container_Small', 'Crate', 'Debris_BrokenCar', 'Debris_Tires', 'Tank', 'TrafficCone', 'StreetLight', 'Tree_1', 'SackTrench',
  'PA_Container_Red', 'PA_Container_Green', 'PA_WaterTower', 'PA_TrafficLight_2', 'PA_PlasticBarrier', 'PA_TrashBag_2', 'PA_Wheels_Stack', 'PA_Blood_1', 'PA_Blood_2', 'PA_TownSign', 'PA_FireHydrant',
  'PA_TrafficBarrier_2', 'PA_CinderBlock', 'PA_Pallet', 'PA_Pipes', 'PA_Couch', 'PA_Barrel', 'PA_StreetLights', 'NG_TrafficCone_2', 'NG_Wheel', 'NG_Vehicle_Sports_Armored', 'NG_Vehicle_Truck'];
const SEA_PROPS = ['ExplodingBarrel', 'Crate', 'Environment_PalmTree_1', 'Environment_Rock_2', 'Ship_Small', 'Environment_Dock', 'Barrier_Single'];
const TREASURE = ['Prop_Fish_Tuna', 'Prop_Fish_Mackerel', 'Characters_Shark', 'Prop_Chest_Gold', 'Prop_Coins', 'Prop_GoldBag'];
const MODELS = [
  [...RUN_PROPS, ...LAND_PROPS],
  [...RUN_PROPS, ...LAND_PROPS, ...SEA_PROPS, ...TREASURE],
  [...RUN_PROPS, ...SEA_PROPS, ...TREASURE],
  [...RUN_PROPS, ...SEA_PROPS, ...TREASURE],
  [...RUN_PROPS, ...SEA_PROPS, ...TREASURE],
];
const ALL_MODELS = [...new Set(MODELS.flat())];

const PROP_OPTS = {
  ExplodingBarrel: { scale: 0.95 }, Crate: { scale: 0.7 }, Barrier_Large: { scale: 0.75 }, Barrier_Single: { scale: 0.75 },
  Container_Long: { scale: 0.85 }, Container_Small: { scale: 0.85 }, Debris_BrokenCar: { scale: 0.8 }, Debris_Tires: { scale: 0.8 },
  Tank: { scale: 0.9 }, TrafficCone: { scale: 0.7 }, StreetLight: { scale: 1.2 }, Tree_1: { scale: 1.1 }, SackTrench: { scale: 0.8 },
  Environment_PalmTree_1: { scale: 1.2 }, Environment_Rock_2: { scale: 1 }, Ship_Small: { scale: 1.6 }, Environment_Dock: { scale: 1 },
  Vehicle_Pickup_Armored: { scale: 0.42, yaw: Math.PI },
  NG_Vehicle_Sports_Armored: { scale: 0.75 }, NG_Vehicle_Truck: { scale: 0.75 }, NG_Wheel: { scale: 1.3 }, PA_TrafficBarrier_1: { scale: 1.15 },
  Prop_Fish_Tuna: { scale: 1 }, Prop_Fish_Mackerel: { scale: 1 }, Prop_Chest_Gold: { scale: 1 }, Prop_Coins: { scale: 1 }, Prop_GoldBag: { scale: 1 },
};

export const CAST = { props: {}, books: new Map(), skeletons: new Map(), failed: false, renderer: null };
// the world hands its renderer over once, for baking flipbooks and portraits outside a level
export function useRenderer(r) { CAST.renderer = r; }

export function propGeo(name) {
  if (CAST.props[name]) return CAST.props[name];
  const g = model(name);
  if (!g) return null;
  return (CAST.props[name] = staticGeometry(g, { ground: true, ...(PROP_OPTS[name] || {}) }));
}

// ---------------------------------------------------------------- Spine characters
const clampCh = ch => Math.max(0, Math.min(HORDE_BY_CHAPTER.length - 1, ch));

// the horde types of a 大关 plus the roles every 大关 can use (elite, ambusher, shield wall, leapers)
export const hordeOf = ch => HORDE_BY_CHAPTER[clampCh(ch)];
export const crowdIds = ch => [...new Set([...hordeOf(ch), ...Object.values(ROLES)])];

export function miniBossSpec(name) {
  return MINI_BOSSES[name] || MINI_BOSSES[Object.keys(MINI_BOSSES).find(k => name && name.includes(k))] || MINI_BOSSES[MINI_BOSS_DEFAULT];
}
export function bossSpec(kind, name = '') {
  const byName = Object.keys(BOSS_BY_NAME).find(k => name.includes(k));
  return byName ? BOSS_BY_NAME[byName] : BOSSES[kind] || BOSSES.chubby;
}

// the 打僵尸房 and the Bonus 尸池: every fish-table target, the hero at the gun, the partner and the turrets
const ROOM_KEYS = [...new Set([...Object.values(TARGETS).map(id => ZOMBIES[id].asset), ...Object.values(BIG_TARGETS).map(s => s.asset), ROOM_HERO.asset, ROOM_PARTNER.asset, TURRET.asset])];
// a 大关 needs the room when one of its levels ends in the Bonus pool, and from 大关三 on (the room opens there)
const needsRoom = ch => ch >= 2 || LEVELS.some(L => clampCh(L.ch) === ch && L.finale && L.finale.after === 'bonus');

// every skeleton a 大关's levels can show (scanned from the level table, so new levels need no list here)
function skeletonKeys(ch) {
  const keys = new Set([SQUAD.asset, ...crowdIds(ch).map(id => ZOMBIES[id].asset), GOLD_GIANT.asset, ...(needsRoom(clampCh(ch)) ? ROOM_KEYS : [])]);
  for (const L of LEVELS) {
    if (clampCh(L.ch) !== clampCh(ch)) continue;
    const b = L.finale && L.finale.boss;
    if (b) keys.add(bossSpec(b.model, b.name).asset);
    for (const t of (L.run && L.run.seq) || []) if (Array.isArray(t) && t[0] === 'mb') keys.add(miniBossSpec(t[3]).asset);
  }
  return [...keys];
}

export const skeleton = key => CAST.skeletons.get(key) || null;

// The flipbook for a 大关's crowds (squad + its zombies), baked on first use and kept.
export function crowdBook(renderer, ch) {
  ch = clampCh(ch);
  if (CAST.books.has(ch)) return CAST.books.get(ch);
  const spec = (id, s) => ({
    id, asset: skeleton(s.asset), height: s.height, cell: s.cell, ref: s.anims.run,
    clips: Object.fromEntries(Object.entries(s.anims).map(([k, names]) => [k, [names, s.fps, k !== 'die']])),
  });
  const specs = [spec('squad', SQUAD), ...crowdIds(ch).map(id => spec(id, ZOMBIES[id]))].filter(s => s.asset);
  const book = bakeFlipbook(renderer, specs);
  CAST.books.set(ch, book);
  return book;
}

// The flipbook of the room's small targets, baked on first use. The room camera is high, so cells are smaller.
export function roomBook(renderer) {
  if (CAST.books.has('room')) return CAST.books.get('room');
  const ids = [...new Set(Object.values(TARGETS))];
  // the bigger a target walks the yard (the fish table's size), the more pixels its frames get
  const size = id => Math.max(...Object.keys(TARGETS).filter(k => TARGETS[k] === id).map(k => FISH[k].size));
  const specs = ids.map(id => {
    const s = ZOMBIES[id];
    return { id, asset: skeleton(s.asset), height: s.height, cell: Math.round(Math.max(90, Math.min(200, size(id) * 44))), ref: s.anims.run,
      clips: Object.fromEntries(Object.entries(s.anims).map(([k, names]) => [k, [names, s.fps, k !== 'die']])) };
  }).filter(s => s.asset);
  const book = bakeFlipbook(renderer, specs);
  CAST.books.set('room', book);
  return book;
}
export function prepareRoom() {
  const keys = ROOM_KEYS.filter(k => !CAST.skeletons.has(k));
  return loadSkeletons(keys).then(a => a.forEach(x => CAST.skeletons.set(x.key, x)));
}

// The picture for a fish-table card number (the DOM still asks by the 二人捕鱼 card id): the portrait of the
// target that plays that fish. Cards no fish uses (room buttons, the magician's flip cards) get a fixed zombie
// by number. Before the art is loaded it is an empty picture.
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const CARD_TO_FISH = new Map(Object.entries(FISH).map(([k, f]) => [f.card, k]));
const SPARE = ['helmet', 'punk', 'chef', 'nurse', 'mummy', 'gunner', 'disco', 'shark', 'pilot', 'hover', 'tribal', 'puffer'];
function cardSpec(card) {
  const k = CARD_TO_FISH.get(card);
  const big = k && (BIG_TARGETS[k] || (k === 'magic' && BIG_TARGETS.magic));
  if (big) return { key: 'card:' + card, name: big.name, asset: skeleton(big.asset), anim: [big.anims.idle, big.anims.walk].flat() };
  const z = ZOMBIES[(k && TARGETS[k]) || SPARE[Math.abs(card) % SPARE.length]];
  return { key: 'card:' + card, name: z.name, asset: skeleton(z.asset), anim: z.anims.run };
}
export const targetCardName = card => cardSpec(card).name;
export function targetCard(card) {
  const key = 'card:' + card;
  if (!portraitUrl(key) && CAST.renderer) {
    const sp = cardSpec(card);
    if (sp.asset) renderPortraits(CAST.renderer, [sp]);
  }
  return portraitUrl(key) || BLANK;
}
// the portrait of any cast entry ({ asset, anims }) by a key of your choosing
export function castPortrait(key, spec) {
  if (!portraitUrl(key) && CAST.renderer && skeleton(spec.asset)) {
    const a = spec.anims || {};
    renderPortraits(CAST.renderer, [{ key, asset: skeleton(spec.asset), anim: [a.idle, a.walk, a.run].flat().filter(Boolean) }]);
  }
  return portraitUrl(key);
}

// ---------------------------------------------------------------- loading
// Resolves once everything the 大关 needs is loaded. Never rejects: on failure CAST.failed is set.
export async function prepareCast(ch) {
  try {
    const need = MODELS[Math.max(0, Math.min(MODELS.length - 1, ch))];
    const keys = skeletonKeys(ch).filter(k => !CAST.skeletons.has(k));
    const [, assets] = await Promise.all([hasModels(need) ? null : loadModels(need), loadSkeletons(keys)]);
    assets.forEach(a => CAST.skeletons.set(a.key, a));
  } catch (e) {
    console.error('[cast]', e);
    CAST.failed = true;
  }
  return !CAST.failed;
}
export function castFor(ch) {
  if (CAST.failed) return true;
  return hasModels(MODELS[Math.max(0, Math.min(MODELS.length - 1, ch))]) && skeletonKeys(ch).every(k => CAST.skeletons.has(k));
}
// warm the other 大关 in the background once the first one is in
export function preloadAll() {
  loadModels(ALL_MODELS).catch(e => console.error('[cast] preload', e));
  for (let ch = 0; ch < HORDE_BY_CHAPTER.length; ch++) prepareCast(ch);
  prepareRoom().catch(e => console.error('[cast] room', e));
}
