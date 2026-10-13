import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { formatNumber } from '../model/doc';
import type { Parameter } from '../model/types';
import { useStore } from '../store/store';
import { Icon } from './icons';

function ParameterRow({ param }: { param: Parameter }) {
  const value = useStore((s) => s.evaluation.params[param.name]);
  const error = useStore((s) => s.evaluation.paramErrors[param.id]);
  const { updateParameter, removeParameter, notify } = useStore.getState();
  const [name, setName] = useState<string | null>(null);
  const [expr, setExpr] = useState<string | null>(null);

  const commitName = () => {
    if (name !== null && name !== param.name) {
      const err = updateParameter(param.id, { name });
      if (err) notify(err, 'error');
    }
    setName(null);
  };
  const commitExpr = () => {
    if (expr !== null && expr.trim() !== param.expr) {
      const err = updateParameter(param.id, { expr });
      if (err) notify(err, 'error');
    }
    setExpr(null);
  };
  const keys = (cancel: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') cancel();
  };

  return (
    <>
      <tr className={error ? 'has-error' : ''}>
        <td>
          <input
            className="param-name"
            value={name ?? param.name}
            aria-label="Parameter name"
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={keys(() => setName(null))}
          />
        </td>
        <td>
          <input
            className="param-expr"
            value={expr ?? param.expr}
            aria-label={`${param.name} expression`}
            spellCheck={false}
            onChange={(e) => setExpr(e.target.value)}
            onBlur={commitExpr}
            onKeyDown={keys(() => setExpr(null))}
          />
        </td>
        <td className="param-value">{value === undefined ? '—' : formatNumber(value)}</td>
        <td>
          <button
            className="icon-button tiny"
            aria-label={`Remove ${param.name}`}
            title="Remove"
            onClick={() => removeParameter(param.id)}
          >
            <Icon name="trash" size={14} />
          </button>
        </td>
      </tr>
      {error && (
        <tr className="param-error">
          <td colSpan={4}>{error}</td>
        </tr>
      )}
    </>
  );
}

export function ParametersPanel() {
  const params = useStore((s) => s.doc.parameters);
  const addParameter = useStore((s) => s.addParameter);

  return (
    <section className="panel-section parameters">
      <div className="section-header">
        <h3>Parameters</h3>
        <button className="small-button" onClick={addParameter}>
          <Icon name="plus" size={14} /> Add
        </button>
      </div>
      {params.length === 0 ? (
        <p className="hint">
          Named values that drive dimensions, e.g. <code>stroke = 12</code> and a dimension of <code>stroke * 1.5</code>.
        </p>
      ) : (
        <table className="param-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Expression</th>
              <th>Value</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <ParameterRow key={p.id} param={p} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
