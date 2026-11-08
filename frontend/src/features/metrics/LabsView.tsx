// 检验指标（大图页）：复刻旧前端 js/app.views.health.js renderLabs。
// 顶部 range 分段（全部 / 近 1 年）+ 按指标汇总/全部记录/导入/录入按钮；
// 主图 chart-card（可选指标 ECharts 趋势）+ 最近录入表 + 指标清单；
// 下面报告原件列表（点开弹窗查看/编辑）。聚合复用 window.HealthMetrics，保证同名同单位口径。
import { useEffect, useMemo, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { EChart } from '../../lib/EChart';
import { useReportModal } from '../reports/ReportModal';
import type { Lab, Report } from '../../api/types';
import type { WindowMetricGroup } from '../../lib/globals.d';

const pad = (n: number) => String(n).padStart(2, '0');
const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : String(Number(Number(v).toPrecision(10))));
function cutoffDate() { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function labValueText(r: Lab) { return r.value !== null && Number.isFinite(r.value as number) ? num(r.value) : (r.qualitative || ''); }
function isAbnormal(r: Lab) {
  if (r.flag === 'H' || r.flag === 'L') return true;
  if (typeof r.value !== 'number' || !Number.isFinite(r.value)) return false;
  return (r.low !== null && r.value < (r.low as number)) || (r.high !== null && r.value > (r.high as number));
}
const labRange = (r: Lab) => (r.low === null && r.high === null ? '—' : `${r.low === null ? '—' : num(r.low)} – ${r.high === null ? '—' : num(r.high)}`);
function labFlagCell(r: Lab) {
  if (isAbnormal(r)) return <span className="fl up" title="超出参考范围">↑</span>;
  if (r.low === null && r.high === null) return <span className="fl na" title="未填参考范围">—</span>;
  if (typeof r.value === 'number' && Number.isFinite(r.value)) return <span className="fl ok">·</span>;
  return <span className="fl na">—</span>;
}
function reportShort(t: string) { return (t || '').replace(/\s+/g, ' ').slice(0, 16); }

export function LabsView({ go }: { go: (to: string) => void }) {
  const { data } = useStore();
  const { setHead } = useHead();
  const reportModal = useReportModal();
  const HM = window.HealthMetrics;

  const labs = data?.labs ?? [];
  const reports = data?.reports ?? [];
  const [range, setRange] = useState<'all' | '1y'>('all');
  const [metric, setMetric] = useState('');

  const groups = useMemo<WindowMetricGroup[]>(() => {
    if (!data || !HM) return [];
    return HM.collect(data as unknown as Record<string, unknown>).filter((g) => g.kind === 'labs');
  }, [data, HM]);

  const scoped = useMemo(() => {
    const cut = range === '1y' ? cutoffDate() : '';
    return cut ? labs.filter((r) => r.date >= cut) : labs;
  }, [labs, range]);

  // 指标只在当前 scoped 里出现（用全量 groups 里的 records 交集判断）
  const metricOptions = useMemo(() => {
    const ids = new Set(scoped.map((r) => r.id));
    return groups.filter((g) => g.records.some((rec) => ids.has(rec.id)));
  }, [groups, scoped]);

  const selKey = useMemo(() => {
    if (metric && metricOptions.some((g) => g.key === metric)) return metric;
    // 默认挑记录最多、有异常、最近的指标
    const rank = metricOptions.map((g) => {
      const recs = g.records.filter((r) => scoped.some((x) => x.id === r.id));
      const last = recs[recs.length - 1];
      return { key: g.key, n: recs.length, bad: recs.some((r) => r.flag === 'H' || r.flag === 'L') ? 1 : 0, date: (last && last.date) || '' };
    }).sort((a, b) => b.n - a.n || b.bad - a.bad || b.date.localeCompare(a.date));
    return rank[0]?.key || '';
  }, [metric, metricOptions, scoped]);

  const selGroup = metricOptions.find((g) => g.key === selKey) || null;
  const ids = useMemo(() => new Set(scoped.map((r) => r.id)), [scoped]);
  const pts = selGroup ? selGroup.records.filter((r) => ids.has(r.id) && r.value !== null && Number.isFinite(r.value as number)).map((r) => ({ date: r.date, value: r.value as number })) : [];
  const low = selGroup?.records.slice().reverse()[0]?.low ?? null;
  const high = selGroup?.records.slice().reverse()[0]?.high ?? null;

  useEffect(() => {
    setHead({
      eyebrow: 'LAB RESULTS　检验记录',
      title: '检验指标',
      sub: '只连接同名、同单位的结果；不同检测方法之间不作比较',
      actions: (
        <>
          <div className="segmented">
            <button className={range === 'all' ? 'on' : ''} type="button" onClick={() => setRange('all')}>全部</button>
            <button className={range === '1y' ? 'on' : ''} type="button" onClick={() => setRange('1y')}>近 1 年</button>
          </div>
          <div className="btn-row">
            <button className="btn btn-ghost" type="button" onClick={() => go('metrics')}><Icon name="trend" />按指标汇总</button>
            <button className="btn btn-ghost" type="button" onClick={() => go('labs-all')}><Icon name="file" />全部记录</button>
            <button className="btn btn-primary" type="button" onClick={() => go('labs-all')}><Icon name="plus" />录入结果</button>
          </div>
        </>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const reportById = (id: string): Report | null => reports.find((r) => r.id === id) || null;
  const recent = scoped.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const allEmpty = !labs.length;
  const empty = !scoped.length;

  return (
    <div className="stack">
      <section className="card chart-card">
        <div className="chart-head">
          <div className="chart-title">
            <h2>{allEmpty ? '还没有检验数据' : empty ? '近 1 年没有记录' : selGroup ? (selGroup as any).label || selGroup.key : '暂无可趋势指标'}</h2>
            <p>{allEmpty ? '添加第一条结果后，这里会显示趋势' : empty ? `截至 ${cutoffDate()} 之后没有结果，可切换到「全部」查看` : selGroup ? `${selGroup.category}　·　${pts.length} 次记录　·　单位 ${selGroup.unit}` : '定性结果无单位/参考区间，不画趋势'}</p>
          </div>
          <div className="chart-tools">
            {!allEmpty && !empty && selGroup ? (
              <label className="select">
                <select aria-label="选择指标" value={selKey} onChange={(e) => setMetric(e.target.value)}>
                  {metricOptions.map((g) => <option key={g.key} value={g.key}>{(g as any).label || g.key} · {g.unit}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        </div>
        {(!allEmpty && !empty && !metricOptions.length) ? (
          <div style={{ marginTop: 10 }}>
            <div className="empty">当前只有定性结果（如阴性 / 阳性），没有数值和参考区间可画线；它们已保存在下方「最近录入」和「全部记录」，不会丢。<br />
              <button className="btn btn-ghost" type="button" onClick={() => go('labs-all')}>查看全部记录</button></div>
          </div>
        ) : (
          <>
            <div className="chart-box">
              <EChart points={pts} low={low} high={high} unit={selGroup?.unit} name={(selGroup as any)?.label || '指标'} emptyText={allEmpty ? '还没有检验数据' : '近 1 年没有记录'} />
            </div>
            <div className="chart-foot">
              <div className="legend">
                <span><i></i>{pts.length} 次结果{(() => { const bad = pts.filter((p) => (low != null && p.value < low) || (high != null && p.value > high)).length; return bad ? `，${bad} 次超出参考区间` : '，均在参考范围内'; })()}</span>
                <span><i className="sq"></i>{(low !== null || high !== null) ? `底色为参考区间 ${low ?? '—'} – ${high ?? '—'} ${selGroup?.unit || ''}` : '该指标未填写参考范围'}</span>
              </div>
              <p className="chart-note">单点表示一次检查；参考区间随实验室方法变化</p>
            </div>
          </>
        )}
      </section>

      <div className="grid-2 labs-grid">
        <section className="card">
          <div className="card-head">
            <h2>最近录入</h2>
            <button className="link link-btn" type="button" onClick={() => go('labs-all')}>{range === '1y' ? `近 1 年 ${scoped.length} 条` : `全部 ${labs.length} 条`} →</button>
          </div>
          {recent.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>日期</th><th>指标</th><th style={{ textAlign: 'right' }}>结果</th><th>提示</th><th>单位</th><th style={{ textAlign: 'right' }}>参考</th><th>报告</th></tr></thead>
                <tbody>
                  {recent.map((r) => {
                    const rep = r.reportId ? reportById(r.reportId) : null;
                    return (
                      <tr key={r.id}>
                        <td className="date">{r.date}</td>
                        <td>{r.name}<span className="cat-tag"> {r.category}</span>{rep ? <span className="r-m">　{reportShort(rep.title)}</span> : null}</td>
                        <td className={'num' + (isAbnormal(r) ? ' over' : '')}>{labValueText(r)}<span className="u-m"> {r.unit}</span></td>
                        <td className="flag">{labFlagCell(r)}</td>
                        <td className="unit-col" style={{ color: 'var(--muted-2)', fontSize: 10 }}>{r.unit}</td>
                        <td className="ref">{labRange(r)}</td>
                        <td className="report-col">{rep
                          ? <button className="rp-link" type="button" onClick={() => reportModal({ mode: 'view', report: rep })} title={`查看报告原件：${rep.title}`}>{reportShort(rep.title)}</button>
                          : <span className="na">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="empty">该时间段内没有记录。切到「全部」可查看更早的结果。</div>}
          <p className="hint" style={{ marginTop: 10 }}>「提示」列只与该条记录填写的参考范围比较，未填范围时显示 —；「报告」列为该结果的来源原件。</p>
        </section>

        <section className="card" style={{ height: '100%' }}>
          <div className="card-head"><h2>指标清单</h2><span className="link">{metricOptions.length} 种</span></div>
          {metricOptions.length ? (
            <div className="metric-list">
              {metricOptions.map((g) => {
                const recs = g.records.filter((r) => ids.has(r.id));
                const last = recs.slice(-1)[0];
                return (
                  <button className="metric-row" type="button" key={g.key} onClick={() => setMetric(g.key)}>
                    <span>{(g as any).label || g.key}<span>{g.unit}</span></span>
                    <b>{last ? num(last.value) : '—'}</b>
                  </button>
                );
              })}
            </div>
          ) : <div className="empty">还没有可用于比较的指标。<br />录入带单位与参考范围的数值结果后，这里可按指标切换查看。</div>}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>报告原件</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="hint">{reports.length ? `共 ${reports.length} 份` : '还没有'}</span>
            <button className="btn btn-ghost" type="button" onClick={() => reportModal({ mode: 'edit' })}><Icon name="plus" />添加报告</button>
          </div>
        </div>
        {reports.length ? (
          <div className="report-list">
            {reports.slice().sort((a, b) => b.date.localeCompare(a.date)).map((r) => {
              const n = labs.filter((l) => l.reportId === r.id).length;
              return (
                <div className="report-item" key={r.id}>
                  <button className="rp-thumb" type="button" onClick={() => reportModal({ mode: 'view', report: r })} aria-label="查看原件">
                    {r.file ? <img src={r.file} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /> : <span>无原件</span>}
                  </button>
                  <div className="rp-main">
                    <div className="rp-title">{r.title}{r.panel ? <span className="cat-tag"> {r.panel}</span> : null}{r.specimen ? <span className="cat-tag spec"> {r.specimen}</span> : null}<span className={`chip chip-sm${n ? ' green' : ' mute'}`}>{n ? `${n} 项结果` : '未关联'}</span></div>
                    <div className="rp-meta">{r.date}{r.hospital ? `　·　${r.hospital}` : ''}{r.note ? `　·　${r.note}` : ''}</div>
                  </div>
                  <div className="rp-acts">
                    <button type="button" onClick={() => reportModal({ mode: 'view', report: r })}>查看</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : <div className="empty">还没有报告原件。<br />把化验单拍照或截图存进来，之后每条结果都能对回它。</div>}
      </section>
    </div>
  );
}
