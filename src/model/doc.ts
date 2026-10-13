import {
  dist,
  lineIntersection,
  mid,
  normalize,
  projectOnLine,
  signedAngle,
  sub,
} from './geometry';
import { evaluate, isPlainNumber } from './expr';
import type {
  ArcEntity,
  CircleEntity,
  Constraint,
  ConstraintKind,
  CurveEntity,
  Dimension,
  DimensionKind,
  Doc,
  Entity,
  Id,
  LineEntity,
  PointEntity,
  Vec,
} from './types';
import { ORIGIN_ID } from './types';

export function createDoc(name = 'Untitled'): Doc {
  return {
    version: 1,
    name,
    nextId: 1,
    entities: { [ORIGIN_ID]: { id: ORIGIN_ID, type: 'point', x: 0, y: 0, locked: true } },
    constraints: {},
    dimensions: {},
    parameters: [],
  };
}

export function newId(doc: Doc, prefix: string): Id {
  return `${prefix}${doc.nextId++}`;
}

export function point(doc: Doc, id: Id): PointEntity {
  const e = doc.entities[id];
  if (!e || e.type !== 'point') throw new Error(`Point ${id} not found`);
  return e;
}

export function pos(doc: Doc, id: Id): Vec {
  const p = point(doc, id);
  return { x: p.x, y: p.y };
}

export const isCurve = (e: Entity | undefined): e is CurveEntity =>
  !!e && (e.type === 'line' || e.type === 'circle' || e.type === 'arc');
export const isRound = (e: Entity | undefined): e is CircleEntity | ArcEntity =>
  !!e && (e.type === 'circle' || e.type === 'arc');

export function entityPointIds(e: Entity): Id[] {
  switch (e.type) {
    case 'point':
      return [e.id];
    case 'line':
      return [e.p1, e.p2];
    case 'circle':
      return [e.c];
    case 'arc':
      return [e.c, e.start, e.end];
  }
}

export function addPoint(doc: Doc, x: number, y: number, construction = false): Id {
  const id = newId(doc, 'p');
  doc.entities[id] = { id, type: 'point', x, y, ...(construction ? { construction } : {}) };
  return id;
}

export function addLine(doc: Doc, p1: Id, p2: Id, construction = false): Id {
  const id = newId(doc, 'l');
  doc.entities[id] = { id, type: 'line', p1, p2, ...(construction ? { construction } : {}) };
  return id;
}

export function addCircle(doc: Doc, c: Id, r: number, construction = false): Id {
  const id = newId(doc, 'c');
  doc.entities[id] = { id, type: 'circle', c, r, ...(construction ? { construction } : {}) };
  return id;
}

export function addArc(
  doc: Doc,
  c: Id,
  start: Id,
  end: Id,
  r: number,
  a0: number,
  a1: number,
  construction = false,
): Id {
  const id = newId(doc, 'a');
  doc.entities[id] = { id, type: 'arc', c, start, end, r, a0, a1, ...(construction ? { construction } : {}) };
  return id;
}

export function addConstraint(doc: Doc, kind: ConstraintKind, refs: Id[]): Id {
  const id = newId(doc, 'k');
  const c: Constraint = { id, kind, refs };
  if (kind === 'fixed') c.data = fixedSnapshot(doc, refs[0]);
  doc.constraints[id] = c;
  return id;
}

function fixedSnapshot(doc: Doc, ref: Id): number[] {
  const e = doc.entities[ref];
  switch (e.type) {
    case 'point':
      return [e.x, e.y];
    case 'line': {
      const a = pos(doc, e.p1);
      const b = pos(doc, e.p2);
      return [a.x, a.y, b.x, b.y];
    }
    case 'circle': {
      const c = pos(doc, e.c);
      return [c.x, c.y, e.r];
    }
    case 'arc': {
      const c = pos(doc, e.c);
      return [c.x, c.y, e.r, e.a0, e.a1];
    }
  }
}

/** Ids of everything a constraint or dimension depends on, including curve points. */
export function dependencyIds(doc: Doc, refs: Id[]): Set<Id> {
  const out = new Set<Id>();
  for (const r of refs) {
    out.add(r);
    const e = doc.entities[r];
    if (e) entityPointIds(e).forEach((p) => out.add(p));
  }
  return out;
}

