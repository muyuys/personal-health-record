# 交接说明（HANDOFF）

> 写于 2026-10-31。给**接手维护的人**（或下一个接手的 AI 助手）看。
> 只想会用这个档案，看 [使用指南.md](使用指南.md)；只想了解里面有什么，看 [README.md](../README.md)。
> 本文不含任何个人健康内容——按项目约定，说明性文档不写指标、诊断、机构、就诊日期。

---

## 1. 一句话现状

一个**能用且已分层**的单机个人健康档案：双击 `启动健康档案.bat` 打开同源页面，数据写到本机 SQLite，报告原件存成真实文件；前端有领域/存储分层，服务端有仓储/备份/安全边界分层，快速回归（parse 77 项 + 领域 + 存储 + 后端 13 项）全绿。

当前改动尚未提交，提交前请先跑第 11 节的快速回归。

---

## 2. 现状速览

| 项目 | 状态 |
| --- | --- |
| 服务 | `http://127.0.0.1:8765/`，只 bind 本机 + 仅同源 API，不对外 |
| 数据库 | `data/health.db`（SQLite + WAL；本仓库只存代码，个人数据不入 Git） |
| 快速回归 | parse 77 项 + 领域规则 + 存储适配器 5 组 + 后端 13 项，全部通过 |
| 端到端 | 4 套 Playwright 脚本，fixture 全合成；需本机 Chrome 与可选开发依赖 |
| 文档断链 | 0 处 |
| Git | `main` 分支；本次分层与安全边界改动待提交 ⚠️ |
| 依赖环境 | 应用运行零 npm 依赖；OCR 用 `server/.venv`；文档构建/e2e 依赖见 `package.json` |

---

## 3. 架构：为什么是三个东西

```
浏览器 ── 静态白名单 ──┐
   │                   │
   └─ 同源 JSON API ──► health_server.py（组合根 / 路由 / 安全边界）
                            ├─ health_repository.py ──► data/health.db + 报告图片文件
                            ├─ health_backup.py     ──► data/backups/*.db（仅 DB 快照）
                            └─ ocr_server.py        ──► 进程内 RapidOCR（图片→文字）
```

1. **前端是纯静态单页**：`index.html` + `assets/` + `js/`，没有构建步骤、没有 npm 依赖、没有 CDN。双击 `index.html` 也能打开（纯离线 localStorage，不访问本机服务）。
2. **本机服务是唯一的写入通道**：Python 标准库 `http.server` 只做路由与安全边界；SQL/文件全部在 `health_repository.py`，路径由 `main()` 注入。不用 Flask，就是为了"装个 Python 就能跑"。
3. **SQLite 是唯一的真相**：`data/health.db`。图片不进库，落盘存服务端生成的 UUID 文件名。

**降级行为**：服务没起时前端退回 `localStorage`（侧栏显示红点「浏览器存储模式」）。这是应急，不是备用方案——两套数据不互通，连上服务后要在个人资料页点「合并浏览器数据」并进库里。

**关键约束：不双写。** `storeMode` 是 `server` 或 `local`，二选一。任何时刻只有一份真相。

---

## 4. 怎么跑起来

### 首次（只需一次）
双击 `server/安装依赖.bat`：建 `server/.venv`，装 `rapidocr` + `onnxruntime`。
装依赖必须走 pypi 官方源（脚本里已写死 `-i https://pypi.org/simple`）——本机 pip 全局配了清华源，清华没有 `rapidocr`。

### 日常
双击根目录 `启动健康档案.bat`：起服务 → 等 3 秒 → 开浏览器。关掉那个黑窗口服务就停。

### 手动（调试时用）
```bash
cd F:/Health/server && .venv/Scripts/python.exe health_server.py
# 自定义端口 / 数据目录（测试用，绝不碰真库）
.venv/Scripts/python.exe health_server.py -p 8799 -d <临时目录>
```

### 只开页面（无服务）
直接双击 `index.html` → 降级到浏览器存储，侧栏红点。
`?offline=1` 强制降级，自动化测试靠它避免把测试数据写进真库。

---

## 5. 代码地图

### 前端（2026-11-01 起分层）

