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

// 品牌图标（深绿方块 + 心电线条），对齐原 index.html .brand-mark
const BrandMark = () => (
  <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <rect width="32" height="32" rx="9" fill="#173F33" />
    <path
      d="M7 18h4l2.6-6.5 3 11.5 2.6-5H25"
      stroke="#EDE7DA"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// 就诊分组导航项图标
const RecordsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="M4 6a2 2 0 0 1 2-2h9l3 3v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <path d="M14 4v4h4M8 13h8M8 17h5" strokeLinecap="round" />
  </svg>
);

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

  // 页头随路由变化（对应原 setHead）
  const head =
    route.name === 'compose'
      ? { eyebrow: '', title: route.edit ? '编辑就诊' : '记一次就诊', sub: '' }
      : route.name === 'detail'
        ? { eyebrow: '', title: '就诊详情', sub: '' }
        : { eyebrow: '', title: '就医记录', sub: '同一次看病，资料、用药、安排都在一条里' };

  return (
    <div className="app">
      <aside className="rail">
        <div className="rail-header">
          <a className="brand" href="#/records" aria-label="回到就医记录" onClick={(e) => { e.preventDefault(); goList(); }}>
            <BrandMark />
            <span className="brand-t">
              <b>健康档案</b>
            </span>
          </a>
        </div>

        <nav className="nav" aria-label="主导航">
          <button
            className="nav-item active"
            type="button"
            onClick={() => goList()}
          >
            <RecordsIcon />
            <span>就医记录</span>
          </button>
        </nav>
      </aside>

      <main className="main">
        <header className="page-head">
          <div className="page-head-l">
            {head.eyebrow && <p className="eyebrow">{head.eyebrow}</p>}
            <h1>{head.title}</h1>
            {head.sub && <p className="page-sub">{head.sub}</p>}
          </div>
        </header>

        <div className="view">
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

        <p className="disclaimer">
          数据用于个人整理，参考范围与异常提示不能替代医生解读。空白代表未记录，不等于没有症状或数值为 0。
        </p>
      </main>
    </div>
  );
}
