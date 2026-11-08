// 指标趋势：按「同名同单位」聚合检验结果，展示统计、SVG 折线图与逐次记录。
// 与旧前端 concept 一致（只连接同名同单位结果，参考范围各自为准），
// 但用轻量 SVG 自绘替代 echarts，避免额外依赖。
import { useEffect, useMemo, useState } from 'react';
import { useHead } from '../../components/head';
import { useStore } from '../../store/useStore';
import type { Lab } from '../../api/types';

interface Group {
  key: string;
  label: string;
  unit: string;
  category: string;
  records: Lab[]; // 按日期升序
}

function labKey(l: Lab): string {
  return `${l.name}||${l.unit || ''}`;
}

function buildGroups(labs: Lab[]): Group[] {
  const map = new Map<string, Group>();
  for (const l of labs) {
    if (l.value === null || l.value === undefined) continue; // 只画数值
    const key = labKey(l);
    let g = map.get(key);
    if (!g) {
      g = { key, label: l.name, unit: l.unit || '', category: l.category || '', records: [] };
      map.set(key, g);
    }
    g.records.push(l);
  }
  for (const g of map.values()) g.records.sort((a, b) => (a.date < b.date ? -1 : 1));
  return [...map.values()].sort((a, b) => b.records.length - a.records.length || a.label.localeCompare(b.label));
}

const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(Number(v.toPrecision(10))));

// 极简折线图（含参考区间底色）
function LineChart({ records, low, high }: { records: Lab[]; low: number | null; high: number | null }) {
  const W = 720, H = 220, PAD = 36;
  const pts = records.filter((r) => r.value !== null) as (Lab & { value: number })[];
  if (pts.length === 0) return null;
  const xs = pts.map((p) => Date.parse(p.date)).filter((n) => Number.isFinite(n));
  const vals = pts.map((p) => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (low !== null) lo = Math.min(lo, low);
  if (high !== null) hi = Math.max(hi, high);
  const span = hi - lo || 1;
  lo -= span * 0.1; hi += span * 0.1;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const sx = (t: number) => PAD + ((x1 === x0 ? 0.5 : (t - x0) / (x1 - x0)) * (W - 2 * PAD));
  const sy = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(Date.parse(p.date)).toFixed(1)},${sy(p.value).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="metric-chart" style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="趋势图">
      {low !== null && high !== null && (
        <rect x={PAD} y={sy(high)} width={W - 2 * PAD} height={Math.max(0, sy(low) - sy(high))} fill="var(--pine-100)" opacity={0.5} />
      )}
      {low !== null && <line x1={PAD} x2={W - PAD} y1={sy(low)} y2={sy(low)} stroke="var(--line-strong)" strokeDasharray="4 3" />}
      {high !== null && <line x1={PAD} x2={W - PAD} y1={sy(high)} y2={sy(high)} stroke="var(--line-strong)" strokeDasharray="4 3" />}
      <path d={path} fill="none" stroke="var(--pine-600)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p) => {
        const bad = (high !== null && p.value > high) || (low !== null && p.value < low);
        return <circle key={p.id} cx={sx(Date.parse(p.date))} cy={sy(p.value)} r={3.5} fill={bad ? '#B4553F' : 'var(--pine-600)'} />;
      })}
      <text x={PAD} y={H - 8} fontSize={11} fill="var(--ink-4)">{records[0]?.date}</text>
      <text x={W - PAD} y={H - 8} fontSize={11} fill="var(--ink-4)" textAnchor="end">{records[records.length - 1]?.date}</text>
    </svg>
  );
}

