// Renderer, camera, light, sky, sea and the per-chapter environment along the road.
import * as THREE from './three.js';
import { MAT, M, sceneryGeo, merge } from './models.js';
import { roadTexture, plankTexture, groundTexture, platformTexture, skyTexture } from './textures.js';
import { mulberry32 } from '../sim/rng.js';
import { ROAD_HW, PLATFORM_R } from '../sim/arena.js';
import { propGeo, useRenderer } from './cast.js';
import { PROP_MAT } from './props.js';
import { SPRITE } from '../spine/material.js';
import {buildJourneyWorld} from './journeyworld.js';

const NO_SHADOW = new Set(['Tree_1', 'Container_Long', 'Container_Small', 'Tank', 'Ship_Small', 'Environment_PalmTree_1', 'Environment_Rock_2',
  'PA_Container_Red', 'PA_Container_Green', 'PA_WaterTower', 'PA_Blood_1', 'PA_Blood_2', 'PA_TownSign', 'NG_Vehicle_Sports_Armored', 'NG_Vehicle_Truck', 'PA_StreetLights']);

// One look per 大关, dimming as the story goes on: dusk desert → grey ruined coast → toxic haze → blood-moon night.
// sprite: how the Spine characters are lit in this theme (they ignore the scene lights; see spine/material.js)
const THEMES = {
  // 大关二: a coast road on a low deck under a grey sky, a dead sea on the right
  seaside: { sky: ['#6d7a86', '#a9afb2', '#ddd5c4'], fog: '#bdb8ad', fogNear: 90, fogFar: 260, skyRefl: '#8a9496', hemi: ['#eef0f2', '#8a8a80', 1.0], sun: ['#ffe9d0', 1.7], rim: 0.35, env: 0.25,
    road: 'deck', deck: { rail: '#c9c6bf', railCap: '#c0392b', girder: '#9a9ea4', walk: true, beach: -1 }, ground: null, water: true, waterY: -1.6, deep: '#24403f', shallow: '#4b6f66', exposure: 1, tone: 'none', sprite: '#f2f0ea' },
  // 大关三: a wooden pier in a toxic green haze
  pier2: { sky: ['#56633a', '#98a05a', '#d6d39c'], fog: '#aab07c', fogNear: 80, fogFar: 240, skyRefl: '#7e8a52', hemi: ['#eef2d8', '#6f7a48', 1.0], sun: ['#f2f0c0', 1.7], rim: 0.35, env: 0.25,
    road: 'deck', deck: { planks: true, rail: '#6e4a2a', railCap: '#9a6a3a', girder: '#4a3420', lamps: true }, ground: null, water: true, waterY: -1.2, deep: '#2a4418', shallow: '#5f8a2a', exposure: 1, tone: 'none', sprite: '#eef2dc' },
  // 大关四: a low bridge at night under a red moon
  seabridge: { sky: ['#1c2140', '#3d3a64', '#9c5448'], fog: '#4c4a62', fogNear: 70, fogFar: 220, skyRefl: '#3a3a5e', hemi: ['#b8c0e8', '#3a3048', 0.95], sun: ['#ffb894', 1.5], rim: 0.6, env: 0.2,
    road: 'deck', deck: { rail: '#5a5f78', railCap: '#d0402a', girder: '#6a6e80', walk: true, lamps: true }, ground: null, water: true, waterY: -1.8, deep: '#121a30', shallow: '#2a3a58', exposure: 1, tone: 'none', sprite: '#d6daf0' },
  // 大关一: a concrete highway out of the city through a dusk desert (still Last War's clean, soft look)
  highway: { sky: ['#e2864e', '#f0b377', '#f5d9ad'], fog: '#e6c59c', fogNear: 60, fogFar: 160, hemi: ['#fff0dc', '#c49a6a', 0.95], sun: ['#ffd8a8', 1.9], rim: 0.35, env: 0.25, road: 'concrete', ground: 'desert', water: false, exposure: 1, tone: 'none', sprite: '#fff4e6' },
  // the shooting room and the Bonus pool: a stormy yard
  reef:  { sky: ['#525a68', '#8d8f95', '#cdbda6'], fog: '#a8a196', fogNear: 65, fogFar: 170, hemi: ['#e6e8ee', '#6a6458', 1.15], sun: ['#ffe6c8', 3.0], road: 'planks', ground: null, water: true, exposure: 1.05, deep: '#26363a', shallow: '#3f5a5a', sprite: '#f4f0ea' },
};

