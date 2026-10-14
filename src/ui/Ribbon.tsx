import { useState } from 'react';
import { controllerRef } from '../canvas/controller';
import { useStore } from '../store/store';
import type { ToolName } from '../store/store';
import { Icon } from './icons';
import type { IconName } from './icons';

type Tab = 'sketch' | 'view';

function BigButton({
  icon,
  label,
  title,
  active,
  onClick,
}: {
  icon: IconName;
  label: string;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`ribbon-button${active ? ' active' : ''}`}
      title={title}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon name={icon} size={26} />
      <span>{label}</span>
    </button>
  );
}

const SKETCH_TOOLS: { tool: ToolName; label: string; key: string; icon: IconName }[] = [
  { tool: 'line', label: 'Line', key: 'L', icon: 'line' },
  { tool: 'rect', label: 'Corner Rectangle', key: 'R', icon: 'rect' },
  { tool: 'circle', label: 'Circle', key: 'C', icon: 'circle' },
  { tool: 'arc', label: '3 Point Arc', key: 'A', icon: 'arc' },
  { tool: 'point', label: 'Point', key: 'P', icon: 'point' },
];

export function Ribbon() {
  const [tab, setTab] = useState<Tab>('sketch');
  const tool = useStore((s) => s.tool);
  const construction = useStore((s) => s.construction);
  const showRelations = useStore((s) => s.showRelations);
  const showGrid = useStore((s) => s.showGrid);
  const gridSnap = useStore((s) => s.gridSnap);
  const { setTool, setConstruction, setShowRelations, setShowGrid, setGridSnap } = useStore.getState();

  return (
    <div className="ribbon">
      <div className="ribbon-body">
        {tab === 'sketch' ? (
          <>
            <div className="ribbon-group">
              <BigButton
                icon="select"
                label="Select"
                title="Select (S)"
                active={tool === 'select'}
                onClick={() => setTool('select')}
              />
              <BigButton
                icon="dimension"
                label="Smart Dimension"
                title="Smart Dimension (D): pick one or two items, then place the dimension"
                active={tool === 'dimension'}
                onClick={() => setTool('dimension')}
              />
            </div>
            <div className="ribbon-group">
              {SKETCH_TOOLS.map((t) => (
                <BigButton
                  key={t.tool}
                  icon={t.icon}
                  label={t.label}
                  title={`${t.label} (${t.key})`}
                  active={tool === t.tool}
                  onClick={() => setTool(t.tool)}
                />
              ))}
            </div>
            <div className="ribbon-group">
              <BigButton
                icon="construction"
                label="Construction Geometry"
                title="Construction Geometry (X): new geometry is reference-only; with a selection, toggles it"
                active={construction}
                onClick={() => {
                  const s = useStore.getState();
                  if (s.selection.some((id) => s.doc.entities[id])) s.toggleConstructionOfSelection();
                  else setConstruction(!construction);
                }}
              />
              <BigButton
                icon="relations"
                label="Display Relations"
                title="Show or hide relation markers on the sketch"
                active={showRelations}
                onClick={() => setShowRelations(!showRelations)}
              />
            </div>
          </>
        ) : (
          <div className="ribbon-group">
            <BigButton
              icon="fit"
              label="Zoom to Fit"
              title="Zoom to Fit (F)"
              onClick={() => controllerRef.current?.fit()}
            />
            <BigButton icon="grid" label="Grid" title="Show the grid" active={showGrid} onClick={() => setShowGrid(!showGrid)} />
            <BigButton
              icon="gridSnap"
              label="Snap to Grid"
              title="Snap to Grid (G)"
              active={gridSnap}
              onClick={() => setGridSnap(!gridSnap)}
            />
            <BigButton
              icon="relations"
              label="Display Relations"
              title="Show or hide relation markers on the sketch"
              active={showRelations}
              onClick={() => setShowRelations(!showRelations)}
            />
          </div>
        )}
      </div>
      <div className="ribbon-tabs" role="tablist">
        {(['sketch', 'view'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`ribbon-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'sketch' ? 'Sketch' : 'View'}
          </button>
        ))}
      </div>
    </div>
  );
}
