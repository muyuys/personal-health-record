/* ======================= 渲染：外壳 ======================= */
const NAV = [
  { id: 'overview', label: '总览', icon: 'grid' },
  { id: 'issues', label: '健康问题', icon: 'check' },
  { id: 'labs', label: '检验指标', icon: 'pulse' },
  { id: 'timeline', label: '检查时间线', icon: 'clock' },
  { id: 'visits', label: '就诊记录', icon: 'file' },
  { id: 'meds', label: '用药记录', icon: 'pill' },
  { id: 'todo', label: '复诊待办', icon: 'todo' },
  { id: 'weight', label: '减重记录', icon: 'trend' },
  { id: 'diet', label: '减重执行', icon: 'symptom' },
  { id: 'sleep', label: '睡眠', icon: 'clock' },
  { id: 'vitals', label: '生命体征', icon: 'heart' },
  { id: 'symptoms', label: '症状日记', icon: 'symptom' }
];

function buildNav() {
  $('#nav').innerHTML = NAV.map(n => `
    <button class="nav-item" data-act="go" data-to="${n.id}">
      ${I[n.icon]}<span>${n.label}</span>
      ${n.id === 'todo' ? `<em class="count" data-count="todo" style="font-style:normal">${openTodos().length}</em>` : ''}
      ${n.id === 'todo' || n.id === 'meds' ? `<em class="rdot" data-rdot="${n.id}" style="font-style:normal" hidden></em>` : ''}
    </button>`).join('');
  $('#tabbar').innerHTML = NAV.filter(n => ['overview', 'issues', 'labs', 'todo'].includes(n.id))
    .map(n => `<button class="tab" data-act="go" data-to="${n.id}">${I[n.icon]}<span>${n.label.replace('检查时间线', '时间线')}</span></button>`)
    .join('') + `<button class="tab" data-act="more">${I.more}<span>更多</span></button>`;
}

function syncChrome(page) {
  /* 全部记录页从属于「检验指标」，侧栏仍高亮它，不让用户觉得跳出了模块 */
  const navKey = page === 'labs-all' ? 'labs' : (page === 'summary' ? 'visits' : page);
  $$('#nav .nav-item').forEach(b => b.classList.toggle('active', b.dataset.to === navKey));
  $$('#tabbar .tab').forEach(b => b.classList.toggle('on', b.dataset.to === navKey));
  const c = $('[data-count="todo"]');
  if (c) c.textContent = openTodos().length;
  // 到期提醒红点：复诊待办 / 用药记录上有到期或临近项时显示数量（当天已忽略的不计）
  const rb = reminderCountByPage();
  $$('[data-rdot]').forEach(e => {
    const n = rb[e.dataset.rdot] || 0;
    e.hidden = n <= 0;
    e.textContent = n > 0 ? String(n) : '';
    e.title = n > 0 ? `${n} 项到期提醒` : '';
  });
}

function setHead(eyebrow, title, sub, actions, withSearch = true) {
  $('#pageEyebrow').textContent = eyebrow;
  $('#pageTitle').textContent = title;
  $('#pageSub').textContent = sub;
  $('#pageActions').innerHTML = (withSearch ? `<button class="icon-btn" data-act="search" aria-label="搜索档案">${I.search}</button>` : '') + (actions || '');
}

/* 空状态引导卡：关键页无数据时给出「下一步该填什么」，可带编号步骤与动作按钮。
   desc / steps 里的 HTML 由调用方自带（按钮需 data-act），title 做转义。 */
function emptyGuide({ icon = 'info', title = '', desc = '', steps = [], actions = '', solid = false } = {}) {
  return `<div class="guide${solid ? ' solid' : ''}">
    <div class="g-icon">${I[icon] || I.info}</div>
    <div class="g-body">
      ${title ? `<h3>${esc(title)}</h3>` : ''}
      ${desc ? `<p class="g-desc">${desc}</p>` : ''}
      ${steps.length ? `<ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol>` : ''}
      ${actions ? `<div class="g-actions">${actions}</div>` : ''}
    </div>
  </div>`;
}

/* ======================= 渲染：总览 ======================= */
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
function dateEyebrow() {
  const d = new Date();
  return `${d.getFullYear()} · ${pad(d.getMonth() + 1)} · ${pad(d.getDate())}　星期${WEEK[d.getDay()]}`;
}

function statusChip(key, small = false) {
  const s = (ARCHIVE.statuses && (ARCHIVE.statuses[key] || ARCHIVE.statuses.pending)) || { label: '待补充', tone: 'amber' };
  return `<span class="chip ${s.tone}${small ? ' chip-sm' : ''}">${s.label}</span>`;
}

