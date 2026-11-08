// 就医记录页：完整复刻旧前端 renderRecords（js/app.views.records.js:555）。
// 统一的时间线：就诊 + 报告 + 无报告归属的检验 + 用药；
// 顶部 全部/就诊/报告/用药 分段筛选（带计数）+ 搜索/日期筛选面板；
// 结果按年份分组、每页 20 条；页头四按钮（指标趋势 / 搜索 / 存一份报告 / 记一次就诊）。
import { useEffect, useMemo, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { getActiveProfile } from '../../api/profile';
import { api } from '../../api/client';
import { RecCard } from './RecCard';
import {
  REC_TYPES,
  filterEvents,
  recordCounts,
  recordEvents,
  recentSorted,
  isISODate,
  type RecEvent,
  type RecType,
  type RecordsQuery,
} from './recordsEvents';

const REC_PAGE_SIZE = 20;

interface Props {
  go: (to: string) => void;
  onOpenVisit: (id: string) => void;
  onNewVisit: () => void;
  onNewReport: () => void;
  flash?: { kind: string; id: string } | null;
}

export function RecordsView({ go, onOpenVisit, onNewVisit, onNewReport, flash }: Props) {
  const { setHead } = useHead();
  const { data, loading, error, reload } = useStore();

  const [q, setQ] = useState<RecordsQuery>({ t: 'all', q: '', from: '', to: '', p: 1 });
  const [panelOpen, setPanelOpen] = useState(false);
  const [memberName, setMemberName] = useState('我的档案');

  useEffect(() => {
    let alive = true;
    const pid = getActiveProfile();
    api.ai
      .profiles()
      .then((res) => {
        if (!alive) return;
        const m = (res.profiles as any[]).find((x) => x.id === pid);
        setMemberName(m?.name || (pid === 'default' ? '我的档案' : '成员档案'));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const counts = useMemo(
    () => (data ? recordCounts(data, q) : { all: 0, visit: 0, report: 0, med: 0 }),
    [data, q],
  );
  const filtered = !!(q.q || q.from || q.to);
  const panelShown = panelOpen || filtered;

  useEffect(() => {
    setHead({
      eyebrow: `当前档案 · ${memberName}`,
      title: '就医记录',
      sub: '同一次看病，资料、用药、安排都在一条里',
      actions: (
        <>
          <button className="btn btn-ghost" type="button" onClick={() => go('metrics')}>
            <Icon name="trend" />
            指标趋势
          </button>
          <button
            className="icon-btn"
            type="button"
            aria-label="搜索档案"
            onClick={() => go('records')}
          >
            <Icon name="search" />
          </button>
          <button className="btn btn-secondary" type="button" onClick={onNewReport}>
            <Icon name="file" />
            存一份报告
          </button>
          <button className="btn btn-primary" type="button" onClick={onNewVisit}>
            <Icon name="plus" />
            记一次就诊
          </button>
        </>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberName]);

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

  const list = filterEvents(recordEvents(data, q), q);
  const { dated, undated } = recentSorted(list);
  const ordered = undated.concat(dated);
  const pages = Math.max(1, Math.ceil(list.length / REC_PAGE_SIZE));
  const page = Math.min(q.p, pages);
  const rows = ordered.slice((page - 1) * REC_PAGE_SIZE, page * REC_PAGE_SIZE);

  // 年分组：日期未确认独立一组，排在所有年份之前
  const groups: { key: string; items: RecEvent[] }[] = [];
  let cur: { key: string; items: RecEvent[] } | null = null;
  rows.forEach((e) => {
    const key = isISODate(e.date) ? e.date.slice(0, 4) + ' 年' : '日期未确认';
    if (!cur || cur.key !== key) {
      cur = { key, items: [] };
      groups.push(cur);
    }
    cur.items.push(e);
  });

  const tierCount =
    q.t === 'visit'
      ? counts.visit
      : q.t === 'report'
      ? counts.report
      : q.t === 'med'
      ? counts.med
      : counts.all;
  const summaryText = q.q || q.from || q.to || q.t !== 'all' ? `已筛选 · 共 ${tierCount} 条` : '';

  const openEvent = (ev: RecEvent) => {
    if (ev.kind === 'visit') onOpenVisit(ev.id);
    else if (ev.kind === 'med') go('meds');
    else if (ev.kind === 'report') go('reports');
    else if (ev.kind === 'lab') go('labs-all');
  };

  const switchType = (t: RecType) => setQ((s) => ({ ...s, t, p: 1 }));

  const isEmpty = list.length === 0;
  const countsAny = counts.all > 0;

  return (
    <div className="stack">
      <div className="seg-row">
        <div
          className="seg seg--fill"
          role="tablist"
          aria-label="按类型筛选"
          style={{ gridTemplateColumns: `repeat(${REC_TYPES.length},minmax(0,1fr))` }}
        >
          {REC_TYPES.map(([v, label]) => (
            <button
              key={v}
              className={'seg-btn' + (q.t === v ? ' is-on' : '')}
              type="button"
              role="tab"
              aria-selected={q.t === v}
              onClick={() => switchType(v)}
            >
              {label}
              <span className="seg-n">{counts[v]}</span>
            </button>
          ))}
        </div>
        <div className="seg-tools">
          <button
            className="icon-btn"
            type="button"
            aria-label="搜索与日期筛选"
            aria-expanded={panelShown}
            onClick={() => setPanelOpen((v) => !v)}
          >
            <Icon name="search" />
          </button>
        </div>
      </div>

      <div id="recFilterPanel" hidden={!panelShown}>
        <div className="card" style={{ padding: 'var(--sp-4)' }}>
          <div className="form-grid record-filter-fields">
            <div className="field">
              <label htmlFor="recQ">搜索</label>
              <input
                id="recQ"
                type="search"
                value={q.q}
                placeholder="医院、诊断、药名、报告名"
                autoComplete="off"
                onChange={(e) => setQ((s) => ({ ...s, q: e.target.value, p: 1 }))}
              />
            </div>
            <div className="field">
              <label htmlFor="recFrom">从</label>
              <input
                id="recFrom"
                type="date"
                value={q.from}
                onChange={(e) => setQ((s) => ({ ...s, from: e.target.value, p: 1 }))}
              />
            </div>
            <div className="field">
              <label htmlFor="recTo">至</label>
              <input
                id="recTo"
                type="date"
                value={q.to}
                onChange={(e) => setQ((s) => ({ ...s, to: e.target.value, p: 1 }))}
              />
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: 'var(--sp-3)' }}>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setQ((s) => ({ ...s, q: '', from: '', to: '', p: 1 }))}
            >
              清空筛选
            </button>
          </div>
        </div>
      </div>

      <p className="hint" id="recSummary">
        {summaryText}
      </p>

      <div id="recList">
        {isEmpty ? (
          <RecordsEmpty q={q} countsAny={countsAny} filtered={filtered} onNewVisit={onNewVisit} onNewReport={onNewReport} onClear={() => setQ((s) => ({ ...s, q: '', from: '', to: '', p: 1 }))} go={go} />
        ) : (
          <div
            className="rec-group-wrap"
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}
          >
            {groups.map((g) => (
              <section className="rec-group" key={g.key}>
                <div className="rec-group-head">
                  <h2>{g.key}</h2>
                  <span>{g.items.length} 条</span>
                </div>
                {g.items.map((e) => (
                  <RecCard
                    key={e.kind + ':' + (e.id || e.date + e.title)}
                    ev={e}
                    onOpen={openEvent}
                    onMore={() => openEvent(e)}
                    flash={!!(flash && flash.kind === e.kind && flash.id === e.id)}
                  />
                ))}
              </section>
            ))}
          </div>
        )}
      </div>

      {pages > 1 ? (
        <div className="pager" style={{ marginTop: 'var(--sp-6)' }}>
          <span className="pager-info">
            第 {page} / {pages} 页
          </span>
          <span className="pager-ctl">
            <button
              className={'pager-btn' + (page <= 1 ? ' is-dis' : '')}
              type="button"
              disabled={page <= 1}
              onClick={() => setQ((s) => ({ ...s, p: page - 1 }))}
            >
              上一页
            </button>
            <button
              className={'pager-btn' + (page >= pages ? ' is-dis' : '')}
              type="button"
              disabled={page >= pages}
              onClick={() => setQ((s) => ({ ...s, p: page + 1 }))}
            >
              下一页
            </button>
          </span>
        </div>
      ) : null}

      <p className="hint">
        检验指标趋势在 <a href="#/themes">健康主题 → 检验指标</a>；这里只看「什么时候发生了什么」。
      </p>
    </div>
  );
}

function RecordsEmpty({
  q,
  countsAny,
  filtered,
  onNewVisit,
  onNewReport,
  onClear,
  go,
}: {
  q: RecordsQuery;
  countsAny: boolean;
  filtered: boolean;
  onNewVisit: () => void;
  onNewReport: () => void;
  onClear: () => void;
  go: (to: string) => void;
}) {
  if (countsAny && filtered) {
    return (
      <div className="empty-state">
        <div className="es-icon"><Icon name="search" /></div>
        <p className="es-title">当前筛选下没有记录</p>
        <p className="es-desc">换个关键词，或者把日期范围放宽一点。</p>
        <div className="es-actions" style={{ justifyContent: 'center' }}>
          <button className="btn btn-secondary" type="button" onClick={onClear}>
            清空筛选
          </button>
        </div>
      </div>
    );
  }
  if (q.t === 'visit') {
    return (
      <div className="empty-state">
        <div className="es-icon"><Icon name="file" /></div>
        <p className="es-title">还没记过就诊</p>
        <p className="es-desc">一次门诊只需要日期和一句记录，其余以后可以补。</p>
        <div className="es-actions" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" type="button" onClick={onNewVisit}>
            <Icon name="plus" />
            记一次就诊
          </button>
        </div>
      </div>
    );
  }
  if (q.t === 'report') {
    return (
      <div className="empty-state">
        <div className="es-icon"><Icon name="file" /></div>
        <p className="es-title">还没存过报告</p>
        <p className="es-desc">拍一张化验单就能先存下原件，名称和日期之后再补。</p>
        <div className="es-actions" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" type="button" onClick={onNewReport}>
            <Icon name="plus" />
            存一份报告
          </button>
        </div>
      </div>
    );
  }
  if (q.t === 'med') {
    return (
      <div className="empty-state">
        <div className="es-icon"><Icon name="pill" /></div>
        <p className="es-title">还没记过用药</p>
        <p className="es-desc">药名和当前状态就能先存一条，剂量和频次可以以后补。</p>
        <div className="es-actions" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" type="button" onClick={() => go('meds')}>
            <Icon name="plus" />
            记一次用药
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="empty-state">
      <div className="es-icon"><Icon name="file" /></div>
      <p className="es-title">还没有任何记录</p>
      <p className="es-desc">看完门诊先记一句，报告可以先存原件。</p>
      <div className="es-actions" style={{ justifyContent: 'center' }}>
        <button className="btn btn-primary" type="button" onClick={onNewVisit}>
          <Icon name="plus" />
          记一次就诊
        </button>
      </div>
    </div>
  );
}
