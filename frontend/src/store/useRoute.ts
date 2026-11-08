// 极简 hash 路由：对齐旧前端 #/view 与 #/view/sub 的用法。
// 支持 #/home、#/records、#/visit/:id、#/new-visit、#/daily、#/labs/:id 等。
import { useCallback, useEffect, useState } from 'react';

export interface Route {
  /** 一级视图名（home/records/metrics/daily/themes/assistant/settings/me ...） */
  name: string;
  /** 二级参数（如就诊 id、报告 id、daily 分段 vitals 等） */
  param?: string;
  /** ?query 参数（如 seg=body、tab=diet、section=about、id=xxx、visit=xxx） */
  query: Record<string, string>;
  raw: string;
}

function parseHash(): Route {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '');
  const qi = h.indexOf('?');
  const pathPart = qi >= 0 ? h.slice(0, qi) : h;
  const queryPart = qi >= 0 ? h.slice(qi + 1) : '';
  const parts = pathPart.split('/').filter(Boolean);
  const name = parts[0] || 'home';
  const query: Record<string, string> = {};
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const k = eq >= 0 ? pair.slice(0, eq) : pair;
      const v = eq >= 0 ? pair.slice(eq + 1) : '';
      try { query[decodeURIComponent(k)] = decodeURIComponent(v); }
      catch { query[k] = v; }
    }
  }
  return { name, param: parts[1], query, raw: h };
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((to: string) => {
    const target = '#/' + to;
    if (location.hash === target) {
      setRoute(parseHash());
    } else {
      location.hash = target;
    }
  }, []);

  return { route, go };
}
