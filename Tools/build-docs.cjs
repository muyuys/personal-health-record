// =====================================================================
// Tools/build-docs.cjs — 统一的「Markdown → HTML」构建入口（task 019）
//
// 目的：一条命令重跑全部文档页面，消除 .md 与 .html 手工同步造成的漂移。
//
// 用法：
//   node Tools/build-docs.cjs                  # 完整构建（写回仓库 true 目录）
//   node Tools/build-docs.cjs --out=build_tmp  # 暂存构建：全部输出写到 build_tmp/（不改动真实 docs）
//   node Tools/build-docs.cjs --check           # 只列出将处理的文件，不写盘、不跑子脚本
//
// 收敛关系：把原先分散的三个脚本收敛到这个入口——
//   - Tools/生成问题总表.cjs  从 data/health.db 只读派生「健康问题总表」（幂等，绝不写 DB）
//   - Tools/生成主题档案.cjs  补齐主题五段结构并计算「档案完整度」（幂等）
//   - Tools/生成HTML档案.cjs  通用 .md→.html 渲染；本脚本直接复用其 CSS 常量，
//                             保证所有页面样式单一来源、不会漂移
//
// 实现说明：为保持改动可逆，三个原脚本保留不动；build-docs 通过子进程依次调用
// 前两个（均为只读 / 幂等），再用统一模板把 docs 下全部 .md（及根 README.md）
// 重新渲染为 .html（强制覆盖，从而修复历史漂移）。
// =====================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { marked } = require('C:/Users/muyuys/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/marked');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const OUT = (args.find(a => a.startsWith('--out=')) || '').slice('--out='.length);
const OUT_ROOT = OUT ? path.join(root, OUT) : root;
const destOf = rel => path.join(OUT_ROOT, rel);

// --- 复用 生成HTML档案.cjs 的样式常量，避免两处 CSS 漂移 ---
function loadCss() {
  const src = fs.readFileSync(path.join(__dirname, '生成HTML档案.cjs'), 'utf8');
  const m = src.match(/const css = `([\s\S]*?)`;/);
  if (!m) throw new Error('未能从 Tools/生成HTML档案.cjs 读取样式常量 css');
  return m[1];
}
const CSS = loadCss();

// --- 与既有生成脚本完全一致的 markdown 链接改写（F:\Health\ 绝对路径 / .md→.html）---
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