function renderOverview() {
  setHead(dateEyebrow(), '档案总览',
    `${(ARCHIVE.issues || []).length} 个健康主题　·　最近更新 ${ARCHIVE.updated || '未记录'}`,
    `<label class="search">${I.search}<input id="searchInput" placeholder="搜索问题、药品、指标" aria-label="搜索"> <kbd>/</kbd></label>
     <button class="btn btn-primary" data-act="record">${I.plus}记录一次</button>`, false);

  const w = latestWeight();
  const bmi = bmiNow();
  const waist = waistNow();
  const bl = baselineInfo();
  const pct = progressPct();
  const target = wtTarget();
  const startKg = wtStart();
  const gap = (w && target !== null) ? (w.kg - target).toFixed(1) : null;
  const comp = completeness();
  const tasks = openTodos().slice(0, 3);
  const events = (ARCHIVE.timeline || []).slice(0, 3);
  const themes = ['weight', 'ankle', 'eyes', 'septum', 'liver', 'hair']
    .map(id => (ARCHIVE.issues || []).find(i => i.id === id)).filter(Boolean);

  /* 没有称重记录时不能编一个数字：基线卡直接说「还没有」，其余显示 — */
  const heroNote = !w
    ? '还没有称重记录。记下第一次体重后，这里会算距目标的距离与进度'
    : gap === null
      ? '档案里还没设长期目标，进度暂不计算'
      : bl.ok
        ? `晨重基线 ${kg1(bl.kg)} kg（最近 7 个晨重日均值）　·　距目标 ${gap} kg`
        : `距目标 ${gap} kg　·　${bl.days ? `已有 ${bl.days} 天晨重，还需 ${bl.need} 天建立基线` : '尚未开始晨重记录，基线待建立'}`;
  const heroSub = !w
    ? '还没有称重记录'
    : `${esc(w.date)} ${w.tag === 'morning' ? '晨重' : '自报体重'}${bl.ok ? '' : '，尚未建立晨重基线'}`;

  $('#view').innerHTML = `
  <div class="stack">
    ${criticalAllergies().length ? `<section class="allergy-alert">${I.info}<div>
      <b>危急过敏 · 急救提示</b>
      <p>${criticalAllergies().map(a => `${esc(a.name)}（${esc(a.category || '未分类')}${a.reaction ? '：' + esc(a.reaction) : ''}）`).join('；')}。就诊、用药前务必告知医生。</p>
      <button class="band-link" data-act="go" data-to="profile">查看过敏档案 →</button>
    </div></section>` : ''}
    ${reminderBandHTML()}
    <section class="hero">
      <div class="hero-left">
        <p class="hero-label">身体基线　BASELINE</p>
        <div class="hero-num"><b>${w ? kg1(w.kg) : '—'}</b><span>kg</span></div>
        <p class="hero-sub">${heroSub}</p>
      </div>
      <div class="hero-div"></div>
      <div class="hero-stats">
        <div class="stat"><small>BMI</small><b>${bmi === null ? '—' : bmi.toFixed(1)}</b><i class="${bmi !== null && bmi >= 24 ? 'warn' : ''}">${bmi === null ? '待记录体重' : bmi >= 24 ? '偏高' : '正常范围'}</i></div>
        <div class="stat"><small>身高</small><b>${ARCHIVE.profile.height || '—'}</b><i>cm</i></div>
        <div class="stat"><small>长期目标</small><b>${target === null ? '—' : target.toFixed(1)}</b><i>${target === null ? '未设' : 'kg'}</i></div>
        <div class="stat"><small>腰围</small><b style="font-size:${waist ? '22px' : '19px'}">${waist ? num(waist) : '待测'}</b><i>${waist ? 'cm' : '建议本周补录'}</i></div>
      </div>
      <div class="hero-progress">
        <div class="hp-row"><span>减重进度</span><b>${pct === null ? '—' : Math.round(pct) + ' %'}</b></div>
        <div class="track"><i style="width:${pct === null ? 0 : Math.max(pct, 2)}%"></i></div>
        <div class="hp-scale"><span>${startKg === null ? '起点未设' : startKg.toFixed(1) + ' kg 起点'}</span><span>${target === null ? '目标未设' : target.toFixed(1) + ' kg'}</span></div>
        <p class="hp-note">${heroNote}</p>
      </div>
    </section>

    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>需要处理</h2><span class="chip warn chip-sm">${openTodos().length} 项待核对</span></div>
        ${tasks.length ? tasks.map(t => `
          <div class="task">
            <button class="check" data-act="todo" data-id="${t.id}" aria-label="标记完成"></button>
            <div class="task-body">
              <p class="task-text">${esc(t.text)}</p>
              <p class="task-meta ${t.flag ? 'flag' : ''}">${esc(t.meta)}</p>
            </div>
          </div>`).join('') : `<div class="empty">${allTodos().length ? '所有待办已勾选。新增问题或复查后记得补充记录。' : '还没有待办。新增健康问题、登记复查后，这里会自动列出要跟进的事。'}</div>`}
        <div style="margin-top:14px"><button class="btn-plain" data-act="go" data-to="todo">查看全部 ${allTodos().length} 项 →</button></div>
      </section>

      <section class="card">
        <div class="card-head"><h2>最近记录</h2><button class="link" data-act="go" data-to="timeline">查看时间线</button></div>
        ${events.length ? events.map(e => `
          <div class="event">
            <div class="event-date">${esc(e.date.slice(5))}<span>${esc(e.date.slice(0, 4))}</span></div>
            <div><p class="event-title">${esc(e.type)}</p><p class="event-meta">${esc(e.text)}</p></div>
          </div>`).join('') : '<div class="empty">还没有事件记录。新增检查、就诊或检验后，这里会按日期列出。</div>'}
      </section>
    </div>

    <div class="section-head">
      <div><h2>健康主题</h2><p>${(ARCHIVE.issues || []).length} 个主题，其中 ${(ARCHIVE.issues || []).filter(i => ['pending', 'stub'].includes(i.status)).length} 个仍待补充信息</p></div>
      <button class="btn-plain" data-act="go" data-to="issues">全部主题</button>
    </div>
    <div class="grid-cards">
      ${themes.length ? themes.map(t => `
        <button class="theme-card" data-act="issue" data-id="${t.id}">
          <div class="tc-head"><span class="tc-name">${esc(t.name)}</span>${statusChip(t.status, true)}</div>
          <p>${esc(t.card)}</p>
          <small>${esc(t.lastDate)}　${esc(t.lastLabel)}</small>
        </button>`).join('') : '<div class="empty" style="padding:22px 12px;text-align:center">还没有健康主题。点右上「记录一次」或到「健康问题」新增，先建起要跟踪的问题。</div>'}
    </div>

    <section class="band">
      <div class="band-score"><small>档案完整度</small><b>${comp.pct}<em>%</em></b></div>
      <div class="band-bar"><i style="width:${comp.pct}%"></i></div>
      <div class="band-div"></div>
      <div class="band-missing">
        <small>仍缺信息（基础资料 ${comp.okP}/${comp.totalP}　主题 ${comp.okI}/${comp.totalI}）</small>
        <div class="chips">${comp.missing.map(m => `<span class="chip">${esc(m)}</span>`).join('')}</div>
      </div>
      <button class="band-link" data-act="go" data-to="issues">补齐档案 →</button>
    </section>
  </div>`;
}

