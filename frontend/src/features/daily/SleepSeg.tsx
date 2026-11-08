// 日常健康 · 睡眠段（复刻旧 renderSleep，js/app.views.body.js:622）。
// 最近睡眠 tiles + 睡眠时长趋势 + 记录明细（分页）+ 小米手环 CSV 导入。
import { useEffect, useRef, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import type { SleepLog } from '../../api/types';
import { TrendChart } from './TrendChart';

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => 'sl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const numOrNull = (s: string) => (s === '' ? null : Number.isFinite(parseFloat(s)) ? parseFloat(s) : null);
const PAGE = 20;

// 小米运动健康 CSV 解析（对齐旧 parseSleepRows，js/app.modal.js:1123）
function parseXiaomiSleepCSV(text: string): { rows: SleepLog[]; error?: string } {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  if (!clean.trim()) return { rows: [], error: '文件是空的' };
  const nl = clean.indexOf('\n');
  const firstLine = nl >= 0 ? clean.slice(0, nl) : clean;
  const delim = firstLine.split('\t').length > firstLine.split(',').length ? '\t' : ',';
  const split = (line: string) => line.split(delim).map((c) => c.replace(/^"|"$/g, ''));
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], error: '文件里没有可解析的内容' };
  const header = split(lines[0]).map((h) => h.trim());
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const iKey = idx('Key'), iTag = idx('Tag'), iVal = idx('Value'), iTime = idx('Time');
  if (iKey < 0 || iTag < 0 || iVal < 0 || iTime < 0) return { rows: [], error: '认不出这是小米运动健康的睡眠文件（需 Key / Tag / Value / Time 列）' };
  const out: SleepLog[] = [];
  for (let n = 1; n < lines.length; n++) {
    const r = split(lines[n]);
    if ((r[iKey] || '').trim() !== 'sleep') continue;
    if ((r[iTag] || '').trim() !== 'daily_report') continue;
    const t = parseFloat(r[iTime]);
    let v: any;
    try { v = JSON.parse(r[iVal]); } catch { continue; }
    if (!v) continue;
    const minutes = Number(v.total_duration);
    if (!Number.isFinite(minutes) || minutes <= 0) continue;
    const d = new Date(t * 1000);
    if (isNaN(d.getTime())) continue;
    const date = d.toISOString().slice(0, 10);
    const seg = Array.isArray(v.segment_details) && v.segment_details[0] ? v.segment_details[0] : null;
    const hm = (u: number) => { const x = new Date(u * 1000); return `${String(x.getUTCHours()).padStart(2, '0')}:${String(x.getUTCMinutes()).padStart(2, '0')}`; };
    out.push({
      id: 'mi-sleep-' + date, date, hours: Math.round((minutes / 60) * 100) / 100, minutes,
      score: Number.isFinite(Number(v.sleep_score)) ? Number(v.sleep_score) : null,
      bedtime: seg && Number.isFinite(Number(seg.bedtime)) ? hm(Number(seg.bedtime)) : '',
      wake: seg && Number.isFinite(Number(seg.wake_up_time)) ? hm(Number(seg.wake_up_time)) : '',
      source: 'mi-band', note: '小米手环导入', createdAt: Date.now(),
    });
  }
  return { rows: out };
}

