// 日常健康 · 体重与饮食 · 饮食段（复刻旧 dietDayFormHTML，js/app.views.body.js:814）。
// 每日饮食记录：三餐、加餐、摄入估算、完整度、小结，含近 7 天执行摘要。
// 增强：每餐支持拍照 → AI 估算热量范围与营养素，回填到该餐记录（照片暂存本地 /files/）。
import { useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import type { DietDay } from '../../api/types';

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => 'dd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const numOrNull = (s: string) => (s === '' ? null : Number.isFinite(parseFloat(s)) ? parseFloat(s) : null);
const COMPLETENESS = ['全部记录', '大部分记录', '部分记录', '仅主食', '未填'];

// 四餐：key 对应 DietDay 上的文本字段（早/午/晚/加餐）
const MEALS: { key: 'breakfast' | 'lunch' | 'dinner' | 'snack'; label: string }[] = [
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
  { key: 'snack', label: '加餐 / 零食' },
];

type MealNutrition = { protein?: number | null; fat?: number | null; carb?: number | null; fiber?: number | null };
type MealEstimate = {
  dish: string;
  kcal: { low: number | null; center: number | null; high: number | null };
  nutrition: MealNutrition;
  items: { name: string; portion: string; kcal: number | null }[];
  confidence: string;
  note: string;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
const parseNutrition = (s?: string): MealNutrition => {
  if (!s) return {};
  try { return JSON.parse(s) as MealNutrition; } catch { return {}; }
};

export function DietSeg() {
  const { data, reload } = useStore();
  const [form, setForm] = useState<null | DietDay>(null);
  const [saving, setSaving] = useState(false);
  // 每餐的照片估算状态：mealKey → {busy, err, est}
  const [est, setEst] = useState<Record<string, { busy: boolean; err: string; est: MealEstimate | null }>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const blank: DietDay = {
    id: '', date: today(), morningWeight: null, weightNote: '', waist: null, sleep: '', hunger: '', ankle: '',
    breakfast: '', lunch: '', dinner: '', snack: '', kcalCenter: null, kcalLow: null, kcalHigh: null,
    budget: '', completeness: '', summary: '', note: '', photo: '', meal: '', nutrition: '', createdAt: 0,
  };

  // 选图 → 本地预览 + 调 AI 估算 → 回填该餐文本与热量/营养素（保留照片 dataURL，保存时由后端落盘）
  const onPickMeal = async (mealKey: string, file: File) => {
    const dataUrl = await readFileAsDataUrl(file);
    setForm((f) => (f ? { ...f, photo: dataUrl, meal: mealKey } : f));
    setEst((e) => ({ ...e, [mealKey]: { busy: true, err: '', est: null } }));
    try {
      const r = await api.ai.meal(dataUrl);
      const estimate: MealEstimate = {
        dish: String(r?.dish ?? ''),
        kcal: {
          low: r?.kcal?.low ?? null,
          center: r?.kcal?.center ?? null,
          high: r?.kcal?.high ?? null,
        },
        nutrition: r?.nutrition ?? {},
        items: Array.isArray(r?.items) ? r.items : [],
        confidence: String(r?.confidence ?? ''),
        note: String(r?.note ?? ''),
      };
      setEst((e) => ({ ...e, [mealKey]: { busy: false, err: '', est: estimate } }));
      // 回填：仅当确实估出有效热量才写入（识别失败返回 0/空时保留原值，不把真实数据冲成 0）
      const kcalC = estimate.kcal.center;
      const valid = kcalC != null && kcalC > 0;
      setForm((f) => {
        if (!f) return f;
        const next: DietDay = {
          ...f,
          [mealKey]: f[mealKey as keyof DietDay]
            ? String(f[mealKey as keyof DietDay])
            : estimate.dish,
          photo: dataUrl,
          meal: mealKey,
        };
        if (valid) {
          next.kcalCenter = kcalC;
          next.kcalLow = estimate.kcal.low ?? kcalC;
          next.kcalHigh = estimate.kcal.high ?? kcalC;
          next.nutrition = JSON.stringify(estimate.nutrition);
        }
        return next;
      });
    } catch (e: any) {
      setEst((x) => ({ ...x, [mealKey]: { busy: false, err: e?.message || '估算失败', est: null } }));
    }
  };

  const days = (data?.dietDays ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const days7 = days.filter((d) => Date.now() - Date.parse(d.date + 'T00:00:00') <= 7 * 864e5);
  const kcal7 = days7.map((d) => d.kcalCenter).filter((n): n is number => Number.isFinite(n as number));
  const kcalAvg = kcal7.length ? kcal7.reduce((s, x) => s + x, 0) / kcal7.length : null;
  const complete7 = days7.filter((d) => d.completeness && d.completeness !== '未填').length;

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
            {MEALS.map(({ key, label }) => {
              const st = est[key];
              const showPhoto = form.photo && form.meal === key ? form.photo : null;
              return (
                <div className="field wide" key={key} style={{ gridColumn: '1 / -1' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {label}
                    <label className="btn-plain" style={{ fontSize: 12, cursor: 'pointer', color: 'var(--pine-2)' }}>
                      📷 拍照估算
                      <input
                        ref={(el) => { fileRefs.current[key] = el; }}
                        type="file" accept="image/*" hidden
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPickMeal(key, f); e.target.value = ''; }}
                      />
                    </label>
                    {st?.busy && <span className="hint" style={{ margin: 0 }}>AI 估算中…</span>}
                  </span>
                  <input value={String(form[key as 'breakfast' | 'lunch' | 'dinner' | 'snack'] ?? '')} onChange={(e) => setForm((f) => (f ? { ...f, [key]: e.target.value } : f))} placeholder="未吃写「未吃」，没记写「未记录」" />
                  {st?.err && <span className="hint" style={{ margin: 0, color: 'var(--st-danger)' }}>{st.err}</span>}
                  {showPhoto && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 6 }}>
                      <img src={showPhoto} alt="餐食照片" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }} />
                      {st?.est && (
                        <div className="hint" style={{ margin: 0, lineHeight: 1.6 }}>
                          <b style={{ color: 'var(--ink)' }}>{st.est.dish || label}</b>
                          {st.est.kcal.center != null && <> · 约 <b>{st.est.kcal.low ?? '?'}–{st.est.kcal.high ?? '?'}</b> kcal（中心 {st.est.kcal.center}）</>}
                          <br />蛋白质 {st.est.nutrition.protein ?? '—'}g · 脂肪 {st.est.nutrition.fat ?? '—'}g · 碳水 {st.est.nutrition.carb ?? '—'}g · 膳食纤维 {st.est.nutrition.fiber ?? '—'}g
                          {st.est.confidence && <><br />把握度：{st.est.confidence}{st.est.note ? ` · ${st.est.note}` : ''}</>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
                  <thead><tr><th>日期</th><th>照片</th><th>晨重</th><th>摄入中心</th><th>营养素</th><th>完整度</th><th /></tr></thead>
                  <tbody>
                    {days.slice(0, 60).map((d) => {
                      const nu = parseNutrition(d.nutrition);
                      const hasNu = nu.protein != null || nu.fat != null || nu.carb != null || nu.fiber != null;
                      return (
                        <tr key={d.id}>
                          <td className="date">{d.date}</td>
                          <td>{d.photo ? <img src={d.photo} alt="餐食" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} /> : '—'}</td>
                          <td className="num">{d.morningWeight != null ? `${d.morningWeight} kg` : '—'}</td>
                          <td className="num">
                            {d.kcalLow != null || d.kcalHigh != null
                              ? `${d.kcalLow ?? '?'}–${d.kcalHigh ?? '?'}`
                              : d.kcalCenter != null ? `${d.kcalCenter} kcal` : '—'}
                            {(d.kcalLow != null || d.kcalHigh != null) && d.kcalCenter != null && <small style={{ color: 'var(--ink-4)' }}> 中心 {d.kcalCenter}</small>}
                          </td>
                          <td>{hasNu ? <span style={{ fontSize: 12 }}>P{nu.protein ?? '—'} F{nu.fat ?? '—'} C{nu.carb ?? '—'}</span> : '—'}</td>
                          <td>{d.completeness || '未填'}</td>
                          <td className="act">
                            <button type="button" onClick={() => setForm({ ...d })}>编辑</button>
                            <button className="danger" type="button" onClick={() => void del(d.id)}>删除</button>
                          </td>
                        </tr>
                      );
                    })}
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
