// 极简 hash 路由：对齐旧前端 #/view 与 #/view/sub 的用法。
// 支持 #/home、#/records、#/visit/:id、#/new-visit、#/daily、#/labs/:id 等。
import { useCallback, useEffect, useState } from 'react';

export interface Route {
  /** 一级视图名（home/records/metrics/daily/themes/assistant/settings/me ...） */
  name: string;
  /** 二级参数（如就诊 id、报告 id、daily 分段 vitals 等） */
  param?: string;
  raw: string;
}

function parseHash(): Route {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  const name = parts[0] || 'home';
  return { name, param: parts[1], raw: h };
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((to: string) => {
    if (location.hash === '#/' + to) {
      setRoute(parseHash());
    } else {
      location.hash = '#/' + to;
    }
  }, []);

  return { route, go };
}
