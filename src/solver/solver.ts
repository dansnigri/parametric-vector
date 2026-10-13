import { Algorithm, DebugMode, SolveStatus, make_gcs_wrapper } from '@salusoft89/planegcs';
import type { GcsWrapper, SketchPrimitive } from '@salusoft89/planegcs';
import wasmUrl from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url';
import { entityPointIds, evaluateDoc, isRound, pointAndLine } from '../model/doc';
import type { Evaluation } from '../model/doc';
import type { Constraint, Dimension, Doc, Id } from '../model/types';

let gcs: GcsWrapper | null = null;
let loading: Promise<void> | null = null;

export function initSolver() {
  loading ??= make_gcs_wrapper(wasmUrl).then((wrapper) => {
    wrapper.debug_mode = DebugMode.NoDebug;
    gcs = wrapper;
  });
  return loading;
}

export type DragTarget =
  | { kind: 'point'; id: Id; x: number; y: number }
  | { kind: 'radius'; id: Id; r: number };

export interface SolveReport {
  ok: boolean;
  dof: number;
  /** Constraint/dimension ids the solver flagged as conflicting or redundant. */
  conflicting: Id[];
  redundant: Id[];
  /** Point and round-entity ids that can still move. Filled in by `analyzeFreedom`. */
  underDefined: Set<Id>;
}

export const emptyReport = (): SolveReport => ({
  ok: true,
  dof: 0,
  conflicting: [],
  redundant: [],
  underDefined: new Set(),
});

type Prim = SketchPrimitive & { temporary?: boolean };

function geometryPrimitives(doc: Doc): Prim[] {
  const out: Prim[] = [];
  const entities = Object.values(doc.entities);
  for (const e of entities) {
    if (e.type === 'point') out.push({ id: e.id, type: 'point', x: e.x, y: e.y, fixed: !!e.locked });
  }
  for (const e of entities) {
    if (e.type === 'line') out.push({ id: e.id, type: 'line', p1_id: e.p1, p2_id: e.p2 });
    if (e.type === 'circle') out.push({ id: e.id, type: 'circle', c_id: e.c, radius: e.r });
    if (e.type === 'arc') {
      out.push({
        id: e.id,
        type: 'arc',
        c_id: e.c,
        start_id: e.start,
        end_id: e.end,
        radius: e.r,
        start_angle: e.a0,
        end_angle: e.a1,
      });
      out.push({ id: `${e.id}#rules`, type: 'arc_rules', a_id: e.id });
    }
  }
  return out;
}

