import { create } from 'zustand';
import {
  addConstraint,
  createDoc,
  deleteItems,
  evaluateDoc,
  formatNumber,
  inferDimensionKind,
  makeDimension,
  measure,
  newId,
} from '../model/doc';
import type { Evaluation } from '../model/doc';
import { IDENTIFIER, isReservedName, renameInExpression } from '../model/expr';
import type { ConstraintKind, DimensionKind, Doc, Id, Vec } from '../model/types';
import { analyzeFreedom, emptyReport, initSolver, solveDoc } from '../solver/solver';
import type { DragTarget, SolveReport } from '../solver/solver';

export type ToolName = 'select' | 'line' | 'rect' | 'circle' | 'arc' | 'point' | 'dimension';

export interface Toast {
  text: string;
  kind: 'info' | 'error';
  at: number;
}

interface CommitOptions {
  /** Refuse the change if it leaves the sketch over-defined or unsolvable. */
  strict?: boolean;
  /** Message shown when a strict commit is refused. */
  rejectMessage?: string;
}

interface State {
  doc: Doc;
  past: Doc[];
  future: Doc[];
  report: SolveReport;
  evaluation: Evaluation;
  selection: Id[];
  hover: Id | null;
  tool: ToolName;
  construction: boolean;
  gridSnap: boolean;
  editingDimension: Id | null;
  toast: Toast | null;
  solverReady: boolean;
  cursor: Vec;
  zoom: number;

  init(): Promise<void>;
  commit(mutate: (doc: Doc) => void | false, opts?: CommitOptions): boolean;
  undo(): void;
  redo(): void;
  newDocument(): void;
  loadDocument(doc: Doc): void;
  renameDocument(name: string): void;

  beginDrag(): void;
  drag(targets: DragTarget[]): void;
  moveDimensionLabel(id: Id, label: Vec): void;
  endDrag(): void;

  setTool(tool: ToolName): void;
  setSelection(ids: Id[]): void;
  toggleSelection(id: Id): void;
  setHover(id: Id | null): void;
  setCursor(p: Vec, zoom: number): void;
  setConstruction(on: boolean): void;
  setGridSnap(on: boolean): void;
  notify(text: string, kind?: Toast['kind']): void;

  addConstraints(kind: ConstraintKind, groups: Id[][]): boolean;
  addDimension(refs: Id[], labelWorld: Vec, kind?: DimensionKind): Id | null;
  setDimensionExpr(id: Id, expr: string): boolean;
  setDimensionDriving(id: Id, driving: boolean): boolean;
  setEditingDimension(id: Id | null): void;
  deleteSelection(): void;
  toggleConstructionOfSelection(): void;

  addParameter(): void;
  updateParameter(id: Id, patch: { name?: string; expr?: string }): string | null;
  removeParameter(id: Id): void;
}

const STORAGE_KEY = 'parametric-vector.doc';
const HISTORY_LIMIT = 200;

let dragOrigin: Doc | null = null;
let freedomTimer: ReturnType<typeof setTimeout> | undefined;

function loadStoredDoc(): Doc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const doc = JSON.parse(raw) as Doc;
      if (doc.version === 1 && doc.entities) return doc;
    }
  } catch {
    /* fall through to a fresh document */
  }
  return createDoc();
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persist(doc: Doc) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(doc)), 300);
}

const clone = (doc: Doc): Doc => structuredClone(doc);

const isOverDefined = (r: SolveReport) => !r.ok || r.conflicting.length > 0 || r.redundant.length > 0;

