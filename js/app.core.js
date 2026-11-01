'use strict';

/* ======================= 基础工具 ======================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const num = (v, d = 1) => Number(v).toLocaleString('zh-CN', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const kg1 = v => Number(v).toFixed(1);
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/* ======================= 图标 ======================= */
const I = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.6 2.6L16.2 9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pulse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12.5h4l2.8-7.5 4 15 2.7-7.5h4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.3-9.2-8.5C1.2 8.2 3 5 6.2 5c1.9 0 3.3 1 3.8 2 .5-1 1.9-2 3.8-2 3.2 0 5 3.2 3.4 6.5C19 15.7 12 20 12 20z" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.5 2.1" stroke-linecap="round"/></svg>',
  pill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.7 3.4a5 5 0 017 7l-6.8 6.9a5 5 0 01-7-7l6.8-6.9z" stroke-linecap="round"/><path d="M7.2 13.8l6.9-6.9" stroke-linecap="round"/></svg>',
  todo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M7.5 12.2l3 3 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3.5 17.5l5-6.5 4 3 5.5-7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 6.5H18v3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.3-3.6 4-5.4 7.5-5.4S18.2 16.4 19.5 20" stroke-linecap="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 3h8l4 4v14a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M14 3v5h5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5" stroke-linecap="round"/><circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v11m0 0l4-4m-4 4l-4-4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19h14" stroke-linecap="round"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V5m0 0L8 9m4-4l4 4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19h14" stroke-linecap="round"/></svg>',
  check2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  symptom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3.5h9.5L19 7v13a1 1 0 01-1 1H6a1 1 0 01-1-1V4.5a1 1 0 011-1z" stroke-linejoin="round"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" stroke-linecap="round"/></svg>'
};

/* ======================= 数据 ======================= */
const LS_LABS = 'personal-health-labs-v1';
const LS_STATE = 'personal-health-archive-v1';
const LS_REPORTS = 'personal-health-reports-v1';
const LS_HISTORY = 'personal-health-history-v1';
const LS_VITALS = 'personal-health-vitals-v1';
const LS_SYMPTOMS = 'personal-health-symptoms-v1';
const LS_DIET_DAYS = 'personal-health-diet-days-v1';
const LS_DIET_WEEKS = 'personal-health-diet-weeks-v1';
const LS_SLEEP = 'personal-health-sleep-logs-v1';
const LS_ISSUE_STATUS = 'personal-health-issue-status-v1';
const LS_TODOS = 'personal-health-todo-items-v1';
/* 提醒相关：上次导出备份的时间（纪元秒，离线模式用）、当天已忽略的提醒 key 映射 */
const LS_LAST_EXPORT = 'personal-health-last-export-v1';
const LS_REMIND_DISMISS = 'personal-health-remind-dismiss-v1';
const CATS = ['血常规', '肝功能', '肾功能', '其他'];
const PRESETS = {
  '血常规': ['白细胞计数', '红细胞计数', '血红蛋白', '血小板计数'],
  '肝功能': ['丙氨酸氨基转移酶（ALT）', '天门冬氨酸氨基转移酶（AST）', '总胆红素', '白蛋白'],
  '肾功能': ['肌酐', '尿素', '尿酸', '估算肾小球滤过率（eGFR）'],
  '其他': []
};

let labs = [];
let state = { weights: [], done: {}, body: [] };
let reports = [];
/* 报告原件文件清单：从本机服务实时列出 data/报告原件 目录（图片 / PDF / DICOM）。
   只用于「查看原件」入口与缺失核对，不改动任何文件；离线模式为空。 */
let originals = [];
let originalsLoaded = false;
/* 过敏 / 家族史 / 手术住院：三张独立的表，结构化后可增删改查、可在就诊摘要引用。
   severity = critical 表示「危急（曾致严重或危及生命的反应）」，首页会高亮。 */
let allergies = [];
let familyHistory = [];
let surgeries = [];
/* 就诊实例与用药：就医刚需实体，结构化后可增删改查。
   visit 与报告（reportId）、用药（visit_id）互相关联；medication 记录剂量/频次/起止。 */
let visits = [];
let medications = [];
/* 生命体征：血压 / 心率 / 体温 / 血氧 / 血糖，独立一张表，按日记录、可看趋势。 */
let vitals = [];
/* 症状日记：按日记录主观不适（干眼、鼻炎、踝痛等），独立一张表，可按部位筛选回看。 */
let symptoms = [];
/* 减重执行闭环：dietDays = 每日记录（饮食/晨重/摄入/完整度），dietWeeks = 每周复盘。
   空白字段一律保持空，不补 0；「未记录」与「未吃」分开。 */
let dietDays = [];
let dietWeeks = [];
/* 睡眠：来自小米手环/App 导出的每日睡眠汇总，一条一天；与饮食记录分开存放，互不覆盖。 */
let sleepLogs = [];
/* 页内可编辑：健康问题状态覆盖 + 用户新增的复诊待办。
   issueStatus = { issueId: { status, note, updatedAt } }，只覆盖 data.js 里的问题状态；
   todoItems = [{ id, text, groupName, meta, flag, createdAt }]，done 勾选仍复用 state.done。
   两者都持久化到 data/health.db（离线降级到 localStorage）。 */
let issueStatus = {};
let todoItems = [];
const ALLERGY_CATS = ['药物', '食物', '接触物', '其他'];
const ALLERGY_SEVS = [['critical', '危急（曾致严重反应）'], ['high', '较重'], ['mild', '较轻']];
const VISIT_TYPES = ['门诊', '急诊', '住院', '体检', '线上问诊', '其他'];
const MED_STATUS = [['active', '在服'], ['stopped', '已停'], ['unknown', '待确认']];
const MED_ROUTES = ['口服', '外用', '滴眼', '滴鼻', '吸入', '注射', '含服', '其他'];
const HIST_KINDS = {
  allergy: { label: '过敏', list: () => allergies },
  family: { label: '家族史', list: () => familyHistory },
  surgery: { label: '手术住院', list: () => surgeries }
};
let storageOK = true;
/* 服务托管时页面与接口同源；直接用 file:// 打开时退回到本机服务端口。
   storeMode 决定数据写哪儿：server = SQLite，local = 浏览器 localStorage（降级） */
const OCR_URL = location.protocol === 'file:' ? 'http://127.0.0.1:8765' : '';
const API = OCR_URL + '/api';
let storeMode = 'local';
/* 上次导出备份的状态（{lastExportAt, daysSince, due}）：服务模式来自 /api/all 的 export 字段，
   离线模式由 localStorage 推算。仅供首页「未备份」提醒使用，不参与其它业务判断。 */
