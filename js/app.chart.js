'use strict';

/* ======================= ECharts 统一封装 ======================= */
/* 折线 + 参考区间(markArea) + 目标线(markLine) + 越界点标红 + tooltip
   + dataZoom(滑块拖拽/滚轮缩放) + 响应式。

   三条硬规则（2026-11-01 重做，起因：折线把隔了几个月的数据连成了一条「连续监测」）：
   1. x 轴用 time 轴，不用 category 轴。category 轴把相邻两次记录一律画成等距，
      隔 3 天和隔 5 个月占同样宽度，看图的人会以为中间一直在测。
   2. 相邻两点间隔超过阈值就断线（中间插 null）。没记录的那段就是空白，
      不拿一条直线假装那段时间也有数据。真实数据本来就有洞，画出来才看得见洞。
   3. 跨度大的时候自动按周 / 月聚合（均值），否则 2 年的日数据在 1000px 里
      一天挨一天，会糊成一团。聚合点只画均值，tooltip 里写明覆盖哪几天、几次均值，
      不藏着掖着。缩放后跨度变了会自动切回按天。

   顺带：同一天称了好几次（体脂秤常见）默认取当天最后一条，
   否则同一天的点会叠成一根竖线，看着像骤升骤降。

   用法：
   echartsChart(hostEl, {
     series: [{ name, color, points:[{date,value}], smooth? }, ...],
     unit: 'kg', low, high,                       // 参考区间（可选）
     target,                                      // 目标线（可选）
     height,                                      // 高度 px（可选）
     gapDays: 10,                                 // 超过几天算断档（默认 14）
     onePerDay: true,                             // 同一天只取最后一条（默认 false）
   });
*/

const ECHARTS_THEME = {
  pine: '#2F6B57',
  pineDark: '#173F33',
  warn: '#B4553F',
  grid: '#E2DDD0',
  gridSoft: '#F0EBE0',
  band: 'rgba(237,243,236,0.85)',
  bandEdge: '#B9CDBD',
  target: '#A9752F',
  axisText: '#8C9188',
  labelText: '#A5AA9F',
  gapFill: 'rgba(165,170,159,0.055)',
  palette: ['#2F6B57', '#A9752F', '#5B7DA8', '#8A5B7A', '#6B8A5B', '#B4553F']
};

/* 保存实例，重复渲染同一 host 时先 dispose，避免内存泄漏/叠加 */
const _chartInstances = new WeakMap();

const _CHART_DAY = 864e5;

function _chartDispose(host) {
  const inst = _chartInstances.get(host);
  if (inst) { try { inst.dispose(); } catch (e) { /* ignore */ } _chartInstances.delete(host); }
}

