// 健康主题：复刻旧前端 js/app.views.health.js renderIssues/issueDetail。
// 主题来自 ARCHIVE.issues（人工整理的目录，含证据分类/关联资料/近期检查），
// 状态与备注可在 issueStatus 里覆盖，待办清单可勾选完成、增删。
import { useEffect, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import { ARCHIVE } from '../../lib/archive';
import type { TodoItem } from '../../api/types';

const uid = () => 'todo' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

interface AIssueEvidence { type: string; text: string }
interface AIssueFile { name: string; href: string; meta: string }
interface AIssueTimeline { date: string; text: string }
interface AIssue {
  id: string; name: string; status: string; lastDate: string; lastLabel: string;
  card?: string; head: string; evidence: AIssueEvidence[]; need: string; userNote?: string;
  files: AIssueFile[]; timeline: AIssueTimeline[];
}
interface StatusMeta { label: string; tone: string }

const ISSUES: AIssue[] = (ARCHIVE.issues ?? []) as unknown as AIssue[];
const STATUSES: Record<string, StatusMeta> = (ARCHIVE.statuses ?? {}) as unknown as Record<string, StatusMeta>;

const EVIDENCE_TAG: Record<string, string> = {
  '医院报告': 'report',
  '本人描述': 'self',
  '建议计划': 'plan',
  '辅助分析': 'analysis',
};
function tagClass(t: string) { return EVIDENCE_TAG[t] || 'analysis'; }
function statusChip(status: string) {
  const s = STATUSES[status] || { label: status, tone: 'mute' };
  return <span className={`chip chip-sm tone-${s.tone}`}>{s.label}</span>;
}

const FOLLOW: Record<string, string> = { visit: '复诊', exam: '定期检查', lab: '复查化验', other: '其他' };

export function ThemesView({ go }: { go: (to: string) => void }) {
  const { data, reload } = useStore();
  const { setHead } = useHead();
  const todos = data?.todoItems ?? [];
  const issueStatus = (data?.issueStatus ?? {}) as Record<string, { status?: string; note?: string }>;
  const done = (data?.done ?? {}) as Record<string, boolean>;
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState('');
  const [newTodo, setNewTodo] = useState('');
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusDraft, setStatusDraft] = useState({ status: 'monitor', note: '' });

  useEffect(() => {
    setHead({
      eyebrow: '',
      title: '健康主题',
      sub: `${ISSUES.length} 个主题　·　医院报告、本人描述与辅助分析分开标注`,
      actions: (
        <>
          <a className="btn btn-ghost" href="#/labs-all">检验指标 →</a>
          <button className="btn btn-primary" type="button" onClick={() => alert('新增主题：本版暂随静态档案维护，编辑请到「我的档案」或联系管理员。')}><Icon name="plus" />新增主题</button>
        </>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveStatus = (i: AIssue) => issueStatus[i.id]?.status && STATUSES[issueStatus[i.id].status!] ? issueStatus[i.id].status! : i.status;

  const counts: Record<string, number> = { '': ISSUES.length };
  ISSUES.forEach((i) => { const s = effectiveStatus(i); counts[s] = (counts[s] || 0) + 1; });
  const filters: [string, string, number][] = [
    ['', '全部', counts[''] || 0],
    ['active', '记录中', counts.active || 0],
    ['followup', (STATUSES.followup?.label) || '待随访', counts.followup || 0],
    ['monitor', '监测中', counts.monitor || 0],
    ['history', '历史记录', counts.history || 0],
    ['pending', '待补充', counts.pending || 0],
    ['stub', '仅目录', counts.stub || 0],
  ];
  const list = ISSUES.filter((i) => !filter || effectiveStatus(i) === filter);
  const cur = ISSUES.find((i) => i.id === sel) || list[0];

  const beginEdit = (i: AIssue) => { setStatusDraft({ status: effectiveStatus(i), note: issueStatus[i.id]?.note || '' }); setEditingStatus(true); };
  const saveStatus = async () => {
    if (!cur) return;
    const next = { ...issueStatus, [cur.id]: { status: statusDraft.status, note: statusDraft.note, updatedAt: Date.now() } };
    await api.putIssueStatus(next);
    await reload();
    setEditingStatus(false);
  };

  const addTodo = async () => {
    if (!newTodo.trim()) return;
    const next: TodoItem[] = [...todos, { id: uid(), text: newTodo.trim(), groupName: '我新增的待办', meta: '', flag: '', createdAt: Date.now(), dueDate: '', followType: 'other' } as unknown as TodoItem];
    await api.putTable('todos', next);
    await reload();
    setNewTodo('');
  };
  const toggleTodo = async (id: string) => { await api.putState({ done: { ...done, [id]: !done[id] } }); await reload(); };
  const delTodo = async (id: string) => { await api.putTable('todos', todos.filter((t) => t.id !== id)); await reload(); };

  const openCount = todos.filter((t) => !done[t.id]).length;

  return (
    <div className="stack">
      <div className="filter-row">
        {filters.map(([k, label, n]) => (
          <button key={k} className={`filter-chip ${filter === k ? 'on' : ''}`} type="button" onClick={() => setFilter(k)}>{label} {n}</button>
        ))}
      </div>

      <div className="issues-layout">
        <section className="card issue-list">
          <div className="list-head"><span>{filter ? (STATUSES[filter]?.label || '主题') : '全部主题'}</span><small>按最近记录排序</small></div>
          {list.length === 0 ? <div className="empty" style={{ margin: 10 }}>该筛选下暂无主题</div> : list.map((i) => (
            <button key={i.id} className={`issue-item ${i.id === cur?.id ? 'on' : ''}`} type="button" onClick={() => { setSel(i.id); setEditingStatus(false); }}>
              <span className={`dot ${(STATUSES[effectiveStatus(i)]?.tone) || 'mute'}`}></span>
              <span className="nm">{i.name}</span>
              <span className="mt">{i.lastDate === '未记录' ? '未记录' : (i.lastDate || '').slice(5)} · {i.lastLabel}</span>
            </button>
          ))}
        </section>

        {cur ? (
          <section className="card issue-detail">
            <div className="detail-head">
              <div>
                <h2>{cur.name} {statusChip(effectiveStatus(cur))}</h2>
                <p className="meta">{cur.head}</p>
              </div>
              <button className="detail-edit chip ghost" type="button" onClick={() => beginEdit(cur)}>编辑状态 / 备注</button>
            </div>

            {editingStatus && (
              <div className="card" style={{ marginTop: 'var(--sp-3)', background: 'var(--bg-sunken)', padding: 'var(--sp-3)' }}>
                <div className="form-grid">
                  <label className="field"><span>状态</span>
                    <select value={statusDraft.status} onChange={(e) => setStatusDraft((d) => ({ ...d, status: e.target.value }))}>
                      {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </label>
                  <label className="field"><span>我的备注</span><input value={statusDraft.note} onChange={(e) => setStatusDraft((d) => ({ ...d, note: e.target.value }))} /></label>
                </div>
                <div className="form-actions"><button className="btn btn-primary" type="button" onClick={() => void saveStatus()}>保存</button><button className="btn btn-secondary" type="button" onClick={() => setEditingStatus(false)}>取消</button></div>
              </div>
            )}

            <div className="divider" />
            <div>
              <p className="block-label">证据与不确定性</p>
              {cur.evidence.map((e, idx) => (
                <div className="evidence" key={idx}>
                  <span className={`tag ${tagClass(e.type)}`}>{e.type}</span>
                  <p>{e.text}</p>
                </div>
              ))}
            </div>
            <div className="need-box"><b>仍需补充</b><p>{cur.need}</p></div>
            {(issueStatus[cur.id]?.note || cur.userNote) ? (
              <div className="need-box" style={{ background: '#F1ECE0' }}><b>我的备注</b><p>{issueStatus[cur.id]?.note || cur.userNote}</p></div>
            ) : null}
            {cur.files.length ? (
              <div>
                <p className="block-label">关联资料</p>
                {cur.files.map((f, idx) => (
                  <a className="file-row" key={idx} href={f.href}><Icon name="file" /><span>{f.name}</span><span className="fm">{f.meta}</span></a>
                ))}
              </div>
            ) : null}
            {cur.timeline.length ? (
              <div>
                <p className="block-label">近期检查</p>
                {cur.timeline.map((t, idx) => (
                  <div className="tl-row" key={idx}><time>{t.date}</time><p>{t.text}</p></div>
                ))}
              </div>
            ) : null}
            <div className="detail-actions">
              <button className="btn btn-primary" type="button" onClick={() => go('daily')}>记录一次</button>
              <button className="btn btn-ghost" type="button" onClick={() => void saveStatus()}>标记为已复诊</button>
              <span className="hint" style={{ alignSelf: 'center' }}>勾选只同步待办清单，不改变病历文件</span>
            </div>
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