/* ======================= 渲染：健康问题 ======================= */
function renderIssues() {
  const counts = { all: ARCHIVE.issues.length };
  ARCHIVE.issues.forEach(i => counts[i.status] = (counts[i.status] || 0) + 1);
  const filters = [
    ['', '全部', counts.all],
    ['active', '记录中', counts.active || 0],
    ['followup', '待复诊', counts.followup || 0],
    ['monitor', '监测中', counts.monitor || 0],
    ['history', '历史记录', counts.history || 0],
    ['pending', '待补充', counts.pending || 0],
    ['stub', '仅目录', counts.stub || 0]
  ];
  const list = ARCHIVE.issues.filter(i => !ui.issueFilter || i.status === ui.issueFilter);
  if (!list.some(i => i.id === ui.issue)) ui.issue = list[0] ? list[0].id : '';
  const cur = ARCHIVE.issues.find(i => i.id === ui.issue) || list[0];

  setHead('HEALTH ISSUES　健康问题', '健康问题',
    `${ARCHIVE.issues.length} 个主题　·　医院报告、本人描述与辅助分析分开标注`,
    `<button class="btn btn-primary" data-act="newissue">${I.plus}新增问题</button>`);

  $('#view').innerHTML = `
    <div class="filter-row">
      ${filters.map(([k, label, n]) => `<button class="filter-chip ${ui.issueFilter === k ? 'on' : ''}" data-act="filter" data-k="${k}">${label} ${n}</button>`).join('')}
    </div>
    <div class="issues-layout">
      <div class="card issue-list">
        <div class="list-head"><span>${ui.issueFilter ? (ARCHIVE.statuses[ui.issueFilter] || {}).label : '全部主题'}</span><small>按最近记录排序</small></div>
        ${list.map(i => `
          <button class="issue-item ${i.id === ui.issue ? 'on' : ''}" data-act="issue" data-id="${i.id}">
            <span class="dot ${ARCHIVE.statuses[i.status].tone}"></span>
            <span class="nm">${esc(i.name)}</span>
            <span class="mt">${esc(i.lastDate === '未记录' ? '未记录' : i.lastDate.slice(5))} · ${esc(i.lastLabel)}</span>
          </button>`).join('') || '<div class="empty" style="margin:10px">该筛选下暂无主题</div>'}
      </div>
      ${cur ? issueDetail(cur) : '<div class="card empty">请选择一个主题</div>'}
    </div>`;
}

function issueDetail(i) {
  return `
    <div class="card issue-detail">
      <div class="detail-head">
        <div>
          <h2>${esc(i.name)} ${statusChip(i.status)}</h2>
          <p class="meta">${esc(i.head)}</p>
        </div>
        <button class="detail-edit chip ghost" data-act="issue-edit" data-id="${esc(i.id)}">编辑状态 / 备注</button>
      </div>
      <div class="divider"></div>
      <div>
        <p class="block-label">证据与不确定性　EVIDENCE</p>
        ${i.evidence.map(e => `
          <div class="evidence">
            <span class="tag ${e.type === '医院报告' ? 'report' : e.type === '本人描述' ? 'self' : e.type === '建议计划' ? 'plan' : 'analysis'}">${esc(e.type)}</span>
            <p>${esc(e.text)}</p>
          </div>`).join('')}
      </div>
      <div class="need-box"><b>仍需补充</b><p>${esc(i.need)}</p></div>
      ${i.userNote ? `<div class="need-box" style="background:#F1ECE0"><b>我的备注</b><p>${esc(i.userNote)}</p></div>` : ''}
      ${i.files.length ? `
      <div>
        <p class="block-label">关联资料　FILES</p>
        ${i.files.map(f => `<a class="file-row" href="${esc(f.href)}">${I.file}<span>${esc(f.name)}</span><span class="fm">${esc(f.meta)}</span></a>`).join('')}
      </div>` : ''}
      ${i.timeline.length ? `
      <div>
        <p class="block-label">近期检查　TIMELINE</p>
        ${i.timeline.map(t => `<div class="tl-row"><time>${esc(t.date)}</time><p>${esc(t.text)}</p></div>`).join('')}
      </div>` : ''}
      <div class="detail-actions">
        <button class="btn btn-primary" data-act="record" data-kind="weight">记录一次</button>
        <button class="btn btn-ghost" data-act="issue-recheck" data-id="${i.id}">标记为已复诊</button>
        <span class="hint" style="align-self:center">勾选只同步待办清单，不改变病历文件</span>
      </div>
    </div>`;
}

/* ======================= 渲染：检验指标 ======================= */
function metricOptions(list = labs) {
  const map = new Map();
  // 只有数值结果能画趋势；定性结果（value 为 null）不参与，避免图上出现空点
  list.filter(r => r.value !== null && r.value !== undefined && Number.isFinite(r.value)).forEach(r => {
    const k = labKey(r);
    const prev = map.get(k);
    if (!prev || r.date >= prev.date) map.set(k, r);
  });
  return Array.from(map.entries()).map(([k, r]) => ({ key: k, ...r }));
}
function metricPoints(key, list = labs) {
  return list.filter(r => labKey(r) === key).sort((a, b) => a.date.localeCompare(b.date));
}
function cutoffDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function scopedLabs() {
  if (ui.labsRange !== '1y') return labs;
  const cut = cutoffDate();
  return labs.filter(r => r.date >= cut);
}

const DEMO_POINTS = [
  { date: '2026-03-12', value: 79 },
  { date: '2026-06-05', value: 85 },
  { date: '2026-08-19', value: 93 },
  { date: '2026-10-22', value: 88 }
];

