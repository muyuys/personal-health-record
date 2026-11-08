import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import { useHead } from './head';
import { getActiveProfile } from '../api/profile';
import { api } from '../api/client';
import type { Route } from '../store/useRoute';

// 一级导航（对齐 js/app.views.health.js NAV）
const NAV = [
  { id: 'home', label: '首页', icon: 'home' },
  { id: 'records', label: '就医记录', icon: 'file' },
  { id: 'metrics', label: '指标趋势', icon: 'trend' },
  { id: 'daily', label: '日常健康', icon: 'heart' },
  { id: 'themes', label: '健康主题', icon: 'check' },
  { id: 'assistant', label: 'AI 问答', icon: 'pulse' },
  { id: 'settings', label: '设置', icon: 'settings', bottom: true },
  { id: 'me', label: '我的', icon: 'user', bottom: true },
];

const BrandMark = () => (
  <svg className="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <rect width="32" height="32" rx="9" fill="#173F33" />
    <path d="M7 18h4l2.6-6.5 3 11.5 2.6-5H25" stroke="#EDE7DA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// 当前导航高亮：把二级视图归到对应一级
function activeNav(name: string): string {
  if (name === 'visit' || name === 'new-visit' || name === 'new-report' || name === 'records') return 'records';
  if (name === 'labs' || name === 'labs-all' || name === 'metrics') return 'metrics';
  if (name === 'theme' || name === 'themes') return 'themes';
  if (name === 'summary' || name === 'me') return 'me';
  if (name === 'about') return 'settings';
  return name;
}

export function Shell({ route, go, children }: { route: Route; go: (to: string) => void; children: ReactNode }) {
  const { head } = useHead();
  const [collapsed, setCollapsed] = useState(true);
  const [memberName, setMemberName] = useState('我的档案');
  const active = activeNav(route.name);

  useEffect(() => {
    let alive = true;
    const pid = getActiveProfile();
    api.ai
      .profiles()
      .then((res) => {
        if (!alive) return;
        const pidNow = getActiveProfile();
        const m = (res.profiles as any[]).find((p) => p.id === pidNow) || (res.profiles as any[]).find((p) => p.id === pid);
        setMemberName(m?.name || (pidNow === 'default' ? '我的档案' : '成员档案'));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 设置页隐藏通用页头（老版做法：body.settings-mode 时 .page-head{display:none}）
  useEffect(() => {
    const on = route.name === 'settings' || route.name === 'about';
    document.body.classList.toggle('settings-mode', on);
    return () => { document.body.classList.remove('settings-mode'); };
  }, [route.name]);

  const mainNav = NAV.filter((n) => !n.bottom);
  const bottomNav = NAV.filter((n) => n.bottom);

  const navBtn = (n: (typeof NAV)[number]) => (
    <button
      key={n.id}
      className={'nav-item' + (active === n.id ? ' active' : '')}
      type="button"
      onClick={() => go(n.id)}
    >
      <Icon name={n.icon} />
      <span>{n.label}</span>
    </button>
  );

  return (
    <div className="app">
      <aside className={'rail' + (collapsed ? ' is-collapsed' : '')}>
        <div className="rail-header">
          <a className="brand" href="#/home" aria-label="回到首页" onClick={(e) => { e.preventDefault(); go('home'); }}>
            <BrandMark />
            <span className="brand-t">
              <b>健康档案</b>
              <span>{memberName}</span>
            </span>
          </a>
          <button
            className="rail-toggle"
            type="button"
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
            onClick={() => setCollapsed((v) => !v)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
              <path d={collapsed ? 'm14 9 3 3-3 3' : 'm17 9-3 3 3 3'} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{collapsed ? '展开菜单' : '收起菜单'}</span>
          </button>
        </div>

        <nav className="nav" aria-label="主导航">
          {mainNav.map(navBtn)}
          <div className="nav-spacer" />
          <div className="nav-divider" />
          {bottomNav.map(navBtn)}
        </nav>
      </aside>

      <main className="main">
        <header className="page-head">
          <div className="page-head-l">
            {head.eyebrow ? <p className="eyebrow">{head.eyebrow}</p> : null}
            <h1>{head.title}</h1>
            {head.sub ? <p className="page-sub">{head.sub}</p> : null}
          </div>
          {head.actions ? <div className="page-actions">{head.actions}</div> : null}
        </header>

        <div className="view">{children}</div>

        <p className="disclaimer">
          数据用于个人整理，参考范围与异常提示不能替代医生解读。空白代表未记录，不等于没有症状或数值为 0。
          历史用药不自动视为当前用药。文件夹名称与未验证推测不作为确诊依据。
        </p>
      </main>
    </div>
  );
}
