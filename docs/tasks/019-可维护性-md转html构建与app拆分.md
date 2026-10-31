# 019 可维护性：.md→.html 自动构建 + app.js 拆分

- 优先级：P2
- 问题：`assets/app.js` 单文件约 2851 行、解析规则硬编码、md→html 手工同步、无 CI。
- 目标：`Tools/生成HTML档案.cjs` 接入自动构建；app.js 按视图拆模块。
- 范围：构建脚本、前端模块化。
- 验收：改 md 自动生成 html；app.js 拆分后功能不回归。
- 关联：`Tools/生成HTML档案.cjs`、`assets/app.js`
