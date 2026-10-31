// 主题「最小可用档案」模板生成器
// 目的：为空壳 / 仅目录的主题补齐「主诉 / 诊断 / 诱因 / 当前处置 / 复诊节点」五段结构，
//       并自动计算「档案完整度」、同步渲染对应 html（复用 Tools/生成HTML档案.cjs 的样式）。
// 约束：不臆造任何医疗内容；模板中的空字段一律写「待补（示例：… 请按实际填写）」，示例仅示意格式。
//
// 用法：
//   node Tools/生成主题档案.cjs --init   # 为空白 / 缺失的主题 md 写入模板（已有非空文件不覆盖），再渲染 html
//   node Tools/生成主题档案.cjs          # 只重算完成度并渲染 html（幂等）
//   node Tools/生成主题档案.cjs --check  # 只检查、不写盘
const fs = require('fs');
const path = require('path');
const { marked } = require('C:/Users/muyuys/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/marked');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const INIT = args.includes('--init');
const CHECK = args.includes('--check');

// 目录中仅有目录、没有文件的主题也纳入。
// 归档重构后：case md 位于 private_data/cases/<科室>/<case>/*.md。
// 这里从实际目录动态收集所有 case 下的 .md（不再依赖旧 docs/主题 硬编码路径）。
function collectCaseTopics() {
  const base = path.join(root, 'private_data', 'cases');
  const out = [];
  if (!fs.existsSync(base)) return out;
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.toLowerCase().endsWith('.md')) {
        const rel = path.relative(root, p).replace(/\\/g, '/');
        out.push({ rel, title: path.basename(e.name, '.md') });
      }
    }
  })(base);
  return out;
}
const TOPICS = collectCaseTopics();

// 五段最小可用档案：字段名 + 填写提示（提示只用作示例，不是真实内容）
const FIELDS = [
  ['主诉', '症状部位、出现时间、持续时长、频率、加重/缓解因素'],
  ['诊断', '医院、科室、医生、诊断名称、诊断日期'],
  ['诱因', '过敏原、季节、环境、饮食、作息等可疑诱因'],
  ['当前处置', '正在使用的药物 / 剂量 / 频次 / 疗程、非药物处理'],
  ['复诊节点', '上次就诊日期、下次复诊日期、需复查项目']
];

function templateMd(title) {
  const out = [];
  out.push(`# ${title}`);
  out.push('');
  out.push('> 本页为「最小可用档案」模板：主诉 / 诊断 / 诱因 / 当前处置 / 复诊节点。');
  out.push('> 未采集的字段统一标注「待补」，不臆测诊断或用药；示例仅示意格式，请据实填写。');
  out.push('');
  for (const [name, hint] of FIELDS) {
    out.push(`## ${name}`);
    out.push(`待补（示例：${hint}——请按实际填写，勿照抄）`);
    out.push('');
  }
  return out.join('\n').replace(/\s+$/, '') + '\n';
}

// 解析 "## 标题" 段落到 { 段名: 行数组 }
function parseSections(md) {
  const secs = {};
  let cur = null;
  for (const line of md.split(/\r?\n/)) {
    const hm = /^##\s+(.+?)\s*$/.exec(line);
    if (hm) { cur = hm[1].trim(); secs[cur] = []; continue; }
    if (cur) secs[cur].push(line);
  }
  return secs;
}

// 段落是否“已填”：存在非空、且不是占位/引用/分隔线的正文行
function isFilled(body) {
  return (body || []).some(line => {
    const t = line.trim();
    if (!t) return false;
    if (t.startsWith('待补')) return false;
    if (t.startsWith('>')) return false;
    if (t.startsWith('示例')) return false;
    if (/^[-*_]{3,}$/.test(t)) return false;
    return true;
  });
}

