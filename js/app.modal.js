/* ======================= 弹层 ======================= */
function openModal(html, cls = '') {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  root.hidden = false;
  document.body.style.overflow = 'hidden';
  const f = root.querySelector('input,select,textarea,button');
  if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
}
function closeModal() {
  const root = $('#modalRoot');
  root.hidden = true;
  root.innerHTML = '';
  document.body.style.overflow = '';
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}

/* ---------- 记录一次 ---------- */
function openRecord(kind = 'weight', presetDate) {
  openModal(`
    <div class="modal-head">
      <div><h2>记录一次</h2><p>${storeMode === 'server' ? '记录会写进本机数据库 data/health.db' : '本机服务没连上，记录只存在当前浏览器'}</p></div>
      <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button>
    </div>
    <div class="tabs">
      <button data-act="tab" data-k="weight" class="${kind === 'weight' ? 'on' : ''}">体重</button>
      <button data-act="tab" data-k="body" class="${kind === 'body' ? 'on' : ''}">胸腰臀围度</button>
      <button data-act="tab" data-k="lab" class="${kind === 'lab' ? 'on' : ''}">检验结果</button>
      <button data-act="tab" data-k="todo" class="${kind === 'todo' ? 'on' : ''}">待办提醒</button>
    </div>
    <div id="modalBody"></div>`);
  renderRecordBody(kind, presetDate);
}

function renderRecordBody(kind, presetDate) {
  const body = $('#modalBody');
  if (kind === 'weight') {
    body.innerHTML = `
      <form id="wForm">
        <div class="form-grid">
          <div class="field"><label>日期 <b>*</b></label><input type="date" name="date" value="${presetDate || todayISO()}" required></div>
          <div class="field"><label>体重 kg <b>*</b></label><input type="number" step="0.1" name="kg" placeholder="如 87.6" required></div>
          <div class="field"><label>条件</label><select name="tag">
            <option value="morning">晨重（排尿后、进食前）</option>
            <option value="other">同日其他时段</option>
            <option value="reported">自报 / 条件不明</option>
          </select></div>
          <div class="field"><label>腰围 cm</label><input type="number" step="0.1" name="waist" placeholder="可空，会记进围度"></div>
          ${weightMetricInputsHTML(null)}
          <div class="field wide"><label>备注</label><input name="note" maxlength="120" placeholder="如衣着、是否空腹、秤是否更换"></div>
        </div>
        <p class="hint" style="margin-top:10px">只有“晨重”会进入 7 天均值基线；自报体重单列显示，不混入均值。这里填的腰围会同步到围度记录，胸围和臀围请用上方「胸腰臀围度」页签。体脂率 / 肌肉量 / BMI / 内脏脂肪 / 基础代谢 / 骨量来自体脂秤，可空着不填。</p>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit">保存记录</button>
          <button class="btn btn-ghost" type="button" data-act="close">取消</button>
          <span class="form-msg" id="wMsg"></span>
        </div>
      </form>`;
    $('#wForm').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const kg = Number(fd.get('kg'));
      if (!Number.isFinite(kg) || kg <= 20 || kg > 300) { $('#wMsg').textContent = '请填写 20–300 之间的体重。'; $('#wMsg').className = 'form-msg err'; return; }
      const waist = fd.get('waist') === '' ? null : Number(fd.get('waist'));
      const date = fd.get('date');
      state.weights.push({
        id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
        date, kg, tag: fd.get('tag'),
        waist: null,
        note: String(fd.get('note') || '').trim(),
        ...readWeightMetrics(fd)
      });
      // 腰围只存一份：填了就写进围度记录（同一天已有则补进去）
      if (Number.isFinite(waist) && waist > 0) upsertBody(date, { waist });
      persistState();
      closeModal();
      route();
      toast(Number.isFinite(waist) && waist > 0 ? '体重与腰围已记录' : '体重已记录');
    });
  } else if (kind === 'body') {
    body.innerHTML = bodyFormHTML(null, presetDate);
    bindBodyForm();
  } else if (kind === 'lab') {
    body.innerHTML = labFormHTML(null);
    bindLabForm();
  } else {
    body.innerHTML = `
      <div class="notice" style="margin-bottom:16px">${I.info}<p>待办可在「待办」页新增、编辑，勾选状态保存在本机数据库。这里不生成提醒，也不代表已经预约。</p></div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${openTodos().slice(0, 6).map(t => `<button class="sr-item" data-act="go-todo" data-id="${t.id}" style="border:1px solid var(--line-3);border-radius:9px">
          <span class="badge">${esc(t.group)}</span><span>${esc(t.text)}</span></button>`).join('') || '<div class="empty">暂无未完成待办</div>'}
      </div>
      <div class="form-actions"><button class="btn btn-ghost" data-act="close">关闭</button><button class="btn btn-primary" data-act="todo-add">${I.plus}添加待办</button><button class="btn btn-primary" data-act="go" data-to="todo">打开待办页</button></div>`;
  }
}

/* ---------- 围度表单 ---------- */
function bodyFormHTML(rec, presetDate) {
  const r = rec || { date: presetDate || todayISO(), chest: null, waist: null, hip: null, note: '' };
  return `
    <form id="bForm" data-id="${rec ? esc(rec.id) : ''}">
      <div class="form-grid">
        <div class="field"><label>测量日期 <b>*</b></label><input type="date" name="date" value="${esc(r.date)}" required></div>
        ${BODY_FIELDS.map(f => `<div class="field"><label>${f.label} cm</label>
          <input type="number" step="0.1" min="1" max="300" name="${f.k}" value="${r[f.k] ?? ''}" placeholder="${f.hint}"></div>`).join('')}
        <div class="field wide"><label>备注</label><input name="note" maxlength="120" value="${esc(r.note || '')}" placeholder="如量尺位置、衣着、测量时间"></div>
      </div>
      <p class="hint" style="margin-top:10px">三项都可以不填，但至少填一项。同一天再记会更新当天那一组，不会多出一条；编辑时留空表示清掉这一项。</p>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">${rec ? '保存修改' : '保存围度'}</button>
        <button class="btn btn-ghost" type="button" data-act="close">取消</button>
        ${rec ? `<button class="btn btn-ghost btn-danger" type="button" data-act="body-del" data-id="${esc(rec.id)}">删除这条</button>` : ''}
        <span class="form-msg" id="bMsg"></span>
      </div>
    </form>`;
}

function bindBodyForm() {
  const form = $('#bForm');
  if (!form) return;
  const editingId = form.dataset.id || '';
  const msg = (t, err = true) => { const m = $('#bMsg'); if (m) { m.textContent = t; m.className = 'form-msg' + (err ? ' err' : ''); } };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    const date = String(fd.get('date') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { msg('请选择测量日期'); return; }
    const vals = {};
    let bad = '';
    BODY_FIELDS.forEach(f => {
      const raw = fd.get(f.k);
      if (raw === '' || raw === null) return;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 1 || n > 300) bad = `${f.label}请填 1–300 之间的厘米数`;
      else vals[f.k] = n;
    });
    if (bad) { msg(bad); return; }
    if (!Object.keys(vals).length) { msg('至少填一项围度'); return; }
    const note = String(fd.get('note') || '').trim().slice(0, 120);
    if (editingId) {
      const full = { chest: null, waist: null, hip: null, ...vals };
      state.body = state.body.map(b => b.id === editingId ? { ...b, date, ...full, note } : b);
    } else {
      const cur = bodyOf(date);
      if (cur) {
        state.body = state.body.map(b => b.id === cur.id ? { ...b, ...vals, note: note || b.note } : b);
      } else {
        state.body.push(normBody({
          id: (crypto.randomUUID && crypto.randomUUID()) || 'b-' + Date.now(),
          date, ...vals, note, createdAt: Date.now()
        }));
      }
    }
    persistState();
    closeModal();
    route();
    toast('围度已保存');
  });
}

/* ---------- 体征表单 ---------- */
function vitalsFormHTML(rec, presetDate) {
  const r = rec || { date: presetDate || todayISO(), glucoseTag: 'fasting', note: '' };
  const tagOpts = GLUCOSE_TAGS.map(([v, l]) => `<option value="${v}" ${(r.glucoseTag || 'fasting') === v ? 'selected' : ''}>${l}</option>`).join('');
  return `
    <form id="vForm" data-id="${rec ? esc(rec.id) : ''}">
      <div class="form-grid">
        <div class="field"><label>测量日期 <b>*</b></label><input type="date" name="date" value="${esc(r.date)}" required></div>
        ${VITAL_FIELDS.map(f => `<div class="field"><label>${f.label} <small style="color:var(--muted-3);font-weight:400">${f.unit}</small></label>
          <input type="number" step="${f.step}" min="${f.min}" max="${f.max}" name="${f.k}" value="${r[f.k] ?? ''}" placeholder="${f.hint}"></div>`).join('')}
        <div class="field"><label>血糖测量时机</label><select name="glucoseTag">${tagOpts}</select></div>
        <div class="field wide"><label>备注</label><input name="note" maxlength="120" value="${esc(r.note || '')}" placeholder="如晨起、静息 5 分钟后、运动后"></div>
      </div>
      <p class="hint" style="margin-top:10px">各项都可不填，但至少填一项。参考区间：血压 90–139 / 60–89 mmHg、心率 60–100 次/分、体温 36.0–37.3 ℃、血氧 95–100 %、空腹血糖 3.9–6.1 mmol/L（餐后 2 小时 3.9–7.8）。超出会标红，仅作观察，不替代医生判断。</p>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">${rec ? '保存修改' : '保存体征'}</button>
        <button class="btn btn-ghost" type="button" data-act="close">取消</button>
        ${rec ? `<button class="btn btn-ghost btn-danger" type="button" data-act="vital-del" data-id="${esc(rec.id)}">删除这条</button>` : ''}
        <span class="form-msg" id="vMsg"></span>
      </div>
    </form>`;
}

