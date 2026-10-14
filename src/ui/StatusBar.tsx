import { useEffect } from 'react';
import { formatNumber } from '../model/doc';
import { useStore } from '../store/store';
import type { ToolName } from '../store/store';

const STATUS_HINT: Record<ToolName, string> = {
  select: 'Select entities to modify their properties',
  line: 'Sketches a straight line',
  rect: 'Sketches a rectangle from two opposite corners',
  circle: 'Sketches a circle from its center and radius',
  arc: 'Sketches an arc through three points',
  point: 'Sketches a point',
  dimension: 'Creates a dimension for one or more selected entities',
};

function SketchStatus() {
  const report = useStore((s) => s.report);
  const ready = useStore((s) => s.solverReady);
  if (!ready) return <span className="status-cell">Loading…</span>;
  if (!report.ok || report.conflicting.length || report.redundant.length)
    return <span className="status-cell status-over">Over Defined</span>;
  if (report.dof === 0) return <span className="status-cell">Fully Defined</span>;
  return <span className="status-cell status-under">Under Defined</span>;
}

export function StatusBar() {
  const tool = useStore((s) => s.tool);
  const cursor = useStore((s) => s.cursor);
  const zoom = useStore((s) => s.zoom);
  const name = useStore((s) => s.doc.name);

  return (
    <footer className="statusbar">
      <span className="status-hint">{STATUS_HINT[tool]}</span>
      <span className="status-spacer" />
      <span className="status-cell status-num">{formatNumber(cursor.x, 2)}mm</span>
      <span className="status-cell status-num">{formatNumber(cursor.y, 2)}mm</span>
      <span className="status-cell status-num">0mm</span>
      <SketchStatus />
      <span className="status-cell">Editing {name}</span>
      <span className="status-cell status-num" title="Zoom">
        {Math.round(zoom * 100)}%
      </span>
      <span className="status-cell">MMGS</span>
    </footer>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      if (useStore.getState().toast === toast) useStore.setState({ toast: null });
    }, 4000);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} role="status">
      {toast.text}
    </div>
  );
}
