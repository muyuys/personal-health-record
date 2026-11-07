// 统一 API 封装。
// 关键修复（对应 app.core.js:855 缺陷）：所有写操作都返回 Promise，
// 调用方必须 await 到真实结果，失败抛错——不再「发起即返回 true」。

import { ConflictError, type Visit, type WriteResult } from './types';

const BASE = ''; // 走 vite 代理同源；如需跨域可在 vite.config.ts 配 proxy

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    throw new ConflictError(body?.detail || '数据已被其他修改更新', body?.current);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`请求失败 ${res.status} ${res.statusText} ${text}`.trim());
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // 读取
  listVisits: () => request<Visit[]>('/api/visits'),
  getVisit: (id: string) => request<Visit>(`/api/visits/${encodeURIComponent(id)}`),

  // 逐条写（带 expected_revision 做乐观并发控制）
  createVisit: (v: Omit<Visit, 'id' | 'createdAt' | 'revision'>) =>
    request<WriteResult<Visit>>('/api/visits', {
      method: 'POST',
      body: JSON.stringify(v),
    }),

  updateVisit: (v: Visit) =>
    request<WriteResult<Visit>>(`/api/visits/${encodeURIComponent(v.id)}`, {
      method: 'PUT',
      body: JSON.stringify({ ...v, expected_revision: v.revision ?? 0 }),
    }),

  deleteVisit: (id: string, expectedRevision: number) =>
    request<void>(
      `/api/visits/${encodeURIComponent(id)}?expected_revision=${expectedRevision}`,
      { method: 'DELETE' },
    ),
};
