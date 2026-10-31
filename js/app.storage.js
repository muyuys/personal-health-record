/*
 * 存储与传输适配器：唯一允许访问 localStorage / fetch 的前端模块。
 * 不包含健康档案业务规则，也不持有页面状态；浏览器与 Node 测试共用。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HealthStorage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createClient(options = {}) {
    const apiBase = options.apiBase || '';
    const ocrBase = options.ocrBase || '';
    const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const local = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    let writeQueue = Promise.resolve();

    function requireStorage() {
      if (!local) throw new Error('浏览器存储不可用');
      return local;
    }

    function readText(key) {
      return requireStorage().getItem(key);
    }

    function writeText(key, value) {
      requireStorage().setItem(key, String(value));
    }

    function remove(key) {
      requireStorage().removeItem(key);
    }

    async function request(base, path, opts = {}, timeoutMs = 0) {
      if (!fetchImpl) throw new Error('当前环境不支持网络请求');
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = timeoutMs > 0 && ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
      const init = Object.assign({}, opts);
      if (ctl) init.signal = ctl.signal;
      try {
        return await fetchImpl(base + path, init);
      } finally {
        if (timer !== null) clearTimeout(timer);
      }
    }

    function apiUrl(path) {
      return apiBase + path;
    }

    function get(path, opts = {}, timeoutMs = 0) {
      return request(apiBase, path, opts, timeoutMs);
    }

    function ocr(path, opts = {}, timeoutMs = 20000) {
      return request(ocrBase, path, opts, timeoutMs);
    }

    async function put(path, body) {
      // 在调用时序列化，而非等网络空闲后序列化：每次写入都是明确快照。
      const serialized = JSON.stringify(body);
      const r = await request(apiBase, path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: serialized
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const result = await r.json();
      if (!result || !result.ok) throw new Error((result && result.error) || '写入失败');
      return result;
    }

    function putQueued(path, body) {
      const serialized = JSON.stringify(body);
      const run = writeQueue.then(async () => {
        const r = await request(apiBase, path, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: serialized
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const result = await r.json();
        if (!result || !result.ok) throw new Error((result && result.error) || '写入失败');
        return result;
      });
      // 失败只拒绝本次调用，不能让后续写入永久卡在 rejected Promise 上。
      writeQueue = run.catch(() => undefined);
      return run;
    }

    async function idle() {
      await writeQueue;
    }

    return { readText, writeText, remove, apiUrl, get, ocr, put, putQueued, idle };
  }

  return { createClient };
});