let exportStatus = null;
let syncBad = false;
const ui = {
  issue: 'ankle', issueFilter: '', metric: '', labFilter: '', labsRange: 'all', demo: false, weightEditing: null,
  compMetric: 'bodyFat',
  vitalMetric: 'systolic',
  symptomTheme: '',
  /* 全部记录页的筛选条件：只存在内存里，刷新后回到「全部」 */
  labAll: { q: '', cat: '', rep: '', range: 'all' },
  /* 就诊摘要导出：选某次就诊或某时间段（内存态，不落库） */
  summary: { visit: '', from: '', to: '' },
  /* 大列表分页：每页条数（内存态，可切换 20/50/100） */
  pageSize: 20,
  /* 各列表当前页码（从 1 起） */
  pager: { weight: 1, sleep: 1, labs: 1 },
  /* 明细「记录明细」折叠面板的展开状态（内存态，刷新回默认折叠）。
     翻页会整页重渲染，这里记下已交互的面板，重渲染后保持展开。 */
  openDetails: {}
};

/* 默认每页条数可选项 */
const PAGE_SIZES = [20, 50, 100];

/* 分页切片：返回 { page, pages, rows, total, start, end }，page 已夹取到合法范围 */
function paginate(list, key, size) {
  size = size || ui.pageSize || 20;
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  let page = Math.floor(ui.pager[key] || 1);
  if (page < 1) page = 1;
  if (page > pages) page = pages;
  ui.pager[key] = page;
  const start = (page - 1) * size;
  const end = Math.min(start + size, total);
  return { page, pages, rows: list.slice(start, end), total, start, end };
}

/* 分页控件 HTML：上一页 / 页码 / 下一页 + 每页条数切换 + 「第 x–y / 共 n 条」 */
function pagerHTML(key, pg) {
  if (!pg || pg.total <= 0) return '';
  if (pg.pages <= 1) {
    return `<div class="pager"><span class="pager-info">共 ${pg.total} 条</span></div>`;
  }
  const btn = (p, label, dis) => `<button class="pager-btn${dis ? ' is-dis' : ''}"${dis ? ' disabled' : ''} data-act="page" data-key="${key}" data-page="${p}">${label}</button>`;
  // 页码窗口：当前页前后各 2 页
  const nums = [];
  const lo = Math.max(1, pg.page - 2), hi = Math.min(pg.pages, pg.page + 2);
  if (lo > 1) { nums.push(1); if (lo > 2) nums.push('…'); }
  for (let i = lo; i <= hi; i++) nums.push(i);
  if (hi < pg.pages) { if (hi < pg.pages - 1) nums.push('…'); nums.push(pg.pages); }
  const numBtns = nums.map(n => n === '…'
    ? '<span class="pager-gap">…</span>'
    : `<button class="pager-btn pager-num${n === pg.page ? ' is-on' : ''}" data-act="page" data-key="${key}" data-page="${n}">${n}</button>`
  ).join('');
  const sizeBtns = PAGE_SIZES.map(s => `<button class="pager-btn pager-size${s === ui.pageSize ? ' is-on' : ''}" data-act="page-size" data-size="${s}">${s}</button>`).join('');
  return `<div class="pager">
    <span class="pager-info">第 ${pg.start + 1}–${pg.end} 条 / 共 ${pg.total} 条</span>
    <span class="pager-ctl">${btn(pg.page - 1, '上一页', pg.page <= 1)}${numBtns}${btn(pg.page + 1, '下一页', pg.page >= pg.pages)}</span>
    <span class="pager-size-ctl">每页 ${sizeBtns}</span>
  </div>`;
}

/* 「记录明细」折叠面板：默认折叠，展开后显示统计条 / 表格 / 分页。
   key 用于记住展开状态（ui.openDetails[key]），summary 内放标题 + 条数 + 展开提示。
   body 为已生成的内部 HTML（统计条、表格、分页均放进去，展开才可见）。 */
function detailFold(key, title, count, body) {
  const open = !!ui.openDetails[key];
  const countText = count != null ? `<span class="df-count">${esc(String(count))} 条</span>` : '';
  return `<details class="detail-fold" data-fold="${esc(key)}"${open ? ' open' : ''}>
    <summary class="df-sum">
      <span class="df-title"><span class="df-chev" aria-hidden="true"></span>${esc(title)}</span>
      ${countText}
      <span class="df-hint">展开查看</span>
    </summary>
    <div class="df-body">${body}</div>
  </details>`;
}

/* 统计条 HTML：把一组数值做 min/max/avg/首尾日期 的汇总展示 */
function statsBar(items) {
  const cells = items.filter(Boolean);
  if (!cells.length) return '';
  return `<div class="stats-bar">${cells.map(c =>
    `<div class="stats-cell"><small>${esc(c.label)}</small><b>${c.value}</b>${c.sub ? `<i>${esc(c.sub)}</i>` : ''}</div>`
  ).join('')}</div>`;
}

/* 身体围度：胸围 / 腰围 / 臀围，单位 cm。
   三项都允许空（只量了腰围也能记），但一条记录至少要有一项。
   围度是独立的一组测量，不依附于体重 —— 体重没称也可以量围度。
   这里没有「正常范围」：围度没有统一参考区间，写死一个数字就是编造。 */
const BODY_FIELDS = [
  { k: 'chest', label: '胸围', hint: '乳头水平一周' },
  { k: 'waist', label: '腰围', hint: '肚脐水平一周，呼气末' },
  { k: 'hip', label: '臀围', hint: '臀部最突出处一周' }
];

/* 身体成分：附着在每条体重记录上的体脂秤指标。字段对齐小米体脂秤导出，
   csv 记下对应的小米原始列名，设备 CSV 导入（任务 014）可据此直接映射。
   全部可空 —— 普通体重秤只填 kg，这些留空即可。 */
const WEIGHT_METRICS = [
  { k: 'bodyFat', label: '体脂率', unit: '%', csv: 'bfp', dec: 1, step: 0.1 },
  { k: 'muscle', label: '肌肉量', unit: 'kg', csv: 'smm', dec: 1, step: 0.1 },
  { k: 'bmi', label: 'BMI', unit: '', csv: 'bmi', dec: 1, step: 0.1 },
  { k: 'visceralFat', label: '内脏脂肪', unit: '级', csv: 'vfl', dec: 0, step: 1 },
  { k: 'bmr', label: '基础代谢', unit: 'kcal', csv: 'bmr', dec: 0, step: 1 },
  { k: 'bone', label: '骨量', unit: 'kg', csv: 'bmc', dec: 1, step: 0.1 }
];