export function MetricsView({ go }: { go: (to: string) => void }) {
  const { data } = useStore();
  const { setHead } = useHead();
  const labs = data?.labs ?? [];
  const groups = useMemo(() => buildGroups(labs), [labs]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [q, setQ] = useState('');

  const selected = groups.find((g) => g.key === selectedKey) || groups[0];

  useEffect(() => {
    setHead({ title: '指标趋势', sub: '按指标汇总记录，查看每一次结果和变化。只连接同名、同单位的结果' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = groups.filter((g) => (q.trim() ? `${g.label} ${g.unit} ${g.category}`.toLowerCase().includes(q.trim().toLowerCase()) : true));

  if (labs.length === 0) {
    return (
      <div className="stack">
        <div className="empty-state">
          <p className="es-title">还没有检验数据</p>
          <p className="es-desc">录入检验结果后，这里会按指标汇总趋势；只连接同名、同单位的结果。</p>
          <div className="es-actions" style={{ justifyContent: 'center' }}>
            <button className="btn btn-primary" type="button" onClick={() => go('labs-all')}>全部检验记录</button>
          </div>
        </div>
      </div>
    );
  }

  const recs = selected?.records ?? [];
  const last = recs[recs.length - 1];
  const prev = recs.length > 1 ? recs[recs.length - 2] : null;
  const delta = last && prev && last.value !== null && prev.value !== null ? last.value - prev.value : null;
  const vals = recs.map((r) => r.value).filter((v): v is number => v !== null);
  const min = vals.length ? Math.min(...vals) : null;
  const max = vals.length ? Math.max(...vals) : null;
  const low = last?.low ?? null;
  const high = last?.high ?? null;

  return (
    <div className="stack">
      <div className="seg-row">
        <span className="page-sub">{groups.length} 个可汇总指标</span>
        <div className="seg-tools">
          <button className="btn btn-ghost" type="button" onClick={() => go('labs-all')}>全部检验记录</button>
        </div>
      </div>

      <div className="metric-workspace" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 'var(--sp-4)' }}>
        <aside className="card" style={{ padding: 'var(--sp-3)' }}>
          <div className="metric-index-head">
            <h2 style={{ fontSize: 'var(--fs-h2)', margin: '0 0 8px' }}>选择指标 <small>{groups.length}</small></h2>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索指标名称" style={{ width: '100%', marginBottom: 8 }} />
          </div>
          <div style={{ maxHeight: 460, overflow: 'auto' }}>
            {visible.length === 0 ? <p className="hint">没有匹配的指标。</p> : visible.map((g) => {
              const l = g.records[g.records.length - 1];
              const on = g.key === selected?.key;
              return (
                <button key={g.key} type="button" onClick={() => setSelectedKey(g.key)} className="metric-index-row" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '8px 6px', border: 'none', borderBottom: '1px solid var(--line-soft)', background: on ? 'var(--bg-hover)' : 'transparent', cursor: 'pointer' }}>
                  <span className="metric-index-name">{g.label}<small style={{ display: 'block', color: 'var(--ink-4)', fontSize: 11 }}>{[g.unit || '无单位', g.category].filter(Boolean).join(' · ')}</small></span>
                  <span className="metric-index-value" style={{ textAlign: 'right' }}>{num(l.value)}<small style={{ display: 'block', color: 'var(--ink-4)', fontSize: 11 }}>{g.records.length} 条</small></span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="card">
          <div className="card-head">
            <h2>{selected.label}</h2>
            <span className="link">{[selected.unit || '单位未记录', selected.category].filter(Boolean).join(' · ')}　·　{recs.length} 条</span>
          </div>

          <div className="metric-statistics" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--sp-3)', margin: '8px 0 16px' }}>
            <div><span style={{ fontSize: 11, color: 'var(--ink-4)' }}>最近结果{last ? `　${last.date}` : ''}</span><strong style={{ display: 'block', fontSize: 'var(--fs-display)' }}>{last ? num(last.value) : '—'} <small style={{ fontSize: 12, fontWeight: 400 }}>{selected.unit}</small></strong></div>
            <div><span style={{ fontSize: 11, color: 'var(--ink-4)' }}>较上一条{prev ? `　${prev.date}` : ''}</span><strong style={{ display: 'block', fontSize: 'var(--fs-display)' }}>{delta === null ? '—' : (delta > 0 ? '+' : '') + num(delta)} <small style={{ fontSize: 12, fontWeight: 400 }}>{delta === null ? '' : selected.unit}</small></strong></div>
            <div><span style={{ fontSize: 11, color: 'var(--ink-4)' }}>范围内最低 / 最高</span><strong style={{ display: 'block', fontSize: 'var(--fs-display)' }}>{num(min)} / {num(max)} <small style={{ fontSize: 12, fontWeight: 400 }}>{selected.unit}</small></strong></div>
          </div>

          <LineChart records={recs} low={low} high={high} />
          <p className="metric-chart-note hint" style={{ marginTop: 8 }}>底色为最近一条记录的参考范围参考；各次范围不同时以明细为准。连接线仅辅助观察。</p>

          <div className="metric-history-head" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 'var(--fs-h2)' }}>逐次记录</h3>
          </div>
          <div className="metric-table-wrap" style={{ overflow: 'auto' }}>
            <table className="tbl metric-table">
              <thead><tr><th>日期</th><th>结果{selected.unit ? `（${selected.unit}）` : ''}</th><th>参考范围</th><th>来源 / 备注</th></tr></thead>
              <tbody>
                {recs.slice().reverse().map((r) => {
                  const hiF = r.flag === 'H' || (r.value !== null && r.high !== null && r.value > r.high);
                  const loF = r.flag === 'L' || (r.value !== null && r.low !== null && r.value < r.low);
                  return (
                    <tr key={r.id}>
                      <td><span className="ts">{r.date}</span></td>
                      <td style={hiF || loF ? { color: '#B4553F', fontWeight: 600 } : undefined}>{r.value === null ? (r.qualitative || '—') : num(r.value)}{hiF ? ' ↑' : loF ? ' ↓' : ''}</td>
                      <td>{r.low === null && r.high === null ? '未记录' : `${num(r.low)} – ${num(r.high)}`}</td>
                      <td>{r.source || '—'}{r.note ? <small style={{ color: 'var(--ink-4)' }}>　{r.note}</small> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