export const useStore = create<State>()((set, get) => {
  /** Recomputes which geometry is still free, off the interaction path. */
  const scheduleFreedom = () => {
    clearTimeout(freedomTimer);
    freedomTimer = setTimeout(() => {
      const { doc, report, evaluation } = get();
      const probe = clone(doc);
      const underDefined = analyzeFreedom(probe, report, evaluation);
      if (get().doc === doc) set({ report: { ...report, underDefined } });
    }, 60);
  };

  const applyDoc = (doc: Doc, report: SolveReport, evaluation: Evaluation) => {
    const prev = get().report;
    set({ doc, report: { ...report, underDefined: prev.underDefined }, evaluation });
    persist(doc);
    scheduleFreedom();
  };

  const resolveAndApply = (doc: Doc) => {
    const evaluation = evaluateDoc(doc);
    const report = solveDoc(doc, [], evaluation);
    applyDoc(doc, report, evaluation);
  };

  const pruneSelection = (doc: Doc, ids: Id[]) =>
    ids.filter((id) => doc.entities[id] || doc.constraints[id] || doc.dimensions[id]);

  return {
    doc: loadStoredDoc(),
    past: [],
    future: [],
    report: emptyReport(),
    evaluation: { params: {}, paramErrors: {}, dims: {}, dimErrors: {} },
    selection: [],
    hover: null,
    tool: 'select',
    construction: false,
    gridSnap: false,
    editingDimension: null,
    toast: null,
    solverReady: false,
    cursor: { x: 0, y: 0 },
    zoom: 1,

    async init() {
      await initSolver();
      set({ solverReady: true });
      resolveAndApply(clone(get().doc));
    },

    commit(mutate, opts = {}) {
      const next = clone(get().doc);
      if (mutate(next) === false) return false;
      const evaluation = evaluateDoc(next);
      const report = solveDoc(next, [], evaluation);
      if (opts.strict && isOverDefined(report) && !isOverDefined(get().report)) {
        get().notify(opts.rejectMessage ?? 'That change would over-define the sketch.', 'error');
        return false;
      }
      const past = [...get().past, get().doc].slice(-HISTORY_LIMIT);
      set({ past, future: [], selection: pruneSelection(next, get().selection) });
      applyDoc(next, report, evaluation);
      return true;
    },

    undo() {
      const { past, future, doc } = get();
      const prev = past.at(-1);
      if (!prev) return;
      set({ past: past.slice(0, -1), future: [doc, ...future], selection: pruneSelection(prev, get().selection) });
      resolveAndApply(clone(prev));
    },

    redo() {
      const { past, future, doc } = get();
      const next = future[0];
      if (!next) return;
      set({ past: [...past, doc], future: future.slice(1), selection: pruneSelection(next, get().selection) });
      resolveAndApply(clone(next));
    },

    newDocument() {
      set({ past: [...get().past, get().doc], future: [], selection: [] });
      resolveAndApply(createDoc());
    },

    loadDocument(doc) {
      set({ past: [...get().past, get().doc], future: [], selection: [] });
      resolveAndApply(clone(doc));
    },

    renameDocument(name) {
      get().commit((d) => {
        d.name = name;
      });
    },

    beginDrag() {
      dragOrigin = get().doc;
    },

    drag(targets) {
      const next = clone(get().doc);
      const report = solveDoc(next, targets, get().evaluation);
      if (report.ok) set({ doc: next, report: { ...report, underDefined: get().report.underDefined } });
    },

    moveDimensionLabel(id, label) {
      const next = clone(get().doc);
      const d = next.dimensions[id];
      if (!d) return;
      d.label = label;
      set({ doc: next });
    },

    endDrag() {
      const origin = dragOrigin;
      dragOrigin = null;
      if (!origin || origin === get().doc) return;
      set({ past: [...get().past, origin].slice(-HISTORY_LIMIT), future: [] });
      resolveAndApply(clone(get().doc));
    },

    setTool(tool) {
      set({ tool, editingDimension: null });
    },
    setSelection(ids) {
      set({ selection: ids });
    },
    toggleSelection(id) {
      const sel = get().selection;
      set({ selection: sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id] });
    },
    setHover(id) {
      if (get().hover !== id) set({ hover: id });
    },
    setCursor(p, zoom) {
      set({ cursor: p, zoom });
    },
    setConstruction(on) {
      set({ construction: on });
    },
    setGridSnap(on) {
      set({ gridSnap: on });
    },
    notify(text, kind = 'info') {
      set({ toast: { text, kind, at: Date.now() } });
    },

    addConstraints(kind, groups) {
      return get().commit((d) => groups.forEach((refs) => addConstraint(d, kind, refs)), {
        strict: true,
        rejectMessage: 'That relation conflicts with existing ones, or is already implied by them.',
      });
    },

    addDimension(refs, labelWorld, kind) {
      const doc = get().doc;
      const k = kind ?? inferDimensionKind(doc, refs);
      if (!k) {
        get().notify('Pick a line, circle, arc, two points, a point and a line, or two lines.', 'error');
        return null;
      }
      let id: Id | null = null;
      const added = get().commit(
        (d) => {
          const dim = makeDimension(d, k, refs, labelWorld);
          d.dimensions[dim.id] = dim;
          id = dim.id;
        },
        { strict: true },
      );
      if (added) return id;
      // Same as a CAD sketcher: an over-defining dimension becomes a driven (reference) one.
      get().commit((d) => {
        const dim = makeDimension(d, k, refs, labelWorld);
        dim.driving = false;
        d.dimensions[dim.id] = dim;
        id = dim.id;
      });
      get().notify('That dimension would over-define the sketch, so it was added as a driven (reference) dimension.');
      return id;
    },

    setDimensionExpr(id, expr) {
      const trimmed = expr.trim();
      if (!trimmed) return false;
      const probe = clone(get().doc);
      if (!probe.dimensions[id]) return false;
      probe.dimensions[id].expr = trimmed;
      const err = evaluateDoc(probe).dimErrors[id];
      if (err) {
        get().notify(err, 'error');
        return false;
      }
      return get().commit(
        (d) => {
          d.dimensions[id].expr = trimmed;
        },
        { strict: true, rejectMessage: 'The sketch can’t be solved with that value.' },
      );
    },

    setDimensionDriving(id, driving) {
      return get().commit(
        (d) => {
          const dim = d.dimensions[id];
          dim.driving = driving;
          // Start from the measured value so the geometry doesn't jump.
          if (driving) dim.expr = formatNumber(measure(d, dim));
        },
        { strict: driving, rejectMessage: 'Making this dimension driving would over-define the sketch.' },
      );
    },

    setEditingDimension(id) {
      set({ editingDimension: id });
    },

    deleteSelection() {
      const sel = get().selection;
      if (sel.length === 0) return;
      get().commit((d) => deleteItems(d, sel));
      set({ selection: [] });
    },

    toggleConstructionOfSelection() {
      const sel = get().selection.filter((id) => get().doc.entities[id]);
      if (sel.length === 0) return;
      const turnOn = sel.some((id) => !get().doc.entities[id].construction);
      get().commit((d) => {
        for (const id of sel) {
          const e = d.entities[id];
          if (e.type === 'point' && e.locked) continue;
          if (turnOn) e.construction = true;
          else delete e.construction;
        }
      });
    },

    addParameter() {
      get().commit((d) => {
        const names = new Set(d.parameters.map((p) => p.name));
        let n = d.parameters.length + 1;
        while (names.has(`p${n}`)) n++;
        d.parameters.push({ id: newId(d, 'v'), name: `p${n}`, expr: '10' });
      });
    },

    updateParameter(id, patch) {
      const doc = get().doc;
      const current = doc.parameters.find((p) => p.id === id);
      if (!current) return 'Parameter not found';
      if (patch.name !== undefined && patch.name !== current.name) {
        const name = patch.name.trim();
        if (!IDENTIFIER.test(name)) return 'Names start with a letter and use letters, digits or _';
        if (isReservedName(name)) return `"${name}" is a reserved name`;
        if (doc.parameters.some((p) => p.id !== id && p.name === name)) return `"${name}" already exists`;
        patch = { ...patch, name };
      }
      const ok = get().commit(
        (d) => {
          const p = d.parameters.find((q) => q.id === id)!;
          if (patch.name !== undefined && patch.name !== p.name) {
            for (const q of d.parameters) q.expr = renameInExpression(q.expr, p.name, patch.name);
            for (const dim of Object.values(d.dimensions)) dim.expr = renameInExpression(dim.expr, p.name, patch.name);
            p.name = patch.name;
          }
          if (patch.expr !== undefined) p.expr = patch.expr.trim();
        },
        { strict: true, rejectMessage: 'The sketch can’t be solved with that value.' },
      );
      return ok ? null : 'Rejected: the sketch can’t be solved with that value';
    },

    removeParameter(id) {
      get().commit((d) => {
        d.parameters = d.parameters.filter((p) => p.id !== id);
      });
    },
  };
});