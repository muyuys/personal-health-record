/* 把「转写稿 + 报告照片」打包成可直接导入的 v2 备份。
 *
 * 用法：NODE_PATH=... node Tools/生成录入包.cjs
 *
 * 为什么需要它：助手写不进用户浏览器的 localStorage，只能交付一个可导入文件。
 * 图片压缩直接调用页面里的 shrinkImage()，保证和手动录入的结果一致。
 *
 * 新增报告：在 META 里加一行（txt 是转写稿，img 是 data/报告原件/ 里的照片）。
 * panel / specimen 写报告上明写的组套与大类；没写就留空，不猜。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

require(path.join(__dirname, '../assets/parse.js'));
const LP = globalThis.LabParse;

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'private_data/record/labs');
const IMG = path.join(ROOT, 'data/报告原件');
const OUT = path.join(ROOT, 'data/报告原件录入包.json');

/* 一份报告一行：txt 转写稿 / img 照片 / 报告名称 / 组套 / 样本 / 医院
 * 为避免把个人就诊信息(日期/医院/化验类型)写入版本库，META 清单改为运行时
 * 读取本地不入库的清单文件 data/报告原件录入包清单.json（格式：[{txt,img,date,title,panel,specimen,hospital}]）。
 * 本地无该文件时视为空清单。 */
let META = [];
try {
  META = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/报告原件录入包清单.json'), 'utf8'));
} catch (e) {
  META = [];
}

(async () => {
  const missing = META.filter(m => !fs.existsSync(path.join(DOCS, m.txt)) || !fs.existsSync(path.join(IMG, m.img)));
  if (missing.length) {
    missing.forEach(m => console.error('缺文件：' + m.txt + ' / ' + m.img));
    process.exit(1);
  }

  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage();
  await p.goto('file:///' + ROOT.replace(/\\/g, '/') + '/index.html');
  await p.waitForTimeout(300);

  const reports = [], labs = [];
  for (const m of META) {
    const raw = fs.readFileSync(path.join(DOCS, m.txt), 'utf8');
    const r = LP.text(raw, { date: '' });
    if (!r.rows.length) { console.error('解析不出结果：' + m.txt); process.exit(1); }
    const rid = crypto.randomUUID();
    const b64 = fs.readFileSync(path.join(IMG, m.img)).toString('base64');
    const file = await p.evaluate(async (s) => {
      const bin = atob(s); const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return await shrinkImage(new File([u8], 'a.jpg', { type: 'image/jpeg' }));
    }, b64);
    reports.push({ id: rid, date: m.date, title: m.title, panel: m.panel, specimen: m.specimen, hospital: m.hospital, note: '', file, createdAt: Date.now() });
    for (const row of r.rows) {
      labs.push({
        id: crypto.randomUUID(),
        date: row.date, category: row.category, name: row.name,
        value: row.value,
        unit: String(row.unit || '').trim() || '—',
        low: row.low, high: row.high,
        source: '', note: row.cmp ? `报告记为 ${row.cmp}${row.value}` : '',
        reportId: rid
      });
    }
    console.log(`${m.date}  ${m.title}   ${r.rows.length} 条   ${(file.length / 1024).toFixed(0)}KB  ${m.panel} / ${m.specimen}`);
  }
  await b.close();

  const pack = { format: 'health-archive', version: 2, exportedAt: new Date().toISOString(), labs, weights: [], done: {}, reports };
  fs.writeFileSync(OUT, JSON.stringify(pack, null, 2), 'utf8');
  console.log(`\n合计 ${labs.length} 条结果 / ${reports.length} 份报告`);
  console.log(`包体 ${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB → ${OUT}`);
})();
