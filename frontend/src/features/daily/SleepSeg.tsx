// 日常健康 · 睡眠段（复刻旧 renderSleep，js/app.views.body.js:622）。
// 最近睡眠 tiles + 睡眠时长趋势 + 记录明细（分页）+ 小米手环 CSV 导入。
import { useEffect, useRef, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import type { SleepLog } from '../../api/types';
import { EChart, type EChartPoint } from '../../lib/EChart';

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => 'sl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const numOrNull = (s: string) => (s === '' ? null : Number.isFinite(parseFloat(s)) ? parseFloat(s) : null);
const PAGE = 20;

// 睡眠指标分组：把一条睡眠记录拆成可切换的「分组标签」。
// value 取该组对应的数值；晚间时间映射为连续小数（午后 <12 点 +24），
// 这样 23:00 → 23、00:30 → 24.5，趋势线跨午夜不断。
export type SleepGroupKey = 'duration' | 'score' | 'bedtime';
const SLEEP_GROUPS: { k: SleepGroupKey; label: string; unit: string; low?: number; high?: number; target?: number; name: string; emptyText: string }[] = [
  { k: 'duration', label: '睡眠时长', unit: 'h', low: 7, high: 9, name: '时长', emptyText: '还没有可画的睡眠时长记录' },
  { k: 'score', label: '睡眠评分', unit: '分', low: 60, high: 100, name: '评分', emptyText: '记录里还没有睡眠评分（手动记录或多为设备未提供）' },
  { k: 'bedtime', label: '入睡时间', unit: '时', target: 23, name: '入睡', emptyText: '记录里还没有入睡时间' },
];
const hmToHour = (hm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || '').trim());
  if (!m) return null;
  const h = Number(m[1]) + Number(m[2]) / 60;
  if (!Number.isFinite(h)) return null;
  // 入睡时间以傍晚到次日凌晨为主：12 点前的时刻视为「次日凌晨」，+24 保持连续
  return h < 12 ? h + 24 : h;
};

// 时间范围快捷选项：按「最近 N 天」裁剪图表数据点，配合底部 dataZoom 滑动条使用。
export type SleepRangeKey = 'all' | '7' | '30' | '90';
const SLEEP_RANGES: { k: SleepRangeKey; label: string; days: number | null }[] = [
  { k: '7', label: '近 7 天', days: 7 },
  { k: '30', label: '近 30 天', days: 30 },
  { k: '90', label: '近 90 天', days: 90 },
  { k: 'all', label: '全部', days: null },
];

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
  const [group, setGroup] = useState<SleepGroupKey>('duration');
  const [range, setRange] = useState<SleepRangeKey>('all');
  const fileRef = useRef<HTMLInputElement>(null);
  const list = (data?.sleepLogs ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));

  useEffect(() => {
    setHead({
      eyebrow: 'SLEEP　睡眠',
      title: '睡眠',
      sub: '小米手环睡眠汇总，一天一条；按「时长 / 评分 / 入睡」分组看趋势',
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

  const groupMeta = SLEEP_GROUPS.find((g) => g.k === group) || SLEEP_GROUPS[0];
  const rangeMeta = SLEEP_RANGES.find((r) => r.k === range) || SLEEP_RANGES[SLEEP_RANGES.length - 1];
  const rangeCut = rangeMeta.days != null ? Date.now() - rangeMeta.days * 864e5 : null;
  // 按当前分组计算图表数据点（并按该组有值的条数统计）
  const points: EChartPoint[] = list
    .slice()
    .filter((s) => rangeCut == null || Date.parse(s.date + 'T00:00:00') >= rangeCut)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      let value: number | null = null;
      if (group === 'duration') value = Number.isFinite(s.hours as number) ? Math.round((s.hours as number) * 10) / 10 : null;
      else if (group === 'score') value = Number.isFinite(s.score as number) ? (s.score as number) : null;
      else value = hmToHour(s.bedtime);
      return value == null ? null : { date: s.date, value };
    })
    .filter((p): p is EChartPoint => !!p);
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
              <div className="chart-title">
                <h2>睡眠趋势</h2>
                <p>
                  {rangeMeta.days != null ? `近 ${rangeMeta.days} 天` : '全部'} {points.length} 个数据点　·　
                  {group === 'duration' && '阴影为 7–9 小时一般参考区间'}
                  {group === 'score' && '设备自评评分，通常 0–100，阴影为 60 分以上参考'}
                  {group === 'bedtime' && '入睡时刻折成小时，虚线为目标 23:00'}
                  ㆍ可拖底部滑块选择区间
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div className="segmented" role="tablist" aria-label="时间范围">
                  {SLEEP_RANGES.map((r) => (
                    <button
                      key={r.k}
                      role="tab"
                      type="button"
                      aria-selected={r.k === range}
                      className={r.k === range ? 'on' : ''}
                      onClick={() => setRange(r.k)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="segmented" role="tablist" aria-label="睡眠指标分组">
                  {SLEEP_GROUPS.map((g) => (
                    <button
                      key={g.k}
                      role="tab"
                      type="button"
                      aria-selected={g.k === group}
                      className={g.k === group ? 'on' : ''}
                      onClick={() => setGroup(g.k)}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="chart-box">
              <EChart
                points={points}
                low={groupMeta.low ?? null}
                high={groupMeta.high ?? null}
                target={groupMeta.target ?? null}
                unit={groupMeta.unit}
                name={groupMeta.name}
                emptyText={groupMeta.emptyText}
                zoom
              />
            </div>
          </section>

          <details className="detail-fold">
            <summary className="df-sum">
              <span className="df-title"><span className="df-chev" aria-hidden="true" />记录明细</span>
              <span className="df-count">{list.length} 条</span>
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
