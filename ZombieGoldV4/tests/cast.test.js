// The cast table (src/content/cast.js) against the art and the level table: every skeleton it names exists in
// assets/spine/catalog.json, every move resolves to an animation the skeleton really has, and every boss and
// mini-boss the levels ask for has art. Catches a typo in a planner's edit before anyone opens the game.
import { log, readText, check, done } from './lib.js';
import * as CAST from '../src/content/cast.js';
import { LEVELS, FISH } from '../src/content/levels.js';

const catalog = new Map(JSON.parse(readText('assets/spine/catalog.json')).skeletons.map(s => [s.key, s]));
// skeletons left out on purpose (docs/素材清单.md says why)
const BANNED = ['batch2/41100047'];

function asset(where, key) {
  check(catalog.has(key), `${where}: skeleton ${key} is not in assets/spine/catalog.json`);
  check(!BANNED.includes(key), `${where}: ${key} is excluded (see docs/素材清单.md)`);
  return catalog.get(key);
}
// a move resolves when one of its names is an animation of the skeleton; `optional` moves may list none
function moves(where, spec, required, optional = []) {
  const sk = asset(where, spec.asset);
  if (!sk) return;
  for (const [move, names] of Object.entries(spec.anims)) {
    const ok = names.some(n => sk.animations.includes(n));
    if (required.includes(move)) check(ok, `${where}: move "${move}" (${names.join('/')}) has no animation in ${spec.asset} (${sk.animations.join(' ')})`);
    else if (names.length && !optional.includes(move)) check(ok, `${where}: move "${move}" (${names.join('/')}) matches nothing in ${spec.asset}`);
  }
  check(typeof spec.height === 'number' && spec.height > 0, `${where}: height must be a positive number`);
}

// squad, zombies, roles, chapters
moves('SQUAD', CAST.SQUAD, ['run', 'shoot', 'idle']);
for (const [id, z] of Object.entries(CAST.ZOMBIES)) moves(`ZOMBIES.${id}`, z, ['run'], ['attack']);
CAST.HORDE_BY_CHAPTER.forEach((list, ch) => list.forEach(id => check(CAST.ZOMBIES[id], `HORDE_BY_CHAPTER[${ch}]: no zombie "${id}"`)));
for (const [role, id] of Object.entries(CAST.ROLES)) check(CAST.ZOMBIES[id], `ROLES.${role}: no zombie "${id}"`);

// bosses and mini-bosses
const BOSS_MOVES = ['walk', 'attack', 'die'];
for (const [k, b] of Object.entries(CAST.BOSSES)) moves(`BOSSES.${k}`, b, BOSS_MOVES, ['hit', 'roar', 'idle']);
for (const [k, b] of Object.entries(CAST.BOSS_BY_NAME)) moves(`BOSS_BY_NAME.${k}`, b, BOSS_MOVES, ['hit', 'roar', 'idle']);
moves('GOLD_GIANT', CAST.GOLD_GIANT, ['walk', 'die'], ['hit', 'roar', 'attack', 'idle']);
for (const [k, m] of Object.entries(CAST.MINI_BOSSES)) moves(`MINI_BOSSES.${k}`, m, ['walk', 'die'], ['attack', 'idle', 'hit']);
check(CAST.MINI_BOSSES[CAST.MINI_BOSS_DEFAULT], 'MINI_BOSS_DEFAULT names a mini-boss');

// what the levels ask for
const miniFor = name => CAST.MINI_BOSSES[name] || Object.keys(CAST.MINI_BOSSES).find(k => name && name.includes(k));
let bosses = 0, minis = 0;
for (const L of LEVELS) {
  const b = L.finale && L.finale.boss;
  if (b) { bosses++; check(CAST.BOSSES[b.model], `level ${L.code}: boss model "${b.model}" has no entry in BOSSES`); }
  for (const t of (L.run && L.run.seq) || []) if (Array.isArray(t) && t[0] === 'mb') { minis++; check(miniFor(t[3]), `level ${L.code}: mini-boss "${t[3]}" matches nothing in MINI_BOSSES`); }
}

// the shooting room: every fish-table entry is played by someone
for (const k of Object.keys(FISH)) check(CAST.TARGETS[k] || CAST.BIG_TARGETS[k], `FISH.${k} has no target in TARGETS / BIG_TARGETS`);
for (const [k, id] of Object.entries(CAST.TARGETS)) { check(FISH[k], `TARGETS.${k}: no such fish`); check(CAST.ZOMBIES[id], `TARGETS.${k}: no zombie "${id}"`); }
for (const [k, b] of Object.entries(CAST.BIG_TARGETS)) moves(`BIG_TARGETS.${k}`, b, ['walk', 'die'], ['attack', 'idle', 'hit', 'roar']);
for (const [k, s] of Object.entries({ ROOM_HERO: CAST.ROOM_HERO, ROOM_PARTNER: CAST.ROOM_PARTNER, TURRET: CAST.TURRET })) asset(k, s.asset);
const hero = catalog.get(CAST.ROOM_HERO.asset);
for (const a of [30, 50, 70, 90, 110, 130, 150]) check(hero && hero.animations.includes('attack' + a), `ROOM_HERO needs attack${a} (the gun aims by angle)`);

log(`  ${catalog.size} skeletons in the catalog, ${Object.keys(CAST.ZOMBIES).length} zombie types, ${bosses} level bosses, ${minis} mini-bosses checked`);
done('cast');
