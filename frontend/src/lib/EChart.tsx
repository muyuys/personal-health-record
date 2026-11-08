// ECharts 折线图 React 封装：复刻旧前端 js/app.chart.js 的 echartsChart 视觉
// （时间轴折线、参考区间底色带、越界点标红、目标虚线、断档灰底）。
// 图表库由 index.html 里的 /assets/vendor/echarts.min.js 提供，挂到 window.echarts。
import { useEffect, useRef } from 'react';

const THEME = {
  pine: '#2F6B57',
  warn: '#B4553F',
  grid: '#E2DDD0',
  gridSoft: '#F0EBE0',
  band: 'rgba(237,243,236,0.85)',
  bandEdge: '#B9CDBD',
  target: '#A9752F',
  axisText: '#8C9188',
  labelText: '#A5AA9F',
  gapFill: 'rgba(165,170,159,0.055)',
  palette: ['#2F6B57', '#A9752F', '#5B7DA8', '#8A5B7A', '#6B8A5B', '#B4553F'],
};
const DAY = 864e5;
const p2 = (n: number) => String(n).padStart(2, '0');
const dayTs = (d: string) => Date.parse(String(d) + 'T00:00:00');
const fmtYMD = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const fmtYM = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; };
const fmtMD = (ts: number) => { const d = new Date(ts); return `${d.getMonth() + 1}-${p2(d.getDate())}`; };
const axisFmt = (spanDays: number) => (spanDays > 300 ? fmtYM : fmtMD);

export interface EChartPoint { date: string; value: number }

export interface EChartProps {
  points: EChartPoint[];
  low?: number | null;
  high?: number | null;
  target?: number | null;
  unit?: string;
  name?: string;
  height?: number;
  emptyText?: string;
}

export function EChart({ points, low, high, target, unit = '', name = '指标', height, emptyText }: EChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const instRef = useRef<any>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const echarts = window.echarts;
    const clean = (points || [])
      .map((p) => ({ ts: dayTs(p.date), value: Number(p.value) }))
      .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.value))
      .sort((a, b) => a.ts - b.ts);

    if (!echarts || !clean.length) {
      host.innerHTML = `<div class="empty" style="padding:24px;color:var(--ink-5);text-align:center">${clean.length ? '图表组件未加载' : (emptyText || '这项还没有可画的数据')}</div>`;
      host.style.height = '';
      return;
    }
    const singleTs = clean[0].ts === clean[clean.length - 1].ts;
    if (clean.length === 1 || singleTs) {
      const p0 = clean[clean.length - 1];
      host.innerHTML = `<div class="empty" style="padding:24px 12px;color:var(--ink-5);text-align:center">只有 ${fmtYMD(p0.ts)} 这一次记录（${Math.round(p0.value * 100) / 100}${unit ? ' ' + unit : ''}）。再记一次，才看得出是升还是降。</div>`;
      host.style.height = '';
      return;
    }
    host.innerHTML = '';

    const H = height || (window.innerWidth < 700 ? 230 : 280);
    const h = Math.max(1.5, Math.min(2.6, (clean.length ? 2 : 2)));
    const data = clean.map((p) => {
      const over = (low != null && p.value < low) || (high != null && p.value > high);
      const pt: any = { value: [p.ts, p.value], tip: fmtYMD(p.ts), dv: String(p.value) };
      if (over) pt.itemStyle = { color: THEME.warn, borderColor: THEME.warn };
      return pt;
    });

    const series: any = {
      name, type: 'line', data, showSymbol: true, symbolSize: clean.length > 60 ? 4 : 5.5,
      smooth: false, connectNulls: false,
      lineStyle: { width: h, color: THEME.pine, cap: 'round', join: 'round' },
      itemStyle: { color: THEME.pine, borderWidth: 0 },
      emphasis: { focus: 'series', scale: 1.15 },
    };
    const markAreas: any[] = [];
    if (low != null && high != null) {
      markAreas.push([{ yAxis: low, itemStyle: { color: THEME.band } }, { yAxis: high }]);
      series.markLine = { silent: true, symbol: 'none', data: [
        { yAxis: low, lineStyle: { color: THEME.bandEdge, type: [4, 4], width: 1 }, label: { show: false } },
        { yAxis: high, lineStyle: { color: THEME.bandEdge, type: [4, 4], width: 1 }, label: { show: false } },
      ] };
    }
    if (target != null) {
      series.markLine = series.markLine || { silent: true, symbol: 'none', data: [] };
      series.markLine.data.push({ yAxis: target, lineStyle: { color: THEME.target, type: [5, 4], width: 1, opacity: 0.8 },
        label: { show: true, position: 'insideEndTop', formatter: `目标 ${Number(target).toFixed(1)}`, color: THEME.target, fontSize: 9.5 } });
    }
    const span0 = (clean[clean.length - 1].ts - clean[0].ts) / DAY;
    const option = {
      animationDuration: 300,
      color: THEME.palette,
      grid: { left: 46, right: 18, top: 28, bottom: 44, containLabel: false },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: THEME.bandEdge, type: 'dashed' } },
        backgroundColor: 'rgba(255,255,255,0.97)', borderColor: '#E2DDD0', borderWidth: 1,
        textStyle: { color: '#1B1E1B', fontSize: 11.5 },
        formatter: (params: any) => {
          const hit = (params || []).filter((p: any) => p.value != null && Number.isFinite(Number(Array.isArray(p.value) ? p.value[1] : p.value)));
          if (!hit.length) return '';
          const first = hit[0];
          const date = (first.data && first.data.tip) || fmtYMD(first.axisValue);
          const lines = hit.map((p: any) => {
            const v = Array.isArray(p.value) ? p.value[1] : p.value;
            const shown = p.data && p.data.dv !== undefined ? p.data.dv : v;
            const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:5px"></span>`;
            return `${dot}<b>${shown}${unit ? ' ' + unit : ''}</b>`;
          }).join('<br/>');
          return `<div style="font-weight:600;margin-bottom:3px">${date}</div>${lines}`;
        },
      },
      xAxis: {
        type: 'time',
        ...(singleTs ? { min: clean[0].ts - 3 * DAY, max: clean[0].ts + 3 * DAY } : { boundaryGap: ['3%', '3%'] }),
        axisLine: { lineStyle: { color: THEME.grid } }, axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { color: THEME.axisText, fontSize: 10.5, hideOverlap: true, formatter: axisFmt(span0) },
      },
      yAxis: {
        type: 'value', scale: true, axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: THEME.gridSoft } }, axisLabel: { color: THEME.labelText, fontSize: 10 },
      },
      series: [{ ...series, markArea: markAreas.length ? { silent: true, data: markAreas } : undefined }],
    };

    const existing = echarts.getInstanceByDom?.(host);
    if (existing) { try { existing.dispose(); } catch { /* ignore */ } }
    const inst = echarts.init(host, null, { renderer: 'canvas' });
    instRef.current = inst;
    inst.setOption(option, true);
    host.style.height = H + 'px';
    inst.resize();

    const ro = new ResizeObserver(() => { try { inst.resize(); } catch { /* ignore */ } });
    ro.observe(host);
    return () => { ro.disconnect(); };
  }, [points, low, high, target, unit, name, height, emptyText]);

  useEffect(() => () => { try { instRef.current?.dispose?.(); } catch { /* ignore */ } instRef.current = null; }, []);

  return <div ref={hostRef} className="metric-chart" />;
}