| 文件 | 职责 |
| --- | --- |
| `index.html` | 应用外壳：侧栏骨架、弹层容器、按依赖顺序加载脚本 |
| `js/app.domain.js` | **纯业务规则**（异常判定 / 定性结果 / 去重 key / 体征区间），无 DOM 无 I/O，可直接 Node 测 |
| `js/app.storage.js` | **存储适配器**：唯一访问 localStorage / fetch 的前端模块；写入有序队列 + 入队快照 |
| `js/app.core.js` | 基础工具 / 图标 / 数据模型规范化 / 应用内存状态（labs、state 等） |
| `js/app.derive.js` | 派生数据 / 提醒 / 档案完整度 |
| `js/app.views.*.js` | 视图渲染（health / body / profile） |
| `js/app.modal.js` | 弹层 / 表单 / 导入 / OCR |
| `js/app.boot.js` | 事件绑定 / 路由 / 启动 |
| `assets/parse.js` | 报告文本 → 结构化记录，**纯函数**，可 `node require` |
| `assets/data.js` | 静态档案模板。当前为空白结构，不含个人健康信息；只读主题/时间线等内容按同一结构补充 |
| `assets/styles.css` | 全部样式，含响应式与打印 |

依赖方向：`domain` ← `core/derive` ← `views/modal` ← `boot`；`storage` 只被 `core` 使用。
**视图仍通过全局兼容别名读写内存状态，这是下一阶段的改造点（任务 020），新增代码不要再扩大全局可写状态。**

### 服务端（2026-11-01 起分层）

| 文件 | 职责 |
| --- | --- |
| `server/health_server.py` | **组合根 + HTTP 路由 + 安全边界**（同源校验、静态白名单）；不含 SQL |
| `server/health_repository.py` | SQLite schema/迁移、全部查询与整表替换、报告文件落盘、导入导出；路径构造注入，事务内组合跨表写入，图片**提交后才删旧图、回滚清理新图** |
| `server/health_backup.py` | SQLite 一致快照 + 滚动保留（跟随注入的数据库位置） |
| `server/local_http.py` | Host / Origin 同源校验、CORS 响应头 |
| `server/ocr_server.py` | OCR 引擎适配；公开 `status()` / `recognize_lines()`，不再被读私有全局 |

**安全边界**：只允许同源页面访问 API（Host 校验防 DNS rebinding、Origin 精确匹配、不再用通配 CORS）；`file://` 仅作离线应急，不调用本机服务；静态托管白名单只含 `index.html` / `assets` / `js` / `docs` / 原件路由，`data/health.db`、备份、`private_data`、`.git`、依赖目录一律不经 HTTP 暴露；报告文件名由服务端生成 UUID，不使用 report_id 拼路径。

**连接管理**：sqlite3 的 `with connect()` 只提交事务**不关闭连接**；仓储统一用 `closing()` 或事务上下文的 `finally: close()`，否则 Windows 上数据库/备份文件被句柄锁住。

---

## 6. 数据模型与接口

### 表
| 表 | 主要字段 |
| --- | --- |
| `labs` | `id,date,category,name,value,unit,low,high,source,note,reportId` |
| `reports` | `id,date,title,panel,specimen,hospital,note,file,createdAt` |
| `weights` | `id,date,kg,tag,waist,note` |
| `body` | `id,date,chest,waist,hip,note,createdAt` |
| `todo` | `k,v`（勾选状态） |
| `meta` | `k,v`（只存 `savedAt`，纯展示） |

### 三条容易搞错的规则

1. **去重 key = `date|category|name|unit`**。重复导入同一份报告不会翻倍。改过日期或单位后再导入，会被当成新记录——这是设计如此，不是 bug。
2. **腰围只有一份**，存在 `body.waist`。`weights.waist` 是历史字段，读到就由 `migrateWaistToBody()` 搬走（id = `b-` + 体重 id，幂等）。前端不再往 `weights` 写腰围。
3. **报告的 `title` / `panel` / `specimen` 是三个不同的东西**：`title` 是医院打印的申请项目原文，`panel` 是组套大类，`specimen` 是样本类型。后两个**只转写不推测**，认不出就留空。

