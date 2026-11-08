// 静态档案数据访问器：包装旧 assets/data.js 暴露的全局 ARCHIVE。
// 旧前端把 ARCHIVE 当全局读取；新版通过 <script src="/assets/data.js"> 载入后从 window 取。
// 这里给出最小强类型，供首页待办、健康主题、我的资料等复刻使用。

export interface ArchiveTodoItem {
  id: string;
  text: string;
  meta: string;
  flag?: boolean;
  followType: string;
}
export interface ArchiveTodoGroup {
  group: string;
  items: ArchiveTodoItem[];
}
export interface ArchiveIssueEvidence {
  type: string;
  text: string;
}
export interface ArchiveIssueFile {
  name: string;
  href: string;
  meta: string;
}
export interface ArchiveTimelineItem {
  date: string;
  type: string;
  text: string;
  href?: string;
  src?: string;
}
export interface ArchiveIssue {
  id: string;
  name: string;
  status: string;
  lastDate: string;
  lastLabel: string;
  card: string;
  head: string;
  evidence: ArchiveIssueEvidence[];
  need: string;
  files: ArchiveIssueFile[];
  timeline: ArchiveTimelineItem[];
  labDerived?: string[];
}
export interface ArchiveProfileField {
  k: string;
  v: string;
  ok: boolean;
}
export interface ArchiveStatus {
  label: string;
  tone: string;
}
export interface Archive {
  updated: string;
  profile: {
    sex: string;
    age: string;
    birth: string;
    height: number;
    weight: number;
    weightNote: string;
    bmi: number;
    activity: string;
    limit: string;
    fields: ArchiveProfileField[];
  };
  weight: {
    start: number;
    startDate: string;
    target: number;
    stageTarget: string;
    kcal: string;
    rules: string[];
  };
  statuses: Record<string, ArchiveStatus>;
  issues: ArchiveIssue[];
  timeline: ArchiveTimelineItem[];
  meds: {
    current: { name: string; use: string; date: string; status: string; href?: string }[];
    history: { name: string; use: string; date: string; status: string }[];
    note: string;
  };
  todos: ArchiveTodoGroup[];
}

declare global {
  interface Window {
    ARCHIVE?: Archive;
  }
}

export const ARCHIVE: Archive =
  typeof window !== 'undefined' && window.ARCHIVE
    ? window.ARCHIVE
    : ({
        updated: '',
        profile: {
          sex: '',
          age: '',
          birth: '',
          height: 0,
          weight: 0,
          weightNote: '',
          bmi: 0,
          activity: '',
          limit: '',
          fields: [],
        },
        weight: { start: 0, startDate: '', target: 0, stageTarget: '', kcal: '', rules: [] },
        statuses: {},
        issues: [],
        timeline: [],
        meds: { current: [], history: [], note: '' },
        todos: [],
      } as Archive);
