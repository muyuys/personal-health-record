/* 斜杠面板回归：输入 / 弹出指令与可引用的记录。
 *
 * 跑在独立端口（8792）与独立库上，不碰 data/health.db；问答请求被拦截，不调用模型。
 * 用法：NODE_PATH=... node Tools/e2e-ai-slash.js
 */
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 8792;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const PY = path.join(ROOT, 'server', '.venv', 'Scripts', 'python.exe');
const TMP = 'C:/Users/muyuys/AppData/Local/Temp/health-e2e-slash';
const DB = path.join(TMP, 'test.db');

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
const py = code => execFileSync(PY, ['-c', code], { cwd: ROOT, encoding: 'utf8' });

/* 预置报告 / 检验 / 就诊：引用面板只列已存的记录，造数据比截图更快 */
const seed = dbFile => py(`
import json, sqlite3, pathlib
db = pathlib.Path(r'${dbFile}')
db.parent.mkdir(parents=True, exist_ok=True)
c = sqlite3.connect(db)
c.execute('CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, date TEXT, title TEXT, panel TEXT, specimen TEXT, hospital TEXT, note TEXT, file TEXT, created_at INTEGER)')
c.execute('CREATE TABLE IF NOT EXISTS labs (id TEXT PRIMARY KEY, date TEXT, category TEXT, name TEXT, value REAL, unit TEXT, low REAL, high REAL, source TEXT, note TEXT, report_id TEXT)')
c.execute('CREATE TABLE IF NOT EXISTS visit (id TEXT PRIMARY KEY, date TEXT, visit_type TEXT, department TEXT, hospital TEXT, doctor TEXT, chief TEXT, diagnosis TEXT, summary TEXT, report_id TEXT, note TEXT, created_at INTEGER)')
c.execute("INSERT OR REPLACE INTO reports (id,date,title,panel,specimen,hospital,note,file,created_at) VALUES ('r-kidney','2026-03-12','肾功能 + 电解质','生化','血液','示例医院','','',1)")
c.execute("INSERT OR REPLACE INTO reports (id,date,title,panel,specimen,hospital,note,file,created_at) VALUES ('r-liver','2026-01-08','肝功能','生化','血液','示例医院','','',2)")
for i, name in enumerate(['肌酐', '尿酸', '尿素']):
    c.execute('INSERT OR REPLACE INTO labs (id,date,category,name,value,unit,low,high,source,note,report_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
              ('l%d' % i, '2026-03-12', '肾功能', name, 70 + i, 'μmol/L', 40, 100, '医院报告', '', 'r-kidney'))
c.execute("INSERT OR REPLACE INTO visit (id,date,visit_type,department,hospital,doctor,chief,diagnosis,summary,report_id,note,created_at) VALUES ('v1','2026-03-20','复诊','肾内科','示例医院','','复查','','带报告复诊','','',3)")
c.commit()
# 配置一个本机假接口：只为了页面认为「已配置」，请求会被 Playwright 拦下，不会真的发出去
settings = db.parent / (db.stem + '.ai-settings.json')
settings.write_text(json.dumps({'mode': 'custom', 'custom': {'endpoint': 'http://127.0.0.1:9/v1', 'model': 'test-model', 'key': 'test'}}), encoding='utf-8')
print('seeded')
`).trim();

