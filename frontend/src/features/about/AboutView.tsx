import { useEffect, useState } from 'react';
import { useHead } from '../../components/head';

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

export function AboutView(_props: { go: (to: string) => void }) {
  const { setHead } = useHead();
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setHead({ eyebrow: '应用', title: '关于', sub: '健康档案的版本信息与更新记录。' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch('/assets/release.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => setRelease(r))
      .catch(() => setRelease(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="about-page">
      <section className="about-product">
        <div>
          <h2>健康档案</h2>
          <p>整理个人与家庭的健康记录，保留每份报告与每一次变化。</p>
        </div>
        {release ? (
          <dl>
            <dt>当前版本</dt>
            <dd id="appVersion">v{release.version}</dd>
            <dt>发布日期</dt>
            <dd>{release.releasedAt}</dd>
          </dl>
        ) : null}
      </section>

      {loading ? (
        <p role="status">正在读取版本信息…</p>
      ) : release ? (
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
      ) : (
        <p role="status">版本信息暂时不可用，请刷新页面重试。</p>
      )}

      <p className="about-note">
        健康信息用于记录与整理，不能替代医生诊断。档案保存在本机；AI 功能按设置连接模型服务。
      </p>
    </div>
  );
}
