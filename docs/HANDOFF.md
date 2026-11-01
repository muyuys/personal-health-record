# 交接说明（HANDOFF）

> 写于 2026-10-31。给**接手维护的人**（或下一个接手的 AI 助手）看。
> 只想会用这个档案，看 [使用指南.md](使用指南.md)；只想了解里面有什么，看 [README.md](../README.md)。
> 本文不含任何个人健康内容——按项目约定，说明性文档不写指标、诊断、机构、就诊日期。

---

## 1. 一句话现状

一个**能用的**单机个人健康档案：双击 `启动健康档案.bat` 打开页面，数据写到本机 SQLite，报告原件存成真实文件，五套回归测试全绿。

但有一件事没做：**代码还没提交**。仓库只有一次初始提交，之后的目录迁移、SQLite 化、围度、全部记录页，全都躺在工作区里。

---

## 2. 现状速览

| 项目 | 状态 |
| --- | --- |
| 服务 | `http://127.0.0.1:8765/`，只 bind 本机，不对外 |
| 数据库 | `data/health.db`（SQLite + WAL，当时约 72 KB） |
| 报告原件 | `data/报告原件/files/`，5 个文件，约 430 KB |
| 库内记录 | 数十条检验结果、5 份报告、少量体重与围度记录 |
| 回归测试 | 75 / 26 / 32 / 19 / 21，全部通过 |
| 文档断链 | 0 处 |
| Git | `main` 分支，**1 次提交，40 项改动未提交** ⚠️ |
| 依赖环境 | `server/.venv`（Python），已装 rapidocr + onnxruntime |

---

## 3. 架构：为什么是三个东西

```
浏览器 ── 静态资源 ──┐
   │                  │
   └─ JSON API ──► server/health_server.py ──► data/health.db
                        │                      data/报告原件/files/*.jpg
                        └─ POST /ocr ──► server/ocr_server.py（RapidOCR）
```

1. **前端是纯静态单页**：`index.html` + `assets/`，没有构建步骤、没有 npm 依赖、没有 CDN。双击 `index.html` 也能打开（会降级，见下）。
2. **本机服务是唯一的写入通道**：Python 标准库 `http.server`，同时干三件事——静态托管整个 `F:/Health`、提供 JSON API、转发识别请求。不用 Flask，就是为了"装个 Python 就能跑"。
3. **SQLite 是唯一的真相**：`data/health.db`。图片不进库，落盘存文件名。

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

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `index.html` | 73 | 应用外壳：侧栏骨架、弹层容器、脚本引入 |
| `assets/app.js` | 3068 | 路由、九个视图的渲染、表单、图表、导入导出、存储层 |
| `assets/parse.js` | 564 | 报告文本 → 结构化记录。**纯函数**，可 `node require` |
| `assets/data.js` | 269 | 只读档案内容（`docs/` Markdown 的结构化摘要） |
| `assets/styles.css` | 852 | 全部样式，含响应式与打印 |
| `server/health_server.py` | 449 | 静态托管 + JSON API + OCR 转发 |
| `server/ocr_server.py` | 266 | 识别逻辑（`load_engine` / `recognize` / `group_lines`） |

`app.js` 是单文件，3000 行已经偏大。**如果要拆分，先拆存储层和渲染层**（`persistLabs` / `bootStore` / `render*`），别按页面拆——页面之间共享的辅助函数太多。

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
| PUT | `/api/state` | weights + done + body |
| GET | `/api/export` | `health-archive` v2，图片读回 base64 |
| POST | `/api/import` | 合并导入（v1 / v2 / 旧 `health-labs` 都吃） |
| POST | `/ocr` | 图片 → 文本行（TSV） |
| GET | `/ping` | 探活 |

整表替换的选择是刻意的：记录量在千级，一次写全表比做增量协议省事得多，事务保证不会写半个。**真到万级再改增量。**

备份格式 `health-archive` v2 = `labs + weights + body + done + reports`（含图片 base64）。
⚠️ 服务端 `PUT /api/state` 与 `POST /api/import` 对 `body` 必须写 `data.get("body")`，**不能写 `data.get("body") or []`**——老备份没有 body 字段，`or []` 会把围度表清空。

---

## 7. 已经做完的

**UI 改版第一批（2026-11-02，commit 302e11d）——信息架构已换新，旧文档里「九个视图」的说法过时**
- 一级导航收敛为五模块：**首页 / 就医记录 / 日常健康 / 健康主题 / 我的**（桌面侧栏 + 移动底栏，我的置底）；旧 hash（#/overview、#/timeline、#/visits、#/meds、#/todo、#/profile、#/weight、#/diet、#/vitals、#/symptoms、#/sleep、#/issues）全部静默重定向到新路由，`#/labs`、`#/labs-all`、`#/summary` 保留原路由
- 新视图集中在 **`js/app.views.records.js`**（首页 / 就医记录 / 就诊详情 / 速记页 / 存报告页），`renderOverview`/`renderVisits` 已退役
- 就诊速记与存报告是独立页（`#/new-visit`、`#/new-report`、`#/visit?id=&edit=1`），不再是弹层；自由记录正文写入 `visit.summary`（旧「就诊小结」语义），未新增数据库字段
- 「按示例草稿新建」（visitSampleDraft）已整条删除
- 视觉体系换为三层纸底 + 1px 描边（卡片无阴影）、墨色 5 档、状态色三元组；`:root` 里旧变量名以**别名**形式保留并指向新值，**第二批结束时必须全部删除**（027 §20）
- 设计依据：`docs/tasks/026-新版UI视觉规范.md`、`docs/tasks/027-新版UI页面结构与交互规范.md`（改版前先读这两份，别凭旧印象改）
- 待做：第二批（日常健康分段 / 健康主题 / 我的重排 + 删别名层）、028 数据模型卡（就诊↔多份资料、todoItem.visitId）

