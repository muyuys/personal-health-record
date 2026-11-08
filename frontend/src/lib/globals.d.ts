// 全局脚本注入的类型声明（来自 frontend/public/assets/*.js，在 index.html 里以 <script> 引入）
export interface WindowMetricsRecord {
  id: string;
  date: string;
  value: number | null;
  low: number | null;
  high: number | null;
  note: string;
  createdAt: number;
  qualitative?: string;
  flag?: string;
  reportId?: string;
  source?: string;
  order?: number;
  [k: string]: unknown;
}

export interface WindowMetricGroup {
  key: string;
  kind: string;
  label: string;
  unit: string;
  category: string;
  detail: string;
  records: WindowMetricsRecord[];
}

export interface HealthMetricsGlobal {
  collect(data: Record<string, unknown>): WindowMetricGroup[];
  labKey(row: Record<string, unknown>, report?: Record<string, unknown>): string;
  filter(records: WindowMetricsRecord[], from?: string, to?: string): WindowMetricsRecord[];
  summary(records: WindowMetricsRecord[]): {
    latest: WindowMetricsRecord | null;
    count: number;
    days: number;
    numeric: WindowMetricsRecord[];
    min: number | null;
    max: number | null;
    previous: WindowMetricsRecord | null;
    delta: number | null;
    sharedRange: { low: number; high: number } | null;
    variedRange: boolean;
  };
  finite(v: unknown): boolean;
  dateOK(v: unknown): boolean;
}

declare global {
  interface Window {
    HealthMetrics: HealthMetricsGlobal;
    echarts: any;
  }
}

export {};
