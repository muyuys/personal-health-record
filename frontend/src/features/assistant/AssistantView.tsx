// AI 健康问答：结合当前档案已保存的记录提问，回答可核对来源。
// 复用旧后端的 /api/ai/* 端点；回答用全局 MD 渲染（public/assets/markdown.js）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { api } from '../../api/client';

declare global {
  interface Window { MD?: { render: (s: string) => string; escape: (s: string) => string } }
}

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
const pad = (n: number) => String(n).padStart(2, '0');
const clock = (at?: number) => { const d = new Date(Number(at) || Date.now()); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const shortModel = (id: string) => String(id || '选择模型').split('/').pop()!.replace(/^glm-/i, 'GLM ').replace(/^gpt-/i, 'GPT ').replace(/^deepseek-/i, 'DeepSeek ').replace(/-flash$/i, ' Flash');
const AI_SOURCE_KINDS: Record<string, string> = { labs: '检验', reports: '报告', visits: '就诊', medications: '用药', allergies: '过敏', familyHistory: '家族史', surgeries: '手术', vitals: '体征', symptoms: '症状', weights: '体重', sleepLogs: '睡眠', dietDays: '饮食', todoItems: '待办', profile: '个人资料', document: '文档' };
const SUGGESTIONS = ['这个档案里有哪些数据？', '最近有哪些检验结果需要核对？', '帮我整理下次复诊需要带的资料。'];

function mdRender(s: string): string {
  if (window.MD?.render) return window.MD.render(s || '');
  return `<p>${esc(s || '')}</p>`;
}

interface Msg { id?: string; question: string; answer: string; sources?: any[]; model?: string; createdAt?: number }

export function AssistantView({ go }: { go: (to: string) => void }) {
  const { setHead } = useHead();
  const [status, setStatus] = useState<any>(null);
  const [models, setModels] = useState<any[]>([]);
  const [model, setModel] = useState('');
  const [refs, setRefs] = useState<any[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [picked, setPicked] = useState<{ kind: string; id: string; label: string; date: string }[]>([]);
  const [showSlash, setShowSlash] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHead({ title: 'AI 健康问答', sub: '结合已保存的健康记录整理信息，回答可核对来源', actions: <button className="btn btn-ghost" type="button" onClick={() => go('settings')}>连接设置</button> });
    void (async () => {
      try {
        const [st, hist, cat, rf] = await Promise.all([
          api.ai.status(), api.ai.history(), api.ai.models(),
          api.ai.refs().catch(() => ({ refs: [] })),
        ]);
        setStatus(st);
        setModels(cat?.models || []);
        setModel((cat?.models || []).some((m: any) => m.id === st.model) ? st.model : (cat?.models?.[0]?.id || st.model));
        setRefs(rf.refs || []);
        setMessages(hist.messages || []);
      } catch (e: any) { setNotice(e?.message || '读取问答失败'); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy]);

  const configured = !!status?.configured;
  const isCommand = (t: string) => /^\/\s*(reset|clear|清空)\s*$/i.test(t.trim());

  const slashItems = useMemo(() => {
    const term = ''; // 简化：展示全部指令 + 引用
    const items: any[] = [{ type: 'cmd', name: 'reset', title: '/reset', hint: '清空问答记录' }];
    refs.forEach((r) => items.push({ type: 'ref', ref: r, title: [r.date, r.label].filter(Boolean).join(' · ') || '未命名记录', hint: [AI_SOURCE_KINDS[r.kind] || '记录', r.meta].filter(Boolean).join(' · ') }));
    return items.filter((i) => !term || JSON.stringify(i).toLowerCase().includes(term));
  }, [refs]);

  const doReset = async () => {
    setBusy(true);
    try {
      const r = await api.ai.reset();
      setMessages([]);
      setPicked([]);
      setNotice(`已清空 ${r.removed || 0} 条问答记录`);
    } catch (e: any) { setNotice(e?.message || '清空失败'); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    const q = question.trim();
    if (!q || busy) return;
    if (isCommand(q)) { setQuestion(''); await doReset(); return; }
    if (!configured) { setNotice('请先在连接设置中配置模型'); return; }
    setBusy(true); setNotice('');
    const refsPayload = picked.map((p) => ({ kind: p.kind, id: p.id }));
    setQuestion(''); setShowSlash(false);
    try {
      const result = await api.ai.chat({ question: q, model, refs: refsPayload });
      setMessages((prev) => [...prev, result]);
      setPicked([]);
      setNotice('回答已保存');
    } catch (e: any) {
      setNotice(e?.message || '提问失败');
      setQuestion(q);
    } finally { setBusy(false); }
  };

  const onInput = (v: string) => {
    setQuestion(v);
    const last = v.split(/[\s\n]/).pop() || '';
    setShowSlash(v.includes('/') && last.startsWith('/'));
  };
  const addRef = (r: any) => {
    if (!picked.some((p) => p.kind === r.kind && p.id === r.id)) setPicked((prev) => [...prev, { kind: r.kind, id: r.id, label: r.label, date: r.date }]);
    // 移除触发用的 /xxx
    setQuestion((q) => q.replace(/\/[^\s]*$/, ' ').replace(/\s+$/, ' ') );
    setShowSlash(false);
  };
  const removeRef = (i: number) => setPicked((prev) => prev.filter((_, j) => j !== i));

  return (
    <div className="ai-page">
      <div className="ai-layout" style={{ display: 'block' }}>
        <section className="ai-conversation" aria-label="健康问答">
          <div id="aiMessages" ref={listRef} style={{ paddingBottom: 56 }}>
            {messages.length === 0 && !busy ? (
              <div className="ai-empty">
                <h2>从一条健康记录开始</h2>
                <p>问题里带上日期、指标或报告名称，回答会更准。</p>
                <div className="ai-suggest">{SUGGESTIONS.map((s) => <button key={s} className="ai-suggest-item" type="button" onClick={() => setQuestion(s)}>{s}</button>)}</div>
                <p className="ai-empty-hint">输入 <code>/</code> 可以挑选指令，或引用某份报告、就诊记录；对话变长后用 <code>/reset</code> 清空问答记录。</p>
              </div>
            ) : messages.map((m, i) => (
              <article className="ai-message" key={m.id || i}>
                <div className="ai-turn-user"><p className="ai-bubble">{m.question}</p></div>
                <div className="ai-turn-ai">
                  {m.model ? <p className="ai-turn-meta">{shortModel(m.model)}</p> : null}
                  <div className="ai-answer" dangerouslySetInnerHTML={{ __html: mdRender(m.answer) }} />
                  {m.sources && m.sources.length ? (
                    <details className="ai-evidence"><summary><span>检索来源 · {m.sources.length} 条</span></summary>
                      <ol className="ai-source-list">{m.sources.map((s: any, j: number) => (
                        <li className="ai-source" key={j}>
                          <div className="ai-source-head"><span className="ai-source-title">{esc([s.date, s.label].filter(Boolean).join(' · ') || '未标注日期')}</span><span className="ai-source-kind">{esc(AI_SOURCE_KINDS[s.kind] || s.kind || '记录')}</span></div>
                        </li>
                      ))}</ol>
                    </details>
                  ) : <p className="ai-evidence-empty">本次未检索到可引用的记录。</p>}
                  <div className="ai-turn-foot"><span style={{ fontSize: 12, color: 'var(--ink-5)' }}>{clock(m.createdAt)}</span></div>
                </div>
              </article>
            ))}
            {busy ? <article className="ai-message is-pending"><div className="ai-turn-ai"><p className="ai-typing" role="status"><span>正在检索记录并整理…</span></p></div></article> : null}
          </div>
        </section>
      </div>

      <div className="ai-composer">
        <form id="aiForm" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <label className="ai-compose-label" htmlFor="aiQuestion">向当前档案提问</label>
          {picked.length > 0 && (
            <div id="aiRefs" className="ai-refs">
              {picked.map((p, i) => (
                <span className="ai-ref-chip" key={i}><span className="ai-ref-kind">{AI_SOURCE_KINDS[p.kind] || '记录'}</span><span className="ai-ref-text">{[p.date, p.label].filter(Boolean).join(' · ')}</span><button className="ai-ref-remove" type="button" aria-label="移除引用" onClick={() => removeRef(i)}><Icon name="close" /></button></span>
              ))}
            </div>
          )}
          <textarea id="aiQuestion" value={question} onChange={(e) => onInput(e.target.value)} rows={3} maxLength={4000} placeholder="例如：整理最近的检查记录，并注明来源（输入 / 选择指令或引用记录）" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && isCommand(question)) { e.preventDefault(); void submit(); } }} />
          {showSlash && (
            <div className="ai-slash" role="listbox" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
              {slashItems.map((it, i) => (
                <button key={i} className="ai-slash-item" type="button" onClick={() => { if (it.type === 'cmd') { setQuestion('/reset'); } else addRef(it.ref); }}>
                  <span className="ai-slash-title">{it.title}</span><span className="ai-slash-hint">{it.hint}</span>
                </button>
              ))}
            </div>
          )}
          <div className="ai-send">
            <div className="ai-send-left">
              <div className="ai-compose-tools">
                <div className="ai-model-picker">
                  <button type="button" className="ai-model-trigger" disabled={!configured || busy} aria-label="选择对话模型" tabIndex={-1}>
                    <span>{shortModel(model)}</span>
                    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" /></svg>
                  </button>
                  <select value={model} onChange={(e) => setModel(e.target.value)} disabled={!configured || busy} aria-label="选择对话模型">
                    {models.map((m: any) => <option key={m.id} value={m.id}>{shortModel(m.id)}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy || (!configured && !isCommand(question))}>{busy ? '正在整理…' : isCommand(question) ? '执行' : '提问'}</button>
          </div>
          <p className="ai-compose-status" role="status">{notice || (configured ? '' : '请先在连接设置中配置模型')}</p>
        </form>
      </div>
    </div>
  );
}
