// One set of skill glyphs (24×24, stroked) used by the gate panels (canvas Path2D) and the HUD (inline SVG),
// so a skill looks the same on the road, on the cannon and in the fishing game.
export const SKILL_PATHS = {
  double: 'M8 21V7M16 21V7M5 9l3-5 3 5M13 9l3-5 3 5',
  // v9.3: 散射 is 二人捕鱼's trident (Melepas Trisula): three prongs over one shaft
  spread: 'M12 22V2M9.8 4.4L12 2l2.2 2.4M6 3v6c0 3 3 4.5 6 4.5s6-1.5 6-4.5V3M4.2 5.2L6 3l1.8 2.2M16.2 5.2L18 3l1.8 2.2',
  pierce: 'M2 12h18M16 8l4 4-4 4M8 9.2a2.8 2.8 0 1 0 .01 0M13.5 9.2a2.8 2.8 0 1 0 .01 0',
  aim: 'M12 5a7 7 0 1 0 .01 0M12 2v5M12 17v5M2 12h5M17 12h5M12 10.6a1.4 1.4 0 1 0 .01 0',
  lucky: 'M12 3l2.3 6.3L21 12l-6.7 2.4L12 21l-2.3-6.6L3 12l6.7-2.7zM19 3v4M17 5h4',
};

export function skillSvg(k, cls = '') {
  return `<svg class="sk-ico ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${SKILL_PATHS[k]}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// draw a glyph into a 2D canvas context, centred at (cx, cy), `size` pixels wide
export function drawSkill(ctx, k, cx, cy, size, color = '#fff', outline = '#0b1424') {
  const p = new Path2D(SKILL_PATHS[k]);
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = outline; ctx.lineWidth = 5.2; ctx.stroke(p);
  ctx.strokeStyle = color; ctx.lineWidth = 2.6; ctx.stroke(p);
  ctx.restore();
}