### 接口
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/all` | 全量（labs / reports / weights / body / done / savedAt） |
| PUT | `/api/labs` | 整表替换，事务内 |
| PUT | `/api/reports` | 整表替换；`file` 传 dataURL 时自动落盘、旧图删 |
| PUT | `/api/state` | weights + done + body（**缺失组保留原值**，显式空数组才清空） |
| GET | `/api/export` | `health-archive` v2，图片读回 base64 |
| POST | `/api/import` | **单事务恢复导入**：`health-labs` v1（records）/ `health-archive` v2；格式与字段校验，缺省组保留，失败整体回滚；合并去重在调用前完成 |
| POST | `/ocr` | 图片 → 文本行（TSV） |
| GET | `/ping` | 探活 |

整表替换的选择是刻意的：记录量在千级，一次写全表比做增量协议省事得多，事务保证不会写半个。**真到万级再改增量。**

备份格式 `health-archive` v2 = `labs + weights + body + done + reports`（含图片 base64）。
⚠️ 服务端 `PUT /api/state` 与 `POST /api/import` 对 `body` 必须写 `data.get("body")`，**不能写 `data.get("body") or []`**——老备份没有 body 字段，`or []` 会把围度表清空。

---

## 7. 已经做完的

**浏览与阅读**
- 九个视图：总览、健康问题、检验指标、**全部检验记录**（`#/labs-all`，侧栏无入口，从检验页进）、检查时间线、用药记录、复诊待办、减重记录、个人资料
- 静态档案模板来自空白的 `assets/data.js`；页面不会注入示例健康内容。结构化就诊、用药、检验等可写记录存入 SQLite。

**录入（四条通道）**
- 手填单条
- 粘贴报告文本 → 逐行解析 → 预览表勾选确认
- 上传 CSV → 表头映射
- 上传/拍照 → 本机 OCR → 同一个预览表

**编辑**
- 全部检验记录：按日期分组，关键词 + 类别 + 来源报告 + 时间范围筛选，每行编辑/删除，改完留在列表
- 报告原件：改日期、名称、组套、样本类型、医院、备注，可换图或移除
- 体重、围度：明细表逐行编辑删除
- 待办：点勾选框

**数据**
- SQLite 单库 + 图片落盘
- 导出/导入 v2 备份（含图片）
- 浏览器旧数据合并（幂等）
- 报告图片与记录解耦：删记录才删文件

**其他**
- 移动端适配（列表列收放、底部 tab、"更多"菜单）
- 打印样式
- 文档体系：README + 使用指南 + 22 份内容文档，含 HTML 渲染版与断链检查

---

## 8. 关键决策与理由

接手时最容易"顺手改掉"的几件事，改之前先看理由：

| 决策 | 理由 | 什么情况下该推翻 |
| --- | --- | --- |
| 用 SQLite 而不是 JSON 文件 | JSON 每次重写整包，写到一半崩就毁库，并发还会互相覆盖；SQLite 有 WAL + 事务 | 数据量掉到几十条且永远单机单进程——但没必要为此改 |
| 不再用 localStorage 存业务数据 | 上限约 5 MB，报告照片一多就爆；清站点数据就全没；换浏览器就丢 | 不需要，服务已经够轻 |
| 服务用标准库 `http.server` | 不引入框架，装个 Python 就能跑，依赖只在 OCR 那侧 | 需要多用户/远程访问时才考虑换 |
| 只转写不推断 | 认错一个数比少录一条更糟；低置信度默认不勾选，最终由人确认 | 永不 |
| 围度独立于体重 | 围度不依附体重，没称体重也能量；体重记录的语义保持干净 | 永不 |
| 文档与数据分目录，`data/` 整目录不进 Git | 文档可以发给别人看，数据不行；同目录一次误提交就带出照片 | 永不 |
| 说明性文档禁写健康信息 | 会被转发、会被截图 | 永不 |
| 报告拆 `title` / `panel` / `specimen` | 医院打印的原始项目名要留档，组套和样本是检索维度 | 永不 |
| 全部记录页独立成路由而不是嵌在检验页 | 45 条渲染进趋势页会拖慢首屏，也让筛选状态和图表状态打架 | 数据量小时可以合并，但要保留全量入口 |
| API 仅同源 + Host 校验；`file://` 纯离线 | loopback 挡不住恶意网页的私网请求 / DNS rebinding；通配 CORS 等于把健康数据开放给任意网页 | 若未来确需 `file://` 连服务，必须引入启动随机 token，不能把 `Origin:null` 当白名单 |
| 静态托管白名单 | `.gitignore` 不保护 HTTP；数据库/备份/`.git`/依赖不应有 URL | 永不缩小为“整目录托管” |
| 报告文件名服务端 UUID | report_id 不可信，不能拼路径 | 永不回退 |
| 跨表导入单事务 + 图片提交后清理 | 部分提交与旧图丢失是最难恢复的事故 | 永不回退 |

