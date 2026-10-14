import { useState } from 'react';
import { exportSvgFile, openDocument, saveDocument } from '../io/file';
import { useStore } from '../store/store';
import { Icon } from './icons';
import type { IconName } from './icons';

function QuickButton({
  icon,
  title,
  onClick,
  disabled,
}: {
  icon: IconName;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="qa-button" title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      <Icon name={icon} size={18} />
    </button>
  );
}

export function TitleBar() {
  const name = useStore((s) => s.doc.name);
  const dirty = useStore((s) => s.past.length > 0);
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
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="brand-mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.8">
            <path d="M3 17L10 3l7 14z" />
            <circle cx="10" cy="12" r="2.4" />
          </svg>
        </span>
        <span className="brand-name">PARAMETRIC VECTOR</span>
      </div>
      <div className="qa-bar">
        <QuickButton
          icon="new"
          title="New (start a new sketch)"
          onClick={() => {
            if (confirm('Start a new sketch? You can undo this.')) newDocument();
          }}
        />
        <QuickButton icon="open" title="Open (⌘O)" onClick={openDocument} />
        <QuickButton icon="save" title="Save (⌘S)" onClick={saveDocument} />
        <QuickButton icon="export" title="Export SVG (⌘E)" onClick={exportSvgFile} />
        <span className="qa-sep" />
        <QuickButton icon="undo" title="Undo (⌘Z)" disabled={!canUndo} onClick={undo} />
        <QuickButton icon="redo" title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo} />
      </div>
      <div className="titlebar-doc">
        {draft === null ? (
          <button className="doc-title" title="Rename" onClick={() => setDraft(name)}>
            {name} <span className="doc-kind">(Sketch1)</span>
            {dirty ? ' *' : ''}
          </button>
        ) : (
          <input
            className="doc-title-input"
            value={draft}
            autoFocus
            aria-label="Document name"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setDraft(null);
            }}
          />
        )}
      </div>
      <div className="titlebar-right" />
    </header>
  );
}
