import {
  angleGeometry,
  dependencyIds,
  dimensionAnchor,
  formatNumber,
  isRound,
  linearAnchors,
  measure,
  pos,
} from '../model/doc';
import type { Evaluation } from '../model/doc';
import { isPlainNumber } from '../model/expr';
import { add, dist, dot, mid, normalize, perp, polar, scale, sub, wrapAngle } from '../model/geometry';
import type { Rect } from '../model/geometry';
import type { Constraint, ConstraintKind, Dimension, Doc, Entity, Id, Vec } from '../model/types';
import { ORIGIN_ID } from '../model/types';
import type { SolveReport } from '../solver/solver';
import { frame, gridStep } from './hit';
import type { Snap } from './hit';
import { POINT_RADIUS, theme } from './theme';
import { toScreen, toWorld } from './view';
import type { View } from './view';

export interface Preview {
  lines: [Vec, Vec][];
  circles: { c: Vec; r: number }[];
  arcs: { c: Vec; r: number; a0: number; a1: number }[];
  points: Vec[];
  snap: Snap | null;
  inference: { kind: 'horizontal' | 'vertical'; at: Vec } | null;
  box: { a: Vec; b: Vec } | null;
  dimension: Dimension | null;
  picks: Id[];
}

export const emptyPreview = (): Preview => ({
  lines: [],
  circles: [],
  arcs: [],
  points: [],
  snap: null,
  inference: null,
  box: null,
  dimension: null,
  picks: [],
});

export interface RenderInput {
  doc: Doc;
  view: View;
  report: SolveReport;
  evaluation: Evaluation;
  selection: Set<Id>;
  hover: Id | null;
  preview: Preview;
  editingDimension: Id | null;
}

const BADGE_GLYPH: Partial<Record<ConstraintKind, string>> = {
  horizontal: 'H',
  vertical: 'V',
  parallel: '∥',
  perpendicular: '⊥',
  collinear: '≡',
  tangent: 'T',
  equal: '=',
  concentric: '◎',
  symmetric: 'S',
  fixed: '⊗',
  midpoint: 'M',
  pointOnObject: '•',
};

export function render(ctx: CanvasRenderingContext2D, input: RenderInput) {
  const { view } = input;
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, view.width, view.height);
  drawGrid(ctx, view);

  const colors = statusColors(input);
  drawEntities(ctx, input, colors);
  frame.labels.clear();
  frame.badges = [];
  drawBadges(ctx, input);
  for (const d of Object.values(input.doc.dimensions)) drawDimension(ctx, input, d, false);
  if (input.preview.dimension) drawDimension(ctx, input, input.preview.dimension, true);
  drawPreview(ctx, input);
}

/* ---------- Grid ---------- */

function drawGrid(ctx: CanvasRenderingContext2D, view: View) {
  const step = gridStep(view.zoom);
  const major = step * 5;
  const tl = toWorld(view, { x: 0, y: 0 });
  const br = toWorld(view, { x: view.width, y: view.height });

  const lines = (s: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(tl.x / s) * s; x <= br.x; x += s) {
      const sx = Math.round(toScreen(view, { x, y: 0 }).x) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, view.height);
    }
    for (let y = Math.floor(br.y / s) * s; y <= tl.y; y += s) {
      const sy = Math.round(toScreen(view, { x: 0, y }).y) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(view.width, sy);
    }
    ctx.stroke();
  };
  lines(step, theme.gridMinor);
  lines(major, theme.gridMajor);

  const o = toScreen(view, { x: 0, y: 0 });
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.axisX;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(o.y) + 0.5);
  ctx.lineTo(view.width, Math.round(o.y) + 0.5);
  ctx.stroke();
  ctx.strokeStyle = theme.axisY;
  ctx.beginPath();
  ctx.moveTo(Math.round(o.x) + 0.5, 0);
  ctx.lineTo(Math.round(o.x) + 0.5, view.height);
  ctx.stroke();
}

/* ---------- Geometry ---------- */

function statusColors(input: RenderInput) {
  const { doc, report } = input;
  const over = new Set<Id>();
  for (const id of [...report.conflicting, ...report.redundant]) {
    const item = doc.constraints[id] ?? doc.dimensions[id];
    if (item) dependencyIds(doc, item.refs).forEach((r) => over.add(r));
    else if (doc.entities[id]) over.add(id);
  }
  return (id: Id) => {
    if (over.has(id)) return theme.overDefined;
    if (report.underDefined.has(id)) return theme.underDefined;
    return theme.fullyDefined;
  };
}

