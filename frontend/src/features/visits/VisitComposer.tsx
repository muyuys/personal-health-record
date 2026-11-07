import { useState } from 'react';
import { api } from '../../api/client';
import { ConflictError, type Visit } from '../../api/types';

interface Props {
  edit?: Visit;
  onCancel: () => void;
  onSaved: (id: string) => void;
}

type Draft = Omit<Visit, 'id' | 'createdAt' | 'revision'>;

const empty: Draft = {
  date: '',
  visitType: '',
  department: '',
  hospital: '',
  doctor: '',
  chief: '',
  diagnosis: '',
  summary: '',
  note: '',
  reportId: '',
};

export function VisitComposer({ edit, onCancel, onSaved }: Props) {
  const [draft, setDraft] = useState<Draft>(
    edit ? { ...empty, ...stripMeta(edit) } : empty,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const onSave = async () => {
    setError(null);
    // 前端最小校验：对齐原 canSaveVisitDraft（日期 + 至少一句小结/主诉）
    if (!draft.date) {
      setError('请先选择就诊日期。');
      return;
    }
    if (!draft.summary && !draft.chief) {
      setError('写一句就能保存（主诉或小结至少填一项）。');
      return;
    }

    setSaving(true);
    try {
      // 关键：await 到真实结果，失败走 catch —— 输入完整保留
      if (edit) {
        const res = await api.updateVisit({ ...edit, ...draft });
        onSaved(res.item.id);
      } else {
        const res = await api.createVisit(draft);
        onSaved(res.item.id);
      }
    } catch (e) {
      if (e instanceof ConflictError) {
        setError('这条记录已被其他窗口修改，请返回列表刷新后再改（你的输入仍保留）。');
      } else {
        setError((e instanceof Error ? e.message : String(e)) + ' — 未保存成功，输入已保留。');
      }
    } finally {
      setSaving(false);
    }
  };

  const Row = ({ label, k, textarea }: { label: string; k: keyof Draft; textarea?: boolean }) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 4 }}>
        {label}
      </label>
      {textarea ? (
        <textarea
          value={draft[k]}
          onChange={(e) => set(k, e.target.value)}
          rows={2}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      ) : (
        <input
          value={draft[k]}
          onChange={(e) => set(k, e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
      )}
    </div>
  );

  return (
    <div>
      <h2 style={{ fontSize: 17 }}>{edit ? '编辑就诊' : '记一次就诊'}</h2>

      <Row label="就诊日期（必填）" k="date" />
      <Row label="就诊类型" k="visitType" />
      <Row label="科室" k="department" />
      <Row label="医院" k="hospital" />
      <Row label="医生" k="doctor" />
      <Row label="主诉" k="chief" />
      <Row label="诊断" k="diagnosis" />
      <Row label="小结" k="summary" textarea />
      <Row label="备注" k="note" textarea />
      <Row label="关联报告 id" k="reportId" />

      {error && (
        <div style={{ color: '#b00', margin: '8px 0' }} role="alert">
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={() => void onSave()} disabled={saving}>
          {saving ? '保存中…' : '保存记录'}
        </button>
        <button onClick={onCancel} disabled={saving}>
          取消
        </button>
      </div>
    </div>
  );
}

function stripMeta(v: Visit): Draft {
  const { id: _id, createdAt: _c, revision: _r, ...rest } = v;
  return rest;
}
