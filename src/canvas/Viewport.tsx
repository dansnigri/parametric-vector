import { useEffect, useRef, useState } from 'react';
import { dimensionAnchor } from '../model/doc';
import { add } from '../model/geometry';
import { useStore } from '../store/store';
import { ToolController, controllerRef } from './controller';
import { render } from './render';
import { toScreen } from './view';
import type { View } from './view';

export function Viewport() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>({ zoom: 4, panX: 0, panY: 0, width: 0, height: 0 });
  const editingDimension = useStore((s) => s.editingDimension);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    let frameRequested = false;

    const draw = () => {
      frameRequested = false;
      const c = controllerRef.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = c.view;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = useStore.getState();
      render(ctx, {
        doc: s.doc,
        view: c.view,
        report: s.report,
        evaluation: s.evaluation,
        selection: new Set(s.selection),
        hover: s.hover,
        preview: c.preview,
        editingDimension: s.editingDimension,
      });
      canvas.style.cursor = c.cursorStyle;
    };
    const requestDraw = () => {
      if (frameRequested) return;
      frameRequested = true;
      requestAnimationFrame(draw);
    };

    const controller = new ToolController(
      { zoom: 4, panX: 0, panY: 0, width: 0, height: 0 },
      requestDraw,
      (v) => {
        setView(v);
        const s = useStore.getState();
        if (s.zoom !== v.zoom) s.setCursor(s.cursor, v.zoom);
      },
    );
    controllerRef.current = controller;

    const ro = new ResizeObserver(([entry]) => {
      controller.resize(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(wrap);

    const local = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic or already-released pointers can't be captured */
      }
      controller.pointerDown(e, local(e));
    };
    const onMove = (e: PointerEvent) => controller.pointerMove(e, local(e));
    const onUp = (e: PointerEvent) => controller.pointerUp(e, local(e));
    const onDbl = (e: MouseEvent) => controller.doubleClick(local(e));
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      controller.wheel(e, local(e));
    };
    const onContext = (e: MouseEvent) => e.preventDefault();
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (controller.keyDown(e)) {
        e.preventDefault();
        controller.refreshPreview();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!typing(e)) controller.keyUp(e);
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('dblclick', onDbl);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s.tool !== prev.tool) controller.cancel();
      requestDraw();
    });

    return () => {
      ro.disconnect();
      unsubscribe();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('dblclick', onDbl);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      controllerRef.current = null;
    };
  }, []);

  return (
    <div className="viewport" ref={wrapRef}>
      <canvas ref={canvasRef} />
      {editingDimension && <DimensionEditor key={editingDimension} id={editingDimension} view={view} />}
    </div>
  );
}

function DimensionEditor({ id, view }: { id: string; view: View }) {
  const dim = useStore((s) => s.doc.dimensions[id]);
  const doc = useStore((s) => s.doc);
  const [value, setValue] = useState(dim?.expr ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  if (!dim) return null;
  const at = toScreen(view, add(dimensionAnchor(doc, dim), dim.label));
  const close = () => useStore.getState().setEditingDimension(null);
  const submit = () => {
    if (value.trim() === dim.expr) return close();
    if (useStore.getState().setDimensionExpr(id, value)) close();
  };

  return (
    <div className="dim-editor" style={{ left: at.x, top: at.y }}>
      <input
        ref={inputRef}
        value={value}
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') close();
          e.stopPropagation();
        }}
        onBlur={close}
      />
      <div className="dim-editor-hint">{dim.kind === 'angle' ? 'Degrees' : 'Value'} or expression · Enter</div>
    </div>
  );
}
