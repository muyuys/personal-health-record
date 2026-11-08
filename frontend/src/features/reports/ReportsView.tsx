// 报告档案：列出所有报告（metadata + 原件缩略图），支持新增/删除。
// 图片原件解析（OCR）在批次 6 接入；本批次支持选择图片并保存为 dataURL 原件。
import { useEffect, useRef, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import type { Report } from '../../api/types';

const uid = () => 'rep' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const PANELS = ['生化', '血常规', '尿常规', '肝功能', '肾功能', '血脂', '影像'];
const SPECIMENS = ['血清', '全血', '尿液', '粪便'];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function ReportsView({ go }: { go: (to: string) => void }) {
  const { data, reload } = useStore();
  const { setHead } = useHead();
  const reports = data?.reports ?? [];
  const visits = data?.visits ?? [];
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [draft, setDraft] = useState({ date: '', title: '', hospital: '', panel: '', specimen: '', note: '', visitId: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const [ocr, setOcr] = useState<{ idx: number; busy: boolean; lines: string[]; err: string } | null>(null);

  useEffect(() => {
    setHead({ title: '报告档案', sub: '原件是核心，名称和日期以后可以补' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runOcr = async (idx: number) => {
    const dataUrl = files[idx];
    if (!dataUrl) return;
    setOcr({ idx, busy: true, lines: [], err: '' });
    try {
      const r = await api.ai.parse(dataUrl);
      const lines = (r?.lines || []).map((x: any) => (typeof x === 'string' ? x : x.text)).filter(Boolean);
      setOcr({ idx, busy: false, lines, err: lines.length ? '' : '未识别到文字' });
    } catch (e: any) {
      setOcr({ idx, busy: false, lines: [], err: e?.message || '识别失败' });
    }
  };

  const sorted = reports.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files || []);
    const urls = await Promise.all(fs.map(readFileAsDataUrl));
    setFiles((prev) => [...prev, ...urls]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const save = async () => {
    if (!files.length && !draft.title.trim()) return;
    setSaving(true);
    try {
      const next: Report[] = [...reports];
      for (const dataUrl of (files.length ? files : [''])) {
        next.push({
          id: uid(), date: draft.date, title: draft.title, panel: draft.panel,
          specimen: draft.specimen, hospital: draft.hospital, note: draft.note,
          file: dataUrl, createdAt: Date.now(),
        } as unknown as Report);
      }
      await api.putTable('reports', next);
      await reload();
      setOpen(false); setFiles([]); setDraft({ date: '', title: '', hospital: '', panel: '', specimen: '', note: '', visitId: '' });
    } finally { setSaving(false); }
  };
  const del = async (id: string) => {
    await api.putTable('reports', reports.filter((r) => r.id !== id));
    await reload();
  };

  return (
    <div className="stack">
      <div className="seg-row">
        <span className="page-sub">{reports.length} 份报告</span>
        <div className="seg-tools">
          <button className="btn btn-ghost" type="button" onClick={() => go('records')}>就医记录</button>
          <button className="btn btn-primary" type="button" onClick={() => setOpen((v) => !v)}><Icon name="plus" />存一份报告</button>
        </div>
      </div>

      {open && (
        <section className="card">
          <div className="card-head"><h2>添加原件</h2><span className="hint">拍照或选择图片，支持多选</span></div>
          <div className="form-actions" style={{ marginTop: 0 }}>
            <label className="btn btn-secondary"><Icon name="upload" />选择文件<input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onPick(e)} /></label>
          </div>
          {files.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'var(--sp-4)' }}>
              {files.map((f, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={f} alt="原件" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }} />
                  <button className="icon-btn" type="button" aria-label="移除" style={{ position: 'absolute', top: -6, right: -6, background: 'var(--bg-card)', borderRadius: '50%' }} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}><Icon name="close" /></button>
                  <button className="btn-plain" type="button" style={{ display: 'block', margin: '4px auto 0', fontSize: 12 }} onClick={() => void runOcr(i)}>识别文字</button>
                </div>
              ))}
            </div>
          )}
          {ocr && (
            <div style={{ marginTop: 'var(--sp-4)', padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)' }}>
              {ocr.busy ? <p className="hint" style={{ margin: 0 }}>正在识别（需要多模态模型）…</p> : ocr.err ? <p className="hint" style={{ margin: 0, color: 'var(--st-danger)' }}>{ocr.err}</p> : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <b style={{ fontSize: 13 }}>识别结果 · {ocr.lines.length} 行</b>
                    <button className="btn-plain" type="button" style={{ fontSize: 12 }} onClick={() => setOcr(null)}>关闭</button>
                  </div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 240, overflow: 'auto' }}>{ocr.lines.join('\n')}</pre>
                  <p className="hint" style={{ margin: '6px 0 0' }}>识别结果仅供核对，请确认无误后再录入检验数据。</p>
                </>
              )}
            </div>
          )}
          <div className="form-grid report-fields" style={{ marginTop: 'var(--sp-4)' }}>
            <label className="field"><span>报告日期</span><input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} /><span className="field-hint">留空表示日期待确认，不会用今天代替。</span></label>
            <label className="field"><span>报告名称</span><input maxLength={60} value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="如 肝肾常规，可留空" /></label>
            <label className="field"><span>医院 / 机构</span><input maxLength={60} value={draft.hospital} onChange={(e) => setDraft((d) => ({ ...d, hospital: e.target.value }))} /></label>
            <label className="field"><span>项目组套</span><input list="rpPanels" value={draft.panel} onChange={(e) => setDraft((d) => ({ ...d, panel: e.target.value }))} /><datalist id="rpPanels">{PANELS.map((p) => <option key={p} value={p} />)}</datalist></label>
            <label className="field"><span>检验样本</span><input list="rpSpecimens" value={draft.specimen} onChange={(e) => setDraft((d) => ({ ...d, specimen: e.target.value }))} /><datalist id="rpSpecimens">{SPECIMENS.map((s) => <option key={s} value={s} />)}</datalist></label>
            <label className="field"><span>备注</span><input maxLength={300} value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} /></label>
            <label className="field"><span>关联就诊</span><select value={draft.visitId} onChange={(e) => setDraft((d) => ({ ...d, visitId: e.target.value }))}><option value="">（不关联）</option>{visits.map((v: any) => <option key={v.id} value={v.id}>{v.date} {v.visitType || '就诊'}</option>)}</select></label>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存原件'}</button>
            <button className="btn btn-secondary" type="button" onClick={() => { setOpen(false); setFiles([]); }}>取消</button>
          </div>
        </section>
      )}

      {sorted.length === 0 ? (
        <div className="empty-state">
          <p className="es-title">还没有报告</p>
          <p className="es-desc">存一份报告原件后，可以据此录入检验数据；原件图片会随备份一起导出。</p>
          <div className="es-actions" style={{ justifyContent: 'center' }}><button className="btn btn-primary" type="button" onClick={() => setOpen(true)}><Icon name="plus" />存一份报告</button></div>
        </div>
      ) : (
        <div className="stack">
          {sorted.map((r) => (
            <section className="card" key={r.id}>
              <div className="card-head">
                <h2>{r.title || '未命名报告'}</h2>
                <span className="link">{[r.date || '日期待确认', r.hospital, r.panel].filter(Boolean).join('·')}</span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'flex-start' }}>
                {r.file ? <a href={r.file} target="_blank" rel="noreferrer"><img src={r.file} alt={r.title} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }} /></a> : <div className="hint">（无原件图片）</div>}
                <div style={{ flex: 1 }}>
                  {r.specimen ? <p className="hint" style={{ margin: '0 0 6px' }}>样本：{r.specimen}</p> : null}
                  {r.note ? <p className="hint" style={{ margin: '0 0 6px' }}>备注：{r.note}</p> : null}
                  <button className="btn-plain" type="button" style={{ color: '#B4553F', padding: 0 }} onClick={() => void del(r.id)}>删除</button>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
