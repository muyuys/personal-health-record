/* Tab-scoped member selection; installed before core storage and derived data. */
'use strict';
const MEMBER_ID = new URL(location.href).searchParams.get('member') || 'default';
const memberFetch = window.fetch.bind(window);
const memberWrites = new Set();
window.fetch = function(input, init = {}) {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  const apiOrigin = location.protocol === 'file:' ? 'http://127.0.0.1:8765' : location.origin;
  if (url.origin === apiOrigin && url.pathname.startsWith('/api/')) {
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('X-Health-Profile', MEMBER_ID);
    init = { ...init, headers };
  }
  const promise = memberFetch(input, init);
  if (url.origin === apiOrigin && url.pathname.startsWith('/api/') && /PUT|POST/.test(init.method || 'GET')) {
    memberWrites.add(promise);
    promise.finally(() => memberWrites.delete(promise)).catch(() => {});
  }
  return promise;
};
if (MEMBER_ID !== 'default') {
  ARCHIVE.issues = [];
  ARCHIVE.timeline = [];
  ARCHIVE.todos = [];
  ARCHIVE.weight = {};
  ARCHIVE.meds = { current: [], history: [], note: '' };
  for (const key of Object.keys(ARCHIVE.profile)) {
    if (key !== 'fields') ARCHIVE.profile[key] = null;
  }
  ARCHIVE.profile.fields = ARCHIVE.profile.fields.map(f => ({ k: f.k, v: '未记录', ok: false }));
}
