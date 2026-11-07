import { useEffect, useState } from 'react';
import { VisitList } from './features/visits/VisitList';
import { VisitDetail } from './features/visits/VisitDetail';
import { VisitComposer } from './features/visits/VisitComposer';
import type { Visit } from './api/types';

// 极简路由：列表 / 详情 / 新建编辑，三态。正式接入时可换 react-router。
type Route =
  | { name: 'list' }
  | { name: 'detail'; id: string }
  | { name: 'compose'; edit?: Visit; from?: string };

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'list' });
  const [flashId, setFlashId] = useState<string | null>(null);

  // 保存成功后返回列表并高亮该条
  const goList = (id?: string) => {
    setFlashId(id ?? null);
    setRoute({ name: 'list' });
  };

  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 2500);
    return () => clearTimeout(t);
  }, [flashId]);

  return (
    <div className="app-shell" style={{ maxWidth: 880, margin: '0 auto', padding: 16 }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20 }}>个人健康档案 · 就诊</h1>
      </header>

      {route.name === 'list' && (
        <VisitList
          flashId={flashId}
          onOpen={(id) => setRoute({ name: 'detail', id })}
          onNew={() => setRoute({ name: 'compose' })}
        />
      )}

      {route.name === 'detail' && (
        <VisitDetail
          id={route.id}
          onBack={() => goList()}
          onEdit={(v) => setRoute({ name: 'compose', edit: v })}
        />
      )}

      {route.name === 'compose' && (
        <VisitComposer
          edit={route.edit}
          onCancel={() => goList()}
          onSaved={(id) => goList(id)}
        />
      )}
    </div>
  );
}
