// 将现有 Markdown 转成首次使用的 HTML；已有 HTML 不覆盖，后续直接维护 HTML。
const fs = require('fs'), path = require('path');
const { marked } = require('C:/Users/muyuys/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/marked');
const root = path.resolve(__dirname, '..');
const files = ['README.md', 'docs/使用指南.md', 'docs/HANDOFF.md'];
for (const d of ['docs/健康档案','docs/减重记录','docs/主题/眼睛','docs/主题/鼻子','docs/主题/肾功能','docs/主题/脱发','docs/主题/右脚踝/longitudinal_analysis','docs/主题/右脚踝/ct_analysis']) {
  function collect(dir) { for (const e of fs.readdirSync(dir,{withFileTypes:true})) { const p=path.join(dir,e.name); if(e.isDirectory()) collect(p); else if(e.name.endsWith('.md')) files.push(path.relative(root,p)); } }
  collect(path.join(root,d));
}
// index.html 是档案应用（assets/），不再由 README 生成；README 单独输出为说明页。
const target = p => p === 'README.md' ? 'README.html' : p.replace(/\.md$/i,'.html');
const css = `:root{color-scheme:light;--ink:#203831;--muted:#63746e;--accent:#276c59;--line:#dce7df}*{box-sizing:border-box}body{margin:0;background:#f3f7f2;color:var(--ink);font:16px/1.75 system-ui,'Microsoft YaHei',sans-serif}header{background:#163f34;color:#fff;padding:22px max(5vw,24px)}header a{color:#d8f1e5;text-decoration:none;font-weight:600}header span{display:block;font-size:12px;letter-spacing:.16em;color:#aed3c1}main{max-width:1050px;margin:32px auto;padding:36px 48px;background:white;border:1px solid var(--line);border-radius:16px;box-shadow:0 12px 35px #194f3010}h1{font-size:2em;line-height:1.3;margin:0 0 14px}h2{border-top:1px solid var(--line);padding-top:24px;margin-top:32px;font-size:1.4em}h3{margin-top:24px}a{color:var(--accent);overflow-wrap:anywhere}p,li{overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:.93em}th,td{text-align:left;padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:top}th{background:#edf5ef} .table-wrap{overflow-x:auto}blockquote{margin:20px 0;padding:1px 18px;border-left:4px solid #91bda7;background:#f1f7f2;color:#415c4e}img{max-width:100%;height:auto}footer{max-width:1050px;margin:auto;padding:0 24px 32px;color:var(--muted);font-size:.85em}@media(max-width:600px){main{margin:12px;padding:24px 20px;border-radius:10px}header{padding:16px 20px}h1{font-size:1.65em}}@media print{body{background:white}main{box-shadow:none;border:0;margin:0;padding:0}header{background:white;color:black}header a{color:black}}`;
for (const rel of files) {
  const src=path.join(root,rel), out=path.join(root,target(rel));
  if (fs.existsSync(out)) { console.log('保留已有:', target(rel)); continue; }
  let md=fs.readFileSync(src,'utf8');
  marked.use({walkTokens(t){if ((t.type==='link'||t.type==='image') && t.href) { let h=t.href.replace(/^F:\/Health\//i, path.relative(path.dirname(src),root).replace(/\\/g,'/')+'/'); if (/\.md(?:#.*)?$/i.test(h)) h=h.replace(/\.md(?=#|$)/i,'.html'); t.href=h; }}});
  const content=md.trim()?marked.parse(md):'<h1>'+path.basename(rel,'.md')+'</h1><p>原始文件为空，暂无记录。</p>';
  const home=path.relative(path.dirname(out),path.join(root,'index.html')).replace(/\\/g,'/')||'index.html';
  const title=path.basename(rel,'.md');
  const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 个人健康档案</title><style>${css}</style></head><body><header><span>PERSONAL HEALTH RECORD</span><a href="${home}">个人健康档案 / 首页</a></header><main>${content.replace(/<table>/g,'<div class="table-wrap"><table>').replace(/<\/table>/g,'</table></div>')}</main><footer>本地健康档案 · 请根据实际情况更新记录</footer></body></html>`;
  fs.writeFileSync(out,html,'utf8'); console.log('生成:',target(rel));
}
