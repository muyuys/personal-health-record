/* 存储适配器单元测试：node Tools/test-storage.cjs（无浏览器、无网络、无第三方依赖） */
const assert = require('assert/strict');
const { createClient } = require('../js/app.storage.js');

function memoryStorage() {
  const data = new Map();
  return {
    getItem: k => data.has(k) ? data.get(k) : null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k)
  };
}

function response(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function run() {
  {
    const local = memoryStorage();
    const client = createClient({ storage: local, fetchImpl: async () => response({ ok: true }) });
    assert.equal(client.readText('missing'), null, '缺失键返回 null');
    client.writeText('k', '中文\n值');
    assert.equal(client.readText('k'), '中文\n值', '本地读写保持文本');
    client.remove('k');
    assert.equal(client.readText('k'), null, '删除只删指定键');
  }

  {
    const calls = [];
    const first = deferred();
    const client = createClient({
      storage: memoryStorage(),
      apiBase: '/api',
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        if (calls.length === 1) return first.promise;
        return response({ ok: true, n: 1 });
      }
    });
    const payload = { rows: [1] };
    const p1 = client.putQueued('/labs', payload);
    const p2 = client.putQueued('/labs', { rows: [2] });
    payload.rows.push(99);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, 1, '前一次未完成时不能并发发出后一次写入');
    assert.equal(calls[0].url, '/api/labs');
    assert.equal(calls[0].init.body, '{"rows":[1]}', '入队时固定数据快照');
    first.resolve(response({ ok: true }));
    await p1;
    await p2;
    assert.equal(calls.length, 2, '第一次完成后才发送第二次');
    assert.equal(calls[1].init.body, '{"rows":[2]}', '写入顺序与调用顺序一致');
    await client.idle();
  }

  {
    let n = 0;
    const client = createClient({
      storage: memoryStorage(),
      fetchImpl: async () => {
        n++;
        return n === 1 ? response({ ok: false, error: '失败' }) : response({ ok: true });
      }
    });
    await assert.rejects(client.putQueued('/labs', []), /失败/, '业务错误必须拒绝本次写入');
    await client.putQueued('/labs', []);
    assert.equal(n, 2, '失败不能阻塞后续写入');
  }

  {
    const client = createClient({
      storage: memoryStorage(),
      fetchImpl: async () => response({ ok: false }, false, 500)
    });
    await assert.rejects(client.put('/state', {}), /HTTP 500/, 'HTTP 错误不能直接当成功');
  }

  {
    const client = createClient({
      storage: memoryStorage(),
      apiBase: '/api',
      ocrBase: 'http://127.0.0.1:8765',
      fetchImpl: async url => response({ ok: true, url })
    });
    assert.equal(client.apiUrl('/export'), '/api/export');
    const res = await client.ocr('/ping', {}, 10);
    assert.equal((await res.json()).url, 'http://127.0.0.1:8765/ping', 'OCR 与数据 API 地址分离');
  }

  console.log('全部通过：存储适配器 5 组测试');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
