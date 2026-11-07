'use strict';
let memberList = [];
let aiBusy = false;
let aiSelectedModel = '';
let aiModelPickerClose = null;
let aiArchiveClose = null;

function shortModelName(id) {
  return String(id || '选择模型').split('/').pop().replace(/^glm-/i, 'GLM ').replace(/^gpt-/i, 'GPT ').replace(/^deepseek-/i, 'DeepSeek ').replace(/-flash$/i, ' Flash');
}
function compactModelPicker(status, catalog) {
  return `<div class="ai-compose-tools"><div class="ai-model-picker"><button id="aiModelButton" class="ai-model-trigger" type="button" aria-label="选择对话模型" aria-haspopup="dialog" aria-expanded="false" aria-controls="aiModelMenu" ${!status.configured || aiBusy ? 'disabled' : ''}><span id="aiModelShort">${esc(shortModelName(aiSelectedModel))}</span><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5"/></svg></button><select id="aiModel" hidden tabindex="-1" aria-hidden="true" ${!status.configured || aiBusy ? 'disabled' : ''}>${modelOptions(catalog, aiSelectedModel)}</select><div id="aiModelMenu" class="ai-model-menu" role="dialog" aria-label="选择对话模型" hidden><label class="ai-model-search">${I.search}<input id="aiModelSearch" type="search" role="combobox" aria-label="搜索模型或提供方" aria-autocomplete="list" aria-expanded="false" aria-controls="aiModelList" placeholder="搜索模型或提供方" autocomplete="off"></label><div id="aiModelList" class="ai-model-list" role="listbox" aria-label="可用对话模型"></div><p id="aiModelCount" class="ai-model-count" role="status"></p></div></div><button id="aiModelRefresh" class="ai-refresh" type="button" aria-label="刷新模型列表" title="刷新模型列表" ${!status.configured || aiBusy ? 'disabled' : ''}><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M15.5 7.5A6 6 0 1 0 16 12M15.5 3v4.5H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>`;
}

function bindModelPicker(initialCatalog) {
  aiModelPickerClose?.();
  let catalog = initialCatalog, active = 0, visible = [], controller;
  const root = $('.ai-model-picker'), trigger = $('#aiModelButton'), select = $('#aiModel');
  const menu = $('#aiModelMenu'), search = $('#aiModelSearch'), list = $('#aiModelList');
  const close = (restoreFocus = false) => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    search.setAttribute('aria-expanded', 'false');
    search.removeAttribute('aria-activedescendant');
    controller?.abort();
    if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
  };
  aiModelPickerClose = () => close();
  const position = () => {
    if (menu.hidden) return;
    const viewport = window.visualViewport;
    const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    const rect = trigger.getBoundingClientRect(), gap = 8, edge = 12;
    const above = rect.top - y - edge - gap, below = y + height - rect.bottom - edge - gap;
    const upwards = above > below;
    menu.style.width = Math.min(380, width - edge * 2) + 'px';
    menu.style.maxHeight = Math.min(400, height - edge * 2, Math.max(120, upwards ? above : below)) + 'px';
    const box = menu.getBoundingClientRect();
    menu.style.left = Math.max(x + edge, Math.min(rect.left, x + width - box.width - edge)) + 'px';
    menu.style.top = Math.max(y + edge, Math.min(upwards ? rect.top - gap - box.height : rect.bottom + gap, y + height - box.height - edge)) + 'px';
  };
  const highlight = (index, scroll = false) => {
    active = Math.max(0, Math.min(index, visible.length - 1));
    list.querySelectorAll('[role=option]').forEach((option, i) => option.classList.toggle('is-active', i === active));
    const option = list.querySelector('[role=option].is-active');
    if (option) {
      search.setAttribute('aria-activedescendant', option.id);
      if (scroll) option.scrollIntoView({ block: 'nearest' });
    } else search.removeAttribute('aria-activedescendant');
  };
  const paint = () => {
    const query = search.value.trim().toLowerCase();
    visible = catalog.models.filter(model => `${model.id} ${model.provider}`.toLowerCase().includes(query));
    const groups = new Map();
    visible.forEach((model, index) => {
      if (!groups.has(model.provider)) groups.set(model.provider, []);
      groups.get(model.provider).push({ model, index });
    });
    visible = [...groups.values()].flat().map((entry, index) => { entry.index = index; return entry.model; });
    list.innerHTML = visible.length ? [...groups].map(([provider, models], group) => `<div role="group" aria-labelledby="aiModelGroup${group}"><p class="ai-model-provider" id="aiModelGroup${group}">${esc(provider)}</p>${models.map(({ model, index }) => `<div id="aiModelOption${index}" class="ai-model-option" role="option" aria-selected="${model.id === select.value}" data-model-index="${index}"><span class="ai-model-name">${esc(model.id)}</span>${model.id === catalog.defaultModel ? '<span class="ai-model-default">默认</span>' : ''}<span class="ai-model-check" aria-hidden="true">${model.id === select.value ? I.check2 : ''}</span></div>`).join('')}</div>`).join('') : '<p class="ai-model-empty">没有匹配的模型</p>';
    $('#aiModelCount').textContent = query ? `${visible.length} 个匹配模型` : `${visible.length} 个可用模型`;
    highlight(Math.max(0, visible.findIndex(model => model.id === select.value)));
    position();
  };
  const sync = () => {
    $('#aiModelShort').textContent = shortModelName(select.value);
    trigger.title = select.value;
    trigger.setAttribute('aria-label', `选择对话模型，当前 ${select.value || '未选择'}`);
    trigger.disabled = select.disabled || !catalog.models.length;
    if (!menu.hidden) paint();
  };
  const choose = index => {
    if (!visible[index] || select.disabled) return;
    select.value = visible[index].id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    close(true);
  };
  const open = () => {
    if (trigger.disabled) return;
    aiArchiveClose?.();
    search.value = '';
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    search.setAttribute('aria-expanded', 'true');
    paint();
    highlight(active, true);
    search.focus({ preventScroll: true });
    controller = new AbortController();
    const options = { signal: controller.signal };
    document.addEventListener('pointerdown', e => { if (!root.contains(e.target)) close(); }, options);
    document.addEventListener('focusin', e => { if (!root.contains(e.target)) close(); }, options);
    window.addEventListener('resize', position, options);
    document.addEventListener('scroll', position, { ...options, capture: true });
    window.visualViewport?.addEventListener('resize', position, options);
    window.visualViewport?.addEventListener('scroll', position, options);
  };
  trigger.addEventListener('click', () => menu.hidden ? open() : close(true));
  trigger.addEventListener('keydown', e => {
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); open(); }
  });
  search.addEventListener('input', paint);
  search.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close(true);
    else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
    else if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault(); highlight((active + (e.key === 'ArrowDown' ? 1 : -1) + visible.length) % Math.max(1, visible.length), true);
    } else if (!search.value && ['Home', 'End'].includes(e.key)) {
      e.preventDefault(); highlight(e.key === 'Home' ? 0 : visible.length - 1, true);
    }
  });
  list.addEventListener('pointermove', e => {
    const option = e.target.closest('[data-model-index]');
    if (option) highlight(Number(option.dataset.modelIndex));
  });
  list.addEventListener('click', e => {
    const option = e.target.closest('[data-model-index]');
    if (option) choose(Number(option.dataset.modelIndex));
  });
  select.addEventListener('change', sync);
  sync();
  return {
    update(nextCatalog) { catalog = nextCatalog; sync(); },
    disable(disabled) { select.disabled = disabled; sync(); if (disabled) close(); }
  };
}