function openVitalsForm(rec) {
  openModal(`
    <div class="modal-head">
      <div><h2>${rec ? '编辑体征记录' : '记录生命体征'}</h2><p>${storeMode === 'server' ? '记录会写进本机数据库 data/health.db' : '本机服务没连上，记录只存在当前浏览器'}</p></div>
      <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button>
    </div>
    ${vitalsFormHTML(rec)}`, 'wide');
  bindVitalsForm();
}

function bindVitalsForm() {
  const form = $('#vForm');
  if (!form) return;
  const editingId = form.dataset.id || '';
  const msg = (t, err = true) => { const m = $('#vMsg'); if (m) { m.textContent = t; m.className = 'form-msg' + (err ? ' err' : ''); } };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    const date = String(fd.get('date') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { msg('请选择测量日期'); return; }
    const vals = {};
    let bad = '';
    VITAL_FIELDS.forEach(f => {
      const raw = fd.get(f.k);
      if (raw === '' || raw === null) return;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < f.min || n > f.max) bad = `${f.label}请填 ${f.min}–${f.max} 之间的数`;
      else vals[f.k] = n;
    });
    if (bad) { msg(bad); return; }
    if (!Object.keys(vals).length) { msg('至少填一项体征'); return; }
    const prev = editingId ? vitals.find(x => x.id === editingId) : null;
    const rec = {
      id: editingId || ((crypto.randomUUID && crypto.randomUUID()) || 'vit-' + Date.now()),
      date, ...vals,
      glucoseTag: String(fd.get('glucoseTag') || ''),
      note: String(fd.get('note') || '').trim().slice(0, 120),
      createdAt: (prev && prev.createdAt) || Date.now()
    };
    if (editingId) vitals = vitals.map(x => x.id === editingId ? normVital(rec) : x);
    else vitals.push(normVital(rec));
    persistVitals();
    closeModal();
    route();
    toast(editingId ? '体征记录已更新' : '体征已记录');
  });
}

/* ---------- 症状表单 ---------- */
function symptomFormHTML(rec, presetDate) {
  const r = rec || { date: presetDate || todayISO(), part: '', severity: '', trigger: '', note: '' };
  const sev = Number.isFinite(r.severity) ? r.severity : '';
  return `
    <form id="symForm" data-id="${rec ? esc(rec.id) : ''}">
      <div class="form-grid">
        <div class="field"><label>日期 <b>*</b></label><input type="date" name="date" value="${esc(r.date)}" required></div>
        <div class="field"><label>部位 / 主题 <b>*</b></label><input name="part" list="symParts" maxlength="20" value="${esc(r.part || '')}" placeholder="如 头面、腰背、四肢" required><datalist id="symParts">${SYMPTOM_PARTS.map(p => `<option value="${esc(p)}">`).join('')}</datalist></div>
        <div class="field"><label>程度（1–10）</label><input type="number" name="severity" min="1" max="10" step="1" value="${sev}" placeholder="1 很轻 · 10 难以忍受"></div>
        <div class="field"><label>诱因</label><input name="trigger" maxlength="60" value="${esc(r.trigger || '')}" placeholder="如 长时间看屏、花粉、走路多"></div>
        <div class="field wide"><label>备注</label><input name="note" maxlength="200" value="${esc(r.note || '')}" placeholder="如 用药后缓解、持续约 2 小时"></div>
      </div>
      <p class="hint" style="margin-top:10px">部位填同一名称，才能按主题筛到一起回看。程度是主观自评分，1 很轻、10 难以忍受；不填也可以。</p>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">${rec ? '保存修改' : '保存症状'}</button>
        <button class="btn btn-ghost" type="button" data-act="close">取消</button>
        ${rec ? `<button class="btn btn-ghost btn-danger" type="button" data-act="symptom-del" data-id="${esc(rec.id)}">删除这条</button>` : ''}
        <span class="form-msg" id="symMsg"></span>
      </div>
    </form>`;
}

function openSymptomForm(rec) {
  openModal(`
    <div class="modal-head">
      <div><h2>${rec ? '编辑症状记录' : '记录症状'}</h2><p>${storeMode === 'server' ? '记录会写进本机数据库 data/health.db' : '本机服务没连上，记录只存在当前浏览器'}</p></div>
      <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button>
    </div>
    ${symptomFormHTML(rec)}`, 'wide');
  bindSymptomForm();
}

function bindSymptomForm() {
  const form = $('#symForm');
  if (!form) return;
  const editingId = form.dataset.id || '';
  const msg = (t, err = true) => { const m = $('#symMsg'); if (m) { m.textContent = t; m.className = 'form-msg' + (err ? ' err' : ''); } };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    const date = String(fd.get('date') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { msg('请选择日期'); return; }
    const part = String(fd.get('part') || '').trim();
    if (!part) { msg('请填写部位 / 主题'); return; }
    let severity = null;
    const rawSev = fd.get('severity');
    if (rawSev !== '' && rawSev !== null) {
      const n = Number(rawSev);
      if (!Number.isInteger(n) || n < 1 || n > 10) { msg('程度请填 1–10 之间的整数'); return; }
      severity = n;
    }
    const prev = editingId ? symptoms.find(x => x.id === editingId) : null;
    const rec = {
      id: editingId || ((crypto.randomUUID && crypto.randomUUID()) || 'sym-' + Date.now()),
      date, part, severity,
      trigger: String(fd.get('trigger') || '').trim().slice(0, 60),
      note: String(fd.get('note') || '').trim().slice(0, 200),
      createdAt: (prev && prev.createdAt) || Date.now()
    };
    if (editingId) symptoms = symptoms.map(x => x.id === editingId ? normSymptom(rec) : x);
    else symptoms.push(normSymptom(rec));
    persistSymptoms();
    closeModal();
    route();
    toast(editingId ? '症状记录已更新' : '症状已记录');
  });
}

