import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../../api/client';
import type { Visit } from '../../api/types';
import { useHead } from '../../components/head';
import { useStore } from '../../store/useStore';
import { Icon } from '../../components/icons';
import { useModal } from '../../components/Modal';
import { useReportModal } from '../reports/ReportModal';
import { useMedModal } from '../meds/MedModal';
import { TodoRow } from '../common/TodoRow';
import type { FlatTodo } from '../../lib/todos';

interface Props {
  id: string;
  onBack: () => void;
  onEdit: (v: Visit) => void;
  go?: (to: string) => void;
}

function fmtWhen(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 就诊分组名，对齐旧 visitGroupName(v) = `就诊 ${v.date}`
function visitGroupName(v: Visit): string {
  return `就诊 ${v.date}`;
}

// 键值行，对齐旧 detailRowHTML（.kv-row / .kv-k / .kv-v）
function KvRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="kv-row">
      <span className="kv-k">{label}</span>
      <span className="kv-v">{value || <span style={{ color: 'var(--ink-4)' }}>未记录</span>}</span>
    </div>
  );
}

// 折叠区，对齐旧 foldHTML
function Fold({ id, title, note, children, open }: { id: string; title: string; note: string; children: ReactNode; open?: boolean }) {
  const [isOpen, setIsOpen] = useState(!!open);
  return (
    <div className="fold">
      <button className="fold-head" type="button" aria-expanded={isOpen} aria-controls={'fold-' + id} onClick={() => setIsOpen((v) => !v)}>
        <span className="fold-title">{title}</span>
        <span className="fold-note">{note}</span>
        <span className="fold-caret"><Icon name="chevron" /></span>
      </button>
      <div className="fold-body" id={'fold-' + id} hidden={!isOpen}>{children}</div>
    </div>
  );
}

