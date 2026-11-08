// 健康主题 & 待办清单。
// 主题状态由化验结果按类别自动派生（异常→待随访，正常→监测中，无数据→待补充），
// 用户可以覆盖状态与备注；待办项可勾选完成、增删改。
import { useEffect, useMemo, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import type { Lab, TodoItem } from '../../api/types';

const uid = () => 'todo' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(Number(Number(v).toPrecision(10))));
const ABN = (r: Lab) => r.flag === 'H' || r.flag === 'L' || (r.value !== null && r.high !== null && r.value > r.high) || (r.value !== null && r.low !== null && r.value < r.low);

const STATUS: Record<string, { label: string; tone: string }> = {
  active: { label: '记录中', tone: 'pine' },
  followup: { label: '待随访', tone: 'amber' },
  monitor: { label: '监测中', tone: 'pine' },
  history: { label: '历史记录', tone: 'mute' },
  pending: { label: '待补充', tone: 'mute' },
};
const FOLLOW: Record<string, string> = { visit: '复诊', exam: '定期检查', lab: '复查化验', other: '其他' };

interface Theme {
  id: string;
  name: string;
  category: string;
  status: string;
  lastDate: string;
  count: number;
  abn: Lab[];
}

function buildThemes(labs: Lab[], overrides: Record<string, { status?: string; note?: string }>): Theme[] {
  const byCat = new Map<string, Lab[]>();
  for (const l of labs) {
    const c = l.category || '未分类';
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c)!.push(l);
  }
  const themes: Theme[] = [];
  for (const [cat, rows] of byCat) {
    const lastDate = rows.reduce((m, r) => (r.date > m ? r.date : m), '');
    const latest = rows.filter((r) => r.date === lastDate);
    const abn = latest.filter(ABN);
    const id = `lab-${cat}`;
    const ov = overrides[id];
    let status = abn.length ? 'followup' : 'monitor';
    if (ov?.status && STATUS[ov.status]) status = ov.status;
    themes.push({ id, name: cat, category: cat, status, lastDate, count: latest.length, abn });
  }
  return themes.sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || ''));
}

