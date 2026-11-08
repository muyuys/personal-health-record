// 待建视图占位（后续批次逐个替换为真实实现）。
// 用同一套设计系统 class，避免空白观感。
import { useHead } from '../../components/head';
import { useEffect } from 'react';

export function StubView({ title, sub, note }: { title: string; sub?: string; note: string }) {
  const { setHead } = useHead();
  useEffect(() => {
    setHead({ title, sub });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);
  return (
    <div className="stack">
      <div className="empty-state">
        <div className="es-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <path d="M8 12h8M12 8v8" strokeLinecap="round" />
          </svg>
        </div>
        <p className="es-title">{title}</p>
        <p className="es-desc">{note}</p>
      </div>
    </div>
  );
}
