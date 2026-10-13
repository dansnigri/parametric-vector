import { useStore } from '../store/store';
import type { ToolName } from '../store/store';
import { Icon } from './icons';
import type { IconName } from './icons';

const TOOLS: { tool: ToolName; label: string; key: string; icon: IconName }[] = [
  { tool: 'select', label: 'Select', key: 'S', icon: 'select' },
  { tool: 'line', label: 'Line / polyline', key: 'L', icon: 'line' },
  { tool: 'rect', label: 'Rectangle', key: 'R', icon: 'rect' },
  { tool: 'circle', label: 'Circle', key: 'C', icon: 'circle' },
  { tool: 'arc', label: '3-point arc', key: 'A', icon: 'arc' },
  { tool: 'point', label: 'Point', key: 'P', icon: 'point' },
  { tool: 'dimension', label: 'Smart dimension', key: 'D', icon: 'dimension' },
];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const construction = useStore((s) => s.construction);
  const setConstruction = useStore((s) => s.setConstruction);

  return (
    <nav className="toolbar" aria-label="Tools">
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          className={`tool-button${tool === t.tool ? ' active' : ''}`}
          title={`${t.label} (${t.key})`}
          aria-label={t.label}
          aria-pressed={tool === t.tool}
          onClick={() => setTool(t.tool)}
        >
          <Icon name={t.icon} />
        </button>
      ))}
      <div className="toolbar-sep" />
      <button
        className={`tool-button${construction ? ' active' : ''}`}
        title="Construction mode: new geometry is reference-only and excluded from export (X)"
        aria-label="Construction mode"
        aria-pressed={construction}
        onClick={() => setConstruction(!construction)}
      >
        <Icon name="construction" />
      </button>
    </nav>
  );
}