/* 从一条体重记录里取某个身体成分指标；空 / 非法值一律返回 null */
function weightMetricVal(w, k) {
  if (!w) return null;
  const v = w[k];
  return Number.isFinite(v) && v > 0 ? v : null;
}
/* 某指标最近一次有值的体重记录（用于「最新身体成分」卡片） */
function latestMetricRecord(k) {
  return weightList().slice().reverse().find(w => weightMetricVal(w, k) !== null) || null;
}
function weightMetricSeries(k) {
  return weightList().filter(w => weightMetricVal(w, k) !== null)
    .map(w => ({ date: w.date, value: weightMetricVal(w, k) }));
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function validBody(x) {
  if (!x || typeof x.id !== 'string') return false;
  if (typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) return false;
  return ['chest', 'waist', 'hip'].some(k => Number.isFinite(x[k]) && x[k] > 0);
}

function normBody(x) {
  return {
    id: x.id, date: x.date,
    chest: numOrNull(x.chest), waist: numOrNull(x.waist), hip: numOrNull(x.hip),
    note: String(x.note || '').trim().slice(0, 120),
    createdAt: Number(x.createdAt) || Date.now()
  };
}

/* 旧版的腰围是记在体重记录里的（weights.waist）。围度表建立后腰围只认 body，
   启动时把残留值搬进来；id 用 'b-' + 体重 id，重复执行不会翻倍。 */
function migrateWaistToBody() {
  let n = 0;
  state.weights.forEach(w => {
    if (!Number.isFinite(w.waist) || !(w.waist > 0)) return;
    if (state.body.some(b => b.id === 'b-' + w.id || (b.date === w.date && Number.isFinite(b.waist)))) return;
    state.body.push({
      id: 'b-' + w.id, date: w.date, chest: null, waist: w.waist, hip: null,
      note: '由旧体重记录里的腰围迁移', createdAt: Date.now()
    });
    n++;
  });
  return n;
}

function bodyList() {
  return state.body.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
}
function bodyOf(date) { return bodyList().filter(b => b.date === date).at(-1) || null; }
/* 围度记录和体重记录是两条独立的线，日期相同也不合并 —— 只做同日关联展示 */
function weightOf(date) {
  return state.weights.filter(w => w.date === date).sort((a, b) => (a.tag === 'morning' ? -1 : 1))[0] || null;
}

/* 记围度时如果当天已有记录，就补到那一组里，而不是再加一条同日的 */
function upsertBody(date, patch) {
  const cur = bodyOf(date);
  const filled = {};
  ['chest', 'waist', 'hip'].forEach(k => { if (Number.isFinite(patch[k]) && patch[k] > 0) filled[k] = patch[k]; });
  if (!Object.keys(filled).length) return null;
  if (cur) {
    Object.assign(cur, filled);
    if (patch.note) cur.note = String(patch.note).trim().slice(0, 120);
    return cur;
  }
  const rec = normBody({
    id: (crypto.randomUUID && crypto.randomUUID()) || 'b-' + Date.now(),
    date, ...filled, note: patch.note || '', createdAt: Date.now()
  });
  state.body.push(rec);
  return rec;
}

/* 生命体征：血压 / 心率 / 体温 / 血氧 / 血糖。
   一条记录里各项都可空，至少填一项；血压 systolic/diastolic 成对。
   参考区间取成人静息通用值，仅用于「异常高亮」，不是诊断标准。 */
const VITAL_FIELDS = [
  { k: 'systolic', label: '收缩压（高压）', unit: 'mmHg', hint: '如 120', step: '1', min: 40, max: 260 },
  { k: 'diastolic', label: '舒张压（低压）', unit: 'mmHg', hint: '如 80', step: '1', min: 20, max: 160 },
  { k: 'pulse', label: '心率', unit: '次/分', hint: '如 72', step: '1', min: 20, max: 250 },
  { k: 'temperature', label: '体温', unit: '℃', hint: '如 36.5', step: '0.1', min: 30, max: 45 },
  { k: 'spo2', label: '血氧饱和度', unit: '%', hint: '如 98', step: '1', min: 50, max: 100 },
  { k: 'glucose', label: '血糖', unit: 'mmol/L', hint: '如 5.4', step: '0.1', min: 0.5, max: 40 }
];
const VITAL_KEYS = VITAL_FIELDS.map(f => f.k);
const VITAL_METRICS = [
  { k: 'systolic', label: '收缩压', unit: 'mmHg', dec: 0 },
  { k: 'diastolic', label: '舒张压', unit: 'mmHg', dec: 0 },
  { k: 'pulse', label: '心率', unit: '次/分', dec: 0 },
  { k: 'temperature', label: '体温', unit: '℃', dec: 1 },
  { k: 'spo2', label: '血氧饱和度', unit: '%', dec: 0 },
  { k: 'glucose', label: '血糖', unit: 'mmol/L', dec: 1 }
];
const GLUCOSE_TAGS = [['fasting', '空腹'], ['post2h', '餐后 2 小时'], ['random', '随机 / 其他']];
const VITAL_RANGES = {
  systolic: [90, 139], diastolic: [60, 89], pulse: [60, 100],
  temperature: [36.0, 37.3], spo2: [95, 100], glucose: [3.9, 6.1]
};
/* 血糖的参考区间随测量时机变化：非空腹按餐后 2 小时的上限 */
function vitalRange(k, rec) {
  if (k === 'glucose' && rec && rec.glucoseTag && rec.glucoseTag !== 'fasting') return [3.9, 7.8];
  return VITAL_RANGES[k] || [null, null];
}
function vitalFlag(k, v, rec) {
  if (!Number.isFinite(v)) return '';
  const r = vitalRange(k, rec);
  if (r[0] == null) return '';
  if (v > r[1]) return 'H';
  if (v < r[0]) return 'L';
  return 'N';
}
function validVital(x) {
  if (!x || typeof x.id !== 'string') return false;
  if (typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) return false;
  return VITAL_KEYS.some(k => Number.isFinite(x[k]) && x[k] > 0);
}
function normVital(x) {
  const rec = {
    id: x.id, date: x.date,
    glucoseTag: String(x.glucoseTag || ''),
    note: String(x.note || '').trim().slice(0, 120),
    createdAt: Number(x.createdAt) || Date.now()
  };
  VITAL_KEYS.forEach(k => { rec[k] = numOrNull(x[k]); });
  return rec;
}
function vitalsSorted() {
  return vitals.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
}
function vitalPoints(k) {
  return vitalsSorted().filter(v => Number.isFinite(v[k]))
    .map(v => ({ date: v.date, value: v[k], rec: v }));
}
/* 取某一项最近一次有值的记录（按日期、创建时间升序取最后一条） */
function latestVitalOf(k) {
  const rows = vitalsSorted().filter(v => Number.isFinite(v[k]));
  return rows.length ? rows[rows.length - 1] : null;
}

/* 症状日记：按日记录主观不适（干眼、鼻炎、踝痛等），不为每个病单独建页。
   part = 部位 / 主题，是筛选维度；severity = 主观程度 1–10；trigger = 诱因；note = 备注。 */
const SYMPTOM_PARTS = ['眼睛', '鼻', '右踝', '膝', '腰', '头', '咽', '皮肤', '胃肠', '其他'];
const SEVERITY_LEVELS = [[1, 3, '轻', 'green'], [4, 6, '中', 'amber'], [7, 10, '重', 'warn']];
function severityMeta(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return { label: '', tone: '', n: null };
  const lv = SEVERITY_LEVELS.find(([lo, hi]) => v >= lo && v <= hi) || SEVERITY_LEVELS[SEVERITY_LEVELS.length - 1];
  return { label: lv[2], tone: lv[3], n: Math.round(v) };
}
function validSymptom(x) {
  if (!x || typeof x.id !== 'string') return false;
  if (typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) return false;
  if (typeof x.part !== 'string' || !x.part.trim()) return false;
  const sev = x.severity;
  if (sev !== null && sev !== undefined && sev !== '' && !(typeof sev === 'number' && Number.isFinite(sev))) return false;
  return true;
}
function normSymptom(x) {
  return {
    id: x.id, date: x.date,
    part: String(x.part || '').trim().slice(0, 20),
    severity: numOrNull(x.severity),
    trigger: String(x.trigger || '').trim().slice(0, 60),
    note: String(x.note || '').trim().slice(0, 200),
    createdAt: Number(x.createdAt) || Date.now()
  };
}
function symptomsSorted() {
  return symptoms.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
}
function symptomParts() {
  const seen = [];
  symptomsSorted().forEach(s => { if (s.part && !seen.includes(s.part)) seen.push(s.part); });
  return seen;
}

/* ---------- 减重每日记录 / 每周复盘（执行闭环） ---------- */
const DIET_COMPLETENESS = ['完整', '部分', '未记录'];
/* 每日记录：一条 = 一天。除日期外都可空 —— 空白表示未记录，不代表 0。 */
function validDietDay(x) {
  if (!x || typeof x.id !== 'string') return false;
  if (typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) return false;
  return true;
}
function normDietDay(x) {
  const rec = {
    id: x.id, date: x.date,
    weightNote: String(x.weightNote || '').trim().slice(0, 120),
    hunger: String(x.hunger || '').trim().slice(0, 120),
    ankle: String(x.ankle || '').trim().slice(0, 120),
    breakfast: String(x.breakfast || '').trim().slice(0, 300),
    lunch: String(x.lunch || '').trim().slice(0, 300),
    dinner: String(x.dinner || '').trim().slice(0, 300),
    snack: String(x.snack || '').trim().slice(0, 300),
    completeness: String(x.completeness || '').trim().slice(0, 10),
    summary: String(x.summary || '').trim().slice(0, 300),
    note: String(x.note || '').trim().slice(0, 200),
    createdAt: Number(x.createdAt) || Date.now()
  };
  ['morningWeight', 'waist', 'sleep', 'kcalCenter', 'kcalLow', 'kcalHigh', 'budget']
    .forEach(k => { rec[k] = numOrNull(x[k]); });
  return rec;
}
function dietDaysSorted() { return dietDays.slice().sort((a, b) => b.date.localeCompare(a.date)); }
function dietDayOf(date) { return dietDays.find(d => d.date === date) || null; }
/* 睡眠记录：一条 = 一天。hours 为主口径（小时），minutes/score 可空。空白=未记录，不补 0。 */
function validSleepLog(x) {
  if (!x || typeof x.id !== 'string') return false;
  if (typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) return false;
  return true;
}
function normSleepLog(x) {
  return {
    id: String(x.id), date: x.date,
    hours: numOrNull(x.hours), minutes: numOrNull(x.minutes), score: numOrNull(x.score),
    bedtime: String(x.bedtime || '').trim().slice(0, 10),
    wake: String(x.wake || '').trim().slice(0, 10),
    note: String(x.note || '').trim().slice(0, 200),
    source: String(x.source || '').trim().slice(0, 20),
    createdAt: Number(x.createdAt) || Date.now()
  };
}
function sleepLogsSorted() { return sleepLogs.slice().sort((a, b) => b.date.localeCompare(a.date)); }
function sleepLogOf(date) { return sleepLogs.find(s => s.date === date) || null; }
/* 每周复盘：一条 = 一周（以 weekStart 为准）。周均值由用户按模板口径手填。 */
function validDietWeek(x) {
  if (!x || typeof x.id !== 'string') return false;
  if (typeof x.weekStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.weekStart)) return false;
  return true;
}
function normDietWeek(x) {
  const rec = {
    id: x.id, weekStart: x.weekStart,
    weekEnd: String(x.weekEnd || '').trim().slice(0, 10),
    reviewDate: String(x.reviewDate || '').trim().slice(0, 10),
    ankle: String(x.ankle || '').trim().slice(0, 200),
    energy: String(x.energy || '').trim().slice(0, 200),
    observeMiss: String(x.observeMiss || '').trim().slice(0, 200),
    observeHabit: String(x.observeHabit || '').trim().slice(0, 200),
    observeDiff: String(x.observeDiff || '').trim().slice(0, 200),
    nextFocus: String(x.nextFocus || '').trim().slice(0, 200),
    adjust: String(x.adjust || '').trim().slice(0, 200),
    note: String(x.note || '').trim().slice(0, 200),
    createdAt: Number(x.createdAt) || Date.now()
  };
  ['weightDays', 'weightAvg', 'weightPrevAvg', 'waist', 'completeDays', 'kcalCenter', 'kcalLow', 'kcalHigh']
    .forEach(k => { rec[k] = numOrNull(x[k]); });
  return rec;
}
function dietWeeksSorted() { return dietWeeks.slice().sort((a, b) => b.weekStart.localeCompare(a.weekStart)); }
function dietWeekOf(start) { return dietWeeks.find(w => w.weekStart === start) || null; }

