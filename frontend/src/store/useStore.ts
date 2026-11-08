// 全量数据 store：一次拉 /api/all，视图按需读取，写后 reload。
// 这套思路对应旧前端的共享全局（labs/state/...）+ loadAll/savedAt，但用 React
// 状态与显式 reload 取代了全局可变变量，避免「发起写入就 return true」的旧缺陷。

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { Snapshot } from '../api/types';

export interface Store {
  data: Snapshot | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<Snapshot | null>;
  /** 用一个局部更新函数改快照（本地先行），再触发 reload 到真实数据 */
  setData: (updater: (prev: Snapshot) => Snapshot) => void;
}

export function useStore(): Store {
  const [data, setDataState] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const firstLoad = useRef(true);

  const reload = useCallback(async () => {
    if (firstLoad.current) setLoading(true);
    try {
      const snap = await api.getAll();
      setDataState(snap);
      setError(null);
      return snap;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setData = useCallback((updater: (prev: Snapshot) => Snapshot) => {
    setDataState((prev) => (prev ? updater(prev) : prev));
  }, []);

  return { data, loading, error, reload, setData };
}
