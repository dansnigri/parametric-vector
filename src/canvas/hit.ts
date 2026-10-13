import { entityPointIds, pos } from '../model/doc';
import {
  dist,
  distToArc,
  distToCircle,
  distToSegment,
  mid,
  projectOnArc,
  projectOnSegment,
  rectContains,
  rectFromPoints,
} from '../model/geometry';
import type { Rect } from '../model/geometry';
import type { Doc, Id, Vec } from '../model/types';
import { HIT_RADIUS } from './theme';
import { toScreen, toWorld } from './view';
import type { View } from './view';

/** Screen-space rectangles from the last rendered frame, for annotation hit-testing. */
export const frame = {
  labels: new Map<Id, Rect>(),
  badges: [] as { constraint: Id; rect: Rect }[],
};

export type Hit = { kind: 'entity' | 'dimension' | 'constraint'; id: Id };

export function hitEntity(doc: Doc, view: View, screen: Vec, exclude: Set<Id> = new Set()): Id | null {
  let best: Id | null = null;
  let bestD = HIT_RADIUS;
  // Points win over curves within the hit radius.
  for (const e of Object.values(doc.entities)) {
    if (e.type !== 'point' || exclude.has(e.id)) continue;
    const d = dist(toScreen(view, e), screen);
    if (d <= bestD) {
      bestD = d;
      best = e.id;
    }
  }
  if (best) return best;
  bestD = HIT_RADIUS;
  const w = toWorld(view, screen);
  const tol = 1 / view.zoom;
  for (const e of Object.values(doc.entities)) {
    if (exclude.has(e.id)) continue;
    let d = Infinity;
    if (e.type === 'line') d = distToSegment(w, pos(doc, e.p1), pos(doc, e.p2)) / tol;
    else if (e.type === 'circle') d = distToCircle(w, pos(doc, e.c), e.r) / tol;
    else if (e.type === 'arc') d = distToArc(w, pos(doc, e.c), e.r, e.a0, e.a1) / tol;
    if (d <= bestD) {
      bestD = d;
      best = e.id;
    }
  }
  return best;
}

export function hitTest(doc: Doc, view: View, screen: Vec): Hit | null {
  for (const [id, rect] of frame.labels) {
    if (doc.dimensions[id] && rectContains(rect, screen)) return { kind: 'dimension', id };
  }
  for (const b of frame.badges) {
    if (doc.constraints[b.constraint] && rectContains(b.rect, screen)) return { kind: 'constraint', id: b.constraint };
  }
  const id = hitEntity(doc, view, screen);
  return id ? { kind: 'entity', id } : null;
}

export type Snap =
  | { kind: 'point'; id: Id; pos: Vec }
  | { kind: 'midpoint'; id: Id; pos: Vec }
  | { kind: 'curve'; id: Id; pos: Vec }
  | { kind: 'free'; pos: Vec };

export function snapAt(
  doc: Doc,
  view: View,
  screen: Vec,
  opts: { exclude?: Set<Id>; grid?: boolean } = {},
): Snap {
  const exclude = opts.exclude ?? new Set<Id>();
  const world = toWorld(view, screen);
  const tol = HIT_RADIUS / view.zoom;

  let bestPoint: { id: Id; d: number } | null = null;
  for (const e of Object.values(doc.entities)) {
    if (e.type !== 'point' || exclude.has(e.id)) continue;
    const d = dist(e, world);
    if (d <= tol * 1.3 && (!bestPoint || d < bestPoint.d)) bestPoint = { id: e.id, d };
  }
  if (bestPoint) return { kind: 'point', id: bestPoint.id, pos: pos(doc, bestPoint.id) };

  for (const e of Object.values(doc.entities)) {
    if (e.type !== 'line' || exclude.has(e.id)) continue;
    const m = mid(pos(doc, e.p1), pos(doc, e.p2));
    if (dist(m, world) <= tol) return { kind: 'midpoint', id: e.id, pos: m };
  }

  let bestCurve: { id: Id; d: number; p: Vec } | null = null;
  for (const e of Object.values(doc.entities)) {
    if (exclude.has(e.id)) continue;
    let p: Vec | null = null;
    if (e.type === 'line') p = projectOnSegment(world, pos(doc, e.p1), pos(doc, e.p2)).point;
    else if (e.type === 'circle') {
      const c = pos(doc, e.c);
      const d = dist(world, c);
      p = d < 1e-9 ? null : { x: c.x + ((world.x - c.x) * e.r) / d, y: c.y + ((world.y - c.y) * e.r) / d };
    } else if (e.type === 'arc') p = projectOnArc(world, pos(doc, e.c), e.r, e.a0, e.a1);
    if (!p) continue;
    const d = dist(p, world);
    if (d <= tol && (!bestCurve || d < bestCurve.d)) bestCurve = { id: e.id, d, p };
  }
  if (bestCurve) return { kind: 'curve', id: bestCurve.id, pos: bestCurve.p };

  if (opts.grid) {
    const step = gridStep(view.zoom);
    return { kind: 'free', pos: { x: Math.round(world.x / step) * step, y: Math.round(world.y / step) * step } };
  }
  return { kind: 'free', pos: world };
}

/** Minor grid spacing in world units: a 1/2/5 step that stays at least ~12px on screen. */
export function gridStep(zoom: number) {
  const raw = 12 / zoom;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (m * exp >= raw) return m * exp;
  return 10 * exp;
}

/** Entities whose defining geometry lies entirely inside a screen-space box. */
export function entitiesInBox(doc: Doc, view: View, a: Vec, b: Vec): Id[] {
  const box = rectFromPoints(a, b);
  const inside = (p: Vec) => rectContains(box, toScreen(view, p));
  const out: Id[] = [];
  for (const e of Object.values(doc.entities)) {
    if (e.type === 'circle') {
      const c = pos(doc, e.c);
      const r = { x: e.r, y: e.r };
      if (inside({ x: c.x - r.x, y: c.y - r.y }) && inside({ x: c.x + r.x, y: c.y + r.y })) out.push(e.id);
    } else if (e.type === 'point') {
      if (inside(e)) out.push(e.id);
    } else if (entityPointIds(e).every((p) => inside(pos(doc, p)))) {
      out.push(e.id);
    }
  }
  const ownedPoints = new Set<Id>();
  for (const id of out) {
    const e = doc.entities[id];
    if (e.type !== 'point') entityPointIds(e).forEach((p) => ownedPoints.add(p));
  }
  return out.filter((id) => !ownedPoints.has(id));
}