---

## 9. 没做完的 / 待你拍板

按优先级：

1. **提交代码**（最急）。当前改动全在工作区。`data/` 已被正确忽略（`git status` 里 0 个 data 条目）。建议按两块提交：①前端分层 + 领域/存储适配器；②服务端仓储拆分 + 安全边界 + 事务。
2. **任务 020：视图层去全局化**。`app.views.*.js` / `app.modal.js` 仍经全局兼容别名直接读写 `labs`、`state` 等内存状态。下一步引入单一 `store` 对象（get / subscribe / action），视图只读快照、经 action 变更，迁移一个视图验证一个，详见 `docs/tasks/020-可维护性-视图层状态收敛与数据契约.md`。
3. **前端写入假成功**。`pushJSON()` 已进入有序队列，但调用方仍在服务器提交前就提示“已保存”。应让 `persist*()` 返回 Promise，UI 在 resolve 后再提示，reject 时给出重试；导入恢复改走 `POST /api/import` 单事务接口，而不是多次 PUT。
4. **schema 版本与迁移前快照**。当前迁移是幂等的 `PRAGMA + ADD COLUMN`（main 已先备份再迁移），下一次真实 schema 变更时引入 `PRAGMA user_version` 的顺序迁移函数，并补恢复演练。
5. **多标签页并发**。整表替换是 last-write-wins；确有双标签使用场景时给 `/api/state` 与 `/api/labs` 加 revision 检查（乐观锁），不要提前上增量协议。
6. **服务端输入校验**。体征至少一项、症状评分 1–10、围度至少一项等不变量目前主要由前端保证，直接 API 可写非法值；应在仓储入口补统一校验，非法输入返回 400。
7. **老报告的 `panel` / `specimen` 可能为空**。字段是后加的，早于字段扩展录入的报告只有 `title`，在报告原件列表里手动补齐即可。
8. **自动备份不含图片**。`data/backups/` 只有 SQLite 快照，不含报告图片与任意原件，不能等同完整档案备份；完整可迁移备份仍以页面「导出完整备份」的 JSON 为准。
9. **服务没有守护 / 影像无页面视图**：同前，按需再做，不为做而做。

---

## 10. 已知的坑（都踩过）

**运行相关**
- 改了 `health_server.py` 必须重启进程才生效，前端刷新没用。旧进程不退出时新进程会 bind 失败。
- 助手/脚本写不进用户的浏览器存储（Playwright 是独立 profile）。但可以经 `/api/*` 直接写库——写之前先 `GET /api/all` 看全量，`PUT` 是整表替换，漏传就删数据（`/api/state` 例外：缺失组保留，显式空数组才清空）。
- 测试必须用 `-p 8799 -d <临时目录>`（`Tools/e2e-server.js` 已经这么做，且会核对 /ping 的 db 路径）。在真库上做写入测试会污染数据。
- **sqlite3 的 `with connect()` 不关闭连接**，只提交事务；Windows 上不 close 会锁住 db/备份文件。仓储统一 `closing()` 或 `finally: close()`，新增查询照此办理。
- API 仅同源：跨源 / 伪造 Host / `Origin:null` 一律 403；`file://` 打开页面就是纯离线，不要给它加回本机 API 访问。