/* ---------- 检验表单 ---------- */
function labFormHTML(rec) {
  const r = rec || { date: todayISO(), category: '血常规', name: '', value: '', qualitative: '', unit: '', low: '', high: '', source: '', note: '', reportId: '' };
  const isQual = !!(r.qualitative && (r.value === null || r.value === undefined || r.value === ''));
  return `
    <form id="labForm" data-id="${rec ? esc(rec.id) : ''}">
      <div class="form-grid">
        <div class="field"><label>检查日期 <b>*</b></label><input type="date" name="date" value="${esc(r.date)}" required></div>
        <div class="field"><label>项目类别 <b>*</b></label><select name="category">${CATS.map(c => `<option ${c === r.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>指标名称 <b>*</b></label><input name="name" list="labSug" value="${esc(r.name)}" placeholder="如 肌酐、ALT" maxlength="80" required><datalist id="labSug"></datalist></div>
        <div class="field"><label>结果形式</label><select name="vtype" id="labVType">
          <option value="num" ${isQual ? '' : 'selected'}>数值结果</option>
          <option value="qual" ${isQual ? 'selected' : ''}>定性结果（阴/阳、+−）</option>
        </select></div>
        <div class="field" id="labValWrap"><label>结果数值 <b>*</b></label><input type="number" step="any" name="value" value="${r.value ?? ''}" placeholder="如 88"></div>
        <div class="field" id="labQualWrap" ${isQual ? '' : 'hidden'}><label>定性结果 <b>*</b></label>
          <input name="qualitative" list="labQualSug" value="${esc(r.qualitative || '')}" placeholder="如 阴性、阳性、+" maxlength="20">
          <datalist id="labQualSug"><option value="阴性"></option><option value="阳性"></option><option value="弱阳性"></option><option value="±"></option><option value="+"></option><option value="++"></option><option value="+++"></option><option value="++++"></option><option value="未见异常"></option></datalist>
        </div>
        <div class="field"><label>单位</label><input name="unit" value="${esc(r.unit)}" placeholder="如 μmol/L（定性可空）" maxlength="40"></div>
        <div class="field"><label>参考下限</label><input type="number" step="any" name="low" value="${r.low ?? ''}" placeholder="可空"></div>
        <div class="field"><label>参考上限</label><input type="number" step="any" name="high" value="${r.high ?? ''}" placeholder="可空"></div>
        <div class="field"><label>医院 / 报告来源</label><input name="source" value="${esc(r.source)}" maxlength="120" placeholder="可空"></div>
        <div class="field wide"><label>所属报告</label>
          <select name="reportId">${reportOptions(r.reportId || '', false)}</select>
          ${reports.length ? '' : '<span class="hint">还没有报告原件。想留下原件可在检验页「报告原件」里添加。</span>'}
        </div>
        <div class="field"><label>备注</label><input name="note" value="${esc(r.note)}" maxlength="300" placeholder="报告编号、检测方法"></div>
      </div>
      <p class="hint" style="margin-top:10px">数值结果填数值+单位；定性结果（如尿蛋白 阴性 / +）选「定性结果」并照单填写，不必编造数值。不同方法或单位的数据不应直接比较。</p>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">${rec ? '保存修改' : '保存结果'}</button>
        <button class="btn btn-ghost" type="button" data-act="close">取消</button>
        <span class="form-msg" id="labMsg"></span>
      </div>
    </form>`;
}

function fillSuggestions(form) {
  const cat = form.querySelector('[name="category"]').value;
  const dl = form.querySelector('#labSug');
  if (dl) dl.innerHTML = (PRESETS[cat] || []).map(x => `<option value="${esc(x)}">`).join('');
}

function bindLabForm() {
  const form = $('#labForm');
  if (!form) return;
  fillSuggestions(form);
  form.querySelector('[name="category"]').addEventListener('change', () => fillSuggestions(form));
  const syncVType = () => {
    const vt = form.querySelector('[name="vtype"]') ? form.querySelector('[name="vtype"]').value : 'num';
    const valWrap = form.querySelector('#labValWrap');
    const qWrap = form.querySelector('#labQualWrap');
    const valInput = form.querySelector('[name="value"]');
    const qInput = form.querySelector('[name="qualitative"]');
    const unitInput = form.querySelector('[name="unit"]');
    if (valWrap) valWrap.hidden = vt === 'qual';
    if (qWrap) qWrap.hidden = vt !== 'qual';
    if (valInput) valInput.required = vt !== 'qual';
    if (qInput) qInput.required = vt === 'qual';
    if (unitInput) unitInput.required = vt !== 'qual';
  };
  const vtSel = form.querySelector('[name="vtype"]');
  if (vtSel) vtSel.addEventListener('change', syncVType);
  syncVType();
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    const rawLow = fd.get('low'), rawHigh = fd.get('high');
    const low = rawLow === '' || rawLow === null ? null : Number(rawLow);
    const high = rawHigh === '' || rawHigh === null ? null : Number(rawHigh);
    const msg = $('#labMsg');
    if (low !== null && high !== null && low > high) { msg.textContent = '参考下限不能高于上限。'; msg.className = 'form-msg err'; return; }
    const vtype = String(fd.get('vtype') || 'num');
    const qual = String(fd.get('qualitative') || '').trim();
    const valRaw = String(fd.get('value') || '').trim();
    const unit = String(fd.get('unit') || '').trim();
    let value = null, qualitative = '';
    if (vtype === 'qual') {
      if (!qual) { msg.textContent = '请填写定性结果（如 阴性、阳性、+）。'; msg.className = 'form-msg err'; return; }
      qualitative = qual;
    } else {
      value = valRaw === '' ? NaN : Number(valRaw);
      if (!Number.isFinite(value)) { msg.textContent = '请填写数值结果。'; msg.className = 'form-msg err'; return; }
      if (!unit) { msg.textContent = '数值结果请填写单位。'; msg.className = 'form-msg err'; return; }
    }
    const rec = {
      id: form.dataset.id || (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random()}`,
      date: fd.get('date'), category: fd.get('category'),
      name: String(fd.get('name') || '').trim(),
      value, qualitative,
      unit, low: vtype === 'qual' ? null : low, high: vtype === 'qual' ? null : high,
      flag: vtype === 'qual' ? qualFlagOf(qualitative) : calcLabFlag(value, low, high),
      source: String(fd.get('source') || '').trim(), note: String(fd.get('note') || '').trim(),
      reportId: String(fd.get('reportId') || '').trim()
    };
    if (!validLab(rec)) { msg.textContent = '请检查日期、指标和结果（数值结果需填数值与单位；定性结果需填结果）。'; msg.className = 'form-msg err'; return; }
    const next = form.dataset.id ? labs.map(x => x.id === rec.id ? rec : x) : [...labs, rec];
    if (!persistLabs(next)) return;
    closeModal();
    ui.metric = labKey(rec);
    /* 从「全部记录」改的，改完留在原列表，别把用户甩回趋势图 */
    const page = currentPage();
    if (page === 'labs' || page === 'labs-all') route();
    else location.hash = '#/labs';
    toast(rec.name + ' 已保存到本机');
  });
}

/* ---------- 搜索 ---------- */
function searchIndex() {
  const idx = [];
  ARCHIVE.issues.forEach(i => idx.push({ g: '健康问题', t: i.name, s: i.card, act: 'issue', id: i.id }));
  ARCHIVE.timeline.forEach(t => idx.push({ g: '时间线', t: t.type, s: t.date + '　' + t.text, act: 'go', to: 'timeline' }));
  ARCHIVE.meds.current.concat(ARCHIVE.meds.history).forEach(m => idx.push({ g: '用药', t: m.name, s: m.use, act: 'go', to: 'meds' }));
  allTodos().forEach(t => idx.push({ g: '待办', t: t.text, s: t.meta, act: 'go', to: 'todo' }));
  metricOptions().forEach(m => idx.push({ g: '检验', t: m.name, s: `${m.value} ${m.unit}　${m.date}`, act: 'pick-metric', k: m.key }));
  labs.forEach(r => idx.push({ g: '检验', t: r.name + ' ' + labValueRaw(r) + ' ' + r.unit, s: r.date + '　' + r.category, act: 'pick-metric', k: labKey(r) }));
  symptoms.forEach(s => idx.push({ g: '症状', t: s.part, s: `${s.date}${s.severity ? '　程度 ' + s.severity + '/10' : ''}${s.trigger ? '　' + s.trigger : ''}`, act: 'go', to: 'symptoms' }));
  return idx;
}
function openSearch(q = '') {
  openModal(`
    <div class="search-modal">
      <div class="search">${I.search}<input id="sq" value="${esc(q)}" placeholder="搜索问题、药品、指标、待办" aria-label="搜索"></div>
      <div class="search-results" id="sr"></div>
      <p class="hint" style="margin-top:10px">结果来自本页整理的档案内容与本机检验记录。</p>
    </div>`, 'search-modal');
  const input = $('#sq');
  const draw = () => {
    const kw = input.value.trim().toLowerCase();
    const list = kw ? searchIndex().filter(x => (x.t + ' ' + x.s).toLowerCase().includes(kw)).slice(0, 18) : [];
    $('#sr').innerHTML = kw
      ? (list.length ? list.map(x => `<button class="sr-item" data-act="${x.act}" data-id="${esc(x.id || '')}" data-to="${esc(x.to || '')}" data-k="${esc(x.k || '')}">
            <span class="badge">${esc(x.g)}</span><span>${esc(x.t)}</span><span class="sr-sub">${esc(x.s).slice(0, 46)}</span></button>`).join('')
        : '<div class="empty">没有匹配结果</div>')
      : '<p class="hint" style="padding:6px 4px">输入关键词，例如：指标名、药品名、症状、体重。</p>';
  };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { const f = $('#sr .sr-item'); if (f) f.click(); } });
  draw();
}

/* ---------- 报告原件 ---------- */
let rpDraft = null;

function readAsDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result || ''));
    fr.onerror = () => rej(new Error('read'));
    fr.readAsDataURL(file);
  });
}
function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('img'));
    im.src = src;
  });
}
/* 压到长边 1500px 再存，否则 localStorage 几张就满；本身就是小图就原样保留 */
async function shrinkImage(file) {
  const raw = await readAsDataURL(file);
  if (!/^data:image\//.test(raw)) throw new Error('type');
  const img = await loadImg(raw);
  const scale = Math.min(1, 1500 / Math.max(img.width, img.height));
  if (scale === 1 && raw.length < 420000) return raw;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(img.width * scale));
  cv.height = Math.max(1, Math.round(img.height * scale));
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  let out = cv.toDataURL('image/jpeg', 0.75);
  if (out.length > 900000) out = cv.toDataURL('image/jpeg', 0.6);
  return out;
}

function openReport(id) {
  const rec = id ? reportById(id) : null;
  rpDraft = rec ? { ...rec } : { id: '', date: todayISO(), title: '', panel: '', specimen: '', hospital: '', note: '', file: '' };
  openModal(`
    <div class="modal-head">
      <div><h2>${rec ? '编辑报告' : '添加报告'}</h2><p>原件存在本机浏览器里，不联网、不上传</p></div>
      <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button>
    </div>
    <div id="modalBody"></div>`, 'wide');
  renderReportBody();
}