function validLab(r) {
  if (!r || typeof r.id !== 'string' || typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return false;
  if (!CATS.includes(r.category) || typeof r.name !== 'string' || !r.name.trim()) return false;
  if (typeof r.unit !== 'string') return false;
  const hasVal = typeof r.value === 'number' && Number.isFinite(r.value);
  const qual = typeof r.qualitative === 'string' ? r.qualitative.trim() : '';
  if (!hasVal && !qual) return false;                 // 既无数值也非定性 → 无效
  if (!hasVal && r.value !== null && r.value !== undefined) return false;
  if (hasVal && !r.unit.trim()) return false;         // 数值结果仍必须有单位（保持原约束）
  if (!['low', 'high'].every(k => r[k] === null || r[k] === undefined || (typeof r[k] === 'number' && Number.isFinite(r[k])))) return false;
  if (r.low != null && r.high != null && r.low > r.high) return false;
  if (typeof r.source !== 'string' || typeof r.note !== 'string') return false;
  return true;
}

/* 报告原件：一条检验记录可以指向一份报告，也可以没有（没有就算了）
   报告上的三层名称，由具体到笼统：
     title   报告名称（医院打印的申请项目，如「肝肾常规」）
     panel   项目组套（笼统大类，如「生化」「血常规」）
     specimen 检验样本类型（血清 / 血浆 / 全血 / 尿液 …） */
const PANELS = ['血常规', '尿常规', '尿沉渣', '生化', '肝功能', '肾功能', '血脂', '电解质', '血糖', '凝血', '免疫', '其他'];
const SPECIMENS = ['血清', '血浆', '全血', '尿液', '粪便', '分泌物', '脑脊液', '其他'];

function validReport(x) {
  return x && typeof x.id === 'string'
    && typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date)
    && typeof x.title === 'string' && x.title.trim()
    && typeof x.file === 'string'
    && (x.hospital === undefined || typeof x.hospital === 'string')
    && (x.panel === undefined || typeof x.panel === 'string')
    && (x.specimen === undefined || typeof x.specimen === 'string');
}

