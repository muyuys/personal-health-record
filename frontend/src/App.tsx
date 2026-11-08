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
import { DailyView } from './features/daily/DailyView';
import { MetricsView } from './features/metrics/MetricsView';
import { LabsAllView } from './features/metrics/LabsAllView';
import { MedsView } from './features/meds/MedsView';
import { ReportsView } from './features/reports/ReportsView';
import { ThemesView } from './features/themes/ThemesView';
import { MeView } from './features/me/MeView';
import { SettingsView } from './features/settings/SettingsView';
import { AssistantView } from './features/assistant/AssistantView';
import { MembersView } from './features/members/MembersView';
import { AboutView } from './features/about/AboutView';
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
        return <MetricsView go={go} />;
      case 'labs-all':
        return <LabsAllView go={go} />;
      case 'daily':
        return <DailyView />;
      case 'themes':
        return <ThemesView go={go} />;
      case 'meds':
        return <MedsView go={go} />;
      case 'reports':
      case 'new-report':
        return <ReportsView go={go} />;
      case 'assistant':
        return <AssistantView go={go} />;
      case 'settings':
        return <SettingsView go={go} />;
      case 'members':
        return <MembersView go={go} />;
      case 'about':
        return <AboutView go={go} />;
      case 'me':
        return <MeView go={go} />;
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