function renderLabs() {
  setHead('LAB RESULTS　检验记录', '检验指标',
    '只连接同名、同单位的结果；不同检测方法之间不作比较',
    `<div class="segmented">
       <button data-act="range" data-v="all" class="${ui.labsRange === 'all' ? 'on' : ''}">全部</button>
       <button data-act="range" data-v="1y" class="${ui.labsRange === '1y' ? 'on' : ''}">近 1 年</button>
     </div>
     <div class="btn-row">
       <button class="btn btn-ghost" data-act="go" data-to="labs-all">${I.file}全部记录</button>
       <button class="btn btn-ghost" data-act="import">${I.upload}导入报告</button>
       <button class="btn btn-primary" data-act="newlab">${I.plus}录入结果</button>
     </div>`);

  const scoped = scopedLabs();
  const allEmpty = !labs.length;
  if (!allEmpty) ui.demo = false;
  const empty = !scoped.length;
  const filtering = ui.labsRange === '1y';

  const metrics = metricOptions(scoped);
  const hasChart = metrics.length > 0;
  if (metrics.length && !metrics.some(m => m.key === ui.metric)) {
    // 默认挑「记录最多、有异常、最近」的指标，避免一进来就停在只有一条记录的空图上
    const rank = metrics.map(m => ({
      key: m.key,
      n: metricPoints(m.key, scoped).length,
      bad: isAbnormal(m) ? 1 : 0,
      date: m.date || ''
    })).sort((a, b) => b.n - a.n || b.bad - a.bad || b.date.localeCompare(a.date));
    ui.metric = rank[0].key;
  }
  const pts = metrics.length ? metricPoints(ui.metric, scoped) : [];
  const cur = pts.at(-1);

  /* 图表区空状态：三种情况都换成带「下一步」的引导卡 */
  const chartEmptyHTML = allEmpty
    ? emptyGuide({
      icon: 'pulse', title: '还没有检验数据',
      desc: '把化验单拍照或把报告文字粘贴进来，可一次识别多项；也可以逐项手动录入。图表只连接同名、同单位的结果。',
      steps: ['导入或粘贴报告文字，自动拆出检验项', '逐项核对数值、单位与参考范围', '异常项会自动进入「健康问题」总览', '之后回到这里按指标查看趋势'],
      actions: `<button class="btn btn-primary" data-act="newlab">${I.plus}录入第一条结果</button><button class="btn btn-ghost" data-act="import">${I.upload}粘贴报告文字导入</button>`
    })
    : empty
      ? emptyGuide({
        icon: 'clock', title: '近 1 年没有检验记录',
        desc: `统计自 ${esc(cutoffDate())} 起没有结果；更早的记录仍在，可切到「全部」查看。`,
        actions: `<button class="btn btn-ghost" data-act="range" data-v="all">查看全部记录</button>`
      })
      : emptyGuide({
        icon: 'file', title: '暂无可画趋势的数值指标',
        desc: '当前只有定性结果（如阴性 / 阳性），没有数值和参考区间可画线；它们已保存在下方「最近录入」和「全部记录」，不会丢。',
        actions: `<button class="btn btn-ghost" data-act="go" data-to="labs-all">查看全部记录</button>`
      });

  /* 参考区间缺失时不能笼统说「均正常」——空白不等于正常 */
  const ptsLegend = (list) => {
    const bad = list.filter(isAbnormal).length;
    const unknown = list.filter(p => p.low === null && p.high === null).length;
    let s = `${list.length} 次结果`;
    if (bad) s += `，${bad} 次超出参考区间`;
    if (unknown) s += `，${unknown} 次无参考区间`;
    if (!bad && !unknown) s += '，均在参考范围内';
    return s;
  };

  const title = ui.demo ? '肌酐'
    : allEmpty ? '还没有检验数据'
      : empty ? '近 1 年没有记录'
        : !hasChart ? '暂无可绘制趋势的指标'
          : cur.name;
  const sub = ui.demo ? '示例数据　·　4 次记录　·　单位 μmol/L'
    : allEmpty ? '添加第一条结果后，这里会显示趋势'
      : empty ? `截至 ${cutoffDate()} 之后没有结果，可切换到「全部」查看`
        : !hasChart ? '定性结果无单位/参考区间，不画趋势；可在下方「最近录入」与「全部记录」查看'
          : `${cur.category}　·　${pts.length} 次记录　·　单位 ${cur.unit}`;

  $('#view').innerHTML = `
    <div class="stack">
      <section class="card chart-card">
        <div class="chart-head">
          <div class="chart-title">
            <h2 id="chartName">${esc(title)}</h2>
            <p id="chartSub">${esc(sub)}</p>
          </div>
          <div class="chart-tools">
            ${ui.demo ? `<span class="chip amber chip-sm">示例数据</span>` : ''}
            ${ui.demo
      ? `<button class="btn btn-ghost" data-act="demo-off">退出示例</button>`
      : (empty ? (allEmpty ? `<button class="btn btn-ghost" data-act="demo-on">预览示例</button>` : `<button class="btn btn-ghost" data-act="range" data-v="all">查看全部</button>`)
        : `<label class="select"><select id="metricSelect" aria-label="选择指标">
              ${metrics.map(m => `<option value="${esc(m.key)}" ${m.key === ui.metric ? 'selected' : ''}>${esc(m.name)} · ${esc(m.unit)}</option>`).join('')}
            </select></label>`)}
          </div>
        </div>
        ${(!ui.demo && !hasChart) ? `<div style="margin-top:10px">${chartEmptyHTML}</div>` : `
          <div class="chart-box" id="chartBox"></div>
          <div class="chart-foot">
            <div class="legend">
              <span><i></i>${ui.demo ? '示例结果' : ptsLegend(pts)}</span>
              <span><i class="sq"></i>${ui.demo ? '底色为参考区间 57 – 97' : (cur.low !== null || cur.high !== null ? `底色为参考区间 ${cur.low ?? '—'} – ${cur.high ?? '—'} ${esc(cur.unit)}` : '该指标未填写参考范围')}</span>
            </div>
            <p class="chart-note">单点表示一次检查；参考区间随实验室方法变化</p>
          </div>`}
      </section>

      <div class="grid-2 labs-grid">
        <section class="card">
          <div class="card-head">
            <h2>最近录入</h2>
            <button class="link link-btn" data-act="go" data-to="labs-all">${filtering ? `近 1 年 ${scoped.length} 条` : `全部 ${labs.length} 条`} →</button>
          </div>
          ${scoped.length ? `
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>日期</th><th>指标</th><th style="text-align:right">结果</th><th>提示</th><th>单位</th><th style="text-align:right">参考</th><th>报告</th><th></th></tr></thead>
              <tbody>
                ${scoped.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map(r => {
          const rep = r.reportId ? reportById(r.reportId) : null;
          return `
                  <tr>
                    <td class="date">${esc(r.date)}</td>
                    <td>${esc(r.name)}<span class="cat-tag"> ${esc(r.category)}</span>${rep ? `<span class="r-m">　${esc(reportShort(rep.title))}</span>` : ''}</td>
                    <td class="num${isAbnormal(r) ? ' over' : ''}">${labValueText(r)}<span class="u-m"> ${esc(r.unit)}</span></td>
                    <td class="flag">${labFlagCell(r)}</td>
                    <td class="unit-col" style="color:var(--muted-2);font-size:10px">${esc(r.unit)}</td>
                    <td class="ref">${esc(labRange(r))}</td>
                    <td class="report-col">${rep
              ? `<button class="rp-link" data-act="viewreport" data-id="${esc(rep.id)}" title="查看报告原件：${esc(rep.title)}">${esc(reportShort(rep.title))}</button>`
              : '<span class="na">—</span>'}</td>
                    <td class="act"><button data-act="editlab" data-id="${esc(r.id)}">编辑</button><button class="danger" data-act="dellab" data-id="${esc(r.id)}">删除</button></td>
                  </tr>`;
        }).join('')}
              </tbody>
            </table>
          </div>
          <p class="hint" style="margin-top:10px">「提示」列只与该条记录填写的参考范围比较，未填范围时显示 —；「报告」列为该结果的来源原件。${scoped.length > 8 ? `本表只放最近 8 条，共 ${scoped.length} 条 —— <button class="link-btn" data-act="go" data-to="labs-all">在全部记录里查看和修改</button>。` : `需要按项目或来源查找时，用上方「全部记录」。`}</p>
          ` : emptyGuide({
            icon: 'pulse', title: allEmpty ? '还没有录入结果' : '该时间段内没有记录',
            desc: allEmpty ? '在图表区点「录入第一条结果」或「粘贴报告文字导入」即可开始；保存后会出现在这里。' : '切到「全部」可查看更早的结果。',
            actions: allEmpty
              ? `<button class="btn btn-primary" data-act="newlab">${I.plus}录入第一条结果</button>`
              : `<button class="btn btn-ghost" data-act="range" data-v="all">查看全部</button>`
          })}
        </section>

        <section class="card" style="height:100%">
          <div class="card-head"><h2>指标清单</h2><span class="link">${metrics.length} 种</span></div>
          ${metrics.length ? `<div class="metric-list">
            ${metrics.map(m => `<button class="metric-row" data-act="pick" data-k="${esc(m.key)}">
              <span>${esc(m.name)}<span>${esc(m.unit)}</span></span><b>${esc(m.value)}</b>
            </button>`).join('')}
          </div>` : '<div class="empty">还没有可用于比较的指标。<br>录入带单位与参考范围的数值结果后，这里可按指标切换查看。<br><button class="link-btn" style="margin-top:8px;color:var(--pine-2)" data-act="newlab">录入一条结果 →</button></div>'}
        </section>
      </div>

      <section class="card">
        <div class="card-head">
          <h2>报告原件</h2>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="hint">${reports.length ? `共 ${reports.length} 份` : '还没有'}</span>
            <button class="btn btn-ghost" data-act="newreport">${I.plus}添加报告</button>
          </div>
        </div>
        ${reports.length ? `<div class="report-list">
          ${reports.slice().sort((a, b) => b.date.localeCompare(a.date)).map(r => {
        const n = labCountOf(r.id);
        return `<div class="report-item">
              <button class="rp-thumb" data-act="viewreport" data-id="${esc(r.id)}" aria-label="查看原件">
                ${r.file && !reportFileMissing(r)
            ? `<img src="${esc(r.file)}" alt="" onerror="this.style.display='none';var m=this.nextElementSibling;if(m)m.style.display='block'"><span class="rp-miss" style="display:none">原件缺失<br>${esc(fileBase(r.file))}</span>`
            : reportFileMissing(r)
              ? `<span class="rp-miss">原件缺失<br>${esc(fileBase(r.file))}</span>`
              : `<span>无原件</span>`}
              </button>
              <div class="rp-main">
                <div class="rp-title">${esc(r.title)}${r.panel ? `<span class="cat-tag"> ${esc(r.panel)}</span>` : ''}${r.specimen ? `<span class="cat-tag spec"> ${esc(r.specimen)}</span>` : ''}<span class="chip chip-sm${n ? ' green' : ' mute'}">${n ? `${n} 项结果` : '未关联'}</span></div>
                <div class="rp-meta">${esc(r.date)}${r.hospital ? `　·　${esc(r.hospital)}` : ''}${r.note ? `　·　${esc(r.note)}` : ''}${reportFileMissing(r) ? `　·　<em style="color:var(--warn)">原件缺失：${esc(r.file)}</em>` : ''}</div>
              </div>
              <div class="rp-acts">
                <button data-act="viewreport" data-id="${esc(r.id)}">查看</button>
                <button data-act="editreport" data-id="${esc(r.id)}">编辑</button>
                <button class="danger" data-act="delreport" data-id="${esc(r.id)}">删除</button>
              </div>
            </div>`;
      }).join('')}
        </div>` : `<div class="empty">还没有报告原件。<br>把化验单拍照或截图存进来，之后每条结果都能对回它；不存原件也能只登记信息，结果里的报告项留空即可。</div>`}
      </section>

      <section class="card">
        <div class="card-head">
          <h2>报告原件文件（磁盘）</h2>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="hint">${storeMode === 'server' ? (originalsLoaded ? `共 ${originals.length} 个文件` : '读取中…') : '需启动本机服务'}</span>
            ${storeMode === 'server' ? `<button class="btn btn-ghost" data-act="reload-originals">${I.pulse}刷新</button>` : ''}
          </div>
        </div>
        ${storeMode !== 'server'
      ? `<div class="empty">报告原件文件列表需要本机服务（server/health_server.py）。<br>启动后会自动读取 <code>data/报告原件</code> 目录下的图片 / PDF / 影像文件。</div>`
      : (!originalsLoaded ? `<div class="empty">正在读取 data/报告原件 …</div>`
        : (!originals.length
          ? `<div class="empty">data/报告原件 目录里还没有可查看的文件。<br>把报告照片或 PDF 放进 <code>data/报告原件</code>（或其 files/ 子目录）后点「刷新」。</div>`
          : `<div class="orig-list">
            ${originals.map(o => `<div class="orig-item">
              <div class="orig-main">
                <div class="orig-name">${esc(o.name)}</div>
                <div class="orig-meta">${esc(o.dir)}　·　${fmtSize(o.size)}</div>
              </div>
              <div class="orig-acts">
                <button data-act="vieworiginal" data-path="${esc(o.path)}" data-name="${esc(o.name)}">查看</button>
                <a href="${esc(originalUrl(o.path))}" target="_blank" rel="noopener">新窗口</a>
              </div>
            </div>`).join('')}
          </div>`))}
      </section>

      <section class="card">
        <div class="card-head"><h2>备份与恢复</h2><span class="link">${storageOK ? '本机存储可用' : '本机存储不可用'}</span></div>
        <p class="hint" style="margin-bottom:12px">备份包含检验结果、体重记录和待办勾选状态；原始病历、报告与影像文件请另行备份。导入按记录 ID 合并，同 ID 以备份内容更新。</p>
        <div class="form-actions" style="margin:0">
          <button class="btn btn-ghost" data-act="export">${I.download}导出 JSON 备份</button>
          <button class="btn btn-ghost" data-act="import">${I.upload}导入数据</button>
        </div>
      </section>
    </div>`;

  const box = $('#chartBox');
  if (box) {
    if (ui.demo) {
      echartsChart(box, {
        series: [{ name: (cur && cur.name) || '示例', points: DEMO_POINTS }],
        low: 57, high: 97, unit: 'μmol/L'
      });
    } else if (pts.length) {
      echartsChart(box, {
        series: [{ name: (cur && cur.name) || '指标', points: pts.map(p => ({ date: p.date, value: p.value })) }],
        low: cur.low, high: cur.high, unit: cur.unit
      });
    }
  }

  const sel = $('#metricSelect');
  if (sel) sel.addEventListener('change', () => { ui.metric = sel.value; renderLabs(); });
}

