/* A member-scoped index and one metric's full history, derived from existing records. */
let metricHubFilter = { q: '', kind: '' };
let metricHubPage = 1;
let metricHubLastKey = '';
function metricHref(key, patch = {}) {
  const params = new URLSearchParams(location.hash.startsWith('#/metrics') ? hashQuery() : '');
  if (key) params.set('key', key); else params.delete('key');
  Object.entries(patch).forEach(([k, v]) => v ? params.set(k, v) : params.delete(k));
  return '#/metrics' + (params.size ? '?' + params.toString() : '');
}
function labMetricHref(row) {
  return metricHref(HealthMetrics.labKey(row, reportById(row.reportId)));
}
function metricNumber(value) {
  return HealthMetrics.finite(value) ? String(Number(value.toPrecision(10))) : '—';
}
function metricRangeText(row) {
  if (row.low === null && row.high === null) return '未记录';
  return `${row.low === null ? '—' : metricNumber(row.low)} – ${row.high === null ? '—' : metricNumber(row.high)}`;
}
function renderMetrics() {
  const groups = HealthMetrics.collect({ labs, reports, weights: state.weights, body: state.body, vitals, sleepLogs });
  const query = hashQuery();
  const requested = query.get('key');
  const selected = requested ? groups.find(group => group.key === requested) : groups[0];
  if (selected?.key !== metricHubLastKey) { metricHubPage = 1; metricHubLastKey = selected?.key || ''; }
  if (selected && !requested) history.replaceState(null, '', metricHref(selected.key));
  const from = HealthMetrics.dateOK(query.get('from')) ? query.get('from') : '';
  const to = HealthMetrics.dateOK(query.get('to')) ? query.get('to') : '';
  const records = selected ? HealthMetrics.filter(selected.records, from, to) : [];
  const stats = HealthMetrics.summary(records);
  setHead('当前档案 · ' + activeMemberName(), '指标趋势', '按指标汇总记录，查看每一次结果和变化。',
    '<a class="btn" href="#/labs-all">全部检验记录</a><button class="btn btn-primary" data-act="newlab">录入检验</button>', false);
  $('#view').innerHTML = `<div class="metric-workspace"><button class="metric-mobile-toggle" type="button" aria-expanded="false" id="metricMobileToggle">切换指标 · ${esc(selected?.label || '选择指标')}<span>⌄</span></button><aside class="metric-index" aria-label="指标列表">
    <div class="metric-index-head"><h2>选择指标 <small>${groups.length}</small></h2><input type="search" id="metricHubSearch" value="${esc(metricHubFilter.q)}" placeholder="搜索指标名称" aria-label="搜索指标名称"><select id="metricHubKind" aria-label="按指标来源筛选"><option value="">全部来源</option>${[['labs','检验'],['weights','体重与身体成分'],['body','身体围度'],['vitals','生命体征'],['sleepLogs','睡眠']].map(([key,label]) => `<option value="${key}" ${metricHubFilter.kind === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div id="metricHubIndex"></div></aside>
    <section class="metric-detail" aria-label="指标详情">${!selected ? `<div class="metric-empty"><h2>${requested ? '当前档案没有这个指标' : '还没有可汇总的指标'}</h2><p>${requested ? '请从列表选择当前成员的指标。' : '录入检验结果、体重或生命体征后，就能按指标查看变化。仅保存报告图片或文字不会自动生成指标。'}</p><a class="btn" href="#/labs">导入或录入检验结果</a></div>` : `
    <header class="metric-detail-head"><div><h2>${esc(selected.label)}</h2><p>${esc([selected.category, selected.unit || '单位未记录', selected.detail].filter(Boolean).join(' · '))}</p></div><span>${selected.records.length} 条历史记录</span></header>
    <div class="metric-time-controls"><label>从<input type="date" id="metricHubFrom" value="${esc(from)}" aria-label="起始日期"></label><label>至<input type="date" id="metricHubTo" value="${esc(to)}" aria-label="结束日期"></label><button class="btn" id="metricHubApply">应用</button><div class="metric-quick"><button data-metric-period="all">全部</button><button data-metric-period="90">近 90 天</button><button data-metric-period="365">近一年</button></div></div>
    <p id="metricDateError" role="status" class="metric-error"></p>
    <div class="metric-statistics"><div><span>最近结果${stats.latest ? '<time>' + esc(stats.latest.date) + '</time>' : ''}</span><strong>${stats.latest ? esc(stats.latest.value === null ? stats.latest.qualitative : metricNumber(stats.latest.value)) : '—'}<small>${stats.latest?.value !== null && stats.latest ? esc(selected.unit) : ''}</small></strong></div><div><span>较上一条${stats.previous ? '<time>' + esc(stats.previous.date) + '</time>' : ''}</span><strong>${stats.delta === null ? '—' : esc((stats.delta > 0 ? '+' : '') + metricNumber(stats.delta))}<small>${stats.delta === null ? '' : esc(selected.unit)}</small></strong></div><div><span>筛选范围内最低 / 最高</span><strong class="metric-extremes">${metricNumber(stats.min)} / ${metricNumber(stats.max)}<small>${esc(selected.unit)}</small></strong></div></div>
    <div id="metricHubChart" class="metric-chart"></div><p class="metric-chart-note">${stats.variedRange ? '各次参考范围不同，请以明细中各自的范围为准。' : stats.sharedRange ? '底色为这些记录共同的参考范围。' : '未显示参考区间底色；以每条记录实际填写的范围为准。'} 连接线仅辅助观察，未测日期不补值；升降不直接代表健康改善或恶化。</p>
    <div class="metric-history-head"><h3>逐次记录</h3><span>${records.length} 条 · ${stats.days} 个记录日</span></div><div id="metricHubHistory"></div>`}</section></div>`;
  const paintIndex = () => {
    const needle = metricHubFilter.q.trim().toLowerCase();
    const visible = groups.filter(group => (!metricHubFilter.kind || group.kind === metricHubFilter.kind) &&
      [group.label, group.unit, group.category, group.detail].join(' ').toLowerCase().includes(needle));
    $('#metricHubIndex').innerHTML = visible.length ? visible.map(group => {
      const last = group.records.at(-1);
      return `<a href="${esc(metricHref(group.key))}" class="metric-index-row${selected?.key === group.key ? ' is-selected' : ''}" ${selected?.key === group.key ? 'aria-current="true"' : ''}><span class="metric-index-name">${esc(group.label)}<small>${esc([group.unit || '无单位', group.detail].filter(Boolean).join(' · '))}</small></span><span class="metric-index-value">${esc(last.value === null ? last.qualitative : metricNumber(last.value))}<small>${group.records.length} 条</small></span></a>`;
    }).join('') : '<p class="metric-no-results">没有匹配的指标，试试其他名称或来源。</p>';
  };
  $('#metricHubSearch').addEventListener('input', e => { metricHubFilter.q = e.target.value; paintIndex(); });
  $('#metricHubKind').addEventListener('change', e => { metricHubFilter.kind = e.target.value; paintIndex(); });
  paintIndex();
  $('#metricMobileToggle').addEventListener('click', e => {
    const expanded = $('.metric-workspace').classList.toggle('is-picking');
    e.currentTarget.setAttribute('aria-expanded', String(expanded));
    if (expanded) $('#metricHubSearch').focus();
  });
  if (!selected) return;
  const paintHistory = () => {
    const pages = Math.max(1, Math.ceil(records.length / 20));
    metricHubPage = Math.min(Math.max(1, metricHubPage), pages);
    const rows = records.slice().reverse().slice((metricHubPage - 1) * 20, metricHubPage * 20);
    $('#metricHubHistory').innerHTML = rows.length ? `<div class="metric-table-wrap"><table class="metric-table"><thead><tr><th>日期</th><th>结果${selected.unit ? '（' + esc(selected.unit) + '）' : ''}</th><th>参考范围</th><th>来源 / 备注</th></tr></thead><tbody>${rows.map(row => {
      const high = row.flag === 'H' || row.value !== null && row.high !== null && row.value > row.high;
      const low = row.flag === 'L' || row.value !== null && row.low !== null && row.value < row.low;
      return `<tr><td>${esc(row.date)}</td><td class="metric-result${high || low ? ' is-flagged' : ''}">${esc(row.value === null ? row.qualitative : metricNumber(row.value))}${high ? ' ↑' : low ? ' ↓' : ''}</td><td data-label="参考范围">${esc(metricRangeText(row))}</td><td data-label="来源 / 备注">${row.reportId ? `<button class="link-btn" data-act="viewreport" data-id="${esc(row.reportId)}">${esc(row.source)}</button>` : esc(row.source)}${row.note ? `<small>${esc(row.note)}</small>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>${pages > 1 ? `<div class="metric-pagination"><button class="btn" id="metricPrev" ${metricHubPage === 1 ? 'disabled' : ''}>上一页</button><span>${metricHubPage} / ${pages}</span><button class="btn" id="metricNext" ${metricHubPage === pages ? 'disabled' : ''}>下一页</button></div>` : ''}` : '<p class="metric-no-results">这个时间范围内没有记录，请调整日期或查看全部。</p>';
    $('#metricPrev')?.addEventListener('click', () => { metricHubPage--; paintHistory(); });
    $('#metricNext')?.addEventListener('click', () => { metricHubPage++; paintHistory(); });
  };
  paintHistory();
  $('#metricHubApply').addEventListener('click', () => {
    const start = $('#metricHubFrom').value, end = $('#metricHubTo').value;
    if (start && end && start > end) { $('#metricDateError').textContent = '起始日期不能晚于结束日期'; return; }
    metricHubPage = 1;
    goHash(metricHref(selected.key, { from: start, to: end }));
  });
  $$('[data-metric-period]').forEach(button => button.addEventListener('click', () => {
    const period = button.dataset.metricPeriod;
    const end = todayISO();
    const start = new Date(end + 'T00:00:00');
    start.setDate(start.getDate() - Number(period) + 1);
    const from = period === 'all' ? '' : `${start.getFullYear()}-${pad(start.getMonth()+1)}-${pad(start.getDate())}`;
    metricHubPage = 1;
    goHash(metricHref(selected.key, { from, to: period === 'all' ? '' : end }));
  }));
  const chart = $('#metricHubChart');
  if (!records.length) chart.innerHTML = '<div class="metric-no-results">当前时间范围没有数据。</div>';
  else if (!stats.numeric.length) chart.innerHTML = '<div class="metric-no-results">该指标为定性结果，按日期查看下方明细，不转换为数值曲线。</div>';
  else echartsChart(chart, { series: [{ name: selected.label, points: stats.numeric.map(r => ({ date: r.date, value: r.value })) }],
    unit: selected.unit, ...stats.sharedRange, aggregate: false, gapDays: 365000, height: window.innerWidth < 700 ? 220 : 270 });
}
