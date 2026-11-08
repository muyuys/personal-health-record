import { useVisits } from './useVisits';

interface Props {
  flashId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
}

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

export function VisitList({ flashId, onOpen, onNew }: Props) {
  const { items, loading, error, reload } = useVisits();

  if (loading) return <p className="hint">加载中…</p>;
  if (error)
    return (
      <div className="notice notice--danger" role="alert">
        <span>加载失败：{error}</span>
        <button className="btn-plain" type="button" onClick={() => void reload()}>
          重试
        </button>
      </div>
    );

  return (
    <div className="stack">
      <div className="seg-row">
        <span className="page-sub">
          {items.length ? `共 ${items.length} 条就诊记录` : '还没有就诊记录'}
        </span>
        <div className="seg-tools">
          <button className="btn btn-primary" type="button" onClick={onNew}>
            <PlusIcon />
            记一次就诊
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <div className="es-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M4 6a2 2 0 0 1 2-2h9l3 3v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
              <path d="M14 4v4h4M8 13h8M8 17h5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="es-title">还没有记录</p>
          <p className="es-desc">从「记一次就诊」开始，把看病的资料、用药、下一步安排收进一条记录里。</p>
          <div className="es-actions" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" type="button" onClick={onNew}>
              <PlusIcon />
              记一次就诊
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((v) => (
            <button
              key={v.id}
              type="button"
              className="card"
              onClick={() => onOpen(v.id)}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                width: '100%',
                outline: v.id === flashId ? '2px solid var(--pine-500)' : undefined,
                outlineOffset: v.id === flashId ? 2 : undefined,
                transition: 'background .15s ease, border-color .15s ease',
              }}
            >
              <div className="row-main">
                <p className="row-title" style={{ fontWeight: 600 }}>
                  {v.hospital || `${v.visitType || '门诊'}就诊`}
                  {v.department ? `　·　${v.department}` : ''}
                </p>
                <p className="row-sub">
                  <span className="ts">{v.date || '日期未记'}</span>
                  {v.doctor ? `　·　${v.doctor}` : ''}
                </p>
                <p className="row-sub" style={{ marginTop: 6 }}>
                  {v.diagnosis || v.chief || '（无诊断 / 主诉）'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <p className="hint">这里只看「什么时候发生了什么」；检验指标趋势在健康主题 → 检验指标。</p>
    </div>
  );
}
