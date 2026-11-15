// 报告弹窗：复刻老版 js/app.modal.js 的报告查看/编辑（openReport / viewReport）。
// - view 模式：显示报告标题/日期/医院/备注/原件图片 + 关联检验指标链接（点击走 goMetric）。
// - edit 模式：表单（date/title/panel/specimen/hospital/note）+ 图片原件多选上传 + 每图 OCR。
// 保存走 api.putTable('reports', 整表替换)；删除确认后整表移除。
import { useRef, useState } from 'react';
import { Icon } from '../../components/icons';
import { useModal } from '../../components/Modal';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import type { Report, Lab } from '../../api/types';

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

export interface OpenReportModalArgs {
  mode: 'view' | 'edit';
  report?: Report | null;
  onSaved?: () => void;
  onDeleted?: () => void;
  goMetric?: (name: string) => void;
}

/** 命令式打开报告弹窗的 hook 版本：返回 open 函数，需在 ModalProvider 内使用。 */
export function useReportModal() {
  const { openModal, closeModal } = useModal();
  return (args: OpenReportModalArgs) => {
    openModal(<ReportModalBody {...args} close={closeModal} />, 'wide');
  };
}

function ReportModalBody({
  mode,
  report,
  onSaved,
  onDeleted,
  goMetric,
  close,
}: OpenReportModalArgs & { close: () => void }) {
  const [curMode, setCurMode] = useState<'view' | 'edit'>(mode === 'edit' || !report ? 'edit' : 'view');
  const { data, reload } = useStore();
  const reports = data?.reports ?? [];
  const labs = data?.labs ?? [];

  // 编辑态
  const [files, setFiles] = useState<string[]>(report?.file ? [report.file] : []);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    date: report?.date || '',
    title: report?.title || '',
    hospital: report?.hospital || '',
    panel: report?.panel || '',
    specimen: report?.specimen || '',
    note: report?.note || '',
  });
  const fileRef = useRef<HTMLInputElement>(null);
  // 解析结果：原文行 + 结构化检验项（可编辑）+ 报告元信息
  type ParsedLab = { category: string; name: string; value: string; qualitative: string; unit: string; low: string; high: string; flag: string };
  const [ocr, setOcr] = useState<{ idx: number; busy: boolean; lines: string[]; err: string; labs: ParsedLab[]; meta: Record<string, string> } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const runOcr = async (idx: number) => {
    const src = files[idx];
    if (!src) return;
    setImportMsg(null);
    setOcr({ idx, busy: true, lines: [], err: '', labs: [], meta: {} });
    try {
      // 已存原件是 /files/xx 路径，需先取回二进制转成 dataURL 再交给解析接口
      let dataUrl = src;
      if (!src.startsWith('data:')) {
        const res = await fetch(src);
        if (!res.ok) throw new Error('读取报告原件失败（' + res.status + '）');
        const blob = await res.blob();
        dataUrl = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => reject(fr.error);
          fr.readAsDataURL(blob);
        });
      }
      const r = await api.ai.parse(dataUrl);
      const lines = (r?.lines || []).map((x: any) => (typeof x === 'string' ? x : x.text)).filter(Boolean);
      const labs: ParsedLab[] = (r?.labs || []).map((l: any) => ({
        category: String(l.category ?? ''),
        name: String(l.name ?? ''),
        value: l.value == null ? '' : String(l.value),
        qualitative: String(l.qualitative ?? ''),
        unit: String(l.unit ?? ''),
        low: l.low == null ? '' : String(l.low),
        high: l.high == null ? '' : String(l.high),
        flag: String(l.flag ?? ''),
      }));
      const meta: Record<string, string> = r?.meta && typeof r.meta === 'object' ? r.meta : {};
      // 用解析出的元信息补全空白的表单字段（不覆盖用户已填写的）
      setDraft((d) => ({
        date: d.date || meta.date || '',
        title: d.title || meta.title || '',
        hospital: d.hospital || meta.hospital || '',
        panel: d.panel || meta.panel || '',
        specimen: d.specimen || meta.specimen || '',
        note: d.note,
      }));
      setOcr({ idx, busy: false, lines, err: '', labs, meta });
    } catch (e: any) {
      setOcr({ idx, busy: false, lines: [], err: e?.message || '识别失败', labs: [], meta: {} });
    }
  };

  const updateOcrLab = (i: number, field: keyof ParsedLab, val: string) => {
    setOcr((prev) => {
      if (!prev) return prev;
      const labs = prev.labs.slice();
      labs[i] = { ...labs[i], [field]: val };
      return { ...prev, labs };
    });
  };
  const removeOcrLab = (i: number) => {
    setOcr((prev) => (prev ? { ...prev, labs: prev.labs.filter((_, j) => j !== i) } : prev));
  };
  const numOrNull = (s: string): number | null => {
    if (s === '' || s == null) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };

  // 把结构化检验项写入数据库并关联到这份报告（先保存报告拿到 id，再整表追加 labs）
  const importLabs = async () => {
    if (!ocr || !ocr.labs.length) return;
    setImporting(true);
    setImportMsg(null);
    try {
      // 1) 先落报告，拿到 reportId（新建报告时用 uid；编辑时用原 id）
      const reportId = report?.id || uid();
      const draftReport: Report = {
        ...(report || {}),
        id: reportId,
        ...draft,
        file: files[0] || report?.file || '',
        createdAt: report?.createdAt || Date.now(),
      } as Report;
      const withoutThis = reports.filter((r) => r.id !== reportId);
      let nextReports: Report[] = [...withoutThis, draftReport];
      // 多图时其余图片各自成为一份报告（沿用原逻辑）
      for (const f of files.slice(1)) {
        nextReports.push({ id: uid(), ...draft, file: f, createdAt: Date.now() } as unknown as Report);
      }
      await api.putTable('reports', nextReports);

      // 2) 生成 labs 记录，linked to reportId
      const baseDate = draft.date || '';
      const newLabs: Lab[] = ocr.labs
        .filter((l) => l.name.trim())
        .map((l) => ({
          id: 'lab' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          date: baseDate,
          category: l.category.trim(),
          name: l.name.trim(),
          value: numOrNull(l.value),
          unit: l.unit.trim(),
          low: numOrNull(l.low),
          high: numOrNull(l.high),
          qualitative: l.qualitative.trim(),
          flag: ['H', 'L'].includes(l.flag.toUpperCase()) ? l.flag.toUpperCase() : '',
          source: '',
          note: '',
          reportId,
        } as Lab));
      const existingLabs = data?.labs ?? [];
      // 同一报告重解析时先移除旧关联，避免重复
      const keepLabs = existingLabs.filter((l) => l.reportId !== reportId);
      await api.putTable('labs', [...keepLabs, ...newLabs]);
      await reload();
      onSaved?.();
      setImportMsg(`已入库：${newLabs.length} 条检验数据，已关联到报告「${draftReport.title || '未命名'}」。`);
      setOcr(null);
    } catch (e: any) {
      setImportMsg('入库失败：' + (e?.message || '未知错误'));
    } finally {
      setImporting(false);
    }
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = Array.from(e.target.files || []);
    const urls = await Promise.all(fs.map(readFileAsDataUrl));
    setFiles((prev) => [...prev, ...urls]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const save = async () => {
    if (!draft.title.trim() && !files.length) return;
    setSaving(true);
    try {
      let next: Report[];
      if (report) {
        // 编辑已有报告：更新该条（用首张图片作为 file，若有多张则追加为新报告条目）
        const [first, ...rest] = files.length ? files : [''];
        next = reports.map((r) =>
          r.id === report.id
            ? { ...r, ...draft, file: first } as Report
            : r,
        );
        for (const f of rest) {
          next.push({ id: uid(), ...draft, file: f, createdAt: Date.now() } as unknown as Report);
        }
      } else {
        next = [...reports];
        for (const f of (files.length ? files : [''])) {
          next.push({ id: uid(), ...draft, file: f, createdAt: Date.now() } as unknown as Report);
        }
      }
      await api.putTable('reports', next);
      await reload();
      onSaved?.();
      close();
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!report) return;
    if (!window.confirm('删除这份报告？原件图片也会一并移除。')) return;
    await api.putTable('reports', reports.filter((r) => r.id !== report.id));
    await reload();
    onDeleted?.();
    close();
  };

  const linkedLabs: Lab[] = report ? labs.filter((l) => l.reportId === report.id) : [];
  const metricNames = Array.from(new Set(linkedLabs.map((l) => l.name).filter(Boolean)));

  if (curMode === 'view' && report) {
    return (
      <>
        <div className="modal-head">
          <div>
            <h2>{report.title || '未命名报告'}</h2>
            <p>{[report.date || '日期待确认', report.hospital, report.panel, report.specimen].filter(Boolean).join(' · ')}</p>
          </div>
          <button className="modal-close" type="button" aria-label="关闭" onClick={close}><Icon name="close" /></button>
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {report.file ? (
            <a href={report.file} target="_blank" rel="noreferrer">
              <img src={report.file} alt={report.title} style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)' }} />
            </a>
          ) : (
            <div className="hint">（无原件图片）</div>
          )}
          <div style={{ flex: 1, minWidth: 200 }}>
            {report.note ? <p className="hint" style={{ margin: '0 0 8px' }}>备注：{report.note}</p> : null}
            <p style={{ margin: '0 0 6px', fontSize: 13 }}><b>关联检验指标</b></p>
            {metricNames.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>（暂无关联的检验指标）</p>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {metricNames.map((n) => (
                  <button
                    key={n}
                    className="chip chip-sm"
                    type="button"
                    style={{ cursor: 'pointer' }}
                    onClick={() => { close(); goMetric?.(n); }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="form-actions" style={{ marginTop: 'var(--sp-5)' }}>
          <button className="btn btn-primary" type="button" onClick={() => setCurMode('edit')}><Icon name="edit" />编辑</button>
          <button className="btn btn-secondary" type="button" style={{ color: '#B4553F' }} onClick={() => void del()}>删除</button>
          <button className="btn btn-secondary" type="button" onClick={close}>关闭</button>
        </div>
      </>
    );
  }

  // edit 模式
  return (
    <>
      <div className="modal-head">
        <div>
          <h2>{report ? '编辑报告' : '存一份报告'}</h2>
          <p>拍照或选择图片，支持多选；名称和日期以后可以补</p>
        </div>
        <button className="modal-close" type="button" aria-label="关闭" onClick={close}><Icon name="close" /></button>
      </div>

      <div className="form-actions" style={{ marginTop: 0 }}>
        <label className="btn btn-secondary">
          <Icon name="upload" />选择文件
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onPick(e)} />
        </label>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>识别结果 · 检验项 {ocr.labs.length} 条 · 原文 {ocr.lines.length} 行</b>
                <button className="btn-plain" type="button" style={{ fontSize: 12 }} onClick={() => setOcr(null)}>关闭</button>
              </div>
              {ocr.labs.length > 0 ? (
                <>
                  <div className="table-wrap" style={{ maxHeight: 260, overflow: 'auto' }}>
                    <table className="data" style={{ fontSize: 12 }}>
                      <thead><tr><th>项目</th><th>结果</th><th>单位</th><th>参考下限</th><th>参考上限</th><th>提示</th><th /></tr></thead>
                      <tbody>
                        {ocr.labs.map((l, i) => (
                          <tr key={i}>
                            <td><input value={l.name} onChange={(e) => updateOcrLab(i, 'name', e.target.value)} style={{ width: 130 }} /></td>
                            <td>{l.value !== '' || l.qualitative
                              ? <input value={l.value !== '' ? l.value : l.qualitative} onChange={(e) => updateOcrLab(i, l.value !== '' || !l.qualitative ? 'value' : 'qualitative', e.target.value)} style={{ width: 70 }} />
                              : <input value="" onChange={(e) => updateOcrLab(i, 'value', e.target.value)} style={{ width: 70 }} />}</td>
                            <td><input value={l.unit} onChange={(e) => updateOcrLab(i, 'unit', e.target.value)} style={{ width: 56 }} /></td>
                            <td><input value={l.low} onChange={(e) => updateOcrLab(i, 'low', e.target.value)} style={{ width: 56 }} /></td>
                            <td><input value={l.high} onChange={(e) => updateOcrLab(i, 'high', e.target.value)} style={{ width: 56 }} /></td>
                            <td><input value={l.flag} onChange={(e) => updateOcrLab(i, 'flag', e.target.value)} style={{ width: 34 }} /></td>
                            <td className="act"><button className="danger" type="button" onClick={() => removeOcrLab(i)}>移除</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <button className="btn btn-primary" type="button" disabled={importing} onClick={() => void importLabs()}>
                      {importing ? '入库中…' : `确认入库（${ocr.labs.filter((l) => l.name.trim()).length} 条）`}
                    </button>
                    <span className="hint" style={{ margin: 0 }}>入库前请核对数值与参考范围；会一并保存报告信息并关联。</span>
                  </div>
                </>
              ) : (
                <p className="hint" style={{ margin: 0 }}>未识别到结构化检验项。原文见下方，可手动录入。</p>
              )}
              <details style={{ marginTop: 8 }}>
                <summary className="hint" style={{ cursor: 'pointer', margin: 0 }}>查看识别原文（{ocr.lines.length} 行）</summary>
                <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 200, overflow: 'auto' }}>{ocr.lines.join('\n')}</pre>
              </details>
            </>
          )}
        </div>
      )}
      {importMsg && <div className="notice" role="status" style={{ marginTop: 'var(--sp-3)' }}>{importMsg}</div>}

      <div className="form-grid report-fields" style={{ marginTop: 'var(--sp-4)' }}>
        <label className="field"><span>报告日期</span><input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} /><span className="field-hint">留空表示日期待确认，不会用今天代替。</span></label>
        <label className="field"><span>报告名称</span><input maxLength={60} value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="如 肝肾常规，可留空" /></label>
        <label className="field"><span>医院 / 机构</span><input maxLength={60} value={draft.hospital} onChange={(e) => setDraft((d) => ({ ...d, hospital: e.target.value }))} /></label>
        <label className="field"><span>项目组套</span><input list="rpPanelsModal" value={draft.panel} onChange={(e) => setDraft((d) => ({ ...d, panel: e.target.value }))} /><datalist id="rpPanelsModal">{PANELS.map((p) => <option key={p} value={p} />)}</datalist></label>
        <label className="field"><span>检验样本</span><input list="rpSpecimensModal" value={draft.specimen} onChange={(e) => setDraft((d) => ({ ...d, specimen: e.target.value }))} /><datalist id="rpSpecimensModal">{SPECIMENS.map((s) => <option key={s} value={s} />)}</datalist></label>
        <label className="field"><span>备注</span><input maxLength={300} value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} /></label>
      </div>

      <div className="form-actions">
        <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存'}</button>
        {report ? <button className="btn btn-secondary" type="button" style={{ color: '#B4553F' }} onClick={() => void del()}>删除</button> : null}
        <button className="btn btn-secondary" type="button" onClick={() => (report ? setCurMode('view') : close())}>取消</button>
      </div>
    </>
  );
}
