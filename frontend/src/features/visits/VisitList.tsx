import { useVisits } from './useVisits';

interface Props {
  flashId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
}

export function VisitList({ flashId, onOpen, onNew }: Props) {
  const { items, loading, error, reload } = useVisits();

  if (loading) return <div>加载中…</div>;
  if (error)
    return (
      <div style={{ color: '#b00' }}>
        加载失败：{error}
        <button onClick={() => void reload()} style={{ marginLeft: 8 }}>
          重试
        </button>
      </div>
    );

  return (
    <div>
      <button onClick={onNew} style={{ marginBottom: 12 }}>
        + 记一次就诊
      </button>
      {items.length === 0 && <div style={{ color: '#888' }}>还没有就诊记录。</div>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {items.map((v) => (
          <li
            key={v.id}
            onClick={() => onOpen(v.id)}
            style={{
              padding: '10px 12px',
              border: '1px solid #e3e3e3',
              borderRadius: 8,
              marginBottom: 8,
              cursor: 'pointer',
              background: v.id === flashId ? '#e8f5e9' : '#fff',
            }}
          >
            <div style={{ fontWeight: 600 }}>
              {v.date} · {v.department || '未填科室'} · {v.hospital || '未填医院'}
            </div>
            <div style={{ color: '#555', fontSize: 13, marginTop: 4 }}>
              {v.diagnosis || v.chief || '（无诊断/主诉）'}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
