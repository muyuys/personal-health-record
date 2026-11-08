// 待办派生逻辑：对齐旧前端 app.derive.js 的 allTodos/openTodos/todoDue/nextUpTodos/
// daysFromToday，以及 app.core.js 的 followTypeLabel。
import type { Snapshot, TodoItem } from '../api/types';
import { ARCHIVE, type ArchiveTodoItem } from './archive';

export interface FlatTodo {
  id: string;
  text: string;
  meta: string;
  flag?: boolean | string;
  followType: string;
  group: string;
  dueDate?: string;
}

const FOLLOW_TYPES: { k: string; label: string }[] = [
  { k: 'visit', label: '复诊' },
  { k: 'exam', label: '定期检查' },
  { k: 'lab', label: '复查化验' },
  { k: 'other', label: '其他' },
];

export function followTypeLabel(k: string): string {
  const hit = FOLLOW_TYPES.find((t) => t.k === k);
  return hit ? hit.label : '复诊';
}

function firstISODate(text: string): string {
  const m = String(text || '').match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}

function normISODate(s: unknown): string {
  const v = String(s || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
}

export function todoDue(t: FlatTodo): string {
  return normISODate(t.dueDate ?? '') || firstISODate(t.meta);
}

/** 合并静态 ARCHIVE.todos 与数据库 todoItems */
export function allTodos(data: Snapshot): FlatTodo[] {
  const base: FlatTodo[] = ARCHIVE.todos.flatMap((g) =>
    g.items.map((i: ArchiveTodoItem) => ({
      id: i.id,
      text: i.text,
      meta: i.meta,
      flag: i.flag,
      followType: i.followType,
      group: g.group,
    })),
  );
  const dbItems: FlatTodo[] = data.todoItems.map((t: TodoItem) => ({
    id: t.id,
    text: t.text,
    meta: t.meta,
    flag: t.flag,
    followType: t.followType,
    group: t.groupName || '我新增的待办',
    dueDate: t.dueDate,
  }));
  return base.concat(dbItems);
}

export function openTodos(data: Snapshot): FlatTodo[] {
  return allTodos(data).filter((t) => !data.done[t.id]);
}

export function daysFromToday(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return null;
  const t = new Date(iso + 'T00:00:00');
  if (isNaN(t.getTime())) return null;
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t.getTime() - t0.getTime()) / 86400000);
}

export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 接下来要做：置顶 > 已过期 > 今天 > 未来 > 未定日期 */
export function nextUpTodos(data: Snapshot, n = 3): FlatTodo[] {
  const today = todayISO();
  const rank = (t: FlatTodo) => {
    if (t.flag) return 0;
    const due = todoDue(t);
    if (!due) return 4;
    if (due < today) return 1;
    if (due === today) return 2;
    return 3;
  };
  return openTodos(data)
    .slice()
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        String(todoDue(a) || '9999').localeCompare(String(todoDue(b) || '9999')),
    )
    .slice(0, n);
}

export function overdueCount(data: Snapshot): number {
  const today = todayISO();
  return openTodos(data).filter((t) => {
    const due = todoDue(t);
    return !!due && due < today;
  }).length;
}
