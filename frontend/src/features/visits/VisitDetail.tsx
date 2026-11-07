import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Visit } from '../../api/types';

interface Props {
  id: string;
  onBack: () => void;
  onEdit: (v: Visit) => void;
}

export function VisitDetail({ id, onBack, onEdit }: Props) {
  const [visit, setVisit] = useState<Visit | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .getVisit(id)
      .then((v) => alive && setVisit(v))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) return <div style={{ color: '#b00' }}>加载失败：{error}</div>;
  if (!visit) return <div>加载中…</div>;

  const Field = ({ label, value }: { label: string; value: string }) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: '#888', fontSize: 12 }}>{label}</div>
      <div>{value || '—'}</div>
    </div>
  );

  return (
    <div>
      <button onClick={onBack} style={{ marginBottom: 12 }}>
        ← 返回
      </button>
      <h2 style={{ fontSize: 17 }}>
        {visit.date} · {visit.department} · {visit.hospital}
      </h2>
      <Field label="就诊类型" value={visit.visitType} />
      <Field label="医生" value={visit.doctor} />
      <Field label="主诉" value={visit.chief} />
      <Field label="诊断" value={visit.diagnosis} />
      <Field label="小结" value={visit.summary} />
      <Field label="备注" value={visit.note} />
      <Field label="关联报告" value={visit.reportId} />
      <button onClick={() => onEdit(visit)} style={{ marginTop: 12 }}>
        编辑
      </button>
    </div>
  );
}
