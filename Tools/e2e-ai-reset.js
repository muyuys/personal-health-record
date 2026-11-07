/* /reset 指令回归：清空当前成员的问答记录。
 *
 * 跑在独立端口（8798，避开 e2e-server 的 8799）与独立库上，不碰 data/health.db。
 * 用法：NODE_PATH=... node Tools/e2e-ai-reset.js
 */
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 8798;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const PY = path.join(ROOT, 'server', '.venv', 'Scripts', 'python.exe');
const TMP = 'C:/Users/muyuys/AppData/Local/Temp/health-e2e-reset';
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
/* 直接往库里塞问答：造历史比跑一次模型便宜，也不依赖模型能否连通 */
const seedRows = (dbFile, rows) => py(`
import sqlite3, pathlib
db = pathlib.Path(r'${dbFile}')
db.parent.mkdir(parents=True, exist_ok=True)
c = sqlite3.connect(db)
c.execute('CREATE TABLE IF NOT EXISTS ai_chat (id TEXT PRIMARY KEY, question TEXT, answer TEXT, sources TEXT, created_at INTEGER, model TEXT DEFAULT "")')
for i, (q, a) in enumerate(${JSON.stringify(rows)}):
    c.execute('INSERT OR REPLACE INTO ai_chat (id,question,answer,sources,created_at,model) VALUES (?,?,?,?,?,?)',
              ('t%d' % i, q, a, '[]', 1700000000000 + i * 60000, 'test-model'))
c.commit()
print(c.execute('SELECT COUNT(*) FROM ai_chat').fetchone()[0])
`).trim();
const countRows = dbFile => py(`import sqlite3;print(sqlite3.connect(r'${dbFile}').execute('select count(*) from ai_chat').fetchone()[0])`).trim();

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

  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  /* 页面里的 fetch 被 app.members.js 接管、会强制改写 X-Health-Profile，
     跨成员的校验一律走 node 侧请求，别在 page.evaluate 里带自定义头。 */
  const api = async (p, headers) => {
    const res = headers ? await fetch(BASE + p, { headers }) : await fetch(BASE + p);
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { __bad: res.status, head: text.slice(0, 80) }; }
  };
  const count = res => (Array.isArray(res && res.messages) ? res.messages.length : JSON.stringify(res).slice(0, 60));
  const open = async (query) => {
    await page.goto(`${BASE}/index.html${query}#/assistant`);
    await page.waitForTimeout(900);
  };

  /* 1. 预置两条问答，页面应显示成两轮对话 */
  check(seedRows(DB, [['第一次提问', '**答一**'], ['第二次提问', '答二']]) === '2', '预置 2 条问答');
  await open('');
  check(await page.$$eval('.ai-message', els => els.length) === 2, '页面显示 2 轮对话');

  /* 2. 输入 /reset：按钮改成「执行」，并说明后果 */
  await page.fill('#aiQuestion', '/reset');
  await page.waitForTimeout(150);
  check((await page.textContent('#aiForm [type=submit]')).trim() === '执行', '输入 /reset 后按钮变为「执行」');
  const hint = (await page.textContent('#aiStatus')).trim();
  check(/清空/.test(hint), '输入框下方说明将清空什么', hint);

  /* 3. Enter 直接执行（多行输入框默认是换行） */
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const notice = (await page.textContent('.ai-notice').catch(() => '')).trim();
  check(/已清空 2 条/.test(notice), '执行后提示已清空 2 条', notice);
  check(await page.$$eval('.ai-message', els => els.length) === 0, '对话区清空');
  check(!!(await page.$('.ai-empty')), '回到空态与示例问题');
  check(count(await api('/api/ai/history')) === 0, '接口里也没有历史了');
  check(await page.inputValue('#aiQuestion') === '', '输入框已清空');
  check(countRows(DB) === '0', '库里确实删掉了，不是只清 DOM');

  /* 4. 没有记录时再执行一次，说明「还没有」而不是报错 */
  await page.fill('#aiQuestion', '/reset');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  check(/还没有问答记录/.test(await page.textContent('.ai-notice').catch(() => '')), '无记录时给出中性说明');

  /* 5. 只是正文里提到 /reset，不算指令 */
  await page.fill('#aiQuestion', '/reset 之后会怎样');
  await page.waitForTimeout(150);
  check((await page.textContent('#aiForm [type=submit]')).trim() === '提问', '带参数的 /reset 不当成指令');

  /* 6. 重新进页面仍是空的（确认是真的落库删了） */
  await open('');
  check(await page.$$eval('.ai-message', els => els.length) === 0, '刷新后仍为空');

  /* 7. 成员隔离：在成员档案里清空，默认档案不受影响 */
  const member = await fetch(BASE + '/api/profiles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '测试成员', relation: '家人' })
  }).then(r => r.json());
  check(!!member.id, '新建成员成功', member.id);
  seedRows(DB, [['默认档案的一问', '默认档案的一答']]);
  const memberDb = path.join(TMP, 'test_members', member.id, 'health.db');
  check(seedRows(memberDb, [['成员自己的提问', '成员自己的回答']]) === '1', '成员库预置 1 条');

  await open('?member=' + member.id);
  check(await page.$$eval('.ai-message', els => els.length) === 1, '成员页只显示自己的 1 条');
  await page.fill('#aiQuestion', '/reset');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  check(/已清空 1 条/.test(await page.textContent('.ai-notice').catch(() => '')), '在成员档案里清空');
  check(count(await api('/api/ai/history', { 'X-Health-Profile': member.id })) === 0, '成员历史已清空');
  const mine = count(await api('/api/ai/history'));
  check(mine === 1, '默认档案的问答没被牵连', mine + ' 条');

  /* 8. 只删问答，不动记录 */
  const before = await api('/api/all', { 'X-Health-Profile': member.id });
  await api('/api/ai/reset', { 'X-Health-Profile': member.id });
  const after = await api('/api/all', { 'X-Health-Profile': member.id });
  check((after.labs || []).length === (before.labs || []).length && (after.reports || []).length === (before.reports || []).length,
    '检验与报告数量不变', `${(after.labs || []).length} 条检验 / ${(after.reports || []).length} 份报告`);

  check(errs.length === 0, '无 JS 报错', errs.slice(0, 2).join(' | '));

  await browser.close();
  if (proc) proc.kill();
  console.log(`\n${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
