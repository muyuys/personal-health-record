import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Visit } from '../../api/types';

// 就诊域数据 hook：替代全局 `let visits`。所有写操作 await 到真实结果。
export function useVisits() {
  const [items, setItems] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listVisits();
      // 按日期倒序（新在前）
      list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, loading, error, reload };
}
