// 记录时间线事件流：逐条对齐旧前端 js/app.views.records.js 的
// recentStream / medicalStream / recordEvents / filterEvents / recordCounts
// 以及 app.derive.js 的 isAbnormal / labValueRaw、app.core.js 的 medStatusLabel。
//
// 本页只收「医学事件」：就诊 + 报告 + 无报告归属的检验 + 用药。
// 体重/体征/症状/睡眠属于「日常健康」，不进这条时间线。
import type { Snapshot, Visit, Report, Lab, Medication } from '../../api/types';

export type EventKind = 'visit' | 'report' | 'lab' | 'med';

export interface RecEvent {
  id: string;
  kind: EventKind;
  date: string;
  createdAt: number;
  chip: string;
  title: string;
  summary: string;
  meta: string;
  /** 点击行为：内部跳转用 href（含 #/）；或 act（更多操作） */
  href?: string;
  act?: string;
}

export const MED_STATUS: [string, string][] = [
  ['active', '在服'],
  ['stopped', '已停'],
  ['unknown', '待确认'],
];

export function medStatusLabel(s: string): string {
  const hit = MED_STATUS.find((m) => m[0] === s);
  return hit ? hit[1] : '';
}

export function isISODate(s: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
}

export function labValueRaw(r: Lab): number | string {
  if (r && r.value !== null && r.value !== undefined && Number.isFinite(r.value)) return r.value as number;
  return r ? r.qualitative || '' : '';
}

export function isAbnormal(r: Lab): boolean {
  if (!r) return false;
  if (r.flag === 'H' || r.flag === 'L') return true;
  if (typeof r.value !== 'number' || !Number.isFinite(r.value)) return false;
  return (
    (r.low !== null && r.low !== undefined && (r.value as number) < (r.low as number)) ||
    (r.high !== null && r.high !== undefined && (r.value as number) > (r.high as number))
  );
}

function visitCardTitle(v: Visit): string {
  const t = [v.department, v.hospital].filter(Boolean).join(' · ');
  return t || (v.visitType ? `${v.visitType}记录` : '就诊记录');
}

function visitCardMeta(v: Visit): string {
  return [v.hospital && v.department ? v.hospital : '', v.doctor ? `医生 ${v.doctor}` : '', '就诊记录']
    .filter(Boolean)
    .join('　·　');
}

/** 无报告归属的检验结果按日期聚合成一个事件 */
function orphanLabEvents(labs: Lab[]): RecEvent[] {
  const byDate = new Map<string, Lab[]>();
  labs
    .filter((r) => !r.reportId)
    .forEach((r) => {
      const k = r.date || '';
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k)!.push(r);
    });
  return Array.from(byDate.entries()).map(([date, rows]) => {
    const bad = rows.filter(isAbnormal).length;
    return {
      id: 'lab-' + date,
      kind: 'lab' as const,
      date,
      createdAt: 0,
      chip: '检验',
      title: rows.length > 1 ? `检验结果 ${rows.length} 项` : rows[0].name || '检验结果',
      summary:
        rows
          .slice(0, 3)
          .map((r) => `${r.name} ${labValueRaw(r)}${r.unit ? ' ' + r.unit : ''}`)
          .join('；') + (bad ? `　（${bad} 项超出参考区间）` : ''),
      meta: '检验结果 · 未关联报告',
      href: '#/labs-all',
    };
  });
}

