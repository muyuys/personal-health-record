// 首页：复刻旧前端 renderHome（js/app.views.records.js:325）。
// 结构：危急过敏横幅 → 三张快捷卡 → 接下来要做（todo 行）→ 最近记录（RecCard 紧凑）。
import { useEffect } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { RecCard } from '../records/RecCard';
import { homeRecent, type RecEvent } from '../records/recordsEvents';
import { TodoRow } from '../common/TodoRow';
import { nextUpTodos, openTodos, overdueCount } from '../../lib/todos';
import { api } from '../../api/client';
import type { Allergy } from '../../api/types';

export function HomeView({ go }: { go: (to: string) => void }) {
  const { setHead } = useHead();
  const { data, loading, error, reload, setData } = useStore();

  const lastDate = data
    ? [
        data.visits,
        data.labs,
        data.vitals,
        data.symptoms,
        data.sleepLogs,
        data.weights,
      ]
        .flat()
        .map((x: any) => x?.date)
        .filter(Boolean)
        .sort()
        .pop()
    : null;

  useEffect(() => {
    setHead({
      eyebrow: '',
      title: '健康档案',
      sub: lastDate ? `最近更新 ${lastDate}　·　数据存在本机，随时可以补` : '从第一次记录开始',
      actions: (
        <>
          <button className="icon-btn" type="button" aria-label="搜索档案" onClick={() => go('records')}>
            <Icon name="search" />
          </button>
          <button className="btn btn-primary" type="button" onClick={() => go('new-visit')}>
            <Icon name="plus" />
            记一笔
          </button>
        </>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDate]);

  if (loading && !data) return <p className="hint">加载中…</p>;
  if (error && !data)
    return (
      <div className="notice notice--danger" role="alert">
        <span>加载失败：{error}</span>
        <button className="btn-plain" type="button" onClick={() => void reload()}>
          重试
        </button>
      </div>
    );
  if (!data) return null;

  const critical: Allergy[] = data.allergies.filter((a) => a.severity === 'critical');
  const tasks = nextUpTodos(data, 5);
  const recent = homeRecent(data, 3);
  const openCount = openTodos(data).length;
  const overdue = overdueCount(data);

  const toggleTodo = async (id: string) => {
    const done = { ...data.done, [id]: !data.done[id] };
    setData((prev) => ({ ...prev, done }));
    try {
      await api.putState({ done });
    } catch {
      void reload();
    }
  };

  const openEvent = (ev: RecEvent) => {
    if (ev.href) {
      const target = ev.href.replace(/^#\//, '');
      go(target);
    }
  };

  return (
    <div className="stack home-layout">
      {critical.length > 0 && (
        <section className="allergy-alert">
          <Icon name="info" />
          <div>
            <b>危急过敏 · 就诊、用药前请告知医生</b>
            <p>
              {critical
                .map(
                  (a) =>
                    `${a.name}（${a.category || '未分类'}${a.reaction ? '：' + a.reaction : ''}）`,
                )
                .join('；')}
            </p>
            <button className="band-link" type="button" onClick={() => go('me')}>
              查看过敏信息 →
            </button>
          </div>
        </section>
      )}

      <section className="grid-quick home-shortcuts" aria-label="快捷记录">
        <button className="quick-card quick-card--accent" type="button" onClick={() => go('new-visit')}>
          <span className="qc-icon"><Icon name="plus" /></span>
          <span className="qc-body">
            <span className="qc-title">记一次就诊</span>
            <span className="qc-desc">日期 + 一段记录</span>
          </span>
        </button>
        <button className="quick-card" type="button" onClick={() => go('new-report')}>
          <span className="qc-icon"><Icon name="file" /></span>
          <span className="qc-body">
            <span className="qc-title">存一份报告</span>
            <span className="qc-desc">先保存原件</span>
          </span>
        </button>
        <button className="quick-card" type="button" onClick={() => go('daily')}>
          <span className="qc-icon"><Icon name="pulse" /></span>
          <span className="qc-body">
            <span className="qc-title">记日常数据</span>
            <span className="qc-desc">体重、血压、症状、睡眠</span>
          </span>
        </button>
      </section>

      {tasks.length > 0 && (
        <section className="home-next">
          <div className="section-head" style={{ marginTop: 0 }}>
            <h2>接下来要做</h2>
            <button className="btn-plain" type="button" onClick={() => go('themes')}>
              全部 {openCount} 项
              {overdue > 0 && <span className="rdot" role="img" aria-label={`其中 ${overdue} 项已过期`} />}
              {' →'}
            </button>
          </div>
          <div className="card" style={{ padding: 'var(--sp-2) var(--sp-4)' }}>
            {tasks.map((t) => (
              <TodoRow key={t.id} todo={t} done={!!data.done[t.id]} onToggle={toggleTodo} />
            ))}
          </div>
        </section>
      )}

      <section className="home-recent">
        <div className="section-head" style={{ marginTop: 0 }}>
          <h2>最近记录</h2>
          <button className="btn-plain" type="button" onClick={() => go('records')}>
            查看全部 →
          </button>
        </div>
        {recent.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {recent.map((e) => (
              <RecCard key={e.kind + ':' + (e.id || e.date + e.title)} ev={e} onOpen={openEvent} compact />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="es-icon"><Icon name="file" /></div>
            <p className="es-title">还没有记录</p>
            <p className="es-desc">看完门诊记一句就够了，报告可以先存原件，其余以后可以补。</p>
            <div className="es-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" type="button" onClick={() => go('new-visit')}>
                <Icon name="plus" />
                记一次就诊
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
