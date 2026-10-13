# Parametric Vector

A browser-based parametric vector drawing app for logos, lettering and other precise 2D shapes. You sketch geometry, then pin it down with relations (horizontal, tangent, equal…), dimensions and named parameters, the way CAD sketchers work.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

The build is a plain static site with relative asset paths, so `dist/` can be served from any static host or sub-path.

## Using it

| Key | Tool / action |
| --- | --- |
| S / Esc | Select |
| L | Line / polyline (Enter, Esc or right-click ends the chain) |
| R | Rectangle |
| C | Circle |
| A | 3-point arc |
| P | Point |
| D | Smart dimension |
| X | Toggle construction (selection, or the drawing mode) |
| H / V / E | Horizontal / vertical / equal for the selection |
| F | Zoom to fit |
| G | Grid snap |
| ⌘Z / ⇧⌘Z | Undo / redo |
| ⌘S / ⌘O / ⌘E | Save / open `.pvec.json` / export SVG |

Scroll to pan, ⌘/Ctrl + scroll or pinch to zoom, hold Space or the middle button to drag the view.

Geometry colour shows how constrained it is: blue can still move, black is fully defined, red is over-defined. Dimensions that would over-define the sketch are added as driven (reference) dimensions, shown in parentheses.

Dimension values accept expressions using parameter names, e.g. `stroke * 1.5`. Trig functions work in degrees.

## Structure

- `src/model` – document types, geometry helpers, expression evaluator, relation rules
- `src/solver` – maps the document onto the [planegcs](https://github.com/Salusoft89/planegcs) WebAssembly constraint solver (FreeCAD's sketch solver, LGPL)
- `src/store` – Zustand store: document, undo history, selection, solve status
- `src/canvas` – viewport, renderer, hit-testing/snapping and the tool state machine
- `src/ui` – panels (toolbar, inspector, parameters, status bar)
- `src/io` – JSON save/load and SVG export

The document is autosaved to the browser's local storage.
