/* 图片识别链路 e2e：file:// 页面 → 本机 127.0.0.1:8765 → 文字 → 解析预览
   前提：先启动 server/启动识别服务.bat（或 .venv\Scripts\python.exe server/ocr_server.py）
   运行：NODE_PATH=C:/Users/muyuys/.workbuddy/binaries/node/workspace/node_modules node Tools/e2e-ocr.js */
const { chromium } = require('playwright');
const OUT = 'C:/Users/muyuys/AppData/Local/Temp/';
const IMG = 'F:/Health/data/报告原件/2026-09-04-同仁医院-肝肾常规.jpg';

let pass = 0, fail = 0;
const check = (c, label, extra) => {
  if (c) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  ← ' + extra : '')); }
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto('file:///F:/Health/index.html?offline=1#/labs');
  await page.waitForTimeout(400);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(500);

  /* 1. 打开导入 → 图片识别 tab */
  await page.click('.page-actions [data-act="import"]');
  await page.waitForTimeout(300);
  const tabs = await page.locator('#impTabs button').allTextContents();
  check(tabs.length === 4 && tabs[1] === '图片识别', '导入弹层有 4 个 tab，第二个是图片识别', tabs.join(' | '));

  await page.click('#impTabs [data-k="image"]');
  await page.waitForTimeout(800);
  const st = (await page.textContent('#ocrState') || '').replace(/\s+/g, ' ').trim();
  check(/已就绪|正在加载/.test(st), '服务状态探测成功（说明 file:// 能访问本机服务）', st);
  await page.screenshot({ path: OUT + 'ocr-tab.png' });

  if (/没在运行/.test(st)) {
    console.log('\n  识别服务没启动，后面的用例跳过。先双击 server/启动识别服务.bat');
    console.log(`${pass} 通过 / ${fail} 失败`);
    await browser.close();
    process.exit(1);
  }

  /* 2. 选图识别 */
  await page.setInputFiles('#importFile', IMG);
  await page.waitForTimeout(9000);

  const ta = page.locator('#impText');
  check((await ta.count()) === 1, '识别后出现可编辑的文字框');
  const text = await ta.inputValue();
  const lines = text.split('\n').filter(Boolean);
  check(lines.length >= 15, '识别出行数合理', `实际 ${lines.length} 行`);
  check(text.includes('尿酸'), '识别结果含「尿酸」');
  check(/肌酐/.test(text), '识别结果含「肌酐」');
  check(/\t/.test(text), '同一行的多个单元格用制表符拼在一起');
  check(/3\.9-{1,2}6\.1/.test(text), '参考区间原样保留（3.9--6.1）');
  check((await page.locator('#ocrState').textContent()).includes('已就绪'), '识别完成后状态条回到已就绪');
  await page.screenshot({ path: OUT + 'ocr-text.png' });

  /* 3. 识别结果直接解析 */
  await page.click('[data-act="imp-parse"]');
  await page.waitForTimeout(600);
  const rows = await page.locator('.imp-table tbody tr').count();
  check(rows >= 15, '解析出 15 行以上结果', `实际 ${rows}`);
  const names = await page.locator('.imp-table tbody input[data-imp="name"]').evaluateAll(
    els => els.map(e => e.value)
  );
  check(names.some(n => /尿酸/.test(n)), '项目名里认出了尿酸', names.slice(0, 4).join(' / '));
  check(names.every(n => !/^\d+\s/.test(n)), '项目名里的行首序号已剥掉');
  const firstNum = (await page.locator('.imp-table tbody tr').nth(0).locator('td.num').textContent()).trim();
  check(/^[\d.]+$/.test(firstNum), '结果列是纯数值', firstNum);
  await page.screenshot({ path: OUT + 'ocr-preview.png' });

  /* 4. 归到一份新建的报告：照片应自动存成原件 */
  await page.selectOption('#impReport', '__new');
  await page.waitForTimeout(250);
  await page.fill('#impNewTitle', '肝肾常规（含胱抑素C）');
  await page.fill('#impNewHospital', '北京同仁医院');
  const hint = await page.textContent('.imp-report-bar .hint');
  check(/刚才的照片/.test(hint), '提示新建报告会带上照片', hint);

  const boxes = page.locator('.imp-table tbody tr input[data-imp-check]');
  const bn = await boxes.count();
  for (let i = 0; i < bn; i++) if (!(await boxes.nth(i).isChecked())) await boxes.nth(i).check();
  await page.click('[data-act="imp-commit"]');
  await page.waitForTimeout(1500);
  const labs = await page.evaluate(() => JSON.parse(localStorage.getItem('personal-health-labs-v1') || '[]'));
  const reps = await page.evaluate(() => JSON.parse(localStorage.getItem('personal-health-reports-v1') || '[]'));
  check(labs.length > 0, '识别结果写入本机存储', `${labs.length} 条`);
  const dated = labs.filter(r => r.date === '2026-09-04').length;
  check(dated === labs.length, '日期取自报告正文（2026-09-04）', `${dated}/${labs.length}`);
  check(reps.length === 1, '新建了 1 份报告', `实际 ${reps.length}`);
  check(/^data:image\/(jpeg|png)/.test(reps[0] && reps[0].file), '刚才的照片自动存成了原件', ((reps[0] || {}).file || '').slice(0, 22));
  check(labs.every(r => r.reportId === (reps[0] || {}).id), '结果都指向这份报告');

  console.log('\n控制台错误：', errs.length ? errs : '无');
  console.log(`${fail === 0 ? '全部通过' : '有失败'}：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
