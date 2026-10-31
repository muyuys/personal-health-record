/* 导入流程端到端验证：node Tools/e2e-import.js */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');

const shot = n => path.join(os.tmpdir(), `health-import-${n}.png`);
const URL = 'file:///F:/Health/index.html?offline=1';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1020 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  const labs = () => page.evaluate(() => JSON.parse(localStorage.getItem('personal-health-labs-v1') || '[]'));
  const check = (cond, label, extra) => console.log(`${cond ? '✓' : '✗'} ${label}${cond || !extra ? '' : '  ← ' + extra}`);

  await page.goto(URL);
  await page.waitForTimeout(200);
  check(await page.evaluate(() => typeof window.LabParse === 'object'), 'LabParse 已加载');

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(250);

  /* ---- 1. 粘贴文本 ---- */
  await page.locator('.storage-links [data-act="import"]').click();
  await page.waitForSelector('#impText');
  check(await page.locator('.import-modal').isVisible(), '导入弹层已打开');
  await page.click('[data-act="imp-sample"]');
  await page.fill('#impSource', '市一院体检中心');
  await page.click('[data-act="imp-parse"]');
  await page.waitForSelector('.imp-table');

  const rowCount = await page.locator('.imp-table tbody tr').count();
  const stat = (await page.textContent('.imp-stat')).replace(/\s+/g, ' ');
  check(rowCount === 8, '识别 8 条记录', `实际 ${rowCount}`);
  console.log('  统计：' + stat);
  const firstDate = await page.locator('.imp-table tbody tr').first().locator('input[type=date]').inputValue();
  check(firstDate === '2026-10-20', '日期取自正文而不是默认值', firstDate);
  const skipText = await page.textContent('.imp-skip summary');
  check(/跳过 1 行/.test(skipText), '只跳过表头一行', skipText);
  await page.screenshot({ path: shot('1-preview'), fullPage: false });

  /* 勾选交互 */
  const before = await page.textContent('#impPick');
  await page.locator('.imp-table tbody tr').first().locator('input[type=checkbox]').uncheck();
  const after = await page.textContent('#impPick');
  check(Number(before) === Number(after) + 1, '取消勾选后计数同步', `${before}→${after}`);
  await page.locator('.imp-table tbody tr').first().locator('input[type=checkbox]').check();

  /* 字段可编辑：改完再改回，避免影响后面的去重验证 */
  const row1 = page.locator('.imp-table tbody tr').first();
  await row1.locator('select').selectOption('其他');
  check(await row1.locator('select').inputValue() === '其他', '类别可编辑');
  await row1.locator('select').selectOption('血常规');
  await row1.locator('input[data-imp="name"]').fill('白细胞计数（改）');
  check(await row1.locator('input[data-imp="name"]').inputValue() === '白细胞计数（改）', '项目名可编辑');
  await row1.locator('input[data-imp="name"]').fill('白细胞计数');

  await page.click('[data-act="imp-commit"]');
  await page.waitForTimeout(350);

  const saved1 = await labs();
  check(saved1.length === 8, '写入 8 条到本机', `实际 ${saved1.length}`);
  check(saved1[0].name === '白细胞计数', '项目名按预览写入', saved1[0].name);
  const uric = saved1.find(r => r.name === '尿酸');
  check(uric && uric.value === 486 && uric.low === 208 && uric.high === 428, '尿酸数值与参考区间正确', JSON.stringify(uric));
  check(uric && uric.source === '市一院体检中心', '来源已写入', uric && uric.source);
  check(await page.evaluate(() => location.hash) === '#/labs', '写入后跳到检验页');

  /* ---- 2. 重复导入不翻倍 ---- */
  await page.locator('.storage-links [data-act="import"]').click();
  await page.waitForSelector('#impText');
  await page.click('[data-act="imp-sample"]');
  await page.click('[data-act="imp-parse"]');
  await page.waitForSelector('.imp-table');
  await page.click('[data-act="imp-commit"]');
  await page.waitForTimeout(300);
  const saved2 = await labs();
  check(saved2.length === 8, '重复导入不产生重复记录', `实际 ${saved2.length}`);

  /* ---- 3. CSV 文件 ---- */
  const csvPath = path.join(os.tmpdir(), 'health-labs-test.csv');
  fs.writeFileSync(csvPath, '\ufeff项目名称,结果,单位,参考范围,检查日期,类别\n肌酐,95,μmol/L,57-97,2026-06-11,肾功能\n"尿酸",512,μmol/L,"208-428",2026-06-11,\n血红蛋白,151,g/L,130-175,2026-06-11,\n', 'utf8');

  await page.locator('.storage-links [data-act="import"]').click();
  await page.waitForSelector('#impTabs');
  await page.click('[data-act="imp-tab"][data-k="csv"]');
  await page.waitForSelector('[data-act="imp-file-csv"]');
  await page.setInputFiles('#importFile', csvPath);
  await page.waitForSelector('.imp-table', { timeout: 4000 });
  const csvRows = await page.locator('.imp-table tbody tr').count();
  check(csvRows === 3, 'CSV 识别 3 条', `实际 ${csvRows}`);
  /* 改一行类别，验证「编辑 → 写入」链路 */
  await page.locator('.imp-table tbody tr').first().locator('select').selectOption('其他');
  await page.screenshot({ path: shot('2-csv') });
  await page.click('[data-act="imp-commit"]');
  await page.waitForTimeout(300);
  const saved3 = await labs();
  check(saved3.length === 11, 'CSV 写入后共 11 条', `实际 ${saved3.length}`);
  check(saved3.filter(r => r.date === '2026-06-11').length === 3, 'CSV 日期列生效');
  const cre = saved3.find(r => r.name === '肌酐' && r.date === '2026-06-11');
  check(cre && cre.category === '其他', '预览里改的类别写进了记录', cre && cre.category);

  /* ---- 4. 页面渲染 ---- */
  await page.waitForTimeout(200);
  await page.screenshot({ path: shot('3-labs'), fullPage: false });
  const bodyText = await page.textContent('#view');
  check(/尿酸/.test(bodyText), '检验页显示了导入的指标');

  /* ---- 5. 空内容与坏 JSON ---- */
  await page.locator('.storage-links [data-act="import"]').click();
  await page.waitForSelector('#impText');
  await page.click('[data-act="imp-parse"]');
  await page.waitForTimeout(150);
  check(await page.locator('.notice.err').isVisible(), '空内容有提示');
  await page.keyboard.press('Escape');

  const badJson = path.join(os.tmpdir(), 'bad.json');
  fs.writeFileSync(badJson, '{oops', 'utf8');
  await page.locator('.storage-links [data-act="import"]').click();
  await page.waitForSelector('#impTabs');
  await page.click('[data-act="imp-tab"][data-k="json"]');
  await page.setInputFiles('#importFile', badJson);
  await page.waitForTimeout(300);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('personal-health-labs-v1')).length) === 11, '坏 JSON 未破坏已有数据');

  /* ---- 6. 移动端 ---- */
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(URL);
  await m.waitForTimeout(300);
  await m.evaluate(() => localStorage.clear());
  await m.reload();
  await m.waitForTimeout(300);

  await m.evaluate(() => document.querySelector('[data-act="more"]').click());
  await m.waitForTimeout(200);
  await m.locator('.sheet-item[data-act="import"]').click();
  await m.waitForSelector('#impText');

  /* 故意给一条没有单位、一条没有参考范围的数据，检查「需确认」的表现 */
  await m.fill('#impText', '2026-09-05\n肌酐 92\n血红蛋白 148 g/L 130-175\n尿酸 486 μmol/L 208-428');
  await m.fill('#impSource', '复查');
  await m.click('[data-act="imp-parse"]');
  await m.waitForSelector('.imp-table');

  const need = (await m.textContent('.imp-stat .warn b')).trim();
  check(need === '1', '缺单位的行计入需确认', need);
  check(await m.locator('.imp-table tr.low').count() === 1, '低置信度行有左侧标记');
  check(!(await m.locator('.imp-table tbody tr.low input[type=checkbox]').isChecked()), '低置信度默认不勾选');
  const note = await m.textContent('.imp-note');
  check(/单位/.test(note), '问题原因写在项目名下方', note);
  await m.screenshot({ path: shot('4-mobile-import') });

  await m.click('[data-act="imp-commit"]');
  await m.waitForTimeout(300);
  const savedM = await m.evaluate(() => JSON.parse(localStorage.getItem('personal-health-labs-v1') || '[]'));
  check(savedM.length === 2, '未勾选的低置信度行没有写入', `实际 ${savedM.length}`);

  console.log('\n控制台错误：' + (errors.length ? errors.join(' | ') : '无'));
  console.log('截图：' + [shot('1-preview'), shot('2-csv'), shot('3-labs'), shot('4-mobile-import')].join('\n      '));
  await browser.close();
})();
