// 设置：带左侧子导航的设置 shell，复刻老版 js/app.features.js renderSettings。
// 分组：应用/常规、服务/模型连接、服务/MCP、应用信息/关于。一次只显示一个 section。
// 模型连接读写 /api/ai/config；MCP 读 /api/mcp/config；关于读 /assets/release.json。
import { useEffect, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';

interface ReleaseItem {
  version: string;
  date: string;
  title: string;
  changes: string[];
}
interface Release {
  version: string;
  releasedAt: string;
  history: ReleaseItem[];
}

type SectionId = 'general' | 'models' | 'mcp' | 'about';
interface NavItem {
  id: SectionId;
  label: string;
  group: string;
  icon: string;
  search: string;
}
const NAV: NavItem[] = [
  { id: 'general', label: '常规', group: '应用', icon: 'settings', search: '平台 地址 url 成员 管理 资料' },
  { id: 'models', label: '模型连接', group: '服务', icon: 'pulse', search: 'ai api key 密钥 模型 magpie 连接' },
  { id: 'mcp', label: 'MCP', group: '服务', icon: 'grid', search: 'mcp agent 连接 配置 客户端' },
  { id: 'about', label: '关于', group: '应用信息', icon: 'info', search: '版本 关于 记录 version' },
];

function AboutContents({ release }: { release: Release | null }) {
  if (!release) return <p role="status">版本信息暂时不可用，请刷新页面重试。</p>;
  return (
    <div className="about-page">
      <section className="about-product">
        <div>
          <h2>健康档案</h2>
          <p>整理个人与家庭的健康记录，保留每份报告与每一次变化。</p>
        </div>
        <dl>
          <dt>当前版本</dt>
          <dd>v{release.version}</dd>
          <dt>发布日期</dt>
          <dd>{release.releasedAt}</dd>
        </dl>
      </section>
      <section className="about-history">
        <h2>版本记录</h2>
        {release.history.map((item) => (
          <article key={item.version}>
            <header>
              <h3>v{item.version}</h3>
              <time>{item.date}</time>
            </header>
            <p>{item.title}</p>
            <ul>
              {item.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
      <p className="about-note">健康信息用于记录与整理，不能替代医生诊断。档案保存在本机；AI 功能按设置连接模型服务。</p>
    </div>
  );
}

export function SettingsView({ go, initialSection }: { go: (to: string) => void; initialSection?: SectionId }) {
  const { data, reload } = useStore();
  const { setHead } = useHead();
  const [section, setSection] = useState<SectionId>(initialSection || 'general');
  const [search, setSearch] = useState('');

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
  // ---- 关于 ----
  const [release, setRelease] = useState<Release | null>(null);
  // ---- 数据备份 ----
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setHead({ title: '设置', sub: '' });
    void (async () => {
      try {
        const c = await api.ai.config();
        setConn(c);
        setMode(c.mode === 'custom' ? 'custom' : 'magpie');
        setEndpoint(c.custom?.endpoint || '');
        setModelVal(c.custom?.model || '');
      } catch { /* ignore */ }
      try { setMcp(await api.ai.mcpConfig()); } catch { /* ignore */ }
      try {
        const r = await fetch('/assets/release.json', { cache: 'no-store' });
        setRelease(r.ok ? await r.json() : null);
      } catch { setRelease(null); }
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
  const platformURL = (typeof location !== 'undefined' ? location.origin : '') + '/';
  const q = search.trim().toLowerCase();
  const groups = Array.from(new Set(NAV.map((n) => n.group)));

  return (
    <div className={`settings-layout settings-mode${''}`}>
      <aside className="settings-sidebar">
        <h1>设置</h1>
        <label className="settings-search">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索设置" aria-label="搜索设置" />
        </label>
        <nav aria-label="设置分类">
          {groups.map((g) => {
            const items = NAV.filter((n) => n.group === g && (!q || (n.label + ' ' + n.search).toLowerCase().includes(q)));
            if (!items.length) return null;
            return (
              <div className="settings-nav-group" key={g}>
                <p>{g}</p>
                {items.map((n) => (
                  <a
                    key={n.id}
                    href={`#/settings?section=${n.id}`}
                    className={section === n.id ? 'is-active' : ''}
                    aria-current={section === n.id ? 'page' : undefined}
                    onClick={(e) => { e.preventDefault(); setSection(n.id); }}
                  >
                    <Icon name={n.icon} />
                    <span>{n.label}</span>
                  </a>
                ))}
              </div>
            );
          })}
        </nav>
        {q && !NAV.some((n) => (n.label + ' ' + n.search).toLowerCase().includes(q)) ? (
          <p id="settingsSearchEmpty">没有匹配的设置</p>
        ) : null}
      </aside>

      <div className="settings-content">
        {section === 'general' && (
          <section className="settings-panel">
            <header className="settings-panel-head"><h2>常规</h2><p>应用访问与档案管理</p></header>
            <h3 className="settings-section-title">应用</h3>
            <div className="settings-card">
              <div className="setting-row setting-address">
                <div><b>平台地址</b><p>本机启动后访问的地址。</p></div>
                <a className="setting-value" href={platformURL}>{platformURL}</a>
              </div>
              <div className="setting-row">
                <div><b>成员管理</b><p>添加家庭成员或切换当前查看的档案。</p></div>
                <button className="settings-action" type="button" onClick={() => go('members')}>管理 <Icon name="chevron" /></button>
              </div>
              <div className="setting-row">
                <div><b>个人资料</b><p>查看与完善当前成员的基础信息。</p></div>
                <button className="settings-action" type="button" onClick={() => go('me')}>查看 <Icon name="chevron" /></button>
              </div>
            </div>
            <h3 className="settings-section-title">使用范围</h3>
            <div className="settings-card">
              <div className="setting-row">
                <div><b>模型与 MCP 连接</b><p>所有成员共用同一应用连接，数据按成员隔离存档。</p></div>
                <span className="setting-value">应用级设置</span>
              </div>
            </div>
            <h3 className="settings-section-title">数据备份</h3>
            <div className="settings-card">
              <div className="setting-row">
                <div><b>导出完整备份</b><p>导出的 JSON 含报告照片，可换一台机器用「导入数据」恢复。</p></div>
                <button className="settings-action" type="button" onClick={doExport}><Icon name="download" />导出</button>
              </div>
              <div className="setting-row">
                <div><b>导入数据</b><p>从备份 JSON 恢复全部记录。</p></div>
                <label className="settings-action"><Icon name="upload" />导入<input type="file" accept="application/json,.json" hidden onChange={(e) => void doImport(e)} /></label>
              </div>
            </div>
            {msg ? <p className="settings-help" role="status">{msg}</p> : null}
            <p className="settings-help">当前检验 {data?.labs.length ?? 0} 条，报告 {data?.reports.length ?? 0} 份。数据只有这一份：删掉 data/health.db 就真的没了。</p>
          </section>
        )}

        {section === 'models' && (
          <section className="settings-panel">
            <header className="settings-panel-head"><h2>模型连接</h2><p>选择用于 AI 对话与报告解析的服务</p></header>
            <h3 className="settings-section-title">模型服务</h3>
            <form onSubmit={saveConn}>
              <div className="settings-card">
                <label className="setting-row">
                  <span><b>连接方式</b><small>默认使用 Magpie，也可接入自己的 API。</small></span>
                  <select name="mode" value={mode} onChange={(e) => setMode(e.target.value as any)}>
                    <option value="magpie">Magpie（默认）</option>
                    <option value="custom">自定义 API</option>
                  </select>
                </label>
                {mode === 'magpie' && (
                  <div>
                    <div className="setting-row setting-address">
                      <div><b>服务地址</b><p>通过本机 Magpie 转发请求。</p></div>
                      <span className="setting-value">{magpie?.endpoint || '—'}</span>
                    </div>
                    <div className="setting-row"><b>默认模型</b><span className="setting-value">{magpie?.model || '—'}</span></div>
                  </div>
                )}
                {mode === 'custom' && (
                  <div>
                    <label className="setting-row setting-field">
                      <span><b>API 地址</b><small>基础 URL 或完整的 /chat/completions 地址。</small></span>
                      <input type="url" maxLength={2048} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.example.com/v1" autoComplete="off" />
                    </label>
                    <label className="setting-row setting-field">
                      <span><b>API 密钥</b><small>仅保存在本机，留空保留已保存的密钥。</small></span>
                      <input type="password" maxLength={8192} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={conn?.custom?.keySet ? '已保存密钥，留空则保留' : '输入 API Key，本机接口可留空'} autoComplete="new-password" />
                    </label>
                    <label className="setting-row">
                      <span><b>清除密钥</b><small>保存时删除已保存的密钥。</small></span>
                      <input type="checkbox" checked={clearKey} onChange={(e) => setClearKey(e.target.checked)} />
                    </label>
                    <label className="setting-row setting-field">
                      <span><b>默认模型</b><small>须写支持图片输入的模型 ID。</small></span>
                      <input type="text" maxLength={200} value={modelVal} onChange={(e) => setModelVal(e.target.value)} placeholder="模型 ID" autoComplete="off" />
                    </label>
                  </div>
                )}
              </div>
              <p className="settings-help">采用 Chat Completions 格式，相关记录与报告图片会发送到所选服务；Magpie 会做转发与适配。</p>
              <div className="settings-form-footer">
                <p id="aiConnectionStatus" role="status">{connMsg}</p>
                <button className="btn btn-primary" type="submit" disabled={savingConn}>{savingConn ? '保存中…' : '保存连接'}</button>
              </div>
            </form>
          </section>
        )}

        {section === 'mcp' && (
          <section className="settings-panel">
            <header className="settings-panel-head"><h2>MCP</h2><p>让 agent 读取档案与管理记录</p></header>
            <h3 className="settings-section-title">连接配置</h3>
            <div className="settings-card">
              <div className="setting-row"><div><b>连接方式</b><p>先启动健康档案，再将近配置添加到 MCP 客户端。</p></div><span className="setting-value">stdio</span></div>
              <div className="setting-row"><div><b>数据范围</b><p>记录按当前指定的成员 ID，修改后刷新页面查看。</p></div><span className="setting-value">按成员隔离</span></div>
            </div>
            <h3 className="settings-section-title">客户端配置</h3>
            <div className="settings-card settings-code-card">
              <div className="setting-row"><b>MCP 服务器配置</b><button className="settings-action" type="button" onClick={() => void copyMcp()}>复制配置 <Icon name="download" /></button></div>
              <pre className="connection-code">{mcp ? JSON.stringify(mcp, null, 2) : '加载中…'}</pre>
            </div>
            {mcpMsg ? <p className="settings-help" role="status">{mcpMsg}</p> : null}
            <p className="settings-help">凭证由本机桥接程序自动读取，密钥不会显示在配置中。</p>
          </section>
        )}

        {section === 'about' && (
          <section className="settings-panel">
            <header className="settings-panel-head"><h2>关于</h2><p>健康档案的版本信息与更新记录。</p></header>
            <AboutContents release={release} />
          </section>
        )}
      </div>
    </div>
  );
}