function normReport(x) {
  return {
    id: x.id, date: x.date,
    title: String(x.title || '').trim().slice(0, 60),
    panel: String(x.panel || '').trim().slice(0, 20),
    specimen: String(x.specimen || '').trim().slice(0, 20),
    hospital: String(x.hospital || '').trim().slice(0, 60),
    note: String(x.note || '').trim().slice(0, 300),
    file: String(x.file || ''),
    createdAt: Number(x.createdAt) || Date.now()
  };
}

/* 报告的副标题：「生化 · 血清 · 北京同仁医院」，空的项直接略过，不补占位 */
function reportMeta(r, sep = '　·　') {
  return [r.panel, r.specimen, r.hospital].filter(Boolean).map(esc).join(sep);
}

/* ---------- 过敏 / 家族史 / 手术住院：规范化 ---------- */
function normAllergy(x) {
  return {
    id: String(x.id), name: String(x.name || '').trim().slice(0, 60),
    category: ALLERGY_CATS.includes(x.category) ? x.category : '其他',
    severity: ['critical', 'high', 'mild'].includes(x.severity) ? x.severity : '',
    reaction: String(x.reaction || '').trim().slice(0, 200),
    note: String(x.note || '').trim().slice(0, 200),
    createdAt: Number(x.createdAt) || Date.now()
  };
}
function validAllergy(x) {
  return x && typeof x.id === 'string' && typeof x.name === 'string' && x.name.trim();
}
function normFamily(x) {
  return {
    id: String(x.id), relation: String(x.relation || '').trim().slice(0, 40),
    condition: String(x.condition || '').trim().slice(0, 100),
    note: String(x.note || '').trim().slice(0, 200),
    createdAt: Number(x.createdAt) || Date.now()
  };
}
function validFamily(x) {
  return x && typeof x.id === 'string' && typeof x.condition === 'string' && x.condition.trim();
}
function normSurgery(x) {
  return {
    id: String(x.id), date: String(x.date || ''), name: String(x.name || '').trim().slice(0, 100),
    hospital: String(x.hospital || '').trim().slice(0, 60),
    note: String(x.note || '').trim().slice(0, 200),
    createdAt: Number(x.createdAt) || Date.now()
  };
}
function validSurgery(x) {
  return x && typeof x.id === 'string' && typeof x.name === 'string' && x.name.trim();
}
/* ---------- 就诊实例 / 用药：规范化 ---------- */
function normVisit(x) {
  return {
    id: String(x.id), date: String(x.date || ''),
    visitType: VISIT_TYPES.includes(x.visitType) ? x.visitType : (String(x.visitType || '').trim().slice(0, 20) || ''),
    department: String(x.department || '').trim().slice(0, 40),
    hospital: String(x.hospital || '').trim().slice(0, 60),
    doctor: String(x.doctor || '').trim().slice(0, 40),
    chief: String(x.chief || '').trim().slice(0, 300),
    diagnosis: String(x.diagnosis || '').trim().slice(0, 300),
    summary: String(x.summary || '').trim().slice(0, 1000),
    reportId: String(x.reportId || ''),
    note: String(x.note || '').trim().slice(0, 300),
    createdAt: Number(x.createdAt) || Date.now()
  };
}
function validVisit(x) {
  return x && typeof x.id === 'string'
    && typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date);
}
function normMedication(x) {
  return {
    id: String(x.id), name: String(x.name || '').trim().slice(0, 80),
    dose: String(x.dose || '').trim().slice(0, 60),
    frequency: String(x.frequency || '').trim().slice(0, 60),
    route: String(x.route || '').trim().slice(0, 20),
    startDate: String(x.startDate || '').trim().slice(0, 20),
    endDate: String(x.endDate || '').trim().slice(0, 20),
    purpose: String(x.purpose || '').trim().slice(0, 120),
    status: ['active', 'stopped', 'unknown'].includes(x.status) ? x.status : 'active',
    note: String(x.note || '').trim().slice(0, 300),
    infoDate: String(x.infoDate || '').trim().slice(0, 20),
    sourceRef: String(x.sourceRef || '').trim().slice(0, 200),
    toVerify: String(x.toVerify || '').trim().slice(0, 300),
    visitId: String(x.visitId || ''),
    createdAt: Number(x.createdAt) || Date.now()
  };
}
function validMedication(x) {
  return x && typeof x.id === 'string' && typeof x.name === 'string' && x.name.trim();
}
/* 用户页内新增的复诊待办 */
function normISODate(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function normTodoItem(x) {
  return {
    id: String(x.id || newId('todo')),
    text: String(x.text || '').trim().slice(0, 200),
    groupName: String(x.groupName || x.group || '我新增的待办').trim().slice(0, 40) || '我新增的待办',
    meta: String(x.meta || '').trim().slice(0, 120),
    flag: !!x.flag,
    dueDate: normISODate(x.dueDate),
    createdAt: Number(x.createdAt) || Date.now()
  };
}
function validTodoItem(x) {
  return x && typeof x.id === 'string' && typeof x.text === 'string' && x.text.trim();
}
function medStatusLabel(s) {
  const hit = MED_STATUS.find(m => m[0] === s);
  return hit ? hit[1] : '';
}
function visitById(id) { return visits.find(v => v.id === id) || null; }
function visitsSorted() { return visits.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0)); }
function medsSorted() {
  return medications.slice().sort((a, b) => (a.status === 'active' ? -1 : 1) - (b.status === 'active' ? -1 : 1)
    || (b.startDate || '').localeCompare(a.startDate || '') || (a.name || '').localeCompare(b.name || ''));
}
function severityLabel(sev) {
  const hit = ALLERGY_SEVS.find(s => s[0] === sev);
  return hit ? hit[1] : '';
}
function criticalAllergies() { return allergies.filter(a => a.severity === 'critical'); }
function newId(prefix) {
  return (crypto.randomUUID && crypto.randomUUID()) || prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

function reportById(id) { return reports.find(r => r.id === id) || null; }
function labCountOf(reportId) { return labs.filter(r => r.reportId === reportId).length; }
/* 表格里只放短名，全名留给 title 属性 */
function reportShort(t) {
  return String(t || '').replace(/[（(][^)）]*[)）]/g, '').trim().slice(0, 10) || '报告';
}

