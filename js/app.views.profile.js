/* ======================= 渲染：个人资料 ======================= */
/* 过敏 / 家族史 / 手术住院三块结构化展示（个人资料页与就诊摘要共用） */
function histEmpty(text) {
  return `<p class="hint" style="margin:2px 0 6px">${esc(text)}</p>`;
}
function histHead(title, kind) {
  return `<div class="card-head" style="margin:0 0 8px">
    <h2 style="font-size:12.5px">${esc(title)}</h2>
    <button class="btn btn-mini" data-act="hist-add" data-kind="${kind}">${I.plus}添加</button>
  </div>`;
}
function historySectionsHTML() {
  const alg = allergies.length ? `<table class="data" style="width:100%"><thead><tr>
      <th>过敏原</th><th>类别</th><th>反应 / 程度</th><th></th></tr></thead><tbody>
    ${allergies.map(a => `<tr>
      <td><b style="color:${a.severity === 'critical' ? '#B4553F' : 'var(--ink-2)'}">${esc(a.name)}</b>${a.severity === 'critical' ? ' <span class="chip warn chip-sm">危急</span>' : ''}</td>
      <td>${esc(a.category || '—')}</td>
      <td>${esc([severityLabel(a.severity), a.reaction].filter(Boolean).join('；') || '—')}</td>
      <td class="act"><button data-act="hist-edit" data-kind="allergy" data-id="${esc(a.id)}">编辑</button><button class="danger" data-act="hist-del" data-kind="allergy" data-id="${esc(a.id)}">删除</button></td>
    </tr>`).join('')}</tbody></table>` : histEmpty('未记录过敏史；未记录不等于没有过敏，请据实补充。');

  const fam = familyHistory.length ? `<table class="data" style="width:100%"><thead><tr>
      <th>亲属</th><th>疾病 / 状况</th><th>备注</th><th></th></tr></thead><tbody>
    ${familyHistory.map(f => `<tr>
      <td>${esc(f.relation || '—')}</td>
      <td>${esc(f.condition || '—')}</td>
      <td style="color:var(--muted-2)">${esc(f.note || '—')}</td>
      <td class="act"><button data-act="hist-edit" data-kind="family" data-id="${esc(f.id)}">编辑</button><button class="danger" data-act="hist-del" data-kind="family" data-id="${esc(f.id)}">删除</button></td>
    </tr>`).join('')}</tbody></table>` : histEmpty('未记录家族史。');

  const sur = surgeries.length ? `<table class="data" style="width:100%"><thead><tr>
      <th>日期</th><th>手术 / 住院</th><th>医院</th><th></th></tr></thead><tbody>
    ${surgeries.map(s => `<tr>
      <td class="date">${esc(s.date || '—')}</td>
      <td>${esc(s.name || '—')}${s.note ? `<small style="color:var(--muted-3);display:block">${esc(s.note)}</small>` : ''}</td>
      <td style="color:var(--muted-2)">${esc(s.hospital || '—')}</td>
      <td class="act"><button data-act="hist-edit" data-kind="surgery" data-id="${esc(s.id)}">编辑</button><button class="danger" data-act="hist-del" data-kind="surgery" data-id="${esc(s.id)}">删除</button></td>
    </tr>`).join('')}</tbody></table>` : histEmpty('未记录手术 / 住院史。');

  return `<div class="stack" style="gap:16px">
    <div>${histHead('过敏史', 'allergy')}${alg}</div>
    <div class="divider"></div>
    <div>${histHead('家族史', 'family')}${fam}</div>
    <div class="divider"></div>
    <div>${histHead('手术 / 住院史', 'surgery')}${sur}</div>
  </div>`;
}