function renderReportBody() {
  const body = $('#modalBody');
  if (!body || !rpDraft) return;
  body.innerHTML = `
    <form id="rpForm">
      <div class="form-grid rp-fields">
        <div class="field"><label>报告日期 <b>*</b></label><input type="date" name="date" value="${esc(rpDraft.date)}" required></div>
        <div class="field"><label>报告名称 <b>*</b></label><input name="title" value="${esc(rpDraft.title)}" placeholder="如 肝肾常规" maxlength="60" required></div>
        <div class="field"><label>项目组套</label><input name="panel" list="rpPanels" value="${esc(rpDraft.panel)}" placeholder="如 生化" maxlength="20" autocomplete="off">
          <datalist id="rpPanels">${PANELS.map(p => `<option value="${esc(p)}"></option>`).join('')}</datalist></div>
        <div class="field"><label>检验样本</label><input name="specimen" list="rpSpecimens" value="${esc(rpDraft.specimen)}" placeholder="如 血清" maxlength="20" autocomplete="off">
          <datalist id="rpSpecimens">${SPECIMENS.map(p => `<option value="${esc(p)}"></option>`).join('')}</datalist></div>
        <div class="field"><label>医院 / 机构</label><input name="hospital" value="${esc(rpDraft.hospital)}" placeholder="如 北京同仁医院" maxlength="60"></div>
        <div class="field"><label>备注</label><input name="note" value="${esc(rpDraft.note)}" placeholder="如 肾内科门诊、空腹抽血" maxlength="300"></div>
      </div>
      <div class="rp-file">
        <div class="rp-shot">${rpDraft.file
      ? `<img src="${esc(rpDraft.file)}" alt="报告原件预览">`
      : `<span>${I.file}<b>还没有原件</b></span>`}</div>
        <div class="rp-file-l">
          <p class="block-label">报告原件</p>
          <p class="hint">拍照或截图都可以，会压到长边 1500px 后存进本机。没有原件也可以只登记信息。</p>
          <div class="form-actions" style="margin-top:10px">
            <button class="btn btn-ghost" type="button" data-act="rp-pick">${I.upload}选择图片</button>
            ${rpDraft.file ? '<button class="btn btn-plain" type="button" data-act="rp-clear">移除原件</button>' : ''}
          </div>
        </div>
      </div>
      <input type="file" id="rpFile" accept="image/*" hidden>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">保存报告</button>
        <button class="btn btn-ghost" type="button" data-act="close">取消</button>
        <span class="form-msg" id="rpMsg"></span>
      </div>
    </form>`;

  $('#rpForm').addEventListener('submit', e => {
    e.preventDefault();
    syncReportDraft();
    const msg = $('#rpMsg');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rpDraft.date) || !rpDraft.title.trim()) {
      msg.textContent = '日期和名称不能为空。'; msg.className = 'form-msg err'; return;
    }
    const rec = normReport({
      ...rpDraft,
      id: rpDraft.id || (crypto.randomUUID && crypto.randomUUID()) || String(Date.now())
    });
    const exists = reports.some(r => r.id === rec.id);
    const next = exists ? reports.map(r => r.id === rec.id ? rec : r) : [...reports, rec];
    if (!persistReports(next)) { msg.textContent = '保存失败，可能空间不足。'; msg.className = 'form-msg err'; return; }
    closeModal();
    renderLabs();
    toast(exists ? '报告已更新' : '报告已保存到本机');
  });

  $('#rpFile').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    syncReportDraft();
    try {
      rpDraft.file = await shrinkImage(f);
      renderReportBody();
    } catch (err) {
      toast('这张图读不出来，换一张试试');
    }
  });
}

function syncReportDraft() {
  const f = $('#rpForm');
  if (!f || !rpDraft) return;
  const fd = new FormData(f);
  rpDraft.date = String(fd.get('date') || '');
  rpDraft.title = String(fd.get('title') || '');
  rpDraft.panel = String(fd.get('panel') || '');
  rpDraft.specimen = String(fd.get('specimen') || '');
  rpDraft.hospital = String(fd.get('hospital') || '');
  rpDraft.note = String(fd.get('note') || '');
}

function viewReport(id) {
  const rec = reportById(id);
  if (!rec) { toast('这份报告已不存在'); return; }
  const n = labCountOf(id);
  openModal(`
    <div class="modal-head">
      <div><h2>${esc(rec.title)}</h2><p>${esc(rec.date)}${reportMeta(rec) ? '　·　' + reportMeta(rec) : ''}　·　关联 ${n} 项结果</p></div>
      <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button>
    </div>
    ${rec.note ? `<p class="hint" style="margin-bottom:10px">${esc(rec.note)}</p>` : ''}
    <div class="rp-view">${rec.file
      ? `<img src="${esc(rec.file)}" alt="${esc(rec.title)} 原件">`
      : '<div class="empty">这份报告只登记了信息，没有存原件图片。</div>'}</div>
    <div class="form-actions">
      <button class="btn btn-ghost" data-act="editreport" data-id="${esc(rec.id)}">编辑</button>
      <button class="btn btn-ghost" data-act="close">关闭</button>
    </div>`, 'wide');
}

function reportOptions(selected, withNew) {
  const opts = ['<option value="">不关联</option>'];
  reports.slice().sort((a, b) => b.date.localeCompare(a.date)).forEach(r => {
    const tag = [r.panel, r.specimen].filter(Boolean).join(' · ');
    opts.push(`<option value="${esc(r.id)}" ${r.id === selected ? 'selected' : ''}>${esc(r.date)}　${esc(r.title)}${tag ? '［' + esc(tag) + '］' : ''}${r.hospital ? '（' + esc(r.hospital) + '）' : ''}</option>`);
  });
  if (withNew) opts.push(`<option value="__new" ${selected === '__new' ? 'selected' : ''}>＋ 新建一份报告</option>`);
  return opts.join('');
}