function modelOptions(catalog, selected) {
  const groups = new Map();
  catalog.models.forEach(model => {
    if (!groups.has(model.provider)) groups.set(model.provider, []);
    groups.get(model.provider).push(model);
  });
  return [...groups].map(([provider, models]) => `<optgroup label="${esc(provider)}">${models.map(model =>
    `<option value="${esc(model.id)}" ${model.id === selected ? 'selected' : ''}>${esc(model.id)}${model.id === catalog.defaultModel ? ' · 默认' : ''}</option>`).join('')}</optgroup>`).join('');
}

async function featureAPI(path, body) {
  const response = await fetch(API + path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '操作失败');
  return data;
}
function activeMemberName() {
  return (memberList.find(p => p.id === MEMBER_ID) || {}).name || (MEMBER_ID === 'default' ? '我的档案' : '成员档案');
}
async function initMembers() {
  try {
    memberList = (await featureAPI('/profiles')).profiles;
    if (!memberList.some(p => p.id === MEMBER_ID)) throw new Error('当前成员不存在，请到成员管理选择有效档案');
    const subtitle = document.querySelector('.brand-t > span');
    if (subtitle) subtitle.textContent = activeMemberName();
  } catch (error) { toast(error.message); }
}

async function switchMember(target, options = {}) {
  if (target === MEMBER_ID) return;
  if (!memberList.some(member => member.id === target)) { toast('成员不存在，请刷新后重试'); return; }
  if ((visitComposer || reportComposer) && (composerDirty() || reportDirty())) {
    toast('请先保存或取消当前编辑，再切换成员');
    return;
  }
  await Promise.allSettled([...memberWrites]);
  if (syncBad) { toast('有记录尚未保存，请处理存储错误后再切换'); return; }
  const url = new URL(location.href);
  if (target === 'default') url.searchParams.delete('member');
  else url.searchParams.set('member', target);
  // stay：留在当前路由（问答页切换档案后还要接着问）；其余入口回到首页
  url.hash = options.stay ? (location.hash || '#/home') : '#/home';
  location.assign(url.href);
}

/* 问答只作用于一个档案：切换＝整页重载（连同数据库），
   不做前端局部替换，避免两个档案的记录出现在同一屏。 */
function archivePickerHTML() {
  const name = activeMemberName();
  return `<div class="ai-archive"><button id="aiArchiveButton" class="ai-archive-trigger" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="aiArchiveMenu" aria-label="切换健康档案，当前 ${esc(name)}" title="切换健康档案"><span class="ai-archive-avatar" aria-hidden="true">${esc(Array.from(name)[0] || '档')}</span><span class="ai-archive-name">${esc(name)}</span><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5"/></svg></button><div id="aiArchiveMenu" class="ai-archive-menu" role="dialog" aria-label="切换健康档案" hidden></div></div>`;
}