/* ---------- 报告原件：磁盘清单 / 查看 / 缺失核对 ----------
   任务 017：检验、报告页挂「查看原件」，直接链到 data/报告原件 下的真实文件；
   文件不存在时显示占位与路径，不假装能看到。清单来自本机服务 /api/originals。 */
async function loadOriginals() {
  if (storeMode !== 'server') { originals = []; originalsLoaded = true; return; }
  try {
    const r = await fetch(API + '/originals', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    originals = Array.isArray(j.files) ? j.files : [];
  } catch (e) {
    originals = [];
  }
  originalsLoaded = true;
}
function fileBase(f) { return String(f || '').split('/').pop(); }
function isImageExt(ext) {
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff'].includes(String(ext || '').toLowerCase());
}
function extOf(path) { return String(fileBase(path).split('.').pop() || '').toLowerCase(); }
/* 报告记录指向的本机文件是否缺失（仅服务模式、已拿到目录清单时才判断，避免误报） */
function reportFileMissing(r) {
  if (!r || !r.file) return false;
  if (storeMode !== 'server' || !originalsLoaded) return false;
  const f = String(r.file);
  if (!(f.startsWith('/files/') || f.startsWith('data/'))) return false;   // dataURI 不核对
  const base = fileBase(f);
  return !originals.some(o => o.name === base);
}
function originalUrl(path) { return encodeURI(String(path || '')); }
function fmtSize(n) {
  const b = Number(n) || 0;
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024) return Math.round(b / 1024) + ' KB';
  return b + ' B';
}
/* 打开磁盘上的原件：图片内嵌查看；PDF / DICOM 给新窗口打开与下载入口；文件缺失显示占位与路径 */
function viewOriginal(path, name) {
  const p = String(path || '');
  const ext = extOf(p);
  const url = originalUrl(p);
  const body = isImageExt(ext)
    ? `<div class="rp-view"><img src="${esc(url)}" alt="${esc(name || p)}" onerror="this.style.display='none';var m=this.nextElementSibling;if(m)m.style.display='block'"><div class="rp-miss" style="display:none">图片无法打开或文件已不存在：<br><code>${esc(p)}</code></div></div>`
    : `<div class="empty" style="text-align:left">该类型（${esc(ext || '未知')}）无法在页面内预览，可新窗口打开或下载后用系统程序查看。<br>路径：<code>${esc(p)}</code></div>`;
  openModal(`
    <div class="modal-head">
      <div><h2>${esc(name || fileBase(p) || '报告原件')}</h2><p>${esc(p)}</p></div>
      <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button>
    </div>
    ${body}
    <div class="form-actions">
      <a class="btn btn-ghost" href="${esc(url)}" target="_blank" rel="noopener">${I.download}新窗口打开 / 下载</a>
      <button class="btn btn-ghost" data-act="close">关闭</button>
    </div>`, 'wide');
}

function loadAll() {
  try {
    const raw = localStorage.getItem(LS_LABS);
    if (raw !== null) {
      const p = JSON.parse(raw);
      if (!Array.isArray(p) || !p.every(validLab)) throw new Error('bad labs');
      labs = p;
    }
  } catch (e) {
    storageOK = false;
  }
  try {
    const raw = localStorage.getItem(LS_STATE);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p.weights)) {
        state.weights = p.weights.filter(w => w && typeof w.date === 'string' && Number.isFinite(w.kg));
      }
      if (p.done && typeof p.done === 'object') state.done = p.done;
      if (Array.isArray(p.body)) state.body = p.body.filter(validBody).map(normBody);
      if (typeof p.savedAt === 'number') state.savedAt = p.savedAt;
    }
  } catch (e) { /* 忽略损坏的本机记录 */ }
  try {
    const raw = localStorage.getItem(LS_REPORTS);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) reports = p.filter(validReport).map(normReport);
    }
  } catch (e) { /* 忽略损坏的报告索引 */ }
  try {
    const raw = localStorage.getItem(LS_HISTORY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p.allergies)) allergies = p.allergies.filter(validAllergy).map(normAllergy);
      if (Array.isArray(p.familyHistory)) familyHistory = p.familyHistory.filter(validFamily).map(normFamily);
      if (Array.isArray(p.surgeries)) surgeries = p.surgeries.filter(validSurgery).map(normSurgery);
      if (Array.isArray(p.visits)) visits = p.visits.filter(validVisit).map(normVisit);
      if (Array.isArray(p.medications)) medications = p.medications.filter(validMedication).map(normMedication);
    }
  } catch (e) { /* 忽略损坏的结构化病史 */ }
  try {
    const raw = localStorage.getItem(LS_VITALS);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) vitals = p.filter(validVital).map(normVital);
    }
  } catch (e) { /* 忽略损坏的体征记录 */ }
  try {
    const raw = localStorage.getItem(LS_SYMPTOMS);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) symptoms = p.filter(validSymptom).map(normSymptom);
    }
  } catch (e) { /* 忽略损坏的症状记录 */ }
  try {
    const raw = localStorage.getItem(LS_DIET_DAYS);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) dietDays = p.filter(validDietDay).map(normDietDay);
    }
  } catch (e) { /* 忽略损坏的每日记录 */ }
  try {
    const raw = localStorage.getItem(LS_DIET_WEEKS);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) dietWeeks = p.filter(validDietWeek).map(normDietWeek);
    }
  } catch (e) { /* 忽略损坏的每周复盘 */ }
  try {
    const raw = localStorage.getItem(LS_SLEEP);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) sleepLogs = p.filter(validSleepLog).map(normSleepLog);
    }
  } catch (e) { /* 忽略损坏的睡眠记录 */ }
  try {
    const raw = localStorage.getItem(LS_ISSUE_STATUS);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === 'object') issueStatus = p;
    }
  } catch (e) { /* 忽略损坏的问题状态覆盖 */ }
  try {
    const raw = localStorage.getItem(LS_TODOS);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) todoItems = p.filter(validTodoItem).map(normTodoItem);
    }
  } catch (e) { /* 忽略损坏的自建待办 */ }
  /* 不再用档案里的起点值补一条「记录」：没称过就是没称过，
     起点只出现在进度条的刻度上，不冒充明细表里的记录 */
}

