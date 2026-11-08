// 图标集，逐字对齐旧前端 js/app.core.js 的 I 常量，保证视觉一致。
import type { ReactNode } from 'react';

type IcoProps = { className?: string };

const wrap = (children: ReactNode, sw = '1.7') => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} aria-hidden="true">
    {children}
  </svg>
);

export const I: Record<string, (p?: IcoProps) => ReactNode> = {
  settings: () => wrap(<><path d="M9.4 3h5.2l.6 2.5 2.2 1.3 2.5-.7 2.6 4.5-1.8 1.9v2.5l1.8 1.9-2.6 4.5-2.5-.7-2.2 1.3-.6 2.5H9.4l-.6-2.5-2.2-1.3-2.5.7-2.6-4.5L3.3 15v-2.5l-1.8-1.9 2.6-4.5 2.5.7 2.2-1.3.6-2.5Z" transform="translate(2 0) scale(.83)" /><circle cx="12" cy="12" r="3" /></>),
  home: () => wrap(<path d="M4 10.6L12 4l8 6.6V20a1 1 0 01-1 1h-4.5v-6h-5v6H5a1 1 0 01-1-1v-9.4z" strokeLinecap="round" strokeLinejoin="round" />),
  chevron: () => wrap(<path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />),
  camera: () => wrap(<><path d="M4 8.5h3l1.4-2h7.2L17 8.5h3a1 1 0 011 1V19a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5a1 1 0 011-1z" strokeLinejoin="round" /><circle cx="12" cy="13.5" r="3.4" /></>),
  grid: () => wrap(<><rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" /></>, '1.8'),
  check: () => wrap(<><circle cx="12" cy="12" r="9" /><path d="M8 12.4l2.6 2.6L16.2 9" strokeLinecap="round" strokeLinejoin="round" /></>, '1.8'),
  pulse: () => wrap(<path d="M3 12.5h4l2.8-7.5 4 15 2.7-7.5h4.5" strokeLinecap="round" strokeLinejoin="round" />, '1.8'),
  heart: () => wrap(<path d="M12 19.9C8.6 16.7 4.2 12.9 4.2 9.2C4.2 6.5 6.1 4.5 8.3 4.5C9.6 4.5 10.9 5.2 12 6.4C13.1 5.2 14.4 4.5 15.7 4.5C17.9 4.5 19.8 6.5 19.8 9.2C19.8 12.9 15.4 16.7 12 19.9Z" strokeLinecap="round" strokeLinejoin="round" />, '1.8'),
  clock: () => wrap(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5.3l3.5 2.1" strokeLinecap="round" /></>, '1.8'),
  pill: () => wrap(<><path d="M10.7 3.4a5 5 0 017 7l-6.8 6.9a5 5 0 01-7-7l6.8-6.9z" strokeLinecap="round" /><path d="M7.2 13.8l6.9-6.9" strokeLinecap="round" /></>, '1.8'),
  todo: () => wrap(<><rect x="3.5" y="4.5" width="17" height="16" rx="3" /><path d="M7.5 12.2l3 3 6-6" strokeLinecap="round" strokeLinejoin="round" /></>, '1.8'),
  trend: () => wrap(<><path d="M3.5 17.5l5-6.5 4 3 5.5-7.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M14.5 6.5H18v3.5" strokeLinecap="round" strokeLinejoin="round" /></>, '1.8'),
  user: () => wrap(<><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c1.3-3.6 4-5.4 7.5-5.4S18.2 16.4 19.5 20" strokeLinecap="round" /></>, '1.8'),
  search: () => wrap(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" strokeLinecap="round" /></>, '1.8'),
  plus: () => wrap(<path d="M12 5v14M5 12h14" strokeLinecap="round" />, '2.2'),
  close: () => wrap(<path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />, '2'),
  file: () => wrap(<><path d="M6 3h8l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" /><path d="M14 3v5h5" /></>),
  info: () => wrap(<><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" strokeLinecap="round" /><circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" /></>, '1.8'),
  more: () => wrap(<><circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" /></>, '1.8'),
  download: () => wrap(<><path d="M12 4v11m0 0l4-4m-4 4l-4-4" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 19h14" strokeLinecap="round" /></>, '1.8'),
  upload: () => wrap(<><path d="M12 16V5m0 0L8 9m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 19h14" strokeLinecap="round" /></>, '1.8'),
  check2: () => wrap(<path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />, '2.6'),
  symptom: () => wrap(<><path d="M6 3.5h9.5L19 7v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4.5a1 1 0 011-1z" strokeLinejoin="round" /><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" strokeLinecap="round" /></>, '1.8'),
  edit: () => wrap(<><path d="M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17v3z" strokeLinecap="round" strokeLinejoin="round" /><path d="M13.5 6.5l3 3" strokeLinecap="round" /></>, '1.8'),
};

export function Icon({ name, className }: { name: string; className?: string }) {
  const fn = I[name] || I.grid;
  return <span className={'ico' + (className ? ' ' + className : '')}>{fn()}</span>;
}
