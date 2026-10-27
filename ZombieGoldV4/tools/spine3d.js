// 素材预览：every Spine skeleton the art team delivered, shown in the game's own 3D renderer (src/spine/), with
// the role it plays (src/content/cast.js) and buttons for its animations.
//
//   tools/spine3d.html                                the list; tap one to see it
//   tools/spine3d.html#key=batch2/41300004            one skeleton, live
//   tools/spine3d.html#lineup=key1,key2,…             several side by side (sizes compared at the same height)
//   tools/spine3d.html#crowd                          a run-like scene: the squad and a horde from a baked flipbook
//
// window.s3 exposes the scene; s3.advance(sec) steps it when the preview tab is in the background.
import * as THREE from '../src/view/three.js';
import { loadSkeleton, loadSkeletons } from '../src/spine/runtime.js';
import { bakeFlipbook, SpriteCrowd } from '../src/spine/flipbook.js';
import { SpineActor } from '../src/spine/actor.js';
import * as CAST from '../src/content/cast.js';

const canvas = document.getElementById('c'), info = document.getElementById('info'), list = document.getElementById('list');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#8fa3b3');
scene.fog = new THREE.Fog('#8fa3b3', 40, 110);
const camera = new THREE.PerspectiveCamera(52, 1, 0.5, 400);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556677, 2));
const road = new THREE.Mesh(new THREE.PlaneGeometry(11, 200), new THREE.MeshStandardMaterial({ color: '#5a5f68' }));
road.rotation.x = -Math.PI / 2; road.position.z = -80; scene.add(road);

// who plays whom: asset key → role names, read from the cast table
const roles = CAST.castRoles();

const actors = [];
let crowd = null, t = 0;
function clearStage() {
  for (const a of actors) a.dispose();
  actors.length = 0;
  if (crowd) { crowd.dispose(); crowd = null; }
}

async function showOne(key) {
  clearStage();
  const a = await loadSkeleton(key);
  const act = new SpineActor(a, { height: 3.2 });
  act.position.set(0, 0, -8); act.play([a.pick('idle', 'move', a.animations[0])]); scene.add(act); actors.push(act);
  const btns = a.animations.map(n => `<button data-a="${n}">${n}</button>`).join('');
  info.innerHTML = `<b>${key}</b><br>${(roles.get(key) || ['（未使用）']).join('<br>')}<br>${btns}<br><button data-flip>镜像</button> <a href="#">← 列表</a>`;
  info.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act.play([b.dataset.a], true));
  info.querySelector('[data-flip]').onclick = () => { act.flip = !act.flip; };
  list.hidden = true;
}

async function showLineup(keys) {
  clearStage();
  const assets = await loadSkeletons(keys);
  assets.forEach((a, i) => {
    const act = new SpineActor(a, { height: 2.4 });
    act.position.set(((i % 3) - 1) * 3.2, 0, -6 - Math.floor(i / 3) * 5);
    act.play([a.pick('idle', 'move', a.animations[0])]); scene.add(act); actors.push(act);
  });
  info.textContent = keys.join('  ·  ');
  list.hidden = true;
}

async function showCrowd() {
  clearStage();
  const ids = ['helmet', 'miner', 'chef', 'punk', 'mummy', 'stitch', 'rocket'];
  const [hero, ...zs] = await loadSkeletons([CAST.SQUAD.asset, ...ids.map(id => CAST.ZOMBIES[id].asset)]);
  const t0 = performance.now();
  const spec = (id, asset, s) => ({ id, asset, height: s.height, cell: s.cell, ref: s.anims.run, clips: Object.fromEntries(Object.entries(s.anims).map(([k, n]) => [k, [n, s.fps, k !== 'die']])) });
  const book = bakeFlipbook(renderer, [spec('squad', hero, CAST.SQUAD), ...zs.map((a, i) => spec(ids[i], a, CAST.ZOMBIES[ids[i]]))]);
  const ms = performance.now() - t0;
  crowd = new SpriteCrowd(scene, book, 400);
  const squad = Array.from({ length: 60 }, (_, i) => ({ x: Math.cos(i * 2.39996) * 0.33 * Math.sqrt(i), z: Math.sin(i * 2.39996) * 0.33 * Math.sqrt(i), ph: i * 0.37 }));
  const horde = Array.from({ length: 120 }, (_, i) => ({ id: ids[i % ids.length], x: (Math.random() - 0.5) * 8, z: -8 - Math.random() * 60, ph: Math.random() * 3, dir: Math.random() < 0.5 ? -1 : 1, dead: -1 }));
  crowd.tick = dt => {
    crowd.begin();
    for (const s of squad) crowd.put('squad', 'run', t + s.ph, s.x, Math.abs(Math.sin((t + s.ph) * 9)) * 0.05, s.z);
    for (const z of horde) {
      z.z += dt * 1.6; if (z.z > -2 && z.dead < 0) z.dead = t;
      if (z.dead >= 0 && t - z.dead > 1.4) { z.z = -70; z.dead = -1; }
      const dying = z.dead >= 0, k = t - z.dead;
      crowd.put(z.id, dying ? 'die' : 'run', dying ? k : t + z.ph, z.x, 0, z.z, z.dir, 1, null, dying ? Math.max(0, 1 - (k - 0.9) * 3) : 1, 0, dying && k < 0.1 ? 0.7 : 0);
    }
    crowd.end(camera);
  };
  info.textContent = `atlas ${book.size.join('×')} · bake ${ms.toFixed(0)} ms · ${squad.length + horde.length} figures`;
  list.hidden = true;
}

// the list: every skeleton in assets/spine/catalog.json with its role
async function showList() {
  clearStage();
  const cat = await (await fetch('../assets/spine/catalog.json')).json();
  list.innerHTML = '<p>点一个素材看它在 3D 场景里的样子。<a href="#crowd">看成群的效果</a></p>' + cat.skeletons.map(s =>
    `<a class="row" href="#key=${s.key}"><b>${s.key}</b><span>${(roles.get(s.key) || ['未使用']).join(' · ')}</span><small>${s.animations.join(' ')}</small></a>`).join('');
  list.hidden = false;
  info.textContent = '素材预览';
}

async function route() {
  const h = decodeURIComponent(location.hash);
  const key = (h.match(/key=([^&]+)/) || [])[1], lineup = (h.match(/lineup=([^&]+)/) || [])[1];
  if (key) await showOne(key);
  else if (lineup) await showLineup(lineup.split(','));
  else if (h.includes('crowd')) await showCrowd();
  else await showList();
}
addEventListener('hashchange', route);

function frame(dt) {
  t += dt;
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  camera.position.set(0, 11, 8.2); camera.lookAt(0, 0, -11);
  if (crowd) crowd.tick(dt);
  for (const a of actors) a.update(dt);
  renderer.render(scene, camera);
}
let last = performance.now();
function loop(now) { frame(Math.min(0.05, (now - last) / 1000)); last = now; requestAnimationFrame(loop); }
requestAnimationFrame(loop);
await route();
window.s3 = { renderer, scene, camera, advance(sec) { for (let i = 0; i < sec * 60; i++) frame(1 / 60); } };
