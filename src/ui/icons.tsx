import type { ReactNode } from 'react';

export type IconName =
  | 'select'
  | 'dimension'
  | 'line'
  | 'rect'
  | 'circle'
  | 'arc'
  | 'point'
  | 'construction'
  | 'relations'
  | 'grid'
  | 'gridSnap'
  | 'fit'
  | 'new'
  | 'open'
  | 'save'
  | 'export'
  | 'undo'
  | 'redo'
  | 'check'
  | 'close'
  | 'trash'
  | 'plus'
  | 'chevron'
  | 'pin';

const BLUE = '#2a63c9';
const GOLD = '#e0a020';
const GREEN = '#4c9a2a';
const RED = '#d23a2a';

const dot = (cx: number, cy: number, fill = BLUE, r = 1.9) => (
  <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#1b2a44" strokeWidth="0.6" />
);

const PATHS: Record<IconName, ReactNode> = {
  select: <path d="M6 3.5l12 8-5.6 1.4L9.4 19z" fill="#fff" />,
  dimension: (
    <>
      <path d="M4 7v12M20 7v12" />
      <path d="M4 13h16" stroke={BLUE} />
      <path d="M4 13l3-2.2M4 13l3 2.2M20 13l-3-2.2M20 13l-3 2.2" stroke={BLUE} />
      <rect x="8.5" y="3" width="7" height="5" rx="1" fill={GOLD} stroke="#7a5a10" strokeWidth="0.8" />
    </>
  ),
  line: (
    <>
      <path d="M5 19L19 5" />
      {dot(5, 19)}
      {dot(19, 5)}
    </>
  ),
  rect: (
    <>
      <rect x="4.5" y="6.5" width="15" height="11" />
      {dot(4.5, 6.5)}
      {dot(19.5, 17.5)}
    </>
  ),
  circle: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 12l5.3-5.3" stroke={BLUE} strokeDasharray="1.6 1.4" />
      {dot(12, 12, GOLD)}
    </>
  ),
  arc: (
    <>
      <path d="M4 17A8.6 8.6 0 0 1 20 17" />
      {dot(4, 17)}
      {dot(20, 17)}
      {dot(12, 9.2, GOLD)}
    </>
  ),
  point: (
    <>
      <path d="M6 18h12" stroke="#9aa4b2" />
      {dot(12, 11, BLUE, 3)}
    </>
  ),
  construction: <path d="M4 20L20 4" strokeDasharray="5 1.6 1.4 1.6" stroke={BLUE} />,
  relations: (
    <>
      <path d="M4 18L13 6" />
      <rect x="13" y="12" width="7.5" height="7.5" fill="#e3f1d6" stroke={GREEN} />
      <path d="M15 15.75h3.5" stroke={GREEN} strokeWidth="1.6" />
    </>
  ),
  grid: (
    <path
      d="M4 4h16v16H4zM9.33 4v16M14.66 4v16M4 9.33h16M4 14.66h16"
      stroke="#7d8796"
      strokeWidth="1.1"
    />
  ),
  gridSnap: (
    <>
      <path d="M4 4h16v16H4zM12 4v16M4 12h16" stroke="#7d8796" strokeWidth="1.1" />
      {dot(12, 12, GOLD, 2.6)}
    </>
  ),
  fit: (
    <>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
      <rect x="8.5" y="8.5" width="7" height="7" stroke={BLUE} />
    </>
  ),
  new: (
    <>
      <path d="M6 3.5h8l4 4v13H6z" fill="#fff" />
      <path d="M14 3.5v4h4" />
    </>
  ),
  open: (
    <>
      <path d="M3.5 6.5h6l2 2h9v10h-17z" fill="#f2d27a" stroke="#8a6a1a" />
    </>
  ),
  save: (
    <>
      <path d="M4.5 4.5h12l3 3v12h-15z" fill="#4a78c9" stroke="#1d3d75" />
      <rect x="8" y="4.5" width="7" height="5" fill="#fff" stroke="#1d3d75" />
      <rect x="7.5" y="13" width="9" height="6.5" fill="#fff" stroke="#1d3d75" />
    </>
  ),
  export: (
    <>
      <path d="M6 3.5h8l4 4v13H6z" fill="#fff" />
      <path d="M12 9v8M8.8 13.8L12 17l3.2-3.2" stroke={GREEN} strokeWidth="1.7" />
    </>
  ),
  undo: <path d="M8 6L4 10l4 4M4.5 10H15a5 5 0 0 1 0 10h-3" stroke={BLUE} strokeWidth="1.8" />,
  redo: <path d="M16 6l4 4-4 4M19.5 10H9a5 5 0 0 0 0 10h3" stroke={BLUE} strokeWidth="1.8" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" stroke={GREEN} strokeWidth="2.6" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke={RED} strokeWidth="2.4" />,
  trash: <path d="M5 7h14M9.5 7V4.5h5V7M7 7l.8 12.5h8.4L17 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevron: <path d="M7 10l5 5 5-5" />,
  pin: <path d="M12 3v4M8 7h8l-1.5 6h-5zM12 13v8" />,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2b2f36"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