function bindArchivePicker() {
  aiArchiveClose?.();
  const trigger = $('#aiArchiveButton'), menu = $('#aiArchiveMenu');
  if (!trigger || !menu) return;
  let adding = false, saving = false, controller;
  const close = (restoreFocus = false) => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    controller?.abort();
    controller = undefined;
    aiArchiveClose = () => {};
    if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
  };
  /* 触发器在页面底部，弹层一律向上；空间不够时才压回视口内 */
  const position = () => {
    if (menu.hidden) return;
    const viewport = window.visualViewport;
    const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    const rect = trigger.getBoundingClientRect(), gap = 8, edge = 12;
    menu.style.width = Math.min(330, width - edge * 2) + 'px';
    menu.style.maxHeight = Math.min(460, height - edge * 2) + 'px';
    const box = menu.getBoundingClientRect();
    menu.style.left = Math.max(x + edge, Math.min(rect.left, x + width - box.width - edge)) + 'px';
    menu.style.top = Math.max(y + edge, Math.min(rect.top - gap - box.height, y + height - box.height - edge)) + 'px';
  };
  const paint = (focus = false) => {
    menu.innerHTML = adding
      ? `<div class="ai-archive-form" id="archiveForm"><p class="ai-archive-form-title">新增档案</p><label>称呼<input name="name" required maxlength="60" placeholder="如：父亲" autocomplete="off"></label><label>与我的关系<input name="relation" maxlength="40" placeholder="如：本人、父亲" autocomplete="off"></label><p class="ai-archive-hint">新档案空白开始，记录与问答都不与现有档案共享。</p><div class="ai-archive-form-foot"><button type="button" class="btn btn-mini" data-archive-back>返回</button><button type="button" class="btn btn-mini btn-primary" data-archive-create>创建</button></div></div>`
      : `<p class="ai-archive-hint">每个档案各自独立：提问只读这一个档案的记录，不与其他档案混在一起。</p><ul class="ai-archive-list" aria-label="健康档案">${memberList.map(member => `<li><button type="button" class="ai-archive-member" data-archive-switch="${esc(member.id)}" data-archive-name="${esc(member.name)}" ${member.id === MEMBER_ID ? 'aria-current="true"' : ''}><span class="ai-archive-avatar" aria-hidden="true">${esc(Array.from(member.name)[0] || '档')}</span><span class="ai-archive-member-text"><b>${esc(member.name)}</b><small>${esc(member.relation || '关系未填写')}${member.id === MEMBER_ID ? ' · 当前' : ''}</small></span>${member.id === MEMBER_ID ? `<span class="ai-archive-check" aria-hidden="true">${I.check2}</span>` : ''}</button></li>`).join('')}</ul><div class="ai-archive-foot"><button type="button" class="ai-archive-action" data-archive-add>${I.plus}新增档案</button><a class="ai-archive-action" href="#/members" data-archive-manage>${I.user}管理成员</a></div>`;
    position();
    if (focus) (adding ? menu.querySelector('input') : menu.querySelector('[aria-current="true"]') || menu.querySelector('button'))?.focus({ preventScroll: true });
  };
  /* 弹层在 #aiForm 内部，不能再用 <form>（嵌套表单会被浏览器丢弃），改用按钮触发 */
  const createArchive = async () => {
    if (saving) return;
    const nameInput = menu.querySelector('#archiveForm input[name=name]');
    const values = {
      name: (nameInput?.value || '').trim(),
      relation: (menu.querySelector('#archiveForm input[name=relation]')?.value || '').trim()
    };
    if (!values.name) { $('#aiArchiveStatus').textContent = '请填写成员称呼'; nameInput?.focus(); return; }
    saving = true;
    menu.querySelectorAll('button').forEach(button => { button.disabled = true; });
    $('#aiArchiveStatus').textContent = '正在创建档案…';
    try {
      await featureAPI('/profiles', values);
      await initMembers();
      if (!trigger.isConnected) return;
      adding = false;
      paint(false);
      $('#aiArchiveStatus').textContent = '档案已创建，选择它即可切换';
    } catch (error) {
      if (trigger.isConnected) {
        $('#aiArchiveStatus').textContent = error.message;
        menu.querySelectorAll('button').forEach(button => { button.disabled = false; });
      }
    } finally { saving = false; }
  };
  const open = () => {
    if (!menu.hidden) { close(true); return; }
    aiModelPickerClose?.();
    controller = new AbortController();
    const options = { signal: controller.signal };
    aiArchiveClose = () => close();
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    paint(true);
    menu.addEventListener('click', async e => {
      if (e.target.closest('[data-archive-add]')) { adding = true; paint(true); return; }
      if (e.target.closest('[data-archive-back]') && !saving) { adding = false; paint(true); return; }
      if (e.target.closest('[data-archive-create]')) { createArchive(); return; }
      if (e.target.closest('[data-archive-manage]')) { close(); return; }
      const button = e.target.closest('[data-archive-switch]');
      if (!button || button.disabled) return;
      const target = button.dataset.archiveSwitch;
      if (target === MEMBER_ID) { close(true); return; }
      const draft = $('#aiQuestion')?.value.trim();
      if (draft && !confirm(`「${button.dataset.archiveName}」是另一个独立档案。切换会离开当前对话，输入框里未发送的问题不会保留。继续？`)) return;
      button.disabled = true;
      $('#aiArchiveStatus').textContent = `正在切换到「${button.dataset.archiveName}」…`;
      try { await switchMember(target, { stay: true }); }
      catch (error) { if (trigger.isConnected) { button.disabled = false; $('#aiArchiveStatus').textContent = error.message; } }
    }, options);
    menu.addEventListener('submit', e => e.preventDefault(), options);
    menu.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === 'Enter' && e.target.closest('#archiveForm') && e.target.tagName === 'INPUT') {
        e.preventDefault();
        createArchive();
      }
    }, options);
    document.addEventListener('pointerdown', e => { if (!menu.contains(e.target) && !trigger.contains(e.target)) close(); }, options);
    window.addEventListener('resize', position, options);
    document.addEventListener('scroll', position, { ...options, capture: true });
    window.visualViewport?.addEventListener('resize', position, options);
  };
  trigger.addEventListener('click', open);
}

async function renderMembers() {
  const scroll = hashQuery().get('scroll');
  if (['aiConnection', 'mcpConnection'].includes(scroll)) { goHash('#/settings?scroll=' + scroll); return; }
  setHead('家庭健康档案', '成员管理', '每位成员独立保存记录、报告、问答和备份。', '<a class="btn" href="#/settings">设置</a>', false);
  $('#view').innerHTML = '<p role="status">正在读取成员…</p>';
  try {
    const members = await featureAPI('/profiles');
    if (currentPage() !== 'members') return;
    memberList = members.profiles;
    $('#view').innerHTML = `<div class="feature-settings">
      <section><div><h2>家庭成员</h2><p>当前正在查看：${esc(activeMemberName())}。这是同一台电脑上的家庭档案，成员切换不提供独立账户登录。</p></div><div class="feature-panel">
      <ul class="member-list">${memberList.map(p => `<li><span><b>${esc(p.name)}</b><small>${esc(p.relation || '关系未填写')}</small></span><div class="member-row-actions">${p.id !== MEMBER_ID ? `<button class="btn btn-mini" data-member-switch="${esc(p.id)}">切换档案</button>` : '<span class="member-current-label">当前档案</span>'}<button class="btn btn-mini" data-member-edit="${esc(p.id)}">编辑</button></div></li>`).join('')}</ul>
      <form id="memberForm"><h3 id="memberFormTitle">添加成员</h3><input type="hidden" name="id"><label>称呼<input name="name" required maxlength="60" placeholder="填写成员称呼"></label><label>与我的关系<input name="relation" maxlength="40" placeholder="如：本人、父亲、母亲"></label><button class="btn btn-primary" type="submit">保存成员</button><button class="btn" type="reset">取消编辑</button><p role="status" id="memberStatus"></p></form>
      </div></section>
    </div>`;
    $$('[data-member-switch]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try { await switchMember(button.dataset.memberSwitch); }
      finally { button.disabled = false; }
    }));
    $('#memberForm').addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.currentTarget;
      const button = form.querySelector('[type=submit]');
      button.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(form));
        if (!values.id) delete values.id;
        await featureAPI('/profiles', values);
        await initMembers();
        await renderMembers();
        toast('成员已保存');
      } catch (error) { $('#memberStatus').textContent = error.message; button.disabled = false; }
    });
    $('#memberForm').addEventListener('reset', () => { $('#memberFormTitle').textContent = '添加成员'; });
    $$('[data-member-edit]').forEach(button => button.addEventListener('click', () => {
      const p = memberList.find(p => p.id === button.dataset.memberEdit);
      const form = $('#memberForm');
      form.elements.id.value = p.id;
      form.elements.name.value = p.name;
      form.elements.relation.value = p.relation;
      $('#memberFormTitle').textContent = '编辑成员';
      form.elements.name.focus();
    }));
    applyScrollTarget();
  } catch (error) { if (currentPage() === 'members') $('#view').textContent = error.message; }
}

