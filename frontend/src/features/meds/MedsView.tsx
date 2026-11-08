// 用药记录：结构化用药表，可增/改/删，关联就诊。
// 历史用药不自动视为当前用药；本页不构成续药、停药或调整剂量指令。
import { useEffect, useMemo, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import type { Medication } from '../../api/types';

const uid = () => 'med' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const STATUS: Record<string, string> = { active: '在服', stopped: '已停', paused: '暂停', history: '历史' };
const emptyDraft = () => ({
  name: '', dose: '', frequency: '', route: '', startDate: '', endDate: '',
  purpose: '', status: 'active', note: '', visitId: '',
});

export function MedsView({ go }: { go: (to: string) => void }) {
  const { data, reload } = useStore();
  const { setHead } = useHead();
  const meds = data?.medications ?? [];
  const visits = data?.visits ?? [];
  const [editing, setEditing] = useState<Medication | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHead({ title: '用药记录', sub: '历史用药不自动视为当前用药；本页不构成续药、停药或调整剂量指令' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = useMemo(() => meds.slice().sort((a, b) => {
    const act = (m: Medication) => (m.status === 'active' ? 0 : 1);
    return act(a) - act(b) || (b.startDate || '').localeCompare(a.startDate || '');
  }), [meds]);

  const begin = (m?: Medication) => {
    if (m) { setEditing(m); setDraft({ ...emptyDraft(), ...m } as any); }
    else { setEditing(null); setDraft(emptyDraft()); }
    setOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      let next: Medication[];
      if (editing) {
        next = meds.map((m) => (m.id === editing.id ? { ...m, ...draft } as Medication : m));
      } else {
        next = [...meds, { ...draft, id: uid(), createdAt: Date.now(), infoDate: '', sourceRef: '', toVerify: '' } as unknown as Medication];
      }
      await api.putHistory({ medications: next });
      await reload();
      setOpen(false); setEditing(null);
    } finally { setSaving(false); }
  };
  const del = async (id: string) => {
    await api.putHistory({ medications: meds.filter((m) => m.id !== id) });
    await reload();
  };

  const activeCount = meds.filter((m) => m.status === 'active').length;

  return (
    <div className="stack">
      <div className="seg-row">
        <span className="page-sub">{meds.length} 条 · 在服 {activeCount} 项</span>
        <div className="seg-tools">
          <button className="btn btn-ghost" type="button" onClick={() => go('records')}>就医记录</button>
          <button className="btn btn-primary" type="button" onClick={() => begin()}><Icon name="plus" />新增药物</button>
        </div>
      </div>

      {open && (
        <section className="card">
          <div className="card-head"><h2>{editing ? '编辑药物' : '新增药物'}</h2></div>
          <div className="form-grid">
            <label className="field"><span>药名 / 规格</span><input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="通用名 + 商品名" /></label>
            <label className="field"><span>剂量</span><input value={draft.dose} onChange={(e) => setDraft((d) => ({ ...d, dose: e.target.value }))} placeholder="如 5mg" /></label>
            <label className="field"><span>频次</span><input value={draft.frequency} onChange={(e) => setDraft((d) => ({ ...d, frequency: e.target.value }))} placeholder="如 每日一次" /></label>
            <label className="field"><span>途径</span><input value={draft.route} onChange={(e) => setDraft((d) => ({ ...d, route: e.target.value }))} placeholder="如 口服" /></label>
            <label className="field"><span>开始日期</span><input type="date" value={draft.startDate} onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))} /></label>
            <label className="field"><span>停止日期</span><input type="date" value={draft.endDate} onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))} /></label>
            <label className="field"><span>状态</span><select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="field"><span>用途</span><input value={draft.purpose} onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))} placeholder="治什么问题、谁开的" /></label>
            <label className="field"><span>关联就诊</span><select value={draft.visitId} onChange={(e) => setDraft((d) => ({ ...d, visitId: e.target.value }))}><option value="">（不关联）</option>{visits.map((v: any) => <option key={v.id} value={v.id}>{v.date} {v.visitType || '就诊'}</option>)}</select></label>
            <label className="field"><span>备注</span><input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} /></label>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存'}</button>
            <button className="btn btn-secondary" type="button" onClick={() => { setOpen(false); setEditing(null); }}>取消</button>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>我的用药（结构化）</h2><span className="link">{meds.length} 条</span></div>
        {list.length === 0 ? <p className="hint">未登记用药；历史用药不自动视为当前用药。</p> : (
          <div style={{ overflow: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>药物</th><th>剂量 / 频次</th><th>途径</th><th>起止</th><th>状态</th><th></th></tr></thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <p className="med-name" style={{ margin: 0 }}>{m.name}</p>
                      {m.purpose ? <small style={{ color: 'var(--ink-4)', display: 'block' }}>{m.purpose}</small> : null}
                    </td>
                    <td>{[m.dose, m.frequency].filter(Boolean).join('　') || '—'}</td>
                    <td>{m.route || '—'}</td>
                    <td className="date">{[m.startDate, m.endDate].filter(Boolean).join(' → ') || '—'}</td>
                    <td><span className="chip chip-sm" style={m.status === 'active' ? { color: 'var(--pine-600)' } : undefined}>{STATUS[m.status] || m.status || '—'}</span></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn-plain" type="button" onClick={() => begin(m)}>编辑</button>
                      <button className="btn-plain" type="button" style={{ color: '#B4553F' }} onClick={() => void del(m.id)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint" style={{ marginTop: 12 }}>这里记录药物名称、剂量、频次、途径与起止日期，可关联到某次就诊。</p>
      </section>
    </div>
  );
}
