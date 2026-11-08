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

  const Field = ({
    label,
    k,
    req,
    textarea,
    type,
    placeholder,
  }: {
    label: string;
    k: keyof Draft;
    req?: boolean;
    textarea?: boolean;
    type?: string;
    placeholder?: string;
  }) => (
    <div className="field">
      <label htmlFor={`f-${k}`}>
        {label}
        {req && <b className="field-req">（必填）</b>}
      </label>
      {textarea ? (
        <textarea
          id={`f-${k}`}
          value={draft[k]}
          onChange={(e) => set(k, e.target.value)}
          rows={3}
          placeholder={placeholder}
        />
      ) : (
        <input
          id={`f-${k}`}
          type={type || 'text'}
          value={draft[k]}
          onChange={(e) => set(k, e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>{edit ? '编辑就诊记录' : '记一次就诊'}</h2>
        </div>

        <div className="form-grid">
          <Field label="就诊日期" k="date" req type="date" />
          <Field label="就诊类型" k="visitType" placeholder="门诊 / 急诊 / 住院 / 复查" />
          <Field label="科室" k="department" placeholder="心内科、内分泌科…" />
          <Field label="医院" k="hospital" placeholder="医院名称" />
          <Field label="接诊医生" k="doctor" placeholder="医生姓名" />
          <Field label="关联报告 id" k="reportId" placeholder="可选，报告 id" />
        </div>

        <div className="form-grid" style={{ gridTemplateColumns: '1fr', marginTop: 'var(--sp-4)' }}>
          <Field label="主诉" k="chief" placeholder="这次为什么去看病" />
          <Field label="明确诊断" k="diagnosis" placeholder="医生给出的诊断" />
          <Field label="小结（就诊记录）" k="summary" textarea placeholder="这次看病的经过与结论，写一句就能保存" />
          <Field label="医嘱 / 备注" k="note" textarea placeholder="医嘱、注意事项…" />
        </div>

        {error && (
          <div className="notice notice--danger" role="alert" style={{ marginTop: 'var(--sp-4)' }}>
            {error}
          </div>
        )}

        <div className="form-actions">
          <button className="btn btn-primary" type="button" onClick={() => void onSave()} disabled={saving}>
            {saving ? '保存中…' : '保存记录'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={onCancel} disabled={saving}>
            取消
          </button>
        </div>
      </section>
    </div>
  );
}

function stripMeta(v: Visit): Draft {
  const { id: _id, createdAt: _c, revision: _r, ...rest } = v;
  return rest;
}
