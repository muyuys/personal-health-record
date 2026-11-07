/* Pure aggregation of existing records. No inference, unit conversion or sample mixing. */
var HealthMetrics = (() => {
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const text = value => String(value || '').trim();
  const dateOK = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
    !Number.isNaN(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  function labKey(row, report) {
    return JSON.stringify(['labs', text(row.category), text(row.name), text(row.unit), text(report?.specimen)]);
  }
  function collect(data) {
    const groups = new Map();
    const reports = new Map((data.reports || []).map(r => [r.id, r]));
    function add(key, definition, row, value, extra = {}) {
      if (!dateOK(row.date) || (!finite(value) && !extra.qualitative)) return;
      if (!groups.has(key)) groups.set(key, { key, ...definition, records: [] });
      groups.get(key).records.push({ id: row.id, date: row.date, value: finite(value) ? value : null,
        low: null, high: null, note: row.note || '', createdAt: row.createdAt || 0,
        ...extra, order: groups.get(key).records.length });
    }
    (data.labs || []).forEach(row => {
      const report = reports.get(row.reportId);
      if (!text(row.name)) return;
      add(labKey(row, report), { kind: 'labs', label: text(row.name), unit: text(row.unit),
        category: text(row.category) || '检验', detail: text(report?.specimen) || '样本未记录' }, row, row.value,
        { low: finite(row.low) ? row.low : null, high: finite(row.high) ? row.high : null,
          qualitative: row.qualitative || '', flag: row.flag || '', reportId: report?.id || '',
          source: [report?.title, report?.hospital || row.source].filter(Boolean).join(' · ') || '手动录入 / 未关联报告' });
    });
    const fields = {
      weights: [['kg', '体重', 'kg'], ['bodyFat', '体脂率', '%'], ['muscle', '肌肉量', 'kg'], ['bmi', 'BMI', ''],
        ['visceralFat', '内脏脂肪等级', '级'], ['bmr', '基础代谢', 'kcal/日'], ['bone', '骨量', 'kg']],
      body: [['chest', '胸围', 'cm'], ['waist', '腰围', 'cm'], ['hip', '臀围', 'cm']],
      vitals: [['systolic', '收缩压', 'mmHg'], ['diastolic', '舒张压', 'mmHg'], ['pulse', '心率', '次/分'],
        ['temperature', '体温', '℃'], ['spo2', '血氧饱和度', '%'], ['glucose', '血糖', 'mmol/L']],
      sleepLogs: [['hours', '睡眠时长', '小时'], ['score', '睡眠评分', '分']]
    };
    const categories = { weights: '体重与身体成分', body: '身体围度', vitals: '生命体征', sleepLogs: '睡眠' };
    for (const [kind, definitions] of Object.entries(fields)) {
      (data[kind] || []).forEach(row => definitions.forEach(([field, label, unit]) => {
        const detail = field === 'glucose' ? ({ fasting: '空腹', post2h: '餐后 2 小时', random: '随机 / 其他' }[row.glucoseTag] || text(row.glucoseTag) || '测量条件未记录') : '';
        add(JSON.stringify([kind, field, detail]), { kind, label, unit, category: categories[kind], detail },
          row, row[field], { source: categories[kind] + (detail ? ' · ' + detail : '') });
      }));
    }
    return [...groups.values()].map(group => {
      group.records.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt || a.order - b.order);
      return group;
    }).sort((a, b) => (a.kind === 'labs' ? 0 : 1) - (b.kind === 'labs' ? 0 : 1) ||
      b.records.length - a.records.length || a.label.localeCompare(b.label, 'zh'));
  }
  function filter(records, from = '', to = '') {
    return records.filter(r => (!from || r.date >= from) && (!to || r.date <= to));
  }
  function summary(records) {
    const numeric = records.filter(r => finite(r.value));
    const latest = records.at(-1) || null;
    const values = numeric.map(r => r.value);
    const previous = numeric.at(-2);
    const lastNumber = numeric.at(-1);
    const ranges = new Set(numeric.map(r => JSON.stringify([r.low, r.high])));
    const sharedRange = ranges.size === 1 && numeric.length && finite(numeric[0].low) && finite(numeric[0].high)
      ? { low: numeric[0].low, high: numeric[0].high } : null;
    return { latest, count: records.length, days: new Set(records.map(r => r.date)).size,
      numeric, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null,
      previous: previous || null, delta: previous && latest === lastNumber ? Number((lastNumber.value - previous.value).toPrecision(12)) : null,
      sharedRange, variedRange: ranges.size > 1 };
  }
  return { collect, labKey, filter, summary, finite, dateOK };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = HealthMetrics;