const SETTINGS_GROUPS = [
  { id: 'general', label: '常规', group: '应用', icon: 'settings', search: '平台 地址 url 成员 档案 常规' },
  { id: 'models', label: '模型连接', group: '服务', icon: 'pulse', search: 'ai api key 密钥 模型 magpie 代理' },
  { id: 'mcp', label: 'MCP', group: '服务', icon: 'grid', search: 'mcp agent 配置 工具 复制' },
  { id: 'about', label: '关于', group: '应用信息', icon: 'info', search: '版本 更新 关于 version' }
];
function aboutContents(release) {
  return `<div class="about-page"><section class="about-product"><div><h2>健康档案</h2><p>整理个人与家庭的健康记录，保留每份报告与每一次变化。</p></div><dl><dt>当前版本</dt><dd id="appVersion">v${esc(release.version)}</dd><dt>发布日期</dt><dd>${esc(release.releasedAt)}</dd></dl></section><section class="about-history"><h2>版本记录</h2>${release.history.map(item => `<article><header><h3>v${esc(item.version)}</h3><time>${esc(item.date)}</time></header><p>${esc(item.title)}</p><ul>${item.changes.map(change => `<li>${esc(change)}</li>`).join('')}</ul></article>`).join('')}</section><p class="about-note">健康信息用于记录与整理，不能替代医生诊断。档案保存在本机；AI 功能按设置连接模型服务。</p></div>`;
}
async function renderSettings() {
  setHead('应用', '设置', '', '', false);
  $('#view').innerHTML = '<p role="status">正在读取设置…</p>';
  try {
    const [connection, config, release] = await Promise.all([
      featureAPI('/ai/config'), featureAPI('/mcp/config'),
      fetch('assets/release.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);
    if (currentPage() !== 'settings') return;
    const platformURL = (location.protocol === 'file:' ? OCR_URL : location.origin) + '/';
    const navigation = [...new Set(SETTINGS_GROUPS.map(item => item.group))].map(group => `<div class="settings-nav-group"><p>${esc(group)}</p>${SETTINGS_GROUPS.filter(item => item.group === group).map(item => `<a href="#/settings?section=${item.id}" data-settings-group="${item.id}" data-settings-search="${esc(item.label + ' ' + item.search)}">${I[item.icon] || I.info}<span>${esc(item.label)}</span></a>`).join('')}</div>`).join('');
    $('#view').innerHTML = `<div class="settings-layout"><aside class="settings-sidebar"><h2>设置</h2><label class="settings-search">${I.search}<input id="settingsSearch" type="search" placeholder="搜索设置" aria-label="搜索设置"></label><nav aria-label="设置分类">${navigation}</nav><p id="settingsSearchEmpty" hidden>没有匹配的设置</p></aside><div class="settings-content">
      <section class="settings-panel" data-settings-panel="general" id="platformLinks"><header class="settings-panel-head"><h2>常规</h2><p>应用访问与档案管理。</p></header><h3 class="settings-section-title">应用</h3><div class="settings-card"><div class="setting-row setting-address"><div><b>平台地址</b><p>本机健康档案的访问地址。</p></div><a class="setting-value" href="${esc(platformURL)}">${esc(platformURL)}</a></div><div class="setting-row"><div><b>成员管理</b><p>添加家庭成员或切换当前查看的档案。</p></div><a class="settings-action" href="#/members">管理 ${I.chevron}</a></div><div class="setting-row"><div><b>个人资料</b><p>查看与完善当前成员的基础信息。</p></div><a class="settings-action" href="#/me">查看 ${I.chevron}</a></div></div><h3 class="settings-section-title">使用范围</h3><div class="settings-card"><div class="setting-row"><div><b>模型与 MCP 连接</b><p>所有成员共用应用连接，健康记录按成员独立保存。</p></div><span class="setting-value">应用级设置</span></div></div></section>
      <section class="settings-panel" data-settings-panel="models" id="aiConnection" hidden><header class="settings-panel-head"><h2>模型连接</h2><p>选择用于 AI 对话与报告解析的服务。</p></header><h3 class="settings-section-title">模型服务</h3><form id="aiConnectionForm"><div class="settings-card"><label class="setting-row"><span><b>连接方式</b><small>默认使用 Magpie，也可接入自己的 API。</small></span><select name="mode" id="aiConnectionMode"><option value="magpie" ${connection.mode === 'magpie' ? 'selected' : ''}>Magpie（默认）</option><option value="custom" ${connection.mode === 'custom' ? 'selected' : ''}>自定义 API</option></select></label><div id="magpieConnection" ${connection.mode !== 'magpie' ? 'hidden' : ''}><div class="setting-row setting-address"><div><b>服务地址</b><p>通过本机 Magpie 转发请求。</p></div><span class="setting-value">${esc(connection.magpie.endpoint)}</span></div><div class="setting-row"><b>默认模型</b><span class="setting-value">${esc(connection.magpie.model)}</span></div></div><div id="customConnection" ${connection.mode !== 'custom' ? 'hidden' : ''}><label class="setting-row setting-field"><span><b>API 地址</b><small>基础 URL 或完整的 /chat/completions 地址。</small></span><input name="endpoint" type="url" maxlength="2048" value="${esc(connection.custom.endpoint)}" placeholder="https://api.example.com/v1" autocomplete="off"></label><label class="setting-row setting-field"><span><b>API 密钥</b><small>仅保存在本机，留空保留已保存的密钥。</small></span><input name="apiKey" type="password" maxlength="8192" placeholder="${connection.custom.keySet ? '已保存密钥，留空则保留' : '输入 API Key'}" autocomplete="new-password"></label><label class="setting-row"><span><b>清除密钥</b><small>保存时删除已保存的密钥。</small></span><input name="clearKey" type="checkbox"></label><label class="setting-row setting-field"><span><b>默认模型</b><small>填写支持图片输入的模型 ID。</small></span><input name="model" maxlength="200" value="${esc(connection.custom.model)}" placeholder="模型 ID" autocomplete="off"></label></div></div><p class="settings-help">兼容 Chat Completions 格式。相关记录与报告图片会发送到所选服务；Magpie 会继续转发至上游模型。</p><div class="settings-form-footer"><p id="aiConnectionStatus" role="status"></p><a class="settings-text-link" href="#/assistant">进入 AI 对话</a><button class="btn btn-primary" type="submit">保存连接</button></div></form></section>
      <section class="settings-panel" data-settings-panel="mcp" id="mcpConnection" hidden><header class="settings-panel-head"><h2>MCP</h2><p>让 agent 读取档案与管理记录。</p></header><h3 class="settings-section-title">本机连接</h3><div class="settings-card"><div class="setting-row"><div><b>连接方式</b><p>先启动健康档案，再将配置添加到 MCP 客户端。</p></div><span class="setting-value">stdio</span></div><div class="setting-row"><div><b>操作范围</b><p>记录操作必须指定成员 ID，修改后刷新页面查看。</p></div><span class="setting-value">按成员操作</span></div></div><h3 class="settings-section-title">客户端配置</h3><div class="settings-card settings-code-card"><div class="setting-row"><b>MCP 服务器配置</b><button class="settings-action" type="button" id="copyMcpConfig">复制配置 ${I.download}</button></div><pre class="connection-code" id="mcpConfig"></pre></div><p id="mcpCopyStatus" class="settings-help" role="status"></p><p class="settings-help">凭证由本机桥接程序自动读取，密钥不会显示在配置中。</p></section>
      <section class="settings-panel" data-settings-panel="about" hidden><header class="settings-panel-head"><h2>关于</h2><p>健康档案的版本信息与更新记录。</p></header>${release ? aboutContents(release) : '<p role="status">版本信息暂时不可用，请刷新页面重试。</p>'}</section>
    </div></div>`;
    document.querySelector('.settings-sidebar > h2').replaceWith(document.getElementById('pageTitle'));
    $('#mcpConfig').textContent = JSON.stringify(config, null, 2);
    $('#copyMcpConfig').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(JSON.stringify(config, null, 2)); if ($('#mcpCopyStatus')) $('#mcpCopyStatus').textContent = '配置已复制'; }
      catch (_) { if ($('#mcpCopyStatus')) $('#mcpCopyStatus').textContent = '未能复制，请选中上方配置手动复制'; }
    });
    const connectionForm = $('#aiConnectionForm');
    const syncConnectionFields = () => {
      const custom = connectionForm.elements.mode.value === 'custom';
      $('#customConnection').hidden = !custom;
      $('#magpieConnection').hidden = custom;
      connectionForm.elements.endpoint.required = custom;
      connectionForm.elements.model.required = custom;
      connectionForm.elements.endpoint.disabled = !custom;
      connectionForm.elements.apiKey.disabled = !custom;
      connectionForm.elements.model.disabled = !custom;
    };
    connectionForm.addEventListener('change', syncConnectionFields);
    syncConnectionFields();
    connectionForm.addEventListener('submit', async e => {
      e.preventDefault();
      const button = connectionForm.querySelector('[type=submit]');
      button.disabled = true;
      $('#aiConnectionStatus').textContent = '正在保存连接…';
      try {
        const custom = connectionForm.elements.mode.value === 'custom';
        const saved = await featureAPI('/ai/config', {
          mode: connectionForm.elements.mode.value,
          ...(custom ? { custom: { endpoint: connectionForm.elements.endpoint.value,
            model: connectionForm.elements.model.value, key: connectionForm.elements.apiKey.value,
            clearKey: connectionForm.elements.clearKey.checked } } : {})
        });
        if (currentPage() !== 'settings') return;
        aiSelectedModel = '';
        connectionForm.elements.apiKey.value = '';
        connectionForm.elements.apiKey.placeholder = saved.custom.keySet ? '已保存密钥，留空则保留' : '输入 API Key，本机接口可留空';
        connectionForm.elements.endpoint.value = saved.custom.endpoint;
        connectionForm.elements.clearKey.checked = false;
        $('#aiConnectionStatus').textContent = '连接已保存，立即生效';
      } catch (error) { if (currentPage() === 'settings') $('#aiConnectionStatus').textContent = error.message; }
      finally { button.disabled = false; }
    });

    const activateGroup = (id, updateURL = false) => {
      if (!SETTINGS_GROUPS.some(item => item.id === id)) id = 'general';
      $$('[data-settings-panel]').forEach(panel => { panel.hidden = panel.dataset.settingsPanel !== id; });
      $$('[data-settings-group]').forEach(link => {
        const active = link.dataset.settingsGroup === id;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      });
      if (updateURL) {
        history.replaceState(null, '', '#/settings?section=' + id);
        $('.settings-content').scrollTop = 0;
      }
    };
    $$('[data-settings-group]').forEach(link => link.addEventListener('click', e => {
      e.preventDefault();
      activateGroup(link.dataset.settingsGroup, true);
    }));
    $('#settingsSearch').addEventListener('input', e => {
      const query = e.target.value.trim().toLowerCase();
      $$('[data-settings-search]').forEach(link => { link.hidden = !link.dataset.settingsSearch.toLowerCase().includes(query); });
      $$('.settings-nav-group').forEach(group => { group.hidden = !Array.from(group.querySelectorAll('[data-settings-search]')).some(link => !link.hidden); });
      $('#settingsSearchEmpty').hidden = $$('[data-settings-search]').some(link => !link.hidden);
    });
    const params = hashQuery();
    const legacyGroup = { aiConnection: 'models', mcpConnection: 'mcp', platformLinks: 'general' }[params.get('scroll')];
    activateGroup(params.get('section') || legacyGroup || 'general');
  } catch (error) { if (currentPage() === 'settings') $('#view').textContent = error.message; }
}

