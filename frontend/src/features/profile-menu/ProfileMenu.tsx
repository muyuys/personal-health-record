// 家庭档案切换浮层，复刻旧前端 js/app.profile-menu.js。
// 定位：桌面端贴 .rail 右缘 + 8px，纵向贴触发按钮底部。
// 内容：当前档案列表（可切换）+ 新增档案 + 管理成员 + 个人资料与数据。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { I } from '../../components/icons';
import { api } from '../../api/client';
import { getActiveProfile, switchProfile } from '../../api/profile';

export type Profile = { id: string; name: string; relation?: string };

export function ProfileMenu({
  open,
  anchor,
  onClose,
  go,
}: {
  open: boolean;
  anchor: HTMLElement | null;
  onClose: () => void;
  go: (to: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string>('default');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const description = adding ? '为家庭成员单独保存健康记录' : '当前 · ' + (profiles.find((p) => p.id === activeId)?.name || '我的档案');

  // 加载档案列表
  useEffect(() => {
    if (!open) return;
    setAdding(false);
    setStatus('');
    setActiveId(getActiveProfile());
    let alive = true;
    api.ai
      .profiles()
      .then((res) => {
        if (!alive) return;
        setProfiles((res.profiles as Profile[]) || []);
      })
      .catch((e) => {
        if (alive) setStatus(e?.message || '加载档案失败');
      });
    return () => {
      alive = false;
    };
  }, [open]);

  // 定位
  const reposition = () => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const menu = menuRef.current;
    const mw = menu ? menu.getBoundingClientRect().width || 320 : 320;
    const mh = menu ? menu.getBoundingClientRect().height : 200;
    const desktop = window.innerWidth >= 960;
    const rail = document.querySelector('.rail');
    let left: number;
    let top: number;
    if (desktop && rail) {
      left = rail.getBoundingClientRect().right + 8;
      top = rect.bottom - mh;
    } else {
      left = rect.right - mw;
      top = rect.top - mh - 8;
    }
    left = Math.max(12, Math.min(left, window.innerWidth - mw - 12));
    top = Math.max(12, Math.min(top, window.innerHeight - mh - 12));
    setPos({ left, top });
  };

  useLayoutEffect(() => {
    if (open) reposition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, adding, profiles.length]);

  // 点击外部/Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (anchor?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const onScrollResize = () => reposition();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onScrollResize);
    document.addEventListener('scroll', onScrollResize, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onScrollResize);
      document.removeEventListener('scroll', onScrollResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchor]);

  if (!open || !anchor) return null;

  const doSwitch = (p: Profile) => {
    if (p.id === activeId) {
      onClose();
      return;
    }
    switchProfile(p.id);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const n = name.trim();
    const r = relation.trim();
    if (!n) {
      setStatus('请填写成员称呼');
      return;
    }
    setSaving(true);
    setStatus('正在创建档案…');
    try {
      const created = await api.ai.saveProfile({ name: n, relation: r });
      await api.ai.profiles().then((res) => setProfiles((res.profiles as Profile[]) || []));
      setAdding(false);
      setName('');
      setRelation('');
      setStatus('档案已创建，可在列表切换');
      // 创建成功后若后端返回新 id，可直接切过去
      const newId = (created as any)?.id || (created as any)?.profile?.id;
      if (newId) switchProfile(newId);
    } catch (err: any) {
      setStatus(err?.message || '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      className="profile-menu"
      role="dialog"
      aria-label="我的与健康档案"
      style={{ left: pos.left, top: pos.top }}
    >
      <header className="profile-menu-head">
        <div>
          <h2>{adding ? '新增档案' : '健康档案'}</h2>
          <p>{description}</p>
        </div>
        <button type="button" className="profile-menu-close" aria-label="关闭档案菜单" onClick={onClose}>
          {I.close()}
        </button>
      </header>

      {adding ? (
        <form className="profile-menu-form" onSubmit={submitCreate}>
          <label>
            称呼
            <input name="name" required maxLength={60} placeholder="填写成员称呼" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            与我的关系
            <input name="relation" maxLength={40} placeholder="如：本人、父亲、母亲" autoComplete="off" value={relation} onChange={(e) => setRelation(e.target.value)} />
          </label>
          <p>新档案独立保存健康记录，创建后可从列表切换。</p>
          <div className="profile-menu-form-footer">
            <button type="button" className="btn" onClick={() => setAdding(false)} disabled={saving}>
              返回
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              创建档案
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="profile-menu-list" aria-label="家庭档案">
            {profiles.length === 0 ? (
              <p className="profile-menu-status">暂时没有可用档案，请刷新后重试。</p>
            ) : (
              profiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="profile-menu-member"
                  aria-current={p.id === activeId ? 'true' : undefined}
                  onClick={() => doSwitch(p)}
                >
                  <span className="profile-menu-avatar" aria-hidden="true">
                    {Array.from(p.name || '档')[0]}
                  </span>
                  <span>
                    <b>{p.name}</b>
                    <small>
                      {(p.relation || '关系未填写') + (p.id === activeId ? ' · 当前档案' : '')}
                    </small>
                  </span>
                  {p.id === activeId ? I.check2() : null}
                </button>
              ))
            )}
          </div>
          <div className="profile-menu-actions">
            <button type="button" className="profile-menu-action" onClick={() => setAdding(true)}>
              {I.plus()}
              新增档案
            </button>
            <button type="button" className="profile-menu-action" onClick={() => { onClose(); go('members'); }}>
              {I.user()}
              管理成员
            </button>
            <button type="button" className="profile-menu-action" onClick={() => { onClose(); go('me'); }}>
              {I.file()}
              个人资料与数据
            </button>
          </div>
        </>
      )}
      <p className="profile-menu-status" role="status">
        {status}
      </p>
    </div>,
    document.body,
  );
}
