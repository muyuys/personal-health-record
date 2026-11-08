// 就诊摘要：复刻旧前端 js/app.views.profile.js renderSummary / summaryDocHTML。
// 把一次就诊（或某段时间）的就诊、检验、用药、待办汇成一页，可打印/导出 PDF。
// 支持 #/summary?visit=id 直达，预选某次就诊。
import { useEffect, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import type { Lab, Medication, Visit } from '../../api/types';

const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : String(Number(Number(v).toPrecision(10))));
function labValueText(r: Lab) { return r.value !== null && Number.isFinite(r.value as number) ? num(r.value) : (r.qualitative || ''); }
function isAbnormal(r: Lab) {
  if (r.flag === 'H' || r.flag === 'L') return true;
  if (typeof r.value !== 'number' || !Number.isFinite(r.value)) return false;
  return (r.low !== null && r.value < (r.low as number)) || (r.high !== null && r.value > (r.high as number));
}
const fmtRef = (r: Lab) => (r.low === null && r.high === null ? '未记录' : `${r.low === null ? '—' : num(r.low)} – ${r.high === null ? '—' : num(r.high)}`);
const MED_STATUS_LABEL: Record<string, string> = { active: '在服', stopped: '已停', unknown: '待确认' };
const medStatusLabel = (s: string) => MED_STATUS_LABEL[s] || s;
function fmtWhen(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

type Scope = { mode: 'visit'; visit: Visit } | { mode: 'range'; from: string; to: string } | { mode: 'none' };

export function SummaryView({ go, presetVisit }: { go: (to: string) => void; presetVisit?: string }) {
  const { data } = useStore();
  const { setHead } = useHead();
  const visits = data?.visits ?? [];
  const labs = data?.labs ?? [];
  const medications = data?.medications ?? [];
  const reports = data?.reports ?? [];
  const ov = (data?.profileOverrides ?? {}) as Record<string, string>;

  const [visitId, setVisitId] = useState(presetVisit || '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // 只有点了「生成摘要」或带 ?visit= 预选时才出文档
  const [scope, setScope] = useState<Scope>(presetVisit && visits.some((v) => v.id === presetVisit) ? { mode: 'visit', visit: visits.find((v) => v.id === presetVisit)! } : { mode: 'none' });

  useEffect(() => {
    setHead({
      eyebrow: '当前档案 · 我的档案',
      title: '就诊摘要导出',
      sub: '把一次就诊或某段时间的就诊、检验、用药汇成一页，可打印或另存为 PDF',
      actions: (
        <button className="btn btn-primary" type="button" onClick={() => window.print()}><Icon name="download" />打印 / 导出 PDF</button>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visitsSorted = () => visits.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const reportById = (id: string) => reports.find((r) => r.id === id) || null;

  const genScope = (): Scope => {
    const v = visitId ? visits.find((x) => x.id === visitId) : null;
    if (v) return { mode: 'visit', visit: v };
    if (from || to) return { mode: 'range', from, to };
    return { mode: 'none' };
  };

  const visitsFor = (s: Scope): Visit[] => {
    if (s.mode === 'visit') return [s.visit];
    if (s.mode === 'range') return visitsSorted().filter((v) => (!s.from || v.date >= s.from) && (!s.to || v.date <= s.to));
    return [];
  };
  const labsFor = (s: Scope): Lab[] => {
    let rows: Lab[];
    if (s.mode === 'visit') rows = s.visit.reportId ? labs.filter((r) => r.reportId === s.visit.reportId) : [];
    else if (s.mode === 'range') rows = labs.filter((r) => (!s.from || r.date >= s.from) && (!s.to || r.date <= s.to));
    else rows = [];
    return rows.slice().sort((a, b) => (isAbnormal(b) ? 1 : 0) - (isAbnormal(a) ? 1 : 0)
      || (b.date || '').localeCompare(a.date || '') || String(a.name).localeCompare(String(b.name)));
  };
  const medsFor = (s: Scope): Medication[] => {
    if (s.mode === 'visit') return medications.filter((m) => m.visitId === s.visit.id);
    if (s.mode === 'range') return medications.filter((m) => {
      if (m.status === 'active') return true;
      const s0 = m.startDate || '', s1 = m.endDate || '9999-12-31';
      return (!s.to || s0 <= s.to) && (!s.from || s1 >= s.from);
    });
    return [];
  };

  const renderDoc = (s: Scope) => {
    const name = ov['姓名／称呼'] || '【待填】';
    const birth = ov['出生日期'] || '【待填】';
    const gen = fmtWhen(new Date());
    const vs = visitsFor(s);
    const ls = labsFor(s);
    const ms = medsFor(s);
    const abn = ls.filter(isAbnormal);
    const dateLabel = s.mode === 'visit' ? `${s.visit.date}　${s.visit.visitType || ''}` : s.mode === 'range' ? `${s.from || '最早'} 至 ${s.to || '至今'}` : '';

    return (
      <section className="card sum-doc" id="summaryDoc">
        <div className="sum-head">
          <div><h2>就诊摘要</h2><p className="sum-sub">{dateLabel}</p></div>
          <div className="sum-meta">姓名：{name}　出生：{birth}<br />生成：{gen}</div>
        </div>

        <h3 className="sum-h">一、就诊信息</h3>
        {vs.length ? vs.map((v) => (
          <table className="data sum-table" key={v.id}><tbody>
            <tr><th>就诊日期</th><td>{v.date}{v.visitType ? `　·　${v.visitType}` : ''}</td><th>医院／科室</th><td>{v.hospital || '—'}{v.department ? `　·　${v.department}` : ''}</td></tr>
            <tr><th>接诊医生</th><td>{v.doctor || '—'}</td><th>关联报告</th><td>{v.reportId && reportById(v.reportId) ? reportById(v.reportId)!.title : '—'}</td></tr>
            <tr><th>主诉</th><td colSpan={3}>{v.chief || '待填'}</td></tr>
            <tr><th>诊断</th><td colSpan={3}>{v.diagnosis || '待填'}</td></tr>
            <tr><th>小结</th><td colSpan={3}>{v.summary || '待填'}</td></tr>
            {v.note ? <tr><th>备注</th><td colSpan={3}>{v.note}</td></tr> : null}
          </tbody></table>
        )) : <p className="hint">本时间段未登记就诊记录（就诊信息为待填）。</p>}

        <h3 className="sum-h">二、检验结果{abn.length ? `（异常 ${abn.length} 项）` : ''}</h3>
        {ls.length ? (
          <>
            <table className="data sum-table">
              <thead><tr><th style={{ width: 88 }}>日期</th><th>项目</th><th style={{ textAlign: 'right' }}>结果</th><th style={{ width: 110 }}>参考范围</th><th style={{ width: 70 }}>提示</th></tr></thead>
              <tbody>
                {ls.map((r) => {
                  let flag;
                  if (isAbnormal(r)) flag = <span className="fl up">↑ 异常</span>;
                  else if (r.flag === 'N') flag = <span className="fl ok">正常</span>;
                  else if (typeof r.value === 'number' && Number.isFinite(r.value) && (r.low != null || r.high != null)) flag = <span className="fl ok">在区间</span>;
                  else flag = <span className="fl na">—</span>;
                  return (
                    <tr className={isAbnormal(r) ? 'sum-abn' : ''} key={r.id}>
                      <td>{r.date}</td>
                      <td>{r.name}{r.category ? <span className="cat-tag">{r.category}</span> : null}</td>
                      <td style={{ textAlign: 'right' }}>{labValueText(r)}{r.unit ? ' ' + r.unit : ''}</td>
                      <td>{fmtRef(r)}</td>
                      <td>{flag}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="hint">共 {ls.length} 项，异常 {abn.length} 项（已置顶并标红）。</p>
          </>
        ) : <p className="hint">未关联检验结果（待填 / 未记录）。</p>}

        <h3 className="sum-h">三、用药</h3>
        {ms.length ? (
          <table className="data sum-table">
            <thead><tr><th>药品</th><th>剂量</th><th>频次</th><th>用法</th><th>状态</th><th>用途</th></tr></thead>
            <tbody>{ms.map((m) => (
              <tr key={m.id}><td>{m.name}</td><td>{m.dose || '—'}</td><td>{m.frequency || '—'}</td><td>{m.route || '—'}</td><td>{medStatusLabel(m.status)}</td><td>{m.purpose || '—'}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="hint">未记录用药（待填 / 未记录）。</p>}

        <h3 className="sum-h">四、待复诊 / 待办</h3>
        {(() => {
          const done = (data?.done ?? {}) as Record<string, boolean>;
          const todos = (data?.todoItems ?? []).filter((t) => !done[t.id]);
          return todos.length
            ? <ul className="sum-todos">{todos.map((t) => <li key={t.id}>{t.flag ? <span style={{ color: 'var(--warn)' }}>重点</span> : null}{t.flag ? '　' : ''}{t.text}{t.dueDate ? `（${t.dueDate}）` : ''}{t.groupName ? `　·　${t.groupName}` : ''}</li>)}</ul>
            : <p className="hint">无待复诊 / 待办记录。</p>;
        })()}

        <p className="sum-foot">本摘要由「个人健康档案」依已记录内容自动汇总，未记录项不代表不存在；请以原始检验报告与医生意见为准。</p>
      </section>
    );
  };

  return (
    <div className="stack">
      <section className="card no-print">
        <div className="card-head"><h2>选择摘要范围</h2><span className="hint">选一次就诊优先，否则按日期区间</span></div>
        <div className="summary-controls">
          <label className="sum-ctl">按就诊
            <select id="smVisit" value={visitId} onChange={(e) => setVisitId(e.target.value)}>
              <option value="">— 不选（改用日期区间）—</option>
              {visitsSorted().map((v) => <option key={v.id} value={v.id}>{v.date}　{v.visitType || '就诊'}　{v.hospital || ''}</option>)}
            </select>
          </label>
          <label className="sum-ctl">日期区间
            <input type="date" id="smFrom" value={from} onChange={(e) => setFrom(e.target.value)} /> <span>至</span>
            <input type="date" id="smTo" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="btn btn-primary" type="button" onClick={() => setScope(genScope())}>生成摘要</button>
          <button className="btn btn-ghost" type="button" onClick={() => { setVisitId(''); setFrom(''); setTo(''); setScope({ mode: 'none' }); }}>清空</button>
        </div>
        <p className="hint">摘要只汇总已记录内容，缺项显示「待填 / 未记录」，不推测、不编造。选择就诊会连带该次关联报告与同日检验；不选就诊则按日期区间（含首尾）汇总。</p>
      </section>

      {scope.mode === 'none' ? (
        <section className="card">
          <div className="empty">选择一次就诊，或填写日期区间后点「生成摘要」。<br />
            {visits.length ? '' : <>当前还没有登记就诊记录，可先去<button className="link-btn" type="button" onClick={() => go('records')}>「就诊记录」</button>登记，或直接用日期区间汇总检验结果。</>}
          </div>
        </section>
      ) : renderDoc(scope)}
    </div>
  );
}