/* 就诊 / 用药：结构化展示（就诊页、用药页、就诊详情共用） */
function medicationsTableHTML(filterVisitId) {
  let list = medsSorted();
  if (filterVisitId !== undefined) list = list.filter(m => m.visitId === filterVisitId);
  if (!list.length) {
    return histEmpty(filterVisitId !== undefined ? '本次就诊未登记用药。' : '未登记用药；历史用药不自动视为当前用药。');
  }
  return `<div class="table-wrap"><table class="data"><thead><tr>
      <th>药物</th><th>剂量 / 频次</th><th>途径</th><th>起止</th><th>状态</th><th></th></tr></thead><tbody>
    ${list.map(m => `<tr>
      <td><p class="med-name">${esc(m.name)}</p>${m.purpose ? `<small style="color:var(--muted-3);display:block">${esc(m.purpose)}</small>` : ''}${m.infoDate ? `<small style="color:var(--muted-3);display:block">信息日期 ${esc(m.infoDate)}</small>` : ''}${m.sourceRef ? `<small style="color:var(--muted-3);display:block">来源 ${esc(m.sourceRef)}</small>` : ''}${m.toVerify ? `<small style="color:var(--warn);display:block">待核对 ${esc(m.toVerify)}</small>` : ''}</td>
      <td class="med-use">${esc([m.dose, m.frequency].filter(Boolean).join('　') || '—')}</td>
      <td>${esc(m.route || '—')}</td>
      <td class="date">${esc([m.startDate, m.endDate].filter(Boolean).join(' → ') || '—')}</td>
      <td><span class="chip chip-sm ${m.status === 'active' ? 'green' : ''}">${esc(medStatusLabel(m.status) || '—')}</span></td>
      <td class="act"><button data-act="med-edit" data-id="${esc(m.id)}">编辑</button><button class="danger" data-act="med-del" data-id="${esc(m.id)}">删除</button></td>
    </tr>`).join('')}</tbody></table></div>`;
}

/* ======================= 渲染：就诊摘要导出 =======================
   任务 017：把某次就诊或某时间段的「就诊 + 检验 + 用药 + 待复诊」汇成一页，
   供打印 / 导出 PDF。只汇总已记录内容，缺项显式标注「待填 / 未记录」，不推测、不编造。 */
