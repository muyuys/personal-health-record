import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Visit } from '../../api/types';

interface Props {
  id: string;
  onBack: () => void;
  onEdit: (v: Visit) => void;
}

function fmtWhen(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 键值行，对齐原 detailRowHTML（.kv-row / .kv-k / .kv-v）
function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv-row">
      <span className="kv-k">{label}</span>
      <span className="kv-v">{value || <span style={{ color: 'var(--ink-4)' }}>未记录</span>}</span>
    </div>
  );
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

  if (error)
    return (
      <div className="notice notice--danger" role="alert">
        加载失败：{error}
      </div>
    );
  if (!visit) return <p className="hint">加载中…</p>;

  const v = visit;
  const locate = [v.visitType, v.department, v.hospital].filter(Boolean).join('　·　');

  return (
    <div className="stack">
      <div className="seg-row">
        <span className="page-sub">
          {v.date || '日期未记'}
          {locate ? `　·　${locate}` : ''}
        </span>
        <div className="seg-tools">
          <button className="btn btn-secondary" type="button" onClick={onBack}>
            ← 就医记录
          </button>
          <button className="btn btn-primary" type="button" onClick={() => onEdit(v)}>
            编辑记录
          </button>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>本次记录</h2>
        </div>
        {String(v.summary || '').trim() ? (
          <p className="rec-text measure">{v.summary}</p>
        ) : (
          <p className="hint">本次没有写记录。</p>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>详细信息</h2>
        </div>
        <KvRow label="就诊原因" value={v.chief} />
        <KvRow label="明确诊断" value={v.diagnosis} />
        <KvRow label="医嘱 / 备注" value={v.note} />
        <KvRow label="接诊医生" value={v.doctor} />
        <KvRow label="医院" value={v.hospital} />
        <KvRow label="科室" value={v.department} />
        <KvRow label="就诊类型" value={v.visitType} />
        <KvRow label="关联报告" value={v.reportId} />
        <div className="kv-row">
          <span className="kv-k">记录时间</span>
          <span className="kv-v">
            <span className="ts">{fmtWhen(v.createdAt || Date.now())}</span>
          </span>
        </div>
      </section>
    </div>
  );
}
