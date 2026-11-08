// 全部检验记录：不按时间截断，全部 lab 逐条可查、可删、可录入。
import { useEffect, useMemo, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import type { Lab } from '../../api/types';

const CATS = ['血常规', '肝功能', '肾功能', '其他'];
const uid = () => 'lab' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(Number(Number(v).toPrecision(10))));

export function LabsAllView({ go }: { go: (to: string) => void }) {
  const { data, reload } = useStore();
  const { setHead } = useHead();
  const labs = data?.labs ?? [];
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ date: new Date().toISOString().slice(0, 10), category: '血常规', name: '', value: '', unit: '', low: '', high: '', note: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHead({ title: '全部检验记录', sub: '不按「最近」截断：全部结果都在这里，逐条可改' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cats = useMemo(() => [...new Set(labs.map((l) => l.category).filter(Boolean))].sort((a, b) => {
    const ia = CATS.indexOf(a), ib = CATS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'zh');
  }), [labs]);

  const rows = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return labs
      .filter((l) => (!cat || l.category === cat) && (!kw || `${l.name} ${l.note} ${l.source}`.toLowerCase().includes(kw)))
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [labs, cat, q]);

  const add = async () => {
    if (!draft.name.trim()) return;
    const rec: Lab = {
      id: uid(), date: draft.date, category: draft.category, name: draft.name,
      value: draft.value === '' ? null : parseFloat(draft.value),
      unit: draft.unit, low: draft.low === '' ? null : parseFloat(draft.low), high: draft.high === '' ? null : parseFloat(draft.high),
      qualitative: '', flag: '', source: '手动录入', note: draft.note, reportId: '',
    };
    setSaving(true);
    try {
      await api.putTable('labs', [...labs, rec]);
      await reload();
      setDraft({ ...draft, name: '', value: '', unit: '', low: '', high: '', note: '' });
      setAdding(false);
    } finally { setSaving(false); }
  };
  const del = async (id: string) => {
    await api.putTable('labs', labs.filter((l) => l.id !== id));
    await reload();
  };

  return (
    <div className="stack">
      <div className="seg-row">
        <span className="page-sub">{rows.length} / {labs.length} 条</span>
        <div className="seg-tools">
          <button className="btn btn-ghost" type="button" onClick={() => go('metrics')}>趋势图</button>
          <button className="btn btn-primary" type="button" onClick={() => setAdding((v) => !v)}><Icon name="plus" />录入结果</button>
        </div>
      </div>

      {adding && (
        <section className="card">
          <div className="card-head"><h2>录入检验结果</h2></div>
          <div className="form-grid">
            <label className="field"><span>日期</span><input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} /></label>
            <label className="field"><span>类别</span><select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="field"><span>项目</span><input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="如 血红蛋白" /></label>
            <label className="field"><span>结果</span><input type="number" step="0.01" value={draft.value} onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))} /></label>
            <label className="field"><span>单位</span><input value={draft.unit} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))} /></label>
            <label className="field"><span>参考下限</span><input type="number" step="0.01" value={draft.low} onChange={(e) => setDraft((d) => ({ ...d, low: e.target.value }))} /></label>
            <label className="field"><span>参考上限</span><input type="number" step="0.01" value={draft.high} onChange={(e) => setDraft((d) => ({ ...d, high: e.target.value }))} /></label>
            <label className="field"><span>备注</span><input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} /></label>
          </div>
          <div className="form-actions"><button className="btn btn-primary" type="button" disabled={saving} onClick={() => void add()}>{saving ? '保存中…' : '保存'}</button><button className="btn btn-secondary" type="button" onClick={() => setAdding(false)}>取消</button></div>
        </section>
      )}

      <section className="card">
        <div className="laball-toolbar" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="项目、备注、来源" style={{ flex: 1 }} />
          <select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">全部类别</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </div>
        {rows.length === 0 ? <p className="hint">没有匹配记录。</p> : (
          <div style={{ overflow: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>日期</th><th>项目</th><th>结果</th><th>参考范围</th><th>提示</th><th>来源</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const hi = r.value !== null && r.high !== null && r.value > r.high;
                  const lo = r.value !== null && r.low !== null && r.value < r.low;
                  const flag = r.flag === 'H' || hi ? '↑ 偏高' : r.flag === 'L' || lo ? '↓ 偏低' : r.low === null && r.high === null ? '—' : '正常';
                  const bad = hi || lo || r.flag === 'H' || r.flag === 'L';
                  return (
                    <tr key={r.id}>
                      <td><span className="ts">{r.date}</span></td>
                      <td>{r.name}<small style={{ color: 'var(--ink-4)' }}>　{r.category}</small></td>
                      <td style={bad ? { color: '#B4553F', fontWeight: 600 } : undefined}>{r.value === null ? (r.qualitative || '—') : num(r.value)} {r.unit}</td>
                      <td>{r.low === null && r.high === null ? '未记录' : `${num(r.low)} – ${num(r.high)}`}</td>
                      <td style={bad ? { color: '#B4553F' } : undefined}>{flag}</td>
                      <td>{r.source || '—'}</td>
                      <td style={{ textAlign: 'right' }}><button className="icon-btn" type="button" aria-label="删除" onClick={() => void del(r.id)}><Icon name="close" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint" style={{ marginTop: 10 }}>「提示」列只与这条记录自己填的参考范围比较，未填范围时显示 —，不代表正常。</p>
      </section>
    </div>
  );
}
