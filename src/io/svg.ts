import { pos } from '../model/doc';
import { arcSweep, polar } from '../model/geometry';
import type { Doc, Entity, Vec } from '../model/types';

const fmt = (n: number) => {
  const s = n.toFixed(4);
  return s.includes('.') ? s.replace(/\.?0+$/, '') || '0' : s;
};

/** SVG path data for one curve, in SVG coordinates (y down). */
function pathData(doc: Doc, e: Entity): string | null {
  const flip = (p: Vec) => `${fmt(p.x)} ${fmt(-p.y)}`;
  if (e.type === 'line') return `M ${flip(pos(doc, e.p1))} L ${flip(pos(doc, e.p2))}`;
  if (e.type === 'circle') {
    const c = pos(doc, e.c);
    const r = fmt(e.r);
    const a = { x: c.x + e.r, y: c.y };
    const b = { x: c.x - e.r, y: c.y };
    return `M ${flip(a)} A ${r} ${r} 0 1 0 ${flip(b)} A ${r} ${r} 0 1 0 ${flip(a)} Z`;
  }
  if (e.type === 'arc') {
    const c = pos(doc, e.c);
    const sweep = arcSweep(e.a0, e.a1);
    const s = polar(c, e.r, e.a0);
    const t = polar(c, e.r, e.a0 + sweep);
    const r = fmt(e.r);
    // Counter-clockwise in a y-up world is still counter-clockwise on screen: sweep-flag 0.
    return `M ${flip(s)} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 0 ${flip(t)}`;
  }
  return null;
}

function bounds(doc: Doc, curves: Entity[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const e of curves) {
    if (e.type === 'line') {
      const a = pos(doc, e.p1);
      const b = pos(doc, e.p2);
      grow(a.x, a.y);
      grow(b.x, b.y);
    } else if (e.type === 'circle' || e.type === 'arc') {
      const c = pos(doc, e.c);
      if (e.type === 'circle') {
        grow(c.x - e.r, c.y - e.r);
        grow(c.x + e.r, c.y + e.r);
      } else {
        const sweep = arcSweep(e.a0, e.a1);
        for (let i = 0; i <= 64; i++) {
          const p = polar(c, e.r, e.a0 + (sweep * i) / 64);
          grow(p.x, p.y);
        }
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

export function exportSvg(doc: Doc, opts: { strokeWidth?: number; includeConstruction?: boolean } = {}): string {
  const curves = Object.values(doc.entities).filter(
    (e) => e.type !== 'point' && (opts.includeConstruction || !e.construction),
  );
  if (curves.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>\n';
  }
  const b = bounds(doc, curves);
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1);
  const stroke = opts.strokeWidth ?? size / 200;
  const pad = stroke * 2;
  const x = b.minX - pad;
  const y = -b.maxY - pad;
  const w = b.maxX - b.minX + pad * 2;
  const h = b.maxY - b.minY + pad * 2;
  const paths = curves
    .map((e) => pathData(doc, e))
    .filter(Boolean)
    .map((d) => `    <path d="${d}"/>`)
    .join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(x)} ${fmt(y)} ${fmt(w)} ${fmt(h)}" width="${fmt(w)}" height="${fmt(h)}">`,
    `  <title>${escapeXml(doc.name)}</title>`,
    `  <g fill="none" stroke="#000" stroke-width="${fmt(stroke)}" stroke-linecap="round" stroke-linejoin="round">`,
    paths,
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

function escapeXml(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
}