/** 医学事件流（就诊/报告/检验/用药） */
export function medicalStream(data: Snapshot): RecEvent[] {
  const ev: RecEvent[] = [];

  data.visits.forEach((v) =>
    ev.push({
      id: v.id,
      kind: 'visit',
      date: v.date || '',
      createdAt: v.createdAt || 0,
      chip: v.visitType || '就诊',
      title: visitCardTitle(v),
      summary: String(v.summary || v.diagnosis || v.chief || '').trim(),
      meta: visitCardMeta(v),
      href: '#/visit/' + v.id,
    }),
  );

  const labCountOf = (reportId: string) => data.labs.filter((r) => r.reportId === reportId).length;
  data.reports.forEach((r: Report) => {
    const n = labCountOf(r.id);
    ev.push({
      id: r.id,
      kind: 'report',
      date: r.date || '',
      createdAt: r.createdAt || 0,
      chip: '报告',
      title: r.title || '未命名报告',
      summary: [r.hospital, r.panel, r.specimen].filter(Boolean).join(' · '),
      meta: '报告 · ' + (n ? `${n} 项结果` : r.file ? '有原件' : '未添加原件'),
      act: 'viewreport',
    });
  });

  orphanLabEvents(data.labs).forEach((e) => ev.push(e));

  data.medications.forEach((m: Medication) =>
    ev.push({
      id: m.id,
      kind: 'med',
      date: m.startDate || '',
      createdAt: m.createdAt || 0,
      chip: '用药',
      title: m.name || '用药',
      summary: [m.dose, m.frequency, m.route].filter(Boolean).join('　'),
      meta: `用药 · ${medStatusLabel(m.status) || '状态待确认'}`,
      act: 'med-edit',
    }),
  );

  return ev;
}

export type RecType = 'all' | 'visit' | 'report' | 'med';

export interface RecordsQuery {
  t: RecType;
  q: string;
  from: string;
  to: string;
  p: number;
}

export const REC_TYPES: [RecType, string][] = [
  ['all', '全部'],
  ['visit', '就诊'],
  ['report', '报告'],
  ['med', '用药'],
];

export function recordEvents(data: Snapshot, q: RecordsQuery): RecEvent[] {
  const all = medicalStream(data);
  const byType = (t: EventKind) => all.filter((e) => e.kind === t);
  if (q.t === 'visit') return byType('visit');
  if (q.t === 'report') return byType('report').concat(byType('lab'));
  if (q.t === 'med') return byType('med');
  return all;
}

export function filterEvents(list: RecEvent[], q: RecordsQuery): RecEvent[] {
  const kw = String(q.q || '').trim().toLowerCase();
  return list.filter((e) => {
    if (q.from && !(isISODate(e.date) && e.date >= q.from)) return false;
    if (q.to && !(isISODate(e.date) && e.date <= q.to)) return false;
    if (!kw) return true;
    return [e.title, e.summary, e.meta, e.chip].join(' ').toLowerCase().includes(kw);
  });
}

export interface RecordCounts {
  all: number;
  visit: number;
  report: number;
  med: number;
}

export function recordCounts(data: Snapshot, q: RecordsQuery): RecordCounts {
  const base: RecordCounts = { all: 0, visit: 0, report: 0, med: 0 };
  const scope = filterEvents(medicalStream(data), { ...q, t: 'all' });
  scope.forEach((e) => {
    base.all += 1;
    if (e.kind === 'visit') base.visit += 1;
    else if (e.kind === 'report' || e.kind === 'lab') base.report += 1;
    else if (e.kind === 'med') base.med += 1;
  });
  return base;
}

/** 有日期的按日期+创建倒序在前，无日期置顶 */
export function recentSorted(list: RecEvent[]): { dated: RecEvent[]; undated: RecEvent[] } {
  const dated = list.filter((e) => isISODate(e.date));
  const undated = list.filter((e) => !isISODate(e.date));
  dated.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  undated.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { dated, undated };
}

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

export interface DateParts {
  unknown: boolean;
  iso: string;
  year: string;
  md: string;
  wd: string;
}

export function dateParts(iso: string, todayISO: string): DateParts {
  const s = String(iso || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { unknown: true, iso: '', year: '', md: '', wd: '' };
  const dt = new Date(s + 'T00:00:00');
  const wd = Number.isNaN(dt.getTime()) ? '' : `周${WEEK_CN[dt.getDay()]}`;
  return {
    unknown: false,
    iso: s,
    year: s.slice(0, 4),
    md: s === todayISO ? '今天' : `${s.slice(5, 7)}-${s.slice(8, 10)}`,
    wd,
  };
}
