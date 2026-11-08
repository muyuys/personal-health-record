import { useEffect, useState } from 'react';
import { HeadProvider, useHead } from './components/head';
import { Icon } from './components/icons';
import { Shell } from './components/Shell';
import { useRoute } from './store/useRoute';
import { useStore } from './store/useStore';
import { HomeView } from './features/home/HomeView';
import { VisitList } from './features/visits/VisitList';
import { VisitDetail } from './features/visits/VisitDetail';
import { VisitComposer } from './features/visits/VisitComposer';
import { StubView } from './features/common/StubView';
import { DailyView } from './features/daily/DailyView';
import type { Visit } from './api/types';

function Views() {
  const { route, go } = useRoute();
  const store = useStore();
  const [editing, setEditing] = useState<Visit | undefined>(undefined);

  const render = () => {
    switch (route.name) {
      case 'home':
        return <HomeView go={go} />;
      case 'records':
        return (
          <RecordsView
            onOpen={(id) => go('visit/' + id)}
            onNew={() => {
              setEditing(undefined);
              go('new-visit');
            }}
          />
        );
      case 'visit':
        return (
          <VisitDetail
            id={route.param!}
            onBack={() => go('records')}
            onEdit={(v) => {
              setEditing(v);
              go('new-visit');
            }}
          />
        );
      case 'new-visit':
        return (
          <VisitComposer
            edit={editing}
            onCancel={() => {
              setEditing(undefined);
              go('records');
            }}
            onSaved={() => {
              setEditing(undefined);
              go('records');
            }}
          />
        );
      case 'metrics':
        return <StubView title="指标趋势" sub="检验指标随时间的走向" note="批次 3 将实现：按指标分类的趋势图表与参考区间。" />;
      case 'daily':
        return <DailyView />;
      case 'themes':
        return <StubView title="健康主题" sub="按问题归拢的健康线索" note="批次 4 将实现：健康主题与待办提醒。" />;
      case 'assistant':
        return <StubView title="AI 问答" sub="基于你的记录提问" note="批次 6 将实现：接入本地模型的多轮问答。" />;
      case 'settings':
        return <StubView title="设置" sub="模型与偏好" note="批次 5/6 将实现：模型配置、导入导出。" />;
      case 'me':
        return <StubView title="我的" sub="档案与存储" note="批次 5 将实现：个人档案、病史、导入导出与存储。" />;
      default:
        return <HomeView go={go} />;
    }
  };

  // store 尚未就绪时（首页依赖全量），给出加载态
  if (route.name === 'home' && store.loading && !store.data) {
    return (
      <Shell route={route} go={go}>
        <p className="hint">加载中…</p>
      </Shell>
    );
  }

  return (
    <Shell route={route} go={go}>
      {render()}
    </Shell>
  );
}

// 就医记录列表包装：与 Shell 配合（列表自带 useVisits）
function RecordsView({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const { setHead } = useHead();
  useEffect(() => {
    setHead({
      title: '就医记录',
      sub: '同一次看病，资料、用药、安排都在一条里',
      actions: (
        <button className="btn btn-primary" type="button" onClick={onNew}>
          <Icon name="plus" />
          记一次就诊
        </button>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <VisitList flashId={null} onOpen={onOpen} onNew={onNew} />;
}

export function App() {
  return (
    <HeadProvider>
      <Views />
    </HeadProvider>
  );
}
