/* ======================= 渲染：减重 ======================= */
/* ======================= 渲染：减重记录 ======================= */
const BODY_COLORS = { chest: '#2F6B57', waist: '#B9583C', hip: '#A9752F' };

function bodySeries(k) {
  return bodyList().filter(b => Number.isFinite(b[k])).map(b => ({ date: b.date, value: b[k] }));
}

/* 三线共用一条 y 轴：三围数值本来就在同一量级，分轴反而不好比 */
function paintBodyChart(host, recs) {
  if (!host) return;
  const series = BODY_FIELDS.map(f => ({
    name: f.label, color: BODY_COLORS[f.k],
    points: recs.filter(r => Number.isFinite(r[f.k])).map(r => ({ date: r.date, value: r[f.k] }))
  })).filter(s => s.points.length);
  if (!series.length) { host.innerHTML = ''; return; }
  // 只有一天的数据画不出趋势，画了也是三个孤零零的点，不如直说还缺一次
  const days = [...new Set(series.flatMap(s => s.points.map(p => p.date)))];
  if (days.length < 2) {
    host.style.height = '';
    host.style.minHeight = '0';
    host.innerHTML = `<div class="empty" style="padding:26px 12px;color:var(--muted-3);text-align:center">围度目前只有 ${esc(days[0])} 一次记录。再量一次，才看得出围度有没有跟着体重动。</div>`;
    return;
  }
  echartsChart(host, {
    series,
    unit: 'cm',
    gapDays: 30,
    height: window.innerWidth < 700 ? 230 : 270
  });
}

function bodyCardHTML() {
  const list = bodyList();
  const legend = `<div class="body-legend">${[['胸围', 'chest'], ['腰围', 'waist'], ['臀围', 'hip']]
    .map(([l, k]) => `<span><i class="bl-dot" style="background:${BODY_COLORS[k]}"></i>${l}</span>`).join('')}</div>`;

  const sum = BODY_FIELDS.map(f => {
    const pts = bodySeries(f.k);
    const cur = pts.at(-1), prev = pts.at(-2);
    const d = cur && prev ? cur.value - prev.value : null;
    const sub = !cur ? '还没记录'
      : d === null ? `${cur.date}　首次记录`
        : `${cur.date}　较上次 ${d > 0 ? '+' : ''}${d.toFixed(1)} cm`;
    return `<div class="bs-item">
      <span class="bs-k">${f.label}</span>
      <span class="bs-v">${cur ? num(cur.value) : '—'}<small>cm</small></span>
      <span class="bs-d ${cur ? '' : 'none'}">${sub}</span>
    </div>`;
  }).join('');

  if (!list.length) {
    return `<section class="card">
      <div class="bs-head">
        <h2>身体围度</h2>
        <button class="btn btn-ghost" data-act="body-add">${I.plus}记录围度</button>
      </div>
      <div class="body-empty">还没有围度记录。量一次胸、腰、臀，才能看出腰围是不是跟着体重一起动。</div>
    </section>`;
  }

  const rows = list.slice().reverse().map(b => {
    const w = weightOf(b.date);
    return `<tr>
      <td class="date">${esc(b.date)}</td>
      <td class="ref" style="text-align:left">${Number.isFinite(b.chest) ? num(b.chest) : '—'}</td>
      <td class="ref" style="text-align:left">${Number.isFinite(b.waist) ? num(b.waist) : '—'}</td>
      <td class="ref" style="text-align:left">${Number.isFinite(b.hip) ? num(b.hip) : '—'}</td>
      <td class="ref" style="text-align:left">${w ? kg1(w.kg) + ' kg' : '—'}</td>
      <td style="color:var(--muted);font-size:10.5px">${esc(b.note || '—')}</td>
      <td class="act"><button data-act="body-edit" data-id="${esc(b.id)}">编辑</button><button class="danger" data-act="body-del" data-id="${esc(b.id)}">删除</button></td>
    </tr>`;
  }).join('');

  return `<section class="card">
    <div class="bs-head">
      <h2>身体围度</h2>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        ${legend}
        <button class="btn btn-ghost" data-act="body-add">${I.plus}记录围度</button>
      </div>
    </div>
    <div class="body-sum">${sum}</div>
    <div class="chart-box" id="bodyChart"></div>
    <div class="table-wrap" style="margin-top:6px">
      <table class="data b-table">
        <thead><tr><th>日期</th><th>胸围</th><th>腰围</th><th>臀围</th><th>同日体重</th><th>备注</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="hint" style="margin-top:12px">围度没有统一参考区间，这里只做同一个人前后对比。腰围按肚脐水平一周、呼气末量；同一位置同一时间量，数值才有可比性。</p>
  </section>`;
}

/* ---------- 身体成分（体脂秤指标）：录入表单 / 展示卡片 ---------- */
function weightMetricInputsHTML(w) {
  return WEIGHT_METRICS.map(m => {
    const v = w && Number.isFinite(w[m.k]) ? w[m.k] : '';
    return `<div class="field"><label>${m.label}${m.unit ? ` <small style="color:var(--muted-3);font-weight:400">${m.unit}</small>` : ''}</label>
      <input type="number" step="${m.step}" name="${m.k}" value="${v}" placeholder="可空" min="0" inputmode="decimal"></div>`;
  }).join('');
}

/* 从表单读取 6 项身体成分：空值 / 非正数 → null，保持「可空」语义 */
function readWeightMetrics(fd) {
  const out = {};
  WEIGHT_METRICS.forEach(m => {
    const raw = fd.get(m.k);
    if (raw === null || raw === undefined || String(raw).trim() === '') { out[m.k] = null; return; }
    const n = Number(raw);
    out[m.k] = Number.isFinite(n) && n > 0 ? n : null;
  });
  return out;
}

function compCardHTML() {
  const stats = WEIGHT_METRICS.map(m => {
    const rec = latestMetricRecord(m.k);
    const withVal = weightList().filter(w => weightMetricVal(w, m.k) !== null);
    const prev = withVal.slice(-2)[0];
    const cur = rec ? weightMetricVal(rec, m.k) : null;
    const d = rec && prev && prev.id !== rec.id ? cur - weightMetricVal(prev, m.k) : null;
    const sub = !rec ? '还没录入'
      : d === null ? `${rec.date}`
        : `${rec.date}　较上次 ${d > 0 ? '+' : ''}${d.toFixed(m.dec)}`;
    return `<div class="bs-item">
      <span class="bs-k">${m.label}</span>
      <span class="bs-v">${rec ? num(cur, m.dec) : '—'}${m.unit ? `<small>${m.unit}</small>` : ''}</span>
      <span class="bs-d ${rec ? '' : 'none'}">${sub}</span>
    </div>`;
  }).join('');

  const series = WEIGHT_METRICS.filter(m => weightMetricSeries(m.k).length);
  if (!series.length) {
    return `<section class="card">
      <div class="bs-head"><h2>身体成分（体脂秤）</h2><span class="link">未录入</span></div>
      <div class="body-empty">还没有体脂秤数据。新增或编辑体重记录时可补录体脂率、肌肉量、BMI、内脏脂肪、基础代谢、骨量，指标会自动出现在这里做趋势对比。</div>
    </section>`;
  }
  if (!series.some(m => m.k === ui.compMetric)) ui.compMetric = series[0].k;
  const tabs = series.map(m => `<button data-act="comp-metric" data-k="${m.k}" class="${ui.compMetric === m.k ? 'on' : ''}">${m.label}</button>`).join('');

  return `<section class="card">
    <div class="bs-head">
      <h2>身体成分（体脂秤）</h2>
      <div class="segmented">${tabs}</div>
    </div>
    <div class="body-sum">${stats}</div>
    <div class="chart-box" id="compChart"></div>
    <p class="hint" style="margin-top:10px">体脂秤指标受水分、进食影响大，只做同一个人前后对比，不设固定参考区间。<b style="font-weight:600">线断开的地方是那段时间没有记录，不是数值没变</b>；同一天称了多次只画当天最后一次，其余仍在下方明细里。数据缺项可留空，不影响体重本身的计算。</p>
  </section>`;
}