// --- 渲染单个 md（相对仓库根的路径）到同名 .html（写入 OUT_ROOT，默认即仓库根）---
function render(rel) {
  const src = path.join(root, rel);
  const out = destOf(rel.replace(/\.md$/i, '.html'));
  SRC_DIR = path.dirname(src);
  const md = fs.readFileSync(src, 'utf8');
  const content = md.trim()
    ? marked.parse(md)
    : '<h1>' + path.basename(rel, '.md') + '</h1><p>原始文件为空，暂无记录。</p>';
  const home = path.relative(path.dirname(out), path.join(root, 'index.html')).replace(/\\/g, '/') || 'index.html';
  const title = path.basename(rel, '.md');
  const body = content
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 个人健康档案</title><style>${CSS}</style></head><body><header><span>PERSONAL HEALTH RECORD</span><a href="${home}">个人健康档案 / 首页</a></header><main>${body}</main><footer>本地健康档案 · 请根据实际情况更新记录</footer></body></html>`;
  if (!CHECK) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    try {
      fs.writeFileSync(out, html, 'utf8');
    } catch (e) {
      if (e.code === 'EPERM' || e.code === 'EACCES') {
        console.warn('[跳过] 无写权限：' + path.relative(root, out) + '（' + e.code + '）');
        return out;
      }
      throw e;
    }
  }
  return out;
}

// --- 遍历 docs 下的 .md，排除内部文档目录 / 文件 ---
// docs/tasks/ 为内部任务说明，docs/产品缺口分析.md 为内部产品分析，均不对外渲染。
const EXCLUDE_DIRS = ['docs/tasks'];
const EXCLUDE_FILES = ['docs/产品缺口分析.md'];
function collectMd(dirRel) {
  const dir = path.join(root, dirRel);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = dirRel ? dirRel + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.includes(rel)) continue;
      out.push(...collectMd(rel));
    } else if (e.name.toLowerCase().endsWith('.md')) {
      out.push(rel);
    }
  }
  return out;
}

// --- 遍历 private_data/ 下 .md（cases / record / weight-loss），排除 _meta/ ---
// 归档结构：private_data/cases/<科室>/<case>/*.md、private_data/record/<name>/*.md、
//           private_data/weight-loss/**/*.md。渲染为同名 .html 落在 md 同目录。
function collectPrivateMd(dirRel) {
  const dir = path.join(root, dirRel);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = dirRel ? dirRel + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (e.name === '_meta' || e.name === '.trash') continue;
      out.push(...collectPrivateMd(rel));
    } else if (e.name.toLowerCase().endsWith('.md')) {
      out.push(rel);
    }
  }
  return out;
}

// --- 运行一个现有生成脚本（只读 / 幂等），继承 stdio 以显示其输出 ---
function runTool(rel, extraArgs, extraEnv) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    console.log('[跳过] 找不到 ' + rel);
    return;
  }
  if (CHECK) {
    console.log('[check] 将运行 ' + rel + (extraArgs && extraArgs.length ? ' ' + extraArgs.join(' ') : ''));
    return;
  }
  console.log('\n=== 运行 ' + rel + (extraArgs && extraArgs.length ? ' ' + extraArgs.join(' ') : '') + ' ===');
  const r = spawnSync(process.execPath, [full, ...(extraArgs || [])], {
    stdio: 'inherit',
    cwd: root,
    env: Object.assign({}, process.env, extraEnv || {})
  });
  if (r.error) {
    console.error('[错误] 运行 ' + rel + ' 失败：' + r.error.message);
  } else if (r.status !== 0) {
    console.error('[警告] ' + rel + ' 退出码 ' + r.status + '（继续后续渲染）');
  }
}

function main() {
  console.log('构建 Markdown → HTML' + (CHECK ? '（检查模式，未写盘）' : '') + (OUT ? '（暂存输出到 ' + OUT + '/）' : ''));

  // 1) 从 DB 派生健康问题总表（仅当数据库存在；只读，绝不写 DB）
  const dbPath = path.join(root, 'data', 'health.db');
  if (fs.existsSync(dbPath)) {
    if (OUT) {
      const scqOut = destOf('docs/健康档案');
      try { fs.mkdirSync(scqOut, { recursive: true }); } catch (e) {}
      runTool('Tools/生成问题总表.cjs', [], { SCQ_OUT: scqOut });
    } else {
      runTool('Tools/生成问题总表.cjs');
    }
  } else {
    console.log('[跳过] 未找到 data/health.db，保留「健康问题总表.md」现有内容');
  }

  // 2) 主题档案：补齐五段结构 + 计算档案完整度（幂等；不加 --init 不改动已有非空文件）
  runTool('Tools/生成主题档案.cjs', OUT ? ['--out=' + OUT] : []);

  // 3) 全域渲染：README.md + docs 下全部 .md（排除内部文档）+ private_data 下全部 .md
  //    强制覆盖 .html（private_data 的 .html 已随旧目录删除，此处全部新建）
  const docsTargets = collectMd('docs').filter(rel => !EXCLUDE_FILES.includes(rel));
  const privateTargets = collectPrivateMd('private_data');
  const targets = ['README.md', ...docsTargets, ...privateTargets];
  console.log('\n=== 渲染 .html（共 ' + targets.length + ' 个，其中 private_data ' + privateTargets.length + ' 个）===');
  let wrote = 0;
  for (const rel of targets) {
    const out = render(rel);
    wrote++;
    if (CHECK) console.log('[check] ' + rel + ' -> ' + path.relative(root, out));
  }
  if (!CHECK) {
    console.log('\nprivate_data 渲染清单：');
    for (const rel of privateTargets) console.log('  ' + rel.replace(/\.md$/i, '.html'));
  }
  console.log('\n完成：处理 ' + wrote + ' 个 md' + (CHECK ? '（检查模式，未写盘）' : ' → 已重新生成 .html'));
}

main();
