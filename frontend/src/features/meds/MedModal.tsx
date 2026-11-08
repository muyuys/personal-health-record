// 用药弹窗：复刻老版 js/app.modal.js 的用药查看/编辑（med-edit / openMedicationForm）。
// 字段：name* / dose / frequency / route(select) / status(select) / startDate / endDate /
// purpose / visitId(select 关联就诊) / infoDate / sourceRef / toVerify / note。
// 保存走 api.putHistory({ medications: next })；删除同理；保存后关闭。
import { useState } from 'react';
import { Icon } from '../../components/icons';
import { useModal } from '../../components/Modal';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import type { Medication } from '../../api/types';

const uid = () => 'med' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ROUTES = ['口服', '外用', '滴眼', '滴鼻', '吸入', '注射', '含服', '其他'];
const STATUS: [string, string][] = [
  ['active', '在服'],
  ['stopped', '已停'],
  ['unknown', '待确认'],
];

type Draft = {
  name: string;
  dose: string;
  frequency: string;
  route: string;
  status: string;
  startDate: string;
  endDate: string;
  purpose: string;
  visitId: string;
  infoDate: string;
  sourceRef: string;
  toVerify: string;
  note: string;
};

const emptyDraft = (): Draft => ({
  name: '', dose: '', frequency: '', route: '口服', status: 'active',
  startDate: '', endDate: '', purpose: '', visitId: '',
  infoDate: '', sourceRef: '', toVerify: '', note: '',
});

const fromMed = (m: Medication): Draft => ({
  name: m.name || '', dose: m.dose || '', frequency: m.frequency || '',
  route: m.route || '口服', status: m.status || 'active',
  startDate: m.startDate || '', endDate: m.endDate || '',
  purpose: m.purpose || '', visitId: m.visitId || '',
  infoDate: m.infoDate || '', sourceRef: m.sourceRef || '', toVerify: m.toVerify || '',
  note: m.note || '',
});

const statusLabel = (s: string) => (STATUS.find((x) => x[0] === s) || ['', s])[1];

export interface OpenMedModalArgs {
  mode: 'view' | 'edit';
  med?: Medication | null;
  onSaved?: () => void;
  onDeleted?: () => void;
}

export function useMedModal() {
  const { openModal, closeModal } = useModal();
  return (args: OpenMedModalArgs) => {
    openModal(<MedModalBody {...args} close={closeModal} />);
  };
}