function paintCompChart() {
  const host = $('#compChart');
  if (!host) return;
  const m = WEIGHT_METRICS.find(x => x.k === ui.compMetric);
  if (!m) return;
  const pts = weightMetricSeries(m.k);
  if (!pts.length) { host.innerHTML = ''; return; }
  echartsChart(host, {
    series: [{ name: m.label, points: pts }],
    unit: m.unit || undefined,
    gapDays: 10,
    onePerDay: true,
    height: window.innerWidth < 700 ? 210 : 240
  });
}

function renderWeight() {
  const list = weightList();
  const cur = latestWeight();
  const bl = baselineInfo();
  const pct = progressPct();
  const target = wtTarget();
  const startKg = wtStart();
  const change = (cur && startKg !== null) ? cur.kg - startKg : null;
  const since7 = list.filter(w => (Date.now() - Date.parse(w.date + 'T00:00:00')) <= 7 * 864e5);
  const pg = paginate(list.slice().reverse(), 'weight');

  setHead('WEIGHT LOG　减重记录', '减重记录',
    '同条件晨重建立基线；自报体重单列，不并入均值',
    `<button class="btn btn-primary" data-act="weight-add">${I.plus}记录体重</button>`);

  $('#view').innerHTML = `
    <div class="stack">
      <section class="hero">
        <div class="hero-left">
          <p class="hero-label">当前体重　WEIGHT</p>
          <div class="hero-num"><b>${cur ? kg1(cur.kg) : '—'}</b><span>kg</span></div>
          <p class="hero-sub">${cur ? `${esc(cur.date)} ${cur.tag === 'morning' ? '晨重' : cur.tag === 'device' ? '设备测量' : '自报，非标准晨重'}` : '还没有称重记录'}</p>
        </div>
        <div class="hero-div"></div>
        <div class="hero-stats">
          <div class="stat"><small>较起点</small><b>${change === null ? '—' : (change > 0 ? '+' : '') + change.toFixed(1)}</b><i>${change === null ? '无起点' : 'kg'}</i></div>
          <div class="stat"><small>7 天晨重均值</small><b style="font-size:${bl.ok ? '22px' : '19px'}">${bl.ok ? kg1(bl.kg) : (bl.days ? '记录中' : '未建立')}</b><i>${bl.ok ? 'kg' : `还需 ${bl.need ?? 7} 天`}</i></div>
          <div class="stat"><small>长期目标</small><b>${target === null ? '—' : target.toFixed(1)}</b><i>${target === null ? '未设' : 'kg'}</i></div>
          <div class="stat"><small>近 7 天记录</small><b>${since7.length}</b><i>次</i></div>
        </div>
        <div class="hero-progress">
          <div class="hp-row"><span>减重进度</span><b>${pct === null ? '—' : Math.round(pct) + ' %'}</b></div>
          <div class="track"><i style="width:${pct === null ? 0 : Math.max(pct, 2)}%"></i></div>
          <div class="hp-scale"><span>${startKg === null ? '起点未设' : startKg.toFixed(1) + ' kg'}</span><span>${target === null ? '目标未设' : target.toFixed(1) + ' kg'}</span></div>
          <p class="hp-note">${cur
            ? target === null ? '档案里还没设长期目标，进度暂不计算' : `距目标 ${(cur.kg - target).toFixed(1)} kg　·　${ARCHIVE.weight.stageTarget || ''}`
            : '记下第一次体重后，这里会算距目标的距离与进度'}</p>
        </div>
      </section>

      <section class="card chart-card">
        <div class="chart-head">
          <div class="chart-title"><h2>体重趋势</h2><p>${list.length
            ? `共 ${list.length} 条记录 / ${new Set(list.map(w => w.date)).size} 天　·　${target === null ? '未设长期目标' : '虚线为长期目标 ' + target.toFixed(1) + ' kg'}　·　线断开处为没有称重的时段`
            : '还没有称重记录，记两次以上才画得出趋势'}</p></div>
          <span class="chip ${bl.ok ? 'green' : 'amber'} chip-sm">${bl.ok ? '已建立晨重基线' : '基线待建立'}</span>
        </div>
        <div class="chart-box" id="weightChart"></div>
      </section>

      ${bodyCardHTML()}

      ${compCardHTML()}

      ${detailFold('weight', '记录明细', list.length, `
        ${(() => {
          const kgs = list.map(w => w.kg).filter(Number.isFinite);
          const dates = list.map(w => w.date).filter(Boolean).sort();
          return statsBar([
            kgs.length ? { label: '最低', value: kg1(Math.min(...kgs)) + ' kg' } : null,
            kgs.length ? { label: '最高', value: kg1(Math.max(...kgs)) + ' kg' } : null,
            kgs.length ? { label: '均值', value: kg1(avg(kgs)) + ' kg', sub: `${kgs.length} 次` } : null,
            dates.length ? { label: '记录区间', value: esc(dates[0] + ' ~ ' + dates[dates.length - 1]), sub: `${dates.length} 天` } : null
          ]);
        })()}
        <div class="table-wrap">
          <table class="data w-table">
            <thead><tr><th>日期</th><th>体重</th><th>条件</th><th>腰围</th><th>身体成分</th><th>备注</th><th></th></tr></thead>
            <tbody>
              ${pg.rows.map(w => `<tr>
                <td class="date">${esc(w.date)}</td>
                <td class="num">${kg1(w.kg)}<span style="color:var(--muted-3);font-size:9px;font-weight:400"> kg</span></td>
                <td><span class="chip ${w.tag === 'morning' ? 'green' : 'mute'} chip-sm">${w.tag === 'morning' ? '晨重' : w.tag === 'device' ? '设备' : w.tag === 'reported' ? '自报' : '其他时段'}</span></td>
                <td class="ref" style="text-align:left">${(() => { const b = bodyOf(w.date); return b && Number.isFinite(b.waist) ? num(b.waist) + ' cm' : '—'; })()}</td>
                <td style="color:var(--muted);font-size:10.5px">${(() => { const parts = WEIGHT_METRICS.filter(m => weightMetricVal(w, m.k) !== null).map(m => `${m.label} ${num(weightMetricVal(w, m.k), m.dec)}${m.unit || ''}`); return parts.length ? parts.join('　') : '—'; })()}</td>
                <td style="color:var(--muted);font-size:10.5px">${esc(w.note || '—')}</td>
                <td class="act"><button data-act="weight-edit" data-id="${esc(w.id)}">编辑</button><button class="danger" data-act="weight-del" data-id="${esc(w.id)}">删除</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${pagerHTML('weight', pg)}
      `)}

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>称重与记录规则</h2></div>
          ${((ARCHIVE.weight && ARCHIVE.weight.rules) || []).map((r, i) => `<div class="task"><div class="task-body"><p class="task-text" style="font-size:12px">${i + 1}. ${esc(r)}</p></div></div>`).join('')}
        </section>
        <section class="card">
          <div class="card-head"><h2>当前计划</h2><span class="chip amber chip-sm">建议值</span></div>
          <div class="tl-row"><time>摄入</time><p>${esc((ARCHIVE.weight && ARCHIVE.weight.kcal) || '未记录')}</p></div>
          <div class="tl-row"><time>阶段目标</time><p>${esc((ARCHIVE.weight && ARCHIVE.weight.stageTarget) || '未设')}</p></div>
          <div class="tl-row"><time>复盘</time><p>2026-11-03 首次周复盘；11-10 至 11-17 复核趋势与热量预算</p></div>
          <p class="hint" style="margin-top:10px">以上为自行复盘计划，未设置提醒；体重变化需结合实际记录与身体反应调整。</p>
        </section>
      </div>
    </div>`;

  const wc = $('#weightChart');
  if (wc) {
    if (!list.length) {
      wc.style.height = '';
      wc.style.minHeight = '0';
      wc.innerHTML = `<div class="empty" style="padding:26px 12px;color:var(--muted-3);text-align:center">还没有称重记录。点右上角「记录体重」记第一次，之后每天一条就能看出趋势。</div>`;
    } else {
      const pts = list.map(w => ({ date: w.date, value: w.kg }));
      echartsChart(wc, {
        series: [{ name: '体重', points: pts }],
        unit: 'kg',
        target: target,
        gapDays: 10,
        onePerDay: true,
        height: window.innerWidth < 700 ? 220 : 260
      });
    }
  }

  const bc = $('#bodyChart');
  if (bc) paintBodyChart(bc, bodyList());

  paintCompChart();
}

/* ======================= 渲染：生命体征 ======================= */
/* 单条记录把异常项标红（↑偏高 / ↓偏低），正常保持本色；参考区间见 VITAL_RANGES。 */
function vitalFlagText(k, v, rec) {
  const f = vitalFlag(k, v, rec);
  return f === 'H' ? '偏高' : f === 'L' ? '偏低' : f === 'N' ? '正常' : '';
}

function renderVitals() {
  const list = vitalsSorted();
  setHead('VITALS　生命体征', '生命体征',
    '血压 / 心率 / 体温 / 血氧 / 血糖，按日记录并可看趋势',
    `<button class="btn btn-primary" data-act="vital-add">${I.plus}记录体征</button>`);

  if (!list.length) {
    $('#view').innerHTML = `
      <section class="card">
        <div class="card-head"><h2>还没有体征记录</h2><span class="link">0 条</span></div>
        <div class="empty" style="display:flex;flex-direction:column;gap:12px;align-items:flex-start;padding:22px 6px">
          <p style="margin:0;color:var(--muted)">血压、心率、体温、血氧、血糖都可以在这里记。一次测了哪几项就填哪几项，之后能看到走势，超出参考范围的会标红。</p>
          <button class="btn btn-primary" data-act="vital-add">${I.plus}记录第一组体征</button>
        </div>
        <p class="hint">参考区间（成人静息）：血压 90–139 / 60–89 mmHg、心率 60–100 次/分、体温 36.0–37.3 ℃、血氧 95–100 %、空腹血糖 3.9–6.1 mmol/L。仅供观察，不替代医生判断。</p>
      </section>`;
    return;
  }

  // 当前选择的指标没有数据，就自动切到第一个有数据的指标
  if (!vitals.some(v => Number.isFinite(v[ui.vitalMetric]))) {
    const first = VITAL_METRICS.find(m => vitals.some(v => Number.isFinite(v[m.k])));
    if (first) ui.vitalMetric = first.k;
  }
  const metric = VITAL_METRICS.find(m => m.k === ui.vitalMetric) || VITAL_METRICS[0];

  const metricTile = (k) => {
    const m = VITAL_METRICS.find(x => x.k === k);
    const rec = latestVitalOf(k);
    if (!rec) {
      return `<div style="border:1px dashed var(--line-3);border-radius:10px;padding:12px 14px">
        <div style="font-size:10px;letter-spacing:.08em;color:var(--muted-2)">${m.label}</div>
        <div style="font:600 18px/1.25 var(--serif);margin-top:6px;color:var(--muted-3)">—</div>
        <div style="font-size:10px;color:var(--muted-3);margin-top:4px">未记录</div></div>`;
    }
    const v = rec[k];
    const f = vitalFlag(k, v, rec);
    const bad = f === 'H' || f === 'L';
    return `<div style="border:1px solid var(--line-2);border-radius:10px;padding:12px 14px">
      <div style="font-size:10px;letter-spacing:.08em;color:var(--muted-2)">${m.label}</div>
      <div style="font:600 20px/1.25 var(--serif);margin-top:6px;color:${bad ? '#B4553F' : 'inherit'}">${num(v, m.dec)}<span style="font-size:10px;font-weight:400;color:var(--muted-3)"> ${m.unit}</span></div>
      <div style="font-size:10px;color:${bad ? '#B4553F' : 'var(--muted-3)'};margin-top:4px">${esc(rec.date)}${bad ? ' · ' + vitalFlagText(k, v, rec) : ''}</div>
    </div>`;
  };

  // 血压单独一卡：高压/低压同一条记录里成对显示
  const bpRec = (() => {
    const rows = vitalsSorted().filter(v => Number.isFinite(v.systolic) || Number.isFinite(v.diastolic));
    return rows.length ? rows[rows.length - 1] : null;
  })();
  const bpBad = bpRec && (
    ['H', 'L'].includes(vitalFlag('systolic', bpRec.systolic, bpRec)) ||
    ['H', 'L'].includes(vitalFlag('diastolic', bpRec.diastolic, bpRec)));
  const bpTile = bpRec ? `<div style="border:1px solid var(--line-2);border-radius:10px;padding:12px 14px">
      <div style="font-size:10px;letter-spacing:.08em;color:var(--muted-2)">血压</div>
      <div style="font:600 20px/1.25 var(--serif);margin-top:6px;color:${bpBad ? '#B4553F' : 'inherit'}">${Number.isFinite(bpRec.systolic) ? bpRec.systolic : '—'}/${Number.isFinite(bpRec.diastolic) ? bpRec.diastolic : '—'}<span style="font-size:10px;font-weight:400;color:var(--muted-3)"> mmHg</span></div>
      <div style="font-size:10px;color:${bpBad ? '#B4553F' : 'var(--muted-3)'};margin-top:4px">${esc(bpRec.date)}${bpBad ? ' · 超出参考' : ''}</div>
    </div>` : `<div style="border:1px dashed var(--line-3);border-radius:10px;padding:12px 14px">
      <div style="font-size:10px;letter-spacing:.08em;color:var(--muted-2)">血压</div>
      <div style="font:600 18px/1.25 var(--serif);margin-top:6px;color:var(--muted-3)">—</div>
      <div style="font-size:10px;color:var(--muted-3);margin-top:4px">未记录</div></div>`;

  const rows = list.slice().reverse().map(v => {
    const cell = (k) => {
      const m = VITAL_METRICS.find(x => x.k === k);
      const val = v[k];
      if (!Number.isFinite(val)) return `<td class="num" style="color:var(--muted-3)">—</td>`;
      const f = vitalFlag(k, val, v);
      const bad = f === 'H' || f === 'L';
      const arrow = f === 'H' ? '↑' : f === 'L' ? '↓' : '';
      return `<td class="num" style="color:${bad ? '#B4553F' : 'inherit'};font-weight:${bad ? 600 : 400}">${num(val, m.dec)}${arrow ? ` <span style="font-size:9px">${arrow}</span>` : ''}</td>`;
    };
    const bp = (Number.isFinite(v.systolic) || Number.isFinite(v.diastolic))
      ? `${Number.isFinite(v.systolic) ? v.systolic : '—'}/${Number.isFinite(v.diastolic) ? v.diastolic : '—'}`
      : '—';
    const bpRowBad = ['H', 'L'].includes(vitalFlag('systolic', v.systolic, v)) || ['H', 'L'].includes(vitalFlag('diastolic', v.diastolic, v));
    const glucoseTagTxt = Number.isFinite(v.glucose) ? (GLUCOSE_TAGS.find(t => t[0] === v.glucoseTag) || ['', ''])[1] : '';
    return `<tr>
      <td class="date">${esc(v.date)}</td>
      <td class="num" style="color:${bpRowBad ? '#B4553F' : 'inherit'};font-weight:${bpRowBad ? 600 : 400}">${bp}</td>
      ${cell('pulse')}
      ${cell('temperature')}
      ${cell('spo2')}
      <td class="num" style="color:${['H', 'L'].includes(vitalFlag('glucose', v.glucose, v)) ? '#B4553F' : 'inherit'}">${Number.isFinite(v.glucose) ? num(v.glucose, 1) + (glucoseTagTxt ? `<span style="font-size:9px;color:var(--muted-3)"> ${glucoseTagTxt}</span>` : '') : '<span style="color:var(--muted-3)">—</span>'}</td>
      <td style="color:var(--muted);font-size:10.5px">${esc(v.note || '—')}</td>
      <td class="act"><button data-act="vital-edit" data-id="${esc(v.id)}">编辑</button><button class="danger" data-act="vital-del" data-id="${esc(v.id)}">删除</button></td>
    </tr>`;
  }).join('');

  $('#view').innerHTML = `
    <div class="stack">
      <section class="card">
        <div class="card-head"><h2>最近一次</h2><span class="link">按最近记录</span></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
          ${bpTile}
          ${metricTile('pulse')}
          ${metricTile('temperature')}
          ${metricTile('spo2')}
          ${metricTile('glucose')}
        </div>
      </section>

      <section class="card chart-card">
        <div class="chart-head">
          <div class="chart-title"><h2>${metric.label}趋势</h2><p>共 ${vitalPoints(metric.k).length} 条记录　·　阴影为一般参考区间，越界点标红</p></div>
          <div class="chart-tools"><label class="select"><select id="vitalMetricSelect">${VITAL_METRICS.map(m => `<option value="${m.k}" ${m.k === ui.vitalMetric ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label></div>
        </div>
        <div class="chart-box" id="vitalsChart"></div>
      </section>

      ${detailFold('vitals', '记录明细', list.length, `
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>日期</th><th>血压</th><th>心率</th><th>体温</th><th>血氧</th><th>血糖</th><th>备注</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `)}
    </div>`;

  const sel = $('#vitalMetricSelect');
  if (sel) sel.addEventListener('change', () => { ui.vitalMetric = sel.value; renderVitals(); });

  const host = $('#vitalsChart');
  if (host) {
    const pts = vitalPoints(metric.k);
    if (!pts.length) {
      host.innerHTML = '<div class="empty">这项还没有记录</div>';
    } else {
      let low = null, high = null;
      if (metric.k === 'glucose') {
        const lastRec = pts[pts.length - 1].rec;
        [low, high] = vitalRange('glucose', lastRec);
      } else {
        [low, high] = vitalRange(metric.k);
      }
      echartsChart(host, {
        series: [{ name: metric.label, points: pts.map(p => ({ date: p.date, value: p.value })) }],
        low, high, unit: metric.unit,
        height: window.innerWidth < 700 ? 220 : 260
      });
    }
  }
}

/* ======================= 渲染：睡眠 ======================= */
function sleepMetricPoints() {
  return sleepLogs.filter(s => Number.isFinite(s.hours))
    .slice().sort((a, b) => a.date.localeCompare(b.date))
    .map(s => ({ date: s.date, value: Math.round(s.hours * 10) / 10 }));
}
function renderSleep() {
  const list = sleepLogsSorted();
  setHead('SLEEP　睡眠', '睡眠',
    '小米手环睡眠汇总，一天一条；导入后按日看时长趋势',
    `<button class="btn btn-primary" data-act="sleep-import">${I.upload}导入设备数据</button>`);

  if (!list.length) {
    $('#view').innerHTML = `
      <section class="card">
        <div class="card-head"><h2>还没有睡眠记录</h2><span class="link">0 条</span></div>
        <div class="empty" style="display:flex;flex-direction:column;gap:12px;align-items:flex-start;padding:22px 6px">
          <p style="margin:0;color:var(--muted)">从小米运动健康 App 导出睡眠 CSV，在这里导入后，能按天看睡眠时长走势。数据只在本机解析，不上传。</p>
          <button class="btn btn-primary" data-act="sleep-import">${I.upload}导入设备数据</button>
        </div>
        <p class="hint">支持文件：小米运动健康导出的「*_hlth_center_aggregated_fitness_data.csv」（睡眠汇总）。</p>
      </section>`;
    return;
  }

  const withH = list.filter(s => Number.isFinite(s.hours));
  const avg7 = (() => {
    const cut = Date.now() - 7 * 864e5;
    const r = withH.filter(s => Date.parse(s.date + 'T00:00:00') >= cut);
    return r.length ? { n: r.length, h: avg(r.map(s => s.hours)) } : { n: 0, h: null };
  })();
  const last = withH[0];
  const lastScore = last && Number.isFinite(last.score) ? last.score : null;

  const pgSleep = paginate(list, 'sleep');
  const rows = pgSleep.rows.map(s => `<tr>
      <td class="date">${esc(s.date)}</td>
      <td class="num">${Number.isFinite(s.hours) ? num(s.hours, 1) + '<span style="color:var(--muted-3);font-size:9px"> h</span>' : '<span style="color:var(--muted-3)">—</span>'}</td>
      <td class="ref" style="text-align:left">${Number.isFinite(s.minutes) ? Math.round(s.minutes) + ' 分钟' : '—'}</td>
      <td class="num">${Number.isFinite(s.score) ? s.score : '<span style="color:var(--muted-3)">—</span>'}</td>
      <td style="color:var(--muted);font-size:10.5px">${esc([s.bedtime, s.wake].filter(Boolean).join(' → ') || '—')}</td>
      <td style="color:var(--muted);font-size:10.5px">${esc(s.note || (s.source === 'mi-band' ? '小米手环' : '—'))}</td>
      <td class="act"><button class="danger" data-act="sleep-del" data-id="${esc(s.id)}">删除</button></td>
    </tr>`).join('');

  const sleepStats = (() => {
    const hs = list.map(s => s.hours).filter(Number.isFinite);
    const dates = list.map(s => s.date).filter(Boolean).sort();
    return statsBar([
      hs.length ? { label: '最短', value: num(Math.min(...hs), 1) + ' h' } : null,
      hs.length ? { label: '最长', value: num(Math.max(...hs), 1) + ' h' } : null,
      hs.length ? { label: '均值', value: num(avg(hs), 1) + ' h', sub: `${hs.length} 晚` } : null,
      dates.length ? { label: '记录区间', value: esc(dates[0] + ' ~ ' + dates[dates.length - 1]), sub: `${dates.length} 天` } : null
    ]);
  })();

  const tiles = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
      <div style="border:1px solid var(--line-2);border-radius:10px;padding:12px 14px">
        <div style="font-size:10px;letter-spacing:.08em;color:var(--muted-2)">最近一晚</div>
        <div style="font:600 20px/1.25 var(--serif);margin-top:6px">${last ? num(last.hours, 1) : '—'}<span style="font-size:10px;font-weight:400;color:var(--muted-3)"> h</span></div>
        <div style="font-size:10px;color:var(--muted-3);margin-top:4px">${last ? esc(last.date) : '未记录'}</div>
      </div>
      <div style="border:1px solid var(--line-2);border-radius:10px;padding:12px 14px">
        <div style="font-size:10px;letter-spacing:.08em;color:var(--muted-2)">近 7 天均值</div>
        <div style="font:600 20px/1.25 var(--serif);margin-top:6px">${avg7.h != null ? num(avg7.h, 1) : '—'}<span style="font-size:10px;font-weight:400;color:var(--muted-3)"> h</span></div>
        <div style="font-size:10px;color:var(--muted-3);margin-top:4px">${avg7.n ? avg7.n + ' 晚' : '近 7 天无记录'}</div>
      </div>
      <div style="border:1px solid var(--line-2);border-radius:10px;padding:12px 14px">
        <div style="font-size:10px;letter-spacing:.08em;color:var(--muted-2)">最近睡眠评分</div>
        <div style="font:600 20px/1.25 var(--serif);margin-top:6px">${lastScore != null ? lastScore : '—'}</div>
        <div style="font-size:10px;color:var(--muted-3);margin-top:4px">${lastScore != null ? '设备自评' : '设备未提供'}</div>
      </div>
    </div>`;

  $('#view').innerHTML = `
    <div class="stack">
      <section class="card">
        <div class="card-head"><h2>最近睡眠</h2><span class="link">按最近记录</span></div>
        ${tiles}
      </section>
      <section class="card chart-card">
        <div class="chart-head">
          <div class="chart-title"><h2>睡眠时长趋势</h2><p>共 ${withH.length} 条记录　·　阴影为 7–9 小时一般参考区间</p></div>
        </div>
        <div class="chart-box" id="sleepChart"></div>
      </section>
      ${detailFold('sleep', '记录明细', list.length, `
        ${sleepStats}
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>日期</th><th>睡眠时长</th><th>折算</th><th>评分</th><th>入睡/起床</th><th>来源</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${pagerHTML('sleep', pgSleep)}
      `)}
    </div>`;

  const host = $('#sleepChart');
  if (host) {
    const pts = sleepMetricPoints();
    if (!pts.length) host.innerHTML = '<div class="empty">这项还没有记录</div>';
    else echartsChart(host, {
      series: [{ name: '睡眠时长', points: pts }],
      low: 7, high: 9, unit: 'h',
      height: window.innerWidth < 700 ? 220 : 260
    });
  }
}

/* ======================= 渲染：症状日记 ======================= */
function renderSymptoms() {
  const all = symptomsSorted();
  setHead('SYMPTOMS　症状日记', '症状日记',
    '按日记录干眼、鼻炎、踝痛等主观不适，可按部位回看变化',
    `<button class="btn btn-primary" data-act="symptom-add">${I.plus}记录症状</button>`);

  if (!all.length) {
    $('#view').innerHTML = `
      <section class="card">
        <div class="card-head"><h2>还没有症状记录</h2><span class="link">0 条</span></div>
        <div class="empty" style="display:flex;flex-direction:column;gap:12px;align-items:flex-start;padding:22px 6px">
          <p style="margin:0;color:var(--muted)">干眼、鼻炎、踝痛这类主观不适，都可以在这里按日记一条：部位、程度、诱因、备注。之后能按部位筛出来看有没有变化，不必为每个病单独建页。</p>
          <button class="btn btn-primary" data-act="symptom-add">${I.plus}记录第一条症状</button>
        </div>
        <p class="hint">记录的是你的主观感受，不是诊断；程度 1–10 为自评分（1 很轻、10 难以忍受），仅作自我观察，不替代医生判断。</p>
      </section>`;
    return;
  }

  const parts = symptomParts();
  if (ui.symptomTheme && !parts.includes(ui.symptomTheme)) ui.symptomTheme = '';
  const list = ui.symptomTheme ? all.filter(s => s.part === ui.symptomTheme) : all;
  const filters = [['', '全部', all.length]].concat(parts.map(p => [p, p, all.filter(s => s.part === p).length]));

  const rows = list.map(s => {
    const sev = severityMeta(s.severity);
    const sevCell = sev.n != null
      ? `<span class="chip chip-sm ${sev.tone}">${sev.label} ${sev.n}/10</span>`
      : '<span style="color:var(--muted-3)">—</span>';
    return `<tr>
      <td class="date">${esc(s.date)}</td>
      <td><b>${esc(s.part)}</b></td>
      <td>${sevCell}</td>
      <td style="color:var(--muted-2)">${esc(s.trigger || '—')}</td>
      <td style="color:var(--muted-2)">${esc(s.note || '—')}</td>
      <td class="act"><button data-act="symptom-edit" data-id="${esc(s.id)}">编辑</button><button class="danger" data-act="symptom-del" data-id="${esc(s.id)}">删除</button></td>
    </tr>`;
  }).join('');

  $('#view').innerHTML = `
    <div class="stack">
      <div class="filter-row">
        ${filters.map(([k, label, n]) => `<button class="filter-chip ${ui.symptomTheme === k ? 'on' : ''}" data-act="symptom-filter" data-k="${esc(k)}">${esc(label)} ${n}</button>`).join('')}
      </div>
      <section class="card">
        <div class="card-head"><h2>${ui.symptomTheme ? esc(ui.symptomTheme) : '全部症状'}</h2><span class="link">${list.length} 条</span></div>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>日期</th><th>部位 / 主题</th><th>程度</th><th>诱因</th><th>备注</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="hint" style="margin-top:12px">程度为自评分 1–10（1 很轻、10 难以忍受）。记录只是自我观察，不能替代诊断；若症状持续或加重，请就医。</p>
      </section>
    </div>`;
}

/* ======================= 渲染：减重执行（每日记录 / 每周复盘） ======================= */
function dietTrendPoints(key) {
  return dietDaysSorted()
    .filter(d => Number.isFinite(d[key]) && d[key] > 0)
    .map(d => ({ date: d.date, value: d[key] }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
/* 空记录 / 断记提醒：只做提示，不补造任何数据 */
function dietReminders(days, weeks) {
  const msgs = [];
  if (!days.length) {
    msgs.push('还没有每日记录——先记今天的三餐、晨重与摄入估算。');
  } else {
    const last = days[0].date;
    const gap = Math.floor((Date.now() - Date.parse(last + 'T00:00:00')) / 86400000);
    if (gap >= 2) msgs.push(`最近一次每日记录在 ${last}，已 ${gap} 天没记；断记时趋势不可信。`);
  }
  if (!weeks.length) msgs.push('还没有每周复盘——每 7 天填一次，回看晨重均值与平均摄入。');
  return msgs;
}
function renderDiet() {
  const days = dietDaysSorted();
  const weeks = dietWeeksSorted();
  setHead('DIET LOG　减重执行', '减重执行',
    '每天记一条饮食与晨重，每周复盘一次；记录越连续，趋势越可信',
    `<button class="btn btn-primary" data-act="diet-day-add">${I.plus}记录今天</button>
     <button class="btn" data-act="diet-week-add">写周复盘</button>`);

  const remind = dietReminders(days, weeks);
  const remindCard = remind.length ? `
    <section class="card" style="border-left:3px solid #A9752F">
      <div class="card-head"><h2>提醒</h2><span class="link">${I.info || ''}</span></div>
      <ul style="margin:0;padding-left:18px;color:var(--muted-2);font-size:12.5px;line-height:1.9">
        ${remind.map(m => `<li>${esc(m)}</li>`).join('')}
      </ul>
    </section>` : '';

  const wPts = dietTrendPoints('morningWeight');
  const kPts = dietTrendPoints('kcalCenter');
  const trendCard = (wPts.length || kPts.length) ? `
    <section class="card">
      <div class="card-head"><h2>执行趋势</h2><span class="link">${days.length} 天 · ${weeks.length} 周</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">
        ${wPts.length ? `<div><div class="chart-title"><h2 style="font-size:12.5px">晨重（kg）</h2><p>仅统计填了晨重的天；缺测不补</p></div><div class="chart-box" id="dietWeightChart" style="min-height:200px"></div></div>` : ''}
        ${kPts.length ? `<div><div class="chart-title"><h2 style="font-size:12.5px">每日摄入中心值（kcal）</h2><p>仅统计估算了摄入的天；数值为估算</p></div><div class="chart-box" id="dietKcalChart" style="min-height:200px"></div></div>` : ''}
      </div>
    </section>` : '';

  const dayRows = days.map(d => {
    const comp = d.completeness ? `<span class="chip chip-sm">${esc(d.completeness)}</span>` : '<span style="color:var(--muted-3)">—</span>';
    const kcal = Number.isFinite(d.kcalCenter)
      ? `${num(d.kcalCenter, 0)}${(Number.isFinite(d.kcalLow) && Number.isFinite(d.kcalHigh)) ? ` <small style="color:var(--muted-3)">(${num(d.kcalLow, 0)}–${num(d.kcalHigh, 0)})</small>` : ''}`
      : '—';
    const ank = [d.ankle, d.summary].filter(Boolean).join('；') || '—';
    return `<tr>
      <td class="date">${esc(d.date)}</td>
      <td class="num">${Number.isFinite(d.morningWeight) ? num(d.morningWeight, 1) + '<span style="color:var(--muted-3);font-size:9px"> kg</span>' : '—'}</td>
      <td class="num">${kcal}</td>
      <td>${comp}</td>
      <td style="color:var(--muted-2)">${esc(ank)}</td>
      <td class="act"><button data-act="diet-day-edit" data-id="${esc(d.id)}">编辑</button><button class="danger" data-act="diet-day-del" data-id="${esc(d.id)}">删除</button></td>
    </tr>`;
  }).join('');
  const dayCard = `
    <section class="card">
      <div class="card-head"><h2>每日记录</h2><span class="link">${days.length} 条</span></div>
      ${!days.length ? `<div class="empty" style="display:flex;flex-direction:column;gap:12px;align-items:flex-start;padding:22px 6px">
          <p style="margin:0;color:var(--muted)">还没有每日记录。每天花一分钟记：晨重、三餐与饮料份量、当天摄入估算和「完整度」。空白一律表示「未记录」，不等于没吃；没吃请写「未吃」。</p>
          <button class="btn btn-primary" data-act="diet-day-add">${I.plus}记录今天</button>
        </div>`
        : `<div class="table-wrap"><table class="data"><thead><tr><th>日期</th><th>晨重</th><th>摄入中心（范围）</th><th>完整度</th><th>活动 / 踝 / 小结</th><th></th></tr></thead><tbody>${dayRows}</tbody></table></div>
           <p class="hint" style="margin-top:12px">「未记录」与「未吃」分开；运动热量不从摄入扣除。连续记录后趋势才有意义，单日涨跌不作为减餐依据。</p>`}
    </section>`;

  const weekRows = weeks.map(w => {
    const span = [w.weekStart, w.weekEnd].filter(Boolean).join(' → ') || '—';
    const avg = Number.isFinite(w.weightAvg) ? num(w.weightAvg, 1) + ' kg' : '—';
    const kcal = Number.isFinite(w.kcalCenter) ? num(w.kcalCenter, 0) + ' kcal' : '—';
    const cd = Number.isFinite(w.completeDays) ? num(w.completeDays, 0) + ' 天' : '—';
    return `<tr>
      <td class="date">${esc(span)}${w.reviewDate ? `<small style="color:var(--muted-3);display:block">复盘 ${esc(w.reviewDate)}</small>` : ''}</td>
      <td class="num">${avg}</td>
      <td class="num">${cd}</td>
      <td class="num">${kcal}</td>
      <td style="color:var(--muted-2)">${esc(w.nextFocus || w.observeDiff || '—')}</td>
      <td class="act"><button data-act="diet-week-edit" data-id="${esc(w.id)}">编辑</button><button class="danger" data-act="diet-week-del" data-id="${esc(w.id)}">删除</button></td>
    </tr>`;
  }).join('');
  const weekCard = `
    <section class="card">
      <div class="card-head"><h2>每周复盘</h2><span class="link">${weeks.length} 周</span></div>
      ${!weeks.length ? `<div class="empty" style="display:flex;flex-direction:column;gap:12px;align-items:flex-start;padding:22px 6px">
          <p style="margin:0;color:var(--muted)">还没有每周复盘。每 7 天填一次：晨重均值、完整饮食天数、平均摄入与踝部反应，以及下周只改进的一件事。连续 2–3 周数据较完整后再判断是否调整。</p>
          <button class="btn btn-primary" data-act="diet-week-add">写第一份周复盘</button>
        </div>`
        : `<div class="table-wrap"><table class="data"><thead><tr><th>周起止</th><th>晨重均值</th><th>完整饮食天数</th><th>平均摄入中心</th><th>下周重点</th><th></th></tr></thead><tbody>${weekRows}</tbody></table></div>`}
    </section>`;

  $('#view').innerHTML = `<div class="stack">${remindCard}${trendCard}${dayCard}${weekCard}</div>`;
  if (wPts.length) { const host = $('#dietWeightChart'); if (host) echartsChart(host, { series: [{ name: '晨重', points: wPts }], unit: 'kg', height: 200 }); }
  if (kPts.length) { const host = $('#dietKcalChart'); if (host) echartsChart(host, { series: [{ name: '摄入', points: kPts }], unit: 'kcal', height: 200 }); }
}

/* ---------- 每日记录表单 ---------- */
const DIET_DAY_NUMS = ['morningWeight', 'waist', 'sleep', 'kcalCenter', 'kcalLow', 'kcalHigh', 'budget'];
function dietDayFormHTML(rec, presetDate) {
  const r = rec || { date: presetDate || todayISO() };
  const compOpts = DIET_COMPLETENESS.map(c => `<option ${(r.completeness || '') === c ? 'selected' : ''}>${c}</option>`).join('');
  return `
    <form id="dietDayForm" data-id="${rec ? esc(rec.id) : ''}">
      <div class="form-grid">
        <div class="field"><label>日期 <b>*</b></label><input type="date" name="date" value="${esc(r.date)}" required></div>
        <div class="field"><label>标准晨重 <small style="color:var(--muted-3);font-weight:400">kg</small></label><input type="number" step="0.1" min="0" name="morningWeight" value="${r.morningWeight ?? ''}" placeholder="晨起排尿后、进食前、同秤"></div>
        <div class="field wide"><label>称重条件 / 其他体重</label><input name="weightNote" maxlength="120" value="${esc(r.weightNote || '')}" placeholder="如 是否晨起排尿后、进食前、同一台秤；其他条件体重单独记"></div>
        <div class="field"><label>腰围 <small style="color:var(--muted-3);font-weight:400">cm</small></label><input type="number" step="0.1" min="0" name="waist" value="${r.waist ?? ''}"></div>
        <div class="field"><label>睡眠 <small style="color:var(--muted-3);font-weight:400">小时</small></label><input type="number" step="0.5" min="0" max="24" name="sleep" value="${r.sleep ?? ''}"></div>
        <div class="field wide"><label>饥饿 / 精神状态</label><input name="hunger" maxlength="120" value="${esc(r.hunger || '')}" placeholder="如 下午饿、精力一般"></div>
        <div class="field wide"><label>右踝反应</label><input name="ankle" maxlength="120" value="${esc(r.ankle || '')}" placeholder="活动前 / 中 / 当晚 / 翌日、有无肿胀"></div>
        <div class="field wide"><label>早餐（食物、份量、做法）</label><input name="breakfast" maxlength="300" value="${esc(r.breakfast || '')}" placeholder="未吃写“未吃”，没记写“未记录”"></div>
        <div class="field wide"><label>午餐（食物、份量、做法）</label><input name="lunch" maxlength="300" value="${esc(r.lunch || '')}" placeholder="同上"></div>
        <div class="field wide"><label>晚餐（食物、份量、做法）</label><input name="dinner" maxlength="300" value="${esc(r.dinner || '')}" placeholder="同上"></div>
        <div class="field wide"><label>饮料 / 零食 / 加餐</label><input name="snack" maxlength="300" value="${esc(r.snack || '')}" placeholder="含奶糖饮料、酒也要记；未记录不能视作未摄入"></div>
        <div class="field"><label>摄入中心值 <small style="color:var(--muted-3);font-weight:400">kcal</small></label><input type="number" step="1" min="0" name="kcalCenter" value="${r.kcalCenter ?? ''}"></div>
        <div class="field"><label>摄入下限 <small style="color:var(--muted-3);font-weight:400">kcal</small></label><input type="number" step="1" min="0" name="kcalLow" value="${r.kcalLow ?? ''}"></div>
        <div class="field"><label>摄入上限 <small style="color:var(--muted-3);font-weight:400">kcal</small></label><input type="number" step="1" min="0" name="kcalHigh" value="${r.kcalHigh ?? ''}"></div>
        <div class="field"><label>当日预算 <small style="color:var(--muted-3);font-weight:400">kcal</small></label><input type="number" step="1" min="0" name="budget" value="${r.budget ?? ''}" placeholder="当前起步 1800"></div>
        <div class="field"><label>完整度</label><select name="completeness"><option value="" ${!r.completeness ? 'selected' : ''}>未填</option>${compOpts}</select></div>
        <div class="field wide"><label>当天小结 / 明日只调整一件事</label><input name="summary" maxlength="300" value="${esc(r.summary || '')}"></div>
        <div class="field wide"><label>备注</label><input name="note" maxlength="200" value="${esc(r.note || '')}"></div>
      </div>
      <p class="hint" style="margin-top:10px">空白 = 未记录，不代表 0；没吃请写「未吃」。摄入中心值与范围是估算，不是精确测量；单日数据仅供回看，不据此极端减餐。</p>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">${rec ? '保存修改' : '保存每日记录'}</button>
        <button class="btn btn-ghost" type="button" data-act="close">取消</button>
        ${rec ? `<button class="btn btn-ghost btn-danger" type="button" data-act="diet-day-del" data-id="${esc(rec.id)}">删除这条</button>` : ''}
        <span class="form-msg" id="ddMsg"></span>
      </div>
    </form>`;
}
function openDietDay(rec) {
  openModal(`
    <div class="modal-head">
      <div><h2>${rec ? '编辑每日记录' : '记录今天'}</h2><p>${storeMode === 'server' ? '记录会写进本机数据库 data/health.db' : '本机服务没连上，记录只存在当前浏览器'}</p></div>
      <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button>
    </div>
    ${dietDayFormHTML(rec)}`, 'wide');
  bindDietDayForm();
}
function bindDietDayForm() {
  const form = $('#dietDayForm');
  if (!form) return;
  const editingId = form.dataset.id || '';
  const msg = (t, err = true) => { const m = $('#ddMsg'); if (m) { m.textContent = t; m.className = 'form-msg' + (err ? ' err' : ''); } };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    const date = String(fd.get('date') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { msg('请选择日期'); return; }
    const vals = {};
    let bad = '';
    DIET_DAY_NUMS.forEach(k => {
      const raw = fd.get(k);
      if (raw === '' || raw === null) return;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) bad = '数值请填非负数字';
      else vals[k] = n;
    });
    if (bad) { msg(bad); return; }
    const prev = editingId ? dietDays.find(x => x.id === editingId) : null;
    const base = {
      id: editingId || newId('dd'),
      date,
      ...vals,
      weightNote: String(fd.get('weightNote') || '').trim().slice(0, 120),
      hunger: String(fd.get('hunger') || '').trim().slice(0, 120),
      ankle: String(fd.get('ankle') || '').trim().slice(0, 120),
      breakfast: String(fd.get('breakfast') || '').trim().slice(0, 300),
      lunch: String(fd.get('lunch') || '').trim().slice(0, 300),
      dinner: String(fd.get('dinner') || '').trim().slice(0, 300),
      snack: String(fd.get('snack') || '').trim().slice(0, 300),
      completeness: String(fd.get('completeness') || ''),
      summary: String(fd.get('summary') || '').trim().slice(0, 300),
      note: String(fd.get('note') || '').trim().slice(0, 200),
      createdAt: (prev && prev.createdAt) || Date.now()
    };
    const cur = editingId ? null : dietDayOf(date);
    if (editingId) {
      dietDays = dietDays.map(x => x.id === editingId ? normDietDay(base) : x);
    } else if (cur) {
      dietDays = dietDays.map(x => x.id === cur.id ? normDietDay({ ...base, id: cur.id, createdAt: cur.createdAt || Date.now() }) : x);
    } else {
      dietDays.push(normDietDay(base));
    }
    persistDietDays();
    closeModal();
    renderDiet();
    toast((editingId || cur) ? '每日记录已更新' : '每日记录已保存');
  });
}

/* ---------- 每周复盘表单 ---------- */
const DIET_WEEK_NUMS = ['weightDays', 'weightAvg', 'weightPrevAvg', 'waist', 'completeDays', 'kcalCenter', 'kcalLow', 'kcalHigh'];
const DIET_WEEK_TEXTS = [['weekEnd', 10], ['reviewDate', 10], ['ankle', 200], ['energy', 200], ['observeMiss', 200], ['observeHabit', 200], ['observeDiff', 200], ['nextFocus', 200], ['adjust', 200], ['note', 200]];
function dietWeekFormHTML(rec) {
  const r = rec || { weekStart: '', weekEnd: '', reviewDate: todayISO() };
  return `
    <form id="dietWeekForm" data-id="${rec ? esc(rec.id) : ''}">
      <div class="form-grid">
        <div class="field"><label>周起始 <b>*</b></label><input type="date" name="weekStart" value="${esc(r.weekStart || '')}" required></div>
        <div class="field"><label>周结束</label><input type="date" name="weekEnd" value="${esc(r.weekEnd || '')}"></div>
        <div class="field"><label>复盘日期</label><input type="date" name="reviewDate" value="${esc(r.reviewDate || '')}"></div>
        <div class="field"><label>标准晨重记录数 <small style="color:var(--muted-3);font-weight:400">天</small></label><input type="number" min="0" max="7" step="1" name="weightDays" value="${r.weightDays ?? ''}"></div>
        <div class="field"><label>晨重均值 <small style="color:var(--muted-3);font-weight:400">kg</small></label><input type="number" step="0.1" min="0" name="weightAvg" value="${r.weightAvg ?? ''}"></div>
        <div class="field"><label>上周均值 <small style="color:var(--muted-3);font-weight:400">kg</small></label><input type="number" step="0.1" min="0" name="weightPrevAvg" value="${r.weightPrevAvg ?? ''}"></div>
        <div class="field"><label>腰围 <small style="color:var(--muted-3);font-weight:400">cm</small></label><input type="number" step="0.1" min="0" name="waist" value="${r.waist ?? ''}"></div>
        <div class="field"><label>完整饮食天数 <small style="color:var(--muted-3);font-weight:400">天</small></label><input type="number" min="0" max="7" step="1" name="completeDays" value="${r.completeDays ?? ''}"></div>
        <div class="field"><label>完整日平均摄入中心 <small style="color:var(--muted-3);font-weight:400">kcal</small></label><input type="number" step="1" min="0" name="kcalCenter" value="${r.kcalCenter ?? ''}"></div>
        <div class="field"><label>平均范围下限 <small style="color:var(--muted-3);font-weight:400">kcal</small></label><input type="number" step="1" min="0" name="kcalLow" value="${r.kcalLow ?? ''}"></div>
        <div class="field"><label>平均范围上限 <small style="color:var(--muted-3);font-weight:400">kcal</small></label><input type="number" step="1" min="0" name="kcalHigh" value="${r.kcalHigh ?? ''}"></div>
        <div class="field wide"><label>活动与踝部反应</label><input name="ankle" maxlength="200" value="${esc(r.ankle || '')}" placeholder="时长、舒适度、当晚 / 翌日有无加重"></div>
        <div class="field wide"><label>饥饿 / 精力 / 睡眠</label><input name="energy" maxlength="200" value="${esc(r.energy || '')}" placeholder="是否能持续执行"></div>
        <div class="field wide"><label>最易漏记的食物 / 份量</label><input name="observeMiss" maxlength="200" value="${esc(r.observeMiss || '')}"></div>
        <div class="field wide"><label>最有帮助的一个习惯</label><input name="observeHabit" maxlength="200" value="${esc(r.observeHabit || '')}"></div>
        <div class="field wide"><label>主要困难与身体反应</label><input name="observeDiff" maxlength="200" value="${esc(r.observeDiff || '')}"></div>
        <div class="field wide"><label>下周只优先改进的一件事</label><input name="nextFocus" maxlength="200" value="${esc(r.nextFocus || '')}"></div>
        <div class="field wide"><label>是否调整预算 / 活动及原因</label><input name="adjust" maxlength="200" value="${esc(r.adjust || '')}" placeholder="写明依据与生效日期；连续 2–3 周数据较完整再判断"></div>
        <div class="field wide"><label>备注</label><input name="note" maxlength="200" value="${esc(r.note || '')}"></div>
      </div>
      <p class="hint" style="margin-top:10px">周均值由你按模板口径填写：合格晨重之和 ÷ 实际记录天数；缺测不按 0 补齐。不同称量条件、不完整饮食日不混算。</p>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">${rec ? '保存修改' : '保存周复盘'}</button>
        <button class="btn btn-ghost" type="button" data-act="close">取消</button>
        ${rec ? `<button class="btn btn-ghost btn-danger" type="button" data-act="diet-week-del" data-id="${esc(rec.id)}">删除这份</button>` : ''}
        <span class="form-msg" id="dwMsg"></span>
      </div>
    </form>`;
}
function openDietWeek(rec) {
  openModal(`
    <div class="modal-head">
      <div><h2>${rec ? '编辑周复盘' : '写周复盘'}</h2><p>${storeMode === 'server' ? '记录会写进本机数据库 data/health.db' : '本机服务没连上，记录只存在当前浏览器'}</p></div>
      <button class="modal-close" data-act="close" aria-label="关闭">${I.close}</button>
    </div>
    ${dietWeekFormHTML(rec)}`, 'wide');
  bindDietWeekForm();
}
function bindDietWeekForm() {
  const form = $('#dietWeekForm');
  if (!form) return;
  const editingId = form.dataset.id || '';
  const msg = (t, err = true) => { const m = $('#dwMsg'); if (m) { m.textContent = t; m.className = 'form-msg' + (err ? ' err' : ''); } };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(form);
    const weekStart = String(fd.get('weekStart') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) { msg('请选择周起始日期'); return; }
    const vals = {};
    let bad = '';
    DIET_WEEK_NUMS.forEach(k => {
      const raw = fd.get(k);
      if (raw === '' || raw === null) return;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) bad = '数值请填非负数字';
      else vals[k] = n;
    });
    if (bad) { msg(bad); return; }
    const prev = editingId ? dietWeeks.find(x => x.id === editingId) : null;
    const base = {
      id: editingId || newId('dw'),
      weekStart, ...vals,
      createdAt: (prev && prev.createdAt) || Date.now()
    };
    DIET_WEEK_TEXTS.forEach(([k, max]) => { base[k] = String(fd.get(k) || '').trim().slice(0, max); });
    const cur = editingId ? null : dietWeekOf(weekStart);
    if (editingId) {
      dietWeeks = dietWeeks.map(x => x.id === editingId ? normDietWeek(base) : x);
    } else if (cur) {
      dietWeeks = dietWeeks.map(x => x.id === cur.id ? normDietWeek({ ...base, id: cur.id, createdAt: cur.createdAt || Date.now() }) : x);
    } else {
      dietWeeks.push(normDietWeek(base));
    }
    persistDietWeeks();
    closeModal();
    renderDiet();
    toast((editingId || cur) ? '周复盘已更新' : '周复盘已保存');
  });
}
