import type { Doc } from '../model/types';
import { useStore } from '../store/store';
import { exportSvg } from './svg';

const FORMAT = 'parametric-vector';

function download(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeName = (name: string) => name.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-') || 'sketch';

export function saveDocument() {
  const { doc, notify } = useStore.getState();
  download(`${safeName(doc.name)}.pvec.json`, JSON.stringify({ format: FORMAT, doc }, null, 2), 'application/json');
  notify('Saved a copy to your downloads.');
}

export function exportSvgFile() {
  const { doc, notify } = useStore.getState();
  download(`${safeName(doc.name)}.svg`, exportSvg(doc), 'image/svg+xml');
  notify('Exported SVG (construction geometry excluded).');
}

export function parseDocument(text: string): Doc {
  const data = JSON.parse(text);
  const doc = (data?.format === FORMAT ? data.doc : data) as Doc;
  if (doc?.version !== 1 || typeof doc.entities !== 'object' || typeof doc.constraints !== 'object') {
    throw new Error('Not a Parametric Vector document');
  }
  doc.dimensions ??= {};
  doc.parameters ??= [];
  return doc;
}

export function openDocument() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const { loadDocument, notify } = useStore.getState();
    try {
      loadDocument(parseDocument(await file.text()));
      notify(`Opened ${file.name}`);
    } catch (err) {
      notify(`Couldn’t open ${file.name}: ${(err as Error).message}`, 'error');
    }
  };
  input.click();
}
