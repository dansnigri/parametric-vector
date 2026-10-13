import type { ReactNode } from 'react';

export type IconName =
  | 'select'
  | 'line'
  | 'rect'
  | 'circle'
  | 'arc'
  | 'point'
  | 'dimension'
  | 'construction'
  | 'undo'
  | 'redo'
  | 'trash'
  | 'plus'
  | 'fit';

const PATHS: Record<IconName, ReactNode> = {
  select: <path d="M5 3l11 7-5 1.5L8.5 17z" fill="currentColor" stroke="none" />,
  line: (
    <>
      <path d="M4 16L16 4" />
      <circle cx="4" cy="16" r="1.6" fill="currentColor" />
      <circle cx="16" cy="4" r="1.6" fill="currentColor" />
    </>
  ),
  rect: <rect x="3.5" y="5.5" width="13" height="9" rx="0.5" />,
  circle: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M8.5 10h3M10 8.5v3" />
    </>
  ),
  arc: (
    <>
      <path d="M3.5 15A7.5 7.5 0 0 1 16.5 15" />
      <circle cx="3.5" cy="15" r="1.5" fill="currentColor" />
      <circle cx="16.5" cy="15" r="1.5" fill="currentColor" />
      <circle cx="10" cy="7.6" r="1.5" fill="currentColor" />
    </>
  ),
  point: <circle cx="10" cy="10" r="2.5" fill="currentColor" />,
  dimension: (
    <>
      <path d="M3 6v9M17 6v9M3 10.5h14" />
      <path d="M3 10.5l2.5-2M3 10.5l2.5 2M17 10.5l-2.5-2M17 10.5l-2.5 2" />
    </>
  ),
  construction: <path d="M3 17L17 3" strokeDasharray="3 2.5" />,
  undo: <path d="M7 5L3.5 8.5 7 12M4 8.5h7.5a4.5 4.5 0 0 1 0 9H9" />,
  redo: <path d="M13 5l3.5 3.5L13 12M16 8.5H8.5a4.5 4.5 0 0 0 0 9H11" />,
  trash: <path d="M4.5 6h11M8 6V4h4v2M6 6l.7 10h6.6L14 6" />,
  plus: <path d="M10 4v12M4 10h12" />,
  fit: <path d="M3.5 7.5v-4h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4" />,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
