// 日常健康 · 体重与饮食 · 饮食段（复刻旧 dietDayFormHTML，js/app.views.body.js:814）。
// 每日饮食记录：三餐、加餐、摄入估算、完整度、小结，含近 7 天执行摘要。
import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import type { DietDay } from '../../api/types';

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => 'dd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const numOrNull = (s: string) => (s === '' ? null : Number.isFinite(parseFloat(s)) ? parseFloat(s) : null);
const COMPLETENESS = ['全部记录', '大部分记录', '部分记录', '仅主食', '未填'];

export function DietSeg() {
  const { data, reload } = useStore();
  const [form, setForm] = useState<null | DietDay>(null);
  const [saving, setSaving] = useState(false);
  const days = (data?.dietDays ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const days7 = days.filter((d) => Date.now() - Date.parse(d.date + 'T00:00:00') <= 7 * 864e5);
  const kcal7 = days7.map((d) => d.kcalCenter).filter((n): n is number => Number.isFinite(n as number));
  const kcalAvg = kcal7.length ? kcal7.reduce((s, x) => s + x, 0) / kcal7.length : null;
  const complete7 = days7.filter((d) => d.completeness && d.completeness !== '未填').length;

  const blank: DietDay = {
    id: '', date: today(), morningWeight: null, weightNote: '', waist: null, sleep: '', hunger: '', ankle: '',
    breakfast: '', lunch: '', dinner: '', snack: '', kcalCenter: null, kcalLow: null, kcalHigh: null,
    budget: '', completeness: '', summary: '', note: '', createdAt: 0,
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const isNew = !form.id;
      const rec: DietDay = { ...form, id: form.id || uid(), createdAt: form.createdAt || Date.now() };
      // 同日已有记录则覆盖
      const existing = isNew ? days.find((d) => d.date === rec.date) : null;
      let next: DietDay[];
      if (existing) next = (data?.dietDays ?? []).map((d) => (d.id === existing.id ? { ...rec, id: existing.id, createdAt: existing.createdAt } : d));
      else next = [...(data?.dietDays ?? []), rec];
      await api.putTable('diet-days', next);
      await reload();
      setForm(null);
    } finally {
      setSaving(false);
    }
  };
  const del = async (id: string) => {
    await api.putTable('diet-days', (data?.dietDays ?? []).filter((d) => d.id !== id));
    await reload();
  };

  const field = (label: string, key: keyof DietDay, type = 'text', extra: Record<string, unknown> = {}) => (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={(form?.[key] as string | number | undefined) ?? ''}
        onChange={(e) => setForm((f) => (f ? { ...f, [key]: type === 'number' ? numOrNull(e.target.value) : e.target.value } : f))}
        {...extra}
      />
    </label>
  );

  return (
    <>
      {/* 近 7 天执行摘要 */}
      <section className="card">
        <div className="card-head"><h2>近 7 天饮食执行</h2><span className="link">{days7.length} 天有记录</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
          <div className="stat"><small>摄入中心均值</small><b>{kcalAvg === null ? '—' : Math.round(kcalAvg)}</b><i>{kcalAvg === null ? '无估算' : 'kcal'}</i></div>
          <div className="stat"><small>完整记录天数</small><b>{complete7}</b><i>/ {days7.length} 天</i></div>
          <div className="stat"><small>累计每日记录</small><b>{days.length}</b><i>条</i></div>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>摄入为估算中心值，仅回看趋势，不作为极端减餐依据；「完整度」按你记录时自评。</p>
      </section>

      {form ? (
        <section className="card">
          <div className="card-head"><h2>{form.id ? '编辑每日记录' : '记录今天'}</h2></div>
          <div className="form-grid">
            {field('日期 *', 'date', 'date')}
            {field('标准晨重 kg', 'morningWeight', 'number', { step: '0.1', placeholder: '晨起排尿后、进食前、同秤' })}
            <label className="field wide"><span>称重条件 / 其他体重</span><input value={form.weightNote} onChange={(e) => setForm((f) => (f ? { ...f, weightNote: e.target.value } : f))} /></label>
            {field('腰围 cm', 'waist', 'number', { step: '0.1' })}
            {field('睡眠 小时', 'sleep')}
            <label className="field wide"><span>饥饿 / 精神状态</span><input value={form.hunger} onChange={(e) => setForm((f) => (f ? { ...f, hunger: e.target.value } : f))} /></label>
            <label className="field wide"><span>右踝反应</span><input value={form.ankle} onChange={(e) => setForm((f) => (f ? { ...f, ankle: e.target.value } : f))} /></label>
            <label className="field wide"><span>早餐</span><input value={form.breakfast} onChange={(e) => setForm((f) => (f ? { ...f, breakfast: e.target.value } : f))} placeholder="未吃写「未吃」，没记写「未记录」" /></label>
            <label className="field wide"><span>午餐</span><input value={form.lunch} onChange={(e) => setForm((f) => (f ? { ...f, lunch: e.target.value } : f))} /></label>
            <label className="field wide"><span>晚餐</span><input value={form.dinner} onChange={(e) => setForm((f) => (f ? { ...f, dinner: e.target.value } : f))} /></label>
            <label className="field wide"><span>饮料 / 零食 / 加餐</span><input value={form.snack} onChange={(e) => setForm((f) => (f ? { ...f, snack: e.target.value } : f))} /></label>
            {field('摄入中心值 kcal', 'kcalCenter', 'number', { step: '1' })}
            {field('摄入下限 kcal', 'kcalLow', 'number', { step: '1' })}
            {field('摄入上限 kcal', 'kcalHigh', 'number', { step: '1' })}
            <label className="field"><span>当日预算 kcal</span><input value={form.budget} onChange={(e) => setForm((f) => (f ? { ...f, budget: e.target.value } : f))} placeholder="当前起步 1800" /></label>
            <label className="field"><span>完整度</span>
              <select value={form.completeness} onChange={(e) => setForm((f) => (f ? { ...f, completeness: e.target.value } : f))}>
                <option value="">未填</option>
                {COMPLETENESS.filter((c) => c !== '未填').map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field wide"><span>当天小结 / 明日只调整一件事</span><input value={form.summary} onChange={(e) => setForm((f) => (f ? { ...f, summary: e.target.value } : f))} /></label>
            <label className="field wide"><span>备注</span><input value={form.note} onChange={(e) => setForm((f) => (f ? { ...f, note: e.target.value } : f))} /></label>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>空白 = 未记录，不代表 0；没吃请写「未吃」。摄入中心值与范围是估算，不是精确测量。</p>
          <div className="form-actions">
            <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : form.id ? '保存修改' : '保存每日记录'}</button>
            <button className="btn btn-secondary" type="button" onClick={() => setForm(null)}>取消</button>
            {form.id && <button className="btn btn-secondary" type="button" onClick={() => { void del(form.id); setForm(null); }}>删除这条</button>}
          </div>
        </section>
      ) : (
        <>
          <div className="form-actions" style={{ marginTop: 0 }}>
            <button className="btn btn-primary" type="button" onClick={() => setForm({ ...blank })}>
              + 记录今天
            </button>
          </div>
          <section className="card">
            <div className="card-head"><h2>每日记录</h2><span className="link">{days.length} 条</span></div>
            {days.length === 0 ? <p className="hint">还没有每日记录——先记今天的三餐、晨重与摄入估算。</p> : (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>日期</th><th>晨重</th><th>摄入中心</th><th>完整度</th><th /></tr></thead>
                  <tbody>
                    {days.slice(0, 60).map((d) => (
                      <tr key={d.id}>
                        <td className="date">{d.date}</td>
                        <td className="num">{d.morningWeight != null ? `${d.morningWeight} kg` : '—'}</td>
                        <td className="num">{d.kcalCenter != null ? `${d.kcalCenter} kcal` : '—'}</td>
                        <td>{d.completeness || '未填'}</td>
                        <td className="act">
                          <button type="button" onClick={() => setForm({ ...d })}>编辑</button>
                          <button className="danger" type="button" onClick={() => void del(d.id)}>删除</button>
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