function renderAbout() { goHash('#/settings?section=about'); }

const AI_SOURCE_TARGETS = { labs: 'labs-all', reports: 'records?t=report', visits: 'records?t=visit', medications: 'records?t=med',
  vitals: 'daily?seg=vitals', symptoms: 'daily?seg=symptoms', weights: 'daily?seg=body', profile: 'me',
  allergies: 'me', familyHistory: 'me', surgeries: 'me', todoItems: 'todos' };
const AI_SOURCE_KINDS = { labs: '检验', reports: '报告', visits: '就诊', medications: '用药', allergies: '过敏',
  familyHistory: '家族史', surgeries: '手术', vitals: '体征', symptoms: '症状', weights: '体重', body: '围度',
  sleepLogs: '睡眠', dietDays: '饮食', dietWeeks: '饮食周记', todoItems: '待办', profile: '个人资料', document: '文档' };
const AI_FIELD_LABELS = { date: '日期', value: '数值', unit: '单位', low: '下限', high: '上限', category: '类别',
  name: '项目', title: '标题', panel: '组套', specimen: '标本', hospital: '机构', kg: '体重', bmi: 'BMI',
  part: '部位', score: '分级', waist: '腰围', chest: '胸围', hip: '臀围', dose: '剂量', freq: '频次',
  relation: '关系', note: '备注', status: '状态', weekStart: '周起', startDate: '起始', text: '内容', summary: '小结' };