const refsOf = async (headers) => {
  const res = await fetch(BASE + '/api/ai/refs', headers ? { headers } : undefined);
  return res.json();
};

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  for (const f of [DB, DB + '-wal', DB + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
  const memberRoot = path.join(TMP, 'test_members');
  if (fs.existsSync(memberRoot)) fs.rmSync(memberRoot, { recursive: true, force: true });

  let proc = null;
  if (!(await alive())) {
    proc = spawn(PY, ['health_server.py', '-p', String(PORT), '-d', DB], { cwd: path.join(ROOT, 'server'), stdio: 'ignore' });
    for (let i = 0; i < 40; i++) { if (await alive()) break; await new Promise(r => setTimeout(r, 300)); }
  }
  if (!(await alive())) { console.error('起不来服务，检查 server/.venv'); process.exit(1); }
  seed(DB);

  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const open = async (query = '') => {
    await page.goto(`${BASE}/index.html${query}#/assistant`);
    await page.waitForTimeout(900);
  };
  const slashItems = () => page.$$eval('#aiSlash .ai-slash-item', els => els.map(el => el.textContent.trim()));
  const focusBox = async () => { await page.click('#aiQuestion'); };

  /* 1. 接口列出可引用的记录 */
  const list = await refsOf();
  check(list.refs.length === 4, '接口列出 2 份报告 / 1 次就诊 / 1 批检验', list.refs.length);
  check(list.refs[0].id === 'r-kidney', '最近的报告排在前面', list.refs[0].id);

  await open('');
  check(await page.isHidden('#aiSlash'), '未输入时不显示面板');

  /* 2. 空输入按 / 弹出面板 */
  await focusBox();
  await page.keyboard.type('/');
  await page.waitForTimeout(250);
  check(await page.isVisible('#aiSlash'), '输入 / 弹出面板');
  const groups = await page.$$eval('#aiSlash .ai-slash-label', els => els.map(el => el.textContent.trim()));
  check(groups.join('|') === '指令|引用记录', '面板分「指令」与「引用记录」', groups.join('|'));
  check((await slashItems()).length === 5, '1 条指令 + 4 条可引用记录', (await slashItems()).length);
  check((await page.getAttribute('#aiQuestion', 'aria-expanded')) === 'true', '输入框标记面板已展开');

  /* 3. 继续输入就地过滤 */
  await page.keyboard.type('肾');
  await page.waitForTimeout(200);
  check((await slashItems()).length === 3, '输入「肾」过滤到 3 条', (await page.textContent('#aiSlash')).slice(0, 40));
  check(/肾功能/.test(await page.textContent('#aiSlash')), '匹配到肾功能报告');

  /* 4. 方向键移动选中项 */
  const first = await page.getAttribute('#aiSlash .ai-slash-item.is-active', 'id');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(120);
  const second = await page.getAttribute('#aiSlash .ai-slash-item.is-active', 'id');
  check(first !== second, '↓ 切换选中项', `${first} → ${second}`);
  check((await page.getAttribute('#aiQuestion', 'aria-activedescendant')) === second, '选中的项同步给输入框');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(120);
  check((await page.getAttribute('#aiSlash .ai-slash-item.is-active', 'id')) === first, '↑ 回到第一项');

  /* 5. Enter 选中引用：变成 chip，触发用的 /肾 被拿掉 */
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check(await page.isHidden('#aiSlash'), '选中后面板关闭');
  check(await page.$$eval('.ai-ref-chip', els => els.length) === 1, '输入框上方出现 1 条引用');
  const chipText = (await page.textContent('.ai-ref-chip')).trim();
  check(/肾功能/.test(chipText), '引用显示是肾功能那份报告', chipText);
  check(!/\/肾/.test(await page.inputValue('#aiQuestion')), '输入框里不残留触发词');

  /* 6. 再引用一条就诊记录 */
  await page.keyboard.type('/复诊');
  await page.waitForTimeout(200);
  check((await slashItems()).length === 1, '「复诊」只剩一条', (await page.textContent('#aiSlash')).slice(0, 40));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check(await page.$$eval('.ai-ref-chip', els => els.length) === 2, '两条引用可以并存');

  /* 7. 重复引用同一份报告不会叠加 */
  await page.keyboard.type('/肾功能');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  check(await page.$$eval('.ai-ref-chip', els => els.length) === 2, '重复引用不叠加');

  /* 8. 逐条摘掉（留下报告那条，下一步要验证引用带到请求里） */
  await page.click('.ai-ref-chip:last-child [data-ref-remove]');
  await page.waitForTimeout(200);
  check(await page.$$eval('.ai-ref-chip', els => els.length) === 1, '点 × 移除一条引用');
  check(/肾功能/.test(await page.textContent('.ai-ref-chip')), '留下的是被引用的报告');

  /* 9. Esc 关面板，不把 / 留在输入框里当作问题 */
  await page.keyboard.type('/肝');
  await page.waitForTimeout(180);
  check(await page.isVisible('#aiSlash'), '再次打开面板');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(180);
  check(await page.isHidden('#aiSlash'), 'Esc 关闭面板');
  check(await page.inputValue('#aiQuestion') === '/肝', 'Esc 只关面板，不动已输入的文字');

  /* 10. 没有匹配项时给一句说明，Enter 不误触发 */
  await page.fill('#aiQuestion', '');
  await focusBox();
  await page.keyboard.type('/不存在的东西');
  await page.waitForTimeout(200);
  check(!!(await page.$('.ai-slash-empty')), '无匹配时说明没有结果');

  /* 11. 提交时带上引用，来源卡片标出「点名引用」 */
  let captured = null;
  await page.route('**/api/ai/chat', async route => {
    captured = route.request().postDataJSON();
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        id: 'fake', question: captured.question, answer: '按引用的记录整理。',
        sources: [{ ref: 'S1', kind: 'reports', id: 'r-kidney', date: '2026-03-12',
                    label: '肾功能 + 电解质', record: { title: '肾功能 + 电解质' }, pinned: true }],
        createdAt: Date.now(), model: 'test-model'
      })
    });
  });
  await page.fill('#aiQuestion', '这份报告怎么看？');
  await page.click('#aiForm [type=submit]');
  await page.waitForTimeout(900);
  check(!!captured, '发出了提问请求');
  check(Array.isArray(captured.refs) && captured.refs.length === 1, '请求体带上 1 条引用', JSON.stringify(captured && captured.refs));
  check(captured.refs[0].kind === 'reports' && captured.refs[0].id === 'r-kidney', '引用带的是记录 id', JSON.stringify(captured.refs[0]));
  check(await page.$$eval('.ai-ref-chip', els => els.length) === 0, '发送后引用清空');
  const sourceMeta = await page.textContent('.ai-source-meta').catch(() => '');
  check(/点名引用/.test(sourceMeta), '来源卡片标出这次是点名引用', sourceMeta);
  check(!!(await page.$('.ai-answer')), '回答正常落屏');
  await page.unroute('**/api/ai/chat');

  /* 12. /reset 仍按指令执行（面板不会抢走回车） */
  py(`import sqlite3
c = sqlite3.connect(r'${DB}')
c.execute('CREATE TABLE IF NOT EXISTS ai_chat (id TEXT PRIMARY KEY, question TEXT, answer TEXT, sources TEXT, created_at INTEGER, model TEXT DEFAULT "")')
c.execute("INSERT OR REPLACE INTO ai_chat VALUES ('x1','问','答','[]',1,'m')")
c.commit()`);
  await page.fill('#aiQuestion', '');
  await page.keyboard.type('/reset');
  await page.waitForTimeout(200);
  check((await page.textContent('#aiForm [type=submit]')).trim() === '执行', '敲全 /reset 后按钮是「执行」');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const resetNotice = await page.textContent('.ai-notice').catch(() => '');
  check(/已清空 1 条/.test(resetNotice), '回车直接执行清空', resetNotice.trim());
  check(py(`import sqlite3;print(sqlite3.connect(r'${DB}').execute('select count(*) from ai_chat').fetchone()[0])`).trim() === '0', '库里确实清空了');

  /* 13. 换成员后只看得见自己档案的引用 */
  const member = await fetch(BASE + '/api/profiles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '测试成员', relation: '家人' })
  }).then(r => r.json());
  check(!!member.id, '新建空成员', member.id);
  check((await refsOf({ 'X-Health-Profile': member.id })).refs.length === 0, '成员档案里没有可引用的记录');
  await open('?member=' + member.id);
  await focusBox();
  await page.keyboard.type('/');
  await page.waitForTimeout(250);
  check((await slashItems()).length === 1, '空档案的面板只剩指令', (await slashItems()).length);
  check(!(await page.$('.ai-slash-label ~ .ai-slash-item[data-slash-index="1"]')), '没有跨档案的记录可引用');

  check(errs.length === 0, '无 JS 报错', errs.slice(0, 2).join(' | '));

  await browser.close();
  if (proc) proc.kill();
  console.log(`\n${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
