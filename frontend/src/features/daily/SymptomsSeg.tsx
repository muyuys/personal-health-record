// 日常健康 · 症状段（复刻旧 renderSymptoms，js/app.views.body.js:728）。
// 按部位筛选的 filter chips + 症状表 + 新增/编辑。
import { useEffect, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import type { Symptom } from '../../api/types';

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => 'sy' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const SEV: Record<string, { label: string; tone: string }> = {
  mild: { label: '轻', tone: 'green' },
  moderate: { label: '中', tone: 'amber' },
  severe: { label: '重', tone: 'red' },
};

export function SymptomsSeg() {
  const { data, reload } = useStore();
  const { setHead } = useHead();
  const [theme, setTheme] = useState('');
  const [form, setForm] = useState<null | Symptom>(null);
  const [saving, setSaving] = useState(false);
  const all = (data?.symptoms ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const parts = Array.from(new Set(all.map((s) => s.part).filter(Boolean)));

  useEffect(() => {
    setHead({
      eyebrow: 'SYMPTOMS　症状日记',
      title: '症状日记',
      sub: '按日记录干眼、鼻炎、踝痛等主观不适，可按部位回看变化',
      actions: (
        <button className="btn btn-primary" type="button" onClick={() => setForm(blankSymptom())}>
          <Icon name="plus" />
          记录症状
        </button>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = theme ? all.filter((s) => s.part === theme) : all;
  const filters = [['', '全部', all.length] as [string, string, number]].concat(parts.map((p) => [p, p, all.filter((s) => s.part === p).length] as [string, string, number]));

  const save = async () => {
    if (!form || !form.part.trim()) return;
    setSaving(true);
    try {
      const rec: Symptom = { ...form, id: form.id || uid(), createdAt: form.createdAt || Date.now() };
      const isNew = !form.id;
      const next = isNew ? [...(data?.symptoms ?? []), rec] : (data?.symptoms ?? []).map((s) => (s.id === rec.id ? rec : s));
      await api.putTable('symptoms', next);
      await reload();
      setForm(null);
    } finally {
      setSaving(false);
    }
  };
  const del = async (id: string) => {
    await api.putTable('symptoms', (data?.symptoms ?? []).filter((s) => s.id !== id));
    await reload();
  };

  return (
    <div className="stack">
      {all.length === 0 ? (
        <section className="card">
          <div className="card-head"><h2>还没有症状记录</h2><span className="link">0 条</span></div>
          <div className="empty" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', padding: '22px 6px' }}>
            <p style={{ margin: 0, color: 'var(--ink-4)' }}>干眼、鼻炎、踝痛这类主观不适，都可以在这里按日记一条：部位、程度、诱因、备注。</p>
            <button className="btn btn-primary" type="button" onClick={() => setForm(blankSymptom())}><Icon name="plus" />记录第一条症状</button>
          </div>
          <p className="hint">记录的是你的主观感受，不是诊断；程度 1–10 为自评分，仅作自我观察。</p>
        </section>
      ) : (
        <>
          <div className="filter-row">
            {filters.map(([k, label, n]) => (
              <button key={k} type="button" className={'filter-chip' + (theme === k ? ' on' : '')} onClick={() => setTheme(k)}>
                {label} {n}
              </button>
            ))}
          </div>
          <section className="card">
            <div className="card-head"><h2>{theme || '全部症状'}</h2><span className="link">{list.length} 条</span></div>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>日期</th><th>部位 / 主题</th><th>程度</th><th>诱因</th><th>备注</th><th /></tr></thead>
                <tbody>
                  {list.map((s) => {
                    const sev = SEV[s.severity] || { label: s.severity || '—', tone: 'mute' };
                    return (
                      <tr key={s.id}>
                        <td className="date">{s.date}</td>
                        <td><b>{s.part}</b></td>
                        <td><span className={'chip chip-sm ' + sev.tone}>{sev.label}</span></td>
                        <td style={{ color: 'var(--ink-4)' }}>{s.trigger || '—'}</td>
                        <td style={{ color: 'var(--ink-4)' }}>{s.note || '—'}</td>
                        <td className="act"><button type="button" onClick={() => setForm({ ...s })}>编辑</button><button className="danger" type="button" onClick={() => void del(s.id)}>删除</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="hint" style={{ marginTop: 12 }}>程度为自评分 1–10（1 很轻、10 难以忍受）。记录只是自我观察，不能替代诊断。</p>
          </section>
        </>
      )}

      {form && (
        <section className="card">
          <div className="card-head"><h2>{form.id ? '编辑症状' : '记录症状'}</h2></div>
          <div className="form-grid">
            <label className="field"><span>日期 *</span><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
            <label className="field"><span>部位</span><input value={form.part} onChange={(e) => setForm({ ...form, part: e.target.value })} placeholder="如 眼部 / 鼻部 / 右踝" /></label>
            <label className="field"><span>程度</span>
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                <option value="mild">轻</option><option value="moderate">中</option><option value="severe">重</option>
              </select>
            </label>
            <label className="field"><span>诱因</span><input value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })} /></label>
            <label className="field wide"><span>备注</span><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存'}</button>
            <button className="btn btn-secondary" type="button" onClick={() => setForm(null)}>取消</button>
          </div>
        </section>
      )}
    </div>
  );
}

function blankSymptom(): Symptom {
  return { id: '', date: today(), part: '', severity: 'mild', trigger: '', note: '', createdAt: 0 };
}