export function VisitDetail({ id, onBack, onEdit, go }: Props) {
  const store = useStore();
  const { data } = store;
  const { setHead } = useHead();
  const { closeModal } = useModal();
  const reportModal = useReportModal();
  const medModal = useMedModal();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // 先从 store 里找，找不到再单独拉（逐条 CRUD）
  useEffect(() => {
    const fromStore = (data?.visits || []).find((v) => v.id === id) || null;
    if (fromStore) {
      setVisit(fromStore);
      setLoaded(true);
      return;
    }
    let alive = true;
    setError(null);
    setLoaded(false);
    api
      .getVisit(id)
      .then((v) => alive && (setVisit(v), setLoaded(true)))
      .catch((e) => alive && (setError(e instanceof Error ? e.message : String(e)), setLoaded(true)));
    return () => {
      alive = false;
    };
  }, [id, data?.visits]);

  const v = visit;
  const reports = data?.reports || [];
  const medications = data?.medications || [];
  const todoItems = data?.todoItems || [];
  const labs = data?.labs || [];
  const done = data?.done || {};
  const medsThis = v ? medications.filter((m) => m.visitId === v.id) : [];
  const medsActive = medications.filter((m) => m.status === 'active');
  const todosThis = v ? todoItems.filter((t) => (t.groupName || '') === visitGroupName(v)) : [];
  const rep = v && v.reportId ? reports.find((r) => r.id === v.reportId) || null : null;
  const proFilled = v ? ['doctor', 'chief', 'diagnosis', 'note'].filter((k) => String((v as any)[k] || '').trim()).length : 0;

  // 页头
  useEffect(() => {
    if (!v) {
      setHead({ eyebrow: '', title: '就诊详情', sub: '' });
      return;
    }
    setHead({
      eyebrow: '',
      title: v.hospital || `${v.visitType || ''}就诊记录` || '就诊记录',
      sub: [v.date, v.visitType, v.department].filter(Boolean).join('　·　'),
      actions: (
        <>
          <button className="btn btn-secondary" type="button" onClick={onBack}>← 就医记录</button>
          <button className="btn btn-primary" type="button" onClick={() => onEdit(v)}><Icon name="plus" />编辑记录</button>
        </>
      ),
    });
  }, [v, setHead, onBack, onEdit]);

  if (!v) {
    if (error)
      return (
        <div className="stack">
          <div className="notice notice--danger" role="alert">加载失败：{error}</div>
        </div>
      );
    if (!loaded) return <p className="hint">加载中…</p>;
    return (
      <div className="stack">
        <div className="empty-state">
          <div className="empty-icon"><Icon name="info" /></div>
          <h3>这条记录不在了</h3>
          <p>可能已被删除。回到就医记录可以看其它记录。</p>
          <div className="empty-actions">
            <button className="btn btn-primary" type="button" onClick={onBack}>回到就医记录</button>
          </div>
        </div>
      </div>
    );
  }

  const labCountOf = (reportId: string) => labs.filter((r) => r.reportId === reportId).length;

  const viewReport = () => { if (rep) reportModal({ mode: 'view', report: rep, onSaved: () => void store.reload(), onDeleted: () => void store.reload() }); };
  const addReport = () =>
    reportModal({
      mode: 'edit',
      onSaved: async () => {
        await store.reload();
        // 若该就诊尚无关联报告，把新建的这个挂上（old: 新图片第1份挂到这次就诊）
        const fresh = (store.data?.reports || []);
        const latest = fresh[fresh.length - 1];
        if (!v.reportId && latest) {
          try {
            await api.updateVisit({ ...v, reportId: latest.id });
            await store.reload();
          } catch { /* 忽略 */ }
        }
      },
    });
  const addMed = () => medModal({ mode: 'edit', presetVisitId: v.id, onSaved: () => void store.reload() });
  const del = async () => {
    if (!confirm('确定删除这条就诊记录？')) return;
    try {
      const cur = (store.data?.visits || []).find((x) => x.id === v.id);
      await api.deleteVisit(v.id, cur?.revision ?? 0);
      closeModal();
      await store.reload();
      onBack();
    } catch (e) {
      alert('删除失败：' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const toggleTodo = async (tid: string) => {
    try {
      await api.putState({ done: { ...done, [tid]: !done[tid] } });
      await store.reload();
    } catch (e) {
      alert('更新失败：' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const todoFlat = (t: (typeof todoItems)[number]): FlatTodo => ({
    id: t.id, text: t.text, meta: t.meta, flag: t.flag, followType: t.followType, group: t.groupName || '我新增的待办', dueDate: t.dueDate,
  });

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head"><h2>本次记录</h2></div>
        {String(v.summary || '').trim() ? (
          <p className="rec-text measure" style={{ whiteSpace: 'pre-wrap' }}>{v.summary}</p>
        ) : (
          <>
            <p className="hint">本次没有写记录。</p>
            <div className="form-actions"><button className="btn btn-secondary" type="button" onClick={() => onEdit(v)}>补充记录</button></div>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>关联资料</h2>
          <span className="hint">{rep ? `关联报告 1 份${labCountOf(rep.id) ? ` · ${labCountOf(rep.id)} 项结果` : ''}` : '未添加资料'}</span>
        </div>
        {rep ? (
          <div className="row">
            <button className="rp-thumb" type="button" onClick={viewReport} aria-label="查看原件">
              {rep.file ? <img src={rep.file} alt="" /> : <span>未添加原件</span>}
            </button>
            <div className="row-main">
              <p className="row-title">{rep.title || '未命名报告'}</p>
              <p className="row-sub">{rep.date || '日期未确认'}{rep.hospital ? '　·　' + rep.hospital : ''}</p>
            </div>
            <div className="row-act">
              <button className="btn-plain" type="button" onClick={viewReport}>查看原件</button>
              <button className="btn-plain" type="button" onClick={() => go?.('records')}>替换关联</button>
            </div>
          </div>
        ) : (
          <>
            <p className="hint">未添加资料。</p>
            <div className="form-actions">
              <button className="btn btn-secondary" type="button" onClick={addReport}><Icon name="plus" />添加资料</button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h2>本次就诊用药</h2><span className="hint">这次就诊记录的药。药物可能跨多次就诊持续使用。</span></div>
        {medsThis.length ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {medsThis.map((m) => (
              <div className="row" key={m.id}>
                <div className="row-main">
                  <p className="row-title">{m.name}{m.dose ? `　${m.dose}` : ''}</p>
                  <p className="row-sub">{[m.frequency, m.route].filter(Boolean).join('　·　') || '剂量与频次未记录'}</p>
                </div>
                <div className="row-act"><button className="btn-plain" type="button" onClick={() => medModal({ mode: 'view', med: m, onSaved: () => void store.reload(), onDeleted: () => void store.reload() })}>编辑</button></div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <p className="hint">本次就诊未添加用药。</p>
            <div className="form-actions">
              <button className="btn btn-secondary" type="button" onClick={addMed}><Icon name="plus" />记这次用药</button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h2>当前全部用药</h2></div>
        <p className="hint" style={{ marginBottom: 'var(--sp-3)' }}>在服药物不一定由这次就诊开具，记录就诊不会自动改变药物状态。</p>
        {medsActive.length ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {medsActive.map((m) => (
              <div className="row" key={m.id}>
                <div className="row-main">
                  <p className="row-title">{m.name}{m.dose ? `　${m.dose}` : ''}</p>
                  <p className="row-sub">{[m.frequency, m.route].filter(Boolean).join('　·　') || '剂量与频次未记录'}{m.startDate ? `　·　开始 ${m.startDate}` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="hint">没有状态为「在服」的用药。</p>}
        <div className="form-actions"><button className="btn btn-ghost" type="button" onClick={() => go?.('records')}>查看全部用药 →</button></div>
      </section>

      <section className="card">
        <div className="card-head"><h2>下一步安排</h2></div>
        {todosThis.length ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {todosThis.map((t) => (
              <TodoRow key={t.id} todo={todoFlat(t)} done={!!done[t.id]} onToggle={toggleTodo} />
            ))}
          </div>
        ) : (
          <p className="hint">未添加下一步安排。</p>
        )}
        <div className="form-actions"><button className="btn btn-ghost" type="button" onClick={() => go?.('home')}>查看全部提醒 →</button></div>
        <p className="hint" style={{ marginTop: 'var(--sp-2)' }}>提醒按「{visitGroupName(v)}」分组自动归到这次就诊；同一天两次就诊会共用一个分组。</p>
      </section>

      <section>
        <div className="section-head" style={{ marginTop: 0 }}><h2>详细信息</h2></div>
        <Fold id="visitInfo" title="补充信息" note={proFilled ? `已填 ${proFilled} 项` : '未记录'}>
          <div style={{ paddingTop: 'var(--sp-3)' }}>
            <KvRow label="就诊原因" value={v.chief} />
            <KvRow label="明确诊断" value={v.diagnosis} />
            <KvRow label="医嘱 / 备注" value={v.note} />
            <KvRow label="接诊医生" value={v.doctor} />
            {v.hospital ? <KvRow label="医院" value={v.hospital} /> : null}
            {v.department ? <KvRow label="科室" value={v.department} /> : null}
            {v.visitType ? <KvRow label="就诊类型" value={v.visitType} /> : null}
            <KvRow label="记录时间" value={<span className="ts">{fmtWhen(v.createdAt || Date.now())}</span>} />
          </div>
        </Fold>
      </section>

      <section className="card">
        <div className="card-head"><h2>就诊摘要</h2><span className="hint">给医生看的一页纸，缺项写「未记录」</span></div>
        <div className="form-actions" style={{ marginTop: 0 }}>
          <button className="btn btn-secondary" type="button" onClick={() => go?.('records')}>预览并导出给医生</button>
          <button className="btn btn-danger-ghost" type="button" onClick={del}>删除这条</button>
        </div>
      </section>
    </div>
  );
}