function constraintPrimitives(doc: Doc, c: Constraint): Prim[] {
  const E = doc.entities;
  const [r0, r1, r2] = c.refs;
  const e0 = E[r0];
  const e1 = r1 ? E[r1] : undefined;
  const id = c.id;
  const sub = (n: number) => `${id}#${n}`;

  switch (c.kind) {
    case 'coincident':
      return [{ id, type: 'p2p_coincident', p1_id: r0, p2_id: r1 }];
    case 'pointOnObject': {
      if (e1?.type === 'line') return [{ id, type: 'point_on_line_pl', p_id: r0, l_id: r1 }];
      if (e1?.type === 'circle') return [{ id, type: 'point_on_circle', p_id: r0, c_id: r1 }];
      if (e1?.type === 'arc') return [{ id, type: 'point_on_arc', p_id: r0, a_id: r1 }];
      return [];
    }
    case 'midpoint': {
      if (e1?.type !== 'line') return [];
      return [{ id, type: 'p2p_symmetric_ppp', p1_id: e1.p1, p2_id: e1.p2, p_id: r0 }];
    }
    case 'horizontal':
    case 'vertical': {
      const t = c.kind === 'horizontal' ? 'horizontal' : 'vertical';
      if (e0?.type === 'line') return [{ id, type: `${t}_l`, l_id: r0 } as Prim];
      return [{ id, type: `${t}_pp`, p1_id: r0, p2_id: r1 } as Prim];
    }
    case 'parallel':
      return [{ id, type: 'parallel', l1_id: r0, l2_id: r1 }];
    case 'perpendicular':
      return [{ id, type: 'perpendicular_ll', l1_id: r0, l2_id: r1 }];
    case 'collinear': {
      if (e1?.type !== 'line') return [];
      return [
        { id, type: 'parallel', l1_id: r0, l2_id: r1 },
        { id: sub(1), type: 'point_on_line_pl', p_id: e1.p1, l_id: r0 },
      ];
    }
    case 'tangent': {
      if (e0?.type === 'line' && e1?.type === 'circle') return [{ id, type: 'tangent_lc', l_id: r0, c_id: r1 }];
      if (e0?.type === 'circle' && e1?.type === 'line') return [{ id, type: 'tangent_lc', l_id: r1, c_id: r0 }];
      if (e0?.type === 'line' && e1?.type === 'arc') return [{ id, type: 'tangent_la', l_id: r0, a_id: r1 }];
      if (e0?.type === 'arc' && e1?.type === 'line') return [{ id, type: 'tangent_la', l_id: r1, a_id: r0 }];
      if (e0?.type === 'circle' && e1?.type === 'circle') return [{ id, type: 'tangent_cc', c1_id: r0, c2_id: r1 }];
      if (e0?.type === 'arc' && e1?.type === 'arc') return [{ id, type: 'tangent_aa', a1_id: r0, a2_id: r1 }];
      if (e0?.type === 'circle' && e1?.type === 'arc') return [{ id, type: 'tangent_ca', c_id: r0, a_id: r1 }];
      if (e0?.type === 'arc' && e1?.type === 'circle') return [{ id, type: 'tangent_ca', c_id: r1, a_id: r0 }];
      return [];
    }
    case 'equal': {
      if (e0?.type === 'line' && e1?.type === 'line') return [{ id, type: 'equal_length', l1_id: r0, l2_id: r1 }];
      if (e0?.type === 'circle' && e1?.type === 'circle') return [{ id, type: 'equal_radius_cc', c1_id: r0, c2_id: r1 }];
      if (e0?.type === 'arc' && e1?.type === 'arc') return [{ id, type: 'equal_radius_aa', a1_id: r0, a2_id: r1 }];
      if (e0?.type === 'circle' && e1?.type === 'arc') return [{ id, type: 'equal_radius_ca', c1_id: r0, a2_id: r1 }];
      if (e0?.type === 'arc' && e1?.type === 'circle') return [{ id, type: 'equal_radius_ca', c1_id: r1, a2_id: r0 }];
      return [];
    }
    case 'concentric': {
      if (!isRound(e0) || !isRound(e1)) return [];
      return [{ id, type: 'p2p_coincident', p1_id: e0.c, p2_id: e1.c }];
    }
    case 'symmetric': {
      const e2 = r2 ? E[r2] : undefined;
      if (e2?.type === 'line') return [{ id, type: 'p2p_symmetric_ppl', p1_id: r0, p2_id: r1, l_id: r2 }];
      if (e2?.type === 'point') return [{ id, type: 'p2p_symmetric_ppp', p1_id: r0, p2_id: r1, p_id: r2 }];
      return [];
    }
    case 'fixed': {
      const d = c.data ?? [];
      const fixPoint = (pid: Id, x: number, y: number, n: number): Prim[] => [
        { id: n === 0 ? id : sub(n), type: 'coordinate_x', p_id: pid, x },
        { id: sub(n + 1), type: 'coordinate_y', p_id: pid, y },
      ];
      if (e0?.type === 'point') return fixPoint(r0, d[0], d[1], 0);
      if (e0?.type === 'line') return [...fixPoint(e0.p1, d[0], d[1], 0), ...fixPoint(e0.p2, d[2], d[3], 2)];
      if (e0?.type === 'circle')
        return [...fixPoint(e0.c, d[0], d[1], 0), { id: sub(2), type: 'circle_radius', c_id: r0, radius: d[2] }];
      if (e0?.type === 'arc')
        return [
          ...fixPoint(e0.c, d[0], d[1], 0),
          { id: sub(2), type: 'arc_radius', a_id: r0, radius: d[2] },
          { id: sub(3), type: 'equal', param1: { o_id: r0, prop: 'start_angle' }, param2: d[3] },
          { id: sub(4), type: 'equal', param1: { o_id: r0, prop: 'end_angle' }, param2: d[4] },
        ];
      return [];
    }
  }
}

