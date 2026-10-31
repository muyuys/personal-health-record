const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(os.tmpdir(), 'health-e2e-report') + path.sep;
// 隐私原则：e2e 不读个人报告原件与转写稿，测试图与文本在临时目录合成。
const IMG = path.join(OUT, 'sample-report.jpg');
const TXT = `2026-09-04
项目\t结果\t单位\t参考区间
肌酐\t92\tμmol/L\t57--97
尿酸\t380\tμmol/L\t208--428`;

let pass = 0, fail = 0;
const check = (c, label, extra) => {
  if (c) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  ← ' + extra : '')); }
};

(async () => {
  fs.mkdirSync(path.dirname(IMG), { recursive: true });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');
  fs.writeFileSync(IMG, png);
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  const PAGE_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?offline=1#/labs';
  await page.goto(PAGE_URL);
  await page.waitForTimeout(500);

  /* 1. 空状态 */
  check((await page.textContent('body')).includes('还没有报告原件'), '报告原件卡显示空状态');

  /* 2. 添加报告 + 上传图片 */
  await page.click('[data-act="newreport"]');
  await page.waitForTimeout(300);
  await page.fill('#rpForm [name="date"]', '2026-09-04');
  await page.fill('#rpForm [name="title"]', '肝肾常规（含胱抑素C）');
  await page.fill('#rpForm [name="panel"]', '生化');
  await page.fill('#rpForm [name="specimen"]', '血清');
  await page.fill('#rpForm [name="hospital"]', '北京同仁医院');
  await page.fill('#rpForm [name="note"]', '肾内科门诊，空腹');
  await page.setInputFiles('#rpFile', IMG);
  await page.waitForTimeout(1200);
  const imgOk = await page.locator('.rp-shot img').count();
  check(imgOk === 1, '选择图片后出现预览', `img=${imgOk}`);
  const dataLen = await page.evaluate(() => {
    const s = localStorage.getItem('personal-health-reports-v1') || '';
    return s.length;
  });
  await page.screenshot({ path: OUT + 'rp-form.png' });

  await page.click('#rpForm button[type="submit"]');
  await page.waitForTimeout(600);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('personal-health-reports-v1') || '[]'));
  check(saved.length === 1, '报告写入本机', `实际 ${saved.length}`);
  check(/^data:image\/(jpeg|png)/.test(saved[0].file), '原件以图片形式存下', (saved[0].file || '').slice(0, 24));
  check(saved[0].file.length < 900000, '图片已压缩', `dataURL 长度 ${saved[0].file.length}`);
  check(saved[0].panel === '生化' && saved[0].specimen === '血清', '组套与样本类型存下', `${saved[0].panel} / ${saved[0].specimen}`);
  check((await page.locator('.report-item').count()) === 1, '报告卡片出现 1 条');
  const tagText = await page.locator('.report-item .rp-title').first().textContent();
  check(/生化/.test(tagText) && /血清/.test(tagText), '报告卡显示组套与样本标签', tagText.replace(/\s+/g, ' ').trim());
  await page.screenshot({ path: OUT + 'rp-card.png' });

  /* 3. 查看原件 */
  await page.locator('.report-item [data-act="viewreport"]').first().click();
  await page.waitForTimeout(400);
  check((await page.locator('.rp-view img').count()) === 1, '查看弹层显示原件');
  await page.screenshot({ path: OUT + 'rp-view.png' });
  await page.click('.modal-head [data-act="close"]');
  await page.waitForTimeout(300);

  /* 4. 导入并归到这份报告 */
  await page.click('.page-actions [data-act="import"]');
  await page.waitForTimeout(300);
  await page.fill('#impText', TXT);
  await page.click('[data-act="imp-parse"]');
  await page.waitForTimeout(500);
  const rows = await page.locator('.imp-table tbody tr').count();
  check(rows === 18, '预览 18 行', `实际 ${rows}`);
  check((await page.locator('.imp-table th').count()) === 8, '表格 8 列（含提示列）');
  const flagText = await page.locator('.imp-table tbody tr').nth(2).locator('td.flag').textContent();
  check(flagText.trim() === '↑', '肌酐行的提示列为 ↑', flagText);
  const numCell = (await page.locator('.imp-table tbody tr').nth(2).locator('td.num').textContent()).trim();
  check(numCell === '112', '结果列只有数值，没有箭头', numCell);

  const opts = await page.locator('#impReport option').allTextContents();
  check(opts.length >= 2, '预览页有「归到」下拉', opts.join(' | '));
  await page.selectOption('#impReport', { index: 1 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + 'rp-import.png' });

  // 全选后写入
  const boxes = page.locator('.imp-table tbody tr input[data-imp-check]');
  const bn = await boxes.count();
  for (let i = 0; i < bn; i++) if (!(await boxes.nth(i).isChecked())) await boxes.nth(i).check();
  await page.click('[data-act="imp-commit"]');
  await page.waitForTimeout(600);

  const labs = await page.evaluate(() => JSON.parse(localStorage.getItem('personal-health-labs-v1') || '[]'));
  const rid = saved[0].id;
  check(labs.length === 18, '写入 18 条结果', `实际 ${labs.length}`);
  check(labs.every(r => r.reportId === rid), '每条结果都指向该报告', labs.filter(r => r.reportId !== rid).length + ' 条未关联');

  /* 5. 表格里点报告名看原件 */
  const link = page.locator('table.data .rp-link').first();
  check((await link.count()) === 1, '最近录入表出现报告链接');
  await link.click();
  await page.waitForTimeout(400);
  check((await page.locator('.rp-view img').count()) === 1, '点报告名可打开原件');
  await page.click('.modal-head [data-act="close"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + 'rp-labs.png', fullPage: true });

  /* 5.5 备份往返（v2 要带上报告原件） */
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => document.querySelector('[data-act="export"]').click())
  ]);
  const bp = await dl.path();
  const backup = JSON.parse(fs.readFileSync(bp, 'utf8'));
  check(backup.version === 2, '备份版本升到 v2');
  check(Array.isArray(backup.reports) && backup.reports.length === 1, '备份含报告');
  check(!!(backup.reports[0] && backup.reports[0].file), '备份含原件图片');
  check(backup.labs.length === 18, '备份含 18 条结果');
  check(backup.labs.every(r => r.reportId === rid), '备份保留报告关联');

  /* 5.6 备份里的记录换了 id 再导入一次，也不该翻倍（按 日期|类别|项目|单位 合并） */
  const dup = JSON.parse(JSON.stringify(backup));
  dup.labs = dup.labs.map(r => ({ ...r, id: 'dup-' + r.id }));
  const dupPath = OUT + 'dup-pack.json';
  fs.writeFileSync(dupPath, JSON.stringify(dup), 'utf8');
  await page.click('.page-actions [data-act="import"]');
  await page.waitForTimeout(250);
  await page.click('#impTabs [data-k="json"]');
  await page.setInputFiles('#importFile', dupPath);
  await page.waitForTimeout(900);
  const labsDup = await page.evaluate(() => JSON.parse(localStorage.getItem('personal-health-labs-v1') || '[]'));
  check(labsDup.length === 18, '同项目再导入一次不翻倍', labsDup.length + ' 条');

  /* 5.7 老数据没有组套/样本字段：再导一次同一份备份应补齐，而不是多出一份 */
  await page.evaluate((oldId) => {
    const rp = JSON.parse(localStorage.getItem('personal-health-reports-v1') || '[]');
    const labs = JSON.parse(localStorage.getItem('personal-health-labs-v1') || '[]');
    const nid = 'old-' + oldId;
    rp.forEach(r => {
      if (r.id !== oldId) return;
      r.id = nid; delete r.panel; delete r.specimen; delete r.file;
    });
    labs.forEach(l => { if (l.reportId === oldId) l.reportId = nid; });
    localStorage.setItem('personal-health-reports-v1', JSON.stringify(rp));
    localStorage.setItem('personal-health-labs-v1', JSON.stringify(labs));
  }, rid);
  await page.reload();
  await page.waitForTimeout(600);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('personal-health-reports-v1') || '[]'));
  check(before.length === 1 && !before[0].panel, '模拟出旧版报告（无组套/样本）', `${before.length} 份`);

  const fillPath = OUT + 'fill-fields.json';
  fs.writeFileSync(fillPath, JSON.stringify(backup), 'utf8');
  await page.click('.page-actions [data-act="import"]');
  await page.waitForTimeout(250);
  await page.click('#impTabs [data-k="json"]');
  await page.setInputFiles('#importFile', fillPath);
  await page.waitForTimeout(900);
  const repsFill = await page.evaluate(() => JSON.parse(localStorage.getItem('personal-health-reports-v1') || '[]'));
  const labsFill = await page.evaluate(() => JSON.parse(localStorage.getItem('personal-health-labs-v1') || '[]'));
  check(repsFill.length === 1, '同日期同名称的报告没有多出一份', repsFill.length + ' 份');
  check(repsFill[0].panel === '生化' && repsFill[0].specimen === '血清', '补齐了组套与样本类型', `${repsFill[0].panel} / ${repsFill[0].specimen}`);
  check(!!repsFill[0].file, '补回了原件图片');
  const idsFill = new Set(repsFill.map(r => r.id));
  check(labsFill.every(l => !l.reportId || idsFill.has(l.reportId)), '结果都指向存在的报告',
    labsFill.filter(l => l.reportId && !idsFill.has(l.reportId)).length + ' 条悬空');

  /* 6. 删除报告：结果保留 */
  page.once('dialog', d => d.accept());
  await page.locator('.report-item [data-act="delreport"]').first().click();
  await page.waitForTimeout(500);
  const labs2 = await page.evaluate(() => JSON.parse(localStorage.getItem('personal-health-labs-v1') || '[]'));
  const reps2 = await page.evaluate(() => JSON.parse(localStorage.getItem('personal-health-reports-v1') || '[]'));
  check(reps2.length === 0, '报告已删除');
  check(labs2.length === 18, '结果保留 18 条');
  check(labs2.every(r => !r.reportId), '关联已解除');

  console.log('\n控制台错误：', errs.length ? errs : '无');
  console.log(`${fail === 0 ? '全部通过' : '有失败'}：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
