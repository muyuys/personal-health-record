/* ======================= 派生数据 ======================= */
function labKey(r) { return JSON.stringify([r.category, r.name.trim(), r.unit.trim()]); }
function labRange(r) {
  if (r.low === null && r.high === null) return '未填写';
  return `${r.low === null ? '—' : r.low} – ${r.high === null ? '—' : r.high}`;
}
/* 定性结果没有数值：value 为 null，结果看 qualitative 文本；异常用统一 flag(H/L/N) 表达 */
function labValueRaw(r) {
  if (r && r.value !== null && r.value !== undefined && Number.isFinite(r.value)) return r.value;
  return r ? (r.qualitative || '') : '';
}
function labValueText(r) { return esc(labValueRaw(r)); }
function calcLabFlag(value, low, high) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  if (high !== null && high !== undefined && value > high) return 'H';
  if (low !== null && low !== undefined && value < low) return 'L';
  if ((low !== null && low !== undefined) || (high !== null && high !== undefined)) return 'N';
  return '';
}
function qualFlagOf(q) {
  const s = String(q || '').trim();
  if (!s) return '';
  if (/^(阴性|未见异常|正常|未检出)$/.test(s)) return 'N';
  if (/^(阳性|弱阳性|异常|可疑|±|\+\-|\+−|\+{1,4})$/.test(s)) return 'H';
  return '';
}
function isAbnormal(r) {
  if (!r) return false;
  if (r.flag === 'H' || r.flag === 'L') return true;   // 已给出的统一标志优先（含定性、报告箭头）
  if (typeof r.value !== 'number' || !Number.isFinite(r.value)) return false;
  return (r.low !== null && r.low !== undefined && r.value < r.low)
    || (r.high !== null && r.high !== undefined && r.value > r.high);
}
/* 表格里的「提示」列：单独一列表达是否超出参考范围，不挤在数值旁 */
function labFlagCell(r) {
  if (r.qualitative && !(typeof r.value === 'number' && Number.isFinite(r.value))) {
    if (r.flag === 'H') return '<span class="fl up" title="定性结果异常">↑</span>';
    if (r.flag === 'N') return '<span class="fl ok" title="定性结果正常">·</span>';
    return '<span class="fl na" title="定性结果">—</span>';
  }
  if (r.low === null && r.high === null) return '<span class="fl na" title="未填参考范围，无法判断">—</span>';
  if (r.value > r.high) return '<span class="fl up" title="高于参考上限">↑</span>';
  if (r.value < r.low) return '<span class="fl down" title="低于参考下限">↓</span>';
  return '<span class="fl ok" title="在参考区间内">·</span>';
}

/* ==== 检验结论派生（问题总表 / 总览由此实时生成，禁止再手写“暂无结果”类结论） ====
   带 labDerived 数组的问题（目前是肝肾功能）在 route() 里由 applyLabDerived() 重算：
   card / head / evidence / need / lastDate / lastLabel / status。
   每次路由都从 labs 重新派生，幂等；新增化验后自动出现结论与异常标记。 */
