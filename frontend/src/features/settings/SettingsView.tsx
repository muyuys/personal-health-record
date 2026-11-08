// 设置：常规 + 模型连接（AI）+ MCP + 数据备份导入导出。
// 模型连接读写 /api/ai/config；MCP 读 /api/mcp/config（配置里不含密钥）。
import { useEffect, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';

export function SettingsView({ go }: { go: (to: string) => void }) {
  const { data, reload } = useStore();
  const { setHead } = useHead();
  const [msg, setMsg] = useState('');

  // ---- 模型连接 ----
  const [conn, setConn] = useState<any>(null);
  const [mode, setMode] = useState<'magpie' | 'custom'>('magpie');
  const [endpoint, setEndpoint] = useState('');
  const [modelVal, setModelVal] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [connMsg, setConnMsg] = useState('');
  const [savingConn, setSavingConn] = useState(false);
  // ---- MCP ----
  const [mcp, setMcp] = useState<any>(null);
  const [mcpMsg, setMcpMsg] = useState('');

  useEffect(() => {
    setHead({ title: '设置', sub: '应用信息、模型连接与数据管理' });
    void (async () => {
      try {
        const c = await api.ai.config();
        setConn(c);
        setMode(c.mode === 'custom' ? 'custom' : 'magpie');
        setEndpoint(c.custom?.endpoint || '');
        setModelVal(c.custom?.model || '');
      } catch { /* ignore */ }
      try { setMcp(await api.ai.mcpConfig()); } catch { /* ignore */ }
    })();
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

  const saveConn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConn(true); setConnMsg('正在保存连接…');
    try {
      const payload: any = { mode };
      if (mode === 'custom') payload.custom = { endpoint, model: modelVal, key: apiKey, clearKey };
      const saved = await api.ai.saveConfig(payload);
      setConn(saved);
      setApiKey('');
      setEndpoint(saved.custom?.endpoint || '');
      setModelVal(saved.custom?.model || '');
      setClearKey(false);
      setConnMsg('连接已保存，立即生效');
    } catch (err: any) {
      setConnMsg(err?.message || '保存失败');
    } finally { setSavingConn(false); }
  };

  const copyMcp = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(mcp, null, 2)); setMcpMsg('配置已复制'); }
    catch { setMcpMsg('未能复制，请选中上方配置手动复制'); }
  };

  const magpie = conn?.magpie;
  return (
    <div className="stack">
      <section className="card">
        <div className="card-head"><h2>常规</h2><p className="hint" style={{ margin: 0 }}>应用访问与档案管理。</p></div>
        <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
          <div><b>成员管理</b><p className="hint" style={{ margin: 0 }}>添加家庭成员或切换当前查看的档案。</p></div>
          <button className="btn-plain" type="button" onClick={() => go('members')}>管理 →</button>
        </div>
        <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
          <div><b>个人资料</b><p className="hint" style={{ margin: 0 }}>查看与完善当前成员的基础信息。</p></div>
          <button className="btn-plain" type="button" onClick={() => go('me')}>查看 →</button>
        </div>
        <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
          <div><b>健康主题与待办</b><p className="hint" style={{ margin: 0 }}>按问题归拢的健康线索与提醒。</p></div>
          <button className="btn-plain" type="button" onClick={() => go('themes')}>查看 →</button>
        </div>
        <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
          <div><b>关于</b><p className="hint" style={{ margin: 0 }}>版本信息与更新记录。</p></div>
          <button className="btn-plain" type="button" onClick={() => go('about')}>查看 →</button>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>模型连接</h2><p className="hint" style={{ margin: 0 }}>用于 AI 对话与报告解析的服务，所有成员共用。</p></div>
        <form onSubmit={saveConn} style={{ marginTop: 8 }}>
          <label className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <span><b>连接方式</b><br /><span className="hint">默认使用 Magpie，也可接入自己的 API。</span></span>
            <select name="mode" value={mode} onChange={(e) => setMode(e.target.value as any)}>
              <option value="magpie">Magpie（默认）</option>
              <option value="custom">自定义 API</option>
            </select>
          </label>
          {mode === 'magpie' && (
            <div>
              <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <div><b>服务地址</b><p className="hint" style={{ margin: 0 }}>通过本机 Magpie 转发请求。</p></div>
                <span className="setting-value" style={{ color: 'var(--ink-4)' }}>{magpie?.endpoint || '—'}</span>
              </div>
              <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0' }}>
                <b>默认模型</b><span className="setting-value" style={{ color: 'var(--ink-4)' }}>{magpie?.model || '—'}</span>
              </div>
            </div>
          )}
          {mode === 'custom' && (
            <div>
              <label className="field" style={{ display: 'block', padding: '10px 0' }}>
                <span><b>API 地址</b> <span className="hint">基础 URL 或完整的 /chat/completions 地址。</span></span>
                <input type="url" value={endpoint} maxLength={2048} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.example.com/v1" autoComplete="off" style={{ width: '100%', marginTop: 6 }} />
              </label>
              <label className="field" style={{ display: 'block', padding: '10px 0' }}>
                <span><b>API 密钥</b> <span className="hint">仅保存在本机，留空保留已保存的密钥。</span></span>
                <input type="password" value={apiKey} maxLength={8192} onChange={(e) => setApiKey(e.target.value)} placeholder={conn?.custom?.keySet ? '已保存密钥，留空则保留' : '输入 API Key，本机接口可留空'} autoComplete="new-password" style={{ width: '100%', marginTop: 6 }} />
              </label>
              <label className="field" style={{ display: 'block', padding: '10px 0' }}>
                <span><b>默认模型</b></span>
                <input type="text" value={modelVal} onChange={(e) => setModelVal(e.target.value)} placeholder="如 gpt-4o-mini" style={{ width: '100%', marginTop: 6 }} />
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}>
                <input type="checkbox" checked={clearKey} onChange={(e) => setClearKey(e.target.checked)} />
                <span><b>清除密钥</b> <span className="hint">保存时删除已保存的密钥。</span></span>
              </label>
            </div>
          )}
          <div className="form-actions" style={{ marginTop: 8 }}>
            <button className="btn btn-primary" type="submit" disabled={savingConn}>{savingConn ? '保存中…' : '保存连接'}</button>
          </div>
          {connMsg ? <p className="hint" role="status" style={{ marginTop: 8 }}>{connMsg}</p> : null}
        </form>
      </section>

      <section className="card">
        <div className="card-head"><h2>MCP</h2><p className="hint" style={{ margin: 0 }}>让 agent 读取档案与管理记录。</p></div>
        <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
          <div><b>连接方式</b><p className="hint" style={{ margin: 0 }}>先启动健康档案，再将配置添加到 MCP 客户端。</p></div>
          <span className="setting-value" style={{ color: 'var(--ink-4)' }}>stdio</span>
        </div>
        <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
          <b>MCP 服务器配置</b>
          <button className="btn btn-ghost" type="button" onClick={() => void copyMcp()}><Icon name="download" />复制配置</button>
        </div>
        <pre className="connection-code" style={{ background: 'var(--bg-sunken)', padding: 12, borderRadius: 'var(--r-sm)', overflow: 'auto', fontSize: 12 }}>{mcp ? JSON.stringify(mcp, null, 2) : '加载中…'}</pre>
        {mcpMsg ? <p className="hint" role="status" style={{ marginTop: 8 }}>{mcpMsg}</p> : null}
        <p className="hint" style={{ marginTop: 8 }}>凭证由本机桥接程序自动读取，密钥不会显示在配置中。</p>
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