function _dayTs(date) {
  const t = Date.parse(String(date) + 'T00:00:00');
  return Number.isFinite(t) ? t : NaN;
}
function _p2(n) { return String(n).padStart(2, '0'); }
function _fmtYMD(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${_p2(d.getMonth() + 1)}-${_p2(d.getDate())}`;
}
function _fmtYM(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${_p2(d.getMonth() + 1)}`;
}
function _fmtMD(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${_p2(d.getDate())}`;
}
/* 按当前看得见的跨度选标签粒度：看两年就写「年-月」，拉近到一个月内就写「月-日」 */
function _axisFmtFor(spanDays) {
  return spanDays > 300 ? _fmtYM : _fmtMD;
}

/* ---- 自动聚合：按「每个点至少要有 6px 落脚」来选粒度，跨度大就周 / 月，
        跨度小（或屏幕窄）就按天。看着不糊，也不至于一个点都挤不下 ---- */
function _chartBucketFor(spanDays, widthPx) {
  const need = (spanDays * 6) / Math.max(widthPx || 900, 240);
  if (need <= 1) return 'day';
  if (need <= 7) return 'week';
  return 'month';
}
function _chartBucketDays(kind) {
  return kind === 'day' ? 1 : kind === 'week' ? 7 : 30;
}
/* 图上标一句「按周均值」：只看线的人也得知道每个点代表什么 */
function _bucketNote(kind) {
  return [{
    id: 'bucketNote',
    type: 'text',
    left: 52,
    top: 6,
    silent: true,
    style: {
      text: kind === 'week' ? '按周均值' : kind === 'month' ? '按月均值' : '',
      fill: ECHARTS_THEME.labelText,
      fontSize: 9.5
    }
  }];
}
function _chartAggregate(pts, kind) {
  if (kind === 'day') {
    return pts.map(p => ({ ts: p.ts, value: p.value, n: 1, first: p.ts, last: p.ts }));
  }
  const map = new Map();
  pts.forEach(p => {
    const d = new Date(p.ts);
    const key = kind === 'week'
      ? Math.floor((p.ts - 4 * _CHART_DAY) / (7 * _CHART_DAY))   // 对齐到周一
      : d.getFullYear() * 12 + d.getMonth();
    let g = map.get(key);
    if (!g) { g = { sum: 0, n: 0, tsSum: 0, first: p.ts, last: p.ts }; map.set(key, g); }
    g.sum += p.value;
    g.n += 1;
    g.tsSum += p.ts;
    if (p.ts < g.first) g.first = p.ts;
    if (p.ts > g.last) g.last = p.ts;
  });
  return [...map.values()]
    .map(g => ({
      ts: Math.round(g.tsSum / g.n),
      value: Math.round((g.sum / g.n) * 1000) / 1000,
      n: g.n,
      first: g.first,
      last: g.last
    }))
    .sort((a, b) => a.ts - b.ts);
}

function echartsChart(host, opt = {}) {
  if (!host) return;
  if (typeof echarts === 'undefined') {
    // echarts 未加载（例如离线且库缺失）时给可读的降级提示，而不是白屏
    host.innerHTML = '<div class="empty" style="padding:24px;color:var(--muted-3)">图表组件未加载（assets/vendor/echarts.min.js 缺失）</div>';
    return;
  }

  const rawSeries = (opt.series || []).filter(s => s && Array.isArray(s.points) && s.points.length);
  const emptyHTML = '<div class="empty" style="padding:28px;color:var(--muted-3);text-align:center">这项还没有可画的数据</div>';
  if (!rawSeries.length) {
    _chartDispose(host);
    host.style.height = '';
    host.style.minHeight = '0';
    host.innerHTML = emptyHTML;
    return;
  }

  const unit = opt.unit || '';
  const height = opt.height || (window.innerWidth < 700 ? 230 : 280);
  const GAP_DAYS = Number.isFinite(opt.gapDays) ? opt.gapDays : 14;

  /* 只有一个时间点：画不出趋势。别用一张 300px 空图 + 缩放条撑场面，
     直接说清「只有这一次，再记一次才看得出升降」。 */
  if (rawSeries.length === 1) {
    const tsSet = new Set();
    rawSeries[0].points.forEach(p => { const t = p && p.date ? _dayTs(p.date) : NaN; if (Number.isFinite(t)) tsSet.add(t); });
    if (tsSet.size <= 1) {
      const p0 = rawSeries[0].points.filter(p => p && p.date && Number.isFinite(Number(p.value))).at(-1);
      _chartDispose(host);
      host.style.height = '';
      host.style.minHeight = '0';
      host.innerHTML = `<div class="empty" style="padding:24px 12px;color:var(--muted-3);text-align:center">只有 ${p0 ? _fmtYMD(_dayTs(p0.date)) : ''} 这一次记录${p0 ? `（${Math.round(Number(p0.value) * 100) / 100}${unit ? ' ' + unit : ''}）` : ''}。再记一次，才看得出是升还是降。</div>`;
      return;
    }
  }

  /* 统一整理点位：转时间戳、升序、（可选）同一天只留最后一条 */
  const prep = (s) => {
    const list = [];
    s.points.forEach(p => {
      if (!p || !p.date) return;
      const ts = _dayTs(p.date);
      const v = Number(p.value);
      if (!Number.isFinite(ts) || !Number.isFinite(v)) return;
      list.push({ ts, value: v });
    });
    list.sort((a, b) => a.ts - b.ts);
    if (!opt.onePerDay) return list;
    const out = [];
    list.forEach(p => {
      if (out.length && out[out.length - 1].ts === p.ts) out[out.length - 1] = p;
      else out.push(p);
    });
    return out;
  };

  const kept = rawSeries.map(s => ({ s, pts: prep(s) })).filter(o => o.pts.length);
  if (!kept.length) {
    _chartDispose(host);
    host.style.height = '';
    host.style.minHeight = '0';
    host.innerHTML = emptyHTML;
    return;
  }
  host.innerHTML = '';
  host.style.minHeight = '';

  const allTs = kept.flatMap(o => o.pts.map(p => p.ts));
  const minTs = Math.min(...allTs);
  const maxTs = Math.max(...allTs);
  const singleTs = minTs === maxTs;

  /* 按某个粒度把全部序列算成 { series, markAreas, fmt } */
  const build = (kind) => {
    const gapLimitDays = Math.max(GAP_DAYS, _chartBucketDays(kind) * 2);

    const toShape = ({ s, pts }, idx) => {
      const color = s.color || ECHARTS_THEME.palette[idx % ECHARTS_THEME.palette.length];
      const agg = _chartAggregate(pts, kind);
      // 显示精度跟着原始数据走：体重 1 位小数、基础代谢整数；
      // 均值至少给 1 位，不然 1706.4 会显示成 1706，看着像没算
      let dec = 0;
      pts.forEach(p => {
        const str = String(p.value);
        const dot = str.indexOf('.');
        if (dot >= 0) dec = Math.max(dec, str.length - dot - 1);
      });
      dec = Math.min(Math.max(dec, kind === 'day' ? 0 : 1), 2);
      const low = Number.isFinite(opt.low) ? opt.low : null;
      const high = Number.isFinite(opt.high) ? opt.high : null;
      const data = [];
      agg.forEach((p, i) => {
        if (i) {
          const prev = agg[i - 1];
          // 断档：中间塞一个 null，connectNulls:false 时不画这段线，
          // 两端各自留一个圆点，孤立的一次记录也不会凭空消失
          if ((p.ts - prev.ts) / _CHART_DAY > gapLimitDays) data.push([prev.ts + (p.ts - prev.ts) / 2, null]);
        }
        const tip = kind === 'day' || p.n === 1
          ? _fmtYMD(p.ts)
          : `${_fmtYMD(p.first)} ~ ${_fmtYMD(p.last)}（${p.n} 次均值）`;
        const point = { value: [p.ts, p.value], tip, dv: p.value.toFixed(dec) };
        const over = (low !== null && p.value < low) || (high !== null && p.value > high);
        data.push(over ? { ...point, itemStyle: { color: ECHARTS_THEME.warn, borderColor: ECHARTS_THEME.warn } } : point);
      });

      return {
        name: s.name || `序列${idx + 1}`,
        type: 'line',
        data,
        showSymbol: true,
        symbolSize: agg.length > 60 ? 4 : 5.5,
        smooth: s.smooth !== undefined ? !!s.smooth : kind !== 'day',
        connectNulls: false,
        lineStyle: { width: kind === 'day' ? 2 : 2.2, color, cap: 'round', join: 'round' },
        // 圆点实心而非白底描边：白底会把折线啃出一个个缺口，整条线看着像自己断的
        itemStyle: { color, borderWidth: 0 },
        emphasis: { focus: 'series', scale: 1.15 },
        z: 5 + idx
      };
    };

    const out = kept.map(toShape);

    /* markArea 一次只能挂一块：参考区间带和断档底色都得塞进同一个数组，靠逐项 itemStyle 区分 */
    const markAreas = [];
    if (Number.isFinite(opt.low) && Number.isFinite(opt.high)) {
      markAreas.push([
        { yAxis: opt.low, itemStyle: { color: ECHARTS_THEME.band } },
        { yAxis: opt.high }
      ]);
      out[0].markLine = { silent: true, symbol: 'none', data: [
        { yAxis: opt.low, lineStyle: { color: ECHARTS_THEME.bandEdge, type: [4, 4], width: 1 }, label: { show: false } },
        { yAxis: opt.high, lineStyle: { color: ECHARTS_THEME.bandEdge, type: [4, 4], width: 1 }, label: { show: false } }
      ] };
    }
    if (Number.isFinite(opt.target)) {
      out[0].markLine = out[0].markLine || { silent: true, symbol: 'none', data: [] };
      out[0].markLine.data.push({
        yAxis: opt.target,
        lineStyle: { color: ECHARTS_THEME.target, type: [5, 4], width: 1, opacity: 0.8 },
        label: { show: true, position: 'insideEndTop', formatter: `目标 ${Number(opt.target).toFixed(1)}`, color: ECHARTS_THEME.target, fontSize: 9.5 }
      });
    }

    /* 断档处铺一层极淡的底色：一眼看出这段是「没测」，不是「没变化」 */
    const anchor = _chartAggregate(kept[0].pts, kind);
    for (let i = 1; i < anchor.length; i += 1) {
      const prev = anchor[i - 1];
      if ((anchor[i].ts - prev.ts) / _CHART_DAY > gapLimitDays) {
        markAreas.push([{ xAxis: prev.ts, itemStyle: { color: ECHARTS_THEME.gapFill } }, { xAxis: anchor[i].ts }]);
      }
    }
    if (markAreas.length) out[0].markArea = { silent: true, data: markAreas };

    return out;
  };

  const chartWidth = host.clientWidth || 900;
  let curBucket = _chartBucketFor((maxTs - minTs) / _CHART_DAY, chartWidth);

  const chart = echarts.init(host, null, { renderer: 'canvas' });
  _chartInstances.set(host, chart);

  const span0 = (maxTs - minTs) / _CHART_DAY;

  const option = {
    animationDuration: 300,
    color: ECHARTS_THEME.palette,
    grid: { left: 46, right: 18, top: 28, bottom: 64, containLabel: false },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: ECHARTS_THEME.bandEdge, type: 'dashed' } },
      backgroundColor: 'rgba(255,255,255,0.97)',
      borderColor: '#E2DDD0',
      borderWidth: 1,
      textStyle: { color: '#1B1E1B', fontSize: 11.5 },
      formatter: (params) => {
        if (!params || !params.length) return '';
        const hit = params.filter(p => {
          const v = Array.isArray(p.value) ? p.value[1] : p.value;
          return v !== null && v !== undefined && Number.isFinite(Number(v));
        });
        if (!hit.length) return '';
        const first = hit[0];
        const date = (first.data && first.data.tip) || (typeof first.axisValue === 'number' ? _fmtYMD(first.axisValue) : first.axisValue);
        const lines = hit.map(p => {
          const v = Array.isArray(p.value) ? p.value[1] : p.value;
          const shown = p.data && p.data.dv !== undefined ? p.data.dv : v;
          const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px"></span>`;
          const name = hit.length > 1 ? `${p.seriesName}　` : '';
          return `${dot}${name}<b>${shown}${unit ? ' ' + unit : ''}</b>`;
        }).join('<br/>');
        return `<div style="font-weight:600;margin-bottom:3px">${date}</div>${lines}`;
      }
    },
    xAxis: {
      type: 'time',
      ...(singleTs ? { min: minTs - 3 * _CHART_DAY, max: maxTs + 3 * _CHART_DAY } : { boundaryGap: ['3%', '3%'] }),
      axisLine: { lineStyle: { color: ECHARTS_THEME.grid } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: ECHARTS_THEME.axisText,
        fontSize: 10.5,
        hideOverlap: true,
        formatter: _axisFmtFor(span0)
      }
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: ECHARTS_THEME.gridSoft } },
      axisLabel: { color: ECHARTS_THEME.labelText, fontSize: 10 }
    },
    dataZoom: [
      { type: 'inside', throttle: 60 },
      {
        type: 'slider',
        height: 16,
        bottom: 12,
        borderColor: ECHARTS_THEME.grid,
        backgroundColor: 'transparent',
        fillerColor: 'rgba(47,107,87,0.10)',
        handleStyle: { color: '#fff', borderColor: ECHARTS_THEME.pine },
        moveHandleStyle: { color: ECHARTS_THEME.bandEdge },
        dataBackground: { lineStyle: { color: ECHARTS_THEME.bandEdge }, areaStyle: { color: 'rgba(185,205,189,0.25)' } },
        selectedDataBackground: { lineStyle: { color: ECHARTS_THEME.pine }, areaStyle: { color: 'rgba(47,107,87,0.15)' } },
        textStyle: { color: ECHARTS_THEME.labelText, fontSize: 9.5 },
        labelFormatter: (v) => _fmtYM(v)
      }
    ],
    legend: rawSeries.length > 1
      ? { top: 2, right: 8, textStyle: { color: '#4A5248', fontSize: 10.5 }, itemWidth: 14, itemHeight: 8 }
      : undefined,
    graphic: _bucketNote(curBucket),
    series: build(curBucket)
  };

  chart.setOption(option);

  /* 缩放后跨度变了：标签粒度跟着变，聚合粒度也跟着切（拉近就还原成每一天） */
  if (!singleTs) {
    let zoomTimer = null;
    chart.on('datazoom', () => {
      if (zoomTimer) return;
      zoomTimer = setTimeout(() => {
        zoomTimer = null;
        const dz = (chart.getOption().dataZoom || [])[0] || {};
        let a = Number(dz.startValue);
        let b = Number(dz.endValue);
        if (!Number.isFinite(a) || !Number.isFinite(b)) { a = minTs; b = maxTs; }
        const span = (b - a) / _CHART_DAY;
        const patch = { xAxis: { axisLabel: { formatter: _axisFmtFor(span) } } };
        const next = _chartBucketFor(span, chartWidth);
        if (next !== curBucket) { curBucket = next; patch.series = build(next); patch.graphic = _bucketNote(next); }
        chart.setOption(patch);
      }, 120);
    });
  }

  // 响应式：容器宽度变化时 resize
  if (!host._echartsRO && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      const inst = _chartInstances.get(host);
      if (inst) { try { inst.resize(); } catch (e) { /* ignore */ } }
    });
    ro.observe(host);
    host._echartsRO = ro;
  }
  // 固定容器高度
  host.style.height = height + 'px';
  chart.resize();
}
