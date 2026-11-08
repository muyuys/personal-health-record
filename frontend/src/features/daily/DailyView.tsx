// 日常健康总壳：复刻旧 renderDailyShell（js/app.views.records.js:1391）。
// 外层四段（体重与饮食 / 血压等体征 / 症状 / 睡眠）用有轨道的 .segmented；
// 体重与饮食段内层「体重 / 饮食 / 复盘」用无轨道 .filter-chip。两层层级必须能分开（027 §6.1）。
import { useEffect, useState } from 'react';
import { useHead } from '../../components/head';
import { Icon } from '../../components/icons';
import { WeightSeg } from './WeightSeg';
import { VitalsSeg } from './VitalsSeg';
import { SymptomsSeg } from './SymptomsSeg';
import { SleepSeg } from './SleepSeg';

const LS_DAILY_SEG = 'personal-health-daily-seg-v1';

const DAILY_SEG_META = [
  { k: 'body', label: '体重与饮食' },
  { k: 'vitals', label: '血压等体征' },
  { k: 'symptoms', label: '症状' },
  { k: 'sleep', label: '睡眠' },
] as const;
type OuterSeg = (typeof DAILY_SEG_META)[number]['k'];

function readSavedSeg(): OuterSeg {
  try {
    const s = localStorage.getItem(LS_DAILY_SEG);
    if (s === 'body' || s === 'vitals' || s === 'symptoms' || s === 'sleep') return s;
  } catch {
    /* 隐私模式 */
  }
  return 'body';
}

export function DailyView() {
  const { setHead } = useHead();
  const [seg, setSeg] = useState<OuterSeg>(readSavedSeg);

  const changeSeg = (s: OuterSeg) => {
    setSeg(s);
    try {
      localStorage.setItem(LS_DAILY_SEG, s);
    } catch {
      /* ignore */
    }
  };

  // 页头按段切换（标题、副标题、动作按钮由各段设置）
  useEffect(() => {
    // 各段组件内部通过 setHead 覆盖；这里给出兜底
    setHead({ title: '日常健康', sub: '体重 · 体征 · 症状 · 睡眠，按分段记录，超参考范围会标红' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seg]);

  return (
    <div className="stack">
      <div className="segmented" role="tablist" aria-label="日常健康分段" style={{ marginBottom: 'var(--sp-3)' }}>
        {DAILY_SEG_META.map((s) => (
          <button
            key={s.k}
            role="tab"
            type="button"
            aria-selected={s.k === seg}
            className={s.k === seg ? 'on' : ''}
            onClick={() => changeSeg(s.k)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {seg === 'body' && <WeightSeg />}
      {seg === 'vitals' && <VitalsSeg />}
      {seg === 'symptoms' && <SymptomsSeg />}
      {seg === 'sleep' && <SleepSeg />}
    </div>
  );
}

export { Icon };