function MedModalBody({ mode, med, onSaved, onDeleted, close }: OpenMedModalArgs & { close: () => void }) {
  const [curMode, setCurMode] = useState<'view' | 'edit'>(mode === 'edit' || !med ? 'edit' : 'view');
  const { data, reload } = useStore();
  const meds = data?.medications ?? [];
  const visits = data?.visits ?? [];
  const [draft, setDraft] = useState<Draft>(med ? fromMed(med) : emptyDraft());
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      let next: Medication[];
      if (med) {
        next = meds.map((m) => (m.id === med.id ? ({ ...m, ...draft } as Medication) : m));
      } else {
        next = [...meds, { ...draft, id: uid(), createdAt: Date.now() } as unknown as Medication];
      }
      await api.putHistory({ medications: next });
      await reload();
      onSaved?.();
      close();
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!med) return;
    if (!window.confirm('删除这条用药记录？')) return;
    await api.putHistory({ medications: meds.filter((m) => m.id !== med.id) });
    await reload();
    onDeleted?.();
    close();
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  if (curMode === 'view' && med) {
    const rows: [string, string][] = [
      ['药名 / 规格', med.name],
      ['剂量', med.dose],
      ['频次', med.frequency],
      ['途径', med.route],
      ['状态', statusLabel(med.status)],
      ['开始日期', med.startDate],
      ['停止日期', med.endDate],
      ['用途', med.purpose],
      ['关联就诊', visits.find((v: any) => v.id === med.visitId) ? `${(visits.find((v: any) => v.id === med.visitId) as any).date} ${(visits.find((v: any) => v.id === med.visitId) as any).visitType || '就诊'}` : ''],
      ['信息日期', med.infoDate],
      ['来源', med.sourceRef],
      ['待核实', med.toVerify],
      ['备注', med.note],
    ];
    return (
      <>
        <div className="modal-head">
          <div>
            <h2>{med.name || '用药'}</h2>
            <p>{[med.dose, med.frequency, statusLabel(med.status)].filter(Boolean).join(' · ')}</p>
          </div>
          <button className="modal-close" type="button" aria-label="关闭" onClick={close}><Icon name="close" /></button>
        </div>
        <div className="form-grid">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div className="field" key={k}>
              <span>{k}</span>
              <p style={{ margin: 0, fontSize: 14 }}>{v}</p>
            </div>
          ))}
        </div>
        <div className="form-actions" style={{ marginTop: 'var(--sp-5)' }}>
          <button className="btn btn-primary" type="button" onClick={() => setCurMode('edit')}><Icon name="edit" />编辑</button>
          <button className="btn btn-secondary" type="button" style={{ color: '#B4553F' }} onClick={() => void del()}>删除</button>
          <button className="btn btn-secondary" type="button" onClick={close}>关闭</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="modal-head">
        <div>
          <h2>{med ? '编辑用药' : '记一次用药'}</h2>
          <p>历史用药不自动视为当前用药；本记录不构成续药、停药或调整剂量指令</p>
        </div>
        <button className="modal-close" type="button" aria-label="关闭" onClick={close}><Icon name="close" /></button>
      </div>
      <div className="form-grid">
        <label className="field"><span>药名 / 规格 *</span><input maxLength={80} value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="通用名 + 商品名" /></label>
        <label className="field"><span>剂量</span><input maxLength={60} value={draft.dose} onChange={(e) => set('dose', e.target.value)} placeholder="如 5mg" /></label>
        <label className="field"><span>频次</span><input maxLength={60} value={draft.frequency} onChange={(e) => set('frequency', e.target.value)} placeholder="如 每日一次" /></label>
        <label className="field"><span>途径</span><select value={draft.route} onChange={(e) => set('route', e.target.value)}>{ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
        <label className="field"><span>状态</span><select value={draft.status} onChange={(e) => set('status', e.target.value)}>{STATUS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="field"><span>开始日期</span><input type="date" value={draft.startDate} onChange={(e) => set('startDate', e.target.value)} /></label>
        <label className="field"><span>停止日期</span><input type="date" value={draft.endDate} onChange={(e) => set('endDate', e.target.value)} /></label>
        <label className="field"><span>用途</span><input maxLength={120} value={draft.purpose} onChange={(e) => set('purpose', e.target.value)} placeholder="治什么问题、谁开的" /></label>
        <label className="field"><span>关联就诊</span><select value={draft.visitId} onChange={(e) => set('visitId', e.target.value)}><option value="">（不关联）</option>{visits.map((v: any) => <option key={v.id} value={v.id}>{v.date} {v.visitType || '就诊'}</option>)}</select></label>
        <label className="field"><span>信息日期</span><input type="date" value={draft.infoDate} onChange={(e) => set('infoDate', e.target.value)} /></label>
        <label className="field"><span>来源</span><input maxLength={200} value={draft.sourceRef} onChange={(e) => set('sourceRef', e.target.value)} /></label>
        <label className="field"><span>待核实</span><input maxLength={300} value={draft.toVerify} onChange={(e) => set('toVerify', e.target.value)} /></label>
        <label className="field"><span>备注</span><input maxLength={300} value={draft.note} onChange={(e) => set('note', e.target.value)} /></label>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存'}</button>
        {med ? <button className="btn btn-secondary" type="button" style={{ color: '#B4553F' }} onClick={() => void del()}>删除</button> : null}
        <button className="btn btn-secondary" type="button" onClick={() => (med ? setCurMode('view') : close())}>取消</button>
      </div>
    </>
  );
}
