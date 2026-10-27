// Turns a posed Spine skeleton into triangles: for every visible attachment, in draw order, it reports the
// page texture, the vertices as (x, y, r, g, b, a, u, v) and the triangle indices. Positions are skeleton
// units (y up, origin at the feet). Colours are premultiplied; additive slots get alpha 0, which makes the
// usual PMA blend (ONE, ONE_MINUS_SRC_ALPHA) add them — so one blend mode draws the whole skeleton.
// Clipping attachments are honoured (only the stitched zombie uses one).

const QUAD = [0, 1, 2, 2, 3, 0];
export const STRIDE = 8;
export const SHADOW_SLOT = /^(yy\d*|shadow)$/i;

export class SkeletonWalker {
  constructor() {
    const sp = globalThis.spine;
    this.sp = sp;
    this.clipper = new sp.SkeletonClipping();
    this.verts = new Float32Array(STRIDE * 512);
    this.light = new sp.Color();
    this.dark = new sp.Color(0, 0, 0, 1);
  }

  // emit(page, verts, vertexCount, triangles, triangleIndexCount). `page` is the PageTexture from runtime.js.
  // o.noShadow drops the art's own shadow slot (used when baking the shadow separately would double it).
  walk(sk, emit, o = {}) {
    const sp = this.sp, clipper = this.clipper, sc = sk.color;
    for (const slot of sk.drawOrder) {
      const at = slot.getAttachment();
      if (!at || (o.noShadow && SHADOW_SLOT.test(slot.data.name))) { clipper.clipEndWithSlot(slot); continue; }
      if (at instanceof sp.ClippingAttachment) { clipper.clipStart(slot, at); continue; }
      const region = at instanceof sp.RegionAttachment, mesh = !region && at instanceof sp.MeshAttachment;
      if (!region && !mesh) { clipper.clipEndWithSlot(slot); continue; }
      const sl = slot.color, ac = at.color;
      const a = sc.a * sl.a * ac.a;
      if (a <= 0.002) { clipper.clipEndWithSlot(slot); continue; }
      const n = region ? 4 : at.worldVerticesLength >> 1;
      if (this.verts.length < n * STRIDE) this.verts = new Float32Array(n * STRIDE * 2);
      const v = this.verts, clipping = clipper.isClipping(), step = clipping ? 2 : STRIDE;
      if (region) at.computeWorldVertices(slot.bone, v, 0, step);
      else at.computeWorldVertices(slot, 0, at.worldVerticesLength, v, 0, step);
      const tris = region ? QUAD : at.triangles, uvs = at.uvs;
      const r = sc.r * sl.r * ac.r * a, g = sc.g * sl.g * ac.g * a, b = sc.b * sl.b * ac.b * a;
      const alpha = slot.data.blendMode === sp.BlendMode.Additive ? 0 : a;
      const page = at.region.renderObject.texture;
      if (clipping) {
        this.light.set(r, g, b, alpha);
        clipper.clipTriangles(v, n * 2, tris, tris.length, uvs, this.light, this.dark, false);
        const cv = clipper.clippedVertices, ct = clipper.clippedTriangles;
        if (ct.length) emit(page, cv, cv.length / STRIDE, ct, ct.length);
      } else {
        for (let i = 0; i < n; i++) {
          const k = i * STRIDE;
          v[k + 2] = r; v[k + 3] = g; v[k + 4] = b; v[k + 5] = alpha;
          v[k + 6] = uvs[i * 2]; v[k + 7] = uvs[i * 2 + 1];
        }
        emit(page, v, n, tris, tris.length);
      }
      clipper.clipEndWithSlot(slot);
    }
    clipper.clipEnd();
  }
}

// Poses `sk` at time t of animation `anim` (no mixing), ready to walk.
export function pose(sk, anim, t) {
  const sp = globalThis.spine;
  sk.setToSetupPose();
  if (anim) anim.apply(sk, 0, t, false, null, 1, sp.MixPose.setup, sp.MixDirection.in);
  sk.updateWorldTransform();
}