**浏览与阅读**
- 九个视图：总览、健康问题、检验指标、**全部检验记录**（`#/labs-all`，侧栏无入口，从检验页进）、检查时间线、用药记录、复诊待办、减重记录、个人资料
- 只读内容（问题、主题、证据分级、时间线、用药）来自 `assets/data.js`，是 `docs/` 下 Markdown 的摘要

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

---

## 9. 没做完的 / 待你拍板

按优先级：

1. **提交代码**（最急）。当前 40 项改动全在工作区。`data/` 已被正确忽略（核过：`git status` 里 0 个 data 条目），可以放心 `git add -A`。提交信息建议按四块写：目录迁移 / SQLite 化 / 围度 / 全部记录页。
2. **定性指标未支持**。尿蛋白、隐血这类阴性/阳性、`+−` 结果现在进"跳过"列表，不落库、不进趋势。要做就得新增一类字段（`qualitative`），**不折算成数值**，只追踪阴性与阳性变化。这是上次提过、用户还没回答的问题。
3. **老报告的 `panel` / `specimen` 可能为空**。字段是后加的，早于字段扩展录入的报告只有 `title`。补法：重导一次 `data/报告原件录入包.json`（按 id 合并，不翻倍），或在报告原件列表里手动编辑。
4. **备份没有提醒**。只有手动点"导出完整备份"。数据只有 `data/health.db` 一份，删掉就真没了。可考虑启动时检查上次导出时间，超 30 天提示。
5. **服务没有守护**。关掉窗口就停，没有开机自启。日常用 `启动健康档案.bat` 足够；如果哪天想常驻，再考虑注册计划任务，别做成系统服务（个人机器没必要）。
6. **影像是死链的**。`data/` 下有 DICOM 原片和渲染切片，文档里能链过去，但页面里没有影像视图。要不要做，取决于用户是否真的会在页面里看图。
7. **`docs/` 的 HTML 是手工同步的**。22 份 md / 23 份 html，改完 md 要重新生成。没有自动构建——这是刻意的，避免引入 node 工具链。

---

## 10. 已知的坑（都踩过）

**运行相关**
- 改了 `health_server.py` 必须重启进程才生效，前端刷新没用。旧进程不退出时新进程会 bind 失败。
- 助手/脚本写不进用户的浏览器存储（Playwright 是独立 profile）。但可以经 `/api/*` 直接写库——写之前先 `GET /api/all` 看全量，`PUT` 是整表替换，漏传就删数据。
- 测试必须用 `-p 8799 -d <临时目录>`（`Tools/e2e-server.js` 已经这么做）。在真库上做写入测试会污染数据。

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

四条命令，全绿才算没改坏：

```bash
cd F:/Health

# 解析器单元测试（75 项，最快，不需要浏览器）
node Tools/test-parse.cjs

# 下面四套要 Node + Playwright，并加载托管环境的 node_modules
export NODE_PATH=C:/Users/muyuys/.workbuddy/binaries/node/workspace/node_modules
NODE=C:/Users/muyuys/.workbuddy/binaries/node/versions/22.22.2-6/node.exe

$NODE Tools/e2e-import.js    # 26 项：文本 / CSV / 手机端导入
$NODE Tools/e2e-report.js    # 32 项：报告原件、图片、组套样本
$NODE Tools/e2e-ocr.js       # 19 项：识别 → 预览 → 入库（需服务在跑）
$NODE Tools/e2e-server.js    # 21 项：8799 临时库，落库/出图/导出/删除

# 文档断链
python Tools/检查文档链接.py   # 期望「断链 0 处」
```

`e2e-ocr` 和 `e2e-server` 需要本机服务在跑（前者打 8765 的 `/ocr`，后者自己起 8799）。

---

## 12. 接手第一小时建议

1. 双击 `启动健康档案.bat`，确认侧栏是**绿点**「数据已入本机库」，翻一遍九个视图。
2. 到个人资料页点一次「导出完整备份」，确认能下载出 JSON——先把可恢复性验证一遍，再动代码。
3. 跑上面四套测试，确认基线全绿。
4. **把当前改动提交了**（40 项）。这是唯一的硬性待办。
5. 读 `.workbuddy/memory/MEMORY.md`——项目约定、踩坑清单都在那儿，比代码注释新。
6. 再决定第 9 节里哪件事值得做。别一次改两件：这个项目没有类型系统也没有构建，出错只能靠测试和肉眼。