function labFlagOf(r) {
  if (!r) return '';
  if (r.flag === 'H') return '↑';
  if (r.flag === 'L') return '↓';
  if (r.qualitative) return '';
  if ((r.low === null || r.low === undefined) && (r.high === null || r.high === undefined)) return '';
  if (r.low != null && r.value < r.low) return '↓';
  if (r.high != null && r.value > r.high) return '↑';
  return '';
}
function fmtRef(r) {
  if (r.low === null && r.high === null) return '未给参考区间';
  return `${r.low === null ? '—' : r.low}–${r.high === null ? '—' : r.high}`;
}
function catLatest(cat) {
  const rows = labs.filter(r => r.category === cat);
  if (!rows.length) return { cat, count: 0, date: '', abn: [], all: [] };
  const date = rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0].date);
  const latest = rows.filter(r => r.date === date);
  const abn = latest.filter(r => labFlagOf(r));
  return { cat, count: latest.length, date, abn, all: latest };
}
function deriveLabIssue(i) {
  const cats = i.labDerived;
  if (!cats) return i;
  const sums = cats.map(catLatest);
  const used = sums.filter(s => s.count);
  const isEgfr = r => /滤过率/.test(r.name);
  if (!used.length) {
    return {
      ...i,
      status: 'pending', lastLabel: '待录入化验单', lastDate: '未记录',
      card: '尚未录入肝肾功能化验；录入报告后自动生成结论与异常标记。',
      head: '尚未录入肝功能／肾功能化验',
      evidence: [{ type: '辅助分析', text: '本主题的检验结论由数据库化验记录自动派生；当前没有肝肾功能类化验，需补录报告。' }],
      need: '有报告时录入检查日期、数值、单位、参考范围和医生意见。'
    };
  }
  const lastDate = used.reduce((m, s) => (s.date > m ? s.date : m), used[0].date);
  const abn = used.flatMap(s => s.abn);
  const total = used.reduce((n, s) => n + s.count, 0);
  const evidence = abn.map(r => ({
    type: '医院报告',
    text: `${r.date} ${r.name} ${labValueRaw(r)} ${r.unit}${labFlagOf(r)}（参考 ${fmtRef(r)}）`
  }));
  /* 无参考区间但需要医生解读的项（如 eGFR）：只原样显示数值，不擅自给区间 */
  used.forEach(s => s.all.forEach(r => {
    if (r.low === null && r.high === null && isEgfr(r)) {
      evidence.push({ type: '医院报告', text: `${r.date} ${r.name} ${r.value} ${r.unit}（报告未给参考区间，需结合医生解读）` });
    }
  }));
  if (abn.length) {
    used.forEach(s => {
      const n = s.count - s.abn.length;
      if (n > 0) evidence.push({ type: '辅助分析', text: `${s.cat} ${s.date} 其余 ${n} 项在参考范围内。` });
    });
  } else {
    evidence.push({ type: '辅助分析', text: `${used.map(s => `${s.cat} ${s.date} ${s.count} 项`).join('、')}均在参考范围内。` });
  }
  evidence.push({ type: '辅助分析', text: '以上结论与异常标记由数据库化验记录自动生成，不是新增诊断，也不能替代医生解读。' });
  const abnTxt = abn.map(r => `${r.name} ${labValueRaw(r)}${r.unit}${labFlagOf(r)}`).join('、');
  return {
    ...i,
    status: abn.length ? 'followup' : 'monitor',
    lastDate,
    lastLabel: abn.length ? '化验异常' : '化验结果',
    card: abn.length
      ? `最近化验 ${lastDate} 异常 ${abn.length} 项：${abnTxt}。`
      : `最近化验 ${lastDate} 共 ${total} 项，均在参考范围内。`,
    head: `最近化验 ${lastDate}　·　共 ${total} 项${abn.length ? `，异常 ${abn.length} 项` : ''}`,
    evidence,
    need: abn.length
      ? '携带最近报告复诊，听取医生对异常项的解释与处理建议；关注指标趋势。'
      : '定期复查；有新的报告时本结论会自动更新。'
  };
}
function applyLabDerived() {
  ARCHIVE.issues = ARCHIVE.issues.map(deriveLabIssue);
}
/* 页内「健康问题状态」覆盖：只改用户可见状态与备注，不改静态档案内容。
   基线快照 baseIssues 在首次调用时从 data.js 原始值复制，避免被覆盖值污染。 */
let _baseIssues = null;
function resetIssuesBase() {
  if (!_baseIssues) _baseIssues = ARCHIVE.issues.map(i => ({ ...i }));
  ARCHIVE.issues = _baseIssues.map(i => ({ ...i }));
}
function applyIssueOverrides() {
  ARCHIVE.issues = ARCHIVE.issues.map(i => {
    const o = issueStatus[i.id];
    if (!o) return i;
    const next = { ...i };
    if (o.status && ARCHIVE.statuses[o.status]) next.status = o.status;
    if (o.note) next.userNote = o.note;
    return next;
  });
}

function weightList() {
  return state.weights.slice().sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
}
function latestWeight() { return weightList().at(-1); }

