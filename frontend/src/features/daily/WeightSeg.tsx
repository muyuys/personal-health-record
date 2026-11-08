// 日常健康 · 体重与饮食段（复刻旧 renderWeight / slImWeightHTML，js/app.views.body.js:331）。
// 内层三 tab：体重 / 饮食 / 复盘。体重段含：最近记录摘要、体重趋势、身体围度、身体成分、记录明细、称重规则、当前计划、两套口径说明。
import { useEffect, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { api } from '../../api/client';
import { ARCHIVE } from '../../lib/archive';
import type { Weight } from '../../api/types';
import { TrendChart } from './TrendChart';
import { DietSeg } from './DietSeg';
import { WeekSeg } from './WeekSeg';

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = (v: number | null | undefined, dec = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(dec);

type InnerSeg = 'weight' | 'diet' | 'review';
const INNER = [
  { k: 'weight', label: '体重' },
  { k: 'diet', label: '饮食' },
  { k: 'review', label: '复盘' },
] as const;

function weightList(ws: Weight[]): Weight[] {
  return ws.slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
}
function morningSeries(ws: Weight[]) {
  const m = new Map<string, number[]>();
  weightList(ws)
    .filter((w) => w.tag === 'morning' && Number.isFinite(w.kg as number))
    .forEach((w) => {
      const arr = m.get(w.date) || [];
      arr.push(w.kg as number);
      m.set(w.date, arr);
    });
  return Array.from(m.entries())
    .map(([date, arr]) => ({ date, kg: arr.reduce((s, x) => s + x, 0) / arr.length }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function WeightSeg() {
  const { data, reload } = useStore();
  const { setHead } = useHead();
  const [inner, setInner] = useState<InnerSeg>('weight');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ date: today(), kg: '', tag: 'morning', waist: '', note: '' });
  const [saving, setSaving] = useState(false);

  const ws = data?.weights ?? [];
  const list = weightList(ws);
  const cur = list.length ? list[list.length - 1] : null;

  useEffect(() => {
    const label = INNER.find((s) => s.k === inner)?.label || '';
    setHead({
      eyebrow: '当前档案 · 我的档案',
      title: '减重',
      sub: '体重管理统一入口　·　体重记录与饮食合并为一个主题　·　当前：' + label,
      actions: (
        <>
          {inner === 'weight' && (
            <>
              <button className="btn btn-primary" type="button" onClick={() => setAdding(true)}>
                <Icon name="plus" />
                记录体重
              </button>
              <button className="btn" type="button" onClick={() => setInner('diet')}>
                <Icon name="plus" />
                记录今天
              </button>
            </>
          )}
          {inner === 'diet' && (
            <button className="btn btn-primary" type="button" onClick={() => setInner('diet')}>
              <Icon name="plus" />
              记录今天
            </button>
          )}
          {inner === 'review' && (
            <button className="btn btn-primary" type="button" onClick={() => setInner('review')}>
              <Icon name="plus" />
              写周复盘
            </button>
          )}
        </>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inner]);

  const saveWeights = async (next: Weight[]) => {
    setSaving(true);
    try {
      await api.putState({ weights: next, done: data?.done ?? {}, body: data?.body ?? [] });
      await reload();
    } finally {
      setSaving(false);
    }
  };
  const addWeight = async () => {
    const kg = parseFloat(draft.kg);
    if (!Number.isFinite(kg)) return;
    const rec: Weight = {
      id: uid(), date: draft.date, kg, tag: draft.tag,
      waist: draft.waist ? parseFloat(draft.waist) : null, note: draft.note,
      bodyFat: null, muscle: null, bmi: null, visceralFat: null, bmr: null, bone: null,
    };
    await saveWeights([...ws, rec]);
    setDraft({ date: today(), kg: '', tag: 'morning', waist: '', note: '' });
    setAdding(false);
  };
  const delWeight = async (id: string) => {
    await saveWeights(ws.filter((w) => w.id !== id));
  };

  return (
    <div className="stack">
      <div className="filter-row" style={{ marginBottom: 4 }}>
        {INNER.map((s) => (
          <button
            key={s.k}
            type="button"
            className={'filter-chip' + (s.k === inner ? ' on' : '')}
            onClick={() => setInner(s.k)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {inner === 'diet' && <DietSeg />}
      {inner === 'review' && <WeekSeg />}
      {inner === 'weight' && (
        <WeightBody
          list={list}
          cur={cur}
          data={data}
          adding={adding}
          setAdding={setAdding}
          draft={draft}
          setDraft={setDraft}
          saving={saving}
          addWeight={addWeight}
          delWeight={delWeight}
        />
      )}
    </div>
  );
}

function WeightBody({
  list, cur, data, adding, setAdding, draft, setDraft, saving, addWeight, delWeight,
}: {
  list: Weight[];
  cur: Weight | null;
  data: NonNullable<ReturnType<typeof useStore>['data']> | null;
  adding: boolean;
  setAdding: (b: boolean) => void;
  draft: { date: string; kg: string; tag: string; waist: string; note: string };
  setDraft: (fn: (d: typeof draft) => typeof draft) => void;
  saving: boolean;
  addWeight: () => Promise<void>;
  delWeight: (id: string) => Promise<void>;
}) {
  const mSeries = morningSeries(data?.weights ?? []);
  const bl = mSeries.length >= 7
    ? { ok: true, kg: mSeries.slice(-7).reduce((s, x) => s + x.kg, 0) / 7, days: mSeries.length, need: 0 }
    : { ok: false, kg: null as number | null, days: mSeries.length, need: 7 - mSeries.length };
  const target = Number.isFinite(ARCHIVE.weight?.target as number) ? (ARCHIVE.weight!.target as number) : null;
  const prev = list.length > 1 ? list[list.length - 2] : null;
  const diff = cur && prev ? (cur.kg as number) - (prev.kg as number) : null;
  const since7 = list.filter((w) => Date.now() - Date.parse(w.date + 'T00:00:00') <= 7 * 864e5);
  const condLabel = (tag: string) => (tag === 'morning' ? '晨重' : tag === 'device' ? '设备测量' : tag === 'reported' ? '自报' : '其他时段');

  return (
    <>
      {/* 最近记录摘要 */}
      <section className="card">
        <div className="card-head">
          <h2>最近记录</h2>
          <span className="link">{cur ? `${cur.date}　·　${condLabel(cur.tag)}` : '还没有记录'}</span>
        </div>
        {cur ? (
          <div className="stats-bar">
            <div className="stats-cell"><small>最近体重</small><b>{num(cur.kg)} kg</b></div>
            <div className="stats-cell"><small>较上次</small><b>{diff === null ? '—' : (diff > 0 ? '+' : '') + diff.toFixed(1) + ' kg'}</b>{diff !== null && prev && <i>{prev.date}</i>}</div>
            <div className="stats-cell"><small>7 天晨重均值</small><b>{bl.ok ? `${num(bl.kg as number)} kg` : '—'}</b>{!bl.ok && <i>{bl.days ? `记录中 · 还需 ${bl.need} 天` : '未建立'}</i>}</div>
            <div className="stats-cell"><small>近 7 天</small><b>{since7.length} 次</b></div>
          </div>
        ) : (
          <p className="hint" style={{ margin: 0 }}>还没有称重记录。记下第一次体重后，这里会显示最近一条与趋势。</p>
        )}
      </section>

      {/* 记录体重表单 */}
      {adding && (
        <section className="card">
          <div className="card-head"><h2>记录体重</h2></div>
          <div className="form-grid">
            <label className="field"><span>日期 *</span><input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} /></label>
            <label className="field"><span>体重 (kg)</span><input type="number" step="0.1" value={draft.kg} placeholder="如 62.5" onChange={(e) => setDraft((d) => ({ ...d, kg: e.target.value }))} /></label>
            <label className="field"><span>时段</span>
              <select value={draft.tag} onChange={(e) => setDraft((d) => ({ ...d, tag: e.target.value }))}>
                <option value="morning">晨重</option><option value="device">设备测量</option><option value="reported">自报</option><option value="other">其他时段</option>
              </select>
            </label>
            <label className="field"><span>腰围 (cm)</span><input type="number" step="0.1" value={draft.waist} onChange={(e) => setDraft((d) => ({ ...d, waist: e.target.value }))} /></label>
            <label className="field wide"><span>备注</span><input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} /></label>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="button" disabled={saving} onClick={() => void addWeight()}>{saving ? '保存中…' : '保存'}</button>
            <button className="btn btn-secondary" type="button" onClick={() => setAdding(false)}>取消</button>
          </div>
        </section>
      )}

      {/* 体重趋势 */}
      <section className="card chart-card">
        <div className="chart-head">
          <div className="chart-title">
            <h2>体重趋势</h2>
            <p>{list.length ? `共 ${list.length} 条记录 / ${new Set(list.map((w) => w.date)).size} 天　·　${target === null ? '未设长期目标' : '虚线为长期目标 ' + target.toFixed(1) + ' kg'}` : '还没有称重记录，记两次以上才画得出趋势'}</p>
          </div>
          <span className={'chip chip-sm ' + (bl.ok ? 'green' : 'amber')}>{bl.ok ? '已建立晨重基线' : '基线待建立'}</span>
        </div>
        <div className="chart-box">
          <TrendChart
            points={list.filter((w) => Number.isFinite(w.kg as number)).map((w) => ({ date: w.date, value: w.kg as number }))}
            target={target}
            unit="kg"
            emptyText="还没有称重记录。点右上角「记录体重」记第一次，之后每天一条就能看出趋势。"
          />
        </div>
      </section>

      {/* 记录明细 */}
      <details className="detail-fold">
        <summary className="df-sum">
          <span className="df-title"><span className="df-chev" aria-hidden="true" />记录明细</span>
          <span className="df-count">{list.length} 条</span>
          <span className="df-hint">展开查看</span>
        </summary>
        <div className="df-body">
          {list.length === 0 ? <p className="hint">还没有称重记录。</p> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>日期</th><th>体重</th><th>条件</th><th>腰围</th><th>备注</th><th /></tr></thead>
                <tbody>
                  {list.slice().reverse().map((w) => (
                    <tr key={w.id}>
                      <td className="date">{w.date}</td>
                      <td className="num">{num(w.kg)}<span style={{ color: 'var(--ink-5)', fontSize: 9 }}> kg</span></td>
                      <td><span className={'chip chip-sm ' + (w.tag === 'morning' ? 'green' : 'mute')}>{condLabel(w.tag)}</span></td>
                      <td>{w.waist != null ? `${w.waist} cm` : '—'}</td>
                      <td style={{ color: 'var(--ink-4)', fontSize: 10.5 }}>{w.note || '—'}</td>
                      <td className="act"><button className="danger" type="button" onClick={() => void delWeight(w.id)}>删除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>

      {/* 称重与记录规则 / 当前计划 */}
      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>称重与记录规则</h2></div>
          {((ARCHIVE.weight?.rules as string[]) || []).map((r, i) => (
            <div className="task" key={i}><div className="task-body"><p className="task-text" style={{ fontSize: 12 }}>{i + 1}. {r}</p></div></div>
          ))}
        </section>
        <section className="card">
          <div className="card-head"><h2>当前计划</h2><span className="chip amber chip-sm">建议值</span></div>
          <div className="tl-row"><time>摄入</time><p>{ARCHIVE.weight?.kcal || '未记录'}</p></div>
          <div className="tl-row"><time>阶段目标</time><p>{ARCHIVE.weight?.stageTarget || '未设'}</p></div>
          <div className="tl-row"><time>长期目标</time><p>{target === null ? '档案里还没设长期目标' : target.toFixed(1) + ' kg'}</p></div>
          <p className="hint" style={{ marginTop: 10 }}>以上为自行复盘计划，未设置提醒；体重变化需结合实际记录与身体反应调整。</p>
        </section>
      </div>

      {/* 两套体重口径说明 */}
      <details className="detail-fold">
        <summary className="df-sum">
          <span className="df-title"><span className="df-chev" aria-hidden="true" />两套体重口径怎么区分</span>
          <span className="df-hint">只读说明</span>
        </summary>
        <div className="df-body">
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-4)', fontSize: 12.5, lineHeight: 1.9 }}>
            <li><b>每日晨重</b>：减重打卡用的体重，在「饮食」段逐日记录，按统一条件称量（晨起排尿后、进食前、同一台秤），用来看每天的变化与减重趋势。</li>
            <li><b>就诊体重</b>：就诊时测得、随病历记下的体重，记录在本段的记录表里，是病历资料的一部分。</li>
            <li>两套口径的称量场景不同，数值本来就会有差别，所以各自独立记录、不自动合并、也不互相换算。看减重趋势以每日晨重为准；就诊引用体重时，以病历记录为准。</li>
          </ul>
        </div>
      </details>
    </>
  );
}
