'use strict';

/* ======================= ECharts 统一封装 ======================= */
/* 把旧的 SVG 折线图统一换成 ECharts：折线 + 参考区间(markArea) + 目标线(markLine)
   + 越界/最新点高亮 + tooltip + dataZoom(滑块拖拽/滚轮缩放) + 响应式。

   用法：
   echartsChart(hostEl, {
     dates: ['2026-01-01', ...],                 // 可选；若每条 series.points 自带 date 可省略
     series: [{ name, color, points:[{date,value}], area?, smooth? }, ...],
     unit: 'kg', low, high,                       // 参考区间（可选）
     target,                                      // 目标线（可选）
     height,                                      // 高度 px（可选）
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
  palette: ['#2F6B57', '#A9752F', '#5B7DA8', '#8A5B7A', '#6B8A5B', '#B4553F']
};

/* 保存实例，重复渲染同一 host 时先 dispose，避免内存泄漏/叠加 */
const _chartInstances = new WeakMap();

function _chartDispose(host) {
  const inst = _chartInstances.get(host);
  if (inst) { try { inst.dispose(); } catch (e) { /* ignore */ } _chartInstances.delete(host); }
}

function echartsChart(host, opt = {}) {
  if (!host) return;
  if (typeof echarts === 'undefined') {
    // echarts 未加载（例如离线且库缺失）时给可读的降级提示，而不是白屏
    host.innerHTML = '<div class="empty" style="padding:24px;color:var(--muted-3)">图表组件未加载（assets/vendor/echarts.min.js 缺失）</div>';
    return;
  }

  const seriesIn = (opt.series || []).filter(s => s && Array.isArray(s.points) && s.points.length);
  if (!seriesIn.length) {
    _chartDispose(host);
    host.innerHTML = '<div class="empty" style="padding:28px;color:var(--muted-3);text-align:center">这项还没有可画的数据</div>';
    return;
  }
  host.innerHTML = '';

  const unit = opt.unit || '';
  const height = opt.height || (window.innerWidth < 700 ? 230 : 280);

  // 汇总所有日期（保持升序），用于 x 轴;若各序列日期不同，用并集
  const allDates = [];
  const seen = new Set();
  seriesIn.forEach(s => s.points.forEach(p => {
    if (p.date && !seen.has(p.date)) { seen.add(p.date); allDates.push(p.date); }
  }));
  allDates.sort();

  const toSeries = (s, idx) => {
    const color = s.color || ECHARTS_THEME.palette[idx % ECHARTS_THEME.palette.length];
    return {
      name: s.name || `序列${idx + 1}`,
      type: 'line',
      data: s.points.map(p => [p.date, p.value]),
      showSymbol: true,
      symbolSize: 6,
      smooth: !!s.smooth,
      connectNulls: true,
      lineStyle: { width: 2.4, color, cap: 'round', join: 'round' },
      itemStyle: {
        color: '#fff',
        borderColor: color,
        borderWidth: 2.2
      },
      emphasis: { focus: 'series', scale: 1.15 },
      z: 5 + idx
    };
  };
  let series = seriesIn.map((s, i) => toSeries(s, i));

  // 参考区间（仅单序列时画 band 更清晰；多序列也允许）
  if (Number.isFinite(opt.low) && Number.isFinite(opt.high)) {
    series[0].markArea = {
      silent: true,
      itemStyle: { color: ECHARTS_THEME.band },
      data: [[{ yAxis: opt.low }, { yAxis: opt.high }]]
    };
    series[0].markLine = series[0].markLine || { silent: true, symbol: 'none', data: [] };
    series[0].markLine.data.push(
      { yAxis: opt.low, lineStyle: { color: ECHARTS_THEME.bandEdge, type: [4, 4], width: 1 }, label: { show: false } },
      { yAxis: opt.high, lineStyle: { color: ECHARTS_THEME.bandEdge, type: [4, 4], width: 1 }, label: { show: false } }
    );
  }

  // 目标线
  if (Number.isFinite(opt.target)) {
    series[0].markLine = series[0].markLine || { silent: true, symbol: 'none', data: [] };
    series[0].markLine.data.push({
      yAxis: opt.target,
      lineStyle: { color: ECHARTS_THEME.target, type: [5, 4], width: 1, opacity: 0.8 },
      label: { show: true, position: 'insideEndTop', formatter: `目标 ${Number(opt.target).toFixed(1)}`, color: ECHARTS_THEME.target, fontSize: 9.5 }
    });
  }

  // 越界点标红：把越界的点单独标红（借助 itemStyle 无法逐点，这里用 markPoint 不好看，改为在原系列上按值渲染颜色）
  if (Number.isFinite(opt.low) || Number.isFinite(opt.high)) {
    seriesIn.forEach((s, si) => {
      const overIdx = [];
      s.points.forEach(p => {
        const over = (Number.isFinite(opt.low) && p.value < opt.low) || (Number.isFinite(opt.high) && p.value > opt.high);
        if (over) overIdx.push(p);
      });
      if (overIdx.length) {
        const color = s.color || ECHARTS_THEME.palette[si % ECHARTS_THEME.palette.length];
        // 用 data 里对越界点附加 itemStyle
        const data = series[si].data.map(d => {
          const over = (Number.isFinite(opt.low) && d[1] < opt.low) || (Number.isFinite(opt.high) && d[1] > opt.high);
          return over ? { value: d, itemStyle: { color: ECHARTS_THEME.warn, borderColor: ECHARTS_THEME.warn } } : d;
        });
        series[si].data = data;
      }
    });
  }

  const chart = echarts.init(host, null, { renderer: 'canvas' });
  _chartInstances.set(host, chart);

  const option = {
    animationDuration: 300,
    color: ECHARTS_THEME.palette,
    grid: { left: 46, right: 16, top: 28, bottom: 64, containLabel: false },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: ECHARTS_THEME.bandEdge, type: 'dashed' } },
      backgroundColor: 'rgba(255,255,255,0.97)',
      borderColor: '#E2DDD0',
      borderWidth: 1,
      textStyle: { color: '#1B1E1B', fontSize: 11.5 },
      formatter: (params) => {
        if (!params || !params.length) return '';
        const date = params[0].axisValue;
        const lines = params.map(p => {
          const v = Array.isArray(p.value) ? p.value[1] : p.value;
          const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px"></span>`;
          const name = params.length > 1 ? `${p.seriesName}　` : '';
          return `${dot}${name}<b>${v}${unit ? ' ' + unit : ''}</b>`;
        }).join('<br/>');
        return `<div style="font-weight:600;margin-bottom:3px">${date}</div>${lines}`;
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: true,
      data: allDates,
      axisLine: { lineStyle: { color: ECHARTS_THEME.grid } },
      axisTick: { show: false },
      axisLabel: {
        color: ECHARTS_THEME.axisText,
        fontSize: 10.5,
        hideOverlap: true,
        formatter: (v) => v
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
        labelFormatter: (v, s) => s
      }
    ],
    legend: seriesIn.length > 1
      ? { top: 2, right: 8, textStyle: { color: '#4A5248', fontSize: 10.5 }, itemWidth: 14, itemHeight: 8 }
      : undefined,
    series
  };

  chart.setOption(option);

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
