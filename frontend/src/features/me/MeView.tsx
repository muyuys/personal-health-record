// 我的：个人资料全页。逐字复刻旧前端 renderProfile（js/app.views.profile.js）
// 视觉与结构，数据派生逻辑对齐 js/app.derive.js 的 completeness / profileFields，
// 保存时间格式对齐 js/app.core.js 的 fmtWhen，数值格式对齐 app.core.js 的 num。
import { useEffect, useMemo, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import { ARCHIVE } from '../../lib/archive';
import type { Weight, SleepLog } from '../../api/types';

// 可编辑基础资料字段（对齐旧 PROFILE_EDITABLE_KEYS）
const EDITABLE = ['姓名／称呼', '出生日期', '生理性别（能量估算用）', '身高', '日常活动', '睡眠与作息', '吸烟／饮酒', '饮食习惯、外卖频率'];

// 必填项 → 对应 profileFields 的 field（对齐旧 PROFILE_REQUIRED）
const REQUIRED_FIELDS = ['姓名／称呼', '出生日期', '腰围', '睡眠与作息', '吸烟／饮酒', '饮食习惯、外卖频率', '药物／食物过敏及反应', '既往手术／住院史', '其他确诊疾病与家族史', '当前全部药物／补充剂'];

// 缺失项短名（对齐旧 SHORT）
const SHORT: Record<string, string> = {
  '姓名／称呼': '姓名', '药物／食物过敏及反应': '过敏史', '饮食习惯、外卖频率': '饮食习惯',
  '既往手术／住院史': '手术史', '其他确诊疾病与家族史': '家族史', '当前全部药物／补充剂': '当前用药',
  '吸烟／饮酒': '吸烟饮酒', '生理性别（能量估算用）': '性别',
};

// 过敏严重程度标签（对齐 ALLERGY_SEVS / severityLabel）
const ALLERGY_SEVS: [string, string][] = [['critical', '危急（曾致严重反应）'], ['high', '较重'], ['mild', '较轻']];
const severityLabel = (sev: string) => (ALLERGY_SEVS.find((s) => s[0] === sev) || ['', ''])[1];

// 缺失项排序优先级（对齐旧 completeness 的 PRIORITY）
const PRIORITY = ['过敏史', '腰围', '睡眠与作息', '肝肾功能', '鼻炎', '脱发', '牙齿 · 甲沟炎 · 脚气', '尿频尿急尿不尽'];

const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad2 = (n: number) => String(n).padStart(2, '0');
// 数值格式对齐 app.core.js 的 num：zh-CN 千分位，默认 1 位小数
const num = (v: number | null | undefined, d = 1) =>
  Number(v).toLocaleString('zh-CN', { maximumFractionDigits: d, minimumFractionDigits: 0 });

function ageFromBirth(s: string): number | null {
  if (!s) return null;
  const m = /(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})/.exec(String(s));
  if (!m) return null;
  const by = +m[1], bm = +m[2], bd = +m[3];
  if (bm < 1 || bm > 12 || bd < 1 || bd > 31) return null;
  const now = new Date();
  let age = now.getFullYear() - by;
  const had = now.getMonth() + 1 > bm || (now.getMonth() + 1 === bm && now.getDate() >= bd);
  if (!had) age -= 1;
  return age >= 0 && age <= 150 ? age : null;
}

