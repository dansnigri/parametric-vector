export type Id = string;

export interface Vec {
  x: number;
  y: number;
}

interface EntityBase {
  id: Id;
  construction?: boolean;
}

export interface PointEntity extends EntityBase {
  type: 'point';
  x: number;
  y: number;
  /** Locked in the solver (only used for the sketch origin). */
  locked?: boolean;
}

export interface LineEntity extends EntityBase {
  type: 'line';
  p1: Id;
  p2: Id;
}

export interface CircleEntity extends EntityBase {
  type: 'circle';
  c: Id;
  r: number;
}

/** Arcs run counter-clockwise from `start` to `end` (angles in radians, y-up world). */
export interface ArcEntity extends EntityBase {
  type: 'arc';
  c: Id;
  start: Id;
  end: Id;
  r: number;
  a0: number;
  a1: number;
}

export type CurveEntity = LineEntity | CircleEntity | ArcEntity;
export type Entity = PointEntity | CurveEntity;

export type ConstraintKind =
  | 'coincident'
  | 'pointOnObject'
  | 'midpoint'
  | 'horizontal'
  | 'vertical'
  | 'parallel'
  | 'perpendicular'
  | 'collinear'
  | 'tangent'
  | 'equal'
  | 'concentric'
  | 'symmetric'
  | 'fixed';

export interface Constraint {
  id: Id;
  kind: ConstraintKind;
  refs: Id[];
  /** Snapshot of locked values for `fixed`. */
  data?: number[];
}

export type DimensionKind = 'distance' | 'horizontal' | 'vertical' | 'radius' | 'diameter' | 'angle';

export interface Dimension {
  id: Id;
  kind: DimensionKind;
  refs: Id[];
  /** Number or expression; angles in degrees. */
  expr: string;
  /** Driven (reference) dimensions only measure, they don't constrain. */
  driving: boolean;
  /** Orientation captured at creation for signed solver constraints. */
  sign: 1 | -1;
  /** Label position, as a world-space offset from the dimension's anchor. */
  label: Vec;
}

export interface Parameter {
  id: Id;
  name: string;
  expr: string;
}

export interface Doc {
  version: 1;
  name: string;
  nextId: number;
  entities: Record<Id, Entity>;
  constraints: Record<Id, Constraint>;
  dimensions: Record<Id, Dimension>;
  parameters: Parameter[];
}

export const ORIGIN_ID = 'origin';
