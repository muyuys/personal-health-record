// 待办行：逐条对齐旧前端 todoRowHTML（js/app.views.records.js:256）。
// 无日期只写「未定日期」，绝不出现逾期字样以外的推断。
import { Icon } from '../../components/icons';
import { daysFromToday, followTypeLabel, todoDue, type FlatTodo } from '../../lib/todos';

interface Props {
  todo: FlatTodo;
  done: boolean;
  onToggle?: (id: string) => void;
  editable?: boolean;
  onEdit?: (id: string) => void;
}

export function TodoRow({ todo, done, onToggle, editable, onEdit }: Props) {
  const due = todoDue(todo);
  const d = due ? daysFromToday(due) : null;
  let dateNode: React.ReactNode;
  if (d === null) dateNode = '未定日期';
  else if (d < 0) dateNode = <span className="over">已过期 {-d} 天</span>;
  else if (d === 0) dateNode = '今天';
  else dateNode = `还有 ${d} 天`;
  const typeLabel = followTypeLabel(todo.followType);

  return (
    <div className={'todo-row' + (done ? ' is-done' : '')}>
      <button
        className="todo-check"
        type="button"
        aria-label={done ? '取消完成' : '标记完成'}
        aria-pressed={done}
        onClick={() => onToggle?.(todo.id)}
      >
        <i>
          <Icon name="check2" />
        </i>
      </button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="todo-text">{todo.text}</p>
        <p className="todo-meta">
          {dateNode}
          {typeLabel ? '　·　' + typeLabel : ''}
        </p>
      </div>
      <div className="todo-side">
        {editable ? (
          <button className="btn-plain" type="button" onClick={() => onEdit?.(todo.id)}>
            编辑
          </button>
        ) : null}
      </div>
    </div>
  );
}