export function ThemesView({ go }: { go: (to: string) => void }) {
  const { data, reload } = useStore();
  const { setHead } = useHead();
  const labs = data?.labs ?? [];
  const todos = data?.todoItems ?? [];
  const issueStatus = (data?.issueStatus ?? {}) as Record<string, { status?: string; note?: string }>;
  const done = (data?.done ?? {}) as Record<string, boolean>;
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState('');
  const [newTodo, setNewTodo] = useState('');
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusDraft, setStatusDraft] = useState({ status: 'monitor', note: '' });

  useEffect(() => {
    setHead({ title: '健康主题', sub: '医院报告、本人描述与辅助分析分开标注' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const themes = useMemo(() => buildThemes(labs, issueStatus), [labs, issueStatus]);
  const counts: Record<string, number> = { '': themes.length };
  themes.forEach((t) => (counts[t.status] = (counts[t.status] || 0) + 1));
  const list = themes.filter((t) => !filter || t.status === filter);
  const cur = themes.find((t) => t.id === sel) || list[0];

  // ---- 主题状态编辑 ----
  const beginEdit = (t: Theme) => {
    setStatusDraft({ status: t.status, note: issueStatus[t.id]?.note || '' });
    setEditingStatus(true);
  };
  const saveStatus = async () => {
    const next = { ...issueStatus, [cur!.id]: { status: statusDraft.status, note: statusDraft.note, updatedAt: Date.now() } };
    await api.putIssueStatus(next);
    await reload();
    setEditingStatus(false);
  };

  // ---- 待办 ----
  const addTodo = async () => {
    if (!newTodo.trim()) return;
    const next: TodoItem[] = [...todos, { id: uid(), text: newTodo.trim(), groupName: '我新增的待办', meta: '', flag: '', createdAt: Date.now(), dueDate: '', followType: 'other' } as unknown as TodoItem];
    await api.putTable('todos', next);
    await reload();
    setNewTodo('');
  };
  const toggleTodo = async (id: string) => {
    const nextDone = { ...done, [id]: !done[id] };
    await api.putState({ done: nextDone });
    await reload();
  };
  const delTodo = async (id: string) => {
    await api.putTable('todos', todos.filter((t) => t.id !== id));
    await reload();
  };

  const openCount = todos.filter((t) => !done[t.id]).length;

  return (
    <div className="stack">
      <div className="filter-row">
        {[['', '全部'], ['followup', '待随访'], ['monitor', '监测中'], ['history', '历史记录'], ['pending', '待补充']].map(([k, label]) => (
          <button key={k} className={`filter-chip ${filter === k ? 'on' : ''}`} type="button" onClick={() => setFilter(k)}>{label} {counts[k] || 0}</button>
        ))}
        <button className="btn btn-ghost" type="button" style={{ marginLeft: 'auto' }} onClick={() => go('labs-all')}>检验记录 →</button>
      </div>

      <div className="issues-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 'var(--sp-4)' }}>
        <section className="card issue-list">
          <div className="list-head" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 4px' }}><span>{filter ? STATUS[filter]?.label : '全部主题'}</span><small style={{ color: 'var(--ink-4)' }}>按最近记录排序</small></div>
          {list.length === 0 ? <p className="hint" style={{ padding: 10 }}>该筛选下暂无主题</p> : list.map((t) => (
            <button key={t.id} className={`issue-item ${t.id === cur?.id ? 'on' : ''}`} type="button" onClick={() => { setSel(t.id); setEditingStatus(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '10px 8px', border: 'none', borderBottom: '1px solid var(--line-soft)', background: t.id === cur?.id ? 'var(--bg-hover)' : 'transparent', cursor: 'pointer' }}>
              <span className="dot" style={{ width: 8, height: 8, borderRadius: '50%', background: t.status === 'followup' ? '#C58A2E' : t.status === 'monitor' ? 'var(--pine-600)' : 'var(--ink-5)', flex: '0 0 auto' }}></span>
              <span className="nm" style={{ flex: 1 }}>{t.name}</span>
              <span className="mt" style={{ color: 'var(--ink-4)', fontSize: 12 }}>{t.lastDate ? t.lastDate.slice(5) : '未记录'} · {t.abn.length ? '化验异常' : '化验结果'}</span>
            </button>
          ))}
        </section>

        {cur ? (
          <section className="card issue-detail">
            <div className="detail-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: '0 0 4px' }}>{cur.name} <span className="chip chip-sm">{STATUS[cur.status]?.label || cur.status}</span></h2>
                <p className="meta" style={{ color: 'var(--ink-4)', margin: 0 }}>最近化验 {cur.lastDate || '未记录'} · 共 {cur.count} 项{cur.abn.length ? `，异常 ${cur.abn.length} 项` : ''}</p>
              </div>
              <button className="btn-plain" type="button" onClick={() => beginEdit(cur)}>编辑状态 / 备注</button>
            </div>

            {editingStatus && (
              <div className="card" style={{ marginTop: 'var(--sp-3)', background: 'var(--bg-sunken)', padding: 'var(--sp-3)' }}>
                <div className="form-grid">
                  <label className="field"><span>状态</span>
                    <select value={statusDraft.status} onChange={(e) => setStatusDraft((d) => ({ ...d, status: e.target.value }))}>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </label>
                  <label className="field"><span>我的备注</span><input value={statusDraft.note} onChange={(e) => setStatusDraft((d) => ({ ...d, note: e.target.value }))} /></label>
                </div>
                <div className="form-actions"><button className="btn btn-primary" type="button" onClick={() => void saveStatus()}>保存</button><button className="btn btn-secondary" type="button" onClick={() => setEditingStatus(false)}>取消</button></div>
              </div>
            )}

            <div className="divider" style={{ borderTop: '1px solid var(--line)', margin: '12px 0' }} />
            <p className="block-label" style={{ fontSize: 12, color: 'var(--ink-4)' }}>证据与不确定性</p>
            {cur.abn.length ? cur.abn.map((r) => (
              <div className="evidence" key={r.id} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <span className="tag report" style={{ color: '#B4553F' }}>医院报告</span>
                <p style={{ margin: 0 }}>{r.date} {r.name} {num(r.value)}{r.unit}（参考 {r.low ?? '—'}–{r.high ?? '—'}）</p>
              </div>
            )) : (
              <div className="evidence"><span className="tag analysis">辅助分析</span><p style={{ margin: 0 }}>{cur.lastDate} 该类别共 {cur.count} 项，均在参考范围内。</p></div>
            )}
            <div className="evidence"><span className="tag analysis" style={{ color: 'var(--ink-4)' }}>辅助分析</span><p style={{ margin: 0 }}>以上结论与异常标记由数据库化验记录自动生成，不是新增诊断，也不能替代医生解读。</p></div>

            <div className="need-box" style={{ marginTop: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)', padding: 10 }}>
              <b>仍需补充</b><p style={{ margin: '4px 0 0' }}>{cur.abn.length ? '携带最近报告复诊，听取医生对异常项的解释与处理建议；关注指标趋势。' : '定期复查；有新的报告时本结论会自动更新。'}</p>
            </div>
            {issueStatus[cur.id]?.note ? <div className="need-box" style={{ marginTop: 8, background: '#F1ECE0', borderRadius: 'var(--r-sm)', padding: 10 }}><b>我的备注</b><p style={{ margin: '4px 0 0' }}>{issueStatus[cur.id].note}</p></div> : null}
          </section>
        ) : <section className="card empty"><p className="hint">请选择一个主题</p></section>}
      </div>

      {/* 待办清单 */}
      <section className="card">
        <div className="card-head"><h2>待办与提醒</h2><span className="link">{todos.length} 项 · 未完成 {openCount} 项</span></div>
        <p className="hint" style={{ marginTop: 0 }}>勾选只保存在本机，不会写入就医记录；未勾选不代表已预约。</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input value={newTodo} onChange={(e) => setNewTodo(e.target.value)} placeholder="添加提醒（预约、检查、取药…）" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === 'Enter') void addTodo(); }} />
          <button className="btn btn-primary" type="button" onClick={() => void addTodo()}><Icon name="plus" />添加</button>
        </div>
        {todos.length === 0 ? <p className="hint">还没有待办。把要跟进的事记下来。</p> : todos.map((t) => (
          <div className="task" key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line-soft)', opacity: done[t.id] ? 0.55 : 1 }}>
            <button className={`check ${done[t.id] ? 'on' : ''}`} type="button" aria-label={done[t.id] ? '取消完成' : '标记完成'} onClick={() => void toggleTodo(t.id)} style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${done[t.id] ? 'var(--pine-600)' : 'var(--line-strong)'}`, background: done[t.id] ? 'var(--pine-600)' : 'transparent', flex: '0 0 auto' }}></button>
            <div style={{ flex: 1 }}>
              <p className="task-text" style={{ margin: 0, textDecoration: done[t.id] ? 'line-through' : 'none' }}>{t.text} {t.followType ? <span className="chip chip-sm">{FOLLOW[t.followType] || t.followType}</span> : null}</p>
              {t.meta || t.dueDate ? <p className="task-meta" style={{ margin: 0, color: 'var(--ink-4)', fontSize: 12 }}>{[t.meta, t.dueDate ? `到期 ${t.dueDate}` : ''].filter(Boolean).join('　·　')}</p> : null}
            </div>
            <button className="btn-plain" type="button" style={{ color: '#B4553F' }} onClick={() => void delTodo(t.id)}>删除</button>
          </div>
        ))}
      </section>
    </div>
  );
}
