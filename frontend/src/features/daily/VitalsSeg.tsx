// 日常健康 · 血压等体征段（复刻旧 renderVitals，js/app.views.body.js:471）。
// 最近一次统计 tiles + 指标趋势图（可切换指标）+ 记录明细。
import { useEffect, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import type { Vital } from '../../api/types';
import { TrendChart } from './TrendChart';

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const numOrNull = (s: string) => (s === '' ? null : Number.isFinite(parseFloat(s)) ? parseFloat(s) : null);

export const VITAL_METRICS = [
  { k: 'systolic', label: '收缩压', unit: 'mmHg', dec: 0 },
  { k: 'diastolic', label: '舒张压', unit: 'mmHg', dec: 0 },
  { k: 'pulse', label: '心率', unit: '次/分', dec: 0 },
  { k: 'temperature', label: '体温', unit: '℃', dec: 1 },
  { k: 'spo2', label: '血氧饱和度', unit: '%', dec: 0 },
  { k: 'glucose', label: '血糖', unit: 'mmol/L', dec: 1 },
] as const;
export const GLUCOSE_TAGS: [string, string][] = [['fasting', '空腹'], ['post2h', '餐后2h'], ['random', '随机']];
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
const flagColor = (f: string) => (f === 'H' || f === 'L' ? '#B4553F' : undefined);

export function VitalsSeg() {
  const { data, reload } = useStore();
  const { setHead } = useHead();
  const [metric, setMetric] = useState<string>('systolic');
  const [form, setForm] = useState<null | Vital>(null);
  const [saving, setSaving] = useState(false);
  const list = (data?.vitals ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));

  useEffect(() => {
    setHead({
      eyebrow: 'VITALS　生命体征',
      title: '生命体征',
      sub: '血压 / 心率 / 体温 / 血氧 / 血糖，按日记录并可看趋势',
      actions: (
        <button className="btn btn-primary" type="button" onClick={() => setForm(blankVital())}>
          <Icon name="plus" />
          记录体征
        </button>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latestOf = (k: string) => {
    for (let i = list.length - 1; i >= 0; i--) if (Number.isFinite(list[i][k as keyof Vital] as number)) return list[i];
    return null;
  };
  const points = list.filter((v) => Number.isFinite(v[metric as keyof Vital] as number)).map((v) => ({ date: v.date, value: v[metric as keyof Vital] as number }));
  const m = VITAL_METRICS.find((x) => x.k === metric) || VITAL_METRICS[0];

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const rec: Vital = { ...form, id: form.id || uid(), createdAt: form.createdAt || Date.now() };
      const isNew = !form.id;
      const next = isNew ? [...(data?.vitals ?? []), rec] : (data?.vitals ?? []).map((v) => (v.id === rec.id ? rec : v));
      await api.putTable('vitals', next);
      await reload();
      setForm(null);
    } finally {
      setSaving(false);
    }
  };
  const del = async (id: string) => {
    await api.putTable('vitals', (data?.vitals ?? []).filter((v) => v.id !== id));
    await reload();
  };

  const tile = (k: string) => {
    const mm = VITAL_METRICS.find((x) => x.k === k)!;
    const rec = latestOf(k);
    if (!rec) {
      return (
        <div style={{ border: '1px dashed var(--line-strong)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, letterSpacing: '.08em', color: 'var(--ink-4)' }}>{mm.label}</div>
          <div style={{ font: '600 18px/1.25 var(--font-serif)', marginTop: 6, color: 'var(--ink-5)' }}>—</div>
          <div style={{ fontSize: 10, color: 'var(--ink-5)', marginTop: 4 }}>未记录</div>
        </div>
      );
    }
    const val = rec[k as keyof Vital] as number;
    const f = vitalFlag(k, val, rec);
    const bad = f === 'H' || f === 'L';
    return (
      <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 10, letterSpacing: '.08em', color: 'var(--ink-4)' }}>{mm.label}</div>
        <div style={{ font: '600 20px/1.25 var(--font-serif)', marginTop: 6, color: bad ? '#B4553F' : 'inherit' }}>
          {val.toFixed(mm.dec)}<span style={{ fontSize: 10, fontWeight: 400, color: 'var(--ink-5)' }}> {mm.unit}</span>
        </div>
        <div style={{ fontSize: 10, color: bad ? '#B4553F' : 'var(--ink-5)', marginTop: 4 }}>{rec.date}{bad ? ' · ' + (f === 'H' ? '偏高' : '偏低') : ''}</div>
      </div>
    );
  };

  const bpRecs = list.filter((v) => Number.isFinite(v.systolic) || Number.isFinite(v.diastolic));
  const bpRec = bpRecs.length ? bpRecs[bpRecs.length - 1] : null;
  const bpBad = bpRec && (['H', 'L'].includes(vitalFlag('systolic', bpRec.systolic, bpRec)) || ['H', 'L'].includes(vitalFlag('diastolic', bpRec.diastolic, bpRec)));
  const bpTile = bpRec ? (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, letterSpacing: '.08em', color: 'var(--ink-4)' }}>血压</div>
      <div style={{ font: '600 20px/1.25 var(--font-serif)', marginTop: 6, color: bpBad ? '#B4553F' : 'inherit' }}>
        {Number.isFinite(bpRec.systolic) ? bpRec.systolic : '—'}/{Number.isFinite(bpRec.diastolic) ? bpRec.diastolic : '—'}
        <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--ink-5)' }}> mmHg</span>
      </div>
      <div style={{ fontSize: 10, color: bpBad ? '#B4553F' : 'var(--ink-5)', marginTop: 4 }}>{bpRec.date}{bpBad ? ' · 超出参考' : ''}</div>
    </div>
  ) : (
    <div style={{ border: '1px dashed var(--line-strong)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, letterSpacing: '.08em', color: 'var(--ink-4)' }}>血压</div>
      <div style={{ font: '600 18px/1.25 var(--font-serif)', marginTop: 6, color: 'var(--ink-5)' }}>—</div>
      <div style={{ fontSize: 10, color: 'var(--ink-5)', marginTop: 4 }}>未记录</div>
    </div>
  );

  return (
    <div className="stack">
      {list.length === 0 ? (
        <section className="card">
          <div className="card-head"><h2>还没有体征记录</h2><span className="link">0 条</span></div>
          <div className="empty" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', padding: '22px 6px' }}>
            <p style={{ margin: 0, color: 'var(--ink-4)' }}>血压、心率、体温、血氧、血糖都可以在这里记。一次测了哪几项就填哪几项，之后能看到走势，超出参考范围的会标红。</p>
            <button className="btn btn-primary" type="button" onClick={() => setForm(blankVital())}><Icon name="plus" />记录第一组体征</button>
          </div>
          <p className="hint">参考区间（成人静息）：血压 90–139 / 60–89 mmHg、心率 60–100 次/分、体温 36.0–37.3 ℃、血氧 95–100 %、空腹血糖 3.9–6.1 mmol/L。仅供观察，不替代医生判断。</p>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="card-head"><h2>最近一次</h2><span className="link">按最近记录</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
              {bpTile}
              {tile('pulse')}
              {tile('temperature')}
              {tile('spo2')}
              {tile('glucose')}
            </div>
          </section>

          <section className="card chart-card">
            <div className="chart-head">
              <div className="chart-title"><h2>{m.label}趋势</h2><p>共 {points.length} 条记录　·　阴影为一般参考区间，越界点标红</p></div>
              <div className="chart-tools"><label className="select">
                <select value={metric} onChange={(e) => setMetric(e.target.value)}>
                  {VITAL_METRICS.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}
                </select>
              </label></div>
            </div>
            <div className="chart-box">
              <TrendChart points={points} low={vitalRange(metric).slice(0, 1)[0]} high={vitalRange(metric)[1]} unit={m.unit} emptyText="这项还没有记录" />
            </div>
          </section>

          <details className="detail-fold">
            <summary className="df-sum">
              <span className="df-title"><span className="df-chev" aria-hidden="true" />记录明细</span>
              <span className="df-count">{list.length} 条</span>
              <span className="df-hint">展开查看</span>
            </summary>
            <div className="df-body">
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>日期</th><th>血压</th><th>心率</th><th>体温</th><th>血氧</th><th>血糖</th><th>备注</th><th /></tr></thead>
                  <tbody>
                    {list.slice().reverse().map((v) => {
                      const bp = Number.isFinite(v.systolic) || Number.isFinite(v.diastolic) ? `${Number.isFinite(v.systolic) ? v.systolic : '—'}/${Number.isFinite(v.diastolic) ? v.diastolic : '—'}` : '—';
                      const bpRowBad = ['H', 'L'].includes(vitalFlag('systolic', v.systolic, v)) || ['H', 'L'].includes(vitalFlag('diastolic', v.diastolic, v));
                      const cell = (k: string) => {
                        const val = v[k as keyof Vital] as number;
                        if (!Number.isFinite(val)) return <td className="num" style={{ color: 'var(--ink-5)' }}>—</td>;
                        const f = vitalFlag(k, val, v);
                        return <td className="num" style={{ color: flagColor(f), fontWeight: f === 'H' || f === 'L' ? 600 : 400 }}>{val}{f === 'H' ? ' ↑' : f === 'L' ? ' ↓' : ''}</td>;
                      };
                      return (
                        <tr key={v.id}>
                          <td className="date">{v.date}</td>
                          <td className="num" style={{ color: bpRowBad ? '#B4553F' : 'inherit', fontWeight: bpRowBad ? 600 : 400 }}>{bp}</td>
                          {cell('pulse')}
                          {cell('temperature')}
                          {cell('spo2')}
                          {cell('glucose')}
                          <td style={{ color: 'var(--ink-4)', fontSize: 10.5 }}>{v.note || '—'}</td>
                          <td className="act"><button type="button" onClick={() => setForm({ ...v })}>编辑</button><button className="danger" type="button" onClick={() => void del(v.id)}>删除</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </>
      )}

      {form && (
        <VitalForm form={form} setForm={setForm} saving={saving} onSave={save} />
      )}
    </div>
  );
}

function blankVital(): Vital {
  return { id: '', date: today(), systolic: null, diastolic: null, pulse: null, temperature: null, spo2: null, glucose: null, glucoseTag: 'fasting', note: '', createdAt: 0 };
}

function VitalForm({ form, setForm, saving, onSave }: { form: Vital; setForm: (f: Vital | null) => void; saving: boolean; onSave: () => Promise<void> }) {
  const setN = (k: keyof Vital, s: string) => setForm({ ...form, [k]: numOrNull(s) });
  return (
    <section className="card">
      <div className="card-head"><h2>{form.id ? '编辑体征' : '记录体征'}</h2></div>
      <div className="form-grid">
        <label className="field"><span>日期 *</span><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
        <label className="field"><span>收缩压 mmHg</span><input type="number" value={form.systolic ?? ''} onChange={(e) => setN('systolic', e.target.value)} /></label>
        <label className="field"><span>舒张压 mmHg</span><input type="number" value={form.diastolic ?? ''} onChange={(e) => setN('diastolic', e.target.value)} /></label>
        <label className="field"><span>心率 次/分</span><input type="number" value={form.pulse ?? ''} onChange={(e) => setN('pulse', e.target.value)} /></label>
        <label className="field"><span>体温 ℃</span><input type="number" step="0.1" value={form.temperature ?? ''} onChange={(e) => setN('temperature', e.target.value)} /></label>
        <label className="field"><span>血氧 %</span><input type="number" value={form.spo2 ?? ''} onChange={(e) => setN('spo2', e.target.value)} /></label>
        <label className="field"><span>血糖 mmol/L</span><input type="number" step="0.1" value={form.glucose ?? ''} onChange={(e) => setN('glucose', e.target.value)} /></label>
        <label className="field"><span>血糖时机</span>
          <select value={form.glucoseTag} onChange={(e) => setForm({ ...form, glucoseTag: e.target.value })}>
            {GLUCOSE_TAGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field wide"><span>备注</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void onSave()}>{saving ? '保存中…' : '保存'}</button>
        <button className="btn btn-secondary" type="button" onClick={() => setForm(null)}>取消</button>
      </div>
    </section>
  );
}
