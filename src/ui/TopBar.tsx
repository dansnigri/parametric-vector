import { useState } from 'react';
import { controllerRef } from '../canvas/controller';
import { exportSvgFile, openDocument, saveDocument } from '../io/file';
import { useStore } from '../store/store';
import { Icon } from './icons';

export function TopBar() {
  const name = useStore((s) => s.doc.name);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const { undo, redo, newDocument, renameDocument } = useStore.getState();
  const [draft, setDraft] = useState<string | null>(null);

  const commitName = () => {
    const next = draft?.trim() || 'Untitled';
    if (draft !== null && next !== name) renameDocument(next);
    setDraft(null);
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 17L10 3l7 14z" />
            <circle cx="10" cy="12" r="2.4" />
          </svg>
        </span>
        Parametric Vector
      </div>
      <input
        className="doc-name"
        value={draft ?? name}
        aria-label="Document name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      <div className="topbar-group">
        <button className="icon-button" title="Undo (⌘Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}>
          <Icon name="undo" size={18} />
        </button>
        <button className="icon-button" title="Redo (⇧⌘Z)" aria-label="Redo" disabled={!canRedo} onClick={redo}>
          <Icon name="redo" size={18} />
        </button>
        <button
          className="icon-button"
          title="Zoom to fit (F)"
          aria-label="Zoom to fit"
          onClick={() => controllerRef.current?.fit()}
        >
          <Icon name="fit" size={18} />
        </button>
      </div>
      <div className="topbar-spacer" />
      <div className="topbar-group">
        <button
          className="text-button"
          onClick={() => {
            if (confirm('Start a new sketch? You can undo this.')) newDocument();
          }}
        >
          New
        </button>
        <button className="text-button" title="Open a .pvec.json file (⌘O)" onClick={openDocument}>
          Open
        </button>
        <button className="text-button" title="Download as .pvec.json (⌘S)" onClick={saveDocument}>
          Save
        </button>
        <button className="text-button primary" title="Export SVG (⌘E)" onClick={exportSvgFile}>
          Export SVG
        </button>
      </div>
    </header>
  );
}
