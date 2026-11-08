// 通用趋势折线图（自绘 SVG，替代旧 echarts）；
// 支持参考区间底色、目标虚线、空态。与旧 echartsChart 的视觉意图一致。
export interface ChartPoint {
  date: string;
  value: number;
}

export function TrendChart({
  points,
  low = null,
  high = null,
  target = null,
  unit = '',
  height = 260,
  emptyText = '还没有记录',
}: {
  points: ChartPoint[];
  low?: number | null;
  high?: number | null;
  target?: number | null;
  unit?: string;
  height?: number;
  emptyText?: string;
}) {
  const pts = points.filter((p) => Number.isFinite(p.value));
  if (pts.length === 0) {
    return (
      <div className="empty" style={{ padding: '26px 12px', color: 'var(--ink-5)', textAlign: 'center' }}>
        {emptyText}
      </div>
    );
  }
  const W = 720;
  const H = height;
  const PAD_L = 46;
  const PAD_R = 20;
  const PAD_T = 16;
  const PAD_B = 28;
  const vals = pts.map((p) => p.value);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (low !== null) lo = Math.min(lo, low);
  if (high !== null) hi = Math.max(hi, high);
  if (target !== null) {
    lo = Math.min(lo, target);
    hi = Math.max(hi, target);
  }
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const span = hi - lo;
  lo -= span * 0.12;
  hi += span * 0.12;
  const xs = pts.map((p) => Date.parse(p.date + 'T00:00:00')).filter((n) => Number.isFinite(n));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const sx = (t: number) =>
    PAD_L + (x1 === x0 ? 0.5 : (t - x0) / (x1 - x0)) * (W - PAD_L - PAD_R);
  const sy = (v: number) => H - PAD_B - ((v - lo) / (hi - lo)) * (H - PAD_T - PAD_B);
  const path = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(Date.parse(p.date + 'T00:00:00')).toFixed(1)},${sy(p.value).toFixed(1)}`)
    .join(' ');
  // Y 轴刻度（3 条）
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label="趋势图"
    >
      {low !== null && high !== null && (
        <rect
          x={PAD_L}
          y={sy(high)}
          width={W - PAD_L - PAD_R}
          height={Math.max(0, sy(low) - sy(high))}
          fill="var(--pine-100)"
          opacity={0.5}
        />
      )}
      {low !== null && (
        <line x1={PAD_L} x2={W - PAD_R} y1={sy(low)} y2={sy(low)} stroke="var(--line-strong)" strokeDasharray="4 3" />
      )}
      {high !== null && (
        <line x1={PAD_L} x2={W - PAD_R} y1={sy(high)} y2={sy(high)} stroke="var(--line-strong)" strokeDasharray="4 3" />
      )}
      {target !== null && (
        <line x1={PAD_L} x2={W - PAD_R} y1={sy(target)} y2={sy(target)} stroke="var(--st-due, #A9752F)" strokeDasharray="6 4" opacity={0.7} />
      )}
      {ticks.map((t, i) => (
        <text key={i} x={4} y={sy(t)} fontSize={10} fill="var(--ink-5)" dominantBaseline="middle">
          {Number(t.toPrecision(3))}
        </text>
      ))}
      <path d={path} fill="none" stroke="var(--pine-600)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => {
        const bad = (high !== null && p.value > high) || (low !== null && p.value < low);
        return <circle key={i} cx={sx(Date.parse(p.date + 'T00:00:00'))} cy={sy(p.value)} r={3.5} fill={bad ? '#B4553F' : 'var(--pine-600)'} />;
      })}
      <text x={PAD_L} y={H - 8} fontSize={11} fill="var(--ink-4)">{pts[0]?.date}</text>
      <text x={W - PAD_R} y={H - 8} fontSize={11} fill="var(--ink-4)" textAnchor="end">{pts[pts.length - 1]?.date}</text>
      {unit && <text x={4} y={PAD_T + 2} fontSize={10} fill="var(--ink-5)">{unit}</text>}
    </svg>
  );
}
