// 当前成员（家庭档案）——存 localStorage，所有请求带 X-Health-Profile 头。
// 切换成员＝改 localStorage + 整页 reload（与旧前端 ?member= 整页重载语义一致，
// 避免两个档案的记录出现在同一屏）。

const LS_KEY = 'health-active-profile';

export function getActiveProfile(): string {
  try {
    return localStorage.getItem(LS_KEY) || 'default';
  } catch {
    return 'default';
  }
}

export function setActiveProfile(pid: string): void {
  try {
    localStorage.setItem(LS_KEY, pid);
  } catch {
    /* ignore */
  }
}

/** 切换当前档案并整页重载。 */
export function switchProfile(pid: string): void {
  setActiveProfile(pid);
  location.reload();
}

export function profileHeaders(): Record<string, string> {
  const pid = getActiveProfile();
  return pid && pid !== 'default' ? { 'X-Health-Profile': pid } : {};
}

export function withProfileQuery(url: string): string {
  const pid = getActiveProfile();
  if (!pid || pid === 'default') return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}profile=${encodeURIComponent(pid)}`;
}