function entityStyle(input: RenderInput, e: Entity, color: (id: Id) => string) {
  const picked = input.preview.picks.includes(e.id);
  if (input.selection.has(e.id) || picked) return { stroke: theme.selected, width: 2.25 };
  if (input.hover === e.id) return { stroke: theme.hover, width: 2.25 };
  return { stroke: color(e.id), width: 1.5 };
}

function traceEntity(ctx: CanvasRenderingContext2D, doc: Doc, view: View, e: Entity) {
  ctx.beginPath();
  if (e.type === 'line') {
    const a = toScreen(view, pos(doc, e.p1));
    const b = toScreen(view, pos(doc, e.p2));
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  } else if (e.type === 'circle') {
    const c = toScreen(view, pos(doc, e.c));
    ctx.arc(c.x, c.y, e.r * view.zoom, 0, Math.PI * 2);
  } else if (e.type === 'arc') {
    const c = toScreen(view, pos(doc, e.c));
    ctx.arc(c.x, c.y, e.r * view.zoom, -e.a0, -e.a1, true);
  }
}

function drawEntities(ctx: CanvasRenderingContext2D, input: RenderInput, color: (id: Id) => string) {
  const { doc, view } = input;
  const entities = Object.values(doc.entities);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const e of entities) {
    if (e.type === 'point') continue;
    const style = entityStyle(input, e, color);
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = e.construction ? Math.max(1, style.width - 0.5) : style.width;
    ctx.setLineDash(e.construction ? [7, 5] : []);
    traceEntity(ctx, doc, view, e);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const centers = new Set<Id>();
  for (const e of entities) if (isRound(e)) centers.add(e.c);

  for (const e of entities) {
    if (e.type !== 'point') continue;
    const s = toScreen(view, e);
    const style = entityStyle(input, e, color);
    if (e.id === ORIGIN_ID) {
      drawOrigin(ctx, s, style.stroke === color(e.id) ? theme.origin : style.stroke);
      continue;
    }
    ctx.fillStyle = style.stroke;
    ctx.strokeStyle = style.stroke;
    if (centers.has(e.id)) {
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(s.x - 4, s.y);
      ctx.lineTo(s.x + 4, s.y);
      ctx.moveTo(s.x, s.y - 4);
      ctx.lineTo(s.x, s.y + 4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(s.x, s.y, style.width > 2 ? POINT_RADIUS + 1 : POINT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawOrigin(ctx: CanvasRenderingContext2D, s: Vec, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
  ctx.moveTo(s.x - 9, s.y);
  ctx.lineTo(s.x + 9, s.y);
  ctx.moveTo(s.x, s.y - 9);
  ctx.lineTo(s.x, s.y + 9);
  ctx.stroke();
}

/* ---------- Constraint badges ---------- */

function badgeAnchor(doc: Doc, view: View, id: Id): { at: Vec; dir: Vec } | null {
  const e = doc.entities[id];
  if (!e) return null;
  if (e.type === 'point') return { at: toScreen(view, e), dir: { x: 1, y: -1 } };
  if (e.type === 'line') {
    const a = toScreen(view, pos(doc, e.p1));
    const b = toScreen(view, pos(doc, e.p2));
    let n = normalize(perp(sub(b, a)));
    if (n.y > 0) n = scale(n, -1);
    return { at: mid(a, b), dir: n };
  }
  const c = pos(doc, e.c);
  const angle = e.type === 'circle' ? Math.PI / 4 : e.a0 + wrapAngle(e.a1 - e.a0) / 2;
  const p = toScreen(view, polar(c, e.r, angle));
  return { at: p, dir: normalize(sub(p, toScreen(view, c))) };
}

function badgeTargets(doc: Doc, c: Constraint): Id[] {
  switch (c.kind) {
    case 'coincident':
      return [];
    case 'pointOnObject':
    case 'midpoint':
      return [c.refs[0]];
    case 'symmetric':
      return [c.refs[0], c.refs[1]];
    case 'horizontal':
    case 'vertical':
      return doc.entities[c.refs[0]]?.type === 'line' ? [c.refs[0]] : c.refs;
    default:
      return c.refs;
  }
}

function drawBadges(ctx: CanvasRenderingContext2D, input: RenderInput) {
  const { doc, view } = input;
  const slots = new Map<Id, number>();
  ctx.font = theme.smallFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const c of Object.values(doc.constraints)) {
    const glyph = BADGE_GLYPH[c.kind];
    if (!glyph) continue;
    for (const target of badgeTargets(doc, c)) {
      const anchor = badgeAnchor(doc, view, target);
      if (!anchor) continue;
      const slot = slots.get(target) ?? 0;
      slots.set(target, slot + 1);
      const base = add(anchor.at, scale(anchor.dir, 14));
      const center = { x: base.x + slot * 17, y: base.y };
      const rect: Rect = { x: center.x - 7.5, y: center.y - 7.5, w: 15, h: 15 };
      frame.badges.push({ constraint: c.id, rect });

      const active = input.selection.has(c.id) || input.hover === c.id;
      const flagged = input.report.conflicting.includes(c.id) || input.report.redundant.includes(c.id);
      ctx.fillStyle = active ? theme.selected : theme.badgeBg;
      ctx.strokeStyle = flagged ? theme.overDefined : active ? theme.selected : theme.badgeBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = active ? '#fff' : flagged ? theme.overDefined : theme.badgeText;
      ctx.fillText(glyph, center.x, center.y + 0.5);
    }
  }
}

/* ---------- Dimensions ---------- */

function arrow(ctx: CanvasRenderingContext2D, tip: Vec, dir: Vec) {
  const d = normalize(dir);
  const n = perp(d);
  const back = sub(tip, scale(d, 8));
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(back.x + n.x * 3, back.y + n.y * 3);
  ctx.lineTo(back.x - n.x * 3, back.y - n.y * 3);
  ctx.closePath();
  ctx.fill();
}

function dimensionText(input: RenderInput, d: Dimension) {
  const value = measure(input.doc, d);
  const formatted = formatNumber(value, d.kind === 'angle' ? 2 : 3);
  const prefix = d.kind === 'radius' ? 'R' : d.kind === 'diameter' ? '⌀' : '';
  const suffix = d.kind === 'angle' ? '°' : '';
  const text = `${prefix}${formatted}${suffix}`;
  if (!d.driving) return `(${text})`;
  return isPlainNumber(d.expr) ? text : `Σ ${text}`;
}

function drawDimension(ctx: CanvasRenderingContext2D, input: RenderInput, d: Dimension, preview: boolean) {
  const { doc, view } = input;
  const anchor = dimensionAnchor(doc, d);
  const labelWorld = add(anchor, d.label);
  const L = toScreen(view, labelWorld);
  const active = !preview && (input.selection.has(d.id) || input.hover === d.id);
  const flagged =
    input.report.conflicting.includes(d.id) || input.report.redundant.includes(d.id) || !!input.evaluation.dimErrors[d.id];
  const color = preview
    ? theme.preview
    : active
      ? theme.selected
      : flagged
        ? theme.overDefined
        : d.driving
          ? theme.dimension
          : theme.driven;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;

  if (d.kind === 'distance' || d.kind === 'horizontal' || d.kind === 'vertical') {
    const an = linearAnchors(doc, d);
    if (!an) return;
    const a = toScreen(view, an.a);
    const b = toScreen(view, an.b);
    const u = d.kind === 'horizontal' ? { x: 1, y: 0 } : d.kind === 'vertical' ? { x: 0, y: 1 } : normalize(sub(b, a));
    const n = perp(u);
    const a2 = add(a, scale(n, dot(sub(L, a), n)));
    const b2 = add(b, scale(n, dot(sub(L, b), n)));
    ctx.beginPath();
    for (const [from, to] of [
      [a, a2],
      [b, b2],
    ] as const) {
      const dir = sub(to, from);
      const l = Math.hypot(dir.x, dir.y);
      if (l < 1) continue;
      const k = normalize(dir);
      ctx.moveTo(from.x + k.x * 3, from.y + k.y * 3);
      ctx.lineTo(to.x + k.x * 5, to.y + k.y * 5);
    }
    // Dimension line, extended to reach the label when it sits outside.
    const t = dot(sub(L, a2), u);
    const span = dot(sub(b2, a2), u);
    const lo = Math.min(0, span, t);
    const hi = Math.max(0, span, t);
    const s0 = add(a2, scale(u, lo));
    const s1 = add(a2, scale(u, hi));
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.stroke();
    if (dist(a2, b2) > 1) {
      const inward = sub(b2, a2);
      arrow(ctx, a2, scale(inward, -1));
      arrow(ctx, b2, inward);
    }
  } else if (d.kind === 'radius' || d.kind === 'diameter') {
    const e = doc.entities[d.refs[0]];
    if (!isRound(e)) return;
    const c = toScreen(view, pos(doc, e.c));
    const r = e.r * view.zoom;
    const dir = normalize(sub(L, c));
    const edge = add(c, scale(dir, r));
    const start = d.kind === 'diameter' ? sub(c, scale(dir, r)) : c;
    const far = dist(L, c) > r ? L : edge;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(far.x, far.y);
    ctx.stroke();
    arrow(ctx, edge, dir);
    if (d.kind === 'diameter') arrow(ctx, start, scale(dir, -1));
  } else if (d.kind === 'angle') {
    const g = angleGeometry(doc, d);
    if (!g) return;
    const o = toScreen(view, g.vertex);
    // Screen y is flipped, so mirror the directions.
    const s1 = { x: g.d1.x, y: -g.d1.y };
    const s2 = { x: g.d2.x, y: -g.d2.y };
    const toLabel = normalize(sub(L, o));
    const bis = normalize(add(s1, s2));
    const flip = dot(bis, toLabel) < 0;
    const r1 = flip ? scale(s1, -1) : s1;
    const r2 = flip ? scale(s2, -1) : s2;
    const radius = Math.max(dist(L, o), 12);
    const a1 = Math.atan2(r1.y, r1.x);
    const a2 = Math.atan2(r2.y, r2.x);
    const sweep = Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1));
    ctx.beginPath();
    ctx.arc(o.x, o.y, radius, a1, a1 + sweep, sweep < 0);
    ctx.stroke();
    const p1 = add(o, scale(r1, radius));
    const p2 = add(o, scale(r2, radius));
    const t1 = sweep > 0 ? perp(r1) : scale(perp(r1), -1);
    const t2 = sweep > 0 ? scale(perp(r2), -1) : perp(r2);
    arrow(ctx, p1, scale(t1, -1));
    arrow(ctx, p2, scale(t2, -1));
  }

  // Label
  const text = dimensionText(input, d);
  ctx.font = theme.font;
  const w = ctx.measureText(text).width + 10;
  const rect: Rect = { x: L.x - w / 2, y: L.y - 9, w, h: 18 };
  if (!preview) frame.labels.set(d.id, rect);
  if (input.editingDimension === d.id) return;
  ctx.fillStyle = active ? theme.selected : '#ffffff';
  ctx.strokeStyle = active ? theme.selected : flagged ? theme.overDefined : 'rgba(148,163,184,0.6)';
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = active ? '#ffffff' : color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, L.x, L.y + 0.5);
}

/* ---------- Tool preview ---------- */

function drawPreview(ctx: CanvasRenderingContext2D, input: RenderInput) {
  const { view, preview } = input;
  ctx.strokeStyle = theme.preview;
  ctx.fillStyle = theme.preview;
  ctx.lineWidth = 1.5;
  for (const [a, b] of preview.lines) {
    const sa = toScreen(view, a);
    const sb = toScreen(view, b);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
  }
  for (const c of preview.circles) {
    const s = toScreen(view, c.c);
    ctx.beginPath();
    ctx.arc(s.x, s.y, c.r * view.zoom, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const a of preview.arcs) {
    const s = toScreen(view, a.c);
    ctx.beginPath();
    ctx.arc(s.x, s.y, a.r * view.zoom, -a.a0, -a.a1, true);
    ctx.stroke();
  }
  for (const p of preview.points) {
    const s = toScreen(view, p);
    ctx.beginPath();
    ctx.arc(s.x, s.y, POINT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  const snap = preview.snap;
  if (snap && snap.kind !== 'free') {
    const s = toScreen(view, snap.pos);
    ctx.strokeStyle = theme.snap;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (snap.kind === 'point') ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
    else if (snap.kind === 'midpoint') {
      ctx.moveTo(s.x, s.y - 7);
      ctx.lineTo(s.x + 7, s.y + 5);
      ctx.lineTo(s.x - 7, s.y + 5);
      ctx.closePath();
    } else ctx.rect(s.x - 5, s.y - 5, 10, 10);
    ctx.stroke();
  }

  if (preview.inference) {
    const s = toScreen(view, preview.inference.at);
    ctx.font = theme.smallFont;
    ctx.fillStyle = theme.snap;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(preview.inference.kind === 'horizontal' ? 'H' : 'V', s.x + 12, s.y + 14);
  }

  if (preview.box) {
    const { a, b } = preview.box;
    ctx.fillStyle = theme.box;
    ctx.strokeStyle = theme.boxBorder;
    ctx.lineWidth = 1;
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    ctx.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }
}
