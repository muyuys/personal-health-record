# 019 可维护性：.md→.html 自动构建 + app.js 拆分

- 优先级：P2
- 状态：**已完成**（2026-11-01 增补分层）

## 原问题

`assets/app.js` 单文件约 2851 行、解析规则硬编码、md→html 手工同步、无 CI；`server/health_server.py` 把静态托管、SQL、图片、备份混在一个文件。

## 已完成

1. **构建**：`Tools/build-docs.cjs` 统一入口（派生问题总表 → 补齐主题结构 → 强制重渲染全部 md），幂等、`--check` / `--out=` 可用。
2. **前端分层**（详见 `docs/构建说明.md`）：
   - `js/app.domain.js`：纯业务规则（异常判定 / 定性结果 / 去重 key / 体征区间），无 DOM 无 I/O。
   - `js/app.storage.js`：唯一访问 localStorage / fetch 的适配器；写入有序队列 + 入队快照，失败不阻塞后续。
   - `app.core / app.derive / app.views.* / app.modal / app.boot`：内存状态、派生、视图、弹层、路由。
   - 新增 `Tools/test-domain.cjs`、`Tools/test-storage.cjs`；`Tools/test-parse.cjs` 修正为 77 项全绿（定性结果不再被跳过）。
3. **服务端分层**：`health_server.py` 只作组合根 + 路由 + 安全边界；`health_repository.py`（SQLite/文件/事务）、`health_backup.py`（快照）、`local_http.py`（同源校验）。
4. **安全边界**：API 仅同源 + Host 校验，去除通配 CORS；静态托管白名单；报告文件名服务端 UUID；`file://` 纯离线。
5. **一致性**：跨表导入单事务；图片提交后才删旧图、回滚清理新图；sqlite3 连接显式关闭（Windows 文件锁）。
6. **测试**：新增 `Tools/test_server.py`（13 项，标准库 + 临时目录）；e2e 脚本改为系统临时目录 + 合成 fixture + /ping 身份核对，不读个人健康数据。

## 验收

- `node Tools/test-parse.cjs` / `test-domain.cjs` / `test-storage.cjs` 全绿。
- `python Tools/test_server.py` 13 项全绿。
- 跨源 / 伪造 Host / `Origin:null` 请求返回 403；`/data/health.db` 等私有路径返回 404。
- 视图层去全局化、写入假成功、schema 版本与并发演进 → 接任务 **020**。
