import {
  addArc,
  addCircle,
  addConstraint,
  addLine,
  addPoint,
  dimensionAnchor,
  entityPointIds,
  inferDimensionKind,
  isRound,
  makeDimension,
  pos,
} from '../model/doc';
import { arcThrough, dist, sub } from '../model/geometry';
import { availableRelations } from '../model/relations';
import type { DimensionKind, Doc, Id, Vec } from '../model/types';
import { ORIGIN_ID } from '../model/types';
import type { DragTarget } from '../solver/solver';
import { useStore } from '../store/store';
import type { ToolName } from '../store/store';
import { exportSvgFile, openDocument, saveDocument } from '../io/file';
import { entitiesInBox, hitEntity, hitTest, snapAt } from './hit';
import type { Snap } from './hit';
import { emptyPreview } from './render';
import type { Preview } from './render';
import { toWorld, zoomAt, fitView } from './view';
import type { View } from './view';

const store = () => useStore.getState();
const DRAG_THRESHOLD = 3;
const INFERENCE_ANGLE = (4 * Math.PI) / 180;

type Gesture =
  | { kind: 'pan'; start: Vec; panX: number; panY: number }
  | { kind: 'box'; start: Vec; additive: boolean }
  | { kind: 'pending'; start: Vec; hitId: Id; hitKind: 'entity' | 'dimension' }
  | { kind: 'drag'; startWorld: Vec; build: (delta: Vec, world: Vec) => DragTarget[] }
  | { kind: 'label'; id: Id; grab: Vec };

/** Creates or reuses a sketch point for a snap, adding the relation the snap implies. */
function resolvePoint(doc: Doc, snap: Snap, construction: boolean): Id {
  if (snap.kind === 'point' && doc.entities[snap.id]) return snap.id;
  const id = addPoint(doc, snap.pos.x, snap.pos.y, construction);
  if (snap.kind === 'curve' && doc.entities[snap.id]) addConstraint(doc, 'pointOnObject', [id, snap.id]);
  if (snap.kind === 'midpoint' && doc.entities[snap.id]) addConstraint(doc, 'midpoint', [id, snap.id]);
  return id;
}

/** Tries with inferred relations first, and falls back to plain geometry if they over-define. */
function commitWithFallback(build: (doc: Doc, withRelations: boolean) => void | false) {
  const { commit } = store();
  return commit((d) => build(d, true), { strict: true }) || commit((d) => build(d, false));
}

export const controllerRef: { current: ToolController | null } = { current: null };

export class ToolController {
  view: View;
  preview: Preview = emptyPreview();
  private gesture: Gesture | null = null;
  private spaceDown = false;
  private lastScreen: Vec = { x: 0, y: 0 };

  // In-progress tool state
  private chainStart: Snap | null = null;
  private corner: Snap | null = null;
  private center: Snap | null = null;
  private arcPoints: Snap[] = [];
  private picks: Id[] = [];

  private redraw: () => void;
  private onViewChange: (view: View) => void;

  constructor(view: View, redraw: () => void, onViewChange: (view: View) => void) {
    this.view = view;
    this.redraw = redraw;
    this.onViewChange = onViewChange;
  }

  setView(view: View) {
    this.view = view;
    this.onViewChange(view);
    this.redraw();
  }

  resize(width: number, height: number) {
    const first = this.view.width === 0;
    this.view = { ...this.view, width, height };
    if (first) this.view = { ...this.view, panX: width / 2, panY: height / 2 };
    this.onViewChange(this.view);
    this.redraw();
  }

  get busy() {
    return !!(this.chainStart || this.corner || this.center || this.arcPoints.length || this.picks.length);
  }

  cancel() {
    this.chainStart = null;
    this.corner = null;
    this.center = null;
    this.arcPoints = [];
    this.picks = [];
    this.gesture = null;
    this.preview = emptyPreview();
    this.redraw();
  }

  get cursorStyle(): string {
    if (this.gesture?.kind === 'pan' || this.spaceDown) return 'grab';
    const tool = store().tool;
    if (tool === 'select') return store().hover ? 'pointer' : 'default';
    return 'crosshair';
  }

  /* ---------- Pointer input ---------- */

  pointerDown(e: PointerEvent, screen: Vec) {
    this.lastScreen = screen;
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      this.gesture = { kind: 'pan', start: screen, panX: this.view.panX, panY: this.view.panY };
      return;
    }
    if (e.button === 2) {
      this.cancel();
      return;
    }
    if (e.button !== 0) return;
    store().setEditingDimension(null);

