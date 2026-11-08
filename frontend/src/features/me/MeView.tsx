// 我的：个人档案（可编辑基础资料 + 结构化过敏/家族史/手术）+ 数据存储与导入导出。
import { useEffect, useMemo, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';

// 可编辑基础资料字段（与旧前端 PROFILE_EDITABLE_KEYS 对齐）
const EDITABLE = ['姓名／称呼', '出生日期', '生理性别（能量估算用）', '身高', '日常活动', '睡眠与作息', '吸烟／饮酒', '饮食习惯、外卖频率'];
const REQUIRED = ['姓名／称呼', '出生日期', '睡眠与作息', '吸烟／饮酒', '饮食习惯、外卖频率'];
const SEVERITY: Record<string, string> = { mild: '轻微', moderate: '中度', severe: '重度', critical: '危急' };
const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(Number(Number(v).toPrecision(10))));

function ageFromBirth(s: string): number | null {
  const m = /(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})/.exec(s || '');
  if (!m) return null;
  const by = +m[1], bm = +m[2], bd = +m[3];
  const now = new Date();
  let age = now.getFullYear() - by;
  const had = now.getMonth() + 1 > bm || (now.getMonth() + 1 === bm && now.getDate() >= bd);
  if (!had) age -= 1;
  return age >= 0 && age <= 150 ? age : null;
}

