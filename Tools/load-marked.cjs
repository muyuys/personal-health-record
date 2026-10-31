/* 统一解析文档构建依赖 marked：
 * 1) 项目本地 node_modules（npm install，推荐）
 * 2) NODE_PATH 指向的全局/托管依赖
 * 3) 历史托管环境的绝对路径（仅向后兼容，不再作为唯一来源）
 * 应用本身（index.html + js/ + assets/）不需要任何 npm 依赖；只有文档构建与 e2e 需要。
 */
'use strict';

const path = require('path');

function loadMarked() {
  const candidates = [
    'marked',
    // 历史兼容：旧脚本写死的托管缓存路径，存在才尝试，不再是唯一依赖来源。
    'C:/Users/muyuys/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/marked',
  ];
  const errors = [];
  for (const id of candidates) {
    try {
      return require(id);
    } catch (err) {
      if (err && err.code !== 'MODULE_NOT_FOUND') throw err;
      errors.push(id);
    }
  }
  throw new Error(
    '缺少文档构建依赖 marked（尝试过：' + errors.join('；') + '）。\n' +
    '请在项目根目录执行一次：npm install\n' +
    '（或把 marked 所在的 node_modules 配置进 NODE_PATH）。'
  );
}

module.exports = { loadMarked };
