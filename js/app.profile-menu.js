'use strict';
let profileMenuState = null;

function closeProfileMenu(restoreFocus = false) {
  if (!profileMenuState) return;
  const { trigger, controller } = profileMenuState;
  controller.abort();
  $('#profileMenu').hidden = true;
  $$('[data-act="profile-menu"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
  profileMenuState = null;
  if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
}

function toggleProfileMenu(trigger) {
  if (profileMenuState?.trigger === trigger) { closeProfileMenu(true); return; }
  closeProfileMenu();
  aiModelPickerClose?.();
  clearTimeout(toastTimer);
  $('#toast').classList.remove('on');
  const menu = $('#profileMenu'), controller = new AbortController();
  const session = { trigger, controller, adding: false, saving: false };
  profileMenuState = session;
  trigger.setAttribute('aria-expanded', 'true');
  menu.hidden = false;
  const position = () => {
    if (profileMenuState !== session) return;
    if (!trigger.getClientRects().length) { closeProfileMenu(); return; }
    const viewport = window.visualViewport;
    const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    const rect = trigger.getBoundingClientRect(), desktop = innerWidth >= 960;
    menu.style.width = Math.min(320, width - 24) + 'px';
    menu.style.maxHeight = Math.max(100, Math.min(520, height - 24)) + 'px';
    const box = menu.getBoundingClientRect();
    const left = desktop ? $('.rail').getBoundingClientRect().right + 8 : rect.right - box.width;
    const top = desktop ? rect.bottom - box.height : rect.top - box.height - 8;
    menu.style.left = Math.max(x + 12, Math.min(left, x + width - box.width - 12)) + 'px';
    menu.style.top = Math.max(y + 12, Math.min(top, y + height - box.height - 12)) + 'px';
  };
  const paint = (focus = true) => {
    if (profileMenuState !== session) return;
    menu.innerHTML = `<header class="profile-menu-head"><div><h2>${session.adding ? '新增档案' : '健康档案'}</h2><p>${session.adding ? '为家庭成员单独保存健康记录' : '当前 · ' + esc(activeMemberName())}</p></div><button type="button" class="profile-menu-close" data-profile-close aria-label="关闭档案菜单">${I.close}</button></header>${session.adding ? `<form class="profile-menu-form" id="quickMemberForm"><label>称呼<input name="name" required maxlength="60" placeholder="填写成员称呼" autocomplete="off"></label><label>与我的关系<input name="relation" maxlength="40" placeholder="如：本人、父亲、母亲" autocomplete="off"></label><p>新档案独立保存健康记录，创建后可从列表切换。</p><div class="profile-menu-form-footer"><button type="button" class="btn" data-profile-back>返回</button><button type="submit" class="btn btn-primary">创建档案</button></div></form>` : `<div class="profile-menu-list" aria-label="家庭档案">${memberList.map(member => `<button type="button" class="profile-menu-member" data-profile-switch="${esc(member.id)}" ${member.id === MEMBER_ID ? 'aria-current="true"' : ''}><span class="profile-menu-avatar" aria-hidden="true">${esc(Array.from(member.name)[0] || '档')}</span><span><b>${esc(member.name)}</b><small>${esc(member.relation || '关系未填写')}${member.id === MEMBER_ID ? ' · 当前档案' : ''}</small></span>${member.id === MEMBER_ID ? I.check2 : ''}</button>`).join('') || '<p class="profile-menu-status">暂时没有可用档案，请刷新后重试。</p>'}</div><div class="profile-menu-actions"><button type="button" class="profile-menu-action" data-profile-add>${I.plus}新增档案</button><button type="button" class="profile-menu-action" data-act="go" data-to="members">${I.user}管理成员</button><button type="button" class="profile-menu-action" data-act="go" data-to="me">${I.file}个人资料与数据</button></div>`}<p class="profile-menu-status" id="profileMenuStatus" role="status"></p>`;
    position();
    if (focus) (session.adding ? menu.querySelector('input') : menu.querySelector('[aria-current="true"]') || menu.querySelector('button'))?.focus({ preventScroll: true });
  };
  const options = { signal: controller.signal };
  menu.addEventListener('click', async e => {
    if (e.target.closest('[data-profile-close]')) { closeProfileMenu(true); return; }
    if (e.target.closest('[data-profile-add]')) { session.adding = true; paint(); return; }
    if (e.target.closest('[data-profile-back]') && !session.saving) { session.adding = false; paint(); return; }
    const button = e.target.closest('[data-profile-switch]');
    if (!button) return;
    button.disabled = true;
    try { await switchMember(button.dataset.profileSwitch); }
    catch (error) { if (profileMenuState === session) $('#profileMenuStatus').textContent = error.message; }
    finally { button.disabled = false; }
    if (button.dataset.profileSwitch === MEMBER_ID) closeProfileMenu(true);
  }, options);
  menu.addEventListener('submit', async e => {
    if (e.target.id !== 'quickMemberForm') return;
    e.preventDefault();
    if (session.saving) return;
    const values = Object.fromEntries(new FormData(e.target));
    values.name = values.name.trim(); values.relation = values.relation.trim();
    if (!values.name) { $('#profileMenuStatus').textContent = '请填写成员称呼'; return; }
    session.saving = true;
    e.target.querySelectorAll('button').forEach(button => { button.disabled = true; });
    $('#profileMenuStatus').textContent = '正在创建档案…';
    try {
      await featureAPI('/profiles', values);
      await initMembers();
      if (profileMenuState === session) {
        session.adding = false; paint();
        $('#profileMenuStatus').textContent = '档案已创建，可在列表切换';
      }
    } catch (error) {
      if (profileMenuState === session) {
        $('#profileMenuStatus').textContent = error.message;
        e.target.querySelectorAll('button').forEach(button => { button.disabled = false; });
      }
    } finally { session.saving = false; }
  }, options);
  menu.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeProfileMenu(true); }
    else if (!session.adding && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const buttons = Array.from(menu.querySelectorAll('button:not(:disabled)'));
      const index = buttons.indexOf(document.activeElement);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }, options);
  document.addEventListener('pointerdown', e => { if (!menu.contains(e.target) && !trigger.contains(e.target)) closeProfileMenu(); }, options);
  document.addEventListener('focusin', e => { if (!menu.contains(e.target) && !trigger.contains(e.target)) closeProfileMenu(); }, options);
  window.addEventListener('resize', position, options);
  document.addEventListener('scroll', position, { ...options, capture: true });
  window.visualViewport?.addEventListener('resize', position, options);
  window.visualViewport?.addEventListener('scroll', position, options);
  paint();
}