**前端相关**
- CSS 特异性是主要坑源。全局 `table.data th:nth-child(n)`（0,2,2）会压过组件自己的类选择器，恢复某列要用同特异性 + 后置：`table.data.laball-table td.col-rep`。
- 表格加列后，媒体查询里所有 `nth-child(n)` 的索引全部错位，改列结构必须同步重算。
- `.field textarea{min-height:64px}` 会压过自定义 textarea 类，覆盖要写 `.field textarea.xxx`。
- `const` 重复声明会让整个 `app.js` 不执行、页面全白，且控制台只有一行 `Identifier ... has already been declared`。改完先 `node --check assets/app.js`。

**解析相关**
- `parse.js` 里日期有两条路：`ctx.date` 是弹层默认值，`ctx.found` 是正文发现的真实日期。行日期只取 `found`，结尾才 `found || opts.date` 兜底。曾经搞混，整批导入记成了当天。
- "申请项目：xxx" 这类表头行必须无条件跳过，否则 `尿微量白蛋白比肌酐2项` 会被当成一条"值 = 2"的记录。
- 尿液的标本类型要参与分类：报告写"标本类型：尿液"时，白细胞/红细胞/未溶红细胞% 归"其他"，不能进"血常规"。

**文档相关**
- `Tools/生成HTML档案.cjs` **对已存在的 HTML 不覆盖**。改完 md 要先把旧 html 删掉（备份到别处）再跑。
- 断链检查要能处理文件名里的成对括号，正则会在 `(胶5)` 处截断，得用平衡括号扫描。
- HTML 里中文是 URL 编码的，重写路径时 `quote` 的 safe 必须含 `+` 和 `()`。
- README 里 `data/影像/<部位>/` 是**脱敏写法**，真实目录带部位名。别按字面去找 `<部位>` 这个文件夹。

**依赖相关**
- 本机 pip 全局配了清华源，清华缺 `rapidocr`，装包必须显式 `-i https://pypi.org/simple`。
- 本机没有 Playwright 自带浏览器，截图脚本要 `chromium.launch({channel:'chrome'})`。

---

## 11. 验收怎么跑

无第三方依赖的快速回归（改代码后至少跑这一组）：

```bash
# 前端：解析器 / 领域规则 / 存储适配器 + 全部模块语法检查
node Tools/test-parse.cjs       # 77 项
node Tools/test-domain.cjs
node Tools/test-storage.cjs
for f in js/*.js; do node --check "$f"; done

# 后端：仓储 / 事务 / 图片提交回滚 / 迁移 / 备份 / HTTP 安全边界（13 项，标准库 + 临时目录）
python Tools/test_server.py

# 文档断链
python Tools/检查文档链接.py   # 期望「断链 0 处」
```

浏览器端到端（需 Node + Playwright + 本机 Chrome；fixture 全部合成、不读个人数据）：

```bash
node Tools/e2e-import.js    # 文本 / CSV / 手机端导入（离线）
node Tools/e2e-report.js    # 报告原件、图片、组套样本（离线）
node Tools/e2e-ocr.js       # 识别 → 预览 → 入库（需服务在跑）
node Tools/e2e-server.js    # 动态端口 + 系统临时库：落库/出图/导出/删除
```

`e2e-ocr` 打 8765 的 `/ocr`；`e2e-server` 自起 8799 并核对 `/ping` 返回的 db 确为本次临时库。Playwright 未装时设置 `NODE_PATH` 指向其所在 `node_modules`。

---

## 12. 接手第一小时建议

1. 双击 `启动健康档案.bat`，确认侧栏是**绿点**「数据已入本机库」，翻一遍九个视图。
2. 到个人资料页点一次「导出完整备份」，确认能下载出 JSON——先把可恢复性验证一遍，再动代码。
3. 跑上面的快速回归（parse / domain / storage / test_server），确认基线全绿。
4. **把当前改动提交了**（前端分层 + 服务端安全边界）。
5. 读 `docs/构建说明.md`（模块依赖方向）与 `docs/tasks/020-*`（下一阶段规划）；项目约定与踩坑清单以本文第 8、10 节为准。
6. 再决定第 9 节里哪件事值得做。一次只改一层：领域规则、存储适配器、视图、仓储各自有独立测试，改完先跑对应测试再动下一层。