/** Deletes the given items and anything that can no longer exist without them. */
export function deleteItems(doc: Doc, ids: Iterable<Id>) {
  const removeEntities = new Set<Id>();
  for (const id of ids) {
    if (id === ORIGIN_ID) continue;
    if (doc.constraints[id]) delete doc.constraints[id];
    else if (doc.dimensions[id]) delete doc.dimensions[id];
    else if (doc.entities[id]) removeEntities.add(id);
  }
  if (removeEntities.size === 0) return;

  // Curves that use a removed point go too.
  for (const e of Object.values(doc.entities)) {
    if (isCurve(e) && entityPointIds(e).some((p) => removeEntities.has(p))) removeEntities.add(e.id);
  }
  // Points owned only by removed curves go too.
  const stillUsed = new Set<Id>();
  for (const e of Object.values(doc.entities)) {
    if (isCurve(e) && !removeEntities.has(e.id)) entityPointIds(e).forEach((p) => stillUsed.add(p));
  }
  for (const id of [...removeEntities]) {
    const e = doc.entities[id];
    if (isCurve(e)) {
      for (const p of entityPointIds(e)) if (!stillUsed.has(p) && p !== ORIGIN_ID) removeEntities.add(p);
    }
  }
  for (const id of removeEntities) delete doc.entities[id];

  const dangling = (refs: Id[]) => refs.some((r) => !doc.entities[r]);
  for (const c of Object.values(doc.constraints)) if (dangling(c.refs)) delete doc.constraints[c.id];
  for (const d of Object.values(doc.dimensions)) if (dangling(d.refs)) delete doc.dimensions[d.id];
}

/* ---------- Dimensions ---------- */

export interface LinearAnchors {
  a: Vec;
  b: Vec;
}

/** The two world points a linear dimension measures between. */
export function linearAnchors(doc: Doc, d: Dimension): LinearAnchors | null {
  const [r0, r1] = d.refs;
  const e0 = doc.entities[r0];
  const e1 = r1 ? doc.entities[r1] : undefined;
  if (!e0) return null;
  if (e0.type === 'line' && !e1) return { a: pos(doc, e0.p1), b: pos(doc, e0.p2) };
  if (e0.type === 'point' && e1?.type === 'point') return { a: pos(doc, e0.id), b: pos(doc, e1.id) };
  const pl = pointAndLine(e0, e1);
  if (pl) {
    const p = pos(doc, pl.p.id);
    return { a: p, b: projectOnLine(p, pos(doc, pl.l.p1), pos(doc, pl.l.p2)) };
  }
  if (e0.type === 'line' && e1?.type === 'line') {
    const p = pos(doc, e1.p1);
    return { a: p, b: projectOnLine(p, pos(doc, e0.p1), pos(doc, e0.p2)) };
  }
  return null;
}

export function pointAndLine(e0?: Entity, e1?: Entity): { p: PointEntity; l: LineEntity } | null {
  if (e0?.type === 'point' && e1?.type === 'line') return { p: e0, l: e1 };
  if (e1?.type === 'point' && e0?.type === 'line') return { p: e1, l: e0 };
  return null;
}

export interface AngleGeometry {
  vertex: Vec;
  d1: Vec;
  d2: Vec;
  /** Signed angle from d1 to d2 in radians. */
  angle: number;
}

export function angleGeometry(doc: Doc, d: Dimension): AngleGeometry | null {
  const l1 = doc.entities[d.refs[0]];
  const l2 = doc.entities[d.refs[1]];
  if (l1?.type !== 'line' || l2?.type !== 'line') return null;
  const a1 = pos(doc, l1.p1);
  const a2 = pos(doc, l1.p2);
  const b1 = pos(doc, l2.p1);
  const b2 = pos(doc, l2.p2);
  const d1 = normalize(sub(a2, a1));
  const d2 = normalize(sub(b2, b1));
  const vertex = lineIntersection(a1, a2, b1, b2) ?? mid(mid(a1, a2), mid(b1, b2));
  return { vertex, d1, d2, angle: signedAngle(d1, d2) };
}

/** Current geometric value of a dimension (degrees for angles). */
export function measure(doc: Doc, d: Dimension): number {
  switch (d.kind) {
    case 'distance': {
      const an = linearAnchors(doc, d);
      return an ? dist(an.a, an.b) : 0;
    }
    case 'horizontal':
    case 'vertical': {
      const an = linearAnchors(doc, d);
      if (!an) return 0;
      return Math.abs(d.kind === 'horizontal' ? an.b.x - an.a.x : an.b.y - an.a.y);
    }
    case 'radius':
    case 'diameter': {
      const e = doc.entities[d.refs[0]];
      if (!isRound(e)) return 0;
      return d.kind === 'radius' ? e.r : e.r * 2;
    }
    case 'angle': {
      const g = angleGeometry(doc, d);
      return g ? (Math.abs(g.angle) * 180) / Math.PI : 0;
    }
  }
}

