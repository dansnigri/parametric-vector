import type { Vec } from './types';

export const TAU = Math.PI * 2;

export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
export const len = (a: Vec) => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x });
export const polar = (c: Vec, r: number, angle: number): Vec => ({
  x: c.x + r * Math.cos(angle),
  y: c.y + r * Math.sin(angle),
});

export function normalize(a: Vec): Vec {
  const l = len(a);
  return l < 1e-12 ? { x: 1, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Positive modulo into [0, TAU). */
export function wrapAngle(a: number) {
  return ((a % TAU) + TAU) % TAU;
}

export function arcSweep(a0: number, a1: number) {
  const s = wrapAngle(a1 - a0);
  return s < 1e-9 ? TAU : s;
}

export function angleInArc(theta: number, a0: number, a1: number) {
  return wrapAngle(theta - a0) <= arcSweep(a0, a1) + 1e-9;
}

export function projectOnSegment(p: Vec, a: Vec, b: Vec): { point: Vec; t: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return { point: add(a, scale(ab, t)), t };
}

export function projectOnLine(p: Vec, a: Vec, b: Vec): Vec {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return a;
  return add(a, scale(ab, dot(sub(p, a), ab) / l2));
}

export function distToSegment(p: Vec, a: Vec, b: Vec) {
  return dist(p, projectOnSegment(p, a, b).point);
}

export function distToCircle(p: Vec, c: Vec, r: number) {
  return Math.abs(dist(p, c) - r);
}

export function distToArc(p: Vec, c: Vec, r: number, a0: number, a1: number) {
  const theta = Math.atan2(p.y - c.y, p.x - c.x);
  if (angleInArc(theta, a0, a1)) return Math.abs(dist(p, c) - r);
  return Math.min(dist(p, polar(c, r, a0)), dist(p, polar(c, r, a1)));
}

export function projectOnArc(p: Vec, c: Vec, r: number, a0: number, a1: number): Vec {
  const theta = Math.atan2(p.y - c.y, p.x - c.x);
  if (angleInArc(theta, a0, a1)) return polar(c, r, theta);
  const s = polar(c, r, a0);
  const e = polar(c, r, a1);
  return dist(p, s) < dist(p, e) ? s : e;
}

export function circumcenter(a: Vec, b: Vec, c: Vec): Vec | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
}

export interface ArcFit {
  center: Vec;
  r: number;
  a0: number;
  a1: number;
  /** True when the CCW arc runs from the second point back to the first. */
  reversed: boolean;
}

/** Arc from `s` to `e` passing through `m`, normalised to run counter-clockwise. */
export function arcThrough(s: Vec, e: Vec, m: Vec): ArcFit | null {
  const center = circumcenter(s, e, m);
  if (!center) return null;
  const r = dist(center, s);
  const as = Math.atan2(s.y - center.y, s.x - center.x);
  const ae = Math.atan2(e.y - center.y, e.x - center.x);
  const am = Math.atan2(m.y - center.y, m.x - center.x);
  if (wrapAngle(am - as) < wrapAngle(ae - as)) {
    return { center, r, a0: as, a1: as + wrapAngle(ae - as), reversed: false };
  }
  return { center, r, a0: ae, a1: ae + wrapAngle(as - ae), reversed: true };
}

export function lineIntersection(a1: Vec, a2: Vec, b1: Vec, b2: Vec): Vec | null {
  const da = sub(a2, a1);
  const db = sub(b2, b1);
  const d = cross(da, db);
  if (Math.abs(d) < 1e-12) return null;
  const t = cross(sub(b1, a1), db) / d;
  return add(a1, scale(da, t));
}

/** Signed angle from direction a to direction b, in (-PI, PI]. */
export function signedAngle(a: Vec, b: Vec) {
  return Math.atan2(cross(a, b), dot(a, b));
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectContains(r: Rect, p: Vec) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function rectFromPoints(a: Vec, b: Vec): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