function morningSeries() {
  const m = new Map();
  weightList().filter(w => w.tag === 'morning').forEach(w => {
    const arr = m.get(w.date) || [];
    arr.push(w.kg);
    m.set(w.date, arr);
  });
  return Array.from(m.entries()).map(([date, arr]) => ({ date, kg: avg(arr) })).sort((a, b) => a.date.localeCompare(b.date));
}
function baselineInfo() {
  const s = morningSeries();
  if (s.length >= 7) return { ok: true, kg: avg(s.slice(-7).map(x => x.kg)), days: s.length };
  return { ok: false, kg: null, days: s.length, need: 7 - s.length };
}
/* 档案里没填目标或起点，就是「还没设」，不能拿 0 / NaN 冒充数字 */
function wtTarget() {
  const t = ARCHIVE.weight && ARCHIVE.weight.target;
  return Number.isFinite(t) ? t : null;
}
function wtStart() {
  const s = ARCHIVE.weight && ARCHIVE.weight.start;
  return Number.isFinite(s) ? s : null;
}
/* 没有体重记录、没设起点/目标 → null（界面显示「—」，不显示 0% 或 NaN） */
function progressPct() {
  const cur = latestWeight();
  const start = wtStart();
  const target = wtTarget();
  if (!cur || start === null || target === null || start === target) return null;
  return Math.min(100, Math.max(0, (start - cur.kg) / (start - target) * 100));
}
function bmiNow() {
  const cur = latestWeight();
  const h = ARCHIVE.profile && ARCHIVE.profile.height;
  if (!cur || !Number.isFinite(h) || h <= 0) return null;
  return cur.kg / Math.pow(h / 100, 2);
}
function waistRecord() {
  return weightList().slice().reverse().find(x => Number.isFinite(x.waist) && x.waist > 0) || null;
}
function waistNow() {
  const w = waistRecord();
  return w ? w.waist : null;
}
/* 个人资料字段：腰围随本机记录更新；过敏/手术/家族史有结构化记录时标记为已填 */
function profileFields() {
  const w = waistRecord();
  const alg = allergies.length
    ? `已记录 ${allergies.length} 项：${allergies.map(a => `${a.name}${a.severity === 'critical' ? '（危急）' : ''}`).join('、')}`
    : '';
  const sur = surgeries.length ? `已记录 ${surgeries.length} 次：${surgeries.map(s => s.name).join('、')}` : '';
  const fam = familyHistory.length ? `已记录 ${familyHistory.length} 项：${familyHistory.map(f => `${f.relation} ${f.condition}`).join('、')}` : '';
  const actMeds = medications.filter(m => m.status === 'active');
  const med = actMeds.length ? `在服 ${actMeds.length} 项：${actMeds.map(m => m.name).join('、')}` : '';
  const structured = {
    '药物／食物过敏及反应': alg,
    '既往手术／住院史': sur,
    '其他确诊疾病与家族史': fam,
    '当前全部药物／补充剂': med
  };
  return ARCHIVE.profile.fields.map(f => {
    if (f.k === '腰围' && w) return { ...f, v: `${num(w.waist)} cm（${w.date} 记录）`, ok: true };
    if (structured[f.k]) return { ...f, v: structured[f.k], ok: true };
    return f;
  });
}
/* 个人资料必填清单（10 项，来自产品缺口分析 P0/P1）。
   每项映射到 profileFields() 里的一个字段；ok 决定「已填 / 待填」。
   过敏 / 手术住院 / 家族史 / 当前用药复用任务 005/010 的结构化表，不另建表。 */
const PROFILE_REQUIRED = [
  { key: 'name', label: '姓名／称呼', field: '姓名／称呼' },
  { key: 'birth', label: '出生日期', field: '出生日期' },
  { key: 'waist', label: '腰围', field: '腰围' },
  { key: 'sleep', label: '睡眠与作息', field: '睡眠与作息' },
  { key: 'smoke', label: '吸烟／饮酒', field: '吸烟／饮酒' },
  { key: 'diet', label: '饮食习惯、外卖频率', field: '饮食习惯、外卖频率' },
  { key: 'allergy', label: '过敏史', field: '药物／食物过敏及反应' },
  { key: 'surgery', label: '手术／住院史', field: '既往手术／住院史' },
  { key: 'family', label: '家族史', field: '其他确诊疾病与家族史' },
  { key: 'meds', label: '当前全部用药', field: '当前全部药物／补充剂' }
];
function profileChecklist() {
  const byK = {};
  profileFields().forEach(f => { byK[f.k] = f; });
  return PROFILE_REQUIRED.map(it => {
    const f = byK[it.field] || { v: '待填', ok: false };
    return { key: it.key, label: it.label, value: f.v, ok: !!f.ok };
  });
}
function allTodos() {
  const base = ARCHIVE.todos.flatMap(g => g.items.map(i => ({ ...i, group: g.group })));
  return base.concat(todoItems.map(t => ({ ...t, group: t.groupName || '我新增的待办' })));
}
function openTodos() { return allTodos().filter(t => !state.done[t.id]); }

