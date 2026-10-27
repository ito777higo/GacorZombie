// Still pictures of Spine characters for the DOM (cards, map nodes, room buttons, flip cards): every figure is
// drawn once in one pose into a shared atlas (flipbook.js does the drawing), then each cell is read back into
// its own canvas and kept as a data: URL.
import { bakeFlipbook } from './flipbook.js';

const urls = new Map();     // key → data URL

// specs: [{ key, asset, anim: [names] }] (the first frame of the first animation it has); size = picture height in px
export function renderPortraits(renderer, specs, size = 220) {
  const todo = specs.filter(s => s.asset && !urls.has(s.key));
  if (!todo.length) return;
  const book = bakeFlipbook(renderer, todo.map(s => ({
    id: s.key, asset: s.asset, height: 1, cell: size, ref: s.anim, clips: { pose: [s.anim, 1, true] },
  })));
  const [W, H] = book.size;
  for (const s of todo) {
    const T = book.types[s.key];
    if (!T) continue;
    const [u0, v0, u1, v1] = T.clips.pose.frames[0];
    const x = Math.round(u0 * W), y = Math.round(v0 * H), w = Math.round((u1 - u0) * W), h = Math.round((v1 - v0) * H);
    const px = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(book.target, x, y, w, h, px);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h);
    // the atlas is premultiplied and bottom-up; a canvas wants straight alpha, top-down
    for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) {
      const i = (row * w + col) * 4, o = ((h - 1 - row) * w + col) * 4, a = px[i + 3];
      const k = a ? 255 / a : 0;
      img.data[o] = Math.min(255, px[i] * k); img.data[o + 1] = Math.min(255, px[i + 1] * k); img.data[o + 2] = Math.min(255, px[i + 2] * k); img.data[o + 3] = a;
    }
    g.putImageData(img, 0, 0);
    urls.set(s.key, c.toDataURL('image/png'));
  }
  book.dispose();
}

export const portraitUrl = key => urls.get(key) || null;
