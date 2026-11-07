// 与后端 Pydantic 模型 / OpenAPI 对齐的 TS 类型。
// 首轮只覆盖「就诊闭环」所需对象；其余按需增量补充。

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
