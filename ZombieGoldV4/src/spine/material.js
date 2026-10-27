// Shaders for Spine art in the 3D world. Characters are flat cut-outs that always face the camera
// ("billboards"), standing on their feet: the camera's right vector and (mostly) its up vector span the
// sprite, so the art is never foreshortened by the tilted run camera.
//
//   liveMaterial   one live skeleton (SpineActor): vertices in skeleton units, placed by the object's matrix
//   crowdMaterial  many baked figures (SpriteCrowd): one quad per figure, frames from a flipbook atlas
//   bakeMaterial   draws skeleton frames into the flipbook atlas (orthographic, clipped to each cell)
//
// Every texture is premultiplied (PMA) and every material blends (ONE, ONE_MINUS_SRC_ALPHA). Sprites are not lit
// by the scene lights; SPRITE.light tints them all (the world sets it per theme so night levels dim them too).
// Colours are written as they are (no tone mapping), so the cartoon art keeps the colours the artists painted.
import * as THREE from '../view/three.js';

export const SPRITE = {
  light: { value: new THREE.Color(1, 1, 1) },
  upMix: { value: 0.9 },     // 1 = the sprite's up is the camera's up; 0 = straight up in the world
};

const BILLBOARD = /* glsl */`
  uniform float uUpMix;
  vec3 camRight() { return vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); }
  vec3 camUp() { return vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
  vec3 camBack() { return vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]); }
  vec3 spriteUp() { return normalize(mix(vec3(0.0, 1.0, 0.0), camUp(), uUpMix)); }
  vec2 roll(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
`;

const FRAG_TAIL = /* glsl */`
  uniform vec3 uLight;
  #ifdef USE_FOG
    uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
  #endif
  varying float vFogDepth;
  vec4 finish(vec4 c, vec4 tint, float flash) {
    c.rgb *= tint.rgb * uLight;
    c.rgb += flash * c.a;
    c *= tint.a;
    #ifdef USE_FOG
      float f = smoothstep(fogNear, fogFar, vFogDepth);
      c.rgb = mix(c.rgb, pow(fogColor, vec3(0.4545)) * c.a, f);   // fogColor is linear; the art is not
    #endif
    return c;
  }
`;

function pmaBlend(m) {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.transparent = true;
  return m;
}

function fogUniforms() {
  return THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
}

// One live skeleton. The object's position is the feet, its scale converts skeleton units to world units.
// Vertex z carries the draw order (a hair towards the camera per slot) so slots never z-fight.
export function liveMaterial(map) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...fogUniforms(),
      map: { value: map }, uFlip: { value: 1 }, uRoll: { value: 0 },
      uTint: { value: new THREE.Vector4(1, 1, 1, 1) }, uFlash: { value: 0 },
      uLight: SPRITE.light, uUpMix: SPRITE.upMix,
    },
    vertexShader: /* glsl */`
      attribute vec4 spColor;
      uniform float uFlip; uniform float uRoll;
      varying vec2 vUv; varying vec4 vCol; varying float vFogDepth;
      ${BILLBOARD}
      void main() {
        vec3 feet = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sc = length(modelMatrix[0].xyz);
        vec2 p = roll(vec2(position.x * uFlip, position.y) * sc, uRoll);
        vec3 w = feet + camRight() * p.x + spriteUp() * p.y + camBack() * position.z;
        vec4 mv = viewMatrix * vec4(w, 1.0);
        vFogDepth = -mv.z; vUv = uv; vCol = spColor;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform vec4 uTint; uniform float uFlash;
      varying vec2 vUv; varying vec4 vCol;
      ${FRAG_TAIL}
      void main() {
        vec4 c = finish(texture2D(map, vUv) * vCol, uTint, uFlash);
        if (c.a < 0.004 && c.r + c.g + c.b < 0.012) discard;
        gl_FragColor = c;
      }`,
    fog: true, depthWrite: true, side: THREE.DoubleSide,
  });
  return pmaBlend(m);
}

// Baked figures: per instance the feet (iPos), the quad (iQuad: world width, height, feet anchor u, v),
// the atlas cell (iUV), a tint with alpha (iTint) and iFx = (white flash, roll, flip ±1, unused).
export function crowdMaterial(atlas) {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...fogUniforms(), map: { value: atlas }, uLight: SPRITE.light, uUpMix: SPRITE.upMix },
    vertexShader: /* glsl */`
      attribute vec3 iPos; attribute vec4 iQuad; attribute vec4 iUV; attribute vec4 iTint; attribute vec4 iFx;
      varying vec2 vUv; varying vec4 vTint; varying float vFlash; varying float vFogDepth;
      ${BILLBOARD}
      void main() {
        vec2 corner = position.xy;
        vec2 p = (corner - iQuad.zw) * iQuad.xy;
        p.x *= iFx.z;
        p = roll(p, iFx.y);
        vec3 w = iPos + camRight() * p.x + spriteUp() * p.y;
        vec4 mv = viewMatrix * vec4(w, 1.0);
        vFogDepth = -mv.z; vUv = mix(iUV.xy, iUV.zw, corner); vTint = iTint; vFlash = iFx.x;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      varying vec2 vUv; varying vec4 vTint; varying float vFlash;
      ${FRAG_TAIL}
      void main() {
        vec4 c = finish(texture2D(map, vUv), vTint, vFlash);
        if (c.a < 0.02 && c.r + c.g + c.b < 0.06) discard;
        gl_FragColor = c;
      }`,
    fog: true, depthWrite: true, side: THREE.DoubleSide,
  });
  return pmaBlend(m);
}

// Soft dark ellipses under figures whose art has no shadow of its own. iPos = centre on the ground, iSize = (w, d, alpha).
export function blobMaterial() {
  const m = new THREE.ShaderMaterial({
    uniforms: fogUniforms(),
    vertexShader: /* glsl */`
      attribute vec3 iPos; attribute vec3 iSize;
      varying vec2 vP; varying float vA; varying float vFogDepth;
      void main() {
        vP = position.xy * 2.0 - 1.0; vA = iSize.z;
        vec3 w = iPos + vec3(vP.x * iSize.x, 0.02, vP.y * iSize.y);
        vec4 mv = viewMatrix * vec4(w, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vP; varying float vA;
      #ifdef USE_FOG
        uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
      #endif
      varying float vFogDepth;
      void main() {
        float a = (1.0 - smoothstep(0.35, 1.0, length(vP))) * 0.38 * vA;
        #ifdef USE_FOG
          a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        if (a < 0.003) discard;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }`,
    fog: true, transparent: true, depthWrite: false,
  });
  return m;
}

// Atlas pass: position.xy are atlas pixels, cell = (x0, y0, x1, y1) pixels the vertex's figure may paint.
export function bakeMaterial(map, size) {
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uSize: { value: new THREE.Vector2(size[0], size[1]) } },
    vertexShader: /* glsl */`
      attribute vec4 spColor; attribute vec4 cell;
      uniform vec2 uSize;
      varying vec2 vUv; varying vec4 vCol; varying vec4 vCell;
      void main() {
        vUv = uv; vCol = spColor; vCell = cell;
        gl_Position = vec4(position.xy / uSize * 2.0 - 1.0, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      varying vec2 vUv; varying vec4 vCol; varying vec4 vCell;
      void main() {
        vec2 f = gl_FragCoord.xy;
        if (f.x < vCell.x || f.y < vCell.y || f.x > vCell.z || f.y > vCell.w) discard;
        gl_FragColor = texture2D(map, vUv) * vCol;
      }`,
    depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });
  return pmaBlend(m);
}
