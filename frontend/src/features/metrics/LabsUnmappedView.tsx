// 未映射指标维护页：把检验里「未识别到标准指标」的项目名归并到某个标准指标，
// 归一后这些记录就能按基准单位并入对应指标的趋势。对应设计文档 D 项。
import { useEffect, useMemo, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';

interface UnmappedItem { name: string; count: number; units: string[]; category: string; }
interface Analyte { id: string; name: string; category: string; baseUnit: string; }

export function LabsUnmappedView({ go }: { go: (to: string) => void }) {
  const { setHead } = useHead();
  const { reload } = useStore();

  const [items, setItems] = useState<UnmappedItem[]>([]);
  const [analytes, setAnalytes] = useState<Analyte[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Record<string, string>>({}); // name -> analyteId
  const [busy, setBusy] = useState<string>('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const [u, a] = await Promise.all([api.labsUnmapped(), api.labsAnalytes()]);
      setItems(u.items);
      setAnalytes(a.analytes);
    } catch (e) {
      setErr(String((e as Error)?.message || e));
    } finally { setLoading(false); }
  };

  useEffect(() => {
    setHead({
      eyebrow: 'LAB STANDARDIZE　指标标准化',
      title: '未映射指标维护',
      sub: '把没有自动识别的检验项目归到标准指标，之后就能按统一单位对比趋势',
      actions: (
        <button className="btn btn-ghost" type="button" onClick={() => go('labs')}><Icon name="file" />返回检验</button>
      ),
    });
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => !needle || it.name.toLowerCase().includes(needle) || it.category.toLowerCase().includes(needle));
  }, [items, q]);

  const doMap = async (name: string, analyteId: string) => {
    if (!analyteId) return;
    setBusy(name); setMsg('');
    try {
      await api.labsMap(name, analyteId);
      setMsg(`已将「${name}」归并到 ${
        analytes.find((a) => a.id === analyteId)?.name || analyteId
      }`);
      await Promise.all([load(), reload()]);
    } catch (e) {
      setMsg(`归并失败：${String((e as Error)?.message || e)}`);
    } finally { setBusy(''); }
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>未识别的检验项目 <small className="hint">{items.length} 种</small></h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索项目名 / 分类" aria-label="搜索未映射项目" />
            <button className="btn btn-ghost" type="button" onClick={() => void load()}>刷新</button>
          </div>
        </div>
        {msg ? <p className="hint" style={{ color: 'var(--pine-700)' }}>{msg}</p> : null}
        {err ? <p className="empty">加载失败：{err}</p> : loading ? <p className="hint">加载中…</p> : !visible.length ? (
          <div className="empty">没有未映射的项目 🎉<br />所有检验项都已归到标准指标，趋势可跨单位统一对比。</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>项目名</th><th>分类</th><th style={{ textAlign: 'right' }}>记录数</th><th>出现单位</th><th style={{ minWidth: 220 }}>归并到标准指标</th><th></th></tr></thead>
              <tbody>
                {visible.map((it) => {
                  const val = pick[it.name] || '';
                  return (
                    <tr key={it.name}>
                      <td className="name-cell">{it.name}</td>
                      <td><span className="cat-tag">{it.category || '—'}</span></td>
                      <td className="num" style={{ textAlign: 'right' }}>{it.count}</td>
                      <td style={{ color: 'var(--muted-2)' }}>{it.units.length ? it.units.join('、') : '—'}</td>
                      <td>
                        <select value={val} onChange={(e) => setPick((p) => ({ ...p, [it.name]: e.target.value }))} aria-label={`为 ${it.name} 选择标准指标`} style={{ maxWidth: 260 }}>
                          <option value="">— 选择标准指标 —</option>
                          {analytes.map((a) => <option key={a.id} value={a.id}>{a.name}{a.baseUnit ? `（${a.baseUnit}）` : ''}</option>)}
                        </select>
                      </td>
                      <td>
                        <button className="btn btn-primary" type="button" disabled={!val || busy === it.name} onClick={() => void doMap(it.name, val)}>
                          {busy === it.name ? '归并中…' : '归并'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint" style={{ marginTop: 10 }}>
          仅像「尿蛋白」「上皮细胞」这类定性项无需归并；归并后原始值/单位不改，趋势里按标准指标基准单位对齐显示。
        </p>
      </section>
    </div>
  );
}
