// Two shared pieces of the procedural look: the rim light every standard material gets, and the thin
// metal gate posts. Static parts are merged into vertex-coloured geometry (see models.js merge()).
import * as THREE from './three.js';
import { merge, M } from './models.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt, rb, h, s = 14) => new THREE.CylinderGeometry(rt, rb, h, s);
const C = c => new THREE.Color(c);

// A rim light makes rounded characters read like a mobile game render; added to the standard shader.
export function withRim(mat, color = '#ffffff', strength = 0.35, power = 2.6) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uRimCol = { value: C(color) };
    sh.uniforms.uRim = { value: strength };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimCol; uniform float uRim;')
      .replace('#include <opaque_fragment>', `float rimK = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), ${power.toFixed(2)});
outgoingLight += uRimCol * rimK * uRim;
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'rim' + strength + power + color;
  return mat;
}

// gate posts: thin metal posts in the gate's colour (Last War), white for plain dividers
export function gatePostGeo(col) {
  return merge([[cyl(0.075, 0.075, 2.5, 12), col, M(0, 1.25, 0)], [sph(0.11, 12, 8), col, M(0, 2.52, 0)], [box(0.34, 0.08, 0.34), '#3a3f48', M(0, 0.04, 0)]]);
}
