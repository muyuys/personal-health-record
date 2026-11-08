import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../api/client';
import { ConflictError, type Visit, type Report } from '../../api/types';
import { useHead } from '../../components/head';
import { useStore } from '../../store/useStore';
import { Icon } from '../../components/icons';
import { shrinkImage } from '../../lib/image';
import { todayISO } from '../../lib/todos';

interface Props {
  edit?: Visit;
  presetDate?: string;
  onCancel: () => void;
  onSaved: (id: string) => void;
}

type Draft = Omit<Visit, 'id' | 'createdAt' | 'revision'>;

const VISIT_TYPES = ['门诊', '急诊', '住院', '体检', '线上问诊', '其他'];

const empty = (date?: string, visitType?: string): Draft => ({
  date: date || todayISO(),
  visitType: visitType || '门诊',
  department: '',
  hospital: '',
  doctor: '',
  chief: '',
  diagnosis: '',
  summary: '',
  note: '',
  reportId: '',
});

interface File1 {
  name: string;
  dataUrl: string;
}

// 折叠区，对齐旧 foldHTML
function Fold({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fold">
      <button className="fold-head" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="fold-title">{title}</span>
        <span className="fold-note">{note}</span>
        <span className="fold-caret"><Icon name="chevron" /></span>
      </button>
      <div className="fold-body" hidden={!open}>{children}</div>
    </div>
  );
}

