import { useState } from 'react';
import type { ReactNode } from 'react';
import { controllerRef } from '../canvas/controller';
import { BADGE_GLYPH } from '../canvas/render';
import {
  angleGeometry,
  dependencyIds,
  dimensionAnchor,
  formatNumber,
  isRound,
  linearAnchors,
  makeDimension,
  measure,
  pos,
} from '../model/doc';
import { add, dist, normalize, perp, polar, scale, sub } from '../model/geometry';
import { CONSTRAINT_LABEL, availableDimensions, availableRelations } from '../model/relations';
import type { ConstraintKind, DimensionKind, Doc, Id, Vec } from '../model/types';
import { ORIGIN_ID } from '../model/types';
import { useStore } from '../store/store';
import type { ToolName } from '../store/store';
import { Icon } from './icons';
import type { IconName } from './icons';
import { ParametersTable } from './ParametersPanel';
import { TOOL_HINTS } from './hints';

const DIMENSION_LABEL: Record<DimensionKind, string> = {
  distance: 'Distance',
  horizontal: 'Horizontal Distance',
  vertical: 'Vertical Distance',
  radius: 'Radius',
  diameter: 'Diameter',
  angle: 'Angle',
};

const TOOL_TITLE: Record<ToolName, string> = {
  select: 'Sketch',
  line: 'Insert Line',
  rect: 'Rectangle',
  circle: 'Circle',
  arc: '3 Point Arc',
  point: 'Point',
  dimension: 'Smart Dimension',
};

const TOOL_ICON: Record<ToolName, IconName> = {
  select: 'select',
  line: 'line',
  rect: 'rect',
  circle: 'circle',
  arc: 'arc',
  point: 'point',
  dimension: 'dimension',
};

const ENTITY_NAME = { point: 'Point', line: 'Line', circle: 'Circle', arc: 'Arc' } as const;

function itemName(doc: Doc, id: Id): string {
  if (id === ORIGIN_ID) return 'Point1@Origin';
  const n = id.replace(/^\D+/, '');
  const e = doc.entities[id];
  if (e) return `${ENTITY_NAME[e.type]}${n}`;
  const c = doc.constraints[id];
  if (c) return `${CONSTRAINT_LABEL[c.kind]}${n}`;
  const d = doc.dimensions[id];
  if (d) return `D${n}`;
  return id;
}

function defaultLabel(doc: Doc, kind: DimensionKind, refs: Id[]): Vec {
  const zoom = controllerRef.current?.view.zoom ?? 1;
  const gap = 32 / zoom;
  const probe = makeDimension({ ...doc }, kind, refs, { x: 0, y: 0 });
  const anchor = dimensionAnchor(doc, probe);
  if (kind === 'radius' || kind === 'diameter') {
    const e = doc.entities[refs[0]];
    return isRound(e) ? polar(anchor, e.r + gap, Math.PI / 4) : anchor;
  }
  if (kind === 'angle') {
    const g = angleGeometry(doc, probe);
    return g ? add(g.vertex, scale(normalize(add(g.d1, g.d2)), gap * 1.5)) : anchor;
  }
  const an = linearAnchors(doc, probe);
  if (!an) return anchor;
  if (kind === 'horizontal') return { x: anchor.x, y: Math.max(an.a.y, an.b.y) + gap };
  if (kind === 'vertical') return { x: Math.max(an.a.x, an.b.x) + gap, y: anchor.y };
  let n = normalize(perp(sub(an.b, an.a)));
  if (n.y < 0 || (n.y === 0 && n.x < 0)) n = scale(n, -1);
  return add(anchor, scale(n, gap));
}

/* ---------- Building blocks ---------- */

function Group({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`pm-group${open ? '' : ' collapsed'}`}>
      <button className="pm-group-header" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{title}</span>
        <span className="pm-chevron">
          <Icon name="chevron" size={14} />
        </span>
      </button>
      {open && <div className="pm-group-body">{children}</div>}
    </section>
  );
}

function Message({ children }: { children: ReactNode }) {
  return (
    <section className="pm-group pm-message">
      <div className="pm-group-header static">
        <span>Message</span>
      </div>
      <div className="pm-group-body">{children}</div>
    </section>
  );
}