/* ======================= 提醒（到期复诊 / 用药 / 未备份） ======================= */
/* 全部数据驱动：只根据「待办的到期日」「在用药物结束日」「上次导出时间」生成提醒，
   不猜测、不编造。到期/未备份在首页横幅展示，可在当天忽略，不弹窗、不打断使用。 */
const REMIND_SOON_DAYS = 7;

function localExportStatus() {
  let last = null;
  try {
    const raw = localStorage.getItem(LS_LAST_EXPORT);
    last = raw ? parseInt(raw, 10) : null;
  } catch (e) { last = null; }
  if (last === null || !Number.isFinite(last)) last = null;
  const now = Math.floor(Date.now() / 1000);
  const days = last === null ? null : (now - last) / 86400;
  return {
    lastExportAt: last,
    daysSince: days === null ? null : Math.round(days * 10) / 10,
    due: last === null || days >= REMIND_SOON_DAYS
  };
}
function currentExportStatus() {
  if (storeMode === 'server' && exportStatus) return exportStatus;
  return localExportStatus();
}
/* 距今天的天数：0=今天，负数=已过，正数=还有几天；非法日期返回 null */
function daysFromToday(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return null;
  const t = new Date(iso + 'T00:00:00');
  if (isNaN(t.getTime())) return null;
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t - t0) / 86400000);
}
/* 从一段文字里取第一个 ISO 日期（静态待办的日期写在备注 meta 文本里） */
function firstISODate(text) {
  const m = String(text || '').match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}
/* 待办到期日：优先用结构化 dueDate，其次从备注里找第一个 ISO 日期 */
function todoDue(t) { return normISODate(t && t.dueDate) || firstISODate(t && t.meta); }