const AI_FIELD_ORDER = { labs: ['value', 'unit', 'low', 'high', 'category'], vitals: ['value', 'unit', 'low', 'high'],
  reports: ['panel', 'specimen', 'hospital'], weights: ['kg', 'bmi'], body: ['waist', 'chest', 'hip'],
  medications: ['dose', 'freq'], visits: ['hospital', 'department'], symptoms: ['part', 'score'], todoItems: ['due'] };
function sourceFields(source) {
  const record = source.record;
  if (!record || typeof record !== 'object') return '';
  const order = AI_FIELD_ORDER[source.kind] || [];
  const keys = [...order.filter(k => k in record), ...Object.keys(record).filter(k => !order.includes(k))];
  const pairs = [];
  for (const key of keys) {
    const value = record[key];
    if (key === 'id' || value === null || value === '' || typeof value === 'object') continue;
    const text = String(value);
    pairs.push([AI_FIELD_LABELS[key] || key, text.length > 48 ? text.slice(0, 48) + '…' : text]);
    if (pairs.length >= 4) break;
  }
  // 数值与单位、下限与上限各自合成一格，比「数值 2.3 · 单位 ng/L · 下限 0」省一半字
  const out = [];
  const take = label => { const i = pairs.findIndex(p => p[0] === label); return i < 0 ? null : pairs.splice(i, 1)[0][1]; };
  const value = take('数值'), unit = take('单位'), low = take('下限'), high = take('上限');
  if (value !== null) out.push(`<span><i>数值</i>${esc(value)}${unit ? ' ' + esc(unit) : ''}</span>`);
  else if (unit) out.push(`<span><i>单位</i>${esc(unit)}</span>`);
  if (low !== null || high !== null) out.push(`<span><i>参考</i>${esc(low ?? '—')}–${esc(high ?? '—')}</span>`);
  pairs.forEach(([label, text]) => out.push(`<span><i>${esc(label)}</i>${esc(text)}</span>`));
  return out.slice(0, 5).join('');
}
function sourceHTML(source) {
  const kind = AI_SOURCE_KINDS[source.kind] || source.kind || '记录';
  const fields = sourceFields(source);
  const link = source.kind === 'document' ? '' : `<a href="#/${AI_SOURCE_TARGETS[source.kind] || 'daily'}">查看对应记录</a>`;
  const meta = [source.imageProvided ? '已提供图片' : '', link].filter(Boolean).join('');
  return `<li class="ai-source"><div class="ai-source-head"><span class="ai-source-ref">${esc(source.ref)}</span><span class="ai-source-title">${esc([source.date, source.label].filter(Boolean).join(' · ') || '未标注日期')}</span><span class="ai-source-kind">${esc(kind)}</span></div>${fields ? `<p class="ai-source-fields">${fields}</p>` : ''}${meta ? `<p class="ai-source-meta">${meta}</p>` : ''}<details class="ai-source-raw"><summary>原始字段</summary><pre>${esc(JSON.stringify(source.record, null, 2))}</pre></details></li>`;
}
/* 对话样式：提问靠右气泡，回答纯文本排在页面底色上，顶部一行小字、底部一行操作 */
const AI_COPY_ICON = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5.6" y="5.6" width="7.4" height="7.4" rx="1.7" stroke="currentColor" stroke-width="1.3"/><path d="M10.4 5.6V4.2c0-.9-.7-1.7-1.7-1.7H4.2c-.9 0-1.7.7-1.7 1.7v4.5c0 .9.8 1.7 1.7 1.7h1.4" stroke="currentColor" stroke-width="1.3"/></svg>';
const aiPad = n => String(n).padStart(2, '0');
function aiClock(at) {
  const d = new Date(Number(at) || Date.now());
  return `${aiPad(d.getHours())}:${aiPad(d.getMinutes())}`;
}
function aiDay(at) {
  const d = new Date(Number(at) || Date.now());
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}年${md}`;
}
function aiElapsed(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
}
/* 斜杠指令只认「整条输入就是一个 /xxx」，避免正文里提到 /reset 被当成命令执行 */
const AI_COMMANDS = { reset: 'reset', clear: 'reset', '清空': 'reset' };
const AI_SUGGESTIONS = ['这个档案里有哪些数据？', '最近有哪些检验结果需要核对？', '帮我整理下次复诊需要带的资料。'];
function aiCommand(text) {
  const match = /^\/\s*([A-Za-z\u4e00-\u9fa5]+)\s*$/.exec(String(text || '').trim());
  return match ? AI_COMMANDS[match[1].toLowerCase()] || '' : '';
}
function aiEmptyHTML() {
  return `<div class="ai-empty"><h2>从一条健康记录开始</h2><p>问题里带上日期、指标或报告名称，回答会更准。</p><div class="ai-suggest">${AI_SUGGESTIONS.map(text => `<button class="ai-suggest-item" type="button" data-ai-suggest="${esc(text)}">${esc(text)}</button>`).join('')}</div><p class="ai-empty-hint">对话变长后输入 <code>/reset</code>，可清空这个档案已保存的问答记录。</p></div>`;
}
function aiNoticeHTML(text) {
  return `<p class="ai-notice" role="status"><span>${esc(text)}</span></p>`;
}
function chatHTML(message, elapsed) {
  const answer = window.MD ? MD.render(message.answer) : `<p>${esc(message.answer)}</p>`;
  const sources = message.sources || [];
  const meta = [message.model ? shortModelName(message.model) : '', elapsed ? `用时 ${aiElapsed(elapsed)}` : ''].filter(Boolean).join(' · ');
  return `<article class="ai-message" data-day="${aiDay(message.createdAt)}"><div class="ai-turn-user"><p class="ai-bubble">${esc(message.question)}</p></div><div class="ai-turn-ai">${meta ? `<p class="ai-turn-meta">${esc(meta)}</p>` : ''}<div class="ai-answer">${answer}</div>${sources.length ? `<details class="ai-evidence"><summary><span>检索来源 · ${sources.length} 条</span>${I.chevron}</summary><ol class="ai-source-list">${sources.map(sourceHTML).join('')}</ol></details>` : `<p class="ai-evidence-empty">本次未检索到可引用的记录。</p>`}<div class="ai-turn-foot"><button class="ai-act" type="button" data-copy="${esc(message.answer)}">${AI_COPY_ICON}复制</button><time>${aiClock(message.createdAt)}</time></div></div></article>`;
}
function pendingHTML(question) {
  return `<article class="ai-message is-pending" id="aiPending" data-day="${aiDay(Date.now())}"><div class="ai-turn-user"><p class="ai-bubble">${esc(question)}</p></div><div class="ai-turn-ai"><p class="ai-typing" role="status"><i></i><i></i><i></i><span>正在检索记录并整理</span></p></div></article>`;
}
/* 日期分隔只在跨天时插一条，避免每条消息都顶着日期 */
function aiDayDivider(at) {
  return `<p class="ai-day"><span>${aiDay(at)}</span></p>`;
}
function appendTurn(html, at) {
  const list = $('#aiMessages');
  if (list.lastElementChild?.dataset.day !== aiDay(at)) list.insertAdjacentHTML('beforeend', aiDayDivider(at));
  list.insertAdjacentHTML('beforeend', html);
}
async function renderAssistant() {
  setHead('当前档案 · ' + activeMemberName(), 'AI 健康问答', '结合已保存的健康记录整理信息，回答可核对来源。', '<a class="btn" href="#/settings?section=models">连接设置</a>', false);
  $('#view').innerHTML = '<p role="status">正在读取问答…</p>';
  try {
    const [status, history, initialCatalog] = await Promise.all([featureAPI('/ai/status'), featureAPI('/ai/history'), featureAPI('/ai/models')]);
    if (currentPage() !== 'assistant') return;
    let catalog = initialCatalog;
    if (!catalog.models.some(m => m.id === aiSelectedModel)) aiSelectedModel = status.model;
    let lastDay = '';
    const historyHTML = history.messages.length ? history.messages.map(message => {
      const day = aiDay(message.createdAt);
      const head = day === lastDay ? '' : aiDayDivider(message.createdAt);
      lastDay = day;
      return head + chatHTML(message);
    }).join('') : aiEmptyHTML();
    // 输入区放在 .ai-layout 之外、.ai-page 之内：粘在视口底部，滚到对话末尾再落回文档流
    $('#view').innerHTML = `<div class="ai-page"><div class="ai-layout"><section class="ai-conversation" aria-label="健康问答"><div id="aiMessages">${historyHTML}</div></section>
      <details class="ai-notes" ${window.matchMedia('(min-width:761px)').matches ? 'open' : ''}><summary><h2>依据与范围</h2>${I.chevron}</summary><div><p>只使用「${esc(activeMemberName())}」这一个档案的资料；其它档案的记录、报告和问答各自独立，不会互相检索。</p><p>记录为空表示当前档案未记录，不能当作没有症状或疾病。</p><p>来源包括检验、报告文字、就诊、用药及日常记录；每类最多检索 16 条，总长度有限。</p><p>问答记录只保存在本机这个档案里；想清空时在输入框输入 <code>/reset</code> 并回车，检验、报告等记录不受影响。</p><p>${esc(status.dataNotice)}</p><p>回答用于整理和复诊准备，不代替诊断，不作为自行调整用药的依据。</p></div></details></div>
      <div class="ai-composer"><form id="aiForm"><label class="ai-compose-label" for="aiQuestion">向当前档案提问</label><textarea id="aiQuestion" name="question" required maxlength="4000" rows="3" placeholder="例如：整理最近的检查记录，并注明来源"></textarea><div class="ai-send"><div class="ai-send-left">${archivePickerHTML()}${compactModelPicker(status, catalog)}</div><button class="btn btn-primary" type="submit" ${!status.configured || aiBusy ? 'disabled' : ''}>${aiBusy ? '正在整理…' : '提问'}</button></div><p id="aiStatus" class="ai-compose-status" role="status">${status.configured ? '' : '请先在连接设置中配置模型'}</p><p id="aiModelNotice" class="ai-compose-status" role="status" ${catalog.error ? '' : 'hidden'}>${esc(catalog.error)}</p><p id="aiArchiveStatus" class="ai-archive-status" role="status"></p></form></div></div>`;
    $('#aiModel').addEventListener('change', e => {
      aiSelectedModel = e.target.value;
      $('#aiModelShort').textContent = shortModelName(aiSelectedModel);
      $('#aiStatus').textContent = '';
    });
    const modelPicker = bindModelPicker(catalog);
    bindArchivePicker();
    $('#aiModelRefresh').addEventListener('click', async e => {
      const button = e.currentTarget;
      button.disabled = true;
      $('#aiModelNotice').hidden = false;
      $('#aiModelNotice').textContent = '正在刷新模型列表…';
      try {
        catalog = await featureAPI('/ai/models?refresh=1');
        if (currentPage() !== 'assistant') return;
        if (!catalog.models.some(m => m.id === aiSelectedModel)) aiSelectedModel = catalog.models[0]?.id || status.model;
        $('#aiModel').innerHTML = modelOptions(catalog, aiSelectedModel);
        modelPicker.update(catalog);
        $('#aiModelNotice').textContent = catalog.error || `已更新 ${catalog.models.length} 个图片模型`;
        $('#aiModelShort').textContent = shortModelName(aiSelectedModel);
        $('#aiStatus').textContent = '';
      } catch (error) { if (currentPage() === 'assistant') $('#aiModelNotice').textContent = error.message; }
      finally { button.disabled = false; }
    });
    const form = $('#aiForm'), button = form.querySelector('[type=submit]'), box = $('#aiQuestion');
    const configured = !!status.configured;
    /* 输入 /reset 时把按钮改成「执行」：清空历史不需要模型，没配模型也该能用 */
    function syncComposer() {
      if (aiBusy) return;
      const command = aiCommand(box.value);
      button.textContent = command ? '执行' : '提问';
      button.disabled = !command && !configured;
      const hint = $('#aiStatus');
      if (command) {
        hint.dataset.cmd = '1';
        hint.textContent = '按 Enter 执行：清空这个档案已保存的问答记录';
      } else if (hint.dataset.cmd) {
        delete hint.dataset.cmd;
        hint.textContent = '';
      }
    }
    async function resetConversation() {
      aiBusy = true;
      button.disabled = true;
      button.textContent = '正在清空…';
      modelPicker.disable(true);
      $('#aiModelRefresh').disabled = true;
      box.value = '';
      try {
        const result = await featureAPI('/ai/reset', {});
        if (currentPage() !== 'assistant' || !form.isConnected) return;
        const removed = Number(result.removed) || 0;
        // 只清当前成员的问答，记录与来源一并消失；检验、报告等资料不受影响
        $('#aiMessages').innerHTML = aiNoticeHTML(removed ? `已清空 ${removed} 条问答记录` : '这个档案还没有问答记录') + aiEmptyHTML();
        $('#aiMessages').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        if (currentPage() === 'assistant') $('#aiStatus').textContent = error.message;
      } finally {
        aiBusy = false;
        syncComposer();   // 清空后要顺带撤掉「按 Enter 执行」那行提示
        if (form.isConnected) {
          modelPicker.disable(false);
          $('#aiModelRefresh').disabled = false;
          button.textContent = '提问';
          button.disabled = !configured;
        }
      }
    }
    box.addEventListener('input', syncComposer);
    /* 输入框是多行文本，Enter 默认换行；只有整条内容是指令时才让 Enter 直接执行 */
    box.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      if (!aiCommand(box.value)) return;
      e.preventDefault();
      form.requestSubmit();
    });
    /* 复制回答原文；示例问题是清空后重插的，点击走委托 */
    $('#aiMessages').addEventListener('click', async e => {
      const suggest = e.target.closest('[data-ai-suggest]');
      if (suggest) {
        box.value = suggest.dataset.aiSuggest || '';
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
        syncComposer();
        return;
      }
      const button = e.target.closest('[data-copy]');
      if (!button) return;
      const text = button.dataset.copy || '';
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
        else {
          const box = document.createElement('textarea');
          box.value = text;
          box.setAttribute('readonly', '');
          box.style.cssText = 'position:fixed;left:-9999px;top:0';
          document.body.append(box);
          box.select();
          document.execCommand('copy');
          box.remove();
        }
        button.dataset.copied = '1';
        button.lastChild.textContent = '已复制';
        setTimeout(() => {
          if (!button.isConnected) return;
          delete button.dataset.copied;
          button.lastChild.textContent = '复制';
        }, 1600);
      } catch { $('#aiStatus').textContent = '复制失败，可手动选中回答内容'; }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (aiBusy) return;
      const question = box.value.trim();
      if (!question) return;
      if (aiCommand(question)) { await resetConversation(); return; }
      if (!configured) { $('#aiStatus').textContent = '请先在连接设置中配置模型'; return; }
      aiBusy = true;
      button.disabled = true;
      modelPicker.disable(true);
      $('#aiModelRefresh').disabled = true;
      button.textContent = '正在整理…';
      $('#aiStatus').textContent = '';
      $('.ai-empty')?.remove();
      appendTurn(pendingHTML(question), Date.now());
      box.value = '';
      $('#aiPending')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const startedAt = Date.now();
      try {
        const result = await featureAPI('/ai/chat', { question, model: aiSelectedModel });
        if (currentPage() !== 'assistant') return;
        const html = chatHTML(result, Date.now() - startedAt);
        const pending = $('#aiPending');
        if (pending) { pending.insertAdjacentHTML('beforebegin', html); pending.remove(); }
        else appendTurn(html, result.createdAt || Date.now());
        // 从回答开头读起，而不是停在末尾；滚动位置要扣除固定在底部的输入区
        $('#aiMessages').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('#aiStatus').textContent = '回答已保存';
      } catch (error) {
        $('#aiPending')?.remove();
        if (currentPage() !== 'assistant') return;
        $('#aiStatus').textContent = error.message;
        box.value = question;   // 提问内容留在输入框里，方便改一处再试
      } finally {
        aiBusy = false;
        syncComposer();
        if (form.isConnected) { modelPicker.disable(false); $('#aiModelRefresh').disabled = false; }
        if (currentPage() === 'assistant' && !form.isConnected) renderAssistant();
      }
    });
  } catch (error) { if (currentPage() === 'assistant') $('#view').textContent = error.message; }
}
