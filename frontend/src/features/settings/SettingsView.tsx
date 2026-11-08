// 设置：常规（应用信息/存储）+ 数据备份导入导出。
// 模型连接与 MCP 在批次 6 接入（读取 /ai/config 与 /mcp/config）。
import { useEffect, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';

export function SettingsView({ go }: { go: (to: string) => void }) {
  const { data, reload } = useStore();
  const { setHead } = useHead();
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setHead({ title: '设置', sub: '应用信息与数据管理' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doExport = () => { window.location.href = api.exportUrl(); };
  const doImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setMsg('正在导入…');
    try {
      const parsed = JSON.parse(await f.text());
      const r = await api.importBackup(parsed);
      setMsg(`导入成功：检验 ${r.labs} 条，报告 ${r.reports} 份。`);
      await reload();
    } catch (err: any) {
      setMsg('导入失败：' + (err?.message || err));
    } finally { e.target.value = ''; }
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head"><h2>常规</h2><p className="hint" style={{ margin: 0 }}>应用访问与档案管理。</p></div>
        <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
          <div><b>个人资料</b><p className="hint" style={{ margin: 0 }}>查看与完善当前成员的基础信息。</p></div>
          <button className="btn-plain" type="button" onClick={() => go('me')}>查看 →</button>
        </div>
        <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
          <div><b>健康主题与待办</b><p className="hint" style={{ margin: 0 }}>按问题归拢的健康线索与提醒。</p></div>
          <button className="btn-plain" type="button" onClick={() => go('themes')}>查看 →</button>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>数据备份</h2><span className="link">本机数据库</span></div>
        <p className="hint">导出的 JSON 含报告照片，可换一台机器用「导入数据」恢复。</p>
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" type="button" onClick={doExport}><Icon name="download" />导出完整备份</button>
          <label className="btn btn-ghost"><Icon name="upload" />导入数据<input type="file" accept="application/json,.json" hidden onChange={(e) => void doImport(e)} /></label>
        </div>
        {msg ? <p className="hint" style={{ marginTop: 8 }}>{msg}</p> : null}
        <p className="hint" style={{ marginTop: 10 }}>当前检验 {data?.labs.length ?? 0} 条，报告 {data?.reports.length ?? 0} 份。数据只有这一份：删掉 <code>data/health.db</code> 就真的没了。</p>
      </section>
    </div>
  );
}
