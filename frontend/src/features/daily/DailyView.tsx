// 日常健康：五个分段（体重/体征/症状/睡眠/饮食）的 React 实现。
// 目标：与旧前端功能对等——列出记录、可新增、可删除；参考范围异常标红。
// 数据经整表替换接口（PUT /api/<table>）保存，保存后 reload 全量。
import { useEffect, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import type { Vital, Symptom, SleepLog, Weight, DietDay } from '../../api/types';

// 参考区间（对齐 js/app.core.js VITAL_RANGES）
const VITAL_METRICS = [
  { k: 'systolic', label: '收缩压', unit: 'mmHg', dec: 0 },
  { k: 'diastolic', label: '舒张压', unit: 'mmHg', dec: 0 },
  { k: 'pulse', label: '心率', unit: '次/分', dec: 0 },
  { k: 'temperature', label: '体温', unit: '℃', dec: 1 },
  { k: 'spo2', label: '血氧饱和度', unit: '%', dec: 0 },
  { k: 'glucose', label: '血糖', unit: 'mmol/L', dec: 1 },
] as const;
const VITAL_RANGES: Record<string, [number, number]> = {
  systolic: [90, 139], diastolic: [60, 89], pulse: [60, 100],
  temperature: [36.0, 37.3], spo2: [95, 100], glucose: [3.9, 6.1],
};
function vitalRange(k: string, rec?: Vital): [number, number] {
  if (k === 'glucose' && rec?.glucoseTag && rec.glucoseTag !== 'fasting') return [3.9, 7.8];
  return VITAL_RANGES[k] || [0, 0];
}
function vitalFlag(k: string, v: number | null | undefined, rec?: Vital): '' | 'H' | 'L' | 'N' {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  const [lo, hi] = vitalRange(k, rec);
  if (v < lo) return 'L';
  if (v > hi) return 'H';
  return 'N';
}

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const SEGMENTS = [
  { k: 'weight', label: '体重' },
  { k: 'vitals', label: '体征' },
  { k: 'symptoms', label: '症状' },
  { k: 'sleep', label: '睡眠' },
  { k: 'diet', label: '饮食' },
] as const;
type Seg = (typeof SEGMENTS)[number]['k'];

function SegChips({ active, onChange }: { active: Seg; onChange: (s: Seg) => void }) {
  return (
    <div className="filter-row" style={{ marginBottom: 4 }}>
      {SEGMENTS.map((s) => (
        <button key={s.k} type="button" className={'filter-chip' + (s.k === active ? ' on' : '')} onClick={() => onChange(s.k)}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function DailyView() {
  const { setHead } = useHead();
  const [seg, setSeg] = useState<Seg>('weight');
  useEffect(() => {
    setHead({ title: '日常健康', sub: '体重 · 体征 · 症状 · 睡眠 · 饮食，按分段记录，超参考范围会标红' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="stack">
      <SegChips active={seg} onChange={setSeg} />
      {seg === 'weight' && <WeightSeg />}
      {seg === 'vitals' && <VitalsSeg />}
      {seg === 'symptoms' && <SymptomsSeg />}
      {seg === 'sleep' && <SleepSeg />}
      {seg === 'diet' && <DietSeg />}
    </div>
  );
}

// ---------- 通用：保存后 reload ----------

// ---------- 体重 ----------
function WeightSeg() {
  const { data, reload } = useStore();
  const [kg, setKg] = useState('');
  const [date, setDate] = useState(today());
  const [tag, setTag] = useState('morning');
  const [saving2, setSaving2] = useState(false);
  const rows = (data?.weights ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));

  const saveStateWeights = async (weights: Weight[]) => {
    setSaving2(true);
    try {
      await api.putState({ weights, done: data?.done ?? {}, body: data?.body ?? [] });
      await reload();
      return true;
    } finally {
      setSaving2(false);
    }
  };
  const addReal = async () => {
    const v = parseFloat(kg);
    if (!Number.isFinite(v)) return;
    const rec: Weight = { id: uid(), date, kg: v, tag, waist: null, note: '', bodyFat: null, muscle: null, bmi: null, visceralFat: null, bmr: null, bone: null };
    const next = [...(data?.weights ?? []), rec];
    if (await saveStateWeights(next)) setKg('');
  };
  const delReal = async (id: string) => {
    const next = (data?.weights ?? []).filter((w) => w.id !== id);
    await saveStateWeights(next);
  };

  return (
    <section className="card">
      <div className="card-head"><h2>体重与身体成分</h2><span className="link">{rows.length} 条</span></div>
      <div className="form-grid" style={{ marginBottom: 12 }}>
        <label className="field"><span>日期</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field"><span>体重 (kg)</span><input type="number" step="0.1" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="如 62.5" /></label>
        <label className="field"><span>时段</span>
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="morning">晨重</option><option value="device">设备测量</option><option value="reported">自报</option><option value="other">其他</option>
          </select>
        </label>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" type="button" disabled={saving2} onClick={() => void addReal()}>{saving2 ? '保存中…' : '记录体重'}</button>
      </div>
      {rows.length === 0 ? (
        <p className="hint" style={{ marginTop: 12 }}>还没有称重记录。记下第一次体重后，这里会显示最近一条与历史。</p>
      ) : (
        <table className="tbl" style={{ marginTop: 12 }}>
          <thead><tr><th>日期</th><th>体重</th><th>时段</th><th></th></tr></thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.id}>
                <td><span className="ts">{w.date}</span></td>
                <td>{w.kg != null ? `${w.kg} kg` : '—'}</td>
                <td>{{ morning: '晨重', device: '设备', reported: '自报', other: '其他' }[w.tag] || w.tag || '—'}</td>
                <td style={{ textAlign: 'right' }}><button className="icon-btn" type="button" aria-label="删除" onClick={() => void delReal(w.id)}><Icon name="close" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ---------- 体征 ----------
function flagStyle(f: '' | 'H' | 'L' | 'N') {
  return f === 'H' || f === 'L' ? { color: '#B4553F', fontWeight: 600 } : undefined;
}
function VitalsSeg() {
  const { data, reload } = useStore();
  const [draft, setDraft] = useState<Partial<Record<string, string>>>({});
  const [date, setDate] = useState(today());
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rows = (data?.vitals ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));

  const add = async () => {
    const rec: Vital = {
      id: uid(), date,
      systolic: numOrNull(draft.systolic), diastolic: numOrNull(draft.diastolic), pulse: numOrNull(draft.pulse),
      temperature: numOrNull(draft.temperature), spo2: numOrNull(draft.spo2), glucose: numOrNull(draft.glucose),
      glucoseTag: draft.glucoseTag || 'fasting', note: '', createdAt: Date.now(),
    };
    setSaving(true); setErr(null);
    try {
      await api.putTable('vitals', [...(data?.vitals ?? []), rec]);
      await reload();
      setDraft({});
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  };
  const del = async (id: string) => {
    await api.putTable('vitals', (data?.vitals ?? []).filter((v) => v.id !== id));
    await reload();
  };

  return (
    <section className="card">
      <div className="card-head"><h2>生命体征</h2><span className="link">{rows.length} 条</span></div>
      <p className="hint">参考区间（成人静息）：血压 90–139 / 60–89 mmHg、心率 60–100 次/分、体温 36.0–37.3 ℃、血氧 95–100 %、空腹血糖 3.9–6.1 mmol/L。</p>
      <div className="form-grid" style={{ marginBottom: 12 }}>
        <label className="field"><span>日期</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {VITAL_METRICS.map((m) => (
          <label className="field" key={m.k}><span>{m.label} ({m.unit})</span>
            <input type="number" step="0.1" value={draft[m.k] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [m.k]: e.target.value }))} />
          </label>
        ))}
        <label className="field"><span>血糖时机</span>
          <select value={draft.glucoseTag || 'fasting'} onChange={(e) => setDraft((d) => ({ ...d, glucoseTag: e.target.value }))}>
            <option value="fasting">空腹</option><option value="post2h">餐后 2 小时</option><option value="random">随机</option>
          </select>
        </label>
      </div>
      {err && <div className="notice notice--danger" role="alert">{err}</div>}
      <div className="form-actions" style={{ marginBottom: 12 }}>
        <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void add()}>{saving ? '保存中…' : '记录体征'}</button>
      </div>
      {rows.length === 0 ? <p className="hint">还没有体征记录。</p> : (
        <table className="tbl">
          <thead><tr><th>日期</th>{VITAL_METRICS.map((m) => <th key={m.k}>{m.label}</th>)}<th></th></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td><span className="ts">{v.date}</span></td>
                {VITAL_METRICS.map((m) => {
                  const val = (v as any)[m.k] as number | null;
                  const f = vitalFlag(m.k, val, v);
                  return <td key={m.k} style={flagStyle(f)}>{val == null ? '—' : `${val}${f === 'H' ? ' ↑' : f === 'L' ? ' ↓' : ''}`}</td>;
                })}
                <td style={{ textAlign: 'right' }}><button className="icon-btn" type="button" aria-label="删除" onClick={() => void del(v.id)}><Icon name="close" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ---------- 症状 ----------
function SymptomsSeg() {
  const { data, reload } = useStore();
  const [draft, setDraft] = useState({ date: today(), part: '', severity: 'mild', trigger: '', note: '' });
  const [saving, setSaving] = useState(false);
  const rows = (data?.symptoms ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const add = async () => {
    if (!draft.part.trim()) return;
    const rec: Symptom = { id: uid(), date: draft.date, part: draft.part, severity: draft.severity, trigger: draft.trigger, note: draft.note, createdAt: Date.now() };
    setSaving(true);
    try { await api.putTable('symptoms', [...(data?.symptoms ?? []), rec]); await reload(); setDraft({ date: today(), part: '', severity: 'mild', trigger: '', note: '' }); } finally { setSaving(false); }
  };
  const del = async (id: string) => { await api.putTable('symptoms', (data?.symptoms ?? []).filter((s) => s.id !== id)); await reload(); };
  const sevLabel: Record<string, string> = { mild: '轻', moderate: '中', severe: '重' };
  return (
    <section className="card">
      <div className="card-head"><h2>症状日记</h2><span className="link">{rows.length} 条</span></div>
      <div className="form-grid" style={{ marginBottom: 12 }}>
        <label className="field"><span>日期</span><input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} /></label>
        <label className="field"><span>部位</span><input value={draft.part} onChange={(e) => setDraft((d) => ({ ...d, part: e.target.value }))} placeholder="如 头部 / 腹部" /></label>
        <label className="field"><span>程度</span><select value={draft.severity} onChange={(e) => setDraft((d) => ({ ...d, severity: e.target.value }))}><option value="mild">轻</option><option value="moderate">中</option><option value="severe">重</option></select></label>
        <label className="field"><span>诱因</span><input value={draft.trigger} onChange={(e) => setDraft((d) => ({ ...d, trigger: e.target.value }))} /></label>
        <label className="field"><span>备注</span><input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} /></label>
      </div>
      <div className="form-actions" style={{ marginBottom: 12 }}><button className="btn btn-primary" type="button" disabled={saving} onClick={() => void add()}>{saving ? '保存中…' : '记录症状'}</button></div>
      {rows.length === 0 ? <p className="hint">还没有症状记录。</p> : (
        <table className="tbl"><thead><tr><th>日期</th><th>部位</th><th>程度</th><th>诱因/备注</th><th></th></tr></thead>
          <tbody>{rows.map((s) => (<tr key={s.id}><td><span className="ts">{s.date}</span></td><td>{s.part}</td><td>{sevLabel[s.severity] || s.severity}</td><td>{[s.trigger, s.note].filter(Boolean).join(' / ') || '—'}</td><td style={{ textAlign: 'right' }}><button className="icon-btn" type="button" aria-label="删除" onClick={() => void del(s.id)}><Icon name="close" /></button></td></tr>))}</tbody>
        </table>
      )}
    </section>
  );
}

// ---------- 睡眠 ----------
function SleepSeg() {
  const { data, reload } = useStore();
  const [draft, setDraft] = useState({ date: today(), hours: '', minutes: '', bedtime: '', wake: '', note: '' });
  const [saving, setSaving] = useState(false);
  const rows = (data?.sleepLogs ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const add = async () => {
    const rec: SleepLog = { id: uid(), date: draft.date, hours: numOrNull(draft.hours), minutes: numOrNull(draft.minutes), score: null, bedtime: draft.bedtime, wake: draft.wake, note: draft.note, source: 'manual', createdAt: Date.now() };
    setSaving(true);
    try { await api.putTable('sleep-logs', [...(data?.sleepLogs ?? []), rec]); await reload(); setDraft({ date: today(), hours: '', minutes: '', bedtime: '', wake: '', note: '' }); } finally { setSaving(false); }
  };
  const del = async (id: string) => { await api.putTable('sleep-logs', (data?.sleepLogs ?? []).filter((s) => s.id !== id)); await reload(); };
  return (
    <section className="card">
      <div className="card-head"><h2>睡眠</h2><span className="link">{rows.length} 条</span></div>
      <div className="form-grid" style={{ marginBottom: 12 }}>
        <label className="field"><span>日期</span><input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} /></label>
        <label className="field"><span>时长(小时)</span><input type="number" step="0.5" value={draft.hours} onChange={(e) => setDraft((d) => ({ ...d, hours: e.target.value }))} /></label>
        <label className="field"><span>入睡</span><input type="time" value={draft.bedtime} onChange={(e) => setDraft((d) => ({ ...d, bedtime: e.target.value }))} /></label>
        <label className="field"><span>醒来</span><input type="time" value={draft.wake} onChange={(e) => setDraft((d) => ({ ...d, wake: e.target.value }))} /></label>
        <label className="field"><span>备注</span><input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} /></label>
      </div>
      <div className="form-actions" style={{ marginBottom: 12 }}><button className="btn btn-primary" type="button" disabled={saving} onClick={() => void add()}>{saving ? '保存中…' : '记录睡眠'}</button></div>
      {rows.length === 0 ? <p className="hint">还没有睡眠记录。</p> : (
        <table className="tbl"><thead><tr><th>日期</th><th>时长</th><th>入睡/醒来</th><th>备注</th><th></th></tr></thead>
          <tbody>{rows.slice(0, 60).map((s) => (<tr key={s.id}><td><span className="ts">{s.date}</span></td><td>{s.hours != null ? `${s.hours} 小时` : '—'}</td><td>{[s.bedtime, s.wake].filter(Boolean).join(' → ') || '—'}</td><td>{s.note || '—'}</td><td style={{ textAlign: 'right' }}><button className="icon-btn" type="button" aria-label="删除" onClick={() => void del(s.id)}><Icon name="close" /></button></td></tr>))}</tbody>
        </table>
      )}
      {rows.length > 60 && <p className="hint">仅显示最近 60 条。</p>}
    </section>
  );
}

// ---------- 饮食（每日） ----------
function DietSeg() {
  const { data, reload } = useStore();
  const [draft, setDraft] = useState({ date: today(), morningWeight: '', breakfast: '', lunch: '', dinner: '', snack: '', note: '' });
  const [saving, setSaving] = useState(false);
  const rows = (data?.dietDays ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const add = async () => {
    const rec: DietDay = {
      id: uid(), date: draft.date, morningWeight: numOrNull(draft.morningWeight), weightNote: '', waist: null,
      sleep: '', hunger: '', ankle: '', breakfast: draft.breakfast, lunch: draft.lunch, dinner: draft.dinner, snack: draft.snack,
      kcalCenter: null, kcalLow: null, kcalHigh: null, budget: '', completeness: '', summary: '', note: draft.note, createdAt: Date.now(),
    };
    setSaving(true);
    try { await api.putTable('diet-days', [...(data?.dietDays ?? []), rec]); await reload(); setDraft({ date: today(), morningWeight: '', breakfast: '', lunch: '', dinner: '', snack: '', note: '' }); } finally { setSaving(false); }
  };
  const del = async (id: string) => { await api.putTable('diet-days', (data?.dietDays ?? []).filter((d) => d.id !== id)); await reload(); };
  return (
    <section className="card">
      <div className="card-head"><h2>饮食日记</h2><span className="link">{rows.length} 条</span></div>
      <div className="form-grid" style={{ marginBottom: 12 }}>
        <label className="field"><span>日期</span><input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} /></label>
        <label className="field"><span>晨重(kg)</span><input type="number" step="0.1" value={draft.morningWeight} onChange={(e) => setDraft((d) => ({ ...d, morningWeight: e.target.value }))} /></label>
        <label className="field"><span>早餐</span><input value={draft.breakfast} onChange={(e) => setDraft((d) => ({ ...d, breakfast: e.target.value }))} /></label>
        <label className="field"><span>午餐</span><input value={draft.lunch} onChange={(e) => setDraft((d) => ({ ...d, lunch: e.target.value }))} /></label>
        <label className="field"><span>晚餐</span><input value={draft.dinner} onChange={(e) => setDraft((d) => ({ ...d, dinner: e.target.value }))} /></label>
        <label className="field"><span>加餐</span><input value={draft.snack} onChange={(e) => setDraft((d) => ({ ...d, snack: e.target.value }))} /></label>
        <label className="field"><span>备注</span><input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} /></label>
      </div>
      <div className="form-actions" style={{ marginBottom: 12 }}><button className="btn btn-primary" type="button" disabled={saving} onClick={() => void add()}>{saving ? '保存中…' : '记录今天'}</button></div>
      {rows.length === 0 ? <p className="hint">还没有饮食记录。</p> : (
        <table className="tbl"><thead><tr><th>日期</th><th>晨重</th><th>三餐</th><th></th></tr></thead>
          <tbody>{rows.slice(0, 60).map((d) => (<tr key={d.id}><td><span className="ts">{d.date}</span></td><td>{d.morningWeight != null ? `${d.morningWeight} kg` : '—'}</td><td>{[d.breakfast, d.lunch, d.dinner].filter(Boolean).join(' / ') || '—'}</td><td style={{ textAlign: 'right' }}><button className="icon-btn" type="button" aria-label="删除" onClick={() => void del(d.id)}><Icon name="close" /></button></td></tr>))}</tbody>
        </table>
      )}
    </section>
  );
}

function numOrNull(s: string | undefined): number | null {
  if (s === undefined || s === '') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