/* 数据写哪儿：连上本机服务就写 SQLite，连不上才退回浏览器。
   两条路径不交叉写，避免「一半在库、一半在浏览器」的分裂状态。 */
function pushJSON(path, body) {
  if (storeMode !== 'server') return;
  fetch(API + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(j => {
    if (!j || !j.ok) throw new Error((j && j.error) || '写入失败');
    if (syncBad) { syncBad = false; toast('已重新连上本机数据库'); }
  }).catch(() => {
    if (!syncBad) {
      syncBad = true;
      toast('写入本机数据库失败，最后一次改动可能没存下');
    }
  });
}

/* 连本机服务取数据。连不上就保持浏览器存储模式（离线也能看，但会明确提示）。 */
let pendingMigrate = false;
/* ?offline=1 强制只用浏览器存储：自动化测试与临时排查用，避免把测试数据写进真库 */
const FORCE_LOCAL = /[?&]offline=1/.test(location.search);
async function bootStore() {
  if (FORCE_LOCAL) { storeMode = 'local'; return false; }
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(API + '/all', { cache: 'no-store', signal: ctl.signal })
      .finally(() => clearTimeout(timer));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    const localLabs = (localStorage.getItem(LS_LABS) || '').length;
    labs = (d.labs || []).filter(validLab);
    reports = (d.reports || []).filter(validReport).map(normReport);
    /* 服务端是唯一真相：库里没有体重记录就是没有，
       不能拿档案里的起点值补成一条「记录」（否则明细表会凭空多一条） */
    if (Array.isArray(d.weights)) {
      state.weights = d.weights.filter(w => w && typeof w.date === 'string' && Number.isFinite(w.kg));
    }
    if (d.done && typeof d.done === 'object') state.done = d.done;
    if (Array.isArray(d.body)) state.body = d.body.filter(validBody).map(normBody);
    if (typeof d.savedAt === 'number') state.savedAt = d.savedAt;
    if (Array.isArray(d.allergies)) allergies = d.allergies.filter(validAllergy).map(normAllergy);
    if (Array.isArray(d.familyHistory)) familyHistory = d.familyHistory.filter(validFamily).map(normFamily);
    if (Array.isArray(d.surgeries)) surgeries = d.surgeries.filter(validSurgery).map(normSurgery);
    if (Array.isArray(d.visits)) visits = d.visits.filter(validVisit).map(normVisit);
    if (Array.isArray(d.medications)) medications = d.medications.filter(validMedication).map(normMedication);
    if (Array.isArray(d.vitals)) vitals = d.vitals.filter(validVital).map(normVital);
    if (Array.isArray(d.symptoms)) symptoms = d.symptoms.filter(validSymptom).map(normSymptom);
    if (Array.isArray(d.dietDays)) dietDays = d.dietDays.filter(validDietDay).map(normDietDay);
    if (Array.isArray(d.dietWeeks)) dietWeeks = d.dietWeeks.filter(validDietWeek).map(normDietWeek);
    if (Array.isArray(d.sleepLogs)) sleepLogs = d.sleepLogs.filter(validSleepLog).map(normSleepLog);
    if (d.issueStatus && typeof d.issueStatus === 'object') issueStatus = d.issueStatus;
    if (Array.isArray(d.todoItems)) todoItems = d.todoItems.filter(validTodoItem).map(normTodoItem);
    exportStatus = (d.export && typeof d.export === 'object') ? d.export : null;
    storeMode = 'server';
    // 浏览器里还留着旧数据：给一个「合并进来」的入口（库里已有也不覆盖，按去重键合并）
    pendingMigrate = localLabs > 10;
    return true;
  } catch (e) {
    storeMode = 'local';
    return false;
  }
}

/* 把浏览器里的旧数据并进本机数据库。库里有同名记录时不覆盖、不翻倍：
   和导入备份用同一套去重键（日期|类别|项目|单位），可以放心点第二次。 */
async function migrateLocalToServer() {
  if (storeMode !== 'server') { toast('本机数据库没连上'); return; }
  let lo = [], lr = [], ls = null;
  try {
    lo = JSON.parse(localStorage.getItem(LS_LABS) || '[]').filter(validLab);
    lr = JSON.parse(localStorage.getItem(LS_REPORTS) || '[]').filter(validReport).map(normReport);
    ls = JSON.parse(localStorage.getItem(LS_STATE) || 'null');
  } catch (e) {
    toast('浏览器里的数据读不出来'); return;
  }
  let lh = null;
  try { lh = JSON.parse(localStorage.getItem(LS_HISTORY) || 'null'); } catch (e) { }
  if (!lo.length && !lr.length) { toast('浏览器里没有可搬的数据'); return; }
  const total = labs.length;
  if (!confirm(`浏览器里还有 ${lo.length} 条检验记录、${lr.length} 份报告。\n合并进本机数据库（现有 ${total} 条）？同一天同项目同单位的以浏览器里的为准，不会翻倍。`)) return;
  // 先合报告（拿到 id 映射），再把结果里的 reportId 指向库里实际的报告
  const rep = mergeReports(lr);
  const mergedLabs = mergeLabsByKey(remapReportIds(lo, rep.idMap));
  const mergedWeights = ls && Array.isArray(ls.weights) ? ls.weights : [];
  const wm = new Map(state.weights.map(w => [w.id, w]));
  mergedWeights.forEach(w => wm.set(w.id, w));
  const bm = new Map(state.body.map(b => [b.id, b]));
  (ls && Array.isArray(ls.body) ? ls.body.filter(validBody).map(normBody) : []).forEach(b => bm.set(b.id, b));
  try {
    const put = (p, body) => fetch(API + p, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }).then(r => { if (!r.ok) throw new Error(r.status); });
    await put('/reports', rep.list);
    await put('/labs', mergedLabs);
    await put('/state', {
      weights: [...wm.values()], done: { ...state.done, ...((ls && ls.done) || {}) },
      body: [...bm.values()]
    });
    if (lh) {
      const am = new Map(allergies.map(x => [x.id, x]));
      (lh.allergies || []).filter(validAllergy).map(normAllergy).forEach(x => am.set(x.id, x));
      const fm = new Map(familyHistory.map(x => [x.id, x]));
      (lh.familyHistory || []).filter(validFamily).map(normFamily).forEach(x => fm.set(x.id, x));
      const sm = new Map(surgeries.map(x => [x.id, x]));
      (lh.surgeries || []).filter(validSurgery).map(normSurgery).forEach(x => sm.set(x.id, x));
      const vm = new Map(visits.map(x => [x.id, x]));
      (lh.visits || []).filter(validVisit).map(normVisit).forEach(x => vm.set(x.id, x));
      const mm = new Map(medications.map(x => [x.id, x]));
      (lh.medications || []).filter(validMedication).map(normMedication).forEach(x => mm.set(x.id, x));
      await put('/history', {
        allergies: [...am.values()], familyHistory: [...fm.values()], surgeries: [...sm.values()],
        visits: [...vm.values()], medications: [...mm.values()]
      });
    }
    pendingMigrate = false;
    location.reload();
  } catch (e) {
    toast('合并失败，浏览器里的数据没有动');
  }
}

