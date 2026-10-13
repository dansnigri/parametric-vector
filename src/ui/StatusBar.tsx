import { useEffect } from 'react';
import { formatNumber } from '../model/doc';
import { useStore } from '../store/store';
import type { ToolName } from '../store/store';

const HINTS: Record<ToolName, string> = {
  select: 'Click to select · Shift-click to add · Drag geometry to move it · Drag empty space to box-select',
  line: 'Click to start, click to add segments · Enter, Esc or right-click to finish · Hold ⌥ to skip H/V inference',
  rect: 'Click two opposite corners',
  circle: 'Click the center, then a point on the circle',
  arc: 'Click the start, the end, then a point the arc passes through',
  point: 'Click to place a point',
  dimension: 'Pick one or two items, then click where the label goes',
};

function SketchStatus() {
  const report = useStore((s) => s.report);
  const ready = useStore((s) => s.solverReady);
  if (!ready) return <span className="status-pill">Loading solver…</span>;
  if (!report.ok || report.conflicting.length || report.redundant.length)
    return <span className="status-pill over">Over-defined</span>;
  if (report.dof === 0) return <span className="status-pill full">Fully defined</span>;
  return <span className="status-pill under">Under-defined · {report.dof} DOF</span>;
}

export function StatusBar() {
  const tool = useStore((s) => s.tool);
  const cursor = useStore((s) => s.cursor);
  const zoom = useStore((s) => s.zoom);
  const gridSnap = useStore((s) => s.gridSnap);
  const construction = useStore((s) => s.construction);
  const setGridSnap = useStore((s) => s.setGridSnap);

  return (
    <footer className="statusbar">
      <SketchStatus />
      <span className="status-hint">{HINTS[tool]}</span>
      <span className="status-spacer" />
      {construction && <span className="status-tag">Construction</span>}
      <label className="status-toggle" title="Snap to grid (G)">
        <input type="checkbox" checked={gridSnap} onChange={(e) => setGridSnap(e.target.checked)} /> Grid snap
      </label>
      <span className="status-coords">
        {formatNumber(cursor.x, 2)}, {formatNumber(cursor.y, 2)}
      </span>
      <span className="status-zoom">{Math.round(zoom * 100)}%</span>
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