    switch (store().tool) {
      case 'select':
        return this.selectDown(e, screen);
      case 'line':
        return this.lineClick(screen);
      case 'rect':
        return this.rectClick(screen);
      case 'circle':
        return this.circleClick(screen);
      case 'arc':
        return this.arcClick(screen);
      case 'point':
        return this.pointClick(screen);
      case 'dimension':
        return this.dimensionClick(screen);
    }
  }

  pointerMove(e: PointerEvent, screen: Vec) {
    this.lastScreen = screen;
    const world = toWorld(this.view, screen);
    store().setCursor(world, this.view.zoom);
    const g = this.gesture;

    if (g?.kind === 'pan') {
      this.setView({ ...this.view, panX: g.panX + screen.x - g.start.x, panY: g.panY + screen.y - g.start.y });
      return;
    }
    if (g?.kind === 'pending' && dist(g.start, screen) > DRAG_THRESHOLD) this.startDrag(g);
    if (this.gesture?.kind === 'drag') {
      const d = this.gesture;
      store().drag(d.build(sub(world, d.startWorld), world));
      return;
    }
    if (g?.kind === 'label') {
      const dim = store().doc.dimensions[g.id];
      if (dim) store().moveDimensionLabel(g.id, sub(sub(world, dimensionAnchor(store().doc, dim)), g.grab));
      return;
    }
    if (g?.kind === 'box') {
      this.preview = { ...emptyPreview(), box: { a: g.start, b: screen } };
      this.redraw();
      return;
    }
    this.updateHoverAndPreview(e, screen);
  }

  pointerUp(e: PointerEvent, screen: Vec) {
    const g = this.gesture;
    this.gesture = null;
    if (!g) return;
    if (g.kind === 'drag' || g.kind === 'label') store().endDrag();
    if (g.kind === 'box') {
      const ids = dist(g.start, screen) > DRAG_THRESHOLD ? entitiesInBox(store().doc, this.view, g.start, screen) : [];
      const sel = g.additive ? [...new Set([...store().selection, ...ids])] : ids;
      store().setSelection(sel);
      this.preview = emptyPreview();
    }
    this.updateHoverAndPreview(e, screen);
  }

  doubleClick(screen: Vec) {
    const tool = store().tool;
    if (tool === 'line') {
      this.cancel();
      return;
    }
    const hit = hitTest(store().doc, this.view, screen);
    if (hit?.kind === 'dimension') {
      store().setSelection([hit.id]);
      store().setEditingDimension(hit.id);
    }
  }

  wheel(e: WheelEvent, screen: Vec) {
    store().setEditingDimension(null);
    if (e.ctrlKey || e.metaKey) {
      this.setView(zoomAt(this.view, screen, Math.exp(-e.deltaY * 0.01)));
    } else {
      this.setView({ ...this.view, panX: this.view.panX - e.deltaX, panY: this.view.panY - e.deltaY });
    }
  }

  /* ---------- Select tool ---------- */

  private selectDown(e: PointerEvent, screen: Vec) {
    const { doc, selection, setSelection, toggleSelection } = store();
    const hit = hitTest(doc, this.view, screen);
    if (!hit) {
      if (!e.shiftKey) setSelection([]);
      this.gesture = { kind: 'box', start: screen, additive: e.shiftKey };
      return;
    }
    if (e.shiftKey) toggleSelection(hit.id);
    else if (!selection.includes(hit.id)) setSelection([hit.id]);
    if (hit.kind === 'entity' || hit.kind === 'dimension') {
      this.gesture = { kind: 'pending', start: screen, hitId: hit.id, hitKind: hit.kind };
    }
  }

  private startDrag(g: Extract<Gesture, { kind: 'pending' }>) {
    const { doc, selection, beginDrag } = store();
    const startWorld = toWorld(this.view, g.start);

    if (g.hitKind === 'dimension') {
      const dim = doc.dimensions[g.hitId];
      beginDrag();
      this.gesture = { kind: 'label', id: g.hitId, grab: sub(sub(startWorld, dimensionAnchor(doc, dim)), dim.label) };
      return;
    }

    const grabbed = doc.entities[g.hitId];
    const others = selection.filter((id) => id !== g.hitId && doc.entities[id]);
    beginDrag();

    if (isRound(grabbed) && others.length === 0) {
      const id = grabbed.id;
      const c = pos(doc, grabbed.c);
      this.gesture = {
        kind: 'drag',
        startWorld,
        build: (_delta, world) => [{ kind: 'radius', id, r: Math.max(dist(world, c), 1e-3) }],
      };
      return;
    }

    const pointIds = new Set<Id>();
    for (const id of [g.hitId, ...others]) entityPointIds(doc.entities[id]).forEach((p) => pointIds.add(p));
    pointIds.delete(ORIGIN_ID);
    const starts = [...pointIds].map((id) => ({ id, p: pos(doc, id) }));
    this.gesture = {
      kind: 'drag',
      startWorld,
      build: (delta) => starts.map(({ id, p }) => ({ kind: 'point', id, x: p.x + delta.x, y: p.y + delta.y })),
    };
  }

  /* ---------- Hover + previews ---------- */

  private snap(screen: Vec, exclude?: Set<Id>) {
    return snapAt(store().doc, this.view, screen, { exclude, grid: store().gridSnap });
  }

  private updateHoverAndPreview(e: PointerEvent | null, screen: Vec) {
    const { doc, tool, setHover } = store();
    const preview = emptyPreview();
    const world = toWorld(this.view, screen);

    if (tool === 'select') {
      setHover(hitTest(doc, this.view, screen)?.id ?? null);
    } else if (tool === 'dimension') {
      const hit = hitEntity(doc, this.view, screen);
      setHover(hit);
      preview.picks = [...this.picks];
      if (!hit && this.picks.length) {
        const kind = this.dimensionKindAt(this.picks, world);
        if (kind) preview.dimension = makeDimension({ ...doc }, kind, this.picks, world);
      }
    } else {
      setHover(null);
      const snap = this.snap(screen);
      preview.snap = snap;
      let p = snap.pos;

      if (tool === 'line' && this.chainStart) {
        const inf = snap.kind === 'free' && !e?.altKey ? this.infer(this.chainStart.pos, p) : null;
        if (inf) {
          p = inf.pos;
          preview.inference = { kind: inf.kind, at: p };
        }
        preview.lines.push([this.chainStart.pos, p]);
      }
      if (tool === 'rect' && this.corner) {
        const a = this.corner.pos;
        const c1 = { x: p.x, y: a.y };
        const c3 = { x: a.x, y: p.y };
        preview.lines.push([a, c1], [c1, p], [p, c3], [c3, a]);
      }
      if (tool === 'circle' && this.center) {
        preview.circles.push({ c: this.center.pos, r: dist(this.center.pos, p) });
        preview.lines.push([this.center.pos, p]);
      }
      if (tool === 'arc') {
        if (this.arcPoints.length === 1) preview.lines.push([this.arcPoints[0].pos, p]);
        if (this.arcPoints.length === 2) {
          const fit = arcThrough(this.arcPoints[0].pos, this.arcPoints[1].pos, p);
          if (fit) preview.arcs.push({ c: fit.center, r: fit.r, a0: fit.a0, a1: fit.a1 });
          else preview.lines.push([this.arcPoints[0].pos, this.arcPoints[1].pos]);
        }
        preview.points.push(...this.arcPoints.map((s) => s.pos));
      }
    }
    this.preview = preview;
    this.redraw();
  }

  private infer(from: Vec, to: Vec): { kind: 'horizontal' | 'vertical'; pos: Vec } | null {
    const d = sub(to, from);
    if (Math.hypot(d.x, d.y) * this.view.zoom < 12) return null;
    const angle = Math.atan2(Math.abs(d.y), Math.abs(d.x));
    if (angle < INFERENCE_ANGLE) return { kind: 'horizontal', pos: { x: to.x, y: from.y } };
    if (Math.PI / 2 - angle < INFERENCE_ANGLE) return { kind: 'vertical', pos: { x: from.x, y: to.y } };
    return null;
  }

  /* ---------- Sketch tools ---------- */

  private lineClick(screen: Vec) {
    const snap = this.snap(screen);
    if (!this.chainStart) {
      this.chainStart = snap;
      this.updateHoverAndPreview(null, screen);
      return;
    }
    const start = this.chainStart;
    const inf = snap.kind === 'free' ? this.infer(start.pos, snap.pos) : null;
    const end: Snap = inf ? { kind: 'free', pos: inf.pos } : snap;
    if (dist(start.pos, end.pos) * this.view.zoom < 2) return;

    const { construction } = store();
    let endId: Id | null = null;
    const ok = commitWithFallback((d, withRelations) => {
      const a = resolvePoint(d, start, construction);
      const b = resolvePoint(d, end, construction);
      if (a === b) return false;
      const line = addLine(d, a, b, construction);
      if (withRelations && inf) addConstraint(d, inf.kind, [line]);
      endId = b;
    });
    if (!ok || !endId) return;
    const closed = snap.kind === 'point';
    this.chainStart = closed ? null : { kind: 'point', id: endId, pos: pos(store().doc, endId) };
    this.updateHoverAndPreview(null, screen);
  }

  private rectClick(screen: Vec) {
    const snap = this.snap(screen);
    if (!this.corner) {
      this.corner = snap;
      return;
    }
    const a = this.corner;
    const c = snap;
    if (Math.abs(a.pos.x - c.pos.x) * this.view.zoom < 2 || Math.abs(a.pos.y - c.pos.y) * this.view.zoom < 2) return;
    const { construction } = store();
    commitWithFallback((d, withRelations) => {
      const p1 = resolvePoint(d, a, construction);
      const p2 = addPoint(d, c.pos.x, a.pos.y, construction);
      const p3 = resolvePoint(d, c, construction);
      const p4 = addPoint(d, a.pos.x, c.pos.y, construction);
      const l1 = addLine(d, p1, p2, construction);
      const l2 = addLine(d, p2, p3, construction);
      const l3 = addLine(d, p3, p4, construction);
      const l4 = addLine(d, p4, p1, construction);
      if (withRelations) {
        addConstraint(d, 'horizontal', [l1]);
        addConstraint(d, 'horizontal', [l3]);
        addConstraint(d, 'vertical', [l2]);
        addConstraint(d, 'vertical', [l4]);
      }
    });
    this.corner = null;
    this.updateHoverAndPreview(null, screen);
  }

  private circleClick(screen: Vec) {
    const snap = this.snap(screen);
    if (!this.center) {
      this.center = snap;
      return;
    }
    const center = this.center;
    const r = dist(center.pos, snap.pos);
    if (r * this.view.zoom < 2) return;
    const { construction } = store();
    commitWithFallback((d, withRelations) => {
      const c = resolvePoint(d, center, construction);
      const circle = addCircle(d, c, r, construction);
      if (withRelations && snap.kind === 'point') addConstraint(d, 'pointOnObject', [snap.id, circle]);
    });
    this.center = null;
    this.updateHoverAndPreview(null, screen);
  }

  private arcClick(screen: Vec) {
    const snap = this.snap(screen);
    if (this.arcPoints.length < 2) {
      if (this.arcPoints.length === 1 && dist(this.arcPoints[0].pos, snap.pos) * this.view.zoom < 2) return;
      this.arcPoints.push(snap);
      this.updateHoverAndPreview(null, screen);
      return;
    }
    const [s, e] = this.arcPoints;
    const fit = arcThrough(s.pos, e.pos, snap.pos);
    if (!fit) return;
    const { construction } = store();
    commitWithFallback((d) => {
      const a = resolvePoint(d, s, construction);
      const b = resolvePoint(d, e, construction);
      if (a === b) return false;
      const c = addPoint(d, fit.center.x, fit.center.y, construction);
      const [start, end] = fit.reversed ? [b, a] : [a, b];
      addArc(d, c, start, end, fit.r, fit.a0, fit.a1, construction);
    });
    this.arcPoints = [];
    this.updateHoverAndPreview(null, screen);
  }

  private pointClick(screen: Vec) {
    const snap = this.snap(screen);
    if (snap.kind === 'point') return;
    const { construction } = store();
    commitWithFallback((d) => void resolvePoint(d, snap, construction));
  }

  /* ---------- Dimension tool ---------- */

  private dimensionKindAt(refs: Id[], world: Vec): DimensionKind | null {
    const doc = store().doc;
    const kind = inferDimensionKind(doc, refs);
    if (kind !== 'distance') return kind;
    const [e0, e1] = refs.map((r) => doc.entities[r]);
    let a: Vec | null = null;
    let b: Vec | null = null;
    if (e0?.type === 'line' && !e1) [a, b] = [pos(doc, e0.p1), pos(doc, e0.p2)];
    if (e0?.type === 'point' && e1?.type === 'point') [a, b] = [pos(doc, e0.id), pos(doc, e1.id)];
    if (!a || !b) return kind;
    const eps = 1e-6;
    if (Math.abs(a.x - b.x) < eps || Math.abs(a.y - b.y) < eps) return kind;
    // Like a CAD "smart dimension": above/below the span measures horizontally,
    // left/right of it measures vertically, anywhere else measures the true length.
    const inX = world.x > Math.min(a.x, b.x) && world.x < Math.max(a.x, b.x);
    const inY = world.y > Math.min(a.y, b.y) && world.y < Math.max(a.y, b.y);
    if (inX && !inY) return 'horizontal';
    if (inY && !inX) return 'vertical';
    return kind;
  }

  private dimensionClick(screen: Vec) {
    const { doc } = store();
    const label = hitTest(doc, this.view, screen);
    if (label?.kind === 'dimension' && this.picks.length === 0) {
      store().setSelection([label.id]);
      store().setEditingDimension(label.id);
      return;
    }
    const hit = hitEntity(doc, this.view, screen);
    if (hit) {
      if (this.picks.includes(hit)) this.picks = this.picks.filter((p) => p !== hit);
      else this.picks = [...this.picks, hit].slice(-2);
      this.updateHoverAndPreview(null, screen);
      return;
    }
    if (this.picks.length === 0) return;
    const world = toWorld(this.view, screen);
    const kind = this.dimensionKindAt(this.picks, world);
    const id = store().addDimension(this.picks, world, kind ?? undefined);
    this.picks = [];
    this.updateHoverAndPreview(null, screen);
    if (id && store().doc.dimensions[id]?.driving) {
      store().setSelection([id]);
      store().setEditingDimension(id);
    }
  }

  /* ---------- Keyboard ---------- */

  keyDown(e: KeyboardEvent): boolean {
    const s = store();
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    if (mod) {
      if (key === 'z') {
        if (e.shiftKey) s.redo();
        else s.undo();
        this.cancel();
        return true;
      }
      if (key === 'y') {
        s.redo();
        return true;
      }
      if (key === 's') {
        saveDocument();
        return true;
      }
      if (key === 'o') {
        openDocument();
        return true;
      }
      if (key === 'e') {
        exportSvgFile();
        return true;
      }
      if (key === 'a') {
        s.setSelection(Object.keys(s.doc.entities).filter((id) => id !== ORIGIN_ID));
        return true;
      }
      return false;
    }
    if (e.altKey) return false;

    if (key === ' ') {
      this.spaceDown = true;
      return true;
    }
    if (key === 'escape') {
      if (this.busy) this.cancel();
      else {
        s.setTool('select');
        s.setSelection([]);
      }
      return true;
    }
    if (key === 'enter' && store().tool === 'line') {
      this.cancel();
      return true;
    }
    if (key === 'delete' || key === 'backspace') {
      s.deleteSelection();
      return true;
    }

    const tools: Record<string, ToolName> = {
      s: 'select',
      l: 'line',
      r: 'rect',
      c: 'circle',
      a: 'arc',
      p: 'point',
      d: 'dimension',
    };
    if (tools[key]) {
      this.cancel();
      s.setTool(tools[key]);
      return true;
    }
    if (key === 'x') {
      if (s.selection.length) s.toggleConstructionOfSelection();
      else s.setConstruction(!s.construction);
      return true;
    }
    if (key === 'g') {
      s.setGridSnap(!s.gridSnap);
      return true;
    }
    if (key === 'f') {
      this.fit();
      return true;
    }
    const shortcut = availableRelations(s.doc, s.selection).find((r) => r.shortcut?.toLowerCase() === key);
    if (shortcut) {
      s.addConstraints(shortcut.kind, shortcut.groups);
      return true;
    }
    return false;
  }

  keyUp(e: KeyboardEvent) {
    if (e.key === ' ') this.spaceDown = false;
  }

  fit() {
    const doc = store().doc;
    let min = { x: Infinity, y: Infinity };
    let max = { x: -Infinity, y: -Infinity };
    const grow = (p: Vec, r = 0) => {
      min = { x: Math.min(min.x, p.x - r), y: Math.min(min.y, p.y - r) };
      max = { x: Math.max(max.x, p.x + r), y: Math.max(max.y, p.y + r) };
    };
    for (const e of Object.values(doc.entities)) {
      if (e.type === 'point') grow(e);
      else if (isRound(e)) grow(pos(doc, e.c), e.r);
    }
    if (!Number.isFinite(min.x) || (max.x - min.x < 1e-6 && max.y - min.y < 1e-6)) {
      this.setView({ ...this.view, zoom: 1, panX: this.view.width / 2, panY: this.view.height / 2 });
      return;
    }
    this.setView(fitView(this.view, min, max));
  }

  refreshPreview() {
    this.updateHoverAndPreview(null, this.lastScreen);
  }
}