/* ---------- 备份 ---------- */
function exportAll() {
  // 服务模式下图片在磁盘上，需要服务端把文件读回 base64 才能换机恢复
  if (storeMode === 'server') {
    const a = document.createElement('a');
    a.href = API + '/export';
    a.download = `健康档案备份-${todayISO()}.json`;
    a.click();
    markExported();
    toast('备份已生成（含报告图片，请确认下载目录）');
    return;
  }
  const payload = {
    format: 'health-archive', version: 2, exportedAt: new Date().toISOString(),
    labs, weights: state.weights, body: state.body, done: state.done, reports,
    allergies, familyHistory, surgeries, visits, medications, symptoms
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `健康档案备份-${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const mb = (json.length / 1048576).toFixed(1);
  markExported();
  toast(reports.some(r => r.file) ? `备份已生成（含报告图片，约 ${mb} MB）` : '备份已生成，请保存到安全位置');
}

/* 合并导入的检验记录：同一天 / 同项目 / 同单位的视为同一条，以文件里的为准。
   和粘贴导入的规则保持一致，重复导入不会翻倍。 */
function mergeLabsByKey(recs) {
  const keyOf = r => `${r.date}|${String(r.category || '').trim()}|${String(r.name || '').trim()}|${String(r.unit || '').trim()}`;
  const inc = new Map(recs.map(r => [keyOf(r), r]));
  const kept = labs.filter(r => {
    const h = inc.get(keyOf(r));
    return !h || h.id === r.id;
  });
  const map = new Map(kept.map(r => [r.id, r]));
  recs.forEach(r => map.set(r.id, r));
  return [...map.values()];
}

/* 合并导入的报告：先按 id；再按「日期 + 名称」认作同一份（换过设备的备份、
   重新生成的录入包都不会多出一份）。同一份时用文件里非空的字段覆盖，
   文件里没有的（比如没带图）保留本机已有的。
   返回 idMap：文件里的报告 id → 本机实际的 id，供重指检验记录的 reportId。 */
function mergeReports(recs) {
  const next = reports.map(r => ({ ...r }));
  const idMap = new Map();
  recs.forEach(src => {
    let hit = next.find(r => r.id === src.id) || next.find(r => r.date === src.date && r.title === src.title);
    if (!hit) {
      const rec = { ...src };
      next.push(rec);
      idMap.set(src.id, rec.id);
      return;
    }
    idMap.set(src.id, hit.id);
    Object.keys(src).forEach(k => {
      if (k === 'id') return;
      const v = src[k];
      if (v === '' || v === undefined || v === null) return;
      hit[k] = v;
    });
    if (!hit.createdAt) hit.createdAt = src.createdAt || Date.now();
  });
  return { list: next, idMap };
}
/* 把文件里记录的 reportId 换成本机实际的报告 id，避免指向不存在的报告 */
function remapReportIds(recs, idMap) {
  if (!idMap.size) return recs;
  return recs.map(r => (r.reportId && idMap.has(r.reportId) && idMap.get(r.reportId) !== r.reportId)
    ? { ...r, reportId: idMap.get(r.reportId) } : r);
}

async function importFile(file) {
  try {
    const obj = JSON.parse(await file.text());
    let okCount = 0, wCount = 0, rCount = 0, bCount = 0;
    // 报告先合，拿到 id 映射；再把检验记录的 reportId 换成本机实际的报告
    let idMap = new Map();
    if (obj.format === 'health-archive' && Array.isArray(obj.reports)) {
      const valid = obj.reports.filter(validReport).map(normReport);
      const merged = mergeReports(valid);
      idMap = merged.idMap;
      if (!persistReports(merged.list)) return;
      rCount = valid.length;
    }
    if (obj.format === 'health-labs' && Array.isArray(obj.records)) {
      const recs = obj.records.filter(validLab);
      if (!recs.length && obj.records.length) throw new Error('invalid');
      if (!persistLabs(mergeLabsByKey(recs))) return;
      okCount = recs.length;
    } else if (obj.format === 'health-archive' && Array.isArray(obj.labs)) {
      const recs = remapReportIds(obj.labs.filter(validLab), idMap);
      if (!persistLabs(mergeLabsByKey(recs))) return;
      if (Array.isArray(obj.weights)) {
        const wm = new Map(state.weights.map(w => [w.id, w]));
        obj.weights.filter(w => w && typeof w.date === 'string' && Number.isFinite(w.kg)).forEach(w => wm.set(w.id, w));
        state.weights = [...wm.values()];
      }
      if (Array.isArray(obj.body)) {
        const bm = new Map(state.body.map(b => [b.id, b]));
        obj.body.filter(validBody).map(normBody).forEach(b => bm.set(b.id, b));
        state.body = [...bm.values()];
      }
      if (obj.done && typeof obj.done === 'object') state.done = { ...state.done, ...obj.done };
      let hCount = 0;
      if (Array.isArray(obj.allergies)) {
        const am = new Map(allergies.map(x => [x.id, x]));
        obj.allergies.filter(validAllergy).map(normAllergy).forEach(x => am.set(x.id, x));
        allergies = [...am.values()]; hCount += obj.allergies.length;
      }
      if (Array.isArray(obj.familyHistory)) {
        const fm = new Map(familyHistory.map(x => [x.id, x]));
        obj.familyHistory.filter(validFamily).map(normFamily).forEach(x => fm.set(x.id, x));
        familyHistory = [...fm.values()]; hCount += obj.familyHistory.length;
      }
      if (Array.isArray(obj.surgeries)) {
        const sm = new Map(surgeries.map(x => [x.id, x]));
        obj.surgeries.filter(validSurgery).map(normSurgery).forEach(x => sm.set(x.id, x));
        surgeries = [...sm.values()]; hCount += obj.surgeries.length;
      }
      if (Array.isArray(obj.visits)) {
        const vm = new Map(visits.map(x => [x.id, x]));
        obj.visits.filter(validVisit).map(normVisit).forEach(x => vm.set(x.id, x));
        visits = [...vm.values()]; hCount += obj.visits.length;
      }
      if (Array.isArray(obj.medications)) {
        const mm = new Map(medications.map(x => [x.id, x]));
        obj.medications.filter(validMedication).map(normMedication).forEach(x => mm.set(x.id, x));
        medications = [...mm.values()]; hCount += obj.medications.length;
      }
      if (Array.isArray(obj.symptoms)) {
        const sm = new Map(symptoms.map(x => [x.id, x]));
        obj.symptoms.filter(validSymptom).map(normSymptom).forEach(x => sm.set(x.id, x));
        symptoms = [...sm.values()];
        persistSymptoms();
      }
      if (Array.isArray(obj.dietDays)) {
        const dm = new Map(dietDays.map(x => [x.id, x]));
        obj.dietDays.filter(validDietDay).map(normDietDay).forEach(x => dm.set(x.id, x));
        dietDays = [...dm.values()];
        persistDietDays();
      }
      if (Array.isArray(obj.dietWeeks)) {
        const wm = new Map(dietWeeks.map(x => [x.id, x]));
        obj.dietWeeks.filter(validDietWeek).map(normDietWeek).forEach(x => wm.set(x.id, x));
        dietWeeks = [...wm.values()];
        persistDietWeeks();
      }
      if (hCount) persistHistory();
      persistState();
      okCount = recs.length;
      wCount = Array.isArray(obj.weights) ? obj.weights.length : 0;
      bCount = Array.isArray(obj.body) ? obj.body.filter(validBody).length : 0;
    } else if (obj.format !== 'health-labs') {
      throw new Error('unknown');
    }
    closeModal();
    route();
    toast(`已导入：检验 ${okCount} 条${wCount ? `、体重 ${wCount} 条` : ''}${bCount ? `、围度 ${bCount} 条` : ''}${rCount ? `、报告 ${rCount} 份` : ''}`);
  } catch (e) {
    toast('导入失败：文件格式不正确，原有数据未改变');
  }
}

/* ---------- 导入：粘贴文本 / CSV / JSON ---------- */
const IMP_SAMPLE = `2026-10-20
血常规
项目名称\t结果\t单位\t参考范围\t提示
白细胞计数\t6.23\t10^9/L\t3.5-9.5
红细胞计数\t4.85\t10^12/L\t4.3-5.8
血红蛋白\t148\tg/L\t130-175
血小板计数\t212\t10^9/L\t125-350
肝功能
丙氨酸氨基转移酶（ALT）\t38\tU/L\t9-50
总胆红素\t24.6\tμmol/L\t3.4-20.5\t↑
肾功能
肌酐\t92\tμmol/L\t57-97
尿酸\t486\tμmol/L\t208-428\t↑`;

let imp = null;

/* ---------- 本机识别服务（可选）：图片 → 文字 ---------- */
/* 只做「认字」，不做字段判断。识别结果进 textarea，仍走人工核对那一步。
   服务地址见文件顶部的 OCR_URL（服务托管时与页面同源）。 */
function ocrCall(path, opts = {}, ms = 20000) {
  return storage.ocr(path, opts, ms);
}

async function ocrPing() {
  try {
    const r = await ocrCall('/ping', {}, 1500);
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.ok ? j : null;
  } catch (e) {
    return null;
  }
}

function setOcrState(html, cls) {
  const box = $('#ocrState');
  if (!box) return;
  box.className = 'ocr-state' + (cls ? ' ' + cls : '');
  box.innerHTML = html;
}

async function ocrCheck() {
  const svc = await ocrPing();
  if (!imp || imp.mode !== 'image') return;
  if (!svc) {
    setOcrState(`<b>识别服务没在运行</b><span>双击 <code>启动健康档案.bat</code>，看到绿色的「引擎 就绪」后回到这里，按「重新检测」。</span>
      <button class="btn btn-mini" data-act="ocr-check">重新检测</button>`, 'warn');
  } else if (!svc.ready) {
    setOcrState(`<b>识别服务正在加载</b><span>首次启动要几秒，稍等一下再点「重新检测」。</span>
      <button class="btn btn-mini" data-act="ocr-check">重新检测</button>`);
  } else {
    setOcrState(`<b>识别服务已就绪</b><span>${esc(svc.engine || 'rapidocr')} · 图片不落盘、不出本机</span>`, 'ok');
  }
}

async function ocrImages(files) {
  const texts = [];
  let low = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    setOcrState(`<b>正在识别第 ${i + 1}/${files.length} 张</b><span>${esc(f.name)}</span>`);
    const r = await ocrCall('/ocr', {
      method: 'POST',
      body: f,
      headers: { 'Content-Type': f.type || 'image/jpeg' }
    }, 90000);
    let j = null;
    try { j = await r.json(); } catch (e) { /* 非 JSON，按失败处理 */ }
    if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || `识别服务返回 ${r.status}`);
    j.lines.forEach(l => texts.push(l.text));
    low += j.low || 0;
  }
  return { text: texts.join('\n'), low, n: texts.length };
}

function openImport(mode = 'text') {
  imp = { mode, rows: [], skipped: [], date: todayISO(), source: '', raw: '', ocrText: '', ocrFiles: [], parsed: false, err: '', reportId: '', meta: { specimen: '', apply: '' }, dev: null };
  openModal(`
    <div class="modal-head">
      <div><h2>导入数据</h2><p>解析在本机完成，内容不会离开这台设备</p></div>
      <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button>
    </div>
    <div class="tabs" id="impTabs">
      <button data-act="imp-tab" data-k="text" class="${mode === 'text' ? 'on' : ''}">粘贴文本</button>
      <button data-act="imp-tab" data-k="image" class="${mode === 'image' ? 'on' : ''}">图片识别</button>
      <button data-act="imp-tab" data-k="csv" class="${mode === 'csv' ? 'on' : ''}">CSV 文件</button>
      <button data-act="imp-tab" data-k="json" class="${mode === 'json' ? 'on' : ''}">JSON 备份</button>
      <button data-act="imp-tab" data-k="device" class="${mode === 'device' ? 'on' : ''}">设备数据</button>
    </div>
    <div id="impBody"></div>`, 'wide import-modal');
  renderImportBody();
}

function renderImportBody() {
  const body = $('#impBody');
  if (!body || !imp) return;
  $$('#impTabs button').forEach(b => b.classList.toggle('on', b.dataset.k === imp.mode));
  if (imp.mode === 'device') {
    body.innerHTML = (imp.dev && imp.dev.parsed) ? importDeviceHTML() : importDevicePickerHTML(imp.err);
    return;
  }
  if (imp.parsed) { body.innerHTML = importPreviewHTML(); return; }

  const tips = imp.err ? `<div class="notice err" style="margin-bottom:14px">${I.info}<p>${esc(imp.err)}</p></div>` : '';
  const meta = `
    <div class="form-grid" style="margin-top:12px">
      <div class="field"><label>默认日期</label><input type="date" id="impDate" value="${esc(imp.date)}"></div>
      <div class="field"><label>报告来源</label><input id="impSource" value="${esc(imp.source)}" maxlength="60" placeholder="如 市一院体检中心"></div>
    </div>`;

  if (imp.mode === 'text') {
    body.innerHTML = `${tips}
      <div class="field"><label>粘贴化验单或体检报告的文字</label>
        <textarea id="impText" class="imp-text" placeholder="从医院 App 或体检报告里选中文字复制过来，保留原来的换行即可。&#10;&#10;尿酸&#9;486&#9;μmol/L&#9;208-428&#9;↑">${esc(imp.raw)}</textarea>
      </div>
      ${meta}
      <p class="hint" style="margin-top:10px">正文里带日期时以正文为准。识别不到的行不会写入，下一步可以逐条查看跳过原因。</p>
      <div class="form-actions">
        <button class="btn btn-primary" data-act="imp-parse">解析预览</button>
        <button class="btn btn-ghost" data-act="imp-sample">填入示例</button>
      </div>`;
    const ta = $('#impText');
    if (ta) ta.addEventListener('input', e => { imp.raw = e.target.value; });
  } else if (imp.mode === 'image') {
    body.innerHTML = `${tips}
      <div class="imp-drop">${I.upload}
        <b>选择报告照片</b>
        <p>手机拍的检验单、体检报告都行，可一次选多张。识别只在这台机器的服务里跑，照片不落盘、不上传。</p>
        <button class="btn btn-ghost" data-act="imp-file-img">选择图片</button>
      </div>
      <div class="ocr-state" id="ocrState"><b>正在检查识别服务…</b></div>
      ${imp.ocrText ? `
      <div class="field" style="margin-top:16px"><label>识别到的文字（认错的字可以直接改）</label>
        <textarea id="impText" class="imp-text">${esc(imp.ocrText)}</textarea>
      </div>` : ''}
      <p class="hint" style="margin-top:10px">识别只负责把图变成文字，指标名、单位、箭头都要在下一步的表里核对。字迹模糊的行会标出来。</p>
      <div class="form-actions">
        ${imp.ocrText ? '<button class="btn btn-primary" data-act="imp-parse">解析预览</button>' : ''}
        <button class="btn btn-ghost" data-act="imp-file-img">${imp.ocrText ? '再识别一张' : '选择图片'}</button>
      </div>`;
    const ta = $('#impText');
    if (ta) ta.addEventListener('input', e => { imp.ocrText = e.target.value; imp.raw = e.target.value; });
    ocrCheck();
  } else if (imp.mode === 'csv') {
    body.innerHTML = `${tips}
      <div class="imp-drop">${I.file}
        <b>选择体检中心导出的表格</b>
        <p>CSV / TSV 均可。表头里要有「项目」和「结果」两列，单位、参考范围、日期有就更好。</p>
        <button class="btn btn-ghost" data-act="imp-file-csv">选择文件</button>
      </div>
      ${meta}
      <p class="hint" style="margin-top:10px">Excel 文件请先「另存为 CSV」。若表头识别不出来，可以改存成文本再走「粘贴文本」。</p>`;
  } else {
    body.innerHTML = `${tips}
      <div class="imp-drop">${I.upload}
        <b>导入之前导出的 JSON 备份</b>
        <p>用于换设备或恢复数据。同一条记录按 id 合并，不会重复。</p>
        <button class="btn btn-ghost" data-act="imp-file-json">选择文件</button>
      </div>
      <p class="hint" style="margin-top:10px">这是整库恢复，会覆盖同 id 的记录；只想补几条新指标，用「粘贴文本」更稳。</p>`;
  }
}

/* ---------------- 小米设备 CSV 导入（体重/体脂 + 睡眠） ---------------- */
/* 通用分隔文本解析：支持逗号 / 制表符与双引号包裹、"" 转义（Value 里含 JSON 逗号）。 */
function parseDelimited(text, delim) {
  const out = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') { q = true; }
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); out.push(row); row = []; cur = ''; }
    else if (ch === '\r') { /* 忽略 */ }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); out.push(row); }
  return out;
}
function unixToLocalDate(sec) {
  const ms = sec * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function unixToUtcDate(sec) {
  const ms = sec * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function unixToLocalHM(sec) {
  const d = new Date(sec * 1000 + 8 * 3600 * 1000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function parseScaleRows(rows, idx) {
  const out = []; const skipped = [];
  const n2 = s => { const v = parseFloat(s); return Number.isFinite(v) ? v : null; };
  const pos = v => (v != null && v > 0) ? v : null;
  rows.forEach((r, n) => {
    if (!r || !r.join('').trim()) return;
    const t = n2(r[idx('time')]);
    const kg = pos(n2(r[idx('weight')]));
    if (t == null || kg == null) { skipped.push({ line: '第 ' + (n + 2) + ' 行', why: '缺少时间或体重' }); return; }
    const date = unixToLocalDate(t);
    if (!date) { skipped.push({ line: '第 ' + (n + 2) + ' 行', why: '时间戳无效' }); return; }
    out.push({
      id: 'mi-scale-' + Math.floor(t), date, kg,
      bodyFat: pos(n2(r[idx('bfp')])), muscle: pos(n2(r[idx('smm')])),
      bmi: pos(n2(r[idx('bmi')])), visceralFat: pos(n2(r[idx('vfl')])),
      bmr: pos(n2(r[idx('bmr')])), bone: pos(n2(r[idx('bmc')])),
      tag: 'device', note: '小米体脂秤导入', include: true
    });
  });
  return { kind: 'weight', rows: out, skipped };
}
function parseSleepRows(rows, idx) {
  const out = []; const skipped = [];
  rows.forEach((r, n) => {
    if (!r || !r.join('').trim()) return;
    if ((r[idx('Key')] || '').trim() !== 'sleep') return;
    // 去重：同一天 daily_mark 与 daily_report 都有，只取含分段详情的 daily_report。
    if ((r[idx('Tag')] || '').trim() !== 'daily_report') return;
    const t = parseFloat(r[idx('Time')]);
    let v; try { v = JSON.parse(r[idx('Value')]); } catch (e) { skipped.push({ line: '第 ' + (n + 2) + ' 行', why: 'Value 不是合法 JSON' }); return; }
    if (!v) return;
    const minutes = Number(v.total_duration);
    if (!Number.isFinite(minutes) || minutes <= 0) { skipped.push({ line: '第 ' + (n + 2) + ' 行', why: '这一天没有睡眠时长' }); return; }
    const date = unixToUtcDate(t);
    if (!date) return;
    const seg = Array.isArray(v.segment_details) && v.segment_details[0] ? v.segment_details[0] : null;
    out.push({
      id: 'mi-sleep-' + date, date,
      hours: Math.round((minutes / 60) * 100) / 100, minutes,
      score: Number.isFinite(Number(v.sleep_score)) ? Number(v.sleep_score) : null,
      bedtime: seg && Number.isFinite(Number(seg.bedtime)) ? unixToLocalHM(Number(seg.bedtime)) : '',
      wake: seg && Number.isFinite(Number(seg.wake_up_time)) ? unixToLocalHM(Number(seg.wake_up_time)) : '',
      source: 'mi-band', note: '小米手环导入', include: true
    });
  });
  return { kind: 'sleep', rows: out, skipped };
}
function parseXiaomiCSV(text, filename) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  if (!clean.trim()) return { error: '文件是空的：' + (filename || '') };
  const nl = clean.indexOf('\n');
  const firstLine = nl >= 0 ? clean.slice(0, nl) : clean;
  const delim = firstLine.split('\t').length > firstLine.split(',').length ? '\t' : ',';
  const rows = parseDelimited(clean, delim);
  if (!rows.length) return { error: '文件里没有可解析的内容' };
  const header = rows[0].map(h => String(h).trim());
  const idx = name => header.findIndex(h => h.toLowerCase() === String(name).toLowerCase());
  if (idx('weight') >= 0 && (idx('bfp') >= 0 || idx('smm') >= 0 || idx('bmi') >= 0)) {
    return parseScaleRows(rows.slice(1), idx);
  }
  if (idx('Key') >= 0 && idx('Tag') >= 0 && idx('Value') >= 0 && idx('Time') >= 0) {
    return parseSleepRows(rows.slice(1), idx);
  }
  return { error: '认不出这是哪类小米设备文件：请选体脂秤 *_scale_record.csv，或运动健康 *_hlth_center_aggregated_fitness_data.csv。' };
}
function importDevicePickerHTML(err) {
  return `
    <div class="notice" style="margin-bottom:12px">${I.info}<p>支持小米体脂秤「*_scale_record.csv」（体重 + 体脂率/肌肉量/BMI/内脏脂肪/基础代谢/骨量）与运动健康「*_hlth_center_aggregated_fitness_data.csv」（每日睡眠）。可一次选多个文件。解析只在本机完成，不上传。</p></div>
    ${err ? `<div class="notice err" style="margin-bottom:12px">${I.info}<p>${esc(err)}</p></div>` : ''}
    <div class="imp-drop">${I.file}
      <b>选择小米设备导出的 CSV</b>
      <p>体脂秤文件认 weight / bfp / smm 等列；睡眠文件认 Key / Tag / Value 列。重复导入按时间与日期去重，不会重复。</p>
      <button class="btn btn-ghost" data-act="imp-file-device">选择文件</button>
    </div>
    <p class="hint" style="margin-top:10px">体重记录会并入「减重记录」，体脂成分进入身体成分卡；睡眠记录进入「睡眠」页。原始文件不落盘。</p>`;
}
function importDeviceHTML() {
  const d = imp.dev;
  const w = d.weightRows || [], s = d.sleepRows || [];
  const wPick = w.filter(r => r.include).length, sPick = s.filter(r => r.include).length;
  const wTable = w.length ? `
    <div class="imp-scroll">
      <table class="imp-table">
        <thead><tr><th></th><th>日期</th><th>体重 kg</th><th>体脂 %</th><th>肌肉 kg</th><th>BMI</th><th>内脏脂肪</th><th>BMR</th><th>骨量 kg</th></tr></thead>
        <tbody>${w.map((r, i) => `<tr class="${r.include ? '' : 'off'}">
          <td><input type="checkbox" data-devchk="w" data-i="${i}" ${r.include ? 'checked' : ''}></td>
          <td>${esc(r.date)}</td>
          <td class="num">${r.kg == null ? '—' : r.kg}</td>
          <td class="num">${r.bodyFat == null ? '—' : r.bodyFat}</td>
          <td class="num">${r.muscle == null ? '—' : r.muscle}</td>
          <td class="num">${r.bmi == null ? '—' : r.bmi}</td>
          <td class="num">${r.visceralFat == null ? '—' : r.visceralFat}</td>
          <td class="num">${r.bmr == null ? '—' : r.bmr}</td>
          <td class="num">${r.bone == null ? '—' : r.bone}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : '';
  const sTable = s.length ? `
    <div class="imp-scroll" style="margin-top:14px">
      <table class="imp-table">
        <thead><tr><th></th><th>日期</th><th>睡眠 h</th><th>折算分钟</th><th>评分</th><th>入睡 / 起床</th></tr></thead>
        <tbody>${s.map((r, i) => `<tr class="${r.include ? '' : 'off'}">
          <td><input type="checkbox" data-devchk="s" data-i="${i}" ${r.include ? 'checked' : ''}></td>
          <td>${esc(r.date)}</td>
          <td class="num">${num(r.hours, 2)}</td>
          <td class="num">${Math.round(r.minutes)}</td>
          <td class="num">${r.score == null ? '—' : r.score}</td>
          <td>${esc([r.bedtime, r.wake].filter(Boolean).join(' → ') || '—')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : '';
  return `
    <div class="imp-stat">
      <div><b>${w.length}</b><span>体重 / 体脂</span></div>
      <div><b>${s.length}</b><span>睡眠</span></div>
      <div><b id="devCommitN">${wPick + sPick}</b><span>将写入</span></div>
      <div><b>${(d.skipped || []).length}</b><span>跳过</span></div>
    </div>
    <p class="hint" style="margin:8px 0">已按 时间 / 日期 去重；与库里已有记录按 id 合并，重复导入不会产生重复。</p>
    ${wTable}${sTable}
    <details class="imp-skip" ${(d.skipped || []).length ? '' : 'hidden'}>
      <summary>跳过 ${(d.skipped || []).length} 行，查看原因</summary>
      <ul>${(d.skipped || []).slice(0, 40).map(x => `<li><code>${esc(x.line)}</code><span>${esc(x.why)}</span></li>`).join('') || '<li><span>没有跳过内容</span></li>'}</ul>
    </details>
    <div class="form-actions">
      <button class="btn btn-primary" data-act="imp-device-commit">写入 <span>${wPick + sPick}</span> 条</button>
      <button class="btn btn-ghost" data-act="imp-back">返回修改</button>
      <span class="form-msg" id="impMsg"></span>
    </div>`;
}
function commitDeviceImport() {
  const d = imp.dev;
  if (!d) return;
  const w = (d.weightRows || []).filter(r => r.include);
  const s = (d.sleepRows || []).filter(r => r.include);
  if (!w.length && !s.length) { toast('还没有勾选任何记录'); return; }
  let wAdd = 0, wUpd = 0, sAdd = 0, sUpd = 0;
  if (w.length) {
    const map = new Map(state.weights.map(x => [x.id, x]));
    w.forEach(r => {
      const rec = { id: r.id, date: r.date, kg: r.kg, tag: 'device', waist: null,
        note: r.note, bodyFat: r.bodyFat, muscle: r.muscle, bmi: r.bmi,
        visceralFat: r.visceralFat, bmr: r.bmr, bone: r.bone };
      if (map.has(r.id)) wUpd++; else wAdd++;
      map.set(r.id, rec);
    });
    state.weights = [...map.values()];
    if (!persistState()) return;
  }
  if (s.length) {
    const map = new Map(sleepLogs.map(x => [x.id, x]));
    s.forEach(r => {
      const rec = normSleepLog({ id: r.id, date: r.date, hours: r.hours, minutes: r.minutes,
        score: r.score, bedtime: r.bedtime, wake: r.wake, note: r.note, source: r.source, createdAt: Date.now() });
      if (map.has(r.id)) sUpd++; else sAdd++;
      map.set(r.id, rec);
    });
    sleepLogs = [...map.values()];
    if (!persistSleepLogs()) return;
  }
  closeModal();
  const parts = [];
  if (w.length) parts.push(`体重/体脂 新增 ${wAdd}${wUpd ? '、更新 ' + wUpd : ''}`);
  if (s.length) parts.push(`睡眠 新增 ${sAdd}${sUpd ? '、更新 ' + sUpd : ''}`);
  toast('导入完成：' + parts.join('；'));
  route();
}

function refText(r) {
  if (r.low === null && r.high === null) return '—';
  if (r.low === null) return `<${r.high}`;
  if (r.high === null) return `>${r.low}`;
  return `${r.low} – ${r.high}`;
}

/* 从报告表头的「申请项目」猜一个组套名，只用于填写框预填，用户可改。
   猜不出来就留空——不为了好看编一个。 */
function guessPanel(apply) {
  const s = String(apply || '');
  if (!s) return '';
  const direct = PANELS.find(p => s.includes(p));
  if (direct) return direct;
  if (/肝肾|肝功|肾功|生化|电解质|心肌|血糖|血脂/.test(s)) return '生化';
  if (/血细胞|全血|血常规/.test(s)) return '血常规';
  if (/尿/.test(s)) return '尿常规';
  return '';
}

function importPreviewHTML() {
  const rows = imp.rows;
  const picked = rows.filter(r => r.include);
  const need = rows.filter(r => r.conf !== 'high').length;
  const preSpec = (imp.meta && imp.meta.specimen) || '';
  const prePanel = guessPanel(imp.meta && imp.meta.apply);
  const preNote = preSpec || prePanel
    ? `已按报告表头预填：${[prePanel, preSpec].filter(Boolean).map(esc).join(' · ')}，可改`
    : '';
  return `
    <div class="imp-stat">
      <div><b>${rows.length}</b><span>识别到</span></div>
      <div><b id="impPick">${picked.length}</b><span>将写入</span></div>
      <div class="${need ? 'warn' : ''}"><b>${need}</b><span>需确认</span></div>
      <div><b>${imp.skipped.length}</b><span>跳过</span></div>
    </div>
    <div class="imp-tools">
      <label class="imp-check"><input type="checkbox" id="impAll" ${picked.length === rows.length ? 'checked' : ''}> 全选</label>
      <span class="imp-swipe">左右滑动查看全部列</span>
      <span class="hint">类别按项目名推断，可直接改；数值与单位照报告原文，不做换算。</span>
    </div>
    <div class="imp-scroll">
      <table class="imp-table">
        <thead><tr><th></th><th>日期</th><th>项目</th><th>结果</th><th>提示</th><th>单位</th><th>参考范围</th><th>类别</th></tr></thead>
        <tbody>${rows.map((r, i) => impRowHTML(r, i)).join('')}</tbody>
      </table>
    </div>
    <div class="imp-report-bar">
      <label for="impReport">归到</label>
      <select id="impReport">${reportOptions(imp.reportId, true)}</select>
      <div class="imp-new" id="impNewWrap" ${imp.reportId === '__new' ? '' : 'hidden'}>
        <input type="date" id="impNewDate" value="${esc(imp.date)}">
        <input id="impNewTitle" placeholder="报告名称" maxlength="60">
        <input id="impNewPanel" list="impNewPanels" placeholder="项目组套（生化）" maxlength="20" autocomplete="off" value="${esc(prePanel)}">
        <datalist id="impNewPanels">${PANELS.map(p => `<option value="${esc(p)}"></option>`).join('')}</datalist>
        <input id="impNewSpec" list="impNewSpecs" placeholder="检验样本（血清）" maxlength="20" autocomplete="off" value="${esc(preSpec)}">
        <datalist id="impNewSpecs">${SPECIMENS.map(p => `<option value="${esc(p)}"></option>`).join('')}</datalist>
        <input id="impNewHospital" placeholder="医院" maxlength="60">
      </div>
      ${preNote ? `<span class="imp-pre" style="flex-basis:100%">${preNote}</span>` : ''}
      <span class="hint">${imp.ocrFiles && imp.ocrFiles.length
        ? '选「＋ 新建一份报告」会把刚才的照片一并存成原件'
        : (reports.length ? '这批结果会指向所选报告的原件' : '还没有报告原件，可以选「＋ 新建一份报告」')}</span>
    </div>
    <details class="imp-skip" ${imp.skipped.length ? '' : 'hidden'}>
      <summary>跳过 ${imp.skipped.length} 行，查看原因</summary>
      <ul>${imp.skipped.slice(0, 40).map(s => `<li><code>${esc(s.line)}</code><span>${esc(s.why)}</span></li>`).join('') || '<li><span>没有跳过内容</span></li>'}</ul>
    </details>
    <div class="form-actions">
      <button class="btn btn-primary" data-act="imp-commit">写入 <span id="impCommitN">${picked.length}</span> 条</button>
      <button class="btn btn-ghost" data-act="imp-back">返回修改</button>
      <span class="form-msg" id="impMsg"></span>
    </div>`;
}

/* 预览表上的提示写「该怎么办」，而不只是「缺什么」 */
const PROB_TEXT = {
  '缺单位': '未识别到单位，勾选后按 — 记录',
  '缺参考范围': '报告没印参考区间',
  '项目名可能粘连': '项目名过长，建议拆开',
  '报告标↑，数值却在区间内': '报告标↑但数值在区间内，请核对原件',
  '报告标↓，数值却在区间内': '报告标↓但数值在区间内，请核对原件'
};
function probText(p) { return PROB_TEXT[p] || p; }

/* 提示列：只表达「这份报告怎么标的」，不把箭头塞进数值里 */
function flagCell(r) {
  if (r.flag === 'H') return '<span class="fl up" title="报告标 ↑ / 定性异常">↑</span>';
  if (r.flag === 'L') return '<span class="fl down" title="报告标 ↓">↓</span>';
  if (r.qualitative && !(typeof r.value === 'number' && Number.isFinite(r.value))) {
    if (r.flag === 'N') return '<span class="fl ok">正常</span>';
    return '<span class="fl na" title="定性结果">—</span>';
  }
  const over = r.low !== null && typeof r.value === 'number' && r.value < r.low;
  const high = r.high !== null && typeof r.value === 'number' && r.value > r.high;
  if (over || high) return `<span class="fl calc" title="数值超出所填参考范围，报告未标注">${over ? '↓' : '↑'}</span>`;
  if (r.low === null && r.high === null) return '<span class="fl na" title="没有参考范围，无法判断">—</span>';
  return '<span class="fl ok">在区间内</span>';
}

function impRowHTML(r, i) {
  const bad = r.conf === 'low';
  const hasNum = typeof r.value === 'number' && Number.isFinite(r.value);
  const out = hasNum && ((r.low !== null && r.value < r.low) || (r.high !== null && r.value > r.high));
  return `<tr class="${r.include ? '' : 'off'}${bad ? ' low' : ''}" data-row="${i}">
    <td><input type="checkbox" data-imp-check="${i}" ${r.include ? 'checked' : ''} aria-label="选择这一行"></td>
    <td><input type="date" class="imp-in date" value="${esc(r.date)}" data-imp="date" data-i="${i}"></td>
    <td><input class="imp-in name" value="${esc(r.name)}" data-imp="name" data-i="${i}" maxlength="80">${r.problems.length ? `<span class="imp-note">${esc(r.problems.map(probText).join('、'))}</span>` : ''}</td>
    <td class="num${out || r.flag ? ' mark' : ''}">${labValueText(r)}</td>
    <td class="flag">${flagCell(r)}</td>
    <td><input class="imp-in unit" value="${esc(r.unit)}" data-imp="unit" data-i="${i}" placeholder="—" maxlength="40"></td>
    <td class="ref">${refText(r)}</td>
    <td><select class="imp-in cat" data-imp="category" data-i="${i}">${CATS.map(c => `<option ${c === r.category ? 'selected' : ''}>${c}</option>`).join('')}</select></td>
  </tr>`;
}

function refreshImpStat() {
  const n = imp.rows.filter(r => r.include).length;
  const a = $('#impPick'), b = $('#impCommitN');
  if (a) a.textContent = n;
  if (b) b.textContent = n;
}

function applyParsed(res) {
  if (res.error) { imp.err = res.error; imp.parsed = false; renderImportBody(); return; }
  if (!res.rows.length) {
    imp.err = '没有识别到可用的检验结果。检查一下是否复制到了数值那一列，或改用 CSV。';
    imp.parsed = false;
    renderImportBody();
    return;
  }
  imp.rows = res.rows.map(r => ({ ...r, include: r.conf !== 'low' }));
  imp.skipped = res.skipped || [];
  imp.meta = res.meta || { specimen: '', apply: '' };
  imp.err = '';
  imp.parsed = true;
  renderImportBody();
}

async function commitImport() {
  const picked = imp.rows.filter(r => r.include);
  if (!picked.length) { toast('还没有勾选任何记录'); return; }

  // 先确定这批结果归到哪份报告：已有 / 现场新建 / 不关联
  let rid = imp.reportId && imp.reportId !== '__new' ? imp.reportId : '';
  if (imp.reportId === '__new') {
    const d = ($('#impNewDate') || {}).value || imp.date;
    const t = (($('#impNewTitle') || {}).value || '').trim();
    const pn = (($('#impNewPanel') || {}).value || '').trim();
    const sp = (($('#impNewSpec') || {}).value || '').trim();
    const h = (($('#impNewHospital') || {}).value || '').trim();
    if (!t) { toast('新报告还没填名称'); return; }
    // 走图片识别来的，照片已经在手里，直接一起存成原件，不用再传一次
    let file = '';
    if (imp.ocrFiles && imp.ocrFiles.length) {
      try {
        file = await shrinkImage(imp.ocrFiles[0]);
      } catch (e) {
        file = '';
        toast('照片存原件失败，报告仍会创建，可以稍后补传');
      }
    }
    const rec = normReport({
      id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
      date: d, title: t, panel: pn, specimen: sp, hospital: h, note: '', file, createdAt: Date.now()
    });
    if (!persistReports([...reports, rec])) return;
    rid = rec.id;
  }

  const byKey = new Map(labs.map(r => [`${r.date}|${r.category}|${r.name.trim()}|${r.unit.trim()}`, r]));
  const next = labs.slice();
  let added = 0, updated = 0, bad = 0;

  for (const r of picked) {
    const date = String(r.date || '').trim();
    const name = String(r.name || '').trim();
    const qual = String(r.qualitative || '').trim();
    const hasNum = typeof r.value === 'number' && Number.isFinite(r.value);
    const isQual = !!qual && !hasNum;   // 定性结果：没有数值
    const unit = isQual ? String(r.unit || '').trim() : (String(r.unit || '').trim() || '—');   // 报告没印单位时用 — 占位，不编造单位
    const value = isQual ? null : Number(r.value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) { bad++; continue; }
    if (!isQual && !Number.isFinite(value)) { bad++; continue; }
    if (!isQual && !unit) { bad++; continue; }

    const flag = r.flag || (isQual ? qualFlagOf(qual) : calcLabFlag(value, r.low, r.high));
    const note = (!isQual && r.cmp) ? `报告记为 ${r.cmp}${value}` : '';
    const k = `${date}|${r.category}|${name}|${unit}`;
    const old = byKey.get(k);
    if (old) {
      old.value = value;
      old.qualitative = isQual ? qual : '';
      old.flag = flag;
      old.low = isQual ? null : r.low;
      old.high = isQual ? null : r.high;
      if (imp.source) old.source = imp.source;
      if (note) old.note = note;
      if (rid) old.reportId = rid;
      updated++;
    } else {
      const rec = {
        id: (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date, category: r.category, name, value,
        qualitative: isQual ? qual : '',
        unit, low: isQual ? null : r.low, high: isQual ? null : r.high, flag,
        source: imp.source || '', note,
        reportId: rid
      };
      next.push(rec);
      byKey.set(k, rec);
      added++;
    }
  }

  if (!added && !updated) { toast('没有可写入的记录，请检查日期与单位'); return; }
  if (!persistLabs(next)) return;
  closeModal();
  // 一次导入多条时不强行停在最后一条，交给默认规则挑（记录最多 / 有异常）
  if (picked.length === 1) ui.metric = labKey(next[next.length - 1]);
  if (currentPage() !== 'labs') location.hash = '#/labs';
  else renderLabs();
  const parts = [];
  if (added) parts.push(`新增 ${added} 条`);
  if (updated) parts.push(`更新 ${updated} 条`);
  if (bad) parts.push(`${bad} 条不完整已跳过`);
  toast('已写入：' + parts.join('、'));
}
