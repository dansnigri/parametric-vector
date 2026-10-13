import { useState } from 'react';
import type { ReactNode } from 'react';
import { controllerRef } from '../canvas/controller';
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
import type { DimensionKind, Doc, Id, Vec } from '../model/types';
import { ORIGIN_ID } from '../model/types';
import { useStore } from '../store/store';
import { Icon } from './icons';

const DIMENSION_LABEL: Record<DimensionKind, string> = {
  distance: 'Distance',
  horizontal: 'Horizontal distance',
  vertical: 'Vertical distance',
  radius: 'Radius',
  diameter: 'Diameter',
  angle: 'Angle',
};

function itemName(doc: Doc, id: Id): string {
  if (id === ORIGIN_ID) return 'Origin';
  const n = id.replace(/^\D+/, '');
  const e = doc.entities[id];
  if (e) return `${{ point: 'Point', line: 'Line', circle: 'Circle', arc: 'Arc' }[e.type]} ${n}`;
  const c = doc.constraints[id];
  if (c) return CONSTRAINT_LABEL[c.kind];
  const d = doc.dimensions[id];
  if (d) return DIMENSION_LABEL[d.kind];
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="readout">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function EntityProperties({ doc, id }: { doc: Doc; id: Id }) {
  const e = doc.entities[id];
  const fmt = (n: number) => formatNumber(n, 3);
  if (!e) return null;
  if (e.type === 'point')
    return (
      <>
        <Readout label="X" value={fmt(e.x)} />
        <Readout label="Y" value={fmt(e.y)} />
      </>
    );
  if (e.type === 'line') {
    const a = pos(doc, e.p1);
    const b = pos(doc, e.p2);
    const d = sub(b, a);
    return (
      <>
        <Readout label="Length" value={fmt(dist(a, b))} />
        <Readout label="Angle" value={`${fmt((Math.atan2(d.y, d.x) * 180) / Math.PI)}°`} />
      </>
    );
  }
  const c = pos(doc, e.c);
  return (
    <>
      <Readout label="Center" value={`${fmt(c.x)}, ${fmt(c.y)}`} />
      <Readout label="Radius" value={fmt(e.r)} />
    </>
  );
}

function DimensionProperties({ id }: { id: Id }) {
  const dim = useStore((s) => s.doc.dimensions[id]);
  const doc = useStore((s) => s.doc);
  const error = useStore((s) => s.evaluation.dimErrors[id]);
  const params = useStore((s) => s.doc.parameters);
  const { setDimensionExpr, setDimensionDriving } = useStore.getState();
  const [draft, setDraft] = useState<string | null>(null);
  if (!dim) return null;
  const value = draft ?? dim.expr;
  const unit = dim.kind === 'angle' ? '°' : '';

  return (
    <Section title={DIMENSION_LABEL[dim.kind]}>
      <label className="field">
        <span>Value</span>
        <input
          value={dim.driving ? value : formatNumber(measure(doc, dim))}
          disabled={!dim.driving}
          spellCheck={false}
          list="parameter-names"
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
      </label>
      <datalist id="parameter-names">
        {params.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      {error && <p className="error">{error}</p>}
      <Readout label="Measured" value={`${formatNumber(measure(doc, dim))}${unit}`} />
      <label className="checkbox">
        <input type="checkbox" checked={!dim.driving} onChange={(e) => setDimensionDriving(id, !e.target.checked)} />
        Driven (reference only)
      </label>
      <p className="hint">Use numbers or expressions like <code>width / 2</code> with names from Parameters.</p>
    </Section>
  );
}

export function Inspector() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const report = useStore((s) => s.report);
  const { addConstraints, addDimension, deleteSelection, setSelection, setHover, toggleConstructionOfSelection } =
    useStore.getState();

  if (selection.length === 0) return <SketchSummary />;

  const entities = selection.filter((id) => doc.entities[id]);
  const relations = availableRelations(doc, selection);
  const dimensions = availableDimensions(doc, selection);
  const single = selection.length === 1 ? selection[0] : null;

  // Relations touching the selection.
  const related = new Set<Id>();
  for (const c of Object.values(doc.constraints)) {
    if (selection.includes(c.id) || entities.some((id) => dependencyIds(doc, c.refs).has(id))) related.add(c.id);
  }
  for (const d of Object.values(doc.dimensions)) {
    if (selection.includes(d.id) || entities.some((id) => dependencyIds(doc, d.refs).has(id))) related.add(d.id);
  }
  const flagged = new Set([...report.conflicting, ...report.redundant]);
  const allConstruction = entities.length > 0 && entities.every((id) => doc.entities[id].construction);

  const singleDimension = single && doc.dimensions[single] ? single : null;
  const singleConstraint = single ? doc.constraints[single] : undefined;

  return (
    <div className="inspector">
      {singleDimension && <DimensionProperties key={singleDimension} id={singleDimension} />}
      <Section title={singleDimension ? 'Dimension' : single ? itemName(doc, single) : `${selection.length} selected`}>
        {single && doc.entities[single] && <EntityProperties doc={doc} id={single} />}
        {singleConstraint && (
          <p className="hint">Between {singleConstraint.refs.map((r) => itemName(doc, r)).join(', ')}</p>
        )}
        {!single && (
          <div className="chips">
            {selection.map((id) => (
              <span key={id} className="chip">
                {itemName(doc, id)}
              </span>
            ))}
          </div>
        )}
        <div className="row-buttons">
          {entities.length > 0 && !entities.includes(ORIGIN_ID) && (
            <button className="small-button" onClick={toggleConstructionOfSelection} title="Toggle construction (X)">
              {allConstruction ? 'Make regular' : 'Make construction'}
            </button>
          )}
          {!(single === ORIGIN_ID) && (
            <button className="small-button danger" onClick={deleteSelection} title="Delete (⌫)">
              <Icon name="trash" size={14} /> Delete
            </button>
          )}
        </div>
      </Section>

      {relations.length > 0 && (
        <Section title="Add relation">
          <div className="grid-buttons">
            {relations.map((r) => (
              <button
                key={r.kind + r.label}
                className="small-button"
                title={r.shortcut ? `${r.label} (${r.shortcut})` : r.label}
                onClick={() => addConstraints(r.kind, r.groups)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </Section>
      )}

      {dimensions.length > 0 && (
        <Section title="Add dimension">
          <div className="grid-buttons">
            {dimensions.map((d) => (
              <button
                key={d.kind + d.label}
                className="small-button"
                onClick={() => {
                  const id = addDimension(d.refs, defaultLabel(doc, d.kind, d.refs), d.kind);
                  if (id) {
                    setSelection([id]);
                    if (useStore.getState().doc.dimensions[id]?.driving) useStore.getState().setEditingDimension(id);
                  }
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </Section>
      )}

      {related.size > 0 && entities.length > 0 && (
        <Section title="Relations & dimensions">
          <ul className="relation-list">
            {[...related].map((id) => (
              <li
                key={id}
                className={`${selection.includes(id) ? 'selected' : ''} ${flagged.has(id) ? 'flagged' : ''}`}
                onMouseEnter={() => setHover(id)}
                onMouseLeave={() => setHover(null)}
              >
                <button className="link-button" onClick={() => setSelection([id])}>
                  {itemName(doc, id)}
                  {doc.dimensions[id] && (
                    <span className="muted">
                      {' '}
                      {formatNumber(measure(doc, doc.dimensions[id]))}
                      {doc.dimensions[id].driving ? '' : ' (driven)'}
                    </span>
                  )}
                  {doc.constraints[id] && (
                    <span className="muted"> · {doc.constraints[id].refs.map((r) => itemName(doc, r)).join(', ')}</span>
                  )}
                </button>
                <button
                  className="icon-button tiny"
                  aria-label={`Delete ${itemName(doc, id)}`}
                  title="Delete"
                  onClick={() => useStore.getState().commit((d) => {
                    delete d.constraints[id];
                    delete d.dimensions[id];
                  })}
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function SketchSummary() {
  const doc = useStore((s) => s.doc);
  const report = useStore((s) => s.report);
  const curves = Object.values(doc.entities).filter((e) => e.type !== 'point').length;
  return (
    <div className="inspector">
      <Section title="Sketch">
        <Readout label="Curves" value={String(curves)} />
        <Readout label="Relations" value={String(Object.keys(doc.constraints).length)} />
        <Readout label="Dimensions" value={String(Object.keys(doc.dimensions).length)} />
        <Readout label="Degrees of freedom" value={report.ok ? String(report.dof) : '—'} />
      </Section>
      <Section title="How it works">
        <ul className="tips">
          <li>Draw with the tools on the left. Snapping to points, midpoints and curves adds relations automatically.</li>
          <li>Select geometry to add relations (horizontal, parallel, tangent…) or dimensions.</li>
          <li>
            <span className="swatch under" /> Blue can still move, <span className="swatch full" /> black is fully
            defined, <span className="swatch over" /> red is over-defined.
          </li>
          <li>Drive dimensions from named parameters to build families of shapes.</li>
          <li>Drag geometry to see what it’s still free to do.</li>
        </ul>
      </Section>
    </div>
  );
}