// 对齐 fmtWhen：YYYY-MM-DD HH:MM，无值返回「尚未保存」
function fmtWhen(ts: number | null | undefined): string {
  if (!ts) return '尚未保存';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '尚未保存';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

interface PfRow {
  k: string;
  v: string;
  ok: boolean;
  src: string; // 'auto' | 'edited' | 'static' | 'empty'
  srcNote?: string;
  overridden?: boolean;
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
  const body = data?.body ?? [];
  const reports = data?.reports ?? [];
  const medications = data?.medications ?? [];
  const sleepLogs = (data?.sleepLogs ?? []) as SleepLog[];

  const [editKey, setEditKey] = useState<string | null>(null);
  const [fieldVal, setFieldVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [addKind, setAddKind] = useState<'' | 'allergy' | 'family' | 'surgery'>('');
  const [histDraft, setHistDraft] = useState<Record<string, string>>({});

  const doExport = () => { window.location.href = api.exportUrl(); };

  useEffect(() => {
    setHead({
      eyebrow: '',
      title: '个人资料',
      sub: '空白代表未记录，不等于没有',
      actions: (
        <>
          <button className="btn btn-ghost" type="button" onClick={() => go('members')}><Icon name="user" />成员管理</button>
          <button className="btn btn-ghost" type="button" onClick={() => go('settings')}><Icon name="settings" />设置</button>
          <button className="btn btn-ghost" type="button" onClick={doExport}><Icon name="download" />导出备份</button>
        </>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 腰围记录：最近一条有 waist 的 weights（对齐 waistRecord = reverse().find）
  const waistRec = useMemo(() => {
    const list = weights as Weight[];
    for (let i = list.length - 1; i >= 0; i--) {
      const w = list[i];
      if (Number.isFinite(w.waist) && (w.waist as number) > 0) return w;
    }
    return null;
  }, [weights]);

  // 睡眠摘要：近 30 天（对齐 sleepSummary）
  const sleepSum = useMemo(() => {
    const n = 30;
    const cutoff = new Date(Date.now() - n * 86400000);
    const cut = `${cutoff.getFullYear()}-${pad2(cutoff.getMonth() + 1)}-${pad2(cutoff.getDate())}`;
    const recs = sleepLogs.filter((s) => s.date >= cut && (Number.isFinite(s.hours) || Number.isFinite(s.minutes)));
    if (!recs.length) return null;
    let totalH = 0, cnt = 0;
    const bedCount: Record<string, number> = {}, wakeCount: Record<string, number> = {};
    recs.forEach((s) => {
      const h = (Number.isFinite(s.hours) ? (s.hours as number) : 0) + (Number.isFinite(s.minutes) ? (s.minutes as number) / 60 : 0);
      if (h > 0) { totalH += h; cnt++; }
      const b = (s.bedtime || '').split(' ').pop() || '';
      const w = (s.wake || '').split(' ').pop() || '';
      if (/^\d{1,2}:\d{2}$/.test(b)) bedCount[b] = (bedCount[b] || 0) + 1;
      if (/^\d{1,2}:\d{2}$/.test(w)) wakeCount[w] = (wakeCount[w] || 0) + 1;
    });
    const mode = (o: Record<string, number>) => { let best = '', bc = 0; Object.keys(o).forEach((k) => { if (o[k] > bc) { bc = o[k]; best = k; } }); return best; };
    const avgHours = cnt ? Math.round((totalH / cnt) * 10) / 10 : null;
    return { count: recs.length, avgHours, bed: mode(bedCount), wake: mode(wakeCount), span: n };
  }, [sleepLogs]);

  // profileFields：对齐 js/app.derive.js
  const pfs: PfRow[] = useMemo(() => {
    const alg = allergies.length
      ? `已记录 ${allergies.length} 项：${allergies.map((a: any) => `${a.name}${a.severity === 'critical' ? '（危急）' : ''}`).join('、')}`
      : '';
    const sur = surgeries.length ? `已记录 ${surgeries.length} 次：${surgeries.map((s: any) => s.name).join('、')}` : '';
    const fam = family.length ? `已记录 ${family.length} 项：${family.map((f: any) => `${f.relation} ${f.condition}`).join('、')}` : '';
    const actMeds = medications.filter((m: any) => m.status === 'active');
    const med = actMeds.length ? `在服 ${actMeds.length} 项：${actMeds.map((m: any) => m.name).join('、')}` : '';
    const structured: Record<string, string> = {
      '药物／食物过敏及反应': alg,
      '既往手术／住院史': sur,
      '其他确诊疾病与家族史': fam,
      '当前全部药物／补充剂': med,
    };
    const fields = ARCHIVE.profile.fields;
    return fields.map((f): PfRow => {
      if (f.k === '腰围' && waistRec) return { k: f.k, v: `${num(waistRec.waist)} cm（${waistRec.date} 记录）`, ok: true, src: 'auto', srcNote: '围度记录自动更新' };
      if (structured[f.k]) return { k: f.k, v: structured[f.k], ok: true, src: 'auto', srcNote: '结构化记录自动汇总' };
      const o = ov[f.k];
      if (typeof o === 'string' && o.trim()) return { k: f.k, v: o, ok: true, src: 'edited', overridden: true };
      if (f.k === '年龄') {
        const birth = ov['出生日期'] || (ARCHIVE.profile.birth && ARCHIVE.profile.birth !== '未记录' ? ARCHIVE.profile.birth : '');
        const age = ageFromBirth(birth);
        if (age !== null) return { k: f.k, v: `${age} 岁（按出生日期自动计算）`, ok: true, src: 'auto', srcNote: '由出生日期计算' };
      }
      if (f.k === '睡眠与作息' && sleepSum) {
        const parts: string[] = [];
        if (sleepSum.avgHours != null) parts.push(`近${sleepSum.span}天平均 ${sleepSum.avgHours} 小时`);
        if (sleepSum.bed && sleepSum.wake) parts.push(`多 ${sleepSum.bed} 睡 / ${sleepSum.wake} 起`);
        const txt = parts.join('，') + `（${sleepSum.count} 条睡眠记录自动汇总）`;
        return { k: f.k, v: txt, ok: true, src: 'auto', srcNote: '睡眠记录自动汇总' };
      }
      if (f.k === '最近自报体重') {
        const wr = weights.length ? (weights as Weight[]).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] : null;
        if (wr && Number.isFinite(wr.kg)) return { k: f.k, v: `${num(wr.kg)} kg（${wr.date} 记录）`, ok: true, src: 'auto', srcNote: '体重记录自动更新' };
      }
      return { k: f.k, v: f.v, ok: f.ok, src: f.ok ? 'static' : 'empty' };
    });
  }, [allergies, surgeries, family, medications, ov, waistRec, sleepSum, weights]);

  // completeness：对齐 js/app.derive.js
  const comp = useMemo(() => {
    const okP = pfs.filter((f) => f.ok).length;
    const totalP = pfs.length;
    const iss = ARCHIVE.issues || [];
    const okI = iss.filter((i) => !['pending', 'stub'].includes(i.status)).length;
    const totalI = iss.length;
    const pct = Math.round(((totalP ? (okP / totalP) * 0.4 : 0) + (totalI ? (okI / totalI) * 0.4 : 0) + (labs.length ? 0.2 : 0)) * 100);
    const missAll = [
      ...pfs.filter((f) => !f.ok).map((f) => SHORT[f.k] || f.k),
      ...iss.filter((i) => ['pending', 'stub'].includes(i.status)).map((i) => i.name),
    ];
    missAll.sort((a, b) => {
      const ia = PRIORITY.indexOf(a), ib = PRIORITY.indexOf(b);
      const wa = a === '姓名' ? 999 : ia < 0 ? 500 : ia;
      const wb = b === '姓名' ? 999 : ib < 0 ? 500 : ib;
      return wa - wb;
    });
    const missing = missAll.slice(0, 5);
    return { pct, missing, okP, totalP, okI, totalI };
  }, [pfs, labs.length]);

  const pfPending = pfs.filter((f) => !f.ok).length;

  const saveField = async (k: string, val: string) => {
    setSaving(true);
    try {
      const next = { ...ov, [k]: val };
      await api.putState({ weights, done: data?.done ?? {}, profileOverrides: next });
      await reload();
      setEditKey(null);
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

  const histEmpty = (text: string) => <p className="hint" style={{ margin: '2px 0 6px' }}>{text}</p>;
  const histHead = (title: string, kind: 'allergy' | 'family' | 'surgery') => (
    <div className="card-head" style={{ margin: '0 0 8px' }}>
      <h2 style={{ fontSize: 12.5 }}>{title}</h2>
      <button className="btn btn-mini" type="button" onClick={() => { setAddKind(kind); setHistDraft({}); }}><Icon name="plus" />添加</button>
    </div>
  );

  const addForm = addKind ? (
    <div className="card" style={{ background: 'var(--bg-sunken)', padding: 'var(--sp-3)', marginBottom: 12 }}>
      <div className="form-grid">
        {addKind === 'allergy' && <>
          <label className="field"><span>过敏原</span><input value={histDraft.name || ''} onChange={(e) => setHistDraft((d) => ({ ...d, name: e.target.value }))} /></label>
          <label className="field"><span>类别</span><input value={histDraft.category || ''} onChange={(e) => setHistDraft((d) => ({ ...d, category: e.target.value }))} /></label>
          <label className="field"><span>程度</span><select value={histDraft.severity || ''} onChange={(e) => setHistDraft((d) => ({ ...d, severity: e.target.value }))}><option value="">未标</option>{ALLERGY_SEVS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
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
  ) : null;

  return (
    <div className="stack">
      <nav className="profile-shortcuts" aria-label="档案快捷入口"><a href="#/assistant" onClick={(e) => { e.preventDefault(); go('assistant'); }}>AI 问答</a><a href="#/metrics" onClick={(e) => { e.preventDefault(); go('metrics'); }}>指标趋势</a></nav>
      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>基础资料</h2><span className="link" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{comp.okP}/{comp.totalP} 项已填<button className="btn btn-mini" type="button" onClick={() => { setEditKey('姓名／称呼'); setFieldVal(ov['姓名／称呼'] || ''); }}><Icon name="edit" />编辑</button></span></div>
          <p className="hint" style={{ margin: '0 0 8px' }}>共 {pfs.length} 项，其中 {pfPending} 项待填。<b style={{ color: 'var(--ink-2)' }}>年龄、体重、腰围、睡眠</b>会自动从出生日期与健康记录计算，无需手填；其余可点「编辑」修改。带 <span style={{ color: 'var(--pine-2)' }}>★</span> 为必填项。</p>
          <table className="data" style={{ width: '100%' }}>
            <thead><tr><th style={{ width: '38%' }}>项目</th><th>内容</th><th style={{ width: 96, textAlign: 'right' }}>状态</th></tr></thead>
            <tbody>
              {pfs.map((f) => {
                const editable = EDITABLE.includes(f.k);
                const req = REQUIRED_FIELDS.includes(f.k) ? <span style={{ color: 'var(--pine-2)' }} title="必填项">★</span> : null;
                const tag = f.src === 'auto' ? <span className="chip chip-sm" title={f.srcNote || '自动派生'}>自动</span>
                  : f.overridden ? <span className="chip chip-sm">已修改</span> : null;
                let actCell: React.ReactNode;
                if (f.src === 'auto') actCell = <span style={{ color: 'var(--muted-2)', fontSize: 11 }}>自动</span>;
                else if (editable) actCell = <button className="link-btn" type="button" title={`编辑「${f.k}」`} onClick={() => { setEditKey(f.k); setFieldVal(ov[f.k] || ''); }}>编辑</button>;
                else actCell = <span style={{ color: f.ok ? 'var(--muted-2)' : 'var(--muted-3)', fontSize: 11 }}>{f.ok ? '已填' : '待填'}</span>;
                return (
                  <tr key={f.k}>
                    <td style={{ color: 'var(--muted)', fontSize: 11 }}>{f.k}{req}{tag}</td>
                    <td style={{ color: f.ok ? 'var(--ink-2)' : 'var(--muted-3)' }}>
                      {editKey === f.k
                        ? <input autoFocus value={fieldVal} onChange={(e) => setFieldVal(e.target.value)} style={{ width: '100%' }} />
                        : f.v}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {editKey === f.k ? (
                        <span style={{ whiteSpace: 'nowrap' }}>
                          <button className="link-btn" type="button" disabled={saving} onClick={() => void saveField(f.k, fieldVal)}>保存</button>
                          <button className="link-btn" type="button" style={{ marginLeft: 8 }} onClick={() => setEditKey(null)}>取消</button>
                        </span>
                      ) : actCell}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className="card">
          <div className="card-head"><h2>档案完成度</h2><span className={`chip ${comp.pct > 60 ? 'green' : 'amber'} chip-sm`}>{comp.pct}%</span></div>
          <div className="track" style={{ background: '#EDE8DC', height: 8 }}><i style={{ width: `${comp.pct}%`, background: 'var(--pine-2)' }} /></div>
          <div style={{ marginTop: 14 }}>
            <div className="tl-row"><time>基础资料</time><p>{comp.okP} / {comp.totalP} 项已填写</p></div>
            <div className="tl-row"><time>健康主题</time><p>{comp.okI} / {comp.totalI} 个有记录</p></div>
            <div className="tl-row"><time>检验记录</time><p>{labs.length ? `${labs.length} 条结果` : '尚无，录入后计入完整度'}</p></div>
          </div>
          <p className="hint" style={{ margin: '14px 0 10px' }}>仍缺信息</p>
          <div className="band-missing"><div className="chips">{comp.missing.map((m) => <span className="chip" key={m}>{m}</span>)}</div></div>
          <div className="divider" style={{ margin: '16px 0' }} />
          <p className="hint">未记录的项目不会被自动补全，也不从文件名推测。补充后请同步更新对应主题文件。</p>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h2>过敏 · 家族史 · 手术住院</h2><span className="link">就医与急救必读</span></div>
        {addForm}
        <div className="stack" style={{ gap: 16 }}>
          <div>
            {histHead('过敏史', 'allergy')}
            {allergies.length ? (
              <table className="data" style={{ width: '100%' }}><thead><tr><th>过敏原</th><th>类别</th><th>反应 / 程度</th><th></th></tr></thead><tbody>
                {allergies.map((a: any) => (
                  <tr key={a.id}>
                    <td><b style={{ color: a.severity === 'critical' ? '#B4553F' : 'var(--ink-2)' }}>{a.name}</b>{a.severity === 'critical' ? <>{' '}<span className="chip warn chip-sm">危急</span></> : null}</td>
                    <td>{a.category || '—'}</td>
                    <td>{[severityLabel(a.severity), a.reaction].filter(Boolean).join('；') || '—'}</td>
                    <td className="act"><button className="danger" type="button" onClick={() => void delHist('allergy', a.id)}>删除</button></td>
                  </tr>
                ))}
              </tbody></table>
            ) : histEmpty('未记录过敏史；未记录不等于没有过敏，请据实补充。')}
          </div>
          <div className="divider" />
          <div>
            {histHead('家族史', 'family')}
            {family.length ? (
              <table className="data" style={{ width: '100%' }}><thead><tr><th>亲属</th><th>疾病 / 状况</th><th>备注</th><th></th></tr></thead><tbody>
                {family.map((f: any) => (
                  <tr key={f.id}>
                    <td>{f.relation || '—'}</td>
                    <td>{f.condition || '—'}</td>
                    <td style={{ color: 'var(--muted-2)' }}>{f.note || '—'}</td>
                    <td className="act"><button className="danger" type="button" onClick={() => void delHist('family', f.id)}>删除</button></td>
                  </tr>
                ))}
              </tbody></table>
            ) : histEmpty('未记录家族史。')}
          </div>
          <div className="divider" />
          <div>
            {histHead('手术 / 住院史', 'surgery')}
            {surgeries.length ? (
              <table className="data" style={{ width: '100%' }}><thead><tr><th>日期</th><th>手术 / 住院</th><th>医院</th><th></th></tr></thead><tbody>
                {surgeries.map((s: any) => (
                  <tr key={s.id}>
                    <td className="date">{s.date || '—'}</td>
                    <td>{s.name || '—'}{s.note ? <small style={{ color: 'var(--muted-3)', display: 'block' }}>{s.note}</small> : null}</td>
                    <td style={{ color: 'var(--muted-2)' }}>{s.hospital || '—'}</td>
                    <td className="act"><button className="danger" type="button" onClick={() => void delHist('surgery', s.id)}>删除</button></td>
                  </tr>
                ))}
              </tbody></table>
            ) : histEmpty('未记录手术 / 住院史。')}
          </div>
        </div>
      </section>

      <section className="card" id="storage" tabIndex={-1}>
        <div className="card-head"><h2>数据存储</h2><span className="link">本机数据库已连接</span></div>
        <div className="store-stat">
          <div><b>{labs.length}</b><span>条检验记录</span></div>
          <div><b>{weights.length} / {body.length}</b><span>体重 / 围度</span></div>
          <div><b>{reports.length} 份</b><span>报告原件</span></div>
          <div className="w"><b>{fmtWhen(data?.savedAt)}</b><span>最后保存</span></div>
        </div>
        <div className="notice"><Icon name="info" /><p><b>记录存在本机数据库 <code>data/health.db</code>，报告照片存成 <code>data/报告原件/files/</code> 下的真实文件。</b>不经过任何网络，也不占用浏览器那 5 MB 配额。备份：导出 JSON，或直接拷走 <code>data/</code> 目录。</p></div>
        <p className="hint" style={{ margin: '0 0 12px' }}>当前来源：<code>{typeof location !== 'undefined' ? location.origin : 'file://'}</code>。数据只有这一份，换浏览器、清站点数据都不会影响；反过来，删掉 <code>data/health.db</code> 就真的没了。</p>
        <div className="form-actions">
          <button className="btn btn-primary" type="button" onClick={doExport}><Icon name="download" />导出完整备份</button>
          <label className="btn btn-ghost"><Icon name="upload" />导入数据<input ref={(el) => { fileRef.current = el; }} type="file" accept="application/json,.json" hidden onChange={(e) => void doImport(e)} /></label>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>{importMsg || '导出的 JSON 含报告照片，可换一台机器用「导入数据」恢复。'}</p>
      </section>

      <section className="card">
        <div className="card-head"><h2>档案约定</h2></div>
        <ol style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            '日常新增饮食、体重与活动，写入当月减重记录；每周填写一次复盘。',
            '就诊或检查后，保存原件，补一条时间线，再更新问题总表、用药和待办。',
            '日期统一为 YYYY-MM-DD；体重以 kg 为主，可同时写斤（1 kg = 2 斤）；能量统一用 kcal。',
            '明确区分“本人描述”“医院报告”“医生诊断”“辅助分析”“建议计划”。',
            '空白代表未记录，不等于没有症状、没有过敏或数值为 0；历史用药不自动视为当前用药。',
          ].map((t, i) => (
            <li key={i} style={{ fontSize: 11.5, lineHeight: '19px', color: 'var(--muted)' }}><b style={{ color: 'var(--ink-2)' }}>{i + 1}.</b> {t}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
