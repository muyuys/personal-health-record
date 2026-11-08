import { useState } from 'react';
import { HeadProvider } from './components/head';
import { ModalProvider } from './components/Modal';
import { Shell } from './components/Shell';
import { useRoute } from './store/useRoute';
import { useStore } from './store/useStore';
import { HomeView } from './features/home/HomeView';
import { RecordsView } from './features/records/RecordsView';
import { VisitDetail } from './features/visits/VisitDetail';
import { VisitComposer } from './features/visits/VisitComposer';
import { DailyView } from './features/daily/DailyView';
import { MetricsView } from './features/metrics/MetricsView';
import { LabsAllView } from './features/metrics/LabsAllView';
import { LabsView } from './features/metrics/LabsView';
import { ThemesView } from './features/themes/ThemesView';
import { TodosView } from './features/todos/TodosView';
import { SummaryView } from './features/summary/SummaryView';
import { MeView } from './features/me/MeView';
import { SettingsView } from './features/settings/SettingsView';
import { AssistantView } from './features/assistant/AssistantView';
import { MembersView } from './features/members/MembersView';
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
            go={go}
            onOpenVisit={(id) => go('visit/' + id)}
            onNewVisit={() => {
              setEditing(undefined);
              go('new-visit');
            }}
          />
        );
      case 'visit':
        return (
          <VisitDetail
            id={route.param!}
            go={go}
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
            onSaved={(id) => {
              setEditing(undefined);
              go('visit/' + id);
            }}
          />
        );
      case 'metrics':
        return <MetricsView go={go} />;
      case 'labs':
        return <LabsView go={go} />;
      case 'labs-all':
        return <LabsAllView go={go} />;
      case 'daily':
        return <DailyView />;
      case 'themes':
        return <ThemesView go={go} />;
      case 'theme':
        return <ThemesView go={go} initialId={route.param || route.query.id} />;
      case 'todos':
        return <TodosView go={go} />;
      case 'summary':
        return <SummaryView go={go} presetVisit={route.query.visit} />;
      case 'meds':
      case 'reports':
      case 'new-report':
        return (
          <RecordsView
            go={go}
            onOpenVisit={(id) => go('visit/' + id)}
            onNewVisit={() => {
              setEditing(undefined);
              go('new-visit');
            }}
          />
        );
      case 'assistant':
        return <AssistantView go={go} />;
      case 'settings':
        return <SettingsView go={go} />;
      case 'members':
        return <MembersView go={go} />;
      case 'about':
        // 老版「关于」只是设置里的一个 section，这里直接落到设置的关于面板
        return <SettingsView go={go} initialSection="about" />;
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

export function App() {
  return (
    <HeadProvider>
      <ModalProvider>
        <Views />
      </ModalProvider>
    </HeadProvider>
  );
}
