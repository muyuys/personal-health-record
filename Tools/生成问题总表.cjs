// 从 data/health.db 的 labs 表只读派生「健康问题总表」里的检验结论，并生成 .md/.html。
// - 只读数据库，绝不写 DB；幂等（表格行按主题名替换，检验摘要放在 AUTO 标记之间，重跑覆盖）。
// - 异常严格按每条记录自身的参考范围 low/high 判定；未给区间的项（如 eGFR）只原样显示，不编造区间。
// 用法：node Tools/生成问题总表.cjs
const fs = require('fs'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { marked } = require('C:/Users/muyuys/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/marked');

const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'data', 'health.db');
// 新归档结构：总表位于 private_data/record/problems-summary/
const mdPath = path.join(root, 'private_data', 'record', 'problems-summary', '健康问题总表.md');
const htmlPath = mdPath.replace(/\.md$/i, '.html');
// 可选：SCQ_OUT=<目录> 时把结果写到该目录（用于沙箱内 dry-run / 预览，默认写回 docs）。
const OUT = process.env.SCQ_OUT || '';
const mdOut = OUT ? path.join(OUT, path.basename(mdPath)) : mdPath;
const htmlOut = OUT ? path.join(OUT, path.basename(htmlPath)) : htmlPath;
const ISSUE_CATS = ['肾功能', '肝功能']; // 对应 app.js 里 liver 问题的 labDerived

const has = v => v !== null && v !== undefined;
function flagOf(r) {
  if (!has(r.low) && !has(r.high)) return '';
  if (has(r.low) && r.value < r.low) return '↓';
  if (has(r.high) && r.value > r.high) return '↑';
  return '';
}
function fmtRef(r) {
  if (!has(r.low) && !has(r.high)) return '未给参考区间';
  return `${has(r.low) ? r.low : '—'}–${has(r.high) ? r.high : '—'}`;
}
function num(v) { return v === null || v === undefined ? '' : String(v); }

function loadRows() {
  if (!fs.existsSync(dbPath)) return null;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare('SELECT date, category, name, value, unit, low, high FROM labs').all();
  } finally {
    db.close();
  }
}

function catLatest(rows, cat) {
  const list = rows.filter(r => r.category === cat);
  if (!list.length) return { cat, count: 0, date: '', abn: [], all: [] };
  const date = list.reduce((m, r) => (r.date > m ? r.date : m), list[0].date);
  const all = list.filter(r => r.date === date);
  const abn = all.filter(r => flagOf(r));
  return { cat, count: all.length, date, abn, all };
}

function summarize(rows) {
  const used = ISSUE_CATS.map(c => catLatest(rows, c)).filter(s => s.count);
  const abn = used.flatMap(s => s.abn);
  const egfr = [];
  used.forEach(s => s.all.forEach(r => { if (!has(r.low) && !has(r.high) && /滤过率/.test(r.name)) egfr.push(r); }));
  const lastDate = used.length ? used.reduce((m, s) => (s.date > m ? s.date : m), used[0].date) : '未记录';
  const total = used.reduce((n, s) => n + s.count, 0);
  return { used, abn, egfr, lastDate, total };
}

function buildRowCell(sum) {
  const egfrTxt = sum.egfr.map(r => `${r.name} ${num(r.value)}${r.unit || ''}`).join('、');
  if (!sum.used.length) {
    return { conclusion: '数据库中暂无肝肾功能化验记录（录入报告后本表自动更新）', need: '有报告时录入检查日期、数值、单位、参考范围和医生意见。', date: '未记录' };
  }
  let conclusion;
  if (sum.abn.length) {
    const abnTxt = sum.abn.map(r => `${r.name} ${num(r.value)}${r.unit || ''}${flagOf(r)}（参考 ${fmtRef(r)}）`).join('、');
    conclusion = `最近化验 ${sum.lastDate} 共 ${sum.total} 项，异常 ${sum.abn.length} 项：${abnTxt}`;
  } else {
    conclusion = `最近化验 ${sum.lastDate} 共 ${sum.total} 项，均在参考范围内`;
  }
  if (sum.egfr.length) conclusion += `；${egfrTxt}（报告未给参考区间，需医生解读）`;
  const need = sum.abn.length
    ? '携带最近报告复诊，听取医生对异常项的解释与处置建议；关注指标趋势。'
    : '定期复查；有新的报告时本表会自动更新。';
  return { conclusion, need, date: sum.lastDate };
}

function autoSection(sum) {
  const lines = [];
  lines.push('<!-- AUTO:LABS:BEGIN -->');
  lines.push('## 检验结果摘要（自动生成）');
  lines.push('');
  lines.push('> 本节由 `Tools/生成问题总表.cjs` 从 `data/health.db` 的 `labs` 表自动派生，请勿手改；新增或修改化验后重跑脚本即可更新。异常按每条记录自身的参考范围判定，未给区间的项不代表正常；完整逐项结果见检验指标页。');
  lines.push('');
  if (!sum.used.length) {
    lines.push('数据库暂无肝肾功能类化验记录（录入报告后本表自动更新）。');
  } else {
    const parts = sum.used.map(s => `${s.cat} ${s.count} 项`).join('、');
    if (sum.abn.length) {
      lines.push(`最近化验 ${sum.lastDate}，共 ${sum.total} 项（${parts}），异常 ${sum.abn.length} 项：`);
      lines.push('');
      lines.push('| 项目 | 数值 | 参考区间 | 提示 | 类别 |');
      lines.push('| --- | --- | --- | --- | --- |');
      sum.abn.forEach(r => lines.push(`| ${r.name} | ${num(r.value)}${r.unit || ''} | ${fmtRef(r)} | ${flagOf(r) === '↑' ? '↑ 偏高' : '↓ 偏低'} | ${r.category} |`));
      lines.push('');
      let tail = `其余 ${sum.total - sum.abn.length} 项在参考范围内。`;
      if (sum.egfr.length) tail = `${sum.egfr.map(r => `${r.name} ${num(r.value)}${r.unit || ''}`).join('、')}（报告未给参考区间，需医生解读）；` + tail;
      lines.push(tail);
    } else {
      let tail = `最近化验 ${sum.lastDate}，共 ${sum.total} 项（${parts}），均在参考范围内。`;
      if (sum.egfr.length) tail += `注意 ${sum.egfr.map(r => `${r.name} ${num(r.value)}${r.unit || ''}`).join('、')} 报告未给参考区间，需医生解读。`;
      lines.push(tail);
    }
  }
  lines.push('<!-- AUTO:LABS:END -->');
  return lines.join('\n');
}