function RelGlyph({ kind }: { kind: ConstraintKind }) {
  return <span className="rel-glyph">{BADGE_GLYPH[kind] ?? '◦'}</span>;
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="pm-readout">
      <span className="pm-readout-label">{label}</span>
      <span className="pm-readout-value">{value}</span>
    </div>
  );
}

function Check({ label, checked, onChange, title }: { label: string; checked: boolean; onChange: (on: boolean) => void; title?: string }) {
  return (
    <label className="pm-check" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/* ---------- Panels ---------- */

function SketchStatusMessage() {
  const report = useStore((s) => s.report);
  const ready = useStore((s) => s.solverReady);
  if (!ready) return <p>Loading the sketch solver…</p>;
  if (!report.ok || report.conflicting.length || report.redundant.length)
    return (
      <p>
        <strong className="text-over">Over Defined.</strong> Some relations or dimensions conflict. They are shown in
        red; delete one to resolve the sketch.
      </p>
    );
  if (report.dof === 0)
    return (
      <p>
        <strong>Fully Defined.</strong> Every entity is locked by relations and dimensions.
      </p>
    );
  return (
    <p>
      <strong className="text-under">Under Defined</strong> — {report.dof} degree{report.dof === 1 ? '' : 's'} of
      freedom remaining. Blue entities can still move; add relations or dimensions to lock them.
    </p>
  );
}

function DisplayOptions() {
  const showRelations = useStore((s) => s.showRelations);
  const showGrid = useStore((s) => s.showGrid);
  const gridSnap = useStore((s) => s.gridSnap);
  const { setShowRelations, setShowGrid, setGridSnap } = useStore.getState();
  return (
    <>
      <Check label="Display sketch relations" checked={showRelations} onChange={setShowRelations} />
      <Check label="Display grid" checked={showGrid} onChange={setShowGrid} />
      <Check label="Snap to grid" checked={gridSnap} onChange={setGridSnap} title="G" />
    </>
  );
}

function GlobalVariables() {
  const addParameter = useStore((s) => s.addParameter);
  return (
    <Group title="Global Variables">
      <ParametersTable />
      <button className="pm-button" onClick={addParameter}>
        <Icon name="plus" size={14} /> Add variable
      </button>
    </Group>
  );
}

function ToolPanel({ tool }: { tool: ToolName }) {
  const construction = useStore((s) => s.construction);
  const gridSnap = useStore((s) => s.gridSnap);
  const { setConstruction, setGridSnap } = useStore.getState();
  return (
    <>
      <Message>
        <p>{TOOL_HINTS[tool]}</p>
      </Message>
      {tool !== 'dimension' && (
        <Group title="Options">
          <Check label="For construction" checked={construction} onChange={setConstruction} title="X" />
          <Check label="Snap to grid" checked={gridSnap} onChange={setGridSnap} title="G" />
        </Group>
      )}
      {tool === 'line' && (
        <Group title="Inference">
          <p className="pm-note">
            Lines within 4° of horizontal or vertical get that relation automatically. Hold ⌥ while clicking to skip
            it.
          </p>
        </Group>
      )}
    </>
  );
}

function SketchPanel() {
  const doc = useStore((s) => s.doc);
  const curves = Object.values(doc.entities).filter((e) => e.type !== 'point').length;
  const report = useStore((s) => s.report);
  return (
    <>
      <Message>
        <SketchStatusMessage />
      </Message>
      <Group title="Sketch Information">
        <Readout label="Entities" value={String(curves)} />
        <Readout label="Relations" value={String(Object.keys(doc.constraints).length)} />
        <Readout label="Dimensions" value={String(Object.keys(doc.dimensions).length)} />
        <Readout label="Degrees of freedom" value={report.ok ? String(report.dof) : '—'} />
      </Group>
      <Group title="Display">
        <DisplayOptions />
      </Group>
    </>
  );
}

function DimensionPanel({ id }: { id: Id }) {
  const dim = useStore((s) => s.doc.dimensions[id]);
  const doc = useStore((s) => s.doc);
  const error = useStore((s) => s.evaluation.dimErrors[id]);
  const params = useStore((s) => s.doc.parameters);
  const { setDimensionExpr, setDimensionDriving } = useStore.getState();
  const [draft, setDraft] = useState<string | null>(null);
  if (!dim) return null;
  const unit = dim.kind === 'angle' ? '°' : 'mm';

  return (
    <>
      <Group title="Primary Value">
        <div className="pm-field">
          <span className="pm-field-icon">{dim.kind === 'angle' ? '∠' : dim.kind === 'radius' ? 'R' : dim.kind === 'diameter' ? '⌀' : '↔'}</span>
          <input
            value={dim.driving ? (draft ?? dim.expr) : formatNumber(measure(doc, dim))}
            disabled={!dim.driving}
            spellCheck={false}
            list="parameter-names"
            aria-label="Dimension value"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft !== null && draft !== dim.expr) setDimensionExpr(id, draft);
              setDraft(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setDraft(null);
            }}
          />
          <span className="pm-unit">{unit}</span>
        </div>
        <datalist id="parameter-names">
          {params.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
        {error && <p className="pm-error">{error}</p>}
        <Readout label="Type" value={DIMENSION_LABEL[dim.kind]} />
        <Readout label="Measured" value={`${formatNumber(measure(doc, dim))}${dim.kind === 'angle' ? '°' : ''}`} />
        <p className="pm-note">Type a number or an equation such as <code>width / 2</code> using global variables.</p>
      </Group>
      <Group title="Options">
        <Check
          label="Driven (reference only)"
          checked={!dim.driving}
          onChange={(on) => setDimensionDriving(id, !on)}
        />
      </Group>
    </>
  );
}

function EntityParameters({ doc, id }: { doc: Doc; id: Id }) {
  const e = doc.entities[id];
  const fmt = (n: number) => formatNumber(n, 3);
  if (!e) return null;
  if (e.type === 'point')
    return (
      <Group title="Parameters">
        <Readout label="X" value={fmt(e.x)} />
        <Readout label="Y" value={fmt(e.y)} />
      </Group>
    );
  if (e.type === 'line') {
    const a = pos(doc, e.p1);
    const b = pos(doc, e.p2);
    const d = sub(b, a);
    return (
      <Group title="Parameters">
        <Readout label="Length" value={fmt(dist(a, b))} />
        <Readout label="Angle" value={`${fmt((Math.atan2(d.y, d.x) * 180) / Math.PI)}°`} />
        <Readout label="Start" value={`${fmt(a.x)}, ${fmt(a.y)}`} />
        <Readout label="End" value={`${fmt(b.x)}, ${fmt(b.y)}`} />
      </Group>
    );
  }
  const c = pos(doc, e.c);
  return (
    <Group title="Parameters">
      <Readout label="Center" value={`${fmt(c.x)}, ${fmt(c.y)}`} />
      <Readout label="Radius" value={fmt(e.r)} />
    </Group>
  );
}

function SelectionPanel() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const report = useStore((s) => s.report);
  const { addConstraints, addDimension, deleteSelection, setSelection, setHover, toggleConstructionOfSelection } =
    useStore.getState();

  const entities = selection.filter((id) => doc.entities[id]);
  const relations = availableRelations(doc, selection);
  const dimensions = availableDimensions(doc, selection);
  const single = selection.length === 1 ? selection[0] : null;

  const related = new Set<Id>();
  for (const c of Object.values(doc.constraints)) {
    if (selection.includes(c.id) || entities.some((id) => dependencyIds(doc, c.refs).has(id))) related.add(c.id);
  }
  const flagged = new Set([...report.conflicting, ...report.redundant]);
  const allConstruction = entities.length > 0 && entities.every((id) => doc.entities[id].construction);

  return (
    <>
      <Group title="Selected Entities">
        <ul className="pm-list">
          {selection.map((id) => (
            <li key={id} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}>
              {itemName(doc, id)}
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Existing Relations">
        {related.size === 0 ? (
          <p className="pm-note">No relations.</p>
        ) : (
          <ul className="pm-list">
            {[...related].map((id) => {
              const c = doc.constraints[id];
              return (
                <li
                  key={id}
                  className={`${selection.includes(id) ? 'selected' : ''} ${flagged.has(id) ? 'flagged' : ''}`}
                  onMouseEnter={() => setHover(id)}
                  onMouseLeave={() => setHover(null)}
                >
                  <button className="pm-list-item" onClick={() => setSelection([id])}>
                    <RelGlyph kind={c.kind} />
                    {itemName(doc, id)}
                  </button>
                  <button
                    className="pm-list-delete"
                    aria-label={`Delete ${itemName(doc, id)}`}
                    title="Delete relation"
                    onClick={() =>
                      useStore.getState().commit((d) => {
                        delete d.constraints[id];
                      })
                    }
                  >
                    <Icon name="close" size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {report.ok && !flagged.size && (
          <p className="pm-status-line">
            <span className={report.dof === 0 ? 'dot full' : 'dot under'} />
            {report.dof === 0 ? 'Fully Defined' : 'Under Defined'}
          </p>
        )}
        {flagged.size > 0 && (
          <p className="pm-status-line">
            <span className="dot over" />
            Over Defined
          </p>
        )}
      </Group>

      {relations.length > 0 && (
        <Group title="Add Relations">
          <ul className="pm-list pm-actions">
            {relations.map((r) => (
              <li key={r.kind + r.label}>
                <button
                  className="pm-list-item"
                  title={r.shortcut ? `${r.label} (${r.shortcut})` : r.label}
                  onClick={() => addConstraints(r.kind, r.groups)}
                >
                  <RelGlyph kind={r.kind} />
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        </Group>
      )}

      {dimensions.length > 0 && (
        <Group title="Add Dimensions">
          <ul className="pm-list pm-actions">
            {dimensions.map((d) => (
              <li key={d.kind + d.label}>
                <button
                  className="pm-list-item"
                  onClick={() => {
                    const id = addDimension(d.refs, defaultLabel(doc, d.kind, d.refs), d.kind);
                    if (id) {
                      setSelection([id]);
                      if (useStore.getState().doc.dimensions[id]?.driving) useStore.getState().setEditingDimension(id);
                    }
                  }}
                >
                  <span className="rel-glyph dim">↔</span>
                  {d.label}
                </button>
              </li>
            ))}
          </ul>
        </Group>
      )}

      {single && doc.entities[single] && <EntityParameters doc={doc} id={single} />}

      {(entities.length > 0 || selection.length > 0) && !selection.includes(ORIGIN_ID) && (
        <Group title="Options">
          {entities.length > 0 && (
            <Check label="For construction" checked={allConstruction} onChange={toggleConstructionOfSelection} title="X" />
          )}
          <button className="pm-button" onClick={deleteSelection} title="Delete (⌫)">
            <Icon name="trash" size={14} /> Delete
          </button>
        </Group>
      )}
    </>
  );
}

/* ---------- PropertyManager ---------- */

export function PropertyManager() {
  const tool = useStore((s) => s.tool);
  const selection = useStore((s) => s.selection);
  const doc = useStore((s) => s.doc);
  const { setTool, setSelection } = useStore.getState();

  const single = selection.length === 1 ? selection[0] : null;
  const singleDimension = single && doc.dimensions[single] ? single : null;

  let title: string;
  let icon: IconName;
  let body: ReactNode;
  let showActions = true;
  const close = () => {
    if (tool !== 'select') {
      controllerRef.current?.cancel();
      setTool('select');
    }
    setSelection([]);
  };

  if (tool !== 'select') {
    title = TOOL_TITLE[tool];
    icon = TOOL_ICON[tool];
    body = <ToolPanel tool={tool} />;
  } else if (singleDimension) {
    title = 'Dimension';
    icon = 'dimension';
    body = <DimensionPanel key={singleDimension} id={singleDimension} />;
  } else if (selection.length > 0) {
    const e = single ? doc.entities[single] : undefined;
    title = e ? `${ENTITY_NAME[e.type]} Properties` : 'Properties';
    icon = e?.type === 'line' ? 'line' : e?.type === 'point' ? 'point' : e ? 'circle' : 'relations';
    body = <SelectionPanel />;
  } else {
    title = 'Sketch';
    icon = 'rect';
    showActions = false;
    body = <SketchPanel />;
  }

  return (
    <aside className="pm" aria-label="PropertyManager">
      <div className="pm-tabstrip">
        <span className="pm-tab active" title="PropertyManager">
          <Icon name="pin" size={14} />
        </span>
      </div>
      <div className="pm-header">
        <Icon name={icon} size={20} />
        <span className="pm-title">{title}</span>
        <span className="pm-help">?</span>
      </div>
      {showActions && (
        <div className="pm-actions-row">
          <button className="pm-ok" title="OK" aria-label="OK" onClick={close}>
            <Icon name="check" size={18} />
          </button>
          <button className="pm-cancel" title="Cancel" aria-label="Cancel" onClick={close}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      <div className="pm-body">
        {body}
        <GlobalVariables />
      </div>
    </aside>
  );
}
