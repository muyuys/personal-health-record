import { useEffect, useState } from 'react';
import { useHead } from '../../components/head';
import { api } from '../../api/client';
import { getActiveProfile, switchProfile } from '../../api/profile';

interface Member {
  id: string;
  name: string;
  relation?: string;
}

export function MembersView({ go }: { go: (to: string) => void }) {
  const { setHead } = useHead();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const active = getActiveProfile();

  useEffect(() => {
    setHead({
      eyebrow: '家庭健康档案',
      title: '成员管理',
      sub: '每位成员独立保存记录、报告、问答和备份。',
      actions: (
        <button className="btn" type="button" onClick={() => go('settings')}>
          设置
        </button>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.ai.profiles();
      setMembers(res.profiles as Member[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setEditingId('');
    setName('');
    setRelation('');
    setStatus('');
  };

  const startEdit = (m: Member) => {
    setEditingId(m.id);
    setName(m.name);
    setRelation(m.relation || '');
    setStatus('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setStatus('请填写称呼');
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      await api.ai.saveProfile({
        ...(editingId ? { id: editingId } : {}),
        name: name.trim(),
        relation: relation.trim(),
      });
      resetForm();
      await load();
      setStatus('');
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const activeName = (members.find((m) => m.id === active) || {}).name || (active === 'default' ? '我的档案' : '成员档案');

  return (
    <div className="feature-settings">
      <section>
        <div>
          <h2>家庭成员</h2>
          <p>
            当前正在查看：<b>{activeName}</b>。这是同一台电脑上的家庭档案，成员切换不提供独立账户登录。
          </p>
        </div>
        <div className="feature-panel">
          {loading ? (
            <p role="status">正在读取成员…</p>
          ) : error ? (
            <p className="notice notice--danger" role="alert">
              {error}
            </p>
          ) : (
            <ul className="member-list">
              {members.map((m) => (
                <li key={m.id}>
                  <span>
                    <b>{m.name}</b>
                    <small>{m.relation || '关系未填写'}</small>
                  </span>
                  <div className="member-row-actions">
                    {m.id !== active ? (
                      <button className="btn btn-mini" type="button" onClick={() => switchProfile(m.id)}>
                        切换档案
                      </button>
                    ) : (
                      <span className="member-current-label">当前档案</span>
                    )}
                    <button className="btn btn-mini" type="button" onClick={() => startEdit(m)}>
                      编辑
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form id="memberForm" onSubmit={submit}>
            <h3>{editingId ? '编辑成员' : '添加成员'}</h3>
            <label>
              称呼
              <input
                name="name"
                required
                maxLength={60}
                placeholder="填写成员称呼"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              与我的关系
              <input
                name="relation"
                maxLength={40}
                placeholder="如：本人、父亲、母亲"
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? '保存中…' : '保存成员'}
            </button>
            <button className="btn" type="button" onClick={resetForm}>
              取消编辑
            </button>
            <p role="status" id="memberStatus">
              {status}
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