/** Anchor point that a dimension's label offset is relative to. */
export function dimensionAnchor(doc: Doc, d: Dimension): Vec {
  if (d.kind === 'radius' || d.kind === 'diameter') {
    const e = doc.entities[d.refs[0]];
    return isRound(e) ? pos(doc, e.c) : { x: 0, y: 0 };
  }
  if (d.kind === 'angle') return angleGeometry(doc, d)?.vertex ?? { x: 0, y: 0 };
  const an = linearAnchors(doc, d);
  return an ? mid(an.a, an.b) : { x: 0, y: 0 };
}

export function makeDimension(doc: Doc, kind: DimensionKind, refs: Id[], labelWorld: Vec): Dimension {
  const id = newId(doc, 'd');
  const d: Dimension = { id, kind, refs, expr: '0', driving: true, sign: 1, label: { x: 0, y: 0 } };
  if (kind === 'horizontal' || kind === 'vertical') {
    const an = linearAnchors(doc, d);
    if (an) d.sign = (kind === 'horizontal' ? an.b.x - an.a.x : an.b.y - an.a.y) < 0 ? -1 : 1;
  }
  if (kind === 'angle') {
    const g = angleGeometry(doc, d);
    if (g) d.sign = g.angle < 0 ? -1 : 1;
  }
  d.expr = formatNumber(measure(doc, d));
  const anchor = dimensionAnchor(doc, d);
  d.label = { x: labelWorld.x - anchor.x, y: labelWorld.y - anchor.y };
  return d;
}

/** Infers which dimension the user means from what they picked. */
export function inferDimensionKind(doc: Doc, refs: Id[]): DimensionKind | null {
  const [e0, e1] = refs.map((r) => doc.entities[r]);
  if (refs.length === 1) {
    if (e0?.type === 'line') return 'distance';
    if (e0?.type === 'circle') return 'diameter';
    if (e0?.type === 'arc') return 'radius';
    return null;
  }
  if (refs.length === 2) {
    if (e0?.type === 'point' && e1?.type === 'point') return 'distance';
    if (pointAndLine(e0, e1)) return 'distance';
    if (e0?.type === 'line' && e1?.type === 'line') {
      const g = angleGeometry(doc, { refs } as Dimension);
      if (g && Math.abs(Math.sin(g.angle)) > 1e-3) return 'angle';
      return 'distance';
    }
  }
  return null;
}

export function formatNumber(n: number, digits = 3) {
  const s = n.toFixed(digits);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/* ---------- Parameters ---------- */

export interface Evaluation {
  params: Record<string, number>;
  paramErrors: Record<Id, string>;
  dims: Record<Id, number>;
  dimErrors: Record<Id, string>;
}

export function evaluateDoc(doc: Doc): Evaluation {
  const byName = new Map(doc.parameters.map((p) => [p.name, p]));
  const params: Record<string, number> = {};
  const paramErrors: Record<Id, string> = {};
  const visiting = new Set<string>();

  const resolve = (name: string): number => {
    if (name in params) return params[name];
    const p = byName.get(name);
    if (!p) throw new Error(`Unknown name "${name}"`);
    if (visiting.has(name)) throw new Error(`Circular reference via "${name}"`);
    visiting.add(name);
    try {
      params[name] = evaluate(p.expr, resolve);
      return params[name];
    } finally {
      visiting.delete(name);
    }
  };

  for (const p of doc.parameters) {
    try {
      resolve(p.name);
    } catch (err) {
      paramErrors[p.id] = (err as Error).message;
    }
  }

  const dims: Record<Id, number> = {};
  const dimErrors: Record<Id, string> = {};
  for (const d of Object.values(doc.dimensions)) {
    if (!d.driving) continue;
    try {
      const value = isPlainNumber(d.expr) ? parseFloat(d.expr) : evaluate(d.expr, resolve);
      if (value <= 0 && d.kind !== 'angle') throw new Error('Must be greater than zero');
      dims[d.id] = value;
    } catch (err) {
      dimErrors[d.id] = (err as Error).message;
    }
  }
  return { params, paramErrors, dims, dimErrors };
}