export function SleepSeg() {
  const { data, reload } = useStore();
  const { setHead } = useHead();
  const [form, setForm] = useState<null | SleepLog>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = (data?.sleepLogs ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));

  useEffect(() => {
    setHead({
      eyebrow: 'SLEEP　睡眠',
      title: '睡眠',
      sub: '小米手环睡眠汇总，一天一条；导入后按日看时长趋势',
      actions: (
        <button className="btn btn-primary" type="button" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" />
          导入设备数据
        </button>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const withH = list.filter((s) => Number.isFinite(s.hours));
  const avg7 = (() => {
    const cut = Date.now() - 7 * 864e5;
    const r = withH.filter((s) => Date.parse(s.date + 'T00:00:00') >= cut);
    return r.length ? { n: r.length, h: r.reduce((s, x) => s + (x.hours as number), 0) / r.length } : { n: 0, h: null as number | null };
  })();
  const last = withH[0];
  const lastScore = last && Number.isFinite(last.score as number) ? (last.score as number) : null;
  const points = withH.slice().sort((a, b) => a.date.localeCompare(b.date)).map((s) => ({ date: s.date, value: Math.round((s.hours as number) * 10) / 10 }));

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE));
  const pageRows = list.slice((page - 1) * PAGE, page * PAGE);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const rec: SleepLog = { ...form, id: form.id || uid(), createdAt: form.createdAt || Date.now() };
      const isNew = !form.id;
      const next = isNew ? [...(data?.sleepLogs ?? []), rec] : (data?.sleepLogs ?? []).map((s) => (s.id === rec.id ? rec : s));
      await api.putTable('sleep-logs', next);
      await reload();
      setForm(null);
    } finally {
      setSaving(false);
    }
  };
  const del = async (id: string) => {
    await api.putTable('sleep-logs', (data?.sleepLogs ?? []).filter((s) => s.id !== id));
    await reload();
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setMsg('解析中…');
    const text = await f.text();
    const { rows, error } = parseXiaomiSleepCSV(text);
    if (error) { setMsg('解析失败：' + error); return; }
    // 按日期去重合并
    const byDate = new Map((data?.sleepLogs ?? []).map((s) => [s.date, s]));
    let added = 0;
    for (const r of rows) if (!byDate.has(r.date)) { byDate.set(r.date, r); added++; }
    try {
      await api.putTable('sleep-logs', Array.from(byDate.values()));
      await reload();
      setMsg(`导入完成：新增 ${added} 条睡眠记录（重复日期已跳过）。`);
    } catch (err) {
      setMsg('保存失败：' + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="stack">
      <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={(e) => void onFile(e)} />
      {msg && <div className="notice" role="status">{msg}</div>}

      {list.length === 0 ? (
        <section className="card">
          <div className="card-head"><h2>还没有睡眠记录</h2><span className="link">0 条</span></div>
          <div className="empty" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', padding: '22px 6px' }}>
            <p style={{ margin: 0, color: 'var(--ink-4)' }}>从小米运动健康 App 导出睡眠 CSV，在这里导入后，能按天看睡眠时长走势。数据只在本机解析，不上传。</p>
            <button className="btn btn-primary" type="button" onClick={() => fileRef.current?.click()}><Icon name="upload" />导入设备数据</button>
            <button className="btn btn-secondary" type="button" onClick={() => setForm(blankSleep())}>手动记一条</button>
          </div>
          <p className="hint">支持文件：小米运动健康导出的「*_hlth_center_aggregated_fitness_data.csv」（睡眠汇总）。</p>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="card-head"><h2>最近睡眠</h2><span className="link">按最近记录</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
              <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, letterSpacing: '.08em', color: 'var(--ink-4)' }}>最近一晚</div>
                <div style={{ font: '600 20px/1.25 var(--font-serif)', marginTop: 6 }}>{last ? (last.hours as number).toFixed(1) : '—'}<span style={{ fontSize: 10, fontWeight: 400, color: 'var(--ink-5)' }}> h</span></div>
                <div style={{ fontSize: 10, color: 'var(--ink-5)', marginTop: 4 }}>{last ? last.date : '未记录'}</div>
              </div>
              <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, letterSpacing: '.08em', color: 'var(--ink-4)' }}>近 7 天均值</div>
                <div style={{ font: '600 20px/1.25 var(--font-serif)', marginTop: 6 }}>{avg7.h != null ? (avg7.h as number).toFixed(1) : '—'}<span style={{ fontSize: 10, fontWeight: 400, color: 'var(--ink-5)' }}> h</span></div>
                <div style={{ fontSize: 10, color: 'var(--ink-5)', marginTop: 4 }}>{avg7.n ? avg7.n + ' 晚' : '近 7 天无记录'}</div>
              </div>
              <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 10, letterSpacing: '.08em', color: 'var(--ink-4)' }}>最近睡眠评分</div>
                <div style={{ font: '600 20px/1.25 var(--font-serif)', marginTop: 6 }}>{lastScore != null ? lastScore : '—'}</div>
                <div style={{ fontSize: 10, color: 'var(--ink-5)', marginTop: 4 }}>{lastScore != null ? '设备自评' : '设备未提供'}</div>
              </div>
            </div>
          </section>

          <section className="card chart-card">
            <div className="chart-head">
              <div className="chart-title"><h2>睡眠时长趋势</h2><p>共 {withH.length} 条记录　·　阴影为 7–9 小时一般参考区间</p></div>
            </div>
            <div className="chart-box"><TrendChart points={points} low={7} high={9} unit="h" /></div>
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
                  <thead><tr><th>日期</th><th>睡眠时长</th><th>折算</th><th>评分</th><th>入睡/起床</th><th>来源</th><th /></tr></thead>
                  <tbody>
                    {pageRows.map((s) => (
                      <tr key={s.id}>
                        <td className="date">{s.date}</td>
                        <td className="num">{Number.isFinite(s.hours as number) ? (s.hours as number).toFixed(1) + ' h' : '—'}</td>
                        <td>{Number.isFinite(s.minutes as number) ? Math.round(s.minutes as number) + ' 分钟' : '—'}</td>
                        <td className="num">{Number.isFinite(s.score as number) ? s.score : '—'}</td>
                        <td style={{ color: 'var(--ink-4)', fontSize: 10.5 }}>{[s.bedtime, s.wake].filter(Boolean).join(' → ') || '—'}</td>
                        <td style={{ color: 'var(--ink-4)', fontSize: 10.5 }}>{s.note || (s.source === 'mi-band' ? '小米手环' : '—')}</td>
                        <td className="act"><button type="button" onClick={() => setForm({ ...s })}>编辑</button><button className="danger" type="button" onClick={() => void del(s.id)}>删除</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="pager" style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                  <button className="btn btn-ghost" type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
                  <span className="hint" style={{ alignSelf: 'center' }}>{page} / {totalPages}</span>
                  <button className="btn btn-ghost" type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
                </div>
              )}
            </div>
          </details>
        </>
      )}

      {form && (
        <section className="card">
          <div className="card-head"><h2>{form.id ? '编辑睡眠' : '记录睡眠'}</h2></div>
          <div className="form-grid">
            <label className="field"><span>日期 *</span><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label className="field"><span>睡眠时长(小时)</span><input type="number" step="0.1" value={(form.hours as number | null) ?? ''} onChange={(e) => setForm({ ...form, hours: numOrNull(e.target.value) })} /></label>
            <label className="field"><span>入睡</span><input type="time" value={form.bedtime} onChange={(e) => setForm({ ...form, bedtime: e.target.value })} /></label>
            <label className="field"><span>醒来</span><input type="time" value={form.wake} onChange={(e) => setForm({ ...form, wake: e.target.value })} /></label>
            <label className="field wide"><span>备注</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存'}</button>
            <button className="btn btn-secondary" type="button" onClick={() => setForm(null)}>取消</button>
          </div>
        </section>
      )}
    </div>
  );
}

function blankSleep(): SleepLog {
  return { id: '', date: today(), hours: null, minutes: null, score: null, bedtime: '', wake: '', note: '', source: 'manual', createdAt: 0 };
}