/* ======================= 渲染：全部检验记录 ======================= */
/* 「最近录入」只放 8 条，早期记录在那边找不到编辑入口 —— 这一页放全部，按项目/类别/来源筛 */
function labAllRows() {
  const f = ui.labAll;
  const q = f.q.trim().toLowerCase();
  const cut = f.range === '1y' ? cutoffDate() : '';
  return labs
    .filter(r => {
      if (cut && r.date < cut) return false;
      if (f.cat && r.category !== f.cat) return false;
      if (f.rep === '__none__') { if (r.reportId) return false; }
      else if (f.rep && r.reportId !== f.rep) return false;
      if (!q) return true;
      const rep = r.reportId ? reportById(r.reportId) : null;
      return [r.name, r.note, r.category, r.unit, r.value, r.qualitative || '', r.date, r.source,
        rep ? rep.title : '', rep ? rep.hospital : '', rep ? rep.panel : '', rep ? rep.specimen : '']
        .join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.category.localeCompare(b.category, 'zh') || a.name.localeCompare(b.name, 'zh'));
}

function renderLabAll() {
  const f = ui.labAll;
  const cats = [...new Set(labs.map(r => r.category))].sort((a, b) => {
    const ia = CATS.indexOf(a), ib = CATS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'zh');
  });
  const reps = reports.slice().sort((a, b) => b.date.localeCompare(a.date));

  setHead('LAB ARCHIVE　检验记录', '全部检验记录',
    '不按“最近”截断：全部结果都在这里，逐条可改',
    `<div class="segmented">
       <button data-act="laball-range" data-v="all" class="${f.range === 'all' ? 'on' : ''}">全部时间</button>
       <button data-act="laball-range" data-v="1y" class="${f.range === '1y' ? 'on' : ''}">近 1 年</button>
     </div>
     <div class="btn-row">
       <button class="btn btn-ghost" data-act="go" data-to="labs">${I.pulse}趋势图</button>
       <button class="btn btn-primary" data-act="newlab">${I.plus}录入结果</button>
     </div>`, false);

  $('#view').innerHTML = `
    <div class="stack">
      <section class="card">
        <div class="laball-toolbar">
          <label class="search">${I.search}<input id="labAllQ" value="${esc(f.q)}" placeholder="项目、备注、医院" aria-label="搜索检验记录"></label>
          <label class="select"><select id="labAllCat" aria-label="按项目类别筛选">
            <option value="">全部类别</option>
            ${cats.map(c => `<option value="${esc(c)}" ${f.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select></label>
          <label class="select"><select id="labAllRep" aria-label="按来源报告筛选">
            <option value="">全部来源</option>
            ${reps.map(r => `<option value="${esc(r.id)}" ${f.rep === r.id ? 'selected' : ''}>${esc(r.date)}　${esc(reportShort(r.title))}</option>`).join('')}
            <option value="__none__" ${f.rep === '__none__' ? 'selected' : ''}>未关联报告</option>
          </select></label>
        </div>
        <div class="laball-sum" id="labAllSum"></div>
        <div class="detail-fold-host" id="labAllFoldHost"></div>
        <p class="hint" style="margin-top:10px">「提示」列只与这条记录自己填的参考范围比较，未填范围时显示 —，不代表正常。报告拍照件的查看与编辑在<button class="link-btn" data-act="go" data-to="labs">检验指标页</button>下方。删除不可撤销，改之前建议先导出备份。</p>
      </section>
    </div>`;

  const q = $('#labAllQ');
  q.addEventListener('input', () => { f.q = q.value; paintLabAll(); });
  $('#labAllCat').addEventListener('change', e => { f.cat = e.target.value; paintLabAll(); });
  $('#labAllRep').addEventListener('change', e => { f.rep = e.target.value; paintLabAll(); });
  paintLabAll();
}

function paintLabAll() {
  const host = $('#labAllFoldHost'), sum = $('#labAllSum');
  if (!host) return;
  const rows = labAllRows();
  const bad = rows.filter(isAbnormal).length;
  const unknown = rows.filter(r => !r.qualitative && r.low === null && r.high === null).length;
  const days = new Set(rows.map(r => r.date)).size;
  const repN = new Set(rows.map(r => r.reportId).filter(Boolean)).size;

  if (sum) {
    sum.innerHTML = `<span><b>${rows.length}</b> / ${labs.length} 条</span>
      <span><b>${days}</b> 次检查</span>
      <span><b>${repN}</b> 份报告</span>
      ${bad ? `<span class="warn"><b>${bad}</b> 条超出参考区间</span>` : ''}
      ${unknown ? `<span><b>${unknown}</b> 条未填参考范围，不能当作正常</span>` : ''}`;
  }

  if (!labs.length) {
    host.innerHTML = emptyGuide({
      icon: 'pulse', title: '还没有检验记录',
      desc: '可以粘贴报告文字一次识别多项，也可以逐条录入；全部结果都会汇总在这里，逐条可改。',
      actions: `<button class="btn btn-primary" data-act="newlab">${I.plus}录入结果</button><button class="btn btn-ghost" data-act="import">${I.upload}粘贴报告文字导入</button>`
    });
    return;
  }
  if (!rows.length) {
    host.innerHTML = emptyGuide({
      icon: 'search', title: '没有符合筛选条件的记录',
      desc: '清空关键词，或把类别 / 来源改回「全部」。',
      actions: `<button class="btn btn-ghost" data-act="go" data-to="labs">回到趋势图</button>`
    });
    return;
  }

  /* 按日期分组：同一天的结果合成一段，日期只出现一次，重复 18 遍没有信息量 */
  const groups = [];
  rows.forEach(r => {
    const g = groups[groups.length - 1];
    if (g && g.date === r.date) g.rows.push(r);
    else groups.push({ date: r.date, rows: [r] });
  });

  /* 分页是在「记录条数」维度上做的，映射回当前页覆盖到的日期分组 */
  const pgLabs = paginate(rows, 'labs');
  const pageIds = new Set(pgLabs.rows.map(r => r.id));
  const pageGroups = groups.map(g => ({ date: g.date, rows: g.rows.filter(r => pageIds.has(r.id)) })).filter(g => g.rows.length);

  const rowHTML = r => {
    const rep = r.reportId ? reportById(r.reportId) : null;
    return `<tr>
          <td class="name-cell">${esc(r.name)}<span class="cat-tag"> ${esc(r.category)}</span></td>
          <td class="num${isAbnormal(r) ? ' over' : ''}">${labValueText(r)}<span class="lab-unit">${esc(r.unit)}</span></td>
          <td class="ref col-ref">${esc(labRange(r))}</td>
          <td class="flag">${labFlagCell(r)}</td>
          <td class="report-col col-rep">${rep
        ? `<button class="rp-link" data-act="viewreport" data-id="${esc(rep.id)}" title="查看原件：${esc(rep.title)}">${esc(reportShort(rep.title))}</button>`
        : '<span class="na">—</span>'}</td>
          <td class="act"><button data-act="editlab" data-id="${esc(r.id)}">编辑</button><button class="danger" data-act="dellab" data-id="${esc(r.id)}">删除</button></td>
        </tr>`;
  };

  const tableHTML = `
    <table class="data laball-table">
      <thead><tr>
        <th>项目</th><th style="text-align:right">结果</th>
        <th class="col-ref" style="text-align:right">参考</th><th>提示</th><th class="col-rep">报告</th><th></th>
      </tr></thead>
      <tbody>
        ${pageGroups.map(g => {
    const gReps = [...new Set(g.rows.map(r => r.reportId).filter(Boolean))].map(reportById).filter(Boolean);
    const hosp = [...new Set(gReps.map(x => x.hospital).filter(Boolean))].join(' / ');
    const gBad = g.rows.filter(isAbnormal).length;
    return `<tr class="laball-day"><td colspan="6">
            <b>${esc(g.date)}</b><span>${g.rows.length} 条${gReps.length ? ` · ${gReps.length} 份报告` : ''}${hosp ? ` · ${esc(hosp)}` : ''}${gBad ? ` · <em>${gBad} 条超出区间</em>` : ''}</span>
          </td></tr>` + g.rows.map(rowHTML).join('');
  }).join('')}
      </tbody>
    </table>
    ${pagerHTML('labs', pgLabs)}`;

  host.innerHTML = detailFold('labs', '记录明细', rows.length, `<div class="table-wrap">${tableHTML}</div>`);
}

function paintChart(host, pts, o = {}) {
  // task 020：图表已统一改用 ECharts（见 js/app.chart.js 的 echartsChart）。
  // 保留此薄封装以防他处仍以旧签名调用，内部转发到 echartsChart。
  echartsChart(host, {
    series: [{ name: (o.name) || '指标', points: pts }],
    unit: o.unit,
    low: o.low,
    high: o.high,
    target: o.target,
    height: o.height
  });
}

/* ======================= 渲染：时间线 ======================= */
function renderTimeline() {
  setHead('TIMELINE　检查与就诊', '检查时间线',
    '按事件日期排列；日期不确定的写范围，不强行统一',
    `<button class="btn btn-ghost" data-act="export">${I.download}导出备份</button>`);

  const byYear = new Map();
  ARCHIVE.timeline.forEach(t => {
    const y = t.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(t);
  });
  /* 结构化就诊记录也并入时间线（与就诊页联动），日期倒序插到对应年份 */
  visits.forEach(v => {
    const y = (v.date || '').slice(0, 4);
    if (!y) return;
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push({
      date: v.date,
      type: v.visitType || '就诊',
      text: [[v.department, v.hospital, v.doctor].filter(Boolean).join('　'),
        v.diagnosis ? `诊断：${v.diagnosis}` : '', v.summary].filter(Boolean).join('　·　'),
      href: '#/visits', src: '就诊记录'
    });
  });
  /* 结构化用药也并入时间线：以 startDate 作为事件点，status 反映在用/已停，回链用药页 */
  medications.forEach(md => {
    const d = md.startDate || '';
    const y = d.slice(0, 4);
    if (!y) return;
    if (!byYear.has(y)) byYear.set(y, []);
    const stLabel = medStatusLabel(md.status) || (md.status === 'stopped' ? '已停用' : md.status === 'active' ? '在用' : '状态未知');
    const meta = [md.dose, md.frequency, md.route].filter(Boolean).join('　');
    const linkedVisit = md.visitId ? visitById(md.visitId) : null;
    byYear.get(y).push({
      date: d,
      type: '用药',
      text: [`${md.name || '药物'}（${stLabel}）`, meta,
        linkedVisit ? `关联就诊 ${linkedVisit.date}` : ''].filter(Boolean).join('　·　'),
      href: '#/meds', src: '用药记录'
    });
  });
  byYear.forEach(items => items.sort((a, b) => String(b.date).localeCompare(String(a.date))));
  const years = Array.from(byYear.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  $('#view').innerHTML = `
    <div class="stack">
      ${years.map(([y, items]) => `
        <section class="tl-group">
          <h2>${y} 年　<span style="font:400 11px/1 var(--sans);color:var(--muted-3)">${items.length} 条</span></h2>
          ${items.map(t => `
            <div class="tl-item">
              <time>${esc(t.date)}</time>
              <span class="type">${esc(t.type)}</span>
              <p>${esc(t.text)}</p>
              <a href="${esc(t.href)}">${esc(t.src)} →</a>
            </div>`).join('')}
        </section>`).join('')}
      ${!years.length ? emptyGuide({
        icon: 'clock', title: '时间线还是空的',
        desc: '检验结果、就诊记录会按事件日期自动汇到这里。也可以先登记一次就诊或检查；日期不确定就写范围，不强行统一。',
        actions: `<button class="btn btn-primary" data-act="visit-add">${I.plus}登记就诊</button><button class="btn btn-ghost" data-act="go" data-to="labs">录入检验结果</button>`
      }) : ''}
      <p class="hint">新增记录时按实际事件日期插入；建议和计划写入待办，完成后再转为就诊或检查事实。影像摘要引用既有整理，本次未重新阅片。</p>
    </div>`;
}

/* ======================= 渲染：用药 ======================= */
function renderMeds() {
  setHead('MEDICATION　用药记录', '用药记录',
    '历史用药不自动视为当前用药；本页不构成续药、停药或调整剂量指令',
    `<button class="btn btn-ghost" data-act="med-add">${I.plus}新增药物</button>`);

  const m = ARCHIVE.meds;
  $('#view').innerHTML = `
    <div class="stack">
      <section class="card">
        <div class="card-head"><h2>我的用药（结构化）</h2><span class="link">${medications.length} 条</span></div>
        ${medicationsTableHTML()}
        <p class="hint" style="margin-top:12px">这里记录药物名称、剂量、频次、途径与起止日期；可关联到某次就诊。下方「历史对照（只读）」为既有静态档案整理，折叠保留作对照，不参与编辑。</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>历史对照（只读）</h2><span class="chip warn chip-sm">旧档案</span></div>
        <p class="hint" style="margin:0 0 10px">以下为既有静态档案整理，仅为对照参考，已并入上方结构化用药表管理，不再单独编辑。</p>
        ${detailFold('medArchive', '既有档案整理（最近自述 / 历史记录）', (m.current.length + m.history.length), `
          <h3 style="margin:12px 0 8px;font:600 12px/1.4 var(--sans);color:var(--muted-2)">最近自述使用 <span class="chip warn chip-sm">待核对</span></h3>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>药物</th><th>已记录用法</th><th>信息日期</th><th>当前状态／待核对</th></tr></thead>
              <tbody>
                ${m.current.map(x => `<tr>
                  <td><p class="med-name">${esc(x.name)}</p></td>
                  <td><p class="med-use">${esc(x.use)}</p></td>
                  <td class="date">${esc(x.date)}</td>
                  <td><p class="med-use" style="color:var(--warn)">${esc(x.status)}</p></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <h3 style="margin:16px 0 8px;font:600 12px/1.4 var(--sans);color:var(--muted-2)">历史记录（${m.history.length} 条）</h3>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>日期</th><th>药物</th><th>原记录用法</th><th>当前状态</th></tr></thead>
              <tbody>
                ${m.history.map(x => `<tr>
                  <td class="date">${esc(x.date)}</td>
                  <td><p class="med-name">${esc(x.name)}</p></td>
                  <td><p class="med-use">${esc(x.use)}</p></td>
                  <td><p class="med-use">${esc(x.status)}</p></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div class="notice" style="margin-top:14px">${I.info}<p>${esc(m.note)}</p></div>
        `)}
      </section>

      <section class="card">
        <div class="card-head"><h2>新药录入需要记什么</h2></div>
        <div class="form-grid" style="grid-template-columns:repeat(3,1fr);gap:12px">
          ${[
      ['药名／浓度／规格', '写清商品名与通用名'],
      ['用途与开药医生', '哪个问题、谁开的'],
      ['实际剂量、途径、频次', '按实际执行，不写“遵医嘱”'],
      ['开始／停止日期', '停用也要留痕'],
      ['疗效／不适', '有没有效果、副作用'],
      ['处方或包装路径', '方便下次核对']
    ].map(([t, d]) => `<div class="need-box" style="background:#fff;border-color:var(--line-2)"><b style="color:var(--muted-2)">${t}</b><p style="color:var(--muted);font-size:10.5px">${d}</p></div>`).join('')}
        </div>
        <p class="hint" style="margin-top:12px">滴眼液另记开封日期及说明书的开封后期限；保健品、蛋白粉或减重相关产品也纳入记录。</p>
      </section>
    </div>`;
}

/* ======================= 渲染：待办 ======================= */
function renderTodos() {
  const total = allTodos().length, open = openTodos().length;
  const pct = Math.round((total - open) / total * 100);
  setHead('FOLLOW-UP　复诊与待办', '复诊待办',
    '未勾选均为未确认完成，不代表已预约',
    `<button class="btn btn-primary" data-act="todo-add">${I.plus}添加待办</button>`);

  $('#view').innerHTML = `
    <div class="stack">
      <section class="band">
        <div class="band-score"><small>已完成</small><b>${pct}<em>%</em></b></div>
        <div class="band-bar"><i style="width:${pct}%"></i></div>
        <div class="band-div"></div>
        <div class="band-missing"><small>共 ${total} 项，未完成 ${open} 项</small>
          <div class="chips"><span class="chip">勾选只保存在本机浏览器</span><span class="chip">到期会在首页提醒</span></div>
        </div>
        <button class="band-link" data-act="reset-todos">全部取消勾选</button>
      </section>

      <div class="todo-grid">
      ${ARCHIVE.todos.map(g => `
        <section class="card">
          <div class="card-head"><h2>${esc(g.group)}</h2><span class="link">${g.items.filter(i => state.done[i.id]).length}/${g.items.length}</span></div>
          ${g.items.map(t => `
            <div class="task ${state.done[t.id] ? 'done' : ''}">
              <button class="check ${state.done[t.id] ? 'on' : ''}" data-act="todo" data-id="${t.id}" aria-label="${state.done[t.id] ? '取消完成' : '标记完成'}">${I.check2}</button>
              <div class="task-body">
                <p class="task-text">${esc(t.text)}</p>
                <p class="task-meta ${t.flag ? 'flag' : ''}">${esc(t.meta)}</p>
              </div>
            </div>`).join('')}
        </section>`).join('')}
      </div>

      <section class="card">
        <div class="card-head" style="margin:0 0 8px">
          <h2>我新增的待办</h2>
          <div style="display:flex;gap:8px;align-items:center">
            <span class="link">${todoItems.length ? todoItems.filter(t => state.done[t.id]).length + '/' + todoItems.length : '0 条'}</span>
            <button class="btn btn-mini" data-act="todo-add">${I.plus}添加</button>
          </div>
        </div>
        ${todoItems.length ? todoItems.map(t => `
          <div class="task ${state.done[t.id] ? 'done' : ''}">
            <button class="check ${state.done[t.id] ? 'on' : ''}" data-act="todo" data-id="${esc(t.id)}" aria-label="${state.done[t.id] ? '取消完成' : '标记完成'}">${I.check2}</button>
            <div class="task-body">
              <p class="task-text">${esc(t.text)}</p>
              <p class="task-meta ${t.flag ? 'flag' : ''}">${esc(t.groupName || '我新增的待办')}${t.meta ? '　·　' + esc(t.meta) : ''}${t.dueDate ? '　·　到期 ' + esc(t.dueDate) : ''}${!state.done[t.id] && t.dueDate && daysFromToday(t.dueDate) < 0 ? '　·　已逾期' : ''}</p>
            </div>
            <div style="display:flex;gap:4px;align-items:center;flex:0 0 auto">
              <button class="btn-plain" data-act="todo-edit" data-id="${esc(t.id)}">编辑</button>
              <button class="btn-plain" style="color:#B4553F" data-act="todo-del" data-id="${esc(t.id)}">删除</button>
            </div>
          </div>`).join('') : emptyGuide({
            icon: 'todo', title: '还没有自己新增的待办',
            desc: '把要跟进的事（预约、复查、取药等）记下来；到期会在首页提醒。勾选只保存于本机浏览器。',
            actions: `<button class="btn btn-primary" data-act="todo-add">${I.plus}添加待办</button>`
          })}
      </section>

      <p class="hint">勾选表示“这件事已经处理”，不会写入就医记录；实际就诊后请把结果补到对应主题与时间线。</p>
    </div>`;
}
