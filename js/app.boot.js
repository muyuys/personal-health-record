/* ======================= 事件 ======================= */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) {
    /* 「记录明细」折叠面板：原生 <details> 自行开合，这里记下展开状态，
       翻页整页重渲染后仍保持展开（ui.openDetails）。 */
    const fold = e.target.closest('details.detail-fold');
    if (fold) ui.openDetails[fold.dataset.fold] = fold.open;
    if (e.target.id === 'modalRoot') closeModal();
    return;
  }
  const act = el.dataset.act;

  switch (act) {
    case 'go':
      closeModal();
      location.hash = '#/' + el.dataset.to;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      break;
    case 'issue':
      closeModal();
      ui.issue = el.dataset.id;
      if (location.hash.replace(/^#\/?/, '') !== 'issues') location.hash = '#/issues';
      else renderIssues();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      break;
    case 'filter':
      ui.issueFilter = el.dataset.k;
      renderIssues();
      break;
    case 'page': {
      const key = el.dataset.key;
      const p = parseInt(el.dataset.page, 10);
      if (key && Number.isFinite(p) && ui.pager[key] !== p) {
        ui.pager[key] = p;
        const rmap = { weight: renderWeight, sleep: renderSleep, labs: renderLabAll };
        (rmap[key] || route)();
        const host = $('#view');
        if (host) window.scrollTo({ top: host.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
      }
      break;
    }
    case 'page-size': {
      const s = parseInt(el.dataset.size, 10);
      if (PAGE_SIZES.includes(s)) {
        ui.pageSize = s;
        Object.keys(ui.pager).forEach(k => { ui.pager[k] = 1; });
        route();
      }
      break;
    }
    case 'todo': {
      const id = el.dataset.id;
      state.done[id] = !state.done[id];
      persistState();
      route();
      break;
    }
    case 'todo-add':
      openTodoForm(null);
      break;
    case 'todo-edit': {
      const t = todoItems.find(x => x.id === el.dataset.id);
      if (t) openTodoForm(t);
      break;
    }
    case 'todo-del':
      deleteTodoItem(el.dataset.id);
      break;
    case 'issue-edit': {
      const it = ARCHIVE.issues.find(x => x.id === el.dataset.id);
      if (it) openIssueForm(it);
      break;
    }
    case 'search':
      openSearch();
      break;
    case 'issue-recheck': {
      const map = { ankle: 't-ankle', eyes: 't-eye', liver: 't-lab' };
      const tid = map[el.dataset.id];
      if (!tid) { toast('该主题暂无对应待办，请在档案文件里更新状态'); break; }
      state.done[tid] = true;
      persistState();
      renderIssues();
      syncChrome('issues');
      toast('已在待办中标记完成；病历文件状态仍需手动更新');
      break;
    }
    case 'record':
      openRecord(el.dataset.kind || 'weight');
      break;
    case 'tab':
      $$('.tabs button').forEach(b => b.classList.toggle('on', b === el));
      renderRecordBody(el.dataset.k);
      break;
    case 'newlab':
      openModal(`
        <div class="modal-head"><div><h2>录入检验结果</h2><p>每条填一个指标；同一张化验单可以录多条</p></div>
        <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button></div>
        ${labFormHTML(null)}`, 'wide');
      bindLabForm();
      break;
    case 'editlab': {
      const rec = labs.find(r => r.id === el.dataset.id);
      if (!rec) break;
      openModal(`
        <div class="modal-head"><div><h2>编辑检验结果</h2><p>${esc(rec.name)}　${esc(rec.date)}</p></div>
        <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button></div>
        ${labFormHTML(rec)}`, 'wide');
      bindLabForm();
      break;
    }
    case 'dellab': {
      const rec = labs.find(r => r.id === el.dataset.id);
      if (!rec) break;
      if (!confirm(`删除「${rec.name} ${rec.value} ${rec.unit}」（${rec.date}）这条记录？`)) break;
      if (persistLabs(labs.filter(r => r.id !== rec.id))) { route(); toast('已删除'); }
      break;
    }
    case 'pick':
      ui.metric = el.dataset.k;
      renderLabs();
      break;
    case 'pick-metric':
      closeModal();
      ui.metric = el.dataset.k;
      if (location.hash.replace(/^#\/?/, '') !== 'labs') location.hash = '#/labs';
      else renderLabs();
      break;
    case 'range':
      ui.labsRange = el.dataset.v;
      renderLabs();
      break;
    case 'laball-range':
      ui.labAll.range = el.dataset.v;
      renderLabAll();
      break;
    case 'demo-on':
      ui.demo = true;
      renderLabs();
      break;
    case 'demo-off':
      ui.demo = false;
      renderLabs();
      break;
    case 'weight-add':
      openRecord('weight');
      break;
    case 'weight-edit': {
      const w = state.weights.find(x => x.id === el.dataset.id);
      if (!w) break;
      editWeight(w);
      break;
    }
    case 'weight-del': {
      const w = state.weights.find(x => x.id === el.dataset.id);
      if (!w) break;
      if (state.weights.length <= 1) { toast('至少保留一条体重记录'); break; }
      if (!confirm(`删除 ${w.date} 的 ${w.kg} kg 记录？`)) break;
      state.weights = state.weights.filter(x => x.id !== w.id);
      persistState(); renderWeight(); toast('已删除');
      break;
    }
    case 'comp-metric':
      ui.compMetric = el.dataset.k;
      renderWeight();
      break;
    case 'sl-im-seg': {
      // 「减重」聚合页分段切换：只切内存态并重渲染当前段
      const seg = el.dataset.seg;
      if (['overview', 'weight', 'diet', 'review'].includes(seg)) {
        ui.slImSeg = seg;
        renderWeight();
        syncChrome('weight');
      }
      break;
    }
    case 'diet-day-add':
      openDietDay(null);
      break;
    case 'diet-day-edit': {
      const d = dietDays.find(x => x.id === el.dataset.id);
      if (d) openDietDay(d);
      break;
    }
    case 'diet-day-del': {
      const d = dietDays.find(x => x.id === el.dataset.id);
      if (!d) break;
      if (!confirm(`删除 ${d.date} 的每日记录？`)) break;
      dietDays = dietDays.filter(x => x.id !== d.id);
      persistDietDays(); closeModal(); renderDiet(); toast('已删除');
      break;
    }
    case 'diet-week-add':
      openDietWeek(null);
      break;
    case 'diet-week-edit': {
      const w = dietWeeks.find(x => x.id === el.dataset.id);
      if (w) openDietWeek(w);
      break;
    }
    case 'diet-week-del': {
      const w = dietWeeks.find(x => x.id === el.dataset.id);
      if (!w) break;
      if (!confirm(`删除 ${w.weekStart} 起的周复盘？`)) break;
      dietWeeks = dietWeeks.filter(x => x.id !== w.id);
      persistDietWeeks(); closeModal(); renderDiet(); toast('已删除');
      break;
    }
    case 'body-add':
      openRecord('body');
      break;
    case 'body-edit': {
      const b = state.body.find(x => x.id === el.dataset.id);
      if (!b) break;
      editBody(b);
      break;
    }
    case 'body-del': {
      const b = state.body.find(x => x.id === el.dataset.id);
      if (!b) break;
      const label = BODY_FIELDS.filter(f => Number.isFinite(b[f.k])).map(f => `${f.label} ${b[f.k]}`).join('、');
      if (!confirm(`删除 ${b.date} 的围度记录（${label || '空'}）？`)) break;
      state.body = state.body.filter(x => x.id !== b.id);
      persistState(); closeModal(); renderWeight(); toast('已删除');
      break;
    }
    case 'vital-add':
      openVitalsForm(null);
      break;
    case 'vital-edit': {
      const v = vitals.find(x => x.id === el.dataset.id);
      if (v) openVitalsForm(v);
      break;
    }
    case 'vital-del': {
      const v = vitals.find(x => x.id === el.dataset.id);
      if (!v) break;
      if (!confirm(`删除 ${v.date} 的体征记录？`)) break;
      vitals = vitals.filter(x => x.id !== v.id);
      persistVitals(); closeModal(); route(); toast('已删除');
      break;
    }
    case 'sleep-import':
      openImport('device');
      break;
    case 'sleep-del': {
      const s = sleepLogs.find(x => x.id === el.dataset.id);
      if (!s) break;
      if (!confirm(`删除 ${s.date} 的睡眠记录？`)) break;
      sleepLogs = sleepLogs.filter(x => x.id !== s.id);
      persistSleepLogs(); route(); toast('已删除');
      break;
    }
    case 'symptom-add':
      openSymptomForm(null);
      break;
    case 'symptom-edit': {
      const s = symptoms.find(x => x.id === el.dataset.id);
      if (s) openSymptomForm(s);
      break;
    }
    case 'symptom-del': {
      const s = symptoms.find(x => x.id === el.dataset.id);
      if (!s) break;
      if (!confirm(`删除 ${s.date} 的「${s.part}」症状记录？`)) break;
      symptoms = symptoms.filter(x => x.id !== s.id);
      persistSymptoms(); closeModal(); route(); toast('已删除');
      break;
    }
    case 'symptom-filter':
      ui.symptomTheme = el.dataset.k || '';
      renderSymptoms();
      break;
    case 'hist-add':
      openHistoryForm(el.dataset.kind, null);
      break;
    case 'hist-edit': {
      const kind = el.dataset.kind;
      const rec = histListOf(kind).find(x => x.id === el.dataset.id);
      if (rec) openHistoryForm(kind, rec);
      break;
    }
    case 'hist-del':
      deleteHistory(el.dataset.kind, el.dataset.id);
      break;
    case 'visit-add':
      openVisitForm(null);
      break;
    case 'visit-sample':
      openVisitForm(null, visitSampleDraft());
      break;
    case 'visit-edit': {
      const v = visitById(el.dataset.id);
      if (v) openVisitForm(v);
      break;
    }
    case 'visit-del':
      deleteVisit(el.dataset.id);
      break;
    case 'med-add':
      openMedicationForm(null);
      break;
    case 'med-edit': {
      const m = medications.find(x => x.id === el.dataset.id);
      if (m) openMedicationForm(m);
      break;
    }
    case 'med-del':
      deleteMedication(el.dataset.id);
      break;
    case 'export':
      exportAll();
      break;
    case 'remind-dismiss':
      dismissReminder(el.dataset.key || '');
      break;
    case 'import':
      openImport('text');
      break;
    case 'newreport':
      openReport();
      break;
    case 'editreport':
      openReport(el.dataset.id);
      break;
    case 'viewreport':
      viewReport(el.dataset.id);
      break;
    case 'vieworiginal':
      viewOriginal(el.dataset.path, el.dataset.name);
      break;
    case 'reload-originals':
      loadOriginals().then(() => { toast('原件清单已刷新'); renderLabs(); });
      break;
    case 'summary-preview': {
      const v = $('#smVisit'), f = $('#smFrom'), t = $('#smTo');
      ui.summary = { visit: v ? v.value : '', from: f ? f.value : '', to: t ? t.value : '' };
      renderSummary();
      break;
    }
    case 'summary-clear':
      ui.summary = { visit: '', from: '', to: '' };
      renderSummary();
      break;
    case 'summary-print':
      window.print();
      break;
    case 'visit-summary':
      ui.summary = { visit: el.dataset.id || '', from: '', to: '' };
      closeModal();
      if (currentPage() === 'summary') renderSummary();
      else location.hash = '#/summary';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      break;
    case 'delreport': {
      const rp = reportById(el.dataset.id);
      if (!rp) break;
      const n = labCountOf(rp.id);
      const msg = `删除报告「${rp.title}」？${n ? `\n${n} 项结果会保留，但不再关联这份报告的原件。` : ''}`;
      if (!confirm(msg)) break;
      if (!persistReports(reports.filter(x => x.id !== rp.id))) break;
      const kept = labs.map(r => r.reportId === rp.id ? { ...r, reportId: '' } : r);
      persistLabs(kept);
      closeModal();
      renderLabs();
      toast('报告已删除，相关结果保留');
      break;
    }
    case 'rp-pick': {
      const inp = $('#rpFile');
      if (inp) inp.click();
      break;
    }
    case 'rp-clear':
      syncReportDraft();
      rpDraft.file = '';
      renderReportBody();
      break;
    case 'imp-tab':
      if (!imp) break;
      imp.mode = el.dataset.k; imp.parsed = false; imp.err = '';
      renderImportBody();
      break;
    case 'imp-sample': {
      const ta = $('#impText');
      if (ta) { ta.value = IMP_SAMPLE; imp.raw = IMP_SAMPLE; ta.focus(); }
      break;
    }
    case 'imp-parse': {
      if (!imp) break;
      if (typeof LabParse === 'undefined') {
        imp.err = '解析脚本没有加载成功，请刷新页面再试';
        renderImportBody();
        break;
      }
      const ta = $('#impText');
      const raw = ta ? ta.value : imp.raw;
      const d = $('#impDate'); if (d && d.value) imp.date = d.value;
      const s = $('#impSource'); if (s) imp.source = s.value.trim();
      imp.raw = raw || '';
      if (!imp.raw.trim()) {
        imp.err = imp.mode === 'image' ? '还没有识别出文字，先选一张报告照片' : '请先把报告文字粘贴进来';
        renderImportBody();
        break;
      }
      imp.err = '';
      applyParsed(LabParse.text(imp.raw, { date: imp.date }));
      break;
    }
    case 'imp-file-csv':
      $('#importFile').accept = '.csv,.txt,.tsv,text/csv,text/plain';
      $('#importFile').multiple = false;
      $('#importFile').click();
      break;
    case 'imp-file-img': {
      const fi = $('#importFile');
      fi.accept = 'image/*';
      fi.multiple = true;
      fi.click();
      break;
    }
    case 'ocr-check':
      ocrCheck();
      break;
    case 'imp-file-json':
      $('#importFile').accept = '.json,application/json';
      $('#importFile').multiple = false;
      $('#importFile').click();
      break;
    case 'imp-file-device':
      $('#importFile').accept = '.csv,.txt,text/csv,text/plain';
      $('#importFile').multiple = true;
      $('#importFile').click();
      break;
    case 'imp-back':
      if (!imp) break;
      imp.parsed = false; imp.err = '';
      renderImportBody();
      break;
    case 'imp-commit':
      if (imp) commitImport();
      break;
    case 'imp-device-commit':
      if (imp) commitDeviceImport();
      break;
    case 'migrate-local':
      migrateLocalToServer();
      break;
    case 'clear-local':
      if (!confirm('清空浏览器里的检验结果、体重与围度记录、报告原件和待办勾选？此操作不可撤销，建议先导出备份。')) break;
      labs = []; state.weights = []; state.body = []; state.done = {}; state.savedAt = null; reports = [];
      allergies = []; familyHistory = []; surgeries = []; visits = []; medications = []; symptoms = [];
      dietDays = []; dietWeeks = [];
      try {
        localStorage.removeItem(LS_LABS);
        localStorage.removeItem(LS_STATE);
        localStorage.removeItem(LS_REPORTS);
        localStorage.removeItem(LS_HISTORY);
        localStorage.removeItem(LS_SYMPTOMS);
        localStorage.removeItem(LS_DIET_DAYS);
        localStorage.removeItem(LS_DIET_WEEKS);
      } catch (err) { }
      loadAll(); route(); toast('本机记录已清空');
      break;
    case 'reset-todos':
      if (!confirm('取消所有待办勾选？')) break;
      state.done = {}; persistState(); renderTodos();
      break;
    case 'newissue':
      toast('新增主题请先在磁盘建立对应记录文件，再由整理脚本同步到此页');
      break;
    case 'newmed':
      toast('药物以档案文件为准：请在用药记录.md 补充后再更新此页');
      break;
    case 'close':
      closeModal();
      break;
    case 'more':
      openMore();
      break;
    case 'go-todo':
      closeModal();
      location.hash = '#/todo';
      break;
    default:
      break;
  }
});

function editWeight(w) {
  openModal(`
    <div class="modal-head"><div><h2>编辑体重记录</h2><p>${esc(w.date)}</p></div>
    <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button></div>
    <form id="weForm">
      <div class="form-grid">
        <div class="field"><label>日期</label><input type="date" name="date" value="${esc(w.date)}" required></div>
        <div class="field"><label>体重 kg</label><input type="number" step="0.1" name="kg" value="${w.kg}" required></div>
        <div class="field"><label>条件</label><select name="tag">
          <option value="morning" ${w.tag === 'morning' ? 'selected' : ''}>晨重</option>
          <option value="other" ${w.tag === 'other' ? 'selected' : ''}>其他时段</option>
          <option value="reported" ${w.tag === 'reported' ? 'selected' : ''}>自报</option>
        </select></div>
        <div class="field"><label>腰围 cm</label><input type="number" step="0.1" name="waist" value="${bodyOf(w.date)?.waist ?? ''}" placeholder="可空，记入围度"></div>
        ${weightMetricInputsHTML(w)}
        <div class="field wide"><label>备注</label><input name="note" value="${esc(w.note || '')}" maxlength="120"></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">保存修改</button>
        <button class="btn btn-ghost" type="button" data-act="close">取消</button>
        <button class="btn btn-ghost btn-danger" type="button" data-act="weight-del" data-id="${esc(w.id)}">删除这条</button>
      </div>
    </form>`);
  $('#weForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const kg = Number(fd.get('kg'));
    if (!Number.isFinite(kg) || kg <= 20 || kg > 300) { toast('体重填写有误'); return; }
    const waist = fd.get('waist') === '' ? null : Number(fd.get('waist'));
    const date = fd.get('date');
    state.weights = state.weights.map(x => x.id === w.id ? {
      ...x, date, kg, tag: fd.get('tag'),
      waist: null, note: String(fd.get('note') || '').trim(),
      ...readWeightMetrics(fd)
    } : x);
    // 围度是独立的一组测量，改体重日期不会搬动已有的围度；只把这里填的腰围补进去
    if (Number.isFinite(waist) && waist > 0) upsertBody(date, { waist });
    persistState(); closeModal(); renderWeight(); toast('已保存');
  });
}

function editBody(b) {
  openModal(`
    <div class="modal-head"><div><h2>编辑围度记录</h2><p>${esc(b.date)}</p></div>
    <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button></div>
    ${bodyFormHTML(b)}`);
  bindBodyForm();
}

function histListOf(kind) {
  return kind === 'allergy' ? allergies : kind === 'family' ? familyHistory : surgeries;
}

function historyFormFields(kind, rec) {
  if (kind === 'allergy') {
    const a = rec || { name: '', category: '药物', severity: '', reaction: '', note: '' };
    return `<div class="form-grid">
      <div class="field"><label>过敏原 <b>*</b></label><input name="name" value="${esc(a.name)}" maxlength="60" required placeholder="如 青霉素"></div>
      <div class="field"><label>类别</label><select name="category">${ALLERGY_CATS.map(c => `<option value="${c}" ${a.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>严重程度</label><select name="severity"><option value="">未标注</option>${ALLERGY_SEVS.map(([v, l]) => `<option value="${v}" ${a.severity === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field wide"><label>反应表现</label><input name="reaction" value="${esc(a.reaction)}" maxlength="200" placeholder="如 皮疹、呼吸困难、过敏性休克"></div>
      <div class="field wide"><label>备注</label><input name="note" value="${esc(a.note)}" maxlength="200"></div>
    </div>`;
  }
  if (kind === 'family') {
    const f = rec || { relation: '', condition: '', note: '' };
    return `<div class="form-grid">
      <div class="field"><label>亲属</label><input name="relation" value="${esc(f.relation)}" maxlength="40" placeholder="如 父亲、母亲、祖母"></div>
      <div class="field wide"><label>疾病 / 状况 <b>*</b></label><input name="condition" value="${esc(f.condition)}" maxlength="100" required placeholder="如 高血压、糖尿病、冠心病"></div>
      <div class="field wide"><label>备注</label><input name="note" value="${esc(f.note)}" maxlength="200" placeholder="发病年龄、是否确诊等"></div>
    </div>`;
  }
  const s = rec || { date: '', name: '', hospital: '', note: '' };
  return `<div class="form-grid">
    <div class="field"><label>日期</label><input type="date" name="date" value="${esc(s.date)}"></div>
    <div class="field wide"><label>手术 / 住院名称 <b>*</b></label><input name="name" value="${esc(s.name)}" maxlength="100" required placeholder="如 阑尾切除术、2024 年肺炎住院"></div>
    <div class="field wide"><label>医院</label><input name="hospital" value="${esc(s.hospital)}" maxlength="60"></div>
    <div class="field wide"><label>备注</label><input name="note" value="${esc(s.note)}" maxlength="200"></div>
  </div>`;
}

function openHistoryForm(kind, rec) {
  const titles = {
    allergy: ['添加过敏记录', '编辑过敏记录'],
    family: ['添加家族史', '编辑家族史'],
    surgery: ['添加手术 / 住院记录', '编辑手术 / 住院记录']
  };
  const isEdit = !!rec;
  openModal(`
    <div class="modal-head"><div><h2>${titles[kind][isEdit ? 1 : 0]}</h2><p>结构化保存，个人资料与就诊摘要可引用</p></div>
    <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button></div>
    <form id="histForm">
      ${historyFormFields(kind, rec)}
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">保存</button>
        <button class="btn btn-ghost" type="button" data-act="close">取消</button>
        ${isEdit ? `<button class="btn btn-ghost btn-danger" type="button" data-act="hist-del" data-kind="${kind}" data-id="${esc(rec.id)}">删除这条</button>` : ''}
      </div>
    </form>`);
  $('#histForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const createdAt = rec ? rec.createdAt : Date.now();
    const id = rec ? rec.id : newId(kind.slice(0, 3));
    if (kind === 'allergy') {
      const name = String(fd.get('name') || '').trim();
      if (!name) { toast('请填写过敏原'); return; }
      const obj = normAllergy({ id, name, category: fd.get('category'), severity: fd.get('severity'), reaction: fd.get('reaction'), note: fd.get('note'), createdAt });
      allergies = rec ? allergies.map(x => x.id === rec.id ? obj : x) : [obj, ...allergies];
    } else if (kind === 'family') {
      const condition = String(fd.get('condition') || '').trim();
      if (!condition) { toast('请填写疾病或状况'); return; }
      const obj = normFamily({ id, relation: fd.get('relation'), condition, note: fd.get('note'), createdAt });
      familyHistory = rec ? familyHistory.map(x => x.id === rec.id ? obj : x) : [obj, ...familyHistory];
    } else {
      const name = String(fd.get('name') || '').trim();
      if (!name) { toast('请填写手术 / 住院名称'); return; }
      const obj = normSurgery({ id, date: fd.get('date'), name, hospital: fd.get('hospital'), note: fd.get('note'), createdAt });
      surgeries = rec ? surgeries.map(x => x.id === rec.id ? obj : x) : [obj, ...surgeries];
    }
    persistHistory();
    closeModal();
    renderProfile();
    toast('已保存');
  });
}

function deleteHistory(kind, id) {
  const rec = histListOf(kind).find(x => x.id === id);
  if (!rec) return;
  const label = rec.name || rec.condition || '这条记录';
  if (!confirm(`删除「${label}」？`)) return;
  if (kind === 'allergy') allergies = allergies.filter(x => x.id !== id);
  else if (kind === 'family') familyHistory = familyHistory.filter(x => x.id !== id);
  else surgeries = surgeries.filter(x => x.id !== id);
  persistHistory();
  closeModal();
  renderProfile();
  toast('已删除');
}

/* ---------- 就诊实例：表单与增删改 ---------- */
function visitFormFields(v) {
  const r = v || {
    date: todayISO(), visitType: '门诊', department: '', hospital: '', doctor: '',
    chief: '', diagnosis: '', summary: '', reportId: '', note: ''
  };
  const reportOpts = ['<option value="">（不关联）</option>'].concat(
    reports.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(rp =>
      `<option value="${esc(rp.id)}" ${r.reportId === rp.id ? 'selected' : ''}>${esc(rp.date)}　${esc(rp.title)}</option>`)).join('');
  return `<div class="form-grid">
    <div class="field"><label>就诊日期 <b>*</b></label><input type="date" name="date" value="${esc(r.date)}" required></div>
    <div class="field"><label>类型</label><select name="visitType">${VISIT_TYPES.map(t => `<option value="${t}" ${r.visitType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="field"><label>科室</label><input name="department" value="${esc(r.department)}" maxlength="40" placeholder="如 眼科、足踝外科"></div>
    <div class="field"><label>医院</label><input name="hospital" value="${esc(r.hospital)}" maxlength="60"></div>
    <div class="field"><label>医生</label><input name="doctor" value="${esc(r.doctor)}" maxlength="40"></div>
    <div class="field wide"><label>关联报告</label><select name="reportId">${reportOpts}</select></div>
    <div class="field wide"><label>主诉</label><input name="chief" value="${esc(r.chief)}" maxlength="300" placeholder="本次就诊的主要症状 / 原因"></div>
    <div class="field wide"><label>诊断</label><input name="diagnosis" value="${esc(r.diagnosis)}" maxlength="300" placeholder="医生给出的诊断（没有就留空，不推测）"></div>
    <div class="field wide"><label>就诊小结</label><textarea name="summary" rows="3" maxlength="1000" placeholder="处置、医嘱、复诊安排等">${esc(r.summary)}</textarea></div>
    <div class="field wide"><label>备注</label><input name="note" value="${esc(r.note)}" maxlength="300"></div>
  </div>`;
}

function visitSampleDraft() {
  return {
    date: todayISO(), visitType: '门诊',
    department: '【示例·待填】如 眼科',
    hospital: '【示例·待填】医院名称',
    doctor: '【示例·待填】医生姓名',
    chief: '【示例·待填】本次就诊的主要症状 / 原因',
    diagnosis: '【示例·待填】医生给出的诊断（没有就留空，不推测）',
    summary: '【示例·待填】处置、医嘱、复诊安排等',
    reportId: '',
    note: '示例草稿：请把【示例·待填】替换为真实内容后再保存。'
  };
}

function openVisitForm(rec, sample) {
  const isEdit = !!rec;
  const init = rec || sample || null;
  const linked = isEdit ? medications.filter(m => m.visitId === rec.id) : [];
  openModal(`
    <div class="modal-head"><div><h2>${isEdit ? '编辑就诊记录' : '登记就诊'}</h2><p>结构化保存，可在时间线与就诊摘要引用</p></div>
    <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button></div>
    <form id="visitForm">
      ${visitFormFields(init)}
      ${sample && !isEdit ? `<div class="notice" style="margin-top:12px">${I.info}<p>这是一条<b>示例草稿</b>，字段里的「【示例·待填】」只是格式示意，请改成真实内容；不确定的字段直接留空，不要编造。</p></div>` : ''}
      ${isEdit ? `<div class="notice" style="margin-top:12px">${I.info}<p><b>本次就诊用药：</b>${linked.length ? linked.map(m => esc(m.name) + (m.dose ? `（${esc(m.dose)}）` : '')).join('、') : '未登记（可在「用药记录」里添加并关联本次就诊）'}</p></div>` : ''}
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">保存</button>
        <button class="btn btn-ghost" type="button" data-act="close">取消</button>
        ${isEdit ? `<button class="btn btn-ghost btn-danger" type="button" data-act="visit-del" data-id="${esc(rec.id)}">删除这条</button>` : ''}
      </div>
    </form>`);
  $('#visitForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const date = fd.get('date');
    if (!date) { toast('请填写就诊日期'); return; }
    const obj = normVisit({
      id: rec ? rec.id : newId('vis'), date,
      visitType: fd.get('visitType'), department: fd.get('department'),
      hospital: fd.get('hospital'), doctor: fd.get('doctor'),
      chief: fd.get('chief'), diagnosis: fd.get('diagnosis'), summary: fd.get('summary'),
      reportId: fd.get('reportId'), note: fd.get('note'),
      createdAt: rec ? rec.createdAt : Date.now()
    });
    visits = rec ? visits.map(x => x.id === rec.id ? obj : x) : [obj, ...visits];
    persistHistory();
    closeModal();
    route();
    toast('已保存');
  });
}

function deleteVisit(id) {
  const rec = visitById(id);
  if (!rec) return;
  const label = `${rec.date} ${rec.visitType || '就诊'}${rec.department ? ' · ' + rec.department : ''}`;
  if (!confirm(`删除就诊「${label}」？关联用药会保留，但不再挂到这次就诊。`)) return;
  visits = visits.filter(x => x.id !== id);
  medications = medications.map(m => m.visitId === id ? { ...m, visitId: '' } : m);
  persistHistory();
  closeModal();
  route();
  toast('已删除');
}

/* ---------- 用药：表单与增删改 ---------- */
function medicationFormFields(m) {
  const r = m || {
    name: '', dose: '', frequency: '', route: '', startDate: todayISO(), endDate: '',
    purpose: '', status: 'active', note: '', infoDate: '', sourceRef: '', toVerify: '', visitId: ''
  };
  const visitOpts = ['<option value="">（不关联）</option>'].concat(
    visitsSorted().map(v => `<option value="${esc(v.id)}" ${r.visitId === v.id ? 'selected' : ''}>${esc(v.date)}　${esc(v.visitType || '就诊')}${v.department ? ' · ' + esc(v.department) : ''}</option>`)).join('');
  return `<div class="form-grid">
    <div class="field wide"><label>药物名称 <b>*</b></label><input name="name" value="${esc(r.name)}" maxlength="80" required placeholder="商品名 / 通用名，如 海露玻璃酸钠滴眼液"></div>
    <div class="field"><label>剂量</label><input name="dose" value="${esc(r.dose)}" maxlength="60" placeholder="如 1 滴、5 mg、1 片"></div>
    <div class="field"><label>频次</label><input name="frequency" value="${esc(r.frequency)}" maxlength="60" placeholder="如 每日 3 次、每晚 1 次"></div>
    <div class="field"><label>途径</label><select name="route"><option value="">未标注</option>${MED_ROUTES.map(t => `<option value="${t}" ${r.route === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="field"><label>状态</label><select name="status">${MED_STATUS.map(([val, lab]) => `<option value="${val}" ${r.status === val ? 'selected' : ''}>${lab}</option>`).join('')}</select></div>
    <div class="field"><label>开始日期</label><input type="date" name="startDate" value="${esc(r.startDate)}"></div>
    <div class="field"><label>结束日期</label><input type="date" name="endDate" value="${esc(r.endDate)}"></div>
    <div class="field wide"><label>用途</label><input name="purpose" value="${esc(r.purpose)}" maxlength="120" placeholder="对应哪个问题 / 谁开的"></div>
    <div class="field wide"><label>关联就诊</label><select name="visitId">${visitOpts}</select></div>
    <div class="field"><label>信息日期</label><input type="date" name="infoDate" value="${esc(r.infoDate || '')}"></div>
    <div class="field wide"><label>来源</label><input name="sourceRef" value="${esc(r.sourceRef || '')}" maxlength="200" placeholder="回溯到的原始档案，如 用药记录.md 第9行"></div>
    <div class="field wide"><label>待核对</label><input name="toVerify" value="${esc(r.toVerify || '')}" maxlength="300" placeholder="仍需向医生/本人确认的事项，如 浓度、开封日期、是否在用"></div>
    <div class="field wide"><label>备注</label><input name="note" value="${esc(r.note)}" maxlength="300" placeholder="疗效 / 不适 / 开封日期等"></div>
  </div>`;
}

function openMedicationForm(rec) {
  const isEdit = !!rec;
  openModal(`
    <div class="modal-head"><div><h2>${isEdit ? '编辑用药' : '新增用药'}</h2><p>记录剂量、频次与起止，历史用药不自动视为当前用药</p></div>
    <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button></div>
    <form id="medForm">
      ${medicationFormFields(rec)}
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">保存</button>
        <button class="btn btn-ghost" type="button" data-act="close">取消</button>
        ${isEdit ? `<button class="btn btn-ghost btn-danger" type="button" data-act="med-del" data-id="${esc(rec.id)}">删除这条</button>` : ''}
      </div>
    </form>`);
  $('#medForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = String(fd.get('name') || '').trim();
    if (!name) { toast('请填写药物名称'); return; }
    const obj = normMedication({
      id: rec ? rec.id : newId('med'), name,
      dose: fd.get('dose'), frequency: fd.get('frequency'), route: fd.get('route'),
      startDate: fd.get('startDate'), endDate: fd.get('endDate'), purpose: fd.get('purpose'),
      status: fd.get('status'), note: fd.get('note'), visitId: fd.get('visitId'),
      infoDate: fd.get('infoDate'), sourceRef: fd.get('sourceRef'), toVerify: fd.get('toVerify'),
      createdAt: rec ? rec.createdAt : Date.now()
    });
    medications = rec ? medications.map(x => x.id === rec.id ? obj : x) : [obj, ...medications];
    persistHistory();
    closeModal();
    route();
    toast('已保存');
  });
}

function deleteMedication(id) {
  const rec = medications.find(x => x.id === id);
  if (!rec) return;
  if (!confirm(`删除用药「${rec.name}」？`)) return;
  medications = medications.filter(x => x.id !== id);
  persistHistory();
  closeModal();
  route();
  toast('已删除');
}

/* ---------- 复诊待办：页内新增 / 编辑 / 删除（写库） ---------- */
function todoGroupNames(cur) {
  const set = new Set(['我新增的待办']);
  ARCHIVE.todos.forEach(g => set.add(g.group));
  todoItems.forEach(t => set.add(t.groupName || '我新增的待办'));
  if (cur) set.add(cur);
  return Array.from(set);
}
function openTodoForm(rec) {
  const isEdit = !!rec;
  const r = rec || { text: '', groupName: '我新增的待办', meta: '', flag: false, dueDate: '' };
  openModal(`
    <div class="modal-head"><div><h2>${isEdit ? '编辑待办' : '添加待办'}</h2><p>保存到本机数据库；勾选状态与静态待办共用一张表</p></div>
    <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button></div>
    <form id="todoForm">
      <div class="form-grid">
        <div class="field wide"><label>待办内容 <b>*</b></label><input name="text" value="${esc(r.text)}" maxlength="200" required placeholder="如 眼科复查：确认流泪刺痛是否改善"></div>
        <div class="field"><label>分组</label><input name="groupName" list="todoGroups" value="${esc(r.groupName || '我新增的待办')}" maxlength="40"><datalist id="todoGroups">${todoGroupNames(r.groupName || '我新增的待办').map(g => `<option value="${esc(g)}"></option>`).join('')}</datalist></div>
        <div class="field"><label>备注</label><input name="meta" value="${esc(r.meta)}" maxlength="120" placeholder="如 科室、时间、要带的材料"></div>
        <div class="field"><label>到期日 <span style="color:var(--muted-3);font-weight:400">（可留空，用于首页提醒）</span></label><input type="date" name="dueDate" value="${esc(r.dueDate || '')}"></div>
        <div class="field wide"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" name="flag" style="width:auto" ${r.flag ? 'checked' : ''}> 标记为重点（列表里高亮）</label></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">保存</button>
        <button class="btn btn-ghost" type="button" data-act="close">取消</button>
        ${isEdit ? `<button class="btn btn-ghost btn-danger" type="button" data-act="todo-del" data-id="${esc(rec.id)}">删除这条</button>` : ''}
      </div>
    </form>`);
  $('#todoForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const text = String(fd.get('text') || '').trim();
    if (!text) { toast('请填写待办内容'); return; }
    const obj = {
      id: rec ? rec.id : newId('todo'),
      text,
      groupName: String(fd.get('groupName') || '').trim() || '我新增的待办',
      meta: String(fd.get('meta') || '').trim(),
      flag: fd.get('flag') === 'on',
      dueDate: normISODate(fd.get('dueDate')),
      createdAt: rec ? rec.createdAt : Date.now()
    };
    todoItems = rec ? todoItems.map(x => x.id === rec.id ? obj : x) : [obj, ...todoItems];
    persistTodoItems();
    closeModal();
    route();
    toast('已保存');
  });
}
function deleteTodoItem(id) {
  const t = todoItems.find(x => x.id === id);
  if (!t) return;
  if (!confirm(`删除待办「${t.text.slice(0, 30)}」？`)) return;
  todoItems = todoItems.filter(x => x.id !== id);
  if (state.done[id]) { delete state.done[id]; persistState(); }
  persistTodoItems();
  closeModal();
  route();
  toast('已删除');
}

/* ---------- 健康问题状态：页内编辑（覆盖显示，不改静态档案原文） ---------- */
function openIssueForm(issue) {
  const cur = issueStatus[issue.id] || {};
  const base = (_baseIssues || []).find(x => x.id === issue.id) || issue;
  const defaultStatus = base.status;
  const status = cur.status || defaultStatus;
  openModal(`
    <div class="modal-head"><div><h2>编辑问题状态</h2><p>${esc(issue.name)} · 只保存在本机数据库，不改静态档案原文</p></div>
    <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button></div>
    <form id="issueForm">
      <div class="form-grid">
        <div class="field wide"><label>状态</label>
          <select name="status">
            <option value="">（保持档案默认：${esc((ARCHIVE.statuses[defaultStatus] || {}).label || '—')}）</option>
            ${Object.entries(ARCHIVE.statuses).map(([k, s]) => `<option value="${k}" ${status === k ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field wide"><label>我的备注（可选）</label><textarea name="note" rows="3" maxlength="500" placeholder="如：已在某医院复诊，医生意见……仅作个人记录">${esc(cur.note || '')}</textarea></div>
      </div>
      <p class="hint" style="margin-top:8px">状态覆盖只影响问题总览的标签与筛选，不会改动医院报告原文；清空后保存即恢复档案默认。</p>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">保存</button>
        <button class="btn btn-ghost" type="button" data-act="close">取消</button>
      </div>
    </form>`);
  $('#issueForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const st = String(fd.get('status') || '');
    const note = String(fd.get('note') || '').trim();
    if (!st && !note) {
      delete issueStatus[issue.id];
    } else {
      issueStatus[issue.id] = { status: st, note, updatedAt: Date.now() };
    }
    persistIssueStatus();
    closeModal();
    route();
    toast(!st && !note ? '已恢复档案默认状态' : '已保存问题状态');
  });
}

function openMore() {
  const items = [
    ['timeline', '检查时间线', 'clock'],
    ['labs-all', '全部检验记录', 'file'],
    ['meds', '用药记录', 'pill'],
    ['weight', '减重记录', 'trend'],
    ['diet', '减重执行', 'symptom'],
    ['symptoms', '症状日记', 'symptom'],
    ['summary', '就诊摘要导出', 'download'],
    ['profile', '个人资料与备份', 'user']
  ];
  openModal(`
    <div class="modal-head"><div><h2>更多</h2><p>档案目录</p></div>
    <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button></div>
    ${items.map(([to, label, icon]) => `<button class="sheet-item" data-act="go" data-to="${to}">${I[icon]}<span>${label}</span></button>`).join('')}
    <button class="sheet-item" data-act="export">${I.download}<span>导出备份</span></button>
    <button class="sheet-item" data-act="import">${I.upload}<span>导入数据</span></button>
    <p class="hint" style="margin-top:14px">数据只保存在本机浏览器；清除浏览器数据会丢失记录。</p>`);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName) && $('#modalRoot').hidden) {
    e.preventDefault();
    const s = $('#searchInput');
    if (s) s.focus(); else openSearch();
  }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const page = currentPage();
    if (page === 'labs' || page === 'weight' || page === 'vitals' || page === 'diet' || page === 'sleep') route();
  }, 180);
});

/* ======================= 路由 ======================= */
const ROUTES = {
  overview: { render: renderOverview, label: '总览' },
  issues: { render: renderIssues, label: '健康问题' },
  labs: { render: renderLabs, label: '检验指标' },
  'labs-all': { render: renderLabAll, label: '全部检验记录' },
  timeline: { render: renderTimeline, label: '检查时间线' },
  visits: { render: renderVisits, label: '就诊记录' },
  summary: { render: renderSummary, label: '就诊摘要导出' },
  meds: { render: renderMeds, label: '用药记录' },
  todo: { render: renderTodos, label: '复诊待办' },
  weight: { render: renderWeight, label: '减重' },
  diet: { render: renderDiet, label: '减重' },
  sleep: { render: renderSleep, label: '睡眠' },
  vitals: { render: renderVitals, label: '生命体征' },
  symptoms: { render: renderSymptoms, label: '症状日记' },
  profile: { render: renderProfile, label: '个人资料' }
};

function currentPage() {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  // 旧 #/diet 链接兼容：映射到「减重」聚合页，并选中「饮食执行」段（不 404）
  if (h === 'diet') { ui.slImSeg = 'diet'; return 'weight'; }
  return ROUTES[h] ? h : 'overview';
}

function route() {
  resetIssuesBase();   // 从 data.js 原始状态起算，避免上一轮的页内覆盖污染
  applyLabDerived();   // 每次渲染前从数据库化验重算检验结论，保证问题总表/总览不缺漏、不过期
  applyIssueOverrides(); // 叠加用户「页内修改的问题状态 / 备注」
  const page = currentPage();
  ROUTES[page].render();
  syncChrome(page);
  document.title = `${ROUTES[page].label} · 个人健康档案`;
  // 搜索框（仅总览存在）
  const s = $('#searchInput');
  if (s) {
    s.addEventListener('focus', () => { openSearch(); s.blur(); });
    s.addEventListener('keydown', e => { if (e.key === 'Enter') { openSearch(s.value); } });
  }
}

$('#importFile').addEventListener('change', async e => {
  const files = Array.from(e.target.files || []);
  const f = files[0];
  const mode = imp ? imp.mode : 'json';
  e.target.value = '';
  if (!f) return;

  if (mode === 'device') {
    const acc = { weightRows: [], sleepRows: [], skipped: [], files: [], err: '', parsed: false };
    for (const file of files) {
      let txt;
      try { txt = await file.text(); } catch (err) { acc.skipped.push({ line: file.name, why: '文件读取失败' }); continue; }
      const res = parseXiaomiCSV(txt, file.name);
      acc.files.push(file.name);
      if (res.error) { acc.err = res.error; continue; }
      if (res.kind === 'weight') acc.weightRows.push(...res.rows);
      else if (res.kind === 'sleep') acc.sleepRows.push(...res.rows);
      acc.skipped.push(...(res.skipped || []));
    }
    const byId = rows => { const m = new Map(); rows.forEach(r => m.set(r.id, r)); return [...m.values()]; };
    acc.weightRows = byId(acc.weightRows);
    acc.sleepRows = byId(acc.sleepRows);
    acc.parsed = acc.weightRows.length > 0 || acc.sleepRows.length > 0;
    if (!acc.parsed && !acc.err) acc.err = '没有解析到可导入的记录';
    imp.dev = acc;
    imp.err = acc.parsed ? '' : acc.err;
    renderImportBody();
    return;
  }

  if (mode === 'image') {
    if (typeof fetch === 'undefined') {
      setOcrState('<b>这个浏览器不支持调用本机服务</b><span>换 Chrome 或 Edge 再试</span>', 'warn');
      return;
    }
    const btn = $$('[data-act="imp-file-img"]');
    btn.forEach(b => { b.disabled = true; });
    try {
      const res = await ocrImages(files);
      imp.ocrText = res.text;
      imp.raw = res.text;          // 切到「粘贴文本」也能接着改
      imp.ocrFiles = files;
      imp.err = '';
      renderImportBody();
      toast(`识别到 ${res.n} 行文字` + (res.low ? `，其中 ${res.low} 行字迹模糊，请重点核对` : ''));
      const ta = $('#impText');
      if (ta) ta.focus();
    } catch (err) {
      imp.err = '';
      renderImportBody();
      const down = !err || /Failed to fetch|NetworkError|aborted|AbortError/i.test(String(err && err.message));
      setOcrState(down
        ? `<b>连不上本机识别服务</b><span>双击 <code>启动健康档案.bat</code> 后点「重新检测」。若已启动仍连不上，看窗口里有没有报错。</span>
           <button class="btn btn-mini" data-act="ocr-check">重新检测</button>`
        : `<b>识别失败</b><span>${esc(err.message || String(err))}</span>
           <button class="btn btn-mini" data-act="ocr-check">重新检测</button>`, 'warn');
    } finally {
      $$('[data-act="imp-file-img"]').forEach(b => { b.disabled = false; });
    }
    return;
  }

  if (mode === 'csv') {
    const d = $('#impDate'); if (d && d.value) imp.date = d.value;
    const s = $('#impSource'); if (s) imp.source = s.value.trim();
    try {
      const txt = await f.text();
      const res = LabParse.csv(txt, { date: imp.date });
      applyParsed(res.error ? LabParse.text(txt, { date: imp.date }) : res);
    } catch (err) {
      imp.err = '文件读取失败，请确认是可读的 CSV 文本文件';
      imp.parsed = false;
      renderImportBody();
    }
    return;
  }
  await importFile(f);
});

/* 导入预览表：勾选与字段修改 */
document.addEventListener('change', e => {
  const t = e.target;
  if (imp && imp.mode === 'device' && t.dataset && t.dataset.devchk != null) {
    const kind = t.dataset.devchk === 'w' ? 'weightRows' : 'sleepRows';
    const i = Number(t.dataset.i);
    if (imp.dev && Array.isArray(imp.dev[kind]) && imp.dev[kind][i]) {
      imp.dev[kind][i].include = t.checked;
      const n = $('#devCommitN');
      if (n) n.textContent = (imp.dev.weightRows || []).concat(imp.dev.sleepRows || []).filter(r => r.include).length;
    }
    return;
  }
  // 「归到哪份报告」在解析后也可改，不受下方预览逻辑影响
  if (t && t.id === 'impReport' && imp) {
    imp.reportId = t.value;
    const w = $('#impNewWrap');
    if (w) w.hidden = t.value !== '__new';
    if (t.value === '__new') {
      const d = $('#impNewDate');
      if (d && !d.value) d.value = imp.date;
      const ti = $('#impNewTitle');
      if (ti) ti.focus();
    }
    return;
  }
  if (!imp || !imp.parsed) return;
  if (t.id === 'impAll') {
    imp.rows.forEach(r => { r.include = t.checked; });
    renderImportBody();
    return;
  }
  const ci = t.dataset.impCheck;
  if (ci != null) {
    imp.rows[+ci].include = t.checked;
    const tr = t.closest('tr');
    if (tr) tr.classList.toggle('off', !t.checked);
    refreshImpStat();
    return;
  }
  const f = t.dataset.imp;
  if (f) imp.rows[+t.dataset.i][f] = t.value;
});

window.addEventListener('hashchange', () => {
  route();
  window.scrollTo({ top: 0, behavior: 'auto' });
});

/* 侧栏的存储状态：说清楚这份数据此刻到底在哪儿 */
function syncStoreRail() {
  const dot = $('#storeDot'), label = $('#storeLabel'), hint = $('#storeHint');
  if (!dot || !label || !hint) return;
  if (storeMode === 'server') {
    dot.classList.toggle('off', syncBad);
    label.textContent = syncBad ? '数据库写入失败' : '数据已入本机库';
    hint.textContent = syncBad
      ? '最后一次改动可能没存下，检查服务窗口后重试。'
      : '存于 data/health.db，不在浏览器里；删掉这个文件才会丢。';
  } else {
    dot.classList.toggle('off', true);
    label.textContent = '浏览器存储模式';
    hint.textContent = '本机服务没启动，改动只存在浏览器，换设备会丢。';
  }
}

/* ======================= 启动 ======================= */
(async function boot() {
  loadAll();                 // 先把浏览器里的兜底数据读进来（服务模式下会被库里的覆盖）
  const online = await bootStore();
  if (migrateWaistToBody()) persistState();   // 旧腰围搬进围度表，幂等
  await loadOriginals();     // 报告原件磁盘清单（服务模式下），供查看原件 / 缺失核对使用
  buildNav();
  route();
  syncStoreRail();
  if (!online) {
    if (!storageOK) toast('浏览器存储不可用，本次修改无法保存');
    else if (location.protocol !== 'file:') toast('没连上本机数据库，已退回浏览器存储');
  }
})();