function reminderDismissMap() {
  try { return JSON.parse(localStorage.getItem(LS_REMIND_DISMISS) || '{}') || {}; }
  catch (e) { return {}; }
}
function isReminderDismissed(key) { return reminderDismissMap()[key] === todayISO(); }
function dismissReminder(key) {
  const m = reminderDismissMap();
  if (key) m[key] = todayISO();
  else visibleReminders().forEach(r => { m[r.key] = todayISO(); });
  try { localStorage.setItem(LS_REMIND_DISMISS, JSON.stringify(m)); } catch (e) { }
  refreshReminders();
}
function buildReminders() {
  const out = [];
  // 1) 到期 / 临近的复诊与待办（静态待办 + 用户新增待办，未完成的）
  openTodos().forEach(t => {
    const due = todoDue(t);
    if (!due) return;
    const d = daysFromToday(due);
    if (d === null || d > REMIND_SOON_DAYS) return;
    out.push({
      key: 'followup:' + t.id, kind: 'followup', page: 'todo',
      title: t.text,
      sub: due + (d < 0 ? `　·　已逾期 ${-d} 天` : d === 0 ? '　·　今天' : `　·　还有 ${d} 天`),
      level: d < 0 ? 'over' : 'soon', dueNum: d, action: { act: 'go', to: 'todo' }
    });
  });
  // 2) 在用药物：处方 / 疗程即将或已经结束，提示确认续药或停药（不改状态，只提醒）
  medications.filter(m => m.status === 'active' && m.endDate).forEach(m => {
    const d = daysFromToday(m.endDate);
    if (d === null || d > REMIND_SOON_DAYS) return;
    out.push({
      key: 'med:' + m.id, kind: 'med', page: 'meds',
      title: (m.name || '药物') + (m.dose ? ' ' + m.dose : ''),
      sub: (d < 0 ? `已到期 ${-d} 天` : d === 0 ? '今天到期' : `还剩 ${d} 天`) + '　·　请确认续药或停药',
      level: d < 0 ? 'over' : 'soon', dueNum: d, action: { act: 'go', to: 'meds' }
    });
  });
  // 3) 未备份：还没导出过，或距上次导出已超过提醒天数；有数据才提醒
  const es = currentExportStatus();
  const hasData = labs.length || reports.length || state.weights.length || state.body.length
    || visits.length || medications.length;
  if (es && es.due && hasData) {
    const never = es.lastExportAt === null || es.lastExportAt === undefined;
    out.push({
      key: 'backup', kind: 'backup', page: 'profile',
      title: never ? '还没有导出过备份' : '该导出备份了',
      sub: never ? '点此导出完整 JSON 备份到别处保存' : `距上次导出 ${es.daysSince} 天，建议重新导出`,
      level: never ? 'over' : 'soon', dueNum: 0, action: { act: 'export' }
    });
  }
  // 已到期的排前面，其次按到期天数由近到远
  out.sort((a, b) => (a.level === b.level ? a.dueNum - b.dueNum : (a.level === 'over' ? -1 : 1)));
  return out;
}
function visibleReminders() { return buildReminders().filter(r => !isReminderDismissed(r.key)); }
function reminderCountByPage() {
  const by = {};
  visibleReminders().forEach(r => { if (r.page) by[r.page] = (by[r.page] || 0) + 1; });
  return by;
}
function reminderBandHTML() {
  const items = visibleReminders();
  if (!items.length) return '';
  return `<section class="remind-band">
    <div class="remind-head">${I.clock}<b>待处理提醒</b><span class="remind-count">${items.length}</span>
      <button class="remind-x" data-act="remind-dismiss" aria-label="今天不再提示" title="今天先不提示">${I.close}</button>
    </div>
    <div class="remind-list">
      ${items.map(it => `<button class="remind-item ${it.level}" data-act="${it.action.act}"${it.action.to ? ` data-to="${it.action.to}"` : ''}>
        <span class="ri-dot"></span>
        <span class="ri-main"><b>${esc(it.title)}</b><small>${esc(it.sub)}</small></span>
        <span class="ri-tag">${it.level === 'over' ? '已到期' : '临近'}</span>
      </button>`).join('')}
    </div>
  </section>`;
}
function refreshReminders() {
  if (currentPage() === 'overview') route();
  else syncChrome(currentPage());
}
/* 导出成功后调用：更新「上次导出」状态并刷新首页/红点，未备份提醒随之消失 */
function markExported() {
  const now = Math.floor(Date.now() / 1000);
  exportStatus = { lastExportAt: now, daysSince: 0, due: false };
  try { localStorage.setItem(LS_LAST_EXPORT, String(now)); } catch (e) { }
  refreshReminders();
}

const SHORT = {
  '姓名／称呼': '姓名', '药物／食物过敏及反应': '过敏史', '饮食习惯、外卖频率': '饮食习惯',
  '既往手术／住院史': '手术史', '其他确诊疾病与家族史': '家族史', '当前全部药物／补充剂': '当前用药',
  '吸烟／饮酒': '吸烟饮酒', '生理性别（能量估算用）': '性别'
};
function completeness() {
  const pf = profileFields();
  const okP = pf.filter(f => f.ok).length;
  const iss = ARCHIVE.issues || [];
  const okI = iss.filter(i => !['pending', 'stub'].includes(i.status)).length;
  /* 档案为空时不能除零：没有可算的分母就当 0%，别出 NaN */
  const pct = Math.round((
    (pf.length ? okP / pf.length * 0.4 : 0) +
    (iss.length ? okI / iss.length * 0.4 : 0) +
    (labs.length ? 0.2 : 0)
  ) * 100);
  const missAll = [
    ...pf.filter(f => !f.ok).map(f => SHORT[f.k] || f.k),
    ...iss.filter(i => ['pending', 'stub'].includes(i.status)).map(i => i.name)
  ];
  const PRIORITY = ['过敏史', '腰围', '睡眠与作息', '肝肾功能', '鼻炎', '脱发', '牙齿 · 甲沟炎 · 脚气', '尿频尿急尿不尽'];
  missAll.sort((a, b) => {
    const ia = PRIORITY.indexOf(a), ib = PRIORITY.indexOf(b);
    const wa = a === '姓名' ? 999 : (ia < 0 ? 500 : ia);
    const wb = b === '姓名' ? 999 : (ib < 0 ? 500 : ib);
    return wa - wb;
  });
  const missing = missAll.slice(0, 5);
  return { pct, missing, okP, okI, totalP: pf.length, totalI: iss.length };
}
