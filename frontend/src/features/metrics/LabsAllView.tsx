// 全部检验记录：复刻旧前端 js/app.views.health.js renderLabAll/paintLabAll。
// 顶部工具条搜索 + 类别筛选 + 来源报告筛选；汇总条；按日期分组的折叠明细 + 分页；
// 录入/删除逐条可改。点项目名跳到指标趋势。
import { useEffect, useMemo, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import type { Lab, Report } from '../../api/types';

const CATS = ['血常规', '肝功能', '肾功能', '其他'];
const PAGE = 30;
const uid = () => 'lab' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad = (n: number) => String(n).padStart(2, '0');
const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : String(Number(Number(v).toPrecision(10))));
const rangeText = (r: Lab) => (r.low === null && r.high === null ? '未记录' : `${r.low === null ? '—' : num(r.low)} – ${r.high === null ? '—' : num(r.high)}`);
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
function cutoff() { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function reportShort(t: string) { return (t || '').replace(/\s+/g, ' ').slice(0, 24); }
function labValueText(r: Lab) { return r.value !== null && Number.isFinite(r.value as number) ? num(r.value) : (r.qualitative || ''); }
function isAbnormal(r: Lab) {
  if (r.flag === 'H' || r.flag === 'L') return true;
  if (typeof r.value !== 'number' || !Number.isFinite(r.value)) return false;
  return (r.low !== null && r.value < (r.low as number)) || (r.high !== null && r.value > (r.high as number));
}
function flagCell(r: Lab) {
  if (r.qualitative && !(typeof r.value === 'number' && Number.isFinite(r.value))) {
    if (r.flag === 'H') return <span className="fl up" title="定性结果异常">↑</span>;
    if (r.flag === 'N') return <span className="fl ok" title="定性结果正常">·</span>;
    return <span className="fl na" title="定性结果">—</span>;
  }
  if (r.low === null && r.high === null) return <span className="fl na" title="未填参考范围，无法判断">—</span>;
  if (r.value !== null && r.high !== null && (r.value as number) > (r.high as number)) return <span className="fl up" title="高于参考上限">↑</span>;
  if (r.value !== null && r.low !== null && (r.value as number) < (r.low as number)) return <span className="fl down" title="低于参考下限">↓</span>;
  return <span className="fl ok" title="在参考区间内">·</span>;
}

export function LabsAllView({ go }: { go: (to: string) => void }) {
  const { data, reload } = useStore();
  const { setHead } = useHead();
  const labs = data?.labs ?? [];
  const reports = data?.reports ?? [];
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [rep, setRep] = useState('');
  const [range, setRange] = useState<'all' | '1y'>('all');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ date: todayISO(), category: '血常规', name: '', value: '', unit: '', low: '', high: '', note: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHead({
      eyebrow: 'LAB ARCHIVE　检验记录',
      title: '全部检验记录',
      sub: '不按「最近」截断：全部结果都在这里，逐条可改',
      actions: (
        <>
          <div className="segmented">
            <button type="button" className={range === 'all' ? 'on' : ''} onClick={() => setRange('all')}>全部时间</button>
            <button type="button" className={range === '1y' ? 'on' : ''} onClick={() => setRange('1y')}>近 1 年</button>
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => go('metrics')}><Icon name="trend" />趋势图</button>
          <button className="btn btn-primary" type="button" onClick={() => setAdding((v) => !v)}><Icon name="plus" />录入结果</button>
        </>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cats = useMemo(() => [...new Set(labs.map((l) => l.category).filter(Boolean))].sort((a, b) => {
    const ia = CATS.indexOf(a), ib = CATS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'zh');
  }), [labs]);
  const repsSorted = useMemo(() => reports.slice().sort((a, b) => b.date.localeCompare(a.date)), [reports]);

  const rows = useMemo(() => {
    const cut = range === '1y' ? cutoff() : '';
    const kw = q.trim().toLowerCase();
    const reportById = new Map(reports.map((r) => [r.id, r]));
    return labs.filter((r) => {
      if (cut && r.date < cut) return false;
      if (cat && r.category !== cat) return false;
      if (rep === '__none__') { if (r.reportId) return false; }
      else if (rep && r.reportId !== rep) return false;
      if (!kw) return true;
      const rp = r.reportId ? reportById.get(r.reportId) : null;
      return [r.name, r.note, r.category, r.unit, r.value, r.qualitative, r.date, r.source,
        rp?.title, rp?.hospital, rp?.panel, rp?.specimen].join(' ').toLowerCase().includes(kw);
    }).sort((a, b) => b.date.localeCompare(a.date) || a.category.localeCompare(b.category, 'zh') || a.name.localeCompare(b.name, 'zh'));
  }, [labs, reports, cat, rep, q, range]);

  useEffect(() => { setPage(1); }, [q, cat, rep, range]);

  const bad = rows.filter(isAbnormal).length;
  const unknown = rows.filter((r) => !r.qualitative && r.low === null && r.high === null).length;
  const days = new Set(rows.map((r) => r.date)).size;
  const repN = new Set(rows.map((r) => r.reportId).filter(Boolean)).size;

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE));
  const curPage = Math.min(Math.max(1, page), totalPages);
  const pageRows = rows.slice((curPage - 1) * PAGE, curPage * PAGE);
  // 按日期分组（当前页覆盖的日期）
  const groups: { date: string; rows: Lab[] }[] = [];
  for (const r of pageRows) {
    const g = groups[groups.length - 1];
    if (g && g.date === r.date) g.rows.push(r); else groups.push({ date: r.date, rows: [r] });
  }
  const reportById = new Map(reports.map((r) => [r.id, r]));

  const add = async () => {
    if (!draft.name.trim()) return;
    const rec: Lab = {
      id: uid(), date: draft.date, category: draft.category, name: draft.name,
      value: draft.value === '' ? null : parseFloat(draft.value), unit: draft.unit,
      low: draft.low === '' ? null : parseFloat(draft.low), high: draft.high === '' ? null : parseFloat(draft.high),
      qualitative: '', flag: '', source: '手动录入', note: draft.note, reportId: '',
    };
    setSaving(true);
    try {
      await api.putTable('labs', [...labs, rec]);
      await reload();
      setDraft({ ...draft, name: '', value: '', low: '', high: '', note: '' });
      setAdding(false);
    } finally { setSaving(false); }
  };
  const del = async (id: string) => { await api.putTable('labs', labs.filter((l) => l.id !== id)); await reload(); };

  return (
    <div className="stack">
      {adding && (
        <section className="card">
          <div className="card-head"><h2>录入检验结果</h2></div>
          <div className="form-grid">
            <label className="field"><span>日期</span><input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} /></label>
            <label className="field"><span>类别</span><select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="field"><span>项目</span><input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="如 血红蛋白" /></label>
            <label className="field"><span>结果</span><input type="number" step="0.01" value={draft.value} onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))} /></label>
            <label className="field"><span>单位</span><input value={draft.unit} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))} /></label>
            <label className="field"><span>参考下限</span><input type="number" step="0.01" value={draft.low} onChange={(e) => setDraft((d) => ({ ...d, low: e.target.value }))} /></label>
            <label className="field"><span>参考上限</span><input type="number" step="0.01" value={draft.high} onChange={(e) => setDraft((d) => ({ ...d, high: e.target.value }))} /></label>
            <label className="field"><span>备注</span><input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} /></label>
          </div>
          <div className="form-actions"><button className="btn btn-primary" type="button" disabled={saving} onClick={() => void add()}>{saving ? '保存中…' : '保存'}</button><button className="btn btn-secondary" type="button" onClick={() => setAdding(false)}>取消</button></div>
        </section>
      )}

      <section className="card">
        <div className="laball-toolbar">
          <label className="search">{<Icon name="search" />}<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="项目、备注、医院" aria-label="搜索检验记录" /></label>
          <label className="select"><select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="按项目类别筛选">
            <option value="">全部类别</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></label>
          <label className="select"><select value={rep} onChange={(e) => setRep(e.target.value)} aria-label="按来源报告筛选">
            <option value="">全部来源</option>
            {repsSorted.map((r) => <option key={r.id} value={r.id}>{r.date}　{reportShort(r.title)}</option>)}
            <option value="__none__">未关联报告</option>
          </select></label>
        </div>
        <div className="laball-sum" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, margin: '4px 0 12px', fontSize: 13, color: 'var(--ink-4)' }}>
          <span><b>{rows.length}</b> / {labs.length} 条</span>
          <span><b>{days}</b> 次检查</span>
          <span><b>{repN}</b> 份报告</span>
          {bad ? <span style={{ color: 'var(--st-abnormal, #B4553F)' }}><b>{bad}</b> 条超出参考区间</span> : null}
          {unknown ? <span><b>{unknown}</b> 条未填参考范围，不能当作正常</span> : null}
        </div>

        {rows.length === 0 ? (
          <p className="hint">{labs.length ? '没有符合筛选条件的记录，清空关键词或把类别/来源改回「全部」。' : '还没有检验记录。可以逐条录入，全部结果都会汇总在这里。'}</p>
        ) : (
          <details className="detail-fold">
            <summary className="df-sum">
              <span className="df-title"><span className="df-chev" aria-hidden="true" />记录明细</span>
              <span className="df-count">{rows.length} 条</span>
              <span className="df-hint">展开查看</span>
            </summary>
            <div className="df-body">
              <div className="table-wrap">
                <table className="data laball-table">
                  <thead><tr><th>项目</th><th style={{ textAlign: 'right' }}>结果</th><th className="col-ref" style={{ textAlign: 'right' }}>参考</th><th>提示</th><th className="col-rep">报告</th><th></th></tr></thead>
                  <tbody>
                    {groups.map((g) => {
                      const gReps = [...new Set(g.rows.map((r) => r.reportId).filter(Boolean))].map((id) => reportById.get(id!)).filter(Boolean) as Report[];
                      const hosp = [...new Set(gReps.map((x) => x.hospital).filter(Boolean))].join(' / ');
                      const gBad = g.rows.filter(isAbnormal).length;
                      return (
                        <>
                          <tr key={g.date} className="laball-day"><td colSpan={6}>
                            <b>{g.date}</b><span>　{g.rows.length} 条{gReps.length ? ` · ${gReps.length} 份报告` : ''}{hosp ? ` · ${hosp}` : ''}{gBad ? <> · <em>{gBad} 条超出区间</em></> : null}</span>
                          </td></tr>
                          {g.rows.map((r) => {
                            const rp = r.reportId ? reportById.get(r.reportId) : null;
                            return (
                              <tr key={r.id}>
                                <td className="name-cell"><button className="metric-inline-link link-btn" type="button" title="查看该指标历史变化" onClick={() => go('metrics')}>{r.name}</button><span className="cat-tag"> {r.category}</span></td>
                                <td className={'num' + (isAbnormal(r) ? ' over' : '')} style={isAbnormal(r) ? { color: '#B4553F', fontWeight: 600 } : { textAlign: 'right' }}>{labValueText(r)}<span className="lab-unit"> {r.unit}</span></td>
                                <td className="ref col-ref" style={{ textAlign: 'right' }}>{rangeText(r)}</td>
                                <td className="flag">{flagCell(r)}</td>
                                <td className="report-col col-rep">{rp ? <button className="rp-link link-btn" type="button" title={'查看原件：' + rp.title} onClick={() => go('reports')}>{reportShort(rp.title)}</button> : <span className="na">—</span>}</td>
                                <td className="act"><button type="button" onClick={() => void del(r.id)} className="danger">删除</button></td>
                              </tr>
                            );
                          })}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="pager" style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 12 }}>
                  <button className="btn" type="button" disabled={curPage === 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
                  <span className="hint">{curPage} / {totalPages}</span>
                  <button className="btn" type="button" disabled={curPage === totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
                </div>
              )}
            </div>
          </details>
        )}
        <p className="hint" style={{ marginTop: 10 }}>「提示」列只与这条记录自己填的参考范围比较，未填范围时显示 —，不代表正常。删除不可撤销，改之前建议先导出备份。</p>
      </section>
    </div>
  );
}
