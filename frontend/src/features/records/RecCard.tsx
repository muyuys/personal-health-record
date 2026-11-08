// 记录卡：逐条对齐旧前端 recCardHTML（js/app.views.records.js:280）。
// 首页「最近记录」与就医记录时间线共用。
import { Icon } from '../../components/icons';
import { dateParts, type RecEvent } from './recordsEvents';

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface Props {
  ev: RecEvent;
  onOpen: (ev: RecEvent) => void;
  onMore?: (ev: RecEvent) => void;
  compact?: boolean;
  flash?: boolean;
}

export function RecCard({ ev, onOpen, onMore, compact, flash }: Props) {
  const p = dateParts(ev.date, todayISO());

  const dateBlock = p.unknown ? (
    <div className="rc-date">
      <span className="ts" style={{ color: 'var(--st-todo-fg)', fontFamily: 'var(--font-sans)' }}>
        日期未确认
      </span>
    </div>
  ) : (
    <div className="rc-date">
      <span className="rc-year">{p.year}</span>
      <span>{p.md}</span>
      <span className="rc-wd">{p.wd}</span>
    </div>
  );

  const inner = (
    <>
      {dateBlock}
      <div className="rc-body">
        {ev.chip ? (
          <div>
            <span className="chip chip--type">{ev.chip}</span>
          </div>
        ) : null}
        <p className="rc-title">{ev.title || '未命名'}</p>
        {ev.summary ? (
          <p className="rc-sum">{ev.summary}</p>
        ) : (
          <p className="rc-sum is-empty">未填写记录内容</p>
        )}
        {ev.meta ? <p className="rc-meta">{ev.meta}</p> : null}
      </div>
    </>
  );

  const showMore = !!onMore && ['visit', 'report', 'med'].includes(ev.kind);

  return (
    <div
      className={
        'rec-card' + (compact ? ' rec-card--compact' : '') + (flash ? ' is-flash' : '')
      }
    >
      <button className="rc-main" type="button" onClick={() => onOpen(ev)}>
        {inner}
      </button>
      {showMore ? (
        <div className="rc-side">
          <button
            className="icon-btn"
            type="button"
            aria-label={`更多操作：${ev.title || ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onMore!(ev);
            }}
          >
            <Icon name="more" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