function stripCompleteness(md) {
  const idx = md.search(/^##\s*档案完整度\s*$/m);
  if (idx < 0) return md.replace(/\s+$/, '');
  return md.slice(0, idx).replace(/\s+$/, '');
}

function completenessMd(md) {
  const secs = parseSections(md);
  const rows = FIELDS.map(([n]) => [n, isFilled(secs[n])]);
  const ok = rows.filter(r => r[1]).length;
  const total = rows.length;
  const pct = Math.round(ok / total * 100);
  const label = ok === 0 ? '空壳待补' : (ok === total ? '已完整' : '信息收集中');
  let out = '## 档案完整度\n\n| 项目 | 状态 |\n| --- | --- |\n';
  for (const [n, filled] of rows) out += `| ${n} | ${filled ? '✅ 已填' : '⬜ 待补'} |\n`;
  out += `| **合计** | **${ok} / ${total}（${pct}%）** |\n\n`;
  out += `> 完成度：${ok} / ${total} 项已填（${pct}%）　·　状态：${label}　·　由生成脚本自动计算\n`;
  return out;
}

// 复用既有生成脚本的样式常量，避免两处 CSS 漂移
function loadCss() {
  const src = fs.readFileSync(path.join(__dirname, '生成HTML档案.cjs'), 'utf8');
  const m = src.match(/const css = `([\s\S]*?)`;/);
  if (!m) throw new Error('未能从 Tools/生成HTML档案.cjs 读取样式常量 css');
  return m[1];
}
const CSS = loadCss();

let SRC_DIR = root;
marked.use({
  walkTokens(t) {
    if ((t.type === 'link' || t.type === 'image') && t.href) {
      let h = t.href.replace(/^F:\/Health\//i, path.relative(SRC_DIR, root).replace(/\\/g, '/') + '/');
      if (/\.md(?:#.*)?$/i.test(h)) h = h.replace(/\.md(?=#|$)/i, '.html');
      t.href = h;
    }
  }
});

// 输出根目录：默认写回仓库；--out=<相对目录> 时写到暂存目录（用于受限环境预览）
const OUT = (args.find(a => a.startsWith('--out=')) || '').slice('--out='.length);
const OUT_ROOT = OUT ? path.join(root, OUT) : root;
const destOf = rel => path.join(OUT_ROOT, rel);

function renderHtml(rel, md) {
  const src = path.join(root, rel);
  SRC_DIR = path.dirname(src);
  const logicalOut = path.join(root, rel.replace(/\.md$/i, '.html')); // 用最终位置计算相对链接
  const out = destOf(rel.replace(/\.md$/i, '.html'));
  const content = marked.parse(md);
  const home = path.relative(path.dirname(logicalOut), path.join(root, 'index.html')).replace(/\\/g, '/') || 'index.html';
  const title = path.basename(rel, '.md');
  const body = content.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 个人健康档案</title><style>${CSS}</style></head><body><header><span>PERSONAL HEALTH RECORD</span><a href="${home}">个人健康档案 / 首页</a></header><main>${body}</main><footer>本地健康档案 · 请根据实际情况更新记录</footer></body></html>`;
  if (!CHECK) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html, 'utf8'); }
  return out;
}

let created = 0, updated = 0;
for (const { rel, title } of TOPICS) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(destOf(rel)), { recursive: true });
  const exists = fs.existsSync(full) && fs.statSync(full).size > 0;
  if (!exists) {
    if (INIT) {
      if (!CHECK) fs.writeFileSync(destOf(rel), templateMd(title), 'utf8');
      console.log((CHECK ? '[check] 将创建: ' : '创建模板: ') + rel);
      created++;
    } else {
      console.log('跳过（文件为空/缺失，未加 --init）: ' + rel);
      continue;
    }
  }
  let md = fs.readFileSync(full, 'utf8');
  const next = stripCompleteness(md) + '\n\n' + completenessMd(md);
  if (!CHECK) { fs.mkdirSync(path.dirname(destOf(rel)), { recursive: true }); fs.writeFileSync(destOf(rel), next, 'utf8'); }
  const out = renderHtml(rel, next);
  updated++;
  console.log('渲染: ' + rel + ' -> ' + path.relative(root, out));
}
console.log(`完成：创建 ${created} 个，渲染 ${updated} 个${CHECK ? '（检查模式，未写盘）' : ''}${OUT ? '（输出到暂存: ' + OUT + '）' : ''}`);