export function MeView({ go }: { go: (to: string) => void }) {
  const { data, reload } = useStore();
  const { setHead } = useHead();
  const ov = (data?.profileOverrides ?? {}) as Record<string, string>;
  const allergies = data?.allergies ?? [];
  const family = data?.familyHistory ?? [];
  const surgeries = data?.surgeries ?? [];
  const labs = data?.labs ?? [];
  const weights = data?.weights ?? [];
  const reports = data?.reports ?? [];
  const medications = data?.medications ?? [];

  const [editField, setEditField] = useState<string | null>(null);
  const [fieldVal, setFieldVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [addKind, setAddKind] = useState<'' | 'allergy' | 'family' | 'surgery'>('');
  const [histDraft, setHistDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    setHead({ title: '个人资料', sub: '空白代表未记录，不等于没有' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 自动派生值
  const auto: Record<string, string> = {};
  const birth = ov['出生日期'] || '';
  if (birth) { const a = ageFromBirth(birth); if (a !== null) auto['年龄'] = `${a} 岁（按出生日期自动计算）`; }
  const lw = weights.slice().sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''))[0];
  if (lw && Number.isFinite(lw.kg)) auto['最近自报体重'] = `${num(lw.kg)} kg（${lw.date} 记录）`;
  const waistRec = weights.slice().reverse().find((w: any) => Number.isFinite(w.waist) && w.waist > 0);
  if (waistRec) auto['腰围'] = `${num(waistRec.waist)} cm（${waistRec.date} 记录）`;

  const structured = {
    '药物／食物过敏及反应': allergies.length ? `已记录 ${allergies.length} 项：${allergies.map((a: any) => a.name).join('、')}` : '',
    '既往手术／住院史': surgeries.length ? `已记录 ${surgeries.length} 次：${surgeries.map((s: any) => s.name).join('、')}` : '',
    '其他确诊疾病与家族史': family.length ? `已记录 ${family.length} 项：${family.map((f: any) => `${f.relation} ${f.condition}`).join('、')}` : '',
    '当前全部药物／补充剂': medications.filter((m: any) => m.status === 'active').length ? `在服 ${medications.filter((m: any) => m.status === 'active').length} 项` : '',
  };
  void structured;

  const rows = EDITABLE.map((k) => {
    let v = '', src = '';
    if (auto[k]) { v = auto[k]; src = 'auto'; }
    else if (k === '腰围' && auto['腰围']) { v = auto['腰围']; src = 'auto'; }
    else if (ov[k]) { v = ov[k]; src = 'edited'; }
    return { k, v, ok: !!v, src, required: REQUIRED.includes(k) };
  });
  const filled = rows.filter((r) => r.ok).length;

  const saveField = async (k: string, val: string) => {
    setSaving(true);
    try {
      const next = { ...ov, [k]: val };
      await api.putState({ weights, done: data?.done ?? {}, profileOverrides: next });
      await reload();
      setEditField(null);
    } finally { setSaving(false); }
  };

  const addHist = async () => {
    setSaving(true);
    try {
      if (addKind === 'allergy') {
        await api.putHistory({ allergies: [...allergies, { id: uid('alg-'), name: histDraft.name || '', category: histDraft.category || '', severity: histDraft.severity || '', reaction: histDraft.reaction || '', note: '', createdAt: Date.now() }] });
      } else if (addKind === 'family') {
        await api.putHistory({ familyHistory: [...family, { id: uid('fam-'), relation: histDraft.relation || '', condition: histDraft.condition || '', note: histDraft.note || '', createdAt: Date.now() }] });
      } else if (addKind === 'surgery') {
        await api.putHistory({ surgeries: [...surgeries, { id: uid('sur-'), date: histDraft.date || '', name: histDraft.name2 || '', hospital: histDraft.hospital || '', note: histDraft.note || '', createdAt: Date.now() }] });
      }
      await reload();
      setAddKind(''); setHistDraft({});
    } finally { setSaving(false); }
  };
  const delHist = async (kind: 'allergy' | 'family' | 'surgery', id: string) => {
    if (kind === 'allergy') await api.putHistory({ allergies: allergies.filter((a: any) => a.id !== id) });
    else if (kind === 'family') await api.putHistory({ familyHistory: family.filter((f: any) => f.id !== id) });
    else await api.putHistory({ surgeries: surgeries.filter((s: any) => s.id !== id) });
    await reload();
  };

  const doExport = () => { window.location.href = api.exportUrl(); };
  const fileRef = useMemo(() => ({ current: null as HTMLInputElement | null }), []);
  const doImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImportMsg('正在导入…');
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      const r = await api.importBackup(parsed);
      setImportMsg(`导入成功：检验 ${r.labs} 条，报告 ${r.reports} 份。`);
      await reload();
    } catch (err: any) {
      setImportMsg('导入失败：' + (err?.message || err));
    } finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div className="stack">
      <div className="seg-row">
        <span className="page-sub">基础资料 {filled}/{rows.length} 项已填</span>
        <div className="seg-tools">
          <button className="btn btn-ghost" type="button" onClick={() => go('themes')}>健康主题</button>
          <button className="btn btn-ghost" type="button" onClick={doExport}><Icon name="download" />导出备份</button>
        </div>
      </div>

      <section className="card">
        <div className="card-head"><h2>基础资料</h2><span className="link">年龄、体重、腰围自动计算，无需手填</span></div>
        <div style={{ overflow: 'auto' }}>
          <table className="tbl">
            <thead><tr><th style={{ width: '38%' }}>项目</th><th>内容</th><th style={{ width: 90, textAlign: 'right' }}>操作</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.k}>
                  <td style={{ color: 'var(--ink-4)', fontSize: 12 }}>{r.k}{r.required ? <span style={{ color: 'var(--pine-600)' }}> ★</span> : null}{r.src === 'auto' ? <span className="chip chip-sm" style={{ marginLeft: 6 }}>自动</span> : r.src === 'edited' ? <span className="chip chip-sm" style={{ marginLeft: 6 }}>已修改</span> : null}</td>
                  <td>{editField === r.k ? (
                    <input autoFocus value={fieldVal} onChange={(e) => setFieldVal(e.target.value)} style={{ width: '100%' }} />
                  ) : <span style={{ color: r.ok ? 'var(--ink-2)' : 'var(--ink-5)' }}>{r.v || '待填'}</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    {r.src === 'auto' ? <span style={{ fontSize: 11, color: 'var(--ink-5)' }}>自动</span>
                      : editField === r.k ? (
                        <span style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn-plain" type="button" disabled={saving} onClick={() => void saveField(r.k, fieldVal)}>保存</button>
                          <button className="btn-plain" type="button" onClick={() => setEditField(null)}>取消</button>
                        </span>
                      ) : <button className="link-btn" type="button" onClick={() => { setEditField(r.k); setFieldVal(ov[r.k] || ''); }}>编辑</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>空白代表未记录，不等于没有症状、没有过敏或数值为 0。带 ★ 为必填项。</p>
      </section>

      <section className="card">
        <div className="card-head"><h2>过敏 · 家族史 · 手术住院</h2><span className="link">就医与急救必读</span></div>

        <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
          <button className="btn btn-mini" type="button" onClick={() => { setAddKind('allergy'); setHistDraft({}); }}><Icon name="plus" />过敏</button>
          <button className="btn btn-mini" type="button" onClick={() => { setAddKind('family'); setHistDraft({}); }}><Icon name="plus" />家族史</button>
          <button className="btn btn-mini" type="button" onClick={() => { setAddKind('surgery'); setHistDraft({}); }}><Icon name="plus" />手术</button>
        </div>

        {addKind && (
          <div className="card" style={{ background: 'var(--bg-sunken)', padding: 'var(--sp-3)', marginBottom: 12 }}>
            <div className="form-grid">
              {addKind === 'allergy' && <>
                <label className="field"><span>过敏原</span><input value={histDraft.name || ''} onChange={(e) => setHistDraft((d) => ({ ...d, name: e.target.value }))} /></label>
                <label className="field"><span>类别</span><input value={histDraft.category || ''} onChange={(e) => setHistDraft((d) => ({ ...d, category: e.target.value }))} /></label>
                <label className="field"><span>程度</span><select value={histDraft.severity || ''} onChange={(e) => setHistDraft((d) => ({ ...d, severity: e.target.value }))}><option value="">未标</option>{Object.entries(SEVERITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="field"><span>反应</span><input value={histDraft.reaction || ''} onChange={(e) => setHistDraft((d) => ({ ...d, reaction: e.target.value }))} /></label>
              </>}
              {addKind === 'family' && <>
                <label className="field"><span>亲属</span><input value={histDraft.relation || ''} onChange={(e) => setHistDraft((d) => ({ ...d, relation: e.target.value }))} /></label>
                <label className="field"><span>疾病 / 状况</span><input value={histDraft.condition || ''} onChange={(e) => setHistDraft((d) => ({ ...d, condition: e.target.value }))} /></label>
                <label className="field"><span>备注</span><input value={histDraft.note || ''} onChange={(e) => setHistDraft((d) => ({ ...d, note: e.target.value }))} /></label>
              </>}
              {addKind === 'surgery' && <>
                <label className="field"><span>日期</span><input type="date" value={histDraft.date || ''} onChange={(e) => setHistDraft((d) => ({ ...d, date: e.target.value }))} /></label>
                <label className="field"><span>手术 / 住院</span><input value={histDraft.name2 || ''} onChange={(e) => setHistDraft((d) => ({ ...d, name2: e.target.value }))} /></label>
                <label className="field"><span>医院</span><input value={histDraft.hospital || ''} onChange={(e) => setHistDraft((d) => ({ ...d, hospital: e.target.value }))} /></label>
                <label className="field"><span>备注</span><input value={histDraft.note || ''} onChange={(e) => setHistDraft((d) => ({ ...d, note: e.target.value }))} /></label>
              </>}
            </div>
            <div className="form-actions"><button className="btn btn-primary" type="button" disabled={saving} onClick={() => void addHist()}>保存</button><button className="btn btn-secondary" type="button" onClick={() => setAddKind('')}>取消</button></div>
          </div>
        )}

        <p className="block-label" style={{ fontSize: 12, color: 'var(--ink-4)' }}>过敏史</p>
        {allergies.length === 0 ? <p className="hint">未记录过敏史；未记录不等于没有过敏，请据实补充。</p> : (
          <table className="tbl"><thead><tr><th>过敏原</th><th>类别</th><th>反应 / 程度</th><th></th></tr></thead><tbody>
            {allergies.map((a: any) => (
              <tr key={a.id}><td style={{ color: a.severity === 'critical' ? '#B4553F' : undefined, fontWeight: 600 }}>{a.name}</td><td>{a.category || '—'}</td><td>{[SEVERITY[a.severity], a.reaction].filter(Boolean).join('；') || '—'}</td><td style={{ textAlign: 'right' }}><button className="btn-plain" type="button" style={{ color: '#B4553F' }} onClick={() => void delHist('allergy', a.id)}>删除</button></td></tr>
            ))}
          </tbody></table>
        )}

        <div className="divider" style={{ borderTop: '1px solid var(--line-soft)', margin: '14px 0' }} />
        <p className="block-label" style={{ fontSize: 12, color: 'var(--ink-4)' }}>家族史</p>
        {family.length === 0 ? <p className="hint">未记录家族史。</p> : (
          <table className="tbl"><thead><tr><th>亲属</th><th>疾病 / 状况</th><th>备注</th><th></th></tr></thead><tbody>
            {family.map((f: any) => (<tr key={f.id}><td>{f.relation || '—'}</td><td>{f.condition || '—'}</td><td>{f.note || '—'}</td><td style={{ textAlign: 'right' }}><button className="btn-plain" type="button" style={{ color: '#B4553F' }} onClick={() => void delHist('family', f.id)}>删除</button></td></tr>))}
          </tbody></table>
        )}

        <div className="divider" style={{ borderTop: '1px solid var(--line-soft)', margin: '14px 0' }} />
        <p className="block-label" style={{ fontSize: 12, color: 'var(--ink-4)' }}>手术 / 住院史</p>
        {surgeries.length === 0 ? <p className="hint">未记录手术 / 住院史。</p> : (
          <table className="tbl"><thead><tr><th>日期</th><th>手术 / 住院</th><th>医院</th><th></th></tr></thead><tbody>
            {surgeries.map((s: any) => (<tr key={s.id}><td className="date">{s.date || '—'}</td><td>{s.name || '—'}</td><td>{s.hospital || '—'}</td><td style={{ textAlign: 'right' }}><button className="btn-plain" type="button" style={{ color: '#B4553F' }} onClick={() => void delHist('surgery', s.id)}>删除</button></td></tr>))}
          </tbody></table>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h2>数据存储</h2><span className="link">本机数据库已连接</span></div>
        <div className="store-stat" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 'var(--sp-3)', margin: '8px 0 16px' }}>
          <div><b style={{ fontSize: 'var(--fs-display)' }}>{labs.length}</b><span style={{ display: 'block', color: 'var(--ink-4)', fontSize: 12 }}>条检验记录</span></div>
          <div><b style={{ fontSize: 'var(--fs-display)' }}>{weights.length}</b><span style={{ display: 'block', color: 'var(--ink-4)', fontSize: 12 }}>条体重 / 围度</span></div>
          <div><b style={{ fontSize: 'var(--fs-display)' }}>{reports.length} 份</b><span style={{ display: 'block', color: 'var(--ink-4)', fontSize: 12 }}>报告原件</span></div>
          <div><b style={{ fontSize: 'var(--fs-display)' }}>{medications.length}</b><span style={{ display: 'block', color: 'var(--ink-4)', fontSize: 12 }}>条用药</span></div>
        </div>
        <div className="notice"><Icon name="info" /><p>记录存在本机数据库 <code>data/health.db</code>，报告照片存成真实文件。不经过任何网络。备份：导出 JSON，或直接拷走 <code>data/</code> 目录。</p></div>
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" type="button" onClick={doExport}><Icon name="download" />导出完整备份</button>
          <label className="btn btn-ghost"><Icon name="upload" />导入数据<input ref={(el) => { fileRef.current = el; }} type="file" accept="application/json,.json" hidden onChange={(e) => void doImport(e)} /></label>
        </div>
        {importMsg ? <p className="hint" style={{ marginTop: 8 }}>{importMsg}</p> : <p className="hint" style={{ marginTop: 10 }}>导出的 JSON 含报告照片，可换一台机器用「导入数据」恢复。</p>}
      </section>
    </div>
  );
}