function dimensionPrimitives(doc: Doc, d: Dimension, value: number): Prim[] {
  const E = doc.entities;
  const [r0, r1] = d.refs;
  const e0 = E[r0];
  const e1 = r1 ? E[r1] : undefined;
  const id = d.id;

  switch (d.kind) {
    case 'distance': {
      if (e0?.type === 'line' && !e1) return [{ id, type: 'p2p_distance', p1_id: e0.p1, p2_id: e0.p2, distance: value }];
      if (e0?.type === 'point' && e1?.type === 'point')
        return [{ id, type: 'p2p_distance', p1_id: r0, p2_id: r1, distance: value }];
      const pl = pointAndLine(e0, e1);
      if (pl) return [{ id, type: 'p2l_distance', p_id: pl.p.id, l_id: pl.l.id, distance: value }];
      if (e0?.type === 'line' && e1?.type === 'line')
        return [
          { id, type: 'parallel', l1_id: r0, l2_id: r1 },
          { id: `${id}#1`, type: 'p2l_distance', p_id: e1.p1, l_id: r0, distance: value },
        ];
      return [];
    }
    case 'horizontal':
    case 'vertical': {
      let a: Id | undefined;
      let b: Id | undefined;
      if (e0?.type === 'line') [a, b] = [e0.p1, e0.p2];
      else if (e0?.type === 'point' && e1?.type === 'point') [a, b] = [r0, r1];
      if (!a || !b) return [];
      const prop = d.kind === 'horizontal' ? 'x' : 'y';
      return [
        {
          id,
          type: 'difference',
          param1: { o_id: a, prop },
          param2: { o_id: b, prop },
          difference: d.sign * value,
        },
      ];
    }
    case 'radius':
    case 'diameter': {
      const r = d.kind === 'radius' ? value : value / 2;
      if (e0?.type === 'circle') return [{ id, type: 'circle_radius', c_id: r0, radius: r }];
      if (e0?.type === 'arc') return [{ id, type: 'arc_radius', a_id: r0, radius: r }];
      return [];
    }
    case 'angle':
      return [{ id, type: 'l2l_angle_ll', l1_id: r0, l2_id: r1, angle: (d.sign * value * Math.PI) / 180 }];
  }
}

function dragPrimitives(targets: DragTarget[]): Prim[] {
  const out: Prim[] = [];
  targets.forEach((t, i) => {
    if (t.kind === 'point') {
      out.push({ id: `__drag${i}x`, type: 'coordinate_x', p_id: t.id, x: t.x, temporary: true });
      out.push({ id: `__drag${i}y`, type: 'coordinate_y', p_id: t.id, y: t.y, temporary: true });
    } else {
      out.push({
        id: `__drag${i}r`,
        type: 'equal',
        param1: { o_id: t.id, prop: 'radius' },
        param2: t.r,
        temporary: true,
      });
    }
  });
  return out;
}

function buildPrimitives(doc: Doc, ev: Evaluation, targets: DragTarget[] = []): Prim[] {
  const prims = geometryPrimitives(doc);
  for (const c of Object.values(doc.constraints)) prims.push(...constraintPrimitives(doc, c));
  for (const d of Object.values(doc.dimensions)) {
    const value = ev.dims[d.id];
    if (d.driving && value !== undefined) prims.push(...dimensionPrimitives(doc, d, value));
  }
  prims.push(...dragPrimitives(targets));
  return prims;
}

