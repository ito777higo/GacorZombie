// Dev only (not shipped): composite the WebGL canvas and the DOM layers of #frame into one JPEG and
// post it to the preview server's /capture endpoint. Works even when the browser pane is hidden.
let cssText = null;

async function css() {
  if (cssText) return cssText;
  cssText = await (await fetch('/styles.css')).text();
  return cssText;
}

export async function snapFull(world, name = 'full.jpg') {
  const frame = document.getElementById('frame');
  const W = frame.clientWidth, H = frame.clientHeight, S = 2;
  world.render();
  const out = document.createElement('canvas');
  out.width = W * S; out.height = H * S;
  const x = out.getContext('2d');
  x.drawImage(document.getElementById('gl'), 0, 0, W * S, H * S);

  const clone = frame.cloneNode(true);
  clone.querySelector('#gl')?.remove();
  clone.querySelectorAll('[hidden]').forEach(e => e.remove());
  // images inside an SVG foreignObject must be data URIs
  for (const im of clone.querySelectorAll('img')) { const d = await dataUrl(im.getAttribute('src')); if (d) im.setAttribute('src', d); }
  for (const el of clone.querySelectorAll('[style*="url("]')) {
    const st = el.getAttribute('style'), m = st.match(/url\(['"]?([^'")]+)['"]?\)/);
    if (m && !m[1].startsWith('data:')) { const d = await dataUrl(m[1]); if (d) el.setAttribute('style', st.replace(m[0], `url('${d}')`)); }
  }
  // keep inline custom properties set on the frame
  clone.setAttribute('style', frame.getAttribute('style') || '');
  // the --ui-* image variables live on <html> (main.js): carry them over as data URIs
  const rs = document.documentElement.style;
  for (let i = 0; i < rs.length; i++) {
    const k = rs[i]; if (!k.startsWith('--ui-')) continue;
    const m = rs.getPropertyValue(k).match(/url\(["']?([^"')]+)["']?\)/);
    const d = m && await dataUrl(m[1]);
    if (d) clone.style.setProperty(k, `url("${d}")`);
  }
  clone.style.width = W + 'px'; clone.style.height = H + 'px'; clone.style.background = 'transparent';
  const html = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${H * S}"><foreignObject x="0" y="0" width="${W}" height="${H}" transform="scale(${S})"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;height:${H}px;position:relative"><style>${(await css()).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))} #frame{contain:none!important} *,*::before,*::after{animation:none!important;transition:none!important} .mg-card .mg-in{transform:none!important} .mg-card.open .mg-back{display:none} .mg-card.open .mg-front{transform:none} .mg-card:not(.open) .mg-front{display:none}</style>${html}</div></foreignObject></svg>`;
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  x.drawImage(img, 0, 0);
  const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', 0.85));
  await fetch('/capture?name=' + encodeURIComponent(name), { method: 'POST', body: blob });
  return name;
}

const _du = new Map();
async function dataUrl(src) {
  if (!src || src.startsWith('data:')) return null;
  if (_du.has(src)) return _du.get(src);
  try {
    const b = await (await fetch(src)).blob();
    const d = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
    _du.set(src, d); return d;
  } catch (e) { return null; }
}
