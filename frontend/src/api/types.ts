// 与后端 Pydantic 模型 / get_all() 列映射对齐的 TS 类型。

export interface Visit {
  id: string;
  date: string;          // YYYY-MM-DD
  visitType: string;
  department: string;
  hospital: string;
  doctor: string;
  chief: string;         // 主诉
  diagnosis: string;
  summary: string;
  note: string;
  reportId: string;      // 关联报告 id（可为空）
  createdAt: number;
  /** 乐观并发版本；null/undefined 表示旧数据（无版本） */
  revision?: number | null;
}

export interface Report {
  id: string;
  date: string;
  title: string;
  panel: string;
  specimen: string;
  hospital: string;
  note: string;
  file?: string;         // dataURL（迁移期）/ 后端换取 urls.file
  createdAt?: number;
}

export interface Lab {
  id: string;
  date: string;
  category: string;
  name: string;
  value: number | null;
  unit: string;
  low: number | null;
  high: number | null;
  qualitative: string;
  flag: string;
  source: string;
  note: string;
  reportId: string;
}

export interface Weight {
  id: string;
  date: string;
  kg: number | null;
  tag: string;
  waist: number | null;
  note: string;
  bodyFat: number | null;
  muscle: number | null;
  bmi: number | null;
  visceralFat: number | null;
  bmr: number | null;
  bone: number | null;
}

export interface BodyMeasure {
  id: string;
  date: string;
  chest: number | null;
  waist: number | null;
  hip: number | null;
  note: string;
  createdAt: number;
}

export interface Allergy {
  id: string;
  name: string;
  category: string;
  severity: string;
  reaction: string;
  note: string;
  createdAt: number;
}

export interface FamilyHistory {
  id: string;
  relation: string;
  condition: string;
  note: string;
  createdAt: number;
}

export interface Surgery {
  id: string;
  date: string;
  name: string;
  hospital: string;
  note: string;
  createdAt: number;
}

export interface Medication {
  id: string;
  name: string;
  dose: string;
  frequency: string;
  route: string;
  startDate: string;
  endDate: string;
  purpose: string;
  status: string;
  note: string;
  visitId: string;
  createdAt: number;
  infoDate: string;
  sourceRef: string;
  toVerify: string;
}

export interface Vital {
  id: string;
  date: string;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  temperature: number | null;
  spo2: number | null;
  glucose: number | null;
  glucoseTag: string;
  note: string;
  createdAt: number;
}

export interface Symptom {
  id: string;
  date: string;
  part: string;
  severity: string;
  trigger: string;
  note: string;
  createdAt: number;
}

export interface DietDay {
  id: string;
  date: string;
  morningWeight: number | null;
  weightNote: string;
  waist: number | null;
  sleep: string;
  hunger: string;
  ankle: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  snack: string;
  kcalCenter: number | null;
  kcalLow: number | null;
  kcalHigh: number | null;
  budget: string;
  completeness: string;
  summary: string;
  note: string;
  createdAt: number;
}

export interface DietWeek {
  id: string;
  weekStart: string;
  weekEnd: string;
  reviewDate: string;
  weightDays: number | null;
  weightAvg: number | null;
  weightPrevAvg: number | null;
  waist: number | null;
  completeDays: number | null;
  kcalCenter: number | null;
  kcalLow: number | null;
  kcalHigh: number | null;
  ankle: string;
  energy: string;
  observeMiss: string;
  observeHabit: string;
  observeDiff: string;
  nextFocus: string;
  adjust: string;
  note: string;
  createdAt: number;
}

export interface SleepLog {
  id: string;
  date: string;
  hours: number | null;
  minutes: number | null;
  score: number | null;
  bedtime: string;
  wake: string;
  note: string;
  source: string;
  createdAt: number;
}

export interface TodoItem {
  id: string;
  text: string;
  groupName: string;
  meta: string;
  flag: string;
  createdAt: number;
  dueDate: string;
  followType: string;
}

export interface IssueStatusEntry {
  status: string;
  note: string;
  updatedAt: number;
}

export interface ExportStatus {
  savedAt?: number | null;
  lastExportAt?: number | null;
  [k: string]: unknown;
}

/** GET /api/all 全量快照 */
export interface Snapshot {
  labs: Lab[];
  reports: Report[];
  weights: Weight[];
  profileOverrides: Record<string, string>;
  body: BodyMeasure[];
  done: Record<string, boolean>;
  savedAt: number | null;
  allergies: Allergy[];
  familyHistory: FamilyHistory[];
  surgeries: Surgery[];
  visits: Visit[];
  medications: Medication[];
  vitals: Vital[];
  symptoms: Symptom[];
  dietDays: DietDay[];
  dietWeeks: DietWeek[];
  sleepLogs: SleepLog[];
  issueStatus: Record<string, IssueStatusEntry>;
  todoItems: TodoItem[];
  export: ExportStatus;
}

export interface OriginalsItem {
  path: string;
  name: string;
  dir: string;
  size: number;
  mtime: number;
  ext: string;
}

/** 逐条写返回：写入后的最新 revision */
export interface WriteResult<T> {
  item: T;
  revision: number;
}

/** 409 冲突错误（携带服务端当前版本，便于 UI 提示刷新合并） */
export class ConflictError extends Error {
  current?: Visit;
  constructor(message: string, current?: Visit) {
    super(message);
    this.name = 'ConflictError';
    this.current = current;
  }
}
