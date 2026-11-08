// 指标趋势：复刻旧前端 js/app.views.metrics.js 的指标工作台。
// 左侧指标索引（搜索 + 来源筛选），右侧统计 + ECharts 趋势 + 时间筛选 + 逐次记录分页。
// 聚合逻辑复用旧核心 assets/metrics.js（window.HealthMetrics），保证「同名同单位」口径一致。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { EChart } from '../../lib/EChart';
import type { WindowMetricGroup, WindowMetricsRecord } from '../../lib/globals.d';

const PAGE = 20;
const pad = (n: number) => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

function metricNumber(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : String(Number(Number(v).toPrecision(10)));
}
function rangeText(row: WindowMetricsRecord): string {
  if (row.low === null && row.high === null) return '未记录';
  return `${row.low === null ? '—' : metricNumber(row.low)} – ${row.high === null ? '—' : metricNumber(row.high)}`;
}

const KIND_OPTS: [string, string][] = [
  ['labs', '检验'], ['weights', '体重与身体成分'], ['body', '身体围度'], ['vitals', '生命体征'], ['sleepLogs', '睡眠'],
];

export function MetricsView({ go }: { go: (to: string) => void }) {
  const { data } = useStore();
  const { setHead } = useHead();
  const HM = window.HealthMetrics;

  const groups = useMemo<WindowMetricGroup[]>(() => {
    if (!data || !HM) return [];
    return HM.collect(data as unknown as Record<string, unknown>);
  }, [data, HM]);

  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [picking] = useState(false);
  const lastKeyRef = useRef('');

  const selected = groups.find((g) => g.key === selectedKey) || groups[0];

  useEffect(() => {
    if (selected && selected.key !== lastKeyRef.current) { setPage(1); lastKeyRef.current = selected.key; }
  }, [selected]);

  useEffect(() => {
    setHead({
      eyebrow: '当前档案 · 我的档案',
      title: '指标趋势',
      sub: '按指标汇总记录，查看每一次结果和变化。',
      actions: (
        <>
          <button className="btn btn-ghost" type="button" onClick={() => go('labs-all')}>全部检验记录</button>
          <button className="btn btn-primary" type="button" onClick={() => go('labs-all')}><Icon name="plus" />录入检验</button>
        </>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = groups.filter((g) => {
    if (kind && g.kind !== kind) return false;
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return [g.label, g.unit, g.category, g.detail].join(' ').toLowerCase().includes(needle);
  });

  const records = selected ? HM.filter(selected.records, from, to) : [];
  const stats = selected ? HM.summary(records) : null;
  const totalPages = Math.max(1, Math.ceil(records.length / PAGE));
  const curPage = Math.min(Math.max(1, page), totalPages);
  const pageRows = records.slice().reverse().slice((curPage - 1) * PAGE, curPage * PAGE);

  const applyPeriod = (period: string) => {
    if (period === 'all') { setFrom(''); setTo(''); }
    else {
      const end = todayISO();
      const start = new Date(end + 'T00:00:00');
      start.setDate(start.getDate() - Number(period) + 1);
      setFrom(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
      setTo(end);
    }
    setPage(1);
  };

  if (!groups.length) {
    return (
      <div className="stack">
        <div className="metric-empty" style={{ padding: '40px 20px', textAlign: 'center' }}>
          <h2>还没有可汇总的指标</h2>
          <p className="hint">录入检验结果、体重或生命体征后，就能按指标查看变化。仅保存报告图片或文字不会自动生成指标。</p>
          <button className="btn btn-primary" type="button" onClick={() => go('labs-all')}>录入检验结果</button>
        </div>
      </div>
    );
  }

  return (
    <div className={'metric-workspace' + (picking ? ' is-picking' : '')} style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 'var(--sp-4)' }}>
      <aside className="metric-index" aria-label="指标列表">
        <div className="metric-index-head">
          <h2>选择指标 <small>{groups.length}</small></h2>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索指标名称" aria-label="搜索指标名称" />
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="按指标来源筛选">
            <option value="">全部来源</option>
            {KIND_OPTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="metric-index-list" style={{ maxHeight: 560, overflow: 'auto' }}>
          {visible.length === 0 ? <p className="metric-no-results">没有匹配的指标，试试其他名称或来源。</p> : visible.map((g) => {
            const lastRec = g.records[g.records.length - 1];
            const on = g.key === selected?.key;
            return (
              <button key={g.key} type="button" onClick={() => setSelectedKey(g.key)} title={g.label}
                className="metric-index-row" aria-current={on ? 'true' : undefined}
                style={{
                  display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left',
                  padding: '8px 8px', border: 'none', borderBottom: '1px solid var(--line-soft)',
                  background: on ? 'var(--bg-hover)' : 'transparent', cursor: 'pointer',
                  borderLeft: on ? '2px solid var(--pine-600)' : '2px solid transparent',
                }}>
                <span className="metric-index-name">{g.label}
                  <small style={{ display: 'block', color: 'var(--ink-4)', fontSize: 11 }}>
                    {[g.unit || '无单位', g.detail].filter(Boolean).join(' · ')}
                  </small>
                </span>
                <span className="metric-index-value" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {lastRec.value === null ? (lastRec.qualitative || '—') : metricNumber(lastRec.value)}
                  <small style={{ display: 'block', color: 'var(--ink-4)', fontSize: 11 }}>{g.records.length} 条</small>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="metric-detail" aria-label="指标详情">
        <header className="metric-detail-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>{selected.label}</h2>
            <p className="hint" style={{ margin: '4px 0 0' }}>{[selected.category, selected.unit || '单位未记录', selected.detail].filter(Boolean).join(' · ')}</p>
          </div>
          <span className="hint">{selected.records.length} 条历史记录</span>
        </header>

        <div className="metric-time-controls">
          <label>从<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="起始日期" /></label>
          <label>至<input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="结束日期" /></label>
          <button className="btn" type="button" onClick={() => setPage(1)}>应用</button>
          <div className="metric-quick">
            <button type="button" onClick={() => applyPeriod('all')}>全部</button>
            <button type="button" onClick={() => applyPeriod('90')}>近 90 天</button>
            <button type="button" onClick={() => applyPeriod('365')}>近一年</button>
          </div>
        </div>

        {stats && (
          <div className="metric-statistics" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--sp-3)', margin: '4px 0 16px' }}>
            <div>
              <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>最近结果{stats.latest ? `　${stats.latest.date}` : ''}</span>
              <strong style={{ display: 'block', fontSize: 'var(--fs-display)' }}>
                {stats.latest ? (stats.latest.value === null ? (stats.latest.qualitative || '—') : metricNumber(stats.latest.value)) : '—'}
                <small style={{ fontSize: 12, fontWeight: 400 }}>{stats.latest && stats.latest.value !== null ? selected.unit : ''}</small>
              </strong>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>较上一条{stats.previous ? `　${stats.previous.date}` : ''}</span>
              <strong style={{ display: 'block', fontSize: 'var(--fs-display)' }}>
                {stats.delta === null ? '—' : (stats.delta > 0 ? '+' : '') + metricNumber(stats.delta)}
                <small style={{ fontSize: 12, fontWeight: 400 }}>{stats.delta === null ? '' : selected.unit}</small>
              </strong>
            </div>
            <div>
              <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>筛选范围内最低 / 最高</span>
              <strong style={{ display: 'block', fontSize: 'var(--fs-display)' }}>
                {metricNumber(stats.min)} / {metricNumber(stats.max)}
                <small style={{ fontSize: 12, fontWeight: 400 }}>{selected.unit}</small>
              </strong>
            </div>
          </div>
        )}

        <div style={{ margin: '8px 0' }}>
          {records.length === 0 ? (
            <p className="metric-no-results">当前时间范围没有数据。</p>
          ) : !stats?.numeric.length ? (
            <p className="metric-no-results">该指标为定性结果，按日期查看下方明细，不转换为数值曲线。</p>
          ) : (
            <EChart
              points={stats.numeric.map((r) => ({ date: r.date, value: r.value as number }))}
              low={stats.sharedRange?.low ?? null}
              high={stats.sharedRange?.high ?? null}
              unit={selected.unit}
              name={selected.label}
              height={window.innerWidth < 700 ? 220 : 270}
            />
          )}
        </div>
        <p className="metric-chart-note hint" style={{ marginTop: 4 }}>
          {stats?.variedRange ? '各次参考范围不同，请以明细中各自的范围为准。' : stats?.sharedRange ? '底色为这些记录共同的参考范围。' : '未显示参考区间底色；以每条记录实际填写的范围为准。'} 连接线仅辅助观察，未测日期不补值。
        </p>

        <div className="metric-history-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16 }}>
          <h3 style={{ margin: 0, fontSize: 'var(--fs-h2)' }}>逐次记录</h3>
          <span className="hint">{records.length} 条 · {stats?.days ?? 0} 个记录日</span>
        </div>
        <div className="metric-table-wrap" style={{ overflow: 'auto' }}>
          <table className="metric-table data">
            <thead><tr><th>日期</th><th>结果{selected.unit ? `（${selected.unit}）` : ''}</th><th>参考范围</th><th>来源 / 备注</th></tr></thead>
            <tbody>
              {pageRows.map((row) => {
                const hi = row.flag === 'H' || (row.value !== null && row.high !== null && row.value > row.high);
                const lo = row.flag === 'L' || (row.value !== null && row.low !== null && row.value < row.low);
                return (
                  <tr key={row.id}>
                    <td className="date">{row.date}</td>
                    <td className={'metric-result' + (hi || lo ? ' is-flagged' : '')} style={hi || lo ? { color: '#B4553F', fontWeight: 600 } : undefined}>
                      {row.value === null ? (row.qualitative || '—') : metricNumber(row.value)}{hi ? ' ↑' : lo ? ' ↓' : ''}
                    </td>
                    <td>{rangeText(row)}</td>
                    <td>{row.source || '—'}{row.note ? <small style={{ color: 'var(--ink-4)' }}>　{row.note}</small> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="metric-pagination" style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 12 }}>
            <button className="btn" type="button" disabled={curPage === 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
            <span className="hint">{curPage} / {totalPages}</span>
            <button className="btn" type="button" disabled={curPage === totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
          </div>
        )}
      </section>
    </div>
  );
}
