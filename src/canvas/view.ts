import type { Vec } from '../model/types';

/** World is y-up; screen is y-down. screen = (x * zoom + panX, -y * zoom + panY). */
export interface View {
  zoom: number;
  panX: number;
  panY: number;
  width: number;
  height: number;
}

export const toScreen = (v: View, p: Vec): Vec => ({ x: p.x * v.zoom + v.panX, y: -p.y * v.zoom + v.panY });
export const toWorld = (v: View, s: Vec): Vec => ({ x: (s.x - v.panX) / v.zoom, y: -(s.y - v.panY) / v.zoom });

export function zoomAt(v: View, screen: Vec, factor: number): View {
  const zoom = Math.min(2000, Math.max(0.01, v.zoom * factor));
  const world = toWorld(v, screen);
  return { ...v, zoom, panX: screen.x - world.x * zoom, panY: screen.y + world.y * zoom };
}

export function fitView(v: View, min: Vec, max: Vec, margin = 80): View {
  const w = Math.max(max.x - min.x, 1e-6);
  const h = Math.max(max.y - min.y, 1e-6);
  const zoom = Math.min((v.width - margin * 2) / w, (v.height - margin * 2) / h, 50);
  const cx = (min.x + max.x) / 2;
  const cy = (min.y + max.y) / 2;
  return { ...v, zoom, panX: v.width / 2 - cx * zoom, panY: v.height / 2 + cy * zoom };
}