function main() {
  const rows = loadRows();
  if (rows === null) { console.error('未找到数据库：' + dbPath); process.exit(1); }
  let md = fs.readFileSync(mdPath, 'utf8');
  const sum = summarize(rows);
  const cell = buildRowCell(sum);

  // 1) 替换「| 肝肾功能 |」整行，保留原来源链接列
  const lines = md.split(/\r?\n/);
  let replaced = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\|\s*肝肾功能\s*\|/.test(lines[i])) {
      const cells = lines[i].split('|');
      const src = (cells[5] || '').trim() || '[原文件](../../cases/nephrology/renal-function/肝肾功能检查.md)';
      lines[i] = `| 肝肾功能 | ${cell.conclusion} | ${cell.date} | ${cell.need} | ${src} |`;
      replaced = true;
      break;
    }
  }
  if (!replaced) console.warn('警告：未在 Markdown 中找到「肝肾功能」行，未更改表格行。');
  md = lines.join('\n');

  // 2) 插入/替换「检验结果摘要（自动生成）」区块
  const block = autoSection(sum);
  const begin = '<!-- AUTO:LABS:BEGIN -->', end = '<!-- AUTO:LABS:END -->';
  const bi = md.indexOf(begin), ei = md.indexOf(end);
  if (bi !== -1 && ei !== -1 && ei > bi) {
    md = md.slice(0, bi) + block + md.slice(ei + end.length);
  } else {
    const anchor = '## 需要保留的不确定性';
    const ai = md.indexOf(anchor);
    if (ai === -1) md = md.trimEnd() + '\n\n' + block + '\n';
    else md = md.slice(0, ai) + block + '\n\n' + md.slice(ai);
  }
  fs.writeFileSync(mdOut, md, 'utf8');

  // 3) 由 md 生成 html（复用 生成HTML档案.cjs 的模板与链接改写）
  const css = `:root{color-scheme:light;--ink:#203831;--muted:#63746e;--accent:#276c59;--line:#dce7df}*{box-sizing:border-box}body{margin:0;background:#f3f7f2;color:var(--ink);font:16px/1.75 system-ui,'Microsoft YaHei',sans-serif}header{background:#163f34;color:#fff;padding:22px max(5vw,24px)}header a{color:#d8f1e5;text-decoration:none;font-weight:600}header span{display:block;font-size:12px;letter-spacing:.16em;color:#aed3c1}main{max-width:1050px;margin:32px auto;padding:36px 48px;background:white;border:1px solid var(--line);border-radius:16px;box-shadow:0 12px 35px #194f3010}h1{font-size:2em;line-height:1.3;margin:0 0 14px}h2{border-top:1px solid var(--line);padding-top:24px;margin-top:32px;font-size:1.4em}h3{margin-top:24px}a{color:var(--accent);overflow-wrap:anywhere}p,li{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:.93em}th,td{text-align:left;padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:top}th{background:#edf5ef} .table-wrap{overflow-x:auto}blockquote{margin:20px 0;padding:1px 18px;border-left:4px solid #91bda7;background:#f1f7f2;color:#415c4e}img{max-width:100%;height:auto}footer{max-width:1050px;margin:auto;padding:0 24px 32px;color:var(--muted);font-size:.85em}@media(max-width:600px){main{margin:12px;padding:24px 20px;border-radius:10px}header{padding:16px 20px}h1{font-size:1.65em}}@media print{body{background:white}main{box-shadow:none;border:0;margin:0;padding:0}header{background:white;color:black}header a{color:black}}`;
  marked.use({ walkTokens(t) { if ((t.type === 'link' || t.type === 'image') && t.href) { let h = t.href.replace(/^F:\/Health\//i, path.relative(path.dirname(mdPath), root).replace(/\\/g, '/') + '/'); if (/\.md(?:#.*)?$/i.test(h)) h = h.replace(/\.md(?=#|$)/i, '.html'); t.href = h; } } });
  const content = marked.parse(md);
  const home = path.relative(path.dirname(htmlPath), path.join(root, 'index.html')).replace(/\\/g, '/') || 'index.html';
  const title = path.basename(mdPath, '.md');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 个人健康档案</title><style>${css}</style></head><body><header><span>PERSONAL HEALTH RECORD</span><a href="${home}">个人健康档案 / 首页</a></header><main>${content.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>')}</main><footer>本地健康档案 · 请根据实际情况更新记录</footer></body></html>`;
  fs.writeFileSync(htmlOut, html, 'utf8');

  console.log(`已更新 ${path.relative(root, mdOut)} 与 ${path.relative(root, htmlOut)}`);
  console.log(`来源 ${rows.length} 条化验；本次涉及 ${sum.used.map(s => s.cat + s.count + '项').join('、') || '无'}；异常 ${sum.abn.length} 项；最近 ${sum.lastDate}`);
}

main();
