import { useEffect } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';

// 首页：从全量快照聚合「接下来要做 / 最近记录」，对齐旧 renderHome 的意图。
export function HomeView({ go }: { go: (to: string) => void }) {
  const { setHead } = useHead();
  const { data, loading, error, reload } = useStore();

  // 最近更新日期：取各表最大 date
  const lastDate = data
    ? [data.visits, data.labs, data.vitals, data.symptoms, data.sleepLogs, data.weights]
        .flat()
        .map((x: any) => x?.date)
        .filter(Boolean)
        .sort()
        .pop()
    : null;

  useEffect(() => {
    setHead({
      title: '健康档案',
      sub: lastDate ? `最近更新 ${lastDate}　·　数据存在本机，随时可以补` : '从第一次记录开始',
      actions: (
        <button className="btn btn-primary" type="button" onClick={() => go('new-visit')}>
          <Icon name="plus" />
          记一笔
        </button>
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

  const openTodos = data.todoItems.length;
  const recentVisits = [...data.visits].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3);

  return (
    <div className="stack home-layout">
      <section className="grid-quick home-shortcuts" aria-label="快捷记录">
        <button className="quick-card quick-card--accent" type="button" onClick={() => go('new-visit')}>
          <span className="qc-icon"><Icon name="plus" /></span>
          <span className="qc-body"><span className="qc-title">记一次就诊</span><span className="qc-desc">日期 + 一段记录</span></span>
        </button>
        <button className="quick-card" type="button" onClick={() => go('new-report')}>
          <span className="qc-icon"><Icon name="file" /></span>
          <span className="qc-body"><span className="qc-title">存一份报告</span><span className="qc-desc">先保存原件</span></span>
        </button>
        <button className="quick-card" type="button" onClick={() => go('daily')}>
          <span className="qc-icon"><Icon name="pulse" /></span>
          <span className="qc-body"><span className="qc-title">记日常数据</span><span className="qc-desc">体重、血压、症状、睡眠</span></span>
        </button>
        <button className="quick-card" type="button" onClick={() => go('meds')}>
          <span className="qc-icon"><Icon name="check" /></span>
          <span className="qc-body"><span className="qc-title">用药记录</span><span className="qc-desc">剂量、频次、起止</span></span>
        </button>
        <button className="quick-card" type="button" onClick={() => go('reports')}>
          <span className="qc-icon"><Icon name="file" /></span>
          <span className="qc-body"><span className="qc-title">报告档案</span><span className="qc-desc">查看已存原件</span></span>
        </button>
      </section>

      {openTodos > 0 && (
        <section className="home-next">
          <div className="section-head" style={{ marginTop: 0 }}>
            <h2>接下来要做</h2>
            <button className="btn-plain" type="button" onClick={() => go('themes')}>
              全部 {openTodos} 项 →
            </button>
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
        {recentVisits.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {recentVisits.map((v) => (
              <button key={v.id} type="button" className="card" style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }} onClick={() => go('visit/' + v.id)}>
                <div className="row-main">
                  <p className="row-title" style={{ fontWeight: 600 }}>
                    {v.hospital || `${v.visitType || '门诊'}就诊`}
                    {v.department ? `　·　${v.department}` : ''}
                  </p>
                  <p className="row-sub"><span className="ts">{v.date || '日期未记'}</span>{v.doctor ? `　·　${v.doctor}` : ''}</p>
                  <p className="row-sub" style={{ marginTop: 6 }}>{v.diagnosis || v.chief || '（无诊断 / 主诉）'}</p>
                </div>
              </button>
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