function persistLabs(next) {
  labs = next;
  touchSaved();
  if (storeMode === 'server') { pushJSON('/labs', next); return true; }
  try {
    localStorage.setItem(LS_LABS, JSON.stringify(next));
    return true;
  } catch (e) { toast('保存失败：浏览器存储不可用或空间不足'); return false; }
}
function persistState() {
  state.savedAt = Date.now();
  if (storeMode === 'server') { pushJSON('/state', { weights: state.weights, done: state.done, body: state.body }); return true; }
  try { localStorage.setItem(LS_STATE, JSON.stringify(state)); return true; }
  catch (e) { toast('保存失败：浏览器存储不可用或空间不足'); return false; }
}
function persistReports(next) {
  reports = next;
  if (storeMode === 'server') { pushJSON('/reports', next); return true; }
  try { localStorage.setItem(LS_REPORTS, JSON.stringify(next)); return true; }
  catch (e) { toast('保存失败：存储空间不足，报告图片可能太大'); return false; }
}
/* 过敏 / 家族史 / 手术住院 / 就诊 / 用药：整组写回。服务模式走 /api/history。 */
function persistHistory() {
  touchSaved();
  const payload = { allergies, familyHistory, surgeries, visits, medications };
  if (storeMode === 'server') { pushJSON('/history', payload); return true; }
  try { localStorage.setItem(LS_HISTORY, JSON.stringify(payload)); return true; }
  catch (e) { toast('保存失败：浏览器存储不可用或空间不足'); return false; }
}
/* 生命体征：整表写回。服务模式走 /api/vitals。 */
function persistVitals() {
  touchSaved();
  if (storeMode === 'server') { pushJSON('/vitals', vitals); return true; }
  try { localStorage.setItem(LS_VITALS, JSON.stringify(vitals)); return true; }
  catch (e) { toast('保存失败：浏览器存储不可用或空间不足'); return false; }
}
function persistSymptoms() {
  touchSaved();
  if (storeMode === 'server') { pushJSON('/symptoms', symptoms); return true; }
  try { localStorage.setItem(LS_SYMPTOMS, JSON.stringify(symptoms)); return true; }
  catch (e) { toast('保存失败：浏览器存储不可用或空间不足'); return false; }
}
/* 减重每日记录：整表写回。服务模式走 /api/diet-days。 */
function persistDietDays() {
  touchSaved();
  if (storeMode === 'server') { pushJSON('/diet-days', dietDays); return true; }
  try { localStorage.setItem(LS_DIET_DAYS, JSON.stringify(dietDays)); return true; }
  catch (e) { toast('保存失败：浏览器存储不可用或空间不足'); return false; }
}
/* 减重每周复盘：整表写回。服务模式走 /api/diet-weeks。 */
function persistDietWeeks() {
  touchSaved();
  if (storeMode === 'server') { pushJSON('/diet-weeks', dietWeeks); return true; }
  try { localStorage.setItem(LS_DIET_WEEKS, JSON.stringify(dietWeeks)); return true; }
  catch (e) { toast('保存失败：浏览器存储不可用或空间不足'); return false; }
}
/* 睡眠记录：整表写回。服务模式走 /api/sleep-logs。 */
function persistSleepLogs() {
  touchSaved();
  if (storeMode === 'server') { pushJSON('/sleep-logs', sleepLogs); return true; }
  try { localStorage.setItem(LS_SLEEP, JSON.stringify(sleepLogs)); return true; }
  catch (e) { toast('保存失败：浏览器存储不可用或空间不足'); return false; }
}
/* 健康问题状态覆盖：整表写回。服务模式走 /api/issue-status。 */
function persistIssueStatus() {
  touchSaved();
  if (storeMode === 'server') { pushJSON('/issue-status', { issueStatus }); return true; }
  try { localStorage.setItem(LS_ISSUE_STATUS, JSON.stringify(issueStatus)); return true; }
  catch (e) { toast('保存失败：浏览器存储不可用或空间不足'); return false; }
}
/* 用户新增的复诊待办：整表写回。服务模式走 /api/todos。 */
function persistTodoItems() {
  touchSaved();
  if (storeMode === 'server') { pushJSON('/todos', todoItems); return true; }
  try { localStorage.setItem(LS_TODOS, JSON.stringify(todoItems)); return true; }
  catch (e) { toast('保存失败：浏览器存储不可用或空间不足'); return false; }
}
/* 记一次写入时间，供「数据存储」卡显示；写失败不影响主流程 */
function touchSaved() {
  state.savedAt = Date.now();
  if (storeMode === 'server') return;
  try { localStorage.setItem(LS_STATE, JSON.stringify(state)); } catch (e) { }
}
/* 本机存储的计量信息：只用于展示，不参与业务判断 */
function storeInfo() {
  let bytes = 0;
  try {
    const a = localStorage.getItem(LS_LABS) || '';
    const b = localStorage.getItem(LS_STATE) || '';
    const c = localStorage.getItem(LS_REPORTS) || '';
    bytes = (new Blob([a + b + c])).size;
  } catch (e) { }
  const size = bytes < 1024 ? bytes + ' B'
    : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB'
      : (bytes / 1048576).toFixed(2) + ' MB';
  return {
    bytes, size,
    origin: location.protocol === 'file:' ? 'file://（本地文件）' : location.origin,
    at: state.savedAt ? new Date(state.savedAt) : null,
    server: storeMode === 'server',
    where: storeMode === 'server' ? 'data/health.db（本机数据库）' : '浏览器 localStorage'
  };
}
function fmtWhen(d) {
  if (!d || isNaN(d.getTime())) return '尚未保存';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
