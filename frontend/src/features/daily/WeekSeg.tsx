// 日常健康 · 体重与饮食 · 复盘段（周复盘）。复刻旧 slImWeekHTML / 周复盘表单意图。
import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import type { DietWeek } from '../../api/types';

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => 'dw' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const numOrNull = (s: string) => (s === '' ? null : Number.isFinite(parseFloat(s)) ? parseFloat(s) : null);

export function WeekSeg() {
  const { data, reload } = useStore();
  const [form, setForm] = useState<null | DietWeek>(null);
  const [saving, setSaving] = useState(false);
  const weeks = (data?.dietWeeks ?? []).slice().sort((a, b) => b.weekStart.localeCompare(a.weekStart));

  const blank: DietWeek = {
    id: '', weekStart: today(), weekEnd: '', reviewDate: today(), weightDays: null, weightAvg: null, weightPrevAvg: null,
    waist: null, completeDays: null, kcalCenter: null, kcalLow: null, kcalHigh: null, ankle: '', energy: '',
    observeMiss: '', observeHabit: '', observeDiff: '', nextFocus: '', adjust: '', note: '', createdAt: 0,
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const rec: DietWeek = { ...form, id: form.id || uid(), createdAt: form.createdAt || Date.now() };
      let next: DietWeek[];
      const existing = !form.id ? weeks.find((w) => w.weekStart === rec.weekStart) : null;
      if (existing) next = (data?.dietWeeks ?? []).map((w) => (w.id === existing.id ? { ...rec, id: existing.id, createdAt: existing.createdAt } : w));
      else next = [...(data?.dietWeeks ?? []), rec];
      await api.putTable('diet-weeks', next);
      await reload();
      setForm(null);
    } finally {
      setSaving(false);
    }
  };
  const del = async (id: string) => {
    await api.putTable('diet-weeks', (data?.dietWeeks ?? []).filter((w) => w.id !== id));
    await reload();
  };

  const text = (label: string, key: keyof DietWeek, wide = true) => (
    <label className={'field' + (wide ? ' wide' : '')}>
      <span>{label}</span>
      <input value={(form?.[key] as string | undefined) ?? ''} onChange={(e) => setForm((f) => (f ? { ...f, [key]: e.target.value } : f))} />
    </label>
  );
  const numF = (label: string, key: keyof DietWeek) => (
    <label className="field">
      <span>{label}</span>
      <input type="number" step="0.1" value={(form?.[key] as number | null | undefined) ?? ''} onChange={(e) => setForm((f) => (f ? { ...f, [key]: numOrNull(e.target.value) } : f))} />
    </label>
  );

  return (
    <>
      {form ? (
        <section className="card">
          <div className="card-head"><h2>{form.id ? '编辑周复盘' : '写周复盘'}</h2></div>
          <div className="form-grid">
            <label className="field"><span>周起始 *</span><input type="date" value={form.weekStart} onChange={(e) => setForm((f) => (f ? { ...f, weekStart: e.target.value } : f))} /></label>
            <label className="field"><span>周结束</span><input type="date" value={form.weekEnd} onChange={(e) => setForm((f) => (f ? { ...f, weekEnd: e.target.value } : f))} /></label>
            <label className="field"><span>复盘日期</span><input type="date" value={form.reviewDate} onChange={(e) => setForm((f) => (f ? { ...f, reviewDate: e.target.value } : f))} /></label>
            {numF('晨重记录天数', 'weightDays')}
            {numF('本周晨重均值', 'weightAvg')}
            {numF('上周晨重均值', 'weightPrevAvg')}
            {numF('腰围 cm', 'waist')}
            {numF('完整记录天数', 'completeDays')}
            {numF('摄入中心均值', 'kcalCenter')}
            {text('右踝反应', 'ankle')}
            {text('精力 / 精神状态', 'energy')}
            {text('观察到的问题（漏记）', 'observeMiss')}
            {text('观察到的习惯变化', 'observeHabit')}
            {text('与上周差异', 'observeDiff')}
            {text('下周重点（只定一件事）', 'nextFocus')}
            {text('需要调整的地方', 'adjust')}
            {text('备注', 'note')}
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : form.id ? '保存修改' : '保存周复盘'}</button>
            <button className="btn btn-secondary" type="button" onClick={() => setForm(null)}>取消</button>
            {form.id && <button className="btn btn-secondary" type="button" onClick={() => { void del(form.id); setForm(null); }}>删除这条</button>}
          </div>
        </section>
      ) : (
        <>
          <div className="form-actions" style={{ marginTop: 0 }}>
            <button className="btn btn-primary" type="button" onClick={() => setForm({ ...blank })}>+ 写周复盘</button>
          </div>
          <section className="card">
            <div className="card-head"><h2>每周复盘</h2><span className="link">{weeks.length} 条</span></div>
            {weeks.length === 0 ? <p className="hint">还没有每周复盘——每 7 天填一次，回看晨重均值与平均摄入。</p> : (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>周起始</th><th>晨重均值</th><th>摄入中心</th><th>下周重点</th><th /></tr></thead>
                  <tbody>
                    {weeks.map((w) => (
                      <tr key={w.id}>
                        <td className="date">{w.weekStart}</td>
                        <td className="num">{w.weightAvg != null ? `${w.weightAvg} kg` : '—'}</td>
                        <td className="num">{w.kcalCenter != null ? `${w.kcalCenter} kcal` : '—'}</td>
                        <td style={{ color: 'var(--ink-4)', fontSize: 11 }}>{w.nextFocus || '—'}</td>
                        <td className="act">
                          <button type="button" onClick={() => setForm({ ...w })}>编辑</button>
                          <button className="danger" type="button" onClick={() => void del(w.id)}>删除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
