// 检验指标标准化聚合：把 labs 按「标准指标(analyteId)」归组，用基准单位对齐趋势。
// 与旧 assets/metrics.js 的 HM.collect 不同点：
//   - 同一 analyteId 的不同单位/不同方法记录合并为一条序列，画 valueStd（基准单位）曲线；
//   - 未映射(stdStatus=unmapped)或定性(qualitative) 的项，回退到旧的 name+unit 分组，保持不丢数据；
// 输出结构兼容 WindowMetricGroup，方便 LabsView / MetricsView 最小改动接入。
import type { Lab, Report } from '../../api/types';
import type { WindowMetricGroup, WindowMetricsRecord } from '../../lib/globals.d';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown) => String(v ?? '').trim();
const dateOK = (v: unknown) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) &&
  !Number.isNaN(Date.parse(String(v) + 'T00:00:00Z')) &&
  new Date(String(v) + 'T00:00:00Z').toISOString().slice(0, 10) === v;

interface StdRecord extends WindowMetricsRecord {
  /** 原始值/单位/方法，供明细展示 */
  rawValue?: number | null;
  rawUnit?: string;
  rawLow?: number | null;
  rawHigh?: number | null;
  method?: string;
  analyteId?: string;
  /** 该记录是否经过单位换算（raw单位 ≠ 基准单位） */
  converted?: boolean;
  /** 该记录是否单位无法换算（不计入曲线，仅明细） */
  unconverted?: boolean;
}

export interface StdGroup extends WindowMetricGroup {
  records: StdRecord[];
  /** 是否含多种原始单位（提示已对齐到基准单位） */
  mixedUnits?: boolean;
  /** 是否含多种测定方法（提示方法差异） */
  methods?: string[];
  /** 由几个原始 name+unit 合并而来 */
  sourceNames?: string[];
}

/**
 * 按标准指标聚合 labs。
 * @param labs  后端 /api/all 返回、已带派生字段的 labs
 * @param reports 用于取 specimen 等
 */
export function collectLabsStd(labs: Lab[], reports: Report[] = []): StdGroup[] {
  const reportMap = new Map(reports.map((r) => [r.id, r]));
  const groups = new Map<string, StdGroup>();

  function ensure(key: string, def: Partial<StdGroup>): StdGroup {
    let g = groups.get(key);
    if (!g) {
      g = { key, kind: 'labs', label: '', unit: '', category: '', detail: '', records: [], ...def } as StdGroup;
      groups.set(key, g);
    }
    return g;
  }

  for (const lab of labs) {
    if (!dateOK(lab.date) || !text(lab.name)) continue;
    const report = lab.reportId ? reportMap.get(lab.reportId) : undefined;
    const specimen = text(report?.specimen) || '样本未记录';
    const method = text(lab.method);
    const stdId = text(lab.analyteId);
    const stdStatus = text(lab.stdStatus);

    // 能否画标准曲线：命中指标且换算成功
    const canStd: boolean = !!(stdId && stdStatus === 'ok' && finite(lab.valueStd));
    // 定性：有 qualitative 无数值
    const isQual = !!text(lab.qualitative) && !finite(lab.value);

    let key: string;
    let def: Partial<StdGroup>;
    if (canStd) {
      key = `std:${stdId}`;
      def = {
        label: text(lab.stdName) || text(lab.name),
        unit: text(lab.baseUnit),
        category: text(lab.stdCategory) || text(lab.category) || '检验',
        detail: specimen,
      };
    } else {
      // 回退：未映射 / 单位无法换算 / 定性 → 按 name+unit 分组，不混线
      key = `raw:${text(lab.category)}|${text(lab.name)}|${text(lab.unit)}`;
      def = {
        label: text(lab.name),
        unit: text(lab.unit),
        category: text(lab.category) || '检验',
        detail: specimen,
      };
    }

    const g = ensure(key, def);
    const valueForLine = canStd ? (lab.valueStd as number) : finite(lab.value) ? lab.value : null;
    if (valueForLine === null && !isQual) continue; // 既无数值又非定性，跳过

    const rec: StdRecord = {
      id: lab.id,
      date: lab.date,
      value: valueForLine,
      low: canStd ? (finite(lab.effLowStd) ? lab.effLowStd : null) : finite(lab.low) ? lab.low : null,
      high: canStd ? (finite(lab.effHighStd) ? lab.effHighStd : null) : finite(lab.high) ? lab.high : null,
      note: lab.note || '',
      createdAt: 0,
      qualitative: lab.qualitative || '',
      flag: lab.flag || '',
      reportId: lab.reportId || '',
      source:
        [report?.title, report?.hospital || lab.source].filter(Boolean).join(' · ') ||
        '手动录入 / 未关联报告',
      order: g.records.length,
      rawValue: lab.value ?? null,
      rawUnit: text(lab.unit),
      rawLow: finite(lab.low) ? lab.low : null,
      rawHigh: finite(lab.high) ? lab.high : null,
      method,
      analyteId: stdId,
      converted: canStd && text(lab.unit) !== text(lab.baseUnit),
      unconverted: !!stdId && stdStatus === 'unit_unconverted',
    };
    g.records.push(rec);

    // 维护 group 级提示
    if (canStd) {
      if (!g.sourceNames) g.sourceNames = [];
      if (!g.sourceNames.includes(text(lab.name))) g.sourceNames.push(text(lab.name));
      const rawUnits = new Set(g.records.map((r) => r.rawUnit).filter(Boolean));
      g.mixedUnits = rawUnits.size > 1;
      if (method) {
        if (!g.methods) g.methods = [];
        if (!g.methods.includes(method)) g.methods.push(method);
      }
    }
  }

  return [...groups.values()]
    .map((g) => {
      g.records.sort((a, b) => a.date.localeCompare(b.date) || (a.order ?? 0) - (b.order ?? 0));
      return g;
    })
    .sort((a, b) => b.records.length - a.records.length || a.label.localeCompare(b.label, 'zh'));
}

/** 汇总某组里出现的原始单位（给提示文本用） */
export function rawUnitSummary(g: StdGroup): string {
  const units = new Set(g.records.map((r) => r.rawUnit).filter(Boolean));
  return [...units].join('、');
}
