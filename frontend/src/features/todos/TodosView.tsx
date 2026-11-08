// 待办与提醒：复刻旧前端 js/app.views.health.js renderTodos。
// 静态 ARCHIVE.todos 分组卡（勾选只保存在本机 done 表，不写就医记录）
// + 「我新增的待办」可增/改/删（数据库 todoItems，走 api.putTable('todos')）。
import { useEffect, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import { ARCHIVE } from '../../lib/archive';
import { followTypeLabel, daysFromToday, openTodos, allTodos } from '../../lib/todos';
import type { TodoItem } from '../../api/types';

const FOLLOW_TYPES: [string, string][] = [
  ['visit', '复诊'],
  ['exam', '定期检查'],
  ['lab', '复查化验'],
  ['other', '其他'],
];

const uid = () => 'todo' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function followChip(t: string) {
  return <span className="chip chip-sm">{followTypeLabel(t)}</span>;
}

export function TodosView(_props: { go: (to: string) => void }) {
  const { data, reload } = useStore();
  const { setHead } = useHead();
  const done = (data?.done ?? {}) as Record<string, boolean>;
  const todoItems = data?.todoItems ?? [];
  const total = data ? allTodos(data).length : 0;
  const open = data ? openTodos(data).length : 0;

  const [editing, setEditing] = useState<TodoItem | null>(null);
  const [draft, setDraft] = useState<{ text: string; meta: string; dueDate: string; followType: string }>({
    text: '', meta: '', dueDate: '', followType: 'visit',
  });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setHead({
      eyebrow: '当前档案 · 我的档案',
      title: '待办与提醒',
      sub: '有日期按到期排，没日期不算逾期；未勾选不代表已预约',
      actions: (
        <button className="btn btn-primary" type="button" onClick={() => beginAdd()}><Icon name="plus" />添加提醒</button>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (id: string) => {
    await api.putState({ done: { ...done, [id]: !done[id] } });
    await reload();
  };

  const beginAdd = () => {
    setEditing(null);
    setDraft({ text: '', meta: '', dueDate: '', followType: 'visit' });
    setAdding(true);
  };
  const beginEdit = (t: TodoItem) => {
    setEditing(t);
    setDraft({ text: t.text, meta: t.meta || '', dueDate: t.dueDate || '', followType: t.followType || 'visit' });
    setAdding(true);
  };
  const cancel = () => { setAdding(false); setEditing(null); };

  const save = async () => {
    if (!draft.text.trim()) return;
    let next: TodoItem[];
    if (editing) {
      next = todoItems.map((t) => (t.id === editing.id ? { ...t, text: draft.text.trim(), meta: draft.meta, dueDate: draft.dueDate, followType: draft.followType } : t));
    } else {
      next = [...todoItems, {
        id: uid(), text: draft.text.trim(), groupName: '我新增的待办', meta: draft.meta,
        flag: '', createdAt: Date.now(), dueDate: draft.dueDate, followType: draft.followType,
      } as unknown as TodoItem];
    }
    await api.putTable('todos', next);
    await reload();
    cancel();
  };

  const del = async (id: string) => {
    await api.putTable('todos', todoItems.filter((t) => t.id !== id));
    await reload();
  };

  return (
    <div className="stack">
      <p className="hint">共 {total} 项，未完成 {open} 项　·　勾选只保存在本机，不会写入就医记录</p>

      <div className="todo-grid">
        {ARCHIVE.todos.map((g) => (
          <section className="card" key={g.group}>
            <div className="card-head">
              <h2>{g.group}</h2>
              <span className="link">{g.items.filter((i) => done[i.id]).length}/{g.items.length}</span>
            </div>
            {g.items.map((t) => (
              <div className={`task ${done[t.id] ? 'done' : ''}`} key={t.id}>
                <button className={`check ${done[t.id] ? 'on' : ''}`} type="button"
                  aria-label={done[t.id] ? '取消完成' : '标记完成'} onClick={() => void toggle(t.id)}>
                  <Icon name="check2" />
                </button>
                <div className="task-body">
                  <p className="task-text">{t.text} {followChip(t.followType)}</p>
                  <p className={`task-meta ${t.flag ? 'flag' : ''}`}>{t.meta}</p>
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>

      <section className="card">
        <div className="card-head" style={{ margin: '0 0 8px' }}>
          <h2>我新增的待办</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="link">{todoItems.length ? todoItems.filter((t) => done[t.id]).length + '/' + todoItems.length : '0 条'}</span>
            <button className="btn btn-mini" type="button" onClick={beginAdd}><Icon name="plus" />添加</button>
          </div>
        </div>

        {adding && (
          <div className="card" style={{ margin: '0 0 12px', background: 'var(--bg-sunken)', padding: 'var(--sp-3)' }}>
            <div className="form-grid">
              <label className="field"><span>待办内容</span>
                <input value={draft.text} autoFocus onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} placeholder="例如：3 个月后复查甲功" /></label>
              <label className="field"><span>补充说明</span>
                <input value={draft.meta} onChange={(e) => setDraft((d) => ({ ...d, meta: e.target.value }))} placeholder="选填，如：内分泌科" /></label>
              <label className="field"><span>到期日</span>
                <input type="date" value={draft.dueDate} onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))} /></label>
              <label className="field"><span>类型</span>
                <select value={draft.followType} onChange={(e) => setDraft((d) => ({ ...d, followType: e.target.value }))}>
                  {FOLLOW_TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select></label>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" type="button" onClick={() => void save()}>{editing ? '保存' : '添加'}</button>
              <button className="btn btn-secondary" type="button" onClick={cancel}>取消</button>
            </div>
          </div>
        )}

        {todoItems.length ? todoItems.map((t) => {
          const overdue = !done[t.id] && t.dueDate && (daysFromToday(t.dueDate) ?? 0) < 0;
          return (
            <div className={`task ${done[t.id] ? 'done' : ''}`} key={t.id}>
              <button className={`check ${done[t.id] ? 'on' : ''}`} type="button"
                aria-label={done[t.id] ? '取消完成' : '标记完成'} onClick={() => void toggle(t.id)}>
                <Icon name="check2" />
              </button>
              <div className="task-body">
                <p className="task-text">{t.text} {followChip(t.followType)}</p>
                <p className={`task-meta ${t.flag ? 'flag' : ''}`}>
                  {t.groupName || '我新增的待办'}
                  {t.meta ? `　·　${t.meta}` : ''}
                  {t.dueDate ? `　·　到期 ${t.dueDate}` : ''}
                  {overdue ? '　·　已逾期' : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: '0 0 auto' }}>
                <button className="btn-plain" type="button" onClick={() => beginEdit(t)}>编辑</button>
                <button className="btn-plain" type="button" style={{ color: '#B4553F' }} onClick={() => void del(t.id)}>删除</button>
              </div>
            </div>
          );
        }) : (
          <div className="empty" style={{ textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ flex: '0 0 auto', color: 'var(--pine-600)', marginTop: 2 }}><Icon name="check" /></span>
            <div>
              <p style={{ fontWeight: 600, color: 'var(--ink-2)', margin: '0 0 4px' }}>还没有自己新增的待办</p>
              <p className="hint" style={{ margin: '0 0 10px' }}>把要跟进的事（预约、检查、化验、取药等）记下来；到期会在首页提醒。勾选只保存于本机浏览器。</p>
              <button className="btn btn-primary" type="button" onClick={beginAdd}><Icon name="plus" />添加待办</button>
            </div>
          </div>
        )}
      </section>

      <p className="hint">勾选表示“这件事已经处理”，不会写入就医记录；实际就诊后请把结果补到对应主题与时间线。</p>
    </div>
  );
}
