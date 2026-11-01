/* ==========================================================================
   渲染：新版首页 / 就医记录 / 就诊详情 / 就诊速记 / 存一份报告
   task 026（视觉规范）+ task 027（页面结构与交互规范）

   本文件在 js/app.views.health.js 之后、js/app.modal.js 之前加载，
   与其它模块共享全局作用域（经典脚本，不用 import/export）。

   退役说明：原 renderOverview / renderTimeline / renderVisits / openVisitForm
   已由本文件的 renderHome / renderRecords / renderVisitDetail / renderVisitComposer
   取代，原实现已从 app.views.health.js 与 app.views.profile.js 删除。
   ========================================================================== */

/* ======================= 通用小工具 ======================= */
const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
const DAY_MS = 86400000;

/* 当前 hash 的查询串 / 路径（扁平 hash：#/records?t=visit&q=xx） */
function hashQuery(hash) {
  const h = String(hash || location.hash || '');
  const i = h.indexOf('?');
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : '');
}
function hashPath(hash) {
  return String(hash || location.hash || '').replace(/^#\/?/, '').split('?')[0];
}
function hashOf(path, query) {
  const qs = query instanceof URLSearchParams ? query.toString() : '';
  return '#/' + String(path || '').replace(/^#?\/?/, '') + (qs ? '?' + qs : '');
}
/* 只改 hash 的跳转；地址没变时手动重新渲染一次，避免点同一项没反应 */
function goHash(hash) {
  if (!hash) return;
  if (location.hash === hash) { route(); return; }
  location.hash = hash;
}

function dateParts(iso) {
  const s = String(iso || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { unknown: true, iso: '', year: '', md: '', wd: '' };
  const dt = new Date(s + 'T00:00:00');
  const wd = Number.isNaN(dt.getTime()) ? '' : `周${WEEK_CN[dt.getDay()]}`;
  return {
    unknown: false, iso: s, year: s.slice(0, 4),
    md: s === todayISO() ? '今天' : `${s.slice(5, 7)}-${s.slice(8, 10)}`,
    wd
  };
}
/* 定位行：2026-11-01 · 门诊 · 眼科（未记录的项整段不出现，不补「无」） */
function visitLocateLine(v) {
  return [v.date, v.visitType, v.department].filter(Boolean).join(' · ');
}
/* 记录卡标题：科室 · 医院，都没有时用「就诊记录」 */
function visitCardTitle(v) {
  const t = [v.department, v.hospital].filter(Boolean).join(' · ');
  return t || (v.visitType ? `${v.visitType}记录` : '就诊记录');
}
function visitCardMeta(v) {
  return [v.hospital && v.department ? v.hospital : '', v.doctor ? `医生 ${v.doctor}` : '', '就诊记录']
    .filter(Boolean).join('　·　');
}
/* 就诊详情地址：带上来源地址，返回时能恢复筛选（027 §2.3） */
function visitDetailHref(id) {
  const back = encodeURIComponent(location.hash || '#/records');
  return `#/visit?id=${encodeURIComponent(id)}&back=${back}`;
}
/* 下一步安排与就诊的弱关联口径（027 §5.4）：groupName = 就诊 YYYY-MM-DD */
function visitGroupName(v) { return `就诊 ${v.date}`; }

/* 分段控件（027 §2.4 通用） */
/* 分段控件（026 §4.5）：等宽 grid，不做横滑。≤4 项一律铺满，>4 项才允许换行/横滑。 */
function segHTML(items, active, act, label, fill = false) {
  const cls = fill ? 'seg seg--fill' : 'seg';
  const style = fill ? ` style="grid-template-columns:repeat(${items.length},minmax(0,1fr))"` : '';
  return `<div class="${cls}" role="tablist" aria-label="${esc(label || '筛选')}"${style}>${items.map(([v, text, n]) => `
    <button class="seg-btn${v === active ? ' is-on' : ''}" type="button" role="tab"
      aria-selected="${v === active ? 'true' : 'false'}"
      data-act="${esc(act)}" data-v="${esc(v)}">${esc(text)}${n === undefined || n === null ? '' : `<span class="seg-n">${n}</span>`}</button>`).join('')}</div>`;
}

/* 空态（026 §4.8）：图标 + 标题 + 一句解释 + 一个主按钮，不堆编号步骤 */
function emptyStateHTML({ icon = 'info', title = '', desc = '', actions = '' } = {}) {
  return `<div class="empty-state">
    <div class="es-icon">${I[icon] || I.info}</div>
    ${title ? `<p class="es-title">${esc(title)}</p>` : ''}
    ${desc ? `<p class="es-desc">${desc}</p>` : ''}
    ${actions ? `<div class="es-actions">${actions}</div>` : ''}
  </div>`;
}

/* 折叠区（026 §4.6）：收起不清空、不 disabled，只切 hidden */
function foldHTML(id, title, note, body, open = false) {
  return `<div class="fold">
    <button class="fold-head" type="button" data-act="fold" data-fold="${esc(id)}"
      aria-expanded="${open ? 'true' : 'false'}" aria-controls="fold-${esc(id)}">
      <span class="fold-title">${esc(title)}</span>
      <span class="fold-note" id="foldnote-${esc(id)}">${esc(note)}</span>
      <span class="fold-caret">${I.chevron}</span>
    </button>
    <div class="fold-body" id="fold-${esc(id)}"${open ? '' : ' hidden'}>${body}</div>
  </div>`;
}

/* ======================= 事件流：首页与就医记录共用 ======================= */
/* 无报告归属的检验结果按日期合成一条，避免一张化验单的 30 项占满列表 */
function orphanLabEvents() {
  const byDate = new Map();
  labs.filter(r => !r.reportId).forEach(r => {
    const k = r.date || '';
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k).push(r);
  });
  return Array.from(byDate.entries()).map(([date, rows]) => {
    const bad = rows.filter(isAbnormal).length;
    return {
      id: 'lab-' + date, kind: 'lab', date, createdAt: 0,
      chip: '检验',
      title: rows.length > 1 ? `检验结果 ${rows.length} 项` : (rows[0].name || '检验结果'),
      summary: rows.slice(0, 3).map(r => `${r.name} ${labValueRaw(r)}${r.unit ? ' ' + r.unit : ''}`).join('；')
        + (bad ? `　（${bad} 项超出参考区间）` : ''),
      meta: '检验结果 · 未关联报告',
      href: '#/labs-all'
    };
  });
}

/* 全部可点击的记录统一成 {kind,date,title,summary,meta,href|act} */
function recentStream() {
  const ev = [];
  const push = e => ev.push(Object.assign({
    id: '', kind: '', date: '', createdAt: 0,
    chip: '', title: '', summary: '', meta: '', href: '', act: '', external: false
  }, e));

  visits.forEach(v => push({
    id: v.id, kind: 'visit', date: v.date || '', createdAt: v.createdAt || 0,
    chip: v.visitType || '就诊',
    title: visitCardTitle(v),
    summary: String(v.summary || v.diagnosis || v.chief || '').trim(),
    meta: visitCardMeta(v),
    href: visitDetailHref(v.id)
  }));

  reports.forEach(r => {
    const n = labCountOf(r.id);
    push({
      id: r.id, kind: 'report', date: r.date || '', createdAt: r.createdAt || 0,
      chip: '报告',
      title: r.title || '未命名报告',
      summary: [r.hospital, r.panel, r.specimen].filter(Boolean).join(' · '),
      meta: '报告 · ' + (n ? `${n} 项结果` : (r.file ? '有原件' : '未添加原件')),
      act: 'viewreport'
    });
  });

  orphanLabEvents().forEach(push);

  medications.forEach(m => push({
    id: m.id, kind: 'med', date: m.startDate || '', createdAt: m.createdAt || 0,
    chip: '用药',
    title: m.name || '用药',
    summary: [m.dose, m.frequency, m.route].filter(Boolean).join('　'),
    meta: `用药 · ${medStatusLabel(m.status) || '状态待确认'}`,
    act: 'med-edit'
  }));

  weightList().forEach(w => push({
    id: w.id, kind: 'weight', date: w.date || '', createdAt: w.createdAt || 0,
    chip: '体重', title: '体重', summary: `${kg1(w.kg)} kg`,
    meta: '日常健康 · 体重与饮食', href: '#/daily?seg=body'
  }));
  vitalsSorted().forEach(v => {
    const parts = VITAL_METRICS.filter(m => Number.isFinite(v[m.k]))
      .map(m => `${m.label} ${v[m.k]}${m.unit}`);
    push({
      id: v.id, kind: 'vital', date: v.date || '', createdAt: v.createdAt || 0,
      chip: '体征', title: '体征', summary: parts.join('　'),
      meta: '日常健康 · 血压等体征', href: '#/daily?seg=vitals'
    });
  });
  symptomsSorted().forEach(s => push({
    id: s.id, kind: 'symptom', date: s.date || '', createdAt: s.createdAt || 0,
    chip: '症状', title: s.part || '症状', summary: String(s.note || '').trim(),
    meta: '日常健康 · 症状', href: '#/daily?seg=symptoms'
  }));
  sleepLogsSorted().forEach(s => {
    const hrs = [s.bedtime, s.wake].filter(Boolean).length === 2 ? `${s.bedtime} → ${s.wake}` : '';
    push({
      id: s.id, kind: 'sleep', date: s.date || '', createdAt: s.createdAt || 0,
      chip: '睡眠', title: '睡眠',
      summary: [hrs, Number.isFinite(Number(s.hours)) ? `${s.hours} 小时` : '', String(s.note || '').trim()]
        .filter(Boolean).join('　'),
      meta: '日常健康 · 睡眠', href: '#/daily?seg=sleep'
    });
  });

  /* 静态历史档案：只读、标注来源、不进详情、不可编辑（027 §17 第 7 条） */
  (ARCHIVE.timeline || []).forEach((t, i) => push({
    id: 'lg' + i, kind: 'legacy', date: t.date || '', createdAt: 0,
    chip: '历史档案',
    title: t.type || '历史事件',
    summary: String(t.text || '').trim(),
    meta: `历史档案 · 来源：${t.src || '未标注来源'}`,
    href: t.href || '', external: !!t.href
  }));

  return ev;
}

function isISODate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

/* 有日期的按日期倒序；日期未确认的置顶，最多 1 条（不用今天兜底） */
function recentSorted(list) {
  const dated = list.filter(e => isISODate(e.date));
  const undated = list.filter(e => !isISODate(e.date));
  dated.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  undated.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { dated, undated };
}
function homeRecent(n = 3) {
  const { dated, undated } = recentSorted(recentStream());
  return (undated.length ? [undated[0]] : []).concat(dated).slice(0, n);
}
/* 最近更新时间：取已记录内容里最大的事件日期，不用「现在」冒充 */
function latestEventDate() {
  const ds = recentStream().map(e => e.date).filter(isISODate).sort();
  return ds.length ? ds[ds.length - 1] : '';
}

/* 接下来要做：置顶 > 已过期 > 今天 > 未来 > 未定日期（027 §3.3） */
function nextUpTodos(n = 3) {
  const today = todayISO();
  const rank = t => {
    if (t.flag) return 0;
    const due = todoDue(t);
    if (!due) return 4;
    if (due < today) return 1;
    if (due === today) return 2;
    return 3;
  };
  return openTodos().slice().sort((a, b) => rank(a) - rank(b)
    || String(todoDue(a) || '9999').localeCompare(String(todoDue(b) || '9999'))
    || (b.createdAt || 0) - (a.createdAt || 0)).slice(0, n);
}

/* 已过期的待办（红点用）。没日期的永远不算过期。 */
function overdueTodos() {
  const today = todayISO();
  return openTodos().filter(t => {
    const due = todoDue(t);
    return !!due && due < today;
  });
}

/* 待办行（026 §4.10）：无日期只写「未定日期」，绝不出现逾期字样 */
function todoRowHTML(t, opts = {}) {
  const done = !!state.done[t.id];
  const due = todoDue(t);
  const d = due ? daysFromToday(due) : null;
  let dateHTML;
  if (d === null) dateHTML = '未定日期';
  else if (d < 0) dateHTML = `<span class="over">已过期 ${-d} 天</span>`;
  else if (d === 0) dateHTML = '今天';
  else dateHTML = `还有 ${d} 天`;
  const typeLabel = followTypeLabel(t.followType);
  return `<div class="todo-row${done ? ' is-done' : ''}">
    <button class="todo-check" type="button" data-act="todo" data-id="${esc(t.id)}"
      aria-label="${done ? '取消完成' : '标记完成'}" aria-pressed="${done ? 'true' : 'false'}"><i>${I.check2}</i></button>
    <div style="min-width:0;flex:1">
      <p class="todo-text">${esc(t.text)}</p>
      <p class="todo-meta">${dateHTML}${typeLabel ? '　·　' + esc(typeLabel) : ''}</p>
    </div>
    <div class="todo-side">
      ${opts.editable ? `<button class="btn-plain" type="button" data-act="todo-edit" data-id="${esc(t.id)}">编辑</button>` : ''}
    </div>
  </div>`;
}

/* ======================= 记录卡（首页与就医记录共用） ======================= */
function recCardHTML(ev, opts = {}) {
  const p = dateParts(ev.date);
  const dateBlock = p.unknown
    ? `<div class="rc-date"><span class="ts" style="color:var(--st-todo-fg);font-family:var(--font-sans)">日期未确认</span></div>`
    : `<div class="rc-date"><span class="rc-year">${esc(p.year)}</span><span>${esc(p.md)}</span><span class="rc-wd">${esc(p.wd)}</span></div>`;
  const chip = ev.chip ? `<span class="chip chip--type">${esc(ev.chip)}</span>` : '';
  const sumHTML = ev.summary
    ? `<p class="rc-sum">${esc(ev.summary)}</p>`
    : `<p class="rc-sum is-empty">未填写记录内容</p>`;
  const inner = `${dateBlock}
    <div class="rc-body">
      ${chip ? `<div>${chip}</div>` : ''}
      <p class="rc-title">${esc(ev.title || '未命名')}</p>
      ${sumHTML}
      ${ev.meta ? `<p class="rc-meta">${esc(ev.meta)}</p>` : ''}
    </div>`;

  let main;
  if (ev.href) {
    main = `<a class="rc-main" href="${esc(ev.href)}"${ev.external ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>`;
  } else if (ev.act) {
    main = `<button class="rc-main" type="button" data-act="${esc(ev.act)}" data-id="${esc(ev.id || '')}">${inner}</button>`;
  } else {
    main = `<div class="rc-main">${inner}</div>`;
  }
  const side = [
    ev.side ? `<span class="rc-count">${ev.side}</span>` : '',
    opts.more ? `<button class="icon-btn" type="button" data-act="rec-more" data-kind="${esc(ev.kind)}" data-id="${esc(ev.id || '')}"
      aria-label="更多操作：${esc(ev.title || '')}">${I.more}</button>` : ''
  ].filter(Boolean).join('');

  return `<div class="rec-card${opts.compact ? ' rec-card--compact' : ''}${ev.kind === 'legacy' ? ' rec-card--legacy' : ''}${opts.flash ? ' is-flash' : ''}">${main}${side ? `<div class="rc-side">${side}</div>` : ''}</div>`;
}

/* ======================= 首页 #/home ======================= */
function criticalAllergyNoticeHTML() {
  const list = criticalAllergies();
  if (!list.length) return '';
  return `<section class="allergy-alert">${I.info}<div>
    <b>危急过敏 · 就诊、用药前请告知医生</b>
    <p>${list.map(a => `${esc(a.name)}（${esc(a.category || '未分类')}${a.reaction ? '：' + esc(a.reaction) : ''}）`).join('；')}</p>
    <a class="band-link" href="#/me">查看过敏信息 →</a>
  </div></section>`;
}

function renderHome() {
  const last = latestEventDate();
  setHead('', '健康档案',
    last ? `最近更新 ${last}　·　数据存在本机，随时可以补` : '从第一次记录开始',
    `<button class="icon-btn" data-act="search" aria-label="搜索档案">${I.search}</button>
     <button class="btn btn-primary" data-act="record">${I.plus}记一笔</button>`, false);

  const from = encodeURIComponent('#/home');
  const tasks = nextUpTodos(3);
  const recent = homeRecent(3);
  const openCount = openTodos().length;
  const overdue = overdueTodos().length;

  $('#view').innerHTML = `<div class="stack">
    ${criticalAllergyNoticeHTML()}

    <section class="grid-quick" aria-label="快捷记录">
      <a class="quick-card quick-card--accent" href="#/new-visit?from=${from}">
        <span class="qc-icon">${I.plus}</span>
        <span class="qc-body"><span class="qc-title">记一次就诊</span><span class="qc-desc">日期 + 一段记录</span></span>
      </a>
      <a class="quick-card" href="#/new-report?from=${from}">
        <span class="qc-icon">${I.file}</span>
        <span class="qc-body"><span class="qc-title">存一份报告</span><span class="qc-desc">先保存原件</span></span>
      </a>
      <button class="quick-card" type="button" data-act="record" data-mode="daily">
        <span class="qc-icon">${I.pulse}</span>
        <span class="qc-body"><span class="qc-title">记日常数据</span><span class="qc-desc">体重、血压、症状、睡眠</span></span>
      </button>
    </section>

    ${tasks.length ? `<section>
      <div class="section-head" style="margin-top:0">
        <h2>接下来要做</h2>
        <a class="btn-plain" href="#/todos">全部 ${openCount} 项${overdue ? `<span class="rdot" role="img" aria-label="其中 ${overdue} 项已过期"></span>` : ''} →</a>
      </div>
      <div class="card" style="padding:var(--sp-2) var(--sp-4)">
        ${tasks.map(t => todoRowHTML(t)).join('')}
      </div>
    </section>` : ''}

    <section>
      <div class="section-head" style="margin-top:0">
        <h2>最近记录</h2>
        <a class="btn-plain" href="#/records">查看全部 →</a>
      </div>
      ${recent.length
        ? `<div style="display:flex;flex-direction:column;gap:var(--sp-2)">${recent.map(e => recCardHTML(e, { compact: true })).join('')}</div>`
        : emptyStateHTML({
          icon: 'file',
          title: '还没有记录',
          desc: '看完门诊记一句就够了，报告可以先存原件，其余以后可以补。',
          actions: `<a class="btn btn-primary" href="#/new-visit?from=${from}">${I.plus}记一次就诊</a>`
        })}
    </section>
  </div>`;
}

/* ======================= 就医记录 #/records ======================= */
const REC_DEFAULT = { t: 'all', q: '', from: '', to: '', p: 1 };
const REC_TYPES = [['all', '全部'], ['visit', '就诊'], ['report', '报告'], ['med', '用药']];

/* 筛选状态：URL 查询参数是唯一真源（027 §2.4） */
function readRecordsQuery() {
  const qs = hashQuery();
  const out = Object.assign({}, REC_DEFAULT);
  ['t', 'q', 'from', 'to'].forEach(k => {
    const v = qs.get(k);
    if (v) out[k] = v;
  });
  out.p = Math.max(1, parseInt(qs.get('p'), 10) || 1);
  if (!['all', 'visit', 'report', 'med'].includes(out.t)) out.t = 'all';
  if (!isISODate(out.from)) out.from = '';
  if (!isISODate(out.to)) out.to = '';
  return out;
}
function writeRecordsQuery(next, { replace = false } = {}) {
  const merged = Object.assign({}, readRecordsQuery(), next);
  const qs = new URLSearchParams();
  Object.keys(REC_DEFAULT).forEach(k => {
    const v = merged[k];
    if (v === '' || v === null || v === undefined) return;
    if (k === 'p' && Number(v) === 1) return;
    qs.set(k, String(v));
  });
  const hash = hashOf('records', qs);
  if (replace) history.replaceState(null, '', hash);
  else goHash(hash);
}

/* 按筛选档取事件（全部档额外含静态历史档案事件） */
function recordEvents(q) {
  const all = recentStream();
  const byType = t => all.filter(e => e.kind === t);
  if (q.t === 'visit') return byType('visit');
  if (q.t === 'report') return byType('report').concat(byType('lab'));
  if (q.t === 'med') return byType('med');
  return all;
}
function filterEvents(list, q) {
  const kw = String(q.q || '').trim().toLowerCase();
  return list.filter(e => {
    if (q.from && !(isISODate(e.date) && e.date >= q.from)) return false;
    if (q.to && !(isISODate(e.date) && e.date <= q.to)) return false;
    if (!kw) return true;
    return [e.title, e.summary, e.meta, e.chip].join(' ').toLowerCase().includes(kw);
  });
}
/* 每档条数：搜索与日期不参与计数，避免「全部 3」这种自相矛盾的徽标 */
function recordCounts(q) {
  const base = { all: 0, visit: 0, report: 0, med: 0 };
  const scope = filterEvents(recentStream(), { q: q.q, from: q.from, to: q.to });
  scope.forEach(e => {
    base.all += 1;
    if (e.kind === 'visit') base.visit += 1;
    else if (e.kind === 'report' || e.kind === 'lab') base.report += 1;
    else if (e.kind === 'med') base.med += 1;
  });
  return base;
}

const REC_PAGE_SIZE = 20;

function recordsEmptyHTML(q, counts) {
  const anything = counts.all > 0;
  const filtered = q.q || q.from || q.to;
  if (anything && filtered) {
    return emptyStateHTML({
      icon: 'search', title: '当前筛选下没有记录',
      desc: '换个关键词，或者把日期范围放宽一点。',
      actions: `<button class="btn btn-secondary" type="button" data-act="rec-clear">清空筛选</button>`
    });
  }
  if (q.t === 'visit') {
    return emptyStateHTML({
      icon: 'file', title: '还没记过就诊',
      desc: '一次门诊只需要日期和一句记录，其余以后可以补。',
      actions: `<a class="btn btn-primary" href="#/new-visit?from=${encodeURIComponent('#/records?t=visit')}">${I.plus}记一次就诊</a>`
    });
  }
  if (q.t === 'report') {
    return emptyStateHTML({
      icon: 'file', title: '还没存过报告',
      desc: '拍一张化验单就能先存下原件，名称和日期之后再补。',
      actions: `<a class="btn btn-primary" href="#/new-report?from=${encodeURIComponent('#/records?t=report')}">${I.plus}存一份报告</a>`
    });
  }
  if (q.t === 'med') {
    return emptyStateHTML({
      icon: 'pill', title: '还没记过用药',
      desc: '药名和当前状态就能先存一条，剂量和频次可以以后补。',
      actions: `<button class="btn btn-primary" type="button" data-act="med-add">${I.plus}记一次用药</button>`
    });
  }
  return emptyStateHTML({
    icon: 'file', title: '还没有任何记录',
    desc: '看完门诊先记一句，报告可以先存原件。',
    actions: `<a class="btn btn-primary" href="#/new-visit?from=${encodeURIComponent('#/records')}">${I.plus}记一次就诊</a>`
  });
}

/* 只重绘列表与结果摘要：搜索框在列表之外，输入时不丢焦点 */
function renderRecordsList() {
  const host = $('#recList');
  if (!host) return;
  const q = readRecordsQuery();
  const counts = recordCounts(q);
  const list = filterEvents(recordEvents(q), q);
  const { dated, undated } = recentSorted(list);

  if (!list.length) {
    host.innerHTML = `${recordsEmptyHTML(q, counts)}`;
    return;
  }

  const pages = Math.max(1, Math.ceil(list.length / REC_PAGE_SIZE));
  const page = Math.min(q.p, pages);
  const ordered = undated.concat(dated);
  const sliceFrom = (page - 1) * REC_PAGE_SIZE;
  const rows = ordered.slice(sliceFrom, sliceFrom + REC_PAGE_SIZE);

  /* 年分组：日期未确认的独立一组，排在所有年份之前 */
  const groups = [];
  let cur = null;
  rows.forEach(e => {
    const key = isISODate(e.date) ? e.date.slice(0, 4) + ' 年' : '日期未确认';
    if (!cur || cur.key !== key) { cur = { key, items: [] }; groups.push(cur); }
    cur.items.push(e);
  });

  const flash = ui.flash;
  host.innerHTML = `<div class="rec-group-wrap" style="display:flex;flex-direction:column;gap:var(--sp-6)">
    ${groups.map(g => `<section class="rec-group">
      <div class="rec-group-head"><h2>${esc(g.key)}</h2><span>${g.items.length} 条</span></div>
      ${g.items.map(e => recCardHTML(e, {
        more: ['visit', 'report', 'med'].includes(e.kind),
        flash: !!(flash && flash.kind === e.kind && flash.id === e.id)
      })).join('')}
    </section>`).join('')}
  </div>
  ${pages > 1 ? `<div class="pager" style="margin-top:var(--sp-6)">
      <span class="pager-info">第 ${page} / ${pages} 页</span>
      <span class="pager-ctl">
        <button class="pager-btn${page <= 1 ? ' is-dis' : ''}" type="button" data-act="rec-page" data-p="${page - 1}"${page <= 1 ? ' disabled' : ''}>上一页</button>
        <button class="pager-btn${page >= pages ? ' is-dis' : ''}" type="button" data-act="rec-page" data-p="${page + 1}"${page >= pages ? ' disabled' : ''}>下一页</button>
      </span>
    </div>` : ''}`;
}

function renderRecords() {
  const q = readRecordsQuery();
  const counts = recordCounts(q);
  const filtered = !!(q.q || q.from || q.to);
  const panelOpen = ui.recFilterOpen || filtered;
  const fromHash = encodeURIComponent(location.hash || '#/records');

  setHead('', '就医记录', '同一次看病，资料、用药、安排都在一条里',
    `<button class="icon-btn" data-act="search" aria-label="搜索档案">${I.search}</button>
     <a class="btn btn-secondary" href="#/new-report?from=${fromHash}">${I.file}存一份报告</a>
     <a class="btn btn-primary" href="#/new-visit?from=${fromHash}">${I.plus}记一次就诊</a>`, false);

  $('#view').innerHTML = `<div class="stack">
    <div class="seg-row">
      ${segHTML(REC_TYPES.map(([v, label]) => [v, label, counts[v]]), q.t, 'rec-t', '按类型筛选', true)}
      <div class="seg-tools">
        <button class="icon-btn" type="button" data-act="rec-filter"
          aria-label="搜索与日期筛选" aria-expanded="${panelOpen ? 'true' : 'false'}">${I.search}</button>
      </div>
    </div>

    <div id="recFilterPanel" ${panelOpen ? '' : 'hidden'}>
      <div class="card" style="padding:var(--sp-4)">
        <div class="form-grid" style="grid-template-columns:1.4fr .8fr .8fr">
          <div class="field">
            <label for="recQ">搜索</label>
            <input id="recQ" type="search" value="${esc(q.q)}" placeholder="医院、诊断、药名、报告名" autocomplete="off">
          </div>
          <div class="field">
            <label for="recFrom">从</label>
            <input id="recFrom" type="date" value="${esc(q.from)}">
          </div>
          <div class="field">
            <label for="recTo">至</label>
            <input id="recTo" type="date" value="${esc(q.to)}">
          </div>
        </div>
        <div class="form-actions" style="margin-top:var(--sp-3)">
          <button class="btn btn-secondary" type="button" data-act="rec-clear">清空筛选</button>
        </div>
      </div>
    </div>

    <p class="hint" id="recSummary">共 ${counts.all} 条　就诊 ${counts.visit}　报告 ${counts.report}　用药 ${counts.med}${filtered ? '　·　已筛选' : ''}</p>

    <div id="recList"></div>

    <p class="hint">检验指标趋势在 <a href="#/themes">健康主题 → 检验指标</a>；这里只看「什么时候发生了什么」。</p>
  </div>`;

  renderRecordsList();

  /* 搜索 300ms 防抖后 replace（不制造每键一条历史）；日期与档位切换走 push */
  const input = $('#recQ');
  if (input) {
    input.addEventListener('input', () => {
      clearTimeout(ui.recQTimer);
      ui.recQTimer = setTimeout(() => {
        writeRecordsQuery({ q: input.value.trim(), p: 1 }, { replace: true });
        const q2 = readRecordsQuery();
        const c2 = recordCounts(q2);
        const sum = $('#recSummary');
        if (sum) sum.innerHTML = `共 ${c2.all} 条　就诊 ${c2.visit}　报告 ${c2.report}　用药 ${c2.med}${(q2.q || q2.from || q2.to) ? '　·　已筛选' : ''}`;
        renderRecordsList();
      }, 300);
    });
  }
  ['recFrom', 'recTo'].forEach(id => {
    const el = $('#' + id);
    if (!el) return;
    el.addEventListener('change', () => {
      writeRecordsQuery({ from: $('#recFrom').value, to: $('#recTo').value, p: 1 });
    });
  });
}

/* ======================= 就诊详情 #/visit?id= ======================= */
function detailRowHTML(label, value) {
  return `<div class="kv-row"><span class="kv-k">${esc(label)}</span><span class="kv-v">${value}</span></div>`;
}

function renderVisitDetail(id) {
  const q = hashQuery();
  const back = q.get('back') || '';
  const v = visitById(id);
  if (!v) {
    setHead('', '就诊详情', '', '', false);
    $('#view').innerHTML = `<div class="stack">
      ${emptyStateHTML({
        icon: 'info', title: '这条记录不在了',
        desc: '可能已被删除。回到就医记录可以看其它记录。',
        actions: `<a class="btn btn-primary" href="#/records">回到就医记录</a>`
      })}
    </div>`;
    return;
  }

  const rep = v.reportId ? reportById(v.reportId) : null;
  const medsThis = medications.filter(m => m.visitId === v.id);
  const medsActive = medications.filter(m => m.status === 'active');
  const todosThis = todoItems.filter(t => (t.groupName || '') === visitGroupName(v));
  const proFilled = ['doctor', 'chief', 'diagnosis', 'note'].filter(k => String(v[k] || '').trim()).length;

  setHead('', v.hospital || `${v.visitType || ''}就诊记录` || '就诊记录', visitLocateLine(v),
    `<button class="btn btn-secondary" type="button" data-act="back" data-back="${esc(back)}">← 就医记录</button>
     <a class="btn btn-primary" href="#/visit?id=${encodeURIComponent(v.id)}&edit=1&back=${encodeURIComponent(location.hash || '')}">${I.plus}编辑记录</a>`, false);

  $('#view').innerHTML = `<div class="stack">
    <section class="card">
      <div class="card-head"><h2>本次记录</h2></div>
      ${String(v.summary || '').trim()
        ? `<p class="rec-text measure" style="white-space:pre-wrap">${esc(v.summary)}</p>`
        : `<p class="hint">本次没有写记录。</p>
           <div class="form-actions"><a class="btn btn-secondary" href="#/visit?id=${encodeURIComponent(v.id)}&edit=1&back=${encodeURIComponent(location.hash || '')}">补充记录</a></div>`}
    </section>

    <section class="card">
      <div class="card-head"><h2>关联资料</h2>
        <span class="hint">${rep ? `关联报告 1 份${labCountOf(rep.id) ? ` · ${labCountOf(rep.id)} 项结果` : ''}` : '未添加资料'}</span>
      </div>
      ${rep ? `<div class="row">
          <button class="rp-thumb" type="button" data-act="viewreport" data-id="${esc(rep.id)}" aria-label="查看原件">
            ${rep.file && !reportFileMissing(rep)
              ? `<img src="${esc(rep.file)}" alt="">`
              : `<span>${reportFileMissing(rep) ? '原件缺失' : '未添加原件'}</span>`}
          </button>
          <div class="row-main">
            <p class="row-title">${esc(rep.title || '未命名报告')}</p>
            <p class="row-sub">${esc(rep.date || '日期未确认')}${rep.hospital ? '　·　' + esc(rep.hospital) : ''}</p>
          </div>
          <div class="row-act">
            <button class="btn-plain" type="button" data-act="viewreport" data-id="${esc(rep.id)}">查看原件</button>
            <a class="btn-plain" href="#/new-report?visitId=${encodeURIComponent(v.id)}&from=${encodeURIComponent(location.hash || '')}">替换关联</a>
          </div>
        </div>
        ${reports.length > 1 ? `<p class="hint" style="margin-top:var(--sp-2)">一次就诊只关联 1 份报告；其余 ${reports.length - 1} 份在报告列表里可查。</p>` : ''}`
      : `<p class="hint">未添加资料。</p>
         <div class="form-actions">
           <a class="btn btn-secondary" href="#/new-report?visitId=${encodeURIComponent(v.id)}&from=${encodeURIComponent(location.hash || '')}">${I.plus}添加资料</a>
           <button class="btn btn-ghost" type="button" data-act="visit-link-report" data-id="${esc(v.id)}">关联已有报告</button>
         </div>`}
    </section>

    <section class="card">
      <div class="card-head"><h2>本次就诊用药</h2><span class="hint">这次就诊记录的药。药物可能跨多次就诊持续使用。</span></div>
      ${medsThis.length ? `<div style="display:flex;flex-direction:column">
          ${medsThis.map(m => `<div class="row">
            <div class="row-main">
              <p class="row-title">${esc(m.name)}${m.dose ? `　${esc(m.dose)}` : ''}</p>
              <p class="row-sub">${esc([m.frequency, m.route].filter(Boolean).join('　·　') || '剂量与频次未记录')}</p>
            </div>
            <div class="row-act"><button class="btn-plain" type="button" data-act="med-edit" data-id="${esc(m.id)}">编辑</button></div>
          </div>`).join('')}
        </div>`
      : `<p class="hint">本次就诊未添加用药。</p>
         <div class="form-actions">
           <button class="btn btn-secondary" type="button" data-act="med-add-for-visit" data-id="${esc(v.id)}">${I.plus}记这次用药</button>
         </div>`}
    </section>

    <section class="card">
      <div class="card-head"><h2>当前全部用药</h2></div>
      <p class="hint" style="margin-bottom:var(--sp-3)">在服药物不一定由这次就诊开具，记录就诊不会自动改变药物状态。</p>
      ${medsActive.length ? `<div style="display:flex;flex-direction:column">
          ${medsActive.map(m => `<div class="row">
            <div class="row-main">
              <p class="row-title">${esc(m.name)}${m.dose ? `　${esc(m.dose)}` : ''}</p>
              <p class="row-sub">${esc([m.frequency, m.route].filter(Boolean).join('　·　') || '剂量与频次未记录')}${m.startDate ? `　·　开始 ${esc(m.startDate)}` : ''}</p>
            </div>
          </div>`).join('')}
        </div>`
      : '<p class="hint">没有状态为「在服」的用药。</p>'}
      <div class="form-actions"><a class="btn btn-ghost" href="#/records?t=med">查看全部用药 →</a></div>
    </section>

    <section class="card">
      <div class="card-head"><h2>下一步安排</h2></div>
      ${todosThis.length ? `<div style="display:flex;flex-direction:column">
          ${todosThis.map(t => todoRowHTML(t, { editable: true })).join('')}
        </div>`
      : `<p class="hint">未添加下一步安排。</p>
         <div class="form-actions">
           <button class="btn btn-secondary" type="button" data-act="todo-add-for-visit" data-id="${esc(v.id)}">${I.plus}加复诊提醒</button>
         </div>`}
      <div class="form-actions"><a class="btn btn-ghost" href="#/todos">查看全部提醒 →</a></div>
      <p class="hint" style="margin-top:var(--sp-2)">提醒按「${esc(visitGroupName(v))}」分组自动归到这次就诊；同一天两次就诊会共用一个分组。</p>
    </section>

    <section>
      <div class="section-head" style="margin-top:0"><h2>详细信息</h2></div>
      ${foldHTML('visitInfo', '补充信息',
        proFilled ? `已填 ${proFilled} 项` : '未记录',
        `<div style="padding-top:var(--sp-3)">
          ${v.chief ? detailRowHTML('就诊原因', esc(v.chief)) : detailRowHTML('就诊原因', '<span style="color:var(--ink-4)">未记录</span>')}
          ${v.diagnosis ? detailRowHTML('明确诊断', esc(v.diagnosis)) : detailRowHTML('明确诊断', '<span style="color:var(--ink-4)">未记录</span>')}
          ${v.note ? detailRowHTML('医嘱 / 备注', esc(v.note)) : detailRowHTML('医嘱 / 备注', '<span style="color:var(--ink-4)">未记录</span>')}
          ${v.doctor ? detailRowHTML('接诊医生', esc(v.doctor)) : detailRowHTML('接诊医生', '<span style="color:var(--ink-4)">未记录</span>')}
          ${v.hospital ? detailRowHTML('医院', esc(v.hospital)) : ''}
          ${v.department ? detailRowHTML('科室', esc(v.department)) : ''}
          ${v.visitType ? detailRowHTML('就诊类型', esc(v.visitType)) : ''}
          ${detailRowHTML('记录时间', `<span class="ts">${esc(fmtWhen(new Date(v.createdAt || Date.now())))}</span>`)}
        </div>`)}
    </section>

    <section class="card">
      <div class="card-head"><h2>就诊摘要</h2><span class="hint">给医生看的一页纸，缺项写「未记录」</span></div>
      <div class="form-actions" style="margin-top:0">
        <a class="btn btn-secondary" href="#/summary?visit=${encodeURIComponent(v.id)}">预览并导出给医生</a>
        <button class="btn btn-danger-ghost" type="button" data-act="visit-del" data-id="${esc(v.id)}">删除这条</button>
      </div>
    </section>
  </div>`;
}

/* 就诊页分派：?edit=1 → 速记表单（编辑模式），否则详情 */
function renderVisitPage() {
  const q = hashQuery();
  const id = q.get('id') || '';
  if (q.get('edit') === '1') return renderVisitComposer({ id });
  return renderVisitDetail(id);
}

/* ======================= 就诊速记 #/new-visit / #/visit?id=&edit=1 ======================= */
let visitComposer = null;   // { mode, id, from, files:[{name,dataUrl}], initial }

function readComposerDraft() {
  const g = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
  return {
    date: g('cvDate'), summary: g('cvSummary'),
    visitType: g('cvType'), hospital: g('cvHospital'),
    department: g('cvDept'), doctor: g('cvDoctor'),
    chief: g('cvChief'), diagnosis: g('cvDiag'), note: g('cvNote'),
    reportId: g('cvReport')
  };
}
function composerSignature() {
  if (!visitComposer) return '';
  const d = readComposerDraft();
  return JSON.stringify({ d, files: visitComposer.files.map(f => f.name) });
}
function composerDirty() {
  if (!visitComposer) return false;
  /* 表单已不在页面上（用户没填东西就离开了，或已被别的页覆盖）：
     没有可丢失的输入，绝不能拿残缺 DOM 去和 initial 比较——那样会在全站任意页面误判为脏，
     弹出「这次记录还没保存」。见 027 §9.8：拦截只针对真实未保存内容。 */
  if (!document.getElementById('cvDate')) return false;
  return composerSignature() !== visitComposer.initial;
}
/* 存报告编辑器的判脏：同样只在表单还在页面上时才比较 */
function reportDirty() {
  if (!reportComposer) return false;
  if (!document.getElementById('rpDate')) return false;
  return reportSignature() !== reportComposer.initial;
}
/* 最低保存条件（027 §9.5）：有效日期 + （自由记录 | 至少一份附件 | 原因/诊断/医嘱任一） */
function canSaveVisitDraft(d) {
  const dateOK = isISODate(d.date) && !Number.isNaN(Date.parse(d.date + 'T00:00:00'));
  if (!dateOK) return { ok: false, reason: 'date' };
  const textOK = String(d.summary || '').trim().length > 0;
  const attachOK = !!(visitComposer && visitComposer.files.length);
  const proOK = ['chief', 'diagnosis', 'note'].some(k => String(d[k] || '').trim().length > 0);
  if (textOK || attachOK || proOK) return { ok: true };
  return { ok: false, reason: 'empty' };
}

/* 折叠区摘要行（027 §9.4） */
function visitInfoSummary() {
  const d = readComposerDraft();
  const filled = [['hospital', '医院'], ['department', '科室'], ['doctor', '医生']]
    .filter(([k]) => String(d[k] || '').trim()).map(([, label]) => label);
  return `${d.visitType || '门诊'} · ${filled.length ? '已填 ' + filled.join('、') : '其他未记录'}`;
}
function visitDiagSummary() {
  const d = readComposerDraft();
  const has = k => String(d[k] || '').trim().length > 0;
  if (has('diagnosis')) return '已填 诊断';
  const other = [['chief', '就诊原因'], ['note', '医嘱']].filter(([k]) => has(k)).map(([, l]) => l);
  return other.length ? `已填 ${other.join('、')}` : '未记录';
}
function visitFilesSummary() {
  const n = visitComposer ? visitComposer.files.length : 0;
  return n ? `已添加 ${n} 份` : '未添加';
}
function refreshComposerSummaries() {
  if (!visitComposer) return;
  const set = (id, text) => { const el = document.getElementById('foldnote-' + id); if (el) el.textContent = text; };
  set('cvInfo', visitInfoSummary());
  set('cvDiag', visitDiagSummary());
  set('cvFiles', visitFilesSummary());
  const cnt = document.getElementById('cvCount');
  const ta = document.getElementById('cvSummary');
  if (cnt && ta) {
    const n = ta.value.length;
    cnt.textContent = `${n}/1000`;
    cnt.className = 'field-hint' + (n >= 900 ? ' limit' : '');
  }
  const save = document.getElementById('cvSaveBtn');
  if (save) {
    const st = canSaveVisitDraft(readComposerDraft());
    save.setAttribute('aria-disabled', st.ok ? 'false' : 'true');
  }
}
function refreshComposerFiles() {
  const host = document.getElementById('cvFiles');
  if (!host || !visitComposer) return;
  host.innerHTML = visitComposer.files.length
    ? `<div class="thumb-grid">${visitComposer.files.map((f, i) => `
        <div class="thumb">
          <img src="${esc(f.dataUrl)}" alt="${esc(f.name || '资料')}">
          <button class="thumb-x" type="button" data-act="cv-file-del" data-i="${i}" aria-label="移除这份资料">${I.close}</button>
        </div>`).join('')}</div>`
    : `<p class="field-hint">还没有添加资料。拍照或选择图片，会压到长边 1500px 后存进本机。</p>`;
  refreshComposerSummaries();
}

function renderVisitComposer(opts = {}) {
  const q = hashQuery();
  const rec = opts.id ? visitById(opts.id) : null;
  if (opts.id && !rec) {
    setHead('', '编辑就诊记录', '', '', false);
    $('#view').innerHTML = emptyStateHTML({
      icon: 'info', title: '这条记录不在了', desc: '可能已被删除。',
      actions: `<a class="btn btn-primary" href="#/records">回到就医记录</a>`
    });
    return;
  }
  const from = q.get('from') || (rec ? (q.get('back') || '#/records') : '#/records');
  const initial = {
    date: rec ? rec.date : (q.get('date') && isISODate(q.get('date')) ? q.get('date') : todayISO()),
    visitType: rec ? (rec.visitType || '门诊') : '门诊',
    hospital: rec ? (rec.hospital || '') : '',
    department: rec ? (rec.department || '') : '',
    doctor: rec ? (rec.doctor || '') : '',
    chief: rec ? (rec.chief || '') : '',
    diagnosis: rec ? (rec.diagnosis || '') : '',
    note: rec ? (rec.note || '') : '',
    summary: rec ? (rec.summary || '') : '',
    reportId: rec ? (rec.reportId || '') : ''
  };
  visitComposer = { mode: rec ? 'edit' : 'new', id: rec ? rec.id : '', from, files: [], initial: '' };

  const reportOpts = ['<option value="">（不关联）</option>'].concat(
    reports.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map(r => `<option value="${esc(r.id)}" ${initial.reportId === r.id ? 'selected' : ''}>${esc(r.date || '日期未确认')}　${esc(r.title || '未命名报告')}</option>`)
  ).join('');

  setHead('', rec ? '编辑就诊记录' : '记一次就诊', '记得多少写多少，以后随时可以补充',
    `<button class="btn btn-secondary only-desktop" type="button" data-act="composer-cancel">取消</button>
     <button class="btn btn-primary only-desktop" type="button" id="cvSaveBtn" data-act="composer-save">保存记录</button>`, false);

  $('#view').innerHTML = `<div class="stack">
    <section class="card">
      <div class="field" id="cvDateField">
        <label for="cvDate">就诊日期 <span class="field-req">必填</span></label>
        <input id="cvDate" type="date" value="${esc(initial.date)}">
        <span class="field-hint" id="cvDateHint">${initial.date === todayISO() ? '今天' : ''}</span>
      </div>
      <p class="field-err" id="cvErr" role="alert" hidden></p>

      <div class="field" style="margin-top:var(--sp-5)">
        <label for="cvSummary">这次看病，记下什么？</label>
        <textarea id="cvSummary" class="rec-textarea" maxlength="1000"
          placeholder="看病原因、医生怎么说、下一步安排，记得多少写多少。&#10;也可以直接把病历、医嘱粘贴进来。">${esc(initial.summary)}</textarea>
        <span class="field-hint" id="cvCount">${initial.summary.length}/1000</span>
      </div>

      <div style="margin-top:var(--sp-5)">
        ${foldHTML('cvInfo', '补充就诊信息（选填）', '', `
          <div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));padding-top:var(--sp-3)">
            <div class="field"><label for="cvType">就诊类型</label>
              <select id="cvType">${VISIT_TYPES.map(t => `<option value="${esc(t)}" ${initial.visitType === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
            </div>
            <div class="field"><label for="cvHospital">医院</label>
              <input id="cvHospital" value="${esc(initial.hospital)}" maxlength="60" placeholder="如 市第一医院">
            </div>
            <div class="field"><label for="cvDept">科室</label>
              <input id="cvDept" value="${esc(initial.department)}" maxlength="40" placeholder="如 眼科">
            </div>
            <div class="field"><label for="cvDoctor">医生</label>
              <input id="cvDoctor" value="${esc(initial.doctor)}" maxlength="40" placeholder="如 王医生">
            </div>
          </div>`)}

        ${foldHTML('cvDiag', '补充诊断与医嘱（选填）', '', `
          <div style="padding-top:var(--sp-3);display:flex;flex-direction:column;gap:var(--sp-4)">
            <div class="field"><label for="cvChief">就诊原因</label>
              <input id="cvChief" value="${esc(initial.chief)}" maxlength="300" placeholder="这次为什么去看">
            </div>
            <div class="field"><label for="cvDiag">医生明确诊断</label>
              <input id="cvDiag" value="${esc(initial.diagnosis)}" maxlength="300" placeholder="没有明确诊断就留空，不推测">
            </div>
            <div class="field"><label for="cvNote">医嘱 / 备注</label>
              <input id="cvNote" value="${esc(initial.note)}" maxlength="300" placeholder="用药、注意事项、复诊安排">
            </div>
          </div>`)}

        ${foldHTML('cvFiles', '添加资料（选填）', '', `
          <div style="padding-top:var(--sp-3)">
            <div class="form-actions" style="margin-top:0">
              <label class="btn btn-secondary" for="cvFileCam">${I.camera}拍照</label>
              <input id="cvFileCam" type="file" accept="image/*" capture="environment" hidden>
              <label class="btn btn-secondary" for="cvFile">${I.upload}选择文件</label>
              <input id="cvFile" type="file" accept="image/*" multiple hidden>
            </div>
            <div id="cvFiles" style="margin-top:var(--sp-3)"></div>
            <div class="field" style="margin-top:var(--sp-4)">
              <label for="cvReport">关联已有报告</label>
              <select id="cvReport">${reportOpts}</select>
              <span class="field-hint">一次就诊只关联 1 份报告；新添加的图片会各自存成报告，只有第 1 份挂到这次就诊。</span>
            </div>
          </div>`)}
      </div>

      ${rec ? `<div class="notice notice--info" style="margin-top:var(--sp-5)">${I.info}
        <p><b>本次就诊用药：</b>${medications.filter(m => m.visitId === rec.id).length
          ? `${medications.filter(m => m.visitId === rec.id).length} 项（在就诊详情里管理）`
          : '未添加'}</p></div>` : ''}

      <div class="form-actions only-mobile" style="margin-top:var(--sp-5)">
        <button class="btn btn-primary" type="button" data-act="composer-save">保存记录</button>
        <button class="btn btn-secondary" type="button" data-act="composer-cancel">取消</button>
      </div>
      <p class="hint" style="margin-top:var(--sp-4)">以后随时可以补充</p>

      ${rec ? `<div class="form-actions" style="margin-top:var(--sp-2)">
        <button class="btn btn-danger-ghost" type="button" data-act="visit-del" data-id="${esc(rec.id)}">删除这条</button>
      </div>` : ''}
    </section>
  </div>`;

  refreshComposerFiles();
  visitComposer.initial = composerSignature();

  ['cvSummary', 'cvType', 'cvHospital', 'cvDept', 'cvDoctor', 'cvChief', 'cvDiag', 'cvNote', 'cvReport']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', refreshComposerSummaries);
      if (el && el.tagName === 'SELECT') el.addEventListener('change', refreshComposerSummaries);
    });
  const dateEl = document.getElementById('cvDate');
  if (dateEl) {
    dateEl.addEventListener('change', () => {
      const hint = document.getElementById('cvDateHint');
      if (hint) hint.textContent = dateEl.value === todayISO() ? '今天' : '';
      refreshComposerSummaries();
    });
  }
  ['cvFile', 'cvFileCam'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (!files.length) return;
      for (const f of files) {
        try {
          const dataUrl = await shrinkImage(f);
          visitComposer.files.push({ name: f.name || '资料', dataUrl });
        } catch (err) { toast('这张图读不出来，换一张试试'); }
      }
      refreshComposerFiles();
    });
  });
}

async function saveVisitComposer() {
  if (!visitComposer) return;
  const d = readComposerDraft();
  const st = canSaveVisitDraft(d);
  const err = document.getElementById('cvErr');
  const showErr = msg => {
    if (!err) return;
    err.textContent = msg;
    err.hidden = false;
  };
  if (!st.ok) {
    if (st.reason === 'date') {
      showErr('请先选择就诊日期。');
      const el = document.getElementById('cvDate');
      if (el) el.focus();
    } else {
      showErr('写一句就能保存；也可以先存一份资料。');
      const el = document.getElementById('cvSummary');
      if (el) el.focus();
    }
    return;
  }
  if (err) err.hidden = true;

  const prev = visitComposer.id ? visitById(visitComposer.id) : null;
  const newReportIds = [];

  /* 附件先建成报告记录（每份都存，不丢），只有第 1 份写进 visit.reportId */
  if (visitComposer.files.length) {
    const next = reports.slice();
    visitComposer.files.forEach((f, i) => {
      const r = normReport({
        id: newId('rep'),
        date: d.date,
        title: `就诊资料 ${d.date}` + (visitComposer.files.length > 1 ? ` · ${i + 1}` : ''),
        panel: '', specimen: '', hospital: d.hospital || '', note: '', file: f.dataUrl
      });
      next.push(r);
      newReportIds.push(r.id);
    });
    if (!persistReports(next)) {
      showErr('没存进本机存储，资料可能太大。可以先去「我的 → 备份与恢复」看看存储状态，再重试。');
      return;
    }
  }

  let reportId = d.reportId || '';
  if (reportId && prev && prev.reportId && prev.reportId !== reportId) {
    const oldRep = reportById(prev.reportId);
    const newRep = reportById(reportId);
    if (!confirm(`这次就诊已关联《${oldRep ? oldRep.title : '原来那份'}》。替换为《${newRep ? newRep.title : '新选的这份'}》？原来那份仍会保留在报告列表里。`)) return;
  }
  if (!reportId && newReportIds.length) reportId = newReportIds[0];

  const obj = normVisit({
    id: prev ? prev.id : newId('vis'),
    date: d.date,
    visitType: d.visitType,
    department: d.department,
    hospital: d.hospital,
    doctor: d.doctor,
    chief: d.chief,
    diagnosis: d.diagnosis,
    summary: d.summary,
    note: d.note,
    reportId,
    createdAt: prev ? prev.createdAt : Date.now()
  });
  visits = prev ? visits.map(x => x.id === prev.id ? obj : x) : [obj, ...visits];
  if (!persistHistory()) {
    showErr('没保存成功。检查「启动健康档案.bat」窗口是否有报错，然后点「保存记录」重试。');
    return;
  }
  ui.flash = { kind: 'visit', id: obj.id };
  const back = visitComposer.from || '#/records';
  const nFiles = newReportIds.length;
  visitComposer = null;
  goHash(back);
  toast(nFiles > 1
    ? `已保存 ${nFiles} 份资料，其中 1 份关联到本次就诊，其余在报告列表可查。`
    : '已保存');
}

/* 离开确认（027 §9.8）。就诊速记与存报告两个编辑器都要拦；
   只要有真实未保存内容就弹框，返回 true 表示已拦截。 */
function composerLeaveGuard(nextHash) {
  if (!composerDirty() && !reportDirty()) return false;
  openModal(`
    <div class="modal-head"><div><h2>这次记录还没保存</h2><p>离开会丢掉刚写的内容。</p></div></div>
    <div class="form-actions">
      <button class="btn btn-primary" type="button" data-act="cl-stay">继续填写</button>
      <button class="btn btn-danger-ghost" type="button" data-act="cl-discard" data-to="${esc(nextHash || '')}">放弃本次内容</button>
    </div>`);
  return true;
}

let reportComposer = null;   // { from, visitId, files:[{name,dataUrl,raw}], initial }

function renderReportComposer() {
  const q = hashQuery();
  const from = q.get('from') || '#/records';
  const visitId = q.get('visitId') || '';
  const v = visitId ? visitById(visitId) : null;
  if (visitId && !v) {
    setHead('', '存一份报告', '', '', false);
    $('#view').innerHTML = emptyStateHTML({
      icon: 'info', title: '这条就诊记录不在了', desc: '可能已被删除。',
      actions: `<a class="btn btn-primary" href="#/records">回到就医记录</a>`
    });
    return;
  }
  reportComposer = { from, visitId: v ? v.id : '', files: [], initial: '' };

  const visitOpts = ['<option value="">（不关联）</option>'].concat(
    visitsSorted().map(x => `<option value="${esc(x.id)}" ${reportComposer.visitId === x.id ? 'selected' : ''}>${esc(x.date)}　${esc(x.visitType || '就诊')}${x.department ? ' · ' + esc(x.department) : ''}</option>`)
  ).join('');

  setHead('', '存一份报告', '原件是核心，名称和日期以后可以补',
    `<button class="btn btn-secondary only-desktop" type="button" data-act="composer-cancel">取消</button>
     <button class="btn btn-primary only-desktop" type="button" data-act="report-save">保存原件</button>`, false);

  $('#view').innerHTML = `<div class="stack">
    <section class="card">
      <div class="card-head"><h2>添加原件</h2><span class="hint">拍照或选择图片，支持多选</span></div>
      <div class="form-actions" style="margin-top:0">
        <label class="btn btn-secondary" for="rpCam">${I.camera}拍照</label>
        <input id="rpCam" type="file" accept="image/*" capture="environment" hidden>
        <label class="btn btn-secondary" for="rpFiles">${I.upload}选择文件</label>
        <input id="rpFiles" type="file" accept="image/*" multiple hidden>
      </div>
      <div id="rpThumbs" style="margin-top:var(--sp-4)"></div>
      <p class="field-err" id="rpErr" role="alert" hidden></p>
    </section>

    <section class="card">
      <div class="form-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <div class="field">
          <label for="rpDate">报告日期</label>
          <input id="rpDate" type="date" value="">
          <span class="field-hint" id="rpDateHint">留空表示日期待确认，不会用今天代替。</span>
        </div>
        <div class="field"><label for="rpTitle">报告名称</label>
          <input id="rpTitle" maxlength="60" placeholder="如 肝肾常规，可留空">
        </div>
        <div class="field"><label for="rpHospital">医院 / 机构</label>
          <input id="rpHospital" maxlength="60" placeholder="如 市第一医院">
        </div>
        <div class="field"><label for="rpPanel">项目组套</label>
          <input id="rpPanel" list="rpPanels" maxlength="20" placeholder="如 生化" autocomplete="off">
          <datalist id="rpPanels">${PANELS.map(p => `<option value="${esc(p)}"></option>`).join('')}</datalist>
        </div>
        <div class="field"><label for="rpSpecimen">检验样本</label>
          <input id="rpSpecimen" list="rpSpecimens" maxlength="20" placeholder="如 血清" autocomplete="off">
          <datalist id="rpSpecimens">${SPECIMENS.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist>
        </div>
        <div class="field"><label for="rpNote">备注</label>
          <input id="rpNote" maxlength="300" placeholder="如 空腹抽血">
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>从图片提取文字（可选）</h2></div>
      <p class="hint">识别结果只是参考，不会自动变成诊断。识别失败不影响保存原件。</p>
      <div class="form-actions" style="margin-top:var(--sp-3)">
        <button class="btn btn-secondary" type="button" data-act="rp-ocr">提取文字</button>
      </div>
      <p class="hint" id="rpOcrState" role="status" style="margin-top:var(--sp-2)"></p>
      <div class="field" style="margin-top:var(--sp-3)">
        <label for="rpOcrText">识别到的文字（可编辑）</label>
        <textarea id="rpOcrText" style="min-height:120px" placeholder="识别结果会出现在这里，也可以直接粘贴报告文字"></textarea>
      </div>
    </section>

    <section class="card">
      <div class="field">
        <label for="rpVisit">关联就诊</label>
        <select id="rpVisit">${visitOpts}</select>
        <span class="field-hint">需要手动选：不会按「同一天」自动关联任何报告。</span>
      </div>
    </section>

    <div class="form-actions only-mobile">
      <button class="btn btn-primary" type="button" data-act="report-save">保存原件</button>
      <button class="btn btn-secondary" type="button" data-act="composer-cancel">取消</button>
    </div>
  </div>`;

  refreshReportThumbs();
  reportComposer.initial = reportSignature();

  ['rpDate', 'rpTitle', 'rpHospital', 'rpPanel', 'rpSpecimen', 'rpNote', 'rpVisit', 'rpOcrText']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => { reportComposer.initial = reportComposer.initial; });
    });
  ['rpFiles', 'rpCam'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      for (const f of files) {
        try {
          const dataUrl = await shrinkImage(f);
          reportComposer.files.push({ name: f.name || '原件', dataUrl, raw: f });
        } catch (err) { toast('这张图读不出来，换一张试试'); }
      }
      refreshReportThumbs();
    });
  });
}

function reportSignature() {
  if (!reportComposer) return '';
  const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  return JSON.stringify({
    date: g('rpDate'), title: g('rpTitle'), hospital: g('rpHospital'),
    panel: g('rpPanel'), specimen: g('rpSpecimen'), note: g('rpNote'),
    visit: g('rpVisit'), files: reportComposer.files.map(f => f.name)
  });
}
function refreshReportThumbs() {
  const host = document.getElementById('rpThumbs');
  if (!host || !reportComposer) return;
  host.innerHTML = reportComposer.files.length
    ? `<div class="thumb-grid">${reportComposer.files.map((f, i) => `
        <div class="thumb">
          <img src="${esc(f.dataUrl)}" alt="${esc(f.name || '原件')}">
          <button class="thumb-x" type="button" data-act="rp-file-del" data-i="${i}" aria-label="移除这份原件">${I.close}</button>
        </div>`).join('')}</div>`
    : `<p class="field-hint">还没有添加原件。也可以只登记信息，之后再来补原件。</p>`;
}

async function extractReportText() {
  if (!reportComposer) return;
  const state = document.getElementById('rpOcrState');
  const ta = document.getElementById('rpOcrText');
  const raw = reportComposer.files.find(f => f.raw);
  if (!raw) {
    if (state) state.textContent = '先添加一张图片，再提取文字。';
    return;
  }
  if (state) state.textContent = '正在识别…';
  try {
    const res = await ocrImages([raw.raw]);
    if (ta) ta.value = String(res.text || '').trim();
    if (state) state.textContent = res.text ? `识别到 ${res.n} 行文字，请核对后再用。` : '没能识别出文字，原件照样可以保存。';
  } catch (err) {
    const down = !err || /Failed to fetch|NetworkError|aborted|AbortError/i.test(String(err && err.message));
    if (state) state.textContent = down
      ? '没能识别文字（识别服务没连上）。原件已经存好，可以之后再补。'
      : '没能识别文字。原件可以照常保存，可以之后再补。';
  }
}

function saveReportComposer() {
  if (!reportComposer) return;
  const g = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const date = g('rpDate');
  const err = document.getElementById('rpErr');
  const showErr = msg => { if (err) { err.textContent = msg; err.hidden = false; } };
  if (err) err.hidden = true;
  if (date && !isISODate(date)) { showErr('报告日期格式不对，或先清空让它是「日期待确认」。'); return; }
  if (!reportComposer.files.length && !String(g('rpTitle') || '').trim()) {
    showErr('先加一张照片，或至少写一个报告名称。');
    return;
  }

  const base = {
    date,                                   // 允许为空：保存后标「日期待确认」，不用今天兜底
    title: String(g('rpTitle') || '').trim(),
    panel: g('rpPanel'), specimen: g('rpSpecimen'),
    hospital: g('rpHospital'), note: g('rpNote')
  };
  const next = reports.slice();
  const created = [];
  if (reportComposer.files.length) {
    reportComposer.files.forEach((f, i) => {
      const rec = normReport(Object.assign({
        id: newId('rep'),
        file: f.dataUrl
      }, base, {
        title: base.title || (reportComposer.files.length > 1 ? `报告原件 ${i + 1}` : '报告原件')
      }));
      next.push(rec);
      created.push(rec);
    });
  } else {
    const rec = normReport(Object.assign({ id: newId('rep'), file: '' }, base));
    next.push(rec);
    created.push(rec);
  }
  if (!persistReports(next)) {
    showErr('没存进本机存储，原件可能太大。把图片压小一点再试，或先去「我的」看存储状态。');
    return;
  }

  /* 从就诊详情进入：把第 1 份写回该就诊的 reportId（已有关联则先确认） */
  const v = reportComposer.visitId ? visitById(reportComposer.visitId) : null;
  if (v && created.length) {
    const first = created[0].id;
    if (!v.reportId) {
      visits = visits.map(x => x.id === v.id ? Object.assign({}, x, { reportId: first }) : x);
      persistHistory();
    } else if (v.reportId !== first) {
      const oldRep = reportById(v.reportId);
      if (confirm(`这次就诊已关联《${oldRep ? oldRep.title : '原来那份'}》。替换为《${created[0].title || '新存的这份'}》？原来那份仍会保留在报告列表里。`)) {
        visits = visits.map(x => x.id === v.id ? Object.assign({}, x, { reportId: first }) : x);
        persistHistory();
      }
    }
  }

  const back = reportComposer.from || '#/records';
  const n = created.length;
  reportComposer = null;
  goHash(back);
  toast(n > 1 ? `已保存 ${n} 份报告` : '已保存');
}

/* ======================= 第二批占位：日常健康 / 健康主题 / 我的 ======================= */
const DAILY_SEGS = ['body', 'vitals', 'symptoms', 'sleep'];
const LS_DAILY_SEG = 'personal-health-daily-seg-v1';

function currentDailySeg() {
  const q = hashQuery();
  const fromUrl = q.get('seg');
  if (DAILY_SEGS.includes(fromUrl)) return fromUrl;
  let saved = '';
  try { saved = localStorage.getItem(LS_DAILY_SEG) || ''; } catch (e) { saved = ''; }
  return DAILY_SEGS.includes(saved) ? saved : 'body';
}
function renderDailyShell() {
  const seg = currentDailySeg();
  try { localStorage.setItem(LS_DAILY_SEG, seg); } catch (e) { /* 隐私模式下忽略 */ }
  const q = hashQuery();
  if (seg === 'vitals') return renderVitals();
  if (seg === 'symptoms') return renderSymptoms();
  if (seg === 'sleep') return renderSleep();
  if (q.get('tab') === 'diet') { ui.slImSeg = 'diet'; return renderDiet(); }
  ui.slImSeg = 'overview';
  return renderWeight();
}
function renderThemesShell() { return renderIssues(); }
function renderThemeShell() {
  const id = hashQuery().get('id') || '';
  if (id) ui.issue = id;
  return renderIssues();
}
function renderMeShell() { return renderProfile(); }

/* 就诊摘要：支持 #/summary?visit=id 直达 */
function renderSummaryPage() {
  const q = hashQuery();
  const visitId = q.get('visit') || '';
  if (visitId && visitById(visitId)) ui.summary = { visit: visitId, from: '', to: '' };
  return renderSummary();
}