const baseId = (id: Id) => id.split('#')[0];

function runSolver(prims: Prim[]) {
  if (!gcs) throw new Error('Solver not initialised');
  gcs.clear_data();
  gcs.push_primitives_and_params(prims);
  const status = gcs.solve(Algorithm.DogLeg);
  gcs.apply_solution();
  return status;
}

function readBack(doc: Doc) {
  for (const prim of gcs!.sketch_index.get_primitives()) {
    const e = doc.entities[prim.id];
    if (!e) continue;
    if (prim.type === 'point' && e.type === 'point') {
      e.x = prim.x;
      e.y = prim.y;
    } else if (prim.type === 'circle' && e.type === 'circle') {
      e.r = prim.radius;
    } else if (prim.type === 'arc' && e.type === 'arc') {
      e.r = prim.radius;
      e.a0 = prim.start_angle;
      e.a1 = prim.end_angle;
    }
  }
}

/**
 * Solves `doc` in place. When the solver fails, geometry is left untouched.
 */
export function solveDoc(doc: Doc, targets: DragTarget[] = [], ev = evaluateDoc(doc)): SolveReport {
  if (!gcs) return emptyReport();
  const status = runSolver(buildPrimitives(doc, ev, targets));
  const ok = status === SolveStatus.Success || status === SolveStatus.Converged;
  const conflicting = [...new Set(gcs.get_gcs_conflicting_constraints().map(baseId))];
  const redundant = [...new Set(gcs.get_gcs_redundant_constraints().map(baseId))];
  if (ok) readBack(doc);
  return { ok, dof: gcs.gcs.dof(), conflicting, redundant, underDefined: new Set() };
}

/**
 * Finds geometry that can still move by nudging each point (and each radius)
 * with a weak temporary constraint and seeing whether the solver lets it go.
 */
export function analyzeFreedom(doc: Doc, report: SolveReport, ev = evaluateDoc(doc)): Set<Id> {
  const free = new Set<Id>();
  if (!gcs || !report.ok || report.dof === 0) return free;

  const points = Object.values(doc.entities).filter((e) => e.type === 'point' && !e.locked);
  const rounds = Object.values(doc.entities).filter(isRound);
  if (points.length > 400) return new Set(points.map((p) => p.id));

  let extent = 1;
  for (const p of points) if (p.type === 'point') extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
  const delta = extent * 0.01;
  const base = buildPrimitives(doc, ev);

  const moved = (id: Id, read: (prim: SketchPrimitive) => number, before: number) => {
    const prim = gcs!.sketch_index.get_primitive(id);
    return prim ? Math.abs(read(prim) - before) > delta * 0.05 : false;
  };

  for (const p of points) {
    if (p.type !== 'point') continue;
    for (const axis of ['x', 'y'] as const) {
      const target = { x: p.x, y: p.y, [axis]: p[axis] + delta };
      runSolver([...base, ...dragPrimitives([{ kind: 'point', id: p.id, x: target.x, y: target.y }])]);
      if (moved(p.id, (prim) => (prim as { x: number; y: number })[axis], p[axis])) {
        free.add(p.id);
        break;
      }
    }
  }
  for (const e of rounds) {
    runSolver([...base, ...dragPrimitives([{ kind: 'radius', id: e.id, r: e.r + delta }])]);
    if (moved(e.id, (prim) => (prim as { radius: number }).radius, e.r)) free.add(e.id);
  }

  // Curves are free when any of their defining points is.
  for (const e of Object.values(doc.entities)) {
    if (e.type !== 'point' && entityPointIds(e).some((p) => free.has(p))) free.add(e.id);
  }
  return free;
}
