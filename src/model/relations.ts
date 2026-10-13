import { isRound } from './doc';
import type { ConstraintKind, DimensionKind, Doc, Entity, Id } from './types';
import { ORIGIN_ID } from './types';

export interface RelationOption {
  kind: ConstraintKind;
  label: string;
  /** One constraint is added per group. */
  groups: Id[][];
  shortcut?: string;
}

export interface DimensionOption {
  kind: DimensionKind;
  label: string;
  refs: Id[];
}

export const CONSTRAINT_LABEL: Record<ConstraintKind, string> = {
  coincident: 'Coincident',
  pointOnObject: 'On object',
  midpoint: 'Midpoint',
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  parallel: 'Parallel',
  perpendicular: 'Perpendicular',
  collinear: 'Collinear',
  tangent: 'Tangent',
  equal: 'Equal',
  concentric: 'Concentric',
  symmetric: 'Symmetric',
  fixed: 'Fix',
};

function selectedEntities(doc: Doc, selection: Id[]): Entity[] {
  return selection.map((id) => doc.entities[id]).filter((e): e is Entity => !!e);
}

export function availableRelations(doc: Doc, selection: Id[]): RelationOption[] {
  const ents = selectedEntities(doc, selection);
  const points = ents.filter((e) => e.type === 'point');
  const lines = ents.filter((e) => e.type === 'line');
  const rounds = ents.filter(isRound);
  const n = ents.length;
  const out: RelationOption[] = [];
  const opt = (kind: ConstraintKind, groups: Id[][], shortcut?: string, label = CONSTRAINT_LABEL[kind]) =>
    out.push({ kind, label, groups, shortcut });

  if (n === 0) return out;

  if (lines.length === n) {
    opt('horizontal', lines.map((l) => [l.id]), 'H');
    opt('vertical', lines.map((l) => [l.id]), 'V');
    if (n >= 2) {
      const [first, ...rest] = lines;
      opt('parallel', rest.map((l) => [first.id, l.id]));
      if (n === 2) opt('perpendicular', [[first.id, rest[0].id]]);
      opt('equal', rest.map((l) => [first.id, l.id]), 'E');
      opt('collinear', rest.map((l) => [first.id, l.id]));
    }
  }

  if (points.length === 2 && n === 2) {
    const [a, b] = points;
    opt('coincident', [[a.id, b.id]]);
    opt('horizontal', [[a.id, b.id]], 'H');
    opt('vertical', [[a.id, b.id]], 'V');
  }

  if (points.length === 1 && n === 2) {
    const p = points[0];
    const other = ents.find((e) => e !== p)!;
    if (other.type === 'line') {
      opt('pointOnObject', [[p.id, other.id]], undefined, 'Coincident');
      opt('midpoint', [[p.id, other.id]]);
    } else if (isRound(other)) {
      opt('pointOnObject', [[p.id, other.id]], undefined, 'Coincident');
    }
  }

  if (lines.length === 1 && rounds.length === 1 && n === 2) opt('tangent', [[lines[0].id, rounds[0].id]]);

  if (rounds.length === 2 && n === 2) {
    const [a, b] = rounds;
    opt('tangent', [[a.id, b.id]]);
    opt('equal', [[a.id, b.id]], 'E');
    opt('concentric', [[a.id, b.id]]);
  }
  if (rounds.length > 2 && rounds.length === n) {
    const [first, ...rest] = rounds;
    opt('equal', rest.map((r) => [first.id, r.id]), 'E');
  }

  if (points.length === 2 && lines.length === 1 && n === 3) {
    opt('symmetric', [[points[0].id, points[1].id, lines[0].id]]);
  }
  if (points.length === 3 && n === 3) {
    opt('symmetric', [[points[0].id, points[1].id, points[2].id]], undefined, 'Symmetric about last');
  }

  const fixable = ents.filter((e) => e.id !== ORIGIN_ID);
  if (fixable.length) opt('fixed', fixable.map((e) => [e.id]));
  return out;
}

export function availableDimensions(doc: Doc, selection: Id[]): DimensionOption[] {
  const ents = selectedEntities(doc, selection);
  if (ents.length !== selection.length) return [];
  const [a, b] = ents;
  const ids = ents.map((e) => e.id);
  if (ents.length === 1) {
    if (a.type === 'line')
      return [
        { kind: 'distance', label: 'Length', refs: ids },
        { kind: 'horizontal', label: 'Horizontal', refs: ids },
        { kind: 'vertical', label: 'Vertical', refs: ids },
      ];
    if (isRound(a))
      return [
        { kind: 'diameter', label: 'Diameter', refs: ids },
        { kind: 'radius', label: 'Radius', refs: ids },
      ];
  }
  if (ents.length === 2) {
    if (a.type === 'point' && b.type === 'point')
      return [
        { kind: 'distance', label: 'Distance', refs: ids },
        { kind: 'horizontal', label: 'Horizontal', refs: ids },
        { kind: 'vertical', label: 'Vertical', refs: ids },
      ];
    if ((a.type === 'point' && b.type === 'line') || (a.type === 'line' && b.type === 'point'))
      return [{ kind: 'distance', label: 'Distance', refs: ids }];
    if (a.type === 'line' && b.type === 'line')
      return [
        { kind: 'angle', label: 'Angle', refs: ids },
        { kind: 'distance', label: 'Distance (parallel)', refs: ids },
      ];
  }
  return [];
}
