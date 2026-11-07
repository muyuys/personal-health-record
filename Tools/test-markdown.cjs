/* Markdown 渲染回归测试：node Tools/test-markdown.cjs
   markdown.js 依赖 window，这里补一个最小壳再 require。 */
const path = require('path');
globalThis.window = globalThis;
require(path.join(__dirname, '..', 'assets', 'markdown.js'));
const MD = globalThis.MD;

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.log('  ✗ ' + label + (extra ? '\n     ' + extra : ''));
}
function has(html, needle, label) { ok(html.includes(needle), label, '实际：' + html); }
function not(html, needle, label) { ok(!html.includes(needle), label, '实际：' + html); }

/* ---------- 空输入 ---------- */
ok(MD.render('') === '', 'M1 空字符串返回空');
ok(MD.render(null) === '', 'M2 null 返回空');
ok(MD.render('   \n\n ') === '', 'M3 纯空白返回空');

/* ---------- 标题层级：回答嵌在页面里，h1/h2 一律降为 h3 ---------- */
has(MD.render('# 一级'), '<h3>一级</h3>', 'M4 # 降为 h3');
has(MD.render('## 一、检验数据（labs）'), '<h3>一、检验数据（labs）</h3>', 'M5 ## 降为 h3');
has(MD.render('### 三级'), '<h4>三级</h4>', 'M6 ### 变 h4');
has(MD.render('#### 四级'), '<h5>四级</h5>', 'M7 #### 变 h5');
not(MD.render('# 一级'), '<h1>', 'M8 不产出 h1');

/* ---------- 行内 ---------- */
has(MD.render('**粗**'), '<strong>粗</strong>', 'M9 加粗');
has(MD.render('这是 *轻度偏高*，'), '<em>轻度偏高</em>', 'M10 中文标点后的斜体');
has(MD.render('`a*b`'), '<code>a*b</code>', 'M11 行内代码里的星号不解析');
has(MD.render('[来源](#/labs-all)'), '<a href="#/labs-all"', 'M12 站内锚点链接');
not(MD.render('[坏](javascript:alert(1))'), 'href="javascript', 'M13 拒绝 javascript: 链接');
has(MD.render('[坏](javascript:alert(1))'), '[坏](javascript:alert(1))', 'M14 非法链接保留原文不变成 a');

/* ---------- 列表 ---------- */
const ul = MD.render('- 甲\n- 乙');
has(ul, '<ul><li>甲</li><li>乙</li></ul>', 'M15 无序列表');
const ol = MD.render('1. 甲\n2. 乙');
has(ol, '<ol><li>甲</li><li>乙</li></ol>', 'M16 有序列表');
const nested = MD.render('- 甲\n  - 甲一\n- 乙');
has(nested, '<li>甲<ul><li>甲一</li></ul></li>', 'M17 二级列表嵌在上一项内');
const mixed = MD.render('- 甲\n1. 乙');
has(mixed, '</ul><ol>', 'M18 无序转有序切成两个列表');

/* ---------- 表格 / 引用 / 分隔线 / 代码块 ---------- */
const table = MD.render('| 项目 | 结果 |\n| --- | --- |\n| 肌酐 | 112.0 |');
has(table, '<th>项目</th>', 'M19 表头');
has(table, '<td>112.0</td>', 'M20 单元格');
has(MD.render('> 空白代表未记录'), '<blockquote><p>空白代表未记录</p></blockquote>', 'M21 引用');
has(MD.render('---'), '<hr>', 'M22 分隔线');
has(MD.render('```\nconst a = 1 < 2;\n```'), '<pre class="md-pre"><code>const a = 1 &lt; 2;</code></pre>', 'M23 代码块转义');

/* ---------- 段落拼接：中文软换行不加空格，英文之间保留一个空格 ---------- */
const cn = MD.render('检索结果是截取的记录\n不能代表全部历史');
has(cn, '<p>检索结果是截取的记录不能代表全部历史</p>', 'M24 中文拼行不加空格');
const en = MD.render('first line\nsecond line');
has(en, '<p>first line second line</p>', 'M25 英文拼行保留空格');

/* ---------- 安全：HTML 一律转义 ---------- */
not(MD.render('<script>alert(1)</script>'), '<script>', 'M26 不直通 HTML');
has(MD.render('a < b'), 'a &lt; b', 'M27 尖括号转义');

/* ---------- 真实模型输出的常见形状 ---------- */
const real = MD.render('根据你当前提供的档案：\n\n## 一、检验数据（labs）\n\n**2026-10-30 心肌标志物**\n- 高敏肌钙蛋白I：2.3 ng/L（参考 0–17.5）[S1]\n\n需要我展开某一部分吗？');
has(real, '<h3>一、检验数据（labs）</h3>', 'M28 真实回答的二级标题');
has(real, '<strong>2026-10-30 心肌标志物</strong>', 'M29 真实回答的加粗小标题');
has(real, '<li>高敏肌钙蛋白I：2.3 ng/L（参考 0–17.5）[S1]</li>', 'M30 引用标记原样保留');

console.log(`\n${fail === 0 ? '全部通过' : '有失败'}：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