const WATER_VS = /* glsl */`
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WATER_FS = /* glsl */`
uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSunCol; uniform vec3 uSunDir;
uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform float uAlphaMin; uniform float uShore;
varying vec3 vW;
void main() {
  vec2 p = vW.xz; float t = uTime; vec2 g = vec2(0.0);
  #define WV(dx, dy, k, a, s) { vec2 d = normalize(vec2(dx, dy)); float ph = dot(d, p) * k + t * s; g += d * (a * k * cos(ph)); }
  WV(1.0, 0.3, 0.55, 0.11, 1.1)
  WV(-0.4, 1.0, 1.1, 0.05, 1.7)
  WV(0.7, -0.8, 2.3, 0.025, 2.4)
  WV(-0.9, -0.2, 4.1, 0.013, 3.1)
  WV(0.2, 0.9, 7.3, 0.007, 4.4)
  WV(0.95, -0.35, 11.0, 0.004, 5.3)
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vW);
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  float crest = smoothstep(0.08, 0.3, length(g));
  vec3 body = mix(uDeep, uShallow, 0.35 + 0.65 * crest);
  vec3 col = mix(body, uSky, clamp(fres * 1.25, 0.0, 1.0));
  vec3 H = normalize(V + uSunDir);
  float spec = pow(max(dot(N, H), 0.0), 380.0) * 7.0 + pow(max(dot(N, H), 0.0), 40.0) * 0.18;
  col += uSunCol * spec;
  float foam = 0.0;
  if (uShore > 0.0) { float dx = abs(abs(vW.x) - uShore); foam = (1.0 - smoothstep(0.0, 0.9, dx)) * (0.55 + 0.45 * sin(vW.z * 1.7 + t * 2.0 + g.x * 9.0)); }
  col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.7);
  float a = mix(uAlphaMin, 1.0, clamp(fres * 1.6 + foam, 0.0, 1.0));
  float fd = smoothstep(uFogNear, uFogFar, length(cameraPosition - vW));
  col = mix(col, uFog, fd); a = mix(a, 1.0, fd);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const FLOOR_FS = /* glsl */`
uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform vec3 uLight; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
varying vec3 vW;
#define TAU 6.28318530718
float caustic(vec2 uv, float time) {
  vec2 p = mod(uv * TAU, TAU) - 250.0; vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0; c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
void main() {
  float n = noise(vW.xz * 0.08) * 0.6 + noise(vW.xz * 0.3) * 0.4;
  vec3 col = mix(uA, uB, smoothstep(0.3, 0.75, n));
  float c = clamp(caustic(vW.xz / 11.0, uTime * 0.5), 0.0, 1.2);
  col += uLight * c * 0.28;
  // darker toward the far edge of the fishing ground for depth
  col *= 0.82 + 0.18 * smoothstep(-60.0, 0.0, vW.y * 10.0);
  float fd = smoothstep(uFogNear, uFogFar, length(cameraPosition - vW));
  col = mix(col, uFog, fd);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class World {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    useRenderer(r);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    r.setPixelRatio(this.dpr);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 0.5, 0.5, 400);
    this.runCam = { h: 11, back: 8.2, ahead: 11 };
    this.camPos = new THREE.Vector3(0, 16, 14);
    this.camLook = new THREE.Vector3(0, 0, -10);
    this.shake = 0;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 1.7);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.7);
    this.sun.castShadow = true;
    const small = Math.min(screen.width, screen.height) < 600;
    this.sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -18; sc.right = 18; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.035;
    this.sunOffset = new THREE.Vector3(-14, 30, 16);
    // cool back light from down the road gives crowds a readable rim
    this.rim = new THREE.DirectionalLight(0xcfe6ff, 1.1);
    this.rimOffset = new THREE.Vector3(6, 14, -30);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.rim, this.rim.target);

    this.buildEnvMap();

    this.waterU = {
      uTime: { value: 0 }, uDeep: { value: new THREE.Color('#0d5a86') }, uShallow: { value: new THREE.Color('#2fa6c4') },
      uSky: { value: new THREE.Color('#bfe6ff') }, uSunCol: { value: new THREE.Color('#fff2d0') }, uSunDir: { value: new THREE.Vector3() },
      uFog: { value: new THREE.Color() }, uFogNear: { value: 60 }, uFogFar: { value: 160 }, uAlphaMin: { value: 0.16 }, uShore: { value: -1 },
    };
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(420, 420, 1, 1), new THREE.ShaderMaterial({
      uniforms: this.waterU, vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, depthWrite: false,
    }));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -0.45;
    this.water.renderOrder = -1;          // the lowest layer: every sprite and effect blends over it
    this.floorU = {
      uTime: this.waterU.uTime, uA: { value: new THREE.Color('#0c4f78') }, uB: { value: new THREE.Color('#1f86a0') },
      uLight: { value: new THREE.Color('#d8fbff') }, uFog: this.waterU.uFog, uFogNear: this.waterU.uFogNear, uFogFar: this.waterU.uFogFar,
    };
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(420, 420, 1, 1), new THREE.ShaderMaterial({ uniforms: this.floorU, vertexShader: WATER_VS, fragmentShader: FLOOR_FS }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -5;
    this.scene.add(this.water, this.floor);

    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);
    this.time = 0;
    this._v = new THREE.Vector3();
  }

  buildEnvMap() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const s = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 top = vec3(0.45,0.7,1.0); vec3 hor = vec3(1.0,0.96,0.88); vec3 gr = vec3(0.35,0.28,0.2); vec3 c = h > 0. ? mix(hor, top, pow(h, .6)) : mix(hor, gr, pow(-h, .4)); gl_FragColor = vec4(c * 1.2, 1.); }',
    }));
    s.add(sky);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 7, 5.5) }));
    lamp.position.set(-20, 30, 20); s.add(lamp);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(30, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.5, 2.6), side: THREE.DoubleSide }));
    panel.position.set(25, 12, -10); panel.lookAt(0, 0, 0); s.add(panel);
    this.scene.environment = pm.fromScene(s, 0.035).texture;
    pm.dispose();
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the horizontal field roughly constant across phone shapes
    const hfov = 33 * Math.PI / 180;
    this.camera.fov = Math.min(64, Math.max(46, 2 * Math.atan(Math.tan(hfov / 2) / this.camera.aspect) * 180 / Math.PI));
    this.camera.updateProjectionMatrix();
  }

  setTheme(name) {
    const T = this.theme = THEMES[name];
    this.themeName = name;
    this.scene.background = skyTexture(...T.sky);
    this.scene.fog = new THREE.Fog(T.fog, T.fogNear, T.fogFar);
    this.waterU.uFog.value.set(T.fog);
    this.waterU.uFogNear.value = T.fogNear; this.waterU.uFogFar.value = T.fogFar;
    this.waterU.uSky.value.set(T.skyRefl || T.sky[1]);
    if (!T.skyRefl) this.waterU.uSky.value.lerp(new THREE.Color('#ffffff'), 0.25);
    this.hemi.color.set(T.hemi[0]); this.hemi.groundColor.set(T.hemi[1]); this.hemi.intensity = T.hemi[2];
    this.sun.color.set(T.sun[0]); this.sun.intensity = T.sun[1];
    this.renderer.toneMapping = T.tone === 'none' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = T.exposure;
    this.envIntensity = T.env ?? 1;
    this.rim.intensity = T.rim ?? 1.1;
    this.waterU.uDeep.value.set(T.deep || '#0d5a86');
    this.waterU.uShallow.value.set(T.shallow || '#2fa6c4');
    this.waterU.uAlphaMin.value = 0.16;
    this.water.position.y = T.waterY ?? -0.45;
    this.floor.position.y = (T.waterY ?? -0.45) - 4.55;
    // the bed under the (partly clear) water takes the theme's water colours, a shade darker
    this.floorU.uA.value.set(T.deep || '#0c4f78').multiplyScalar(0.8);
    this.floorU.uB.value.set(T.shallow || '#1f86a0').multiplyScalar(0.8);
    this.water.visible = !!T.water; this.floor.visible = !!T.water;
    SPRITE.light.value.set(T.sprite || '#ffffff');
    this.waterU.uShore.value = -1;
  }

  // ---------------------------------------------------------------- level environment
  clearLevel() {
    this.mapDiorama=null;this.storyScene=null;
    // the map view borrows the shadow box and the lens; it gives them back here
    if (this.onClear) { const f = this.onClear; this.onClear = null; f(); }
    const g = this.levelGroup;
    g.traverse(o => {
      if (o.isMesh || o.isInstancedMesh) {
        if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m || Object.values(MAT).includes(m) || o.userData.sharedMat) continue;
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
    g.clear();
  }

  buildLevel(theme, length, platZ, opts = {}) {
    if(opts.journey){buildJourneyWorld(this,opts.journey);return;}
    this.clearLevel();
    this.setTheme(theme);
    const T = this.theme, g = this.levelGroup;
    const rng = mulberry32(theme.length * 977 + Math.round(length));
    const z0 = 30, z1 = platZ - PLATFORM_R - 70;          // world z range covered (forward is -z)
    const L = z0 - z1, zc = (z0 + z1) / 2;

    // ground (the desert): land stops at the platform when open water lies beyond
    if (T.ground) {
      const gz1 = T.water ? platZ - 1 : z1, gL = z0 - gz1, gzc = (z0 + gz1) / 2;
      const gt = groundTexture(T.ground); gt.repeat.set(30, 30 * (gL / 260));
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, gL), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(0, -0.04, gzc);
      ground.receiveShadow = true;
      g.add(ground);
    }

    // road surface: a concrete highway, a deck over the water, or a wooden pier
    const deckLen = z0 - (platZ + PLATFORM_R * 0.6);
    const dz = (z0 + platZ + PLATFORM_R * 0.6) / 2;
    if (T.road === 'deck') this.buildDeck(g, z0, platZ + PLATFORM_R * 0.6, T.deck);
    else if (T.road === 'concrete') {
      const rt = roadTexture(); rt.repeat.set(1, deckLen / 14);
      const road = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HW * 2, 0.3, deckLen), [
        new THREE.MeshStandardMaterial({ color: 0x9aa0a9, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x9aa0a9, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: rt, roughness: 0.92 }), new THREE.MeshStandardMaterial({ color: 0x8a9099 }),
        new THREE.MeshStandardMaterial({ color: 0x9aa0a9 }), new THREE.MeshStandardMaterial({ color: 0x9aa0a9 }),
      ]);
      road.position.set(0, -0.15, dz); road.receiveShadow = true; g.add(road);
    } else {
      const pt = plankTexture(); pt.repeat.set(2, deckLen / 4);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HW * 2 + 0.4, 0.5, deckLen), [
        new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: pt, roughness: 0.85 }), new THREE.MeshStandardMaterial({ color: 0x5a3820 }),
        new THREE.MeshStandardMaterial({ color: 0x6a4428 }), new THREE.MeshStandardMaterial({ color: 0x6a4428 }),
      ]);
      deck.position.set(0, -0.25, dz); deck.receiveShadow = true; g.add(deck);
    }

    // platform at the end of the road: the boss fight, then the bonus pool
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(PLATFORM_R, PLATFORM_R + 0.3, 0.6, 48), [
      new THREE.MeshStandardMaterial({ color: 0xa3a8b0, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ map: platformTexture(), roughness: 0.7, metalness: 0.05 }),
      new THREE.MeshStandardMaterial({ color: 0x333333 }),
    ]);
    plat.position.set(0, -0.28, platZ); plat.receiveShadow = true; g.add(plat);
    this.platZ = platZ;

    // scenery
    const place = {};
    const put = (kind, x, y, z, ry = 0, s = 1) => (place[kind] ||= []).push(M(x, y, z, 0, ry, 0, s));
    const R = () => rng();
    const zEndScenery = platZ - PLATFORM_R - 50;
    if (theme === 'highway') {    } else if (theme === 'highway') {
      // concrete barriers line both edges up to the plaza; desert props outside them
      for (let z = z0; z > platZ + PLATFORM_R + 1; z -= 3) for (const sd of [-1, 1]) put('jersey', sd * (ROAD_HW + 0.35), 0, z, 0, 1);
      // a Last War war zone along the road (Toon Shooter props) once the models are in
      if (propGeo('Barrier_Large')) {
        for (let z = z0 - 4; z > zEndScenery; z -= 7.5) {
          for (const sd of [-1, 1]) {
            const k = R(), near = sd * (ROAD_HW + 2.4 + R() * 2.5), far = sd * (ROAD_HW + 7 + R() * 9);
            if (k < 0.16) put('m:Debris_BrokenCar', near, 0, z, (R() - 0.5) * 1.2 + (sd > 0 ? 0 : Math.PI), 1);
            else if (k < 0.28) put('m:Container_Long', far, 0, z, Math.PI / 2 + (R() - 0.5) * 0.3, 1);
            else if (k < 0.36) put('m:Container_Small', far, 0, z, R() * 6, 1);
            else if (k < 0.43) put('m:Tank', far, 0, z, R() * 6, 1);
            else if (k < 0.55) put('m:SackTrench', sd * (ROAD_HW + 1.9), 0, z, sd > 0 ? -Math.PI / 2 : Math.PI / 2, 1);
            else if (k < 0.65) put('m:Debris_Tires', near, 0, z, R() * 6, 1);
            else if (k < 0.73) put('m:Barrier_Large', near, 0, z, Math.PI / 2, 1);
            else if (k < 0.8) put('m:TrafficCone', sd * (ROAD_HW + 1.4), 0, z + R() * 2, R() * 6, 1);
            else if (k < 0.86) put('m:Crate', near, 0, z, R() * 6, 1);
            if (R() < 0.3) put('m:Tree_1', sd * (ROAD_HW + 14 + R() * 30), 0, z + R() * 5, R() * 6, 0.8 + R() * 0.5);
          }
        }
        for (let z = z0 - 10; z > platZ + PLATFORM_R + 4; z -= 22) for (const sd of [-1, 1]) put('m:StreetLight', sd * (ROAD_HW + 1.25), 0, z, sd > 0 ? Math.PI : 0, 1);
        // Post Apocalypse Pack: a town sign at the start, shipping containers, water towers, a traffic light
        // hanging over the road, rubbish beside it and blood on the asphalt
        if (propGeo('PA_Container_Red')) {
          put('m:PA_TownSign', -(ROAD_HW + 4.5), 0, z0 - 8, 0.35, 1);
          for (let z = z0 - 14; z > zEndScenery; z -= 9.5) {
            for (const sd of [-1, 1]) {
              const k = R();
              if (k < 0.18) put(R() < 0.5 ? 'm:PA_Container_Red' : 'm:PA_Container_Green', sd * (ROAD_HW + 8 + R() * 10), 0, z, Math.PI / 2 + (R() - 0.5) * 0.4, 1);
              else if (k < 0.3) put('m:PA_PlasticBarrier', sd * (ROAD_HW + 1.6), 0, z, Math.PI / 2, 1);
              else if (k < 0.42) put('m:PA_TrashBag_2', sd * (ROAD_HW + 1.8 + R()), 0, z, R() * 6, 1);
              else if (k < 0.5) put('m:PA_Wheels_Stack', sd * (ROAD_HW + 2.2 + R() * 2), 0, z, R() * 6, 1);
              else if (k < 0.56) put('m:PA_FireHydrant', sd * (ROAD_HW + 1.5), 0, z, R() * 6, 1);
            }
            if (R() < 0.45) put(R() < 0.5 ? 'm:PA_Blood_1' : 'm:PA_Blood_2', (R() - 0.5) * (ROAD_HW * 1.6), 0.015, z + R() * 4, R() * 6, 0.6 + R() * 0.5);
          }
          for (let z = z0 - 30; z > zEndScenery; z -= 38 + R() * 20) put('m:PA_WaterTower', (R() < 0.5 ? -1 : 1) * (ROAD_HW + 20 + R() * 14), 0, z, R() * 6, 1);
          for (let z = z0 - 50; z > platZ + PLATFORM_R + 30; z -= 70) put('m:PA_TrafficLight_2', ROAD_HW + 1.2, 0, z, Math.PI, 1);
        }
        // the number-gate pack's street junk — road barriers and drums at the edges, cinder blocks, pallets,
        // pipes, an abandoned couch, oil drums and loose tyres beside the road, armoured cars parked further out
        if (propGeo('PA_TrafficBarrier_2')) {
          for (let z = z0 - 18; z > zEndScenery; z -= 10.5) {
            for (const sd of [-1, 1]) {
              const k = R();
              if (k < 0.13) put('m:PA_TrafficBarrier_2', sd * (ROAD_HW + 1.5), 0, z, Math.PI / 2, 1);
              else if (k < 0.25) put('m:NG_TrafficCone_2', sd * (ROAD_HW + 1.3), 0, z + R() * 2, R() * 6, 1);
              else if (k < 0.33) put('m:PA_CinderBlock', sd * (ROAD_HW + 2 + R() * 2), 0, z, R() * 6, 1.5);
              else if (k < 0.41) put('m:PA_Pallet', sd * (ROAD_HW + 2.6 + R() * 2), 0, z, R() * 6, 1);
              else if (k < 0.48) put('m:PA_Pipes', sd * (ROAD_HW + 3.2 + R() * 3), 0, z, R() * 0.6, 1);
              else if (k < 0.52) put('m:PA_Couch', sd * (ROAD_HW + 3.6 + R() * 3), 0, z, sd > 0 ? -Math.PI / 2 : Math.PI / 2, 0.8);
              else if (k < 0.6) put('m:PA_Barrel', sd * (ROAD_HW + 2 + R() * 2), 0, z, R() * 6, 1);
              else if (k < 0.66) put('m:NG_Wheel', sd * (ROAD_HW + 2.2 + R() * 2), 0, z, R() * 6, 1);
              else if (k < 0.74) put(R() < 0.5 ? 'm:NG_Vehicle_Sports_Armored' : 'm:NG_Vehicle_Truck', sd * (ROAD_HW + 5.5 + R() * 4), 0, z, (R() - 0.5) * 0.7 + (sd > 0 ? 0 : Math.PI), 1);
            }
          }
          for (let z = z0 - 30; z > platZ + PLATFORM_R + 20; z -= 44) for (const sd of [-1, 1]) put('m:PA_StreetLights', sd * (ROAD_HW + 1.1), 0, z + (sd > 0 ? 22 : 0), sd > 0 ? -Math.PI / 2 : Math.PI / 2, 0.62);
        }
      }
      for (let z = z0; z > zEndScenery; z -= 4.2) {
        for (const sd of [-1, 1]) {
          const x = sd * (ROAD_HW + 2.6 + R() * 26);
          const k = R();
          if (k < 0.3) put('stone', x, 0, z + R() * 3, R() * 6, 0.6 + R() * 1.2);
          else if (k < 0.45) put('cactus', x, 0, z, R() * 6, 0.8 + R() * 0.5);
          else if (k < 0.7) put('shrub', x, 0, z, R() * 6, 0.7 + R() * 0.6);
        }
        if (R() < 0.12) put('sandbags', (R() < 0.5 ? -1 : 1) * (ROAD_HW + 1.5), 0, z, 0, 1);
        if (R() < 0.08) put('oildrum', (R() < 0.5 ? -1 : 1) * (ROAD_HW + 1.4 + R()), 0, z, 0, 1);
        if (R() < 0.07) put('tires', (R() < 0.5 ? -1 : 1) * (ROAD_HW + 1.6 + R()), 0, z, R() * 6, 1);
      }
      for (let i = 0; i < 16; i++) { const sd = i % 2 ? 1 : -1; put('mesa', sd * (55 + R() * 70), -2, z0 - 30 - R() * (z0 - zEndScenery + 60), R() * 6, 8 + R() * 10); }
      for (let a = 0; a < 9; a++) { const ang = Math.PI * (0.15 + a * 0.0875); put('sandbags', Math.cos(ang) * (PLATFORM_R + 0.6), 0, platZ - Math.sin(ang) * (PLATFORM_R + 0.6), ang, 1); }
    } else {
      // decks and the pier: water both sides
      const deckEnd = platZ + PLATFORM_R * 0.6;
      for (let z = z0; z > deckEnd; z -= 4) {
        for (const s of [-1, 1]) {
          if (T.road === 'planks') put('post', s * (ROAD_HW + 0.05), -0.2, z, 0, 1);
          if (T.road === 'planks' && Math.round(z / 4) % 4 === 0) put('lamp', s * (ROAD_HW - 0.1), 0, z, s > 0 ? Math.PI : 0, 1);
        }
      }
      for (let i = 0; i < 26; i++) {
        const s = R() < 0.5 ? -1 : 1, z = z0 - R() * (z0 - zEndScenery);
        const k = R();
        const wy = (T.waterY ?? -0.45) - 0.15, lw = !!propGeo('Ship_Small');
        if (k < 0.45) put('buoy', s * (ROAD_HW + 4 + R() * 18), -0.55, z, 0, 0.9 + R() * 0.4);
        else if (k < 0.6) { if (lw) put('m:Ship_Small', s * (ROAD_HW + 14 + R() * 30), wy - 0.3, z, R() * 6, 1 + R() * 0.4); else put('boat', s * (ROAD_HW + 14 + R() * 30), -0.6, z, R() * 6, 1.2 + R() * 0.6); }
        else if (k < 0.85) { const ix = s * (60 + R() * 50), sc = 1 + R() * 1.5; put('island', ix, -0.6, z - 40, R() * 6, sc); if (lw) put('m:Environment_PalmTree_1', ix, -0.6 + sc * 0.8, z - 40, R() * 6, 1.4 + sc * 0.4); }
        else if (lw) put('m:Environment_Rock_2', s * (ROAD_HW + 6 + R() * 20), wy - 0.4, z, R() * 6, 1 + R() * 1.2);
        else put('rock', s * (ROAD_HW + 6 + R() * 20), -0.6, z, R() * 6, 1 + R() * 1.5);
      }
      put('lighthouse', -30, -0.6, platZ - 20, 0, 1.6);
      // platform railing (back half)
      for (let a = 0; a < 14; a++) {
        const ang = -Math.PI * 0.08 - a * (Math.PI * 1.16 / 13);
        put('rail', Math.cos(ang) * (PLATFORM_R + 0.1), 0, platZ + Math.sin(ang) * (PLATFORM_R + 0.1), -ang, 1.05);
      }
    }
    this.applyEnv(g);
    const shadowKinds = new Set(['jersey', 'stone', 'cactus', 'shrub', 'tires', 'oildrum', 'pine', 'tree', 'deadtree', 'car', 'palm', 'umbrella', 'lamp', 'barrier', 'sandbags', 'rail', 'crate', 'drum', 'rock', 'bush']);
    for (const kind in place) {
      const list = place[kind];
      if (kind.startsWith('m:')) {
        // a packed model, instanced in 30-unit stretches of road so the camera (and the shadow pass) only
        // draws the stretches in view
        const geo = propGeo(kind.slice(2));
        if (!geo) continue;
        const chunks = new Map();
        for (const m of list) { const k = Math.floor(m.elements[14] / 30); (chunks.get(k) || chunks.set(k, []).get(k)).push(m); }
        for (const part of chunks.values()) {
          const im = new THREE.InstancedMesh(geo, PROP_MAT, part.length);
          part.forEach((m, i) => im.setMatrixAt(i, m));
          im.computeBoundingSphere();
          // the big far-off pieces skip the shadow pass; the ones beside the road keep their shadows
          im.castShadow = !NO_SHADOW.has(kind.slice(2)); im.receiveShadow = true;
          im.userData.sharedGeo = true; im.userData.sharedMat = true;
          g.add(im);
        }
        continue;
      }
      const geo = sceneryGeo(kind);
      const smooth = new Set(['jersey', 'stone', 'mesa', 'cactus', 'shrub', 'tires', 'oildrum', 'sandbags']);
      const im = new THREE.InstancedMesh(geo, smooth.has(kind) ? MAT.actor : MAT.flat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = shadowKinds.has(kind);
      im.receiveShadow = true;
      im.frustumCulled = false;
      g.add(im);
    }
  }

  // A low deck over the water for the bonus 大关: road (concrete or planks), side rails in the theme's
  // colours, an optional walkway, lamps, and a beach strip on one side.
  buildDeck(g, z0, z1, o) {
    const L = z0 - z1, zc = (z0 + z1) / 2, HW = ROAD_HW;
    let top;
    if (o.planks) { const pt = plankTexture(); pt.repeat.set(2, L / 4); top = new THREE.MeshStandardMaterial({ map: pt, roughness: 0.85 }); }
    else { const rt = roadTexture(); rt.repeat.set(1, L / 14); top = new THREE.MeshStandardMaterial({ map: rt, roughness: 0.9 }); }
    const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.girder), roughness: 0.8 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + (o.walk ? 0 : 0.6), 0.4, L), [side, side, top, side, side, side]);
    deck.position.set(0, -0.2, zc); deck.receiveShadow = true; g.add(deck);
    if (o.walk) for (const sd of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, L), new THREE.MeshStandardMaterial({ color: 0xd3d6db, roughness: 0.85 }));
      w.position.set(sd * (HW + 0.7), -0.1, zc); w.receiveShadow = true; g.add(w);
    }
    const girder = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + 3, 1.2, L), side);
    girder.position.set(0, -0.95, zc); g.add(girder);
    // piers down into the water every 14 units
    const pierGeo = merge([[new THREE.CylinderGeometry(0.6, 0.7, 6, 14), o.girder, M(0, -3, 0)]]);
    const piers = [];
    for (let z = z0 - 6; z > z1; z -= 14) for (const sd of [-1, 1]) piers.push(M(sd * (HW - 1), -1.2, z));
    const pIM = new THREE.InstancedMesh(pierGeo, MAT.actor, piers.length); piers.forEach((m, i) => pIM.setMatrixAt(i, m)); pIM.frustumCulled = false; g.add(pIM);
    // rails: posts and two rails, caps in the accent colour
    const railGeo = merge([
      [new THREE.BoxGeometry(0.12, 1.0, 0.12), o.rail, M(0, 0.5, 0)], [new THREE.SphereGeometry(0.1, 10, 8), o.railCap, M(0, 1.05, 0)],
      [new THREE.BoxGeometry(0.08, 0.08, 3.0), o.rail, M(0, 0.95, 0)], [new THREE.BoxGeometry(0.06, 0.06, 3.0), o.rail, M(0, 0.55, 0)],
    ]);
    const rails = [];
    const rx = HW + (o.walk ? 1.35 : 0.25);
    for (let z = z0; z > z1 + 1; z -= 3) for (const sd of [-1, 1]) rails.push(M(sd * rx, 0.05, z));
    const rIM = new THREE.InstancedMesh(railGeo, MAT.actor, rails.length); rails.forEach((m, i) => rIM.setMatrixAt(i, m)); rIM.castShadow = true; rIM.frustumCulled = false; g.add(rIM);
    if (o.lamps) {
      const lampGeo = merge([[new THREE.CylinderGeometry(0.07, 0.09, 3.4, 10), '#2e3440', M(0, 1.7, 0)], [new THREE.BoxGeometry(0.7, 0.07, 0.07), '#2e3440', M(-0.3, 3.35, 0)], [new THREE.SphereGeometry(0.17, 12, 8), '#fff2b8', M(-0.6, 3.25, 0)]]);
      const lamps = [];
      for (let z = z0 - 10; z > z1; z -= 22) for (const sd of [-1, 1]) lamps.push(M(sd * (rx + 0.2), 0, z, 0, sd > 0 ? 0 : Math.PI, 0));
      const lIM = new THREE.InstancedMesh(lampGeo, MAT.actor, lamps.length); lamps.forEach((m, i) => lIM.setMatrixAt(i, m)); lIM.castShadow = true; lIM.frustumCulled = false; g.add(lIM);
    }
    if (o.beach) {
      // sand strip with palms and umbrellas along one side
      const sand = groundTexture('sand'); sand.repeat.set(6, L / 30);
      const b = new THREE.Mesh(new THREE.BoxGeometry(60, 1, L + 40), new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }));
      b.position.set(o.beach * (HW + 8 + 30), -1.55, zc); b.receiveShadow = true; g.add(b);
      const palms = [], umbs = [];
      const rng = mulberry32(17);
      for (let z = z0; z > z1 - 20; z -= 7) {
        const x = o.beach * (HW + 10 + rng() * 18);
        if (rng() < 0.7) palms.push(M(x, -1.05, z + rng() * 3, 0, rng() * 6, 0, 1.1 + rng() * 0.4));
        else umbs.push(M(x, -1.05, z, 0, 0, 0, 1.2));
      }
      for (const [kind, list] of [['palm', palms], ['umbrella', umbs]]) {
        if (!list.length) continue;
        const im = new THREE.InstancedMesh(sceneryGeo(kind), MAT.actor, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.frustumCulled = false; g.add(im);
      }
    }
  }

  // scale the image-based light on every lit material (cartoon themes keep it low so colours stay flat)
  applyEnv(root = this.scene) {
    const k = this.envIntensity ?? 1;
    root.traverse(o => { if (!o.material) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.envMapIntensity !== undefined) m.envMapIntensity = k; });
    for (const m of Object.values(MAT)) if (m.envMapIntensity !== undefined) m.envMapIntensity = k;
  }

  // ---------------------------------------------------------------- camera
  // Runner framing: high behind the squad, looking down the road (squad sits in the lower third).
  // zoom > 1 pulls the camera back and up as the squad grows.
  runPose(sz, out, zoom = 1) {
    const c = this.runCam;
    out.pos.set(0, c.h * zoom, sz + c.back * zoom);
    out.look.set(0, 0, sz - c.ahead);
    return out;
  }
  // 爆分台 framing: high above the fishing ground, cannon at the bottom of the screen.
  fishPose(platZ, out) {
    out.pos.set(0, 27, platZ + 2);
    out.look.set(0, -1.2, platZ - 10.5);
    return out;
  }

  setCamera(pos, look) {
    this.camPos.copy(pos); this.camLook.copy(look);
  }

  update(dt) {
    this.mapDiorama?.animate(dt);
    this.time += dt;
    this.waterU.uTime.value = this.time;
    const c = this.camera;
    c.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const k = this.shake * this.shake * 6;
      c.position.x += (Math.random() - 0.5) * k; c.position.y += (Math.random() - 0.5) * k; c.position.z += (Math.random() - 0.5) * k;
    }
    c.lookAt(this.camLook);
    // sun + shadow camera follow the point of interest
    const tgt = this.camLook;
    // the sea planes are finite; keep them centred under the camera (shaders work in world space)
    this.water.position.z = this.floor.position.z = Math.round(tgt.z / 10) * 10;
    this.sun.target.position.set(0, 0, tgt.z + 4);
    this.sun.position.copy(this.sun.target.position).add(this.sunOffset);
    this.waterU.uSunDir.value.copy(this.sunOffset).normalize();
    this.rim.target.position.copy(this.sun.target.position);
    this.rim.position.copy(this.sun.target.position).add(this.rimOffset);
  }

  render() { this.renderer.render(this.scene, this.camera); }

  // world -> CSS px inside the frame
  project(x, y, z, out) {
    const v = this._v.set(x, y, z).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.w;
    out.y = (-v.y * 0.5 + 0.5) * this.h;
    out.vis = v.z < 1 && v.z > -1;
    return out;
  }
  // screen px -> world point on the horizontal plane y = py
  unproject(sx, sy, py, out) {
    const ndc = this._v.set((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1, 0.5).unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    const t = (py - this.camera.position.y) / dir.y;
    out.set(this.camera.position.x + dir.x * t, py, this.camera.position.z + dir.z * t);
    return out;
  }
  // how many CSS px one world unit spans horizontally at depth z on the ground
  pxPerUnit(x, z) {
    const a = this.project(x - 1, 0, z, { x: 0, y: 0 }).x, b = this.project(x + 1, 0, z, { x: 0, y: 0 }).x;
    return Math.abs(b - a) / 2;
  }
}
