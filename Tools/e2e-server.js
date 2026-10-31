/* 服务模式端到端：页面 + SQLite + 图片文件，跑在一个独立端口与独立库上，
 * 不碰 data/health.db。
 *
 * 用法：NODE_PATH=... node Tools/e2e-server.js
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const PY = path.join(ROOT, 'server', '.venv', 'Scripts', 'python.exe');
const TMP = 'C:/Users/muyuys/AppData/Local/Temp/health-e2e';
const DB = path.join(TMP, 'test.db');
const PACK = path.join(ROOT, 'data', '报告原件录入包.json');

let pass = 0, fail = 0;
const check = (c, label, extra) => {
  if (c) { pass++; console.log('  ✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  ← ' + extra : '')); }
};

const alive = () => new Promise(res => {
  const req = http.get(BASE + '/ping', { timeout: 800 }, r => { r.resume(); res(true); });
  req.on('error', () => res(false));
  req.on('timeout', () => { req.destroy(); res(false); });
});

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  for (const f of [DB, DB + '-wal', DB + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
  const flexDir = path.join(TMP, 'test_files');
  if (fs.existsSync(flexDir)) fs.rmSync(flexDir, { recursive: true, force: true });

  let proc = null;
  if (!(await alive())) {
    proc = spawn(PY, ['health_server.py', '-p', String(PORT), '-d', DB], {
      cwd: path.join(ROOT, 'server'), stdio: 'ignore'
    });
    for (let i = 0; i < 40; i++) {
      if (await alive()) break;
      await new Promise(r => setTimeout(r, 300));
    }
  }
  if (!(await alive())) { console.error('起不来服务，检查 server/.venv'); process.exit(1); }

  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  const api = (p) => page.evaluate(u => fetch(u).then(r => r.json()), p);
  const use = async (v) => { await page.goto(`${BASE}/index.html#/${v}`); await page.waitForTimeout(700); };

  await use('labs');

  /* 1. 服务模式识别 */
  const rail = await page.textContent('#storeLabel');
  check(/本机库/.test(rail), '侧栏显示数据已入本机库', rail);

  /* 2. 导入录入包 → 落库 */
  await page.click('.page-actions [data-act="import"]');
  await page.waitForTimeout(300);
  await page.click('#impTabs [data-k="json"]');
  await page.setInputFiles('#importFile', PACK);
  await page.waitForTimeout(2200);

  const all = await api('/api/all');
  check(all.labs.length === 45, '45 条写进 SQLite', all.labs.length + ' 条');
  check(all.reports.length === 5, '5 份报告写进 SQLite', all.reports.length + ' 份');
  check(all.reports.every(r => /^\/files\/.+\.(jpg|png|webp)$/.test(r.file)), '图片存成文件', all.reports[0] && all.reports[0].file);
  check(all.reports.some(r => r.panel === '生化' && r.specimen === '血清'), '组套与样本类型入库');
  const files = fs.existsSync(path.join(TMP, 'test_files')) ? fs.readdirSync(path.join(TMP, 'test_files')) : [];
  check(files.length === 5, '磁盘上有 5 个图片文件', files.length + ' 个');

  /* 3. 刷新后仍从库里出来 */
  await use('labs');
  const shots = await page.evaluate(() => [...document.querySelectorAll('.rp-thumb img')].map(i => i.naturalWidth));
  check(shots.length === 5 && shots.every(w => w > 0), '缩略图从 /files/ 正常加载', shots.join(','));

  /* 4. 新增一条结果 → 库里有 */
  await page.click('[data-act="newlab"]');
  await page.waitForTimeout(400);
  await page.fill('#labForm [name="date"]', '2026-10-30');
  await page.selectOption('#labForm [name="category"]', '肾功能');
  await page.fill('#labForm [name="name"]', '试写指标');
  await page.fill('#labForm [name="value"]', '12.3');
  await page.fill('#labForm [name="unit"]', 'mg/L');
  await page.fill('#labForm [name="low"]', '1');
  await page.fill('#labForm [name="high"]', '10');
  await page.click('#labForm button[type="submit"]');
  await page.waitForTimeout(1200);
  const afterAdd = await api('/api/all');
  const added = afterAdd.labs.find(r => r.name === '试写指标');
  check(!!added && added.value === 12.3, '新记录落库', added ? `${added.value} ${added.unit}` : '没找到');

  /* 5. 导出备份含图片 */
  const exp = await api('/api/export');
  check(exp.reports.length === 5 && exp.reports.every(r => r.file.startsWith('data:image')), '导出备份含 base64 图片');
  check(exp.labs.length === 46, '导出备份含全部结果', exp.labs.length + ' 条');

  /* 6. 删掉那条，库里也跟着少 */
  page.once('dialog', d => d.accept());
  const del = page.locator('table.data tbody tr', { hasText: '试写指标' }).locator('[data-act="dellab"]');
  await del.click();
  await page.waitForTimeout(1000);
  const afterDel = await api('/api/all');
  check(afterDel.labs.length === 45, '删除也落库', afterDel.labs.length + ' 条');

  /* 7. 全部记录页：45 条都能找到，改完留在本页 */
  await use('labs-all');
  const allRows = await page.locator('.laball-table tbody tr:not(.laball-day)').count();
  check(allRows === 45, '全部记录页列出 45 条（不被“最近 8 条”截断）', allRows + ' 条');
  const groups = await page.locator('.laball-day').count();
  check(groups === 4, '按 4 个检查日期分组', groups + ' 组');
  await page.fill('#labAllQ', '肌酐');
  await page.waitForTimeout(300);
  const hit = await page.locator('.laball-table tbody tr:not(.laball-day)').count();
  check(hit > 0 && hit < 45, '关键词筛选生效', hit + ' 条');
  await page.fill('#labAllQ', '');
  await page.waitForTimeout(300);
  await page.locator('.laball-table tbody tr:not(.laball-day)').first().locator('[data-act="editlab"]').click();
  await page.waitForTimeout(400);
  await page.fill('#labForm [name="note"]', '核对过');
  await page.click('#labForm button[type="submit"]');
  await page.waitForTimeout(1000);
  check(page.url().endsWith('#/labs-all'), '改完留在全部记录页', page.url());
  const noted = (await api('/api/all')).labs.filter(r => r.note === '核对过');
  check(noted.length === 1, '修改已落库', noted.length + ' 条');

  /* 8. 围度：记录 → 落库 → 出图 */
  await use('weight');
  await page.click('[data-act="body-add"]');
  await page.waitForTimeout(400);
  await page.fill('#bForm [name="date"]', '2026-10-29');
  await page.fill('#bForm [name="chest"]', '104.2');
  await page.fill('#bForm [name="waist"]', '100.5');
  await page.fill('#bForm [name="hip"]', '107.1');
  await page.click('#bForm button[type="submit"]');
  await page.waitForTimeout(1200);
  const b1 = await api('/api/all');
  const rec1 = b1.body.find(x => x.date === '2026-10-29');
  check(!!rec1 && rec1.chest === 104.2 && rec1.waist === 100.5 && rec1.hip === 107.1, '围度写进 SQLite',
    rec1 ? `胸${rec1.chest} 腰${rec1.waist} 臀${rec1.hip}` : '没找到');
  check(await page.isVisible('#bodyChart svg'), '围度趋势图已绘制');

  /* 8. 同一天再记：补进那一组，不多出一条 */
  await use('weight');
  await page.click('[data-act="body-add"]');
  await page.waitForTimeout(400);
  await page.fill('#bForm [name="date"]', '2026-10-29');
  await page.fill('#bForm [name="waist"]', '100');
  await page.click('#bForm button[type="submit"]');
  await page.waitForTimeout(1200);
  const b2 = await api('/api/all');
  const same = b2.body.filter(x => x.date === '2026-10-29');
  check(same.length === 1, '同日再记不新增记录', `${same.length} 条`);
  check(same.length === 1 && same[0].waist === 100 && same[0].chest === 104.2, '同日合并只改填了的那项',
    same[0] ? `腰${same[0].waist} 胸${same[0].chest}` : '没找到');

  /* 9. 导出备份带上围度 */
  const exp2 = await api('/api/export');
  check(Array.isArray(exp2.body) && exp2.body.length === 1, '导出备份含围度', (exp2.body || []).length + ' 条');

  console.log('\n控制台错误：', errs.length ? errs.slice(0, 3).join(' | ') : '无');
  console.log(`${fail === 0 ? '全部通过' : '有失败'}：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  if (proc) proc.kill();
  process.exit(fail ? 1 : 0);
})();