function profileValue(k) {
  const f = profileFields().find(x => x.k === k);
  return f && f.ok && f.v ? f.v : '';
}
function summaryScope() {
  const s = ui.summary;
  const v = s.visit ? visitById(s.visit) : null;
  if (v) return { mode: 'visit', visit: v };
  if (s.from || s.to) return { mode: 'range', from: s.from || '', to: s.to || '' };
  return { mode: 'none' };
}
function summaryVisitsFor(scope) {
  if (scope.mode === 'visit') return [scope.visit];
  if (scope.mode === 'range') {
    const { from, to } = scope;
    return visitsSorted().filter(v => (!from || v.date >= from) && (!to || v.date <= to));
  }
  return [];
}
function summaryLabsFor(scope) {
  let rows;
  if (scope.mode === 'visit') {
    const v = scope.visit;
    // task 023 P1-b：关联只用权威外键 visit.reportId，不再用日期兜底另拼，
    // 与时间线一致；未关联报告的就诊不强行拉入同日检验。
    rows = v.reportId ? labs.filter(r => r.reportId === v.reportId) : [];
  } else if (scope.mode === 'range') {
    const { from, to } = scope;
    rows = labs.filter(r => (!from || r.date >= from) && (!to || r.date <= to));
  } else rows = [];
  // 异常优先置顶，再按日期倒序、名称排序
  return rows.slice().sort((a, b) => (isAbnormal(b) ? 1 : 0) - (isAbnormal(a) ? 1 : 0)
    || (b.date || '').localeCompare(a.date || '') || String(a.name).localeCompare(String(b.name)));
}
function summaryMedsFor(scope) {
  if (scope.mode === 'visit') {
    const v = scope.visit;
    // task 023 P1-b：关联只用权威外键 medication.visitId；不再额外并入所有在服药物，
    // 避免把与该次就诊无关的活跃用药算进本次摘要（在服药物可在区间摘要查看）。
    return medications.filter(m => m.visitId === v.id);
  }
  if (scope.mode === 'range') {
    const { from, to } = scope;
    return medsSorted().filter(m => {
      if (m.status === 'active') return true;                 // 在服药物始终纳入
      const s0 = m.startDate || '', s1 = m.endDate || '9999-12-31';
      return (!to || s0 <= to) && (!from || s1 >= from);
    });
  }
  return [];
}
function summaryDocHTML(scope) {
  const name = profileValue('姓名／称呼') || '【待填】';
  const birth = profileValue('出生日期') || '【待填】';
  const gen = fmtWhen(new Date());
  const vs = summaryVisitsFor(scope);
  const ls = summaryLabsFor(scope);
  const ms = summaryMedsFor(scope);
  const abn = ls.filter(isAbnormal);
  const dateLabel = scope.mode === 'visit'
    ? `${esc(scope.visit.date)}　${esc(scope.visit.visitType || '')}`
    : `${esc(scope.from || '最早')} 至 ${esc(scope.to || '至今')}`;

  const visitBlock = vs.length ? vs.map(v => `
    <table class="data sum-table">
      <tbody>
        <tr><th>就诊日期</th><td>${esc(v.date)}${v.visitType ? '　·　' + esc(v.visitType) : ''}</td><th>医院／科室</th><td>${esc(v.hospital || '—')}${v.department ? '　·　' + esc(v.department) : ''}</td></tr>
        <tr><th>接诊医生</th><td>${esc(v.doctor || '—')}</td><th>关联报告</th><td>${v.reportId && reportById(v.reportId) ? esc(reportById(v.reportId).title) : '—'}</td></tr>
        <tr><th>主诉</th><td colspan="3">${esc(v.chief || '待填')}</td></tr>
        <tr><th>诊断</th><td colspan="3">${esc(v.diagnosis || '待填')}</td></tr>
        <tr><th>小结</th><td colspan="3">${esc(v.summary || '待填')}</td></tr>
        ${v.note ? `<tr><th>备注</th><td colspan="3">${esc(v.note)}</td></tr>` : ''}
      </tbody>
    </table>`).join('') : `<p class="hint">本时间段未登记就诊记录（就诊信息为待填）。</p>`;

  const labBlock = ls.length ? `
    <table class="data sum-table">
      <thead><tr><th style="width:88px">日期</th><th>项目</th><th style="text-align:right">结果</th><th style="width:110px">参考范围</th><th style="width:70px">提示</th></tr></thead>
      <tbody>
        ${ls.map(r => {
    let flag;
    if (isAbnormal(r)) flag = '<span class="fl up">↑ 异常</span>';
    else if (r.flag === 'N') flag = '<span class="fl ok">正常</span>';
    else if (typeof r.value === 'number' && Number.isFinite(r.value) && (r.low != null || r.high != null)) flag = '<span class="fl ok">在区间</span>';
    else flag = '<span class="fl na">—</span>';
    return `<tr class="${isAbnormal(r) ? 'sum-abn' : ''}"><td>${esc(r.date)}</td><td>${esc(r.name)}${r.category ? ` <span class="cat-tag">${esc(r.category)}</span>` : ''}</td><td style="text-align:right">${esc(String(labValueRaw(r)))}${r.unit ? ' ' + esc(r.unit) : ''}</td><td>${esc(fmtRef(r))}</td><td>${flag}</td></tr>`;
  }).join('')}
      </tbody>
    </table>
    <p class="hint">共 ${ls.length} 项，异常 ${abn.length} 项（已置顶并标红）。</p>`
    : `<p class="hint">未关联检验结果（待填 / 未记录）。</p>`;

  const medBlock = ms.length ? `
    <table class="data sum-table">
      <thead><tr><th>药品</th><th>剂量</th><th>频次</th><th>用法</th><th>状态</th><th>用途</th></tr></thead>
      <tbody>${ms.map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.dose || '—')}</td><td>${esc(m.frequency || '—')}</td><td>${esc(m.route || '—')}</td><td>${esc(medStatusLabel(m.status) || m.status)}</td><td>${esc(m.purpose || '—')}</td></tr>`).join('')}</tbody>
    </table>` : `<p class="hint">未记录用药（待填 / 未记录）。</p>`;

  const todos = openTodos();
  const todoBlock = todos.length
    ? `<ul class="sum-todos">${todos.map(t => `<li>${t.flag ? '⚠ ' : ''}${esc(t.text)}${t.dueDate ? `（${esc(t.dueDate)}）` : ''}${t.groupName ? '　·　' + esc(t.groupName) : ''}</li>`).join('')}</ul>`
    : `<p class="hint">无待复诊 / 待办记录。</p>`;

  return `<section class="card sum-doc" id="summaryDoc">
    <div class="sum-head">
      <div><h2>就诊摘要</h2><p class="sum-sub">${dateLabel}</p></div>
      <div class="sum-meta">姓名：${esc(name)}　出生：${esc(birth)}<br>生成：${esc(gen)}</div>
    </div>
    <h3 class="sum-h">一、就诊信息</h3>${visitBlock}
    <h3 class="sum-h">二、检验结果${abn.length ? `（异常 ${abn.length} 项）` : ''}</h3>${labBlock}
    <h3 class="sum-h">三、用药</h3>${medBlock}
    <h3 class="sum-h">四、待复诊 / 待办</h3>${todoBlock}
    <p class="sum-foot">本摘要由「个人健康档案」依已记录内容自动汇总，未记录项不代表不存在；请以原始检验报告与医生意见为准。</p>
  </section>`;
}
function renderSummary() {
  setHead('SUMMARY　就诊摘要', '就诊摘要导出',
    '把一次就诊或某段时间的就诊、检验、用药汇成一页，可打印或另存为 PDF',
    `<button class="btn btn-primary" data-act="summary-print">${I.download}打印 / 导出 PDF</button>`, false);
  const s = ui.summary;
  const scope = summaryScope();
  const opts = visitsSorted().map(v => `<option value="${esc(v.id)}" ${v.id === s.visit ? 'selected' : ''}>${esc(v.date)}　${esc(v.visitType || '就诊')}　${esc(v.hospital || '')}</option>`).join('');
  $('#view').innerHTML = `
    <div class="stack">
      <section class="card no-print">
        <div class="card-head"><h2>选择摘要范围</h2><span class="hint">选一次就诊优先，否则按日期区间</span></div>
        <div class="summary-controls">
          <label class="sum-ctl">按就诊
            <select id="smVisit"><option value="">— 不选（改用日期区间）—</option>${opts}</select>
          </label>
          <label class="sum-ctl">日期区间
            <input type="date" id="smFrom" value="${esc(s.from)}"> <span>至</span>
            <input type="date" id="smTo" value="${esc(s.to)}">
          </label>
          <button class="btn btn-primary" data-act="summary-preview">生成摘要</button>
          <button class="btn btn-ghost" data-act="summary-clear">清空</button>
        </div>
        <p class="hint">摘要只汇总已记录内容，缺项显示「待填 / 未记录」，不推测、不编造。选择就诊会连带该次关联报告与同日检验；不选就诊则按日期区间（含首尾）汇总。</p>
      </section>
      ${scope.mode === 'none'
      ? `<section class="card"><div class="empty">选择一次就诊，或填写日期区间后点「生成摘要」。<br>${visits.length ? '' : '当前还没有登记就诊记录，可先去「就诊记录」登记，或直接用日期区间汇总检验结果。'}</div></section>`
      : summaryDocHTML(scope)}
    </div>`;
}

function renderProfile() {
  const comp = completeness();
  const si = storeInfo();
  const req = profileChecklist();
  const reqOk = req.filter(x => x.ok).length;
  const reqPct = Math.round(reqOk / req.length * 100);
  setHead('PROFILE　个人资料', '个人资料', '空白代表未记录，不等于没有',
    `<button class="btn btn-ghost" data-act="export">${I.download}导出备份</button>`);

  $('#view').innerHTML = `
    <div class="stack">
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>基础资料</h2><span class="link">${comp.okP}/${comp.totalP} 项已填</span></div>
          <table class="data" style="width:100%">
            <thead><tr><th style="width:40%">项目</th><th>内容</th><th style="width:52px;text-align:right">状态</th></tr></thead>
            <tbody>
              ${profileFields().map(f => `<tr>
                <td style="color:var(--muted);font-size:11px">${esc(f.k)}</td>
                <td style="color:${f.ok ? 'var(--ink-2)' : 'var(--muted-3)'}">${esc(f.v)}</td>
                <td style="text-align:right"><span class="chip chip-sm ${f.ok ? 'green' : 'amber'}">${f.ok ? '已填' : '待填'}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </section>
        <section class="card">
          <div class="card-head"><h2>档案完整度</h2><span class="chip ${comp.pct > 60 ? 'green' : 'amber'} chip-sm">${comp.pct}%</span></div>
          <div class="track" style="background:#EDE8DC;height:8px"><i style="width:${comp.pct}%;background:var(--pine-2)"></i></div>
          <div style="margin-top:14px">
            <div class="tl-row"><time>基础资料</time><p>${comp.okP} / ${comp.totalP} 项已填写</p></div>
            <div class="tl-row"><time>健康主题</time><p>${comp.okI} / ${comp.totalI} 个有记录</p></div>
            <div class="tl-row"><time>检验记录</time><p>${labs.length ? labs.length + ' 条结果' : '尚无，录入后计入完整度'}</p></div>
          </div>
          <p class="hint" style="margin:14px 0 10px">仍缺信息</p>
          <div class="band-missing"><div class="chips">${comp.missing.map(m => `<span class="chip">${esc(m)}</span>`).join('')}</div></div>
          <div class="divider" style="margin:16px 0"></div>
          <p class="hint">未记录的项目不会被自动补全，也不从文件名推测。补充后请同步更新对应主题文件。</p>
        </section>
      </div>

      <section class="card">
        <div class="card-head"><h2>个人资料必填清单</h2><span class="chip ${reqPct === 100 ? 'green' : 'amber'} chip-sm">${reqPct}% · ${reqOk}/${req.length}</span></div>
        <div class="track" style="background:#EDE8DC;height:8px"><i style="width:${reqPct}%;background:var(--pine-2)"></i></div>
        <div class="table-wrap" style="margin-top:14px">
          <table class="data" style="width:100%">
            <thead><tr><th style="width:30%">必填项</th><th style="width:64px">状态</th><th>当前字段 / 内容</th></tr></thead>
            <tbody>
              ${req.map(x => `<tr>
                <td style="color:var(--ink-2)">${esc(x.label)}</td>
                <td><span class="chip chip-sm ${x.ok ? 'green' : 'amber'}">${x.ok ? '已填' : '待填'}</span></td>
                <td style="color:${x.ok ? 'var(--ink-2)' : 'var(--muted-3)'}">${esc(x.value)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="hint" style="margin:12px 0 0">「待填」不等于「没有」；未记录的项目不自动补全。过敏 / 手术住院 / 家族史 / 当前用药按结构化记录自动判定（任务 005/010），其余字段补充后请同步更新 <code>assets/data.js</code> 与 <code>docs/健康档案/个人资料.md</code>。</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>过敏 · 家族史 · 手术住院</h2><span class="link">就医与急救必读</span></div>
        ${historySectionsHTML()}
      </section>

      <section class="card">
        <div class="card-head"><h2>数据存储</h2><span class="link">${si.server ? (syncBad ? '写入失败' : '本机数据库已连接') : '浏览器存储'}</span></div>
        <div class="store-stat">
          <div><b>${labs.length}</b><span>条检验记录</span></div>
          <div><b>${state.weights.length} / ${state.body.length}</b><span>体重 / 围度</span></div>
          <div class="${si.server ? '' : 'w'}"><b>${si.server ? reports.length + ' 份' : esc(si.size)}</b><span>${si.server ? '报告原件' : '浏览器占用'}</span></div>
          <div class="w"><b>${esc(fmtWhen(si.at))}</b><span>最后保存</span></div>
        </div>
        ${si.server ? `
        <div class="notice">${I.info}<p><b>记录存在本机数据库 <code>data/health.db</code>，报告照片存成 <code>data/报告原件/files/</code> 下的真实文件。</b>不经过任何网络，也不占用浏览器那 5 MB 配额。备份：导出 JSON，或直接拷走 <code>data/</code> 目录。</p></div>
        <p class="hint" style="margin:0 0 12px">当前来源：<code>${esc(si.origin)}</code>。数据只有这一份，换浏览器、清站点数据都不会影响；反过来，删掉 <code>data/health.db</code> 就真的没了。</p>
        ${pendingMigrate ? `<div class="notice err">${I.info}<p><b>浏览器里还留着旧数据（${esc(si.size)}）。</b>可以合并进本机数据库：同一天、同项目、同单位的以浏览器里的为准，重复点也不会翻倍。</p></div>
        <div class="form-actions" style="margin-bottom:12px"><button class="btn btn-primary" data-act="migrate-local">${I.download}合并浏览器数据</button></div>` : ''}`
      : `
        <div class="notice">${I.info}<p><b>本机服务没连上，记录暂存在当前浏览器的 localStorage 里。</b>报告原件的图片也在这里，占空间最多（浏览器上限约 5 MB）。换浏览器、换电脑、清「Cookie 及其他网站数据」都会丢。先启动「启动健康档案.bat」，数据就会改存到本机数据库。</p></div>
        <p class="hint" style="margin:0 0 12px">当前来源：<code>${esc(si.origin)}</code>。档案正文（问题清单、时间线、用药）写在 <code>assets/data.js</code> 文件里，不受浏览器清理影响。</p>`}
        <div class="form-actions">
          <button class="btn btn-primary" data-act="export">${I.download}导出完整备份</button>
          <button class="btn btn-ghost" data-act="import">${I.upload}导入数据</button>
          ${si.server ? '' : '<button class="btn btn-ghost btn-danger" data-act="clear-local">清空本机记录</button>'}
        </div>
        <p class="hint" style="margin-top:10px">${si.server ? '导出的 JSON 含报告照片，可换一台机器用「导入数据」恢复。' : '清空只影响浏览器里的检验、体重与勾选状态，不会删除磁盘上的病历、报告和影像文件。'}</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>档案约定</h2></div>
        <ol style="display:flex;flex-direction:column;gap:8px">
          ${[
      '日常新增饮食、体重与活动，写入当月减重记录；每周填写一次复盘。',
      '就诊或检查后，保存原件，补一条时间线，再更新问题总表、用药和待办。',
      '日期统一为 YYYY-MM-DD；体重以 kg 为主，可同时写斤（1 kg = 2 斤）；能量统一用 kcal。',
      '明确区分“本人描述”“医院报告”“医生诊断”“辅助分析”“建议计划”。',
      '空白代表未记录，不等于没有症状、没有过敏或数值为 0；历史用药不自动视为当前用药。'
    ].map((t, i) => `<li style="font-size:11.5px;line-height:19px;color:var(--muted)"><b style="color:var(--ink-2)">${i + 1}.</b> ${esc(t)}</li>`).join('')}
        </ol>
      </section>
    </div>`;
}
