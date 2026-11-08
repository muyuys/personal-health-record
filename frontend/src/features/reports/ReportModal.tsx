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
  const [ocr, setOcr] = useState<{ idx: number; busy: boolean; lines: string[]; err: string } | null>(null);

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