export function VisitComposer({ edit, presetDate, onCancel, onSaved }: Props) {
  const store = useStore();
  const reports = store.data?.reports || [];
  const [draft, setDraft] = useState<Draft>(edit ? stripMeta(edit) : empty(presetDate, '门诊'));
  const [files, setFiles] = useState<File1[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setHead } = useHead();
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 页头按钮需要拿到最新的 onSave（否则会闭包住首次渲染的空 draft）
  const saveRef = useRef<() => void>(() => {});
  const cancelRef = useRef<() => void>(() => {});

  useEffect(() => {
    setHead({
      eyebrow: '',
      title: edit ? '编辑就诊记录' : '记一次就诊',
      sub: '记得多少写多少，以后随时可以补充',
      actions: (
        <>
          <button className="btn btn-secondary only-desktop" type="button" onClick={() => cancelRef.current()}>取消</button>
          <button className="btn btn-primary only-desktop" type="button" onClick={() => saveRef.current()} disabled={saving}>
            {saving ? '保存中…' : '保存记录'}
          </button>
        </>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving]);

  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  // 旧 canSaveVisitDraft：有效日期 +（自由记录 | 至少一份附件 | 原因/诊断/医嘱任一）
  const canSave = () => {
    if (!draft.date) return { ok: false, reason: 'date' as const };
    const textOK = String(draft.summary || '').trim().length > 0;
    const attachOK = files.length > 0;
    const proOK = ['chief', 'diagnosis', 'note'].some((k) => String((draft as any)[k] || '').trim().length > 0);
    if (textOK || attachOK || proOK) return { ok: true as const };
    return { ok: false, reason: 'empty' as const };
  };

  const onPickFiles = async (list: FileList | null) => {
    if (!list || !list.length) return;
    for (const f of Array.from(list)) {
      try {
        const dataUrl = await shrinkImage(f);
        setFiles((prev) => [...prev, { name: f.name || '资料', dataUrl }]);
      } catch {
        /* 读不出就跳过 */
      }
    }
  };

  const onSave = async () => {
    setError(null);
    const st = canSave();
    if (!st.ok) {
      setError(st.reason === 'date' ? '请先选择就诊日期。' : '写一句就能保存；也可以先存一份资料。');
      return;
    }
    setSaving(true);
    try {
      // 新图片各自存成报告；第 1 份挂到这次就诊
      let reportId = draft.reportId;
      if (files.length) {
        const nextReports: Report[] = [...reports];
        const newIds: string[] = [];
        for (const f of files) {
          const id = 'rep' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          nextReports.push({
            id,
            date: draft.date || '',
            title: '就诊资料',
            panel: '',
            specimen: '',
            hospital: draft.hospital || '',
            note: '',
            file: f.dataUrl,
            createdAt: Date.now(),
          });
          newIds.push(id);
        }
        await api.putTable('reports', nextReports);
        if (!reportId && newIds[0]) reportId = newIds[0];
      }
      const payload = { ...draft, reportId };
      if (edit) {
        const res = await api.updateVisit({ ...edit, ...payload });
        onSaved(res.item.id);
      } else {
        const res = await api.createVisit(payload);
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

  const onDel = async () => {
    if (!edit) return;
    if (!confirm('确定删除这条就诊记录？')) return;
    try {
      await api.deleteVisit(edit.id, edit.revision ?? 0);
      store.reload();
      onCancel();
    } catch (e) {
      setError('删除失败：' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const reportOpts = (
    <>
      <option value="">（不关联）</option>
      {reports
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map((r) => (
          <option key={r.id} value={r.id}>
            {`${r.date || '日期未确认'}　${r.title || '未命名报告'}`}
          </option>
        ))}
    </>
  );

  const filledInfo = [['hospital', '医院'], ['department', '科室'], ['doctor', '医生']]
    .filter(([k]) => String((draft as any)[k] || '').trim())
    .map(([, label]) => label);
  const infoSummary = `${draft.visitType || '门诊'} · ${filledInfo.length ? '已填 ' + filledInfo.join('、') : '其他未记录'}`;
  const has = (k: keyof Draft) => String((draft as any)[k] || '').trim().length > 0;
  const diagSummary = has('diagnosis')
    ? '已填 诊断'
    : [['chief', '就诊原因'], ['note', '医嘱']].filter(([k]) => has(k as keyof Draft)).map(([, l]) => l).join('、') || '未记录';

  // 每次渲染都把最新的回调挂到 ref，页头按钮经 ref 调用，避免闭包住旧 draft
  saveRef.current = () => void onSave();
  cancelRef.current = onCancel;

  return (
    <div className="stack">
      <section className="card">
        <div className="field">
          <label htmlFor="cvDate">就诊日期 <span className="field-req">必填</span></label>
          <input id="cvDate" type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} />
          <span className="field-hint">{draft.date === todayISO() ? '今天' : ''}</span>
        </div>
        {error && <p className="field-err" role="alert">{error}</p>}

        <div className="field" style={{ marginTop: 'var(--sp-5)' }}>
          <label htmlFor="cvSummary">这次看病，记下什么？</label>
          <textarea
            id="cvSummary"
            className="rec-textarea"
            maxLength={1000}
            value={draft.summary}
            onChange={(e) => set('summary', e.target.value)}
            placeholder={'看病原因、医生怎么说、下一步安排，记得多少写多少。\n也可以直接把病历、医嘱粘贴进来。'}
          />
          <span className={'field-hint' + (draft.summary.length >= 900 ? ' limit' : '')}>{draft.summary.length}/1000</span>
        </div>

        <div style={{ marginTop: 'var(--sp-5)' }}>
          <Fold title="补充就诊信息（选填）" note={infoSummary}>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', paddingTop: 'var(--sp-3)' }}>
              <div className="field"><label>就诊类型</label>
                <select value={draft.visitType} onChange={(e) => set('visitType', e.target.value)}>
                  {VISIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>医院</label>
                <input value={draft.hospital} maxLength={60} placeholder="如 市第一医院" onChange={(e) => set('hospital', e.target.value)} />
              </div>
              <div className="field"><label>科室</label>
                <input value={draft.department} maxLength={40} placeholder="如 眼科" onChange={(e) => set('department', e.target.value)} />
              </div>
              <div className="field"><label>医生</label>
                <input value={draft.doctor} maxLength={40} placeholder="如 王医生" onChange={(e) => set('doctor', e.target.value)} />
              </div>
            </div>
          </Fold>

          <Fold title="补充诊断与医嘱（选填）" note={diagSummary}>
            <div style={{ paddingTop: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <div className="field"><label>就诊原因</label>
                <input value={draft.chief} maxLength={300} placeholder="这次为什么去看" onChange={(e) => set('chief', e.target.value)} />
              </div>
              <div className="field"><label>医生明确诊断</label>
                <input value={draft.diagnosis} maxLength={300} placeholder="没有明确诊断就留空，不推测" onChange={(e) => set('diagnosis', e.target.value)} />
              </div>
              <div className="field"><label>医嘱 / 备注</label>
                <input value={draft.note} maxLength={300} placeholder="用药、注意事项、复诊安排" onChange={(e) => set('note', e.target.value)} />
              </div>
            </div>
          </Fold>

          <Fold title="添加资料（选填）" note={files.length ? `已添加 ${files.length} 份` : '未添加'}>
            <div style={{ paddingTop: 'var(--sp-3)' }}>
              <div className="form-actions" style={{ marginTop: 0 }}>
                <button className="btn btn-secondary" type="button" onClick={() => camRef.current?.click()}><Icon name="camera" />拍照</button>
                <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void onPickFiles(e.target.files); e.target.value = ''; }} />
                <button className="btn btn-secondary" type="button" onClick={() => fileRef.current?.click()}><Icon name="upload" />选择文件</button>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void onPickFiles(e.target.files); e.target.value = ''; }} />
              </div>
              <div style={{ marginTop: 'var(--sp-3)' }}>
                {files.length ? (
                  <div className="thumb-grid">
                    {files.map((f, i) => (
                      <div className="thumb" key={i}>
                        <img src={f.dataUrl} alt={f.name || '资料'} />
                        <button className="thumb-x" type="button" aria-label="移除这份资料" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}><Icon name="close" /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="field-hint">还没有添加资料。拍照或选择图片，会压到长边 1500px 后存进本机。</p>
                )}
              </div>
              <div className="field" style={{ marginTop: 'var(--sp-4)' }}>
                <label>关联已有报告</label>
                <select value={draft.reportId} onChange={(e) => set('reportId', e.target.value)}>{reportOpts}</select>
                <span className="field-hint">一次就诊只关联 1 份报告；新添加的图片会各自存成报告，只有第 1 份挂到这次就诊。</span>
              </div>
            </div>
          </Fold>
        </div>

        {edit && (
          <div className="notice notice--info" style={{ marginTop: 'var(--sp-5)' }}>
            <Icon name="info" />
            <p><b>本次就诊用药：</b>{(store.data?.medications || []).filter((m) => m.visitId === edit.id).length
              ? `${(store.data?.medications || []).filter((m) => m.visitId === edit.id).length} 项（在就诊详情里管理）`
              : '未添加'}</p>
          </div>
        )}

        <div className="form-actions only-mobile" style={{ marginTop: 'var(--sp-5)' }}>
          <button className="btn btn-primary" type="button" onClick={() => void onSave()} disabled={saving}>{saving ? '保存中…' : '保存记录'}</button>
          <button className="btn btn-secondary" type="button" onClick={onCancel}>取消</button>
        </div>
        <p className="hint" style={{ marginTop: 'var(--sp-4)' }}>以后随时可以补充</p>

        {edit && (
          <div className="form-actions" style={{ marginTop: 'var(--sp-2)' }}>
            <button className="btn btn-danger-ghost" type="button" onClick={() => void onDel()}>删除这条</button>
          </div>
        )}
      </section>
    </div>
  );
}

function stripMeta(v: Visit): Draft {
  const { id: _id, createdAt: _c, revision: _r, ...rest } = v;
  return rest;
}
