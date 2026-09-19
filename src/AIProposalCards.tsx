import { useState } from 'react';
import { ArrowRight, Check, LockSimple, PencilSimple, Sparkle, Tag } from '@phosphor-icons/react';
import { newTask, taskInputSchema, type AIAction, type AIPlan, type AIProposalSelection, type Category, type ChatEntry, type Task, type TaskInput } from '../shared/contracts';
import { DatePicker, HALF_HOUR_TIMES, Segmented, Select, dateTimeText } from './ui';

const taskLabels: Record<string, string> = {
  title: '标题', kind: '类型', status: '状态', priority: '优先级', plannedDate: '计划日期',
  dueAt: '时间', remindAt: '提醒', categoryId: '标签', progress: '进度', note: '备注',
};
const taskWords: Record<string, string> = {
  task: '待办', meeting: '日程', todo: '待办', doing: '进行中', done: '已完成', low: '低', medium: '中', high: '高',
};
const taskKeys = ['title', 'kind', 'status', 'priority', 'plannedDate', 'dueAt', 'remindAt', 'categoryId', 'progress', 'note'] as const;
const timeOptions = [{ value: '', label: '不设时间' }, ...HALF_HOUR_TIMES.map(value => ({ value, label: value }))];

function localTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : '';
}
function dueAtFrom(day: string, time: string): string | null {
  if (!time) return null;
  const date = new Date(`${day}T${time}:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function proposedCategoryNames(actions: AIAction[]) {
  return new Map(actions.flatMap(action => action.type === 'create_category' ? [[action.category.id, action.category.name] as const] : []));
}
function taskValue(key: string, value: unknown, categories: Category[], proposedNames: Map<string, string>): string {
  if (key === 'categoryId') return value ? categories.find(category => category.id === value)?.name ?? proposedNames.get(String(value)) ?? '无标签' : '无标签';
  if (key === 'dueAt' || key === 'remindAt') return dateTimeText(value ? String(value) : null);
  if (key === 'progress') return value === null || value === undefined ? '未维护' : `${value}%`;
  if (key === 'note') return value ? String(value) : '无备注';
  if (value === null || value === undefined || value === '') return '未设置';
  return ['kind', 'status', 'priority'].includes(key) ? taskWords[String(value)] ?? String(value) : String(value);
}
function projectedTask(action: AIAction, tasks: Task[]): TaskInput | null {
  if (action.type === 'create') return action.task;
  if (action.type !== 'update') return null;
  const current = tasks.find(task => task.id === action.id);
  if (!current) return null;
  return Object.fromEntries(taskKeys.map(key => [key, action.patch[key] ?? current[key]])) as unknown as TaskInput;
}
function actionTitle(action: AIAction, tasks: Task[], categories: Category[]): string {
  if (action.type === 'create') return action.task.title;
  if (action.type === 'update') return projectedTask(action, tasks)?.title ?? '事项已变化';
  if (action.type === 'remove') return tasks.find(task => task.id === action.id)?.title ?? '事项已变化';
  if (action.type === 'create_category') return action.category.name;
  const category = categories.find(item => item.id === action.id);
  if (action.type === 'update_category') return action.patch.name ?? category?.name ?? '标签已变化';
  return category?.name ?? '标签已变化';
}
function actionKind(action: AIAction): string {
  if (action.type === 'create') return action.task.kind === 'meeting' ? '新增日程' : '新增待办';
  if (action.type === 'update') return '修改事项';
  if (action.type === 'remove') return '删除事项';
  if (action.type === 'create_category') return '新增标签';
  if (action.type === 'update_category') return '修改标签';
  return '删除标签';
}
function actionIdentity(action: AIAction): string {
  if (action.type === 'create') return `${action.type}:${action.task.title}`;
  if (action.type === 'create_category') return `${action.type}:${action.category.id}`;
  return `${action.type}:${action.id}`;
}
function editable(action: AIAction) { return action.type !== 'remove_category' && action.type !== 'remove'; }

function TaskActionEditor({ action, tasks, categories, actions, saving, cancel, save }: {
  action: Extract<AIAction, { type: 'create' | 'update' }>; tasks: Task[]; categories: Category[]; actions: AIAction[]; saving: boolean;
  cancel(): void; save(action: AIAction): Promise<void>;
}) {
  const original = action.type === 'update' ? tasks.find(task => task.id === action.id) ?? null : null;
  const initial = projectedTask(action, tasks);
  const [draft, setDraft] = useState<TaskInput>(() => initial ?? newTask());
  const [error, setError] = useState('');
  if (!initial) return <p className="proposal-card-error">事项已变化，请让 AI 重新生成建议。</p>;
  const categoryOptions = [{ value: '', label: '无标签' }, ...categories.map(category => ({ value: category.id, label: category.name })), ...actions.flatMap(candidate => candidate.type === 'create_category' ? [{ value: candidate.category.id, label: `${candidate.category.name}（待新建）` }] : [])];
  function setDue(next: string | null) {
    setDraft(current => ({ ...current, dueAt: next, remindAt: current.remindAt === current.dueAt ? next : current.remindAt }));
  }
  async function commit() {
    const parsed = taskInputSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? '请检查建议内容'); return; }
    if (parsed.data.kind === 'meeting' && !parsed.data.dueAt) { setError('日程需要设置具体时间'); return; }
    if (action.type === 'create') await save({ ...action, task: parsed.data });
    else {
      if (!original) { setError('事项已变化，请重新生成建议'); return; }
      const patch = Object.fromEntries(taskKeys.filter(key => parsed.data[key] !== original[key]).map(key => [key, parsed.data[key]]));
      if (!Object.keys(patch).length) { setError('请至少保留一项变更'); return; }
      await save({ ...action, patch });
    }
  }
  return <div className="proposal-editor" aria-label={`编辑建议 ${draft.title}`}>
    <label className="proposal-editor-title"><span>{draft.kind === 'meeting' ? '日程标题' : '待办标题'}</span><input value={draft.title} maxLength={200} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} /></label>
    <div className="proposal-editor-grid">
      <label><span>日期</span><DatePicker value={draft.plannedDate} onChange={value => { const next = value || draft.plannedDate; setDraft(current => ({ ...current, plannedDate: next })); setDue(dueAtFrom(next, localTime(draft.dueAt))); }} /></label>
      <label><span>时间</span><Select aria-label="建议时间" value={localTime(draft.dueAt)} onChange={value => setDue(dueAtFrom(draft.plannedDate, value))} options={draft.kind === 'meeting' ? timeOptions.map((option, index) => index ? option : { ...option, label: '选择时间' }) : timeOptions} /></label>
      {draft.kind === 'task' ? <label><span>优先级</span><Segmented aria-label="建议优先级" value={draft.priority} onChange={value => setDraft(current => ({ ...current, priority: value as TaskInput['priority'] }))} options={[{ value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' }]} /></label> : null}
      <label><span>标签</span><Select aria-label="建议标签" value={draft.categoryId ?? ''} onChange={value => setDraft(current => ({ ...current, categoryId: value || null }))} options={categoryOptions} /></label>
    </div>
    {error ? <p className="proposal-editor-error" role="alert">{error}</p> : null}
    <div className="proposal-editor-footer"><small><LockSimple size={13} />仅修改建议草稿，不会立即写入事项</small><span><button type="button" disabled={saving} onClick={cancel}>取消</button><button type="button" className="primary" disabled={saving || !draft.title.trim()} onClick={() => void commit()}>{saving ? '正在保存…' : '保存修改'}</button></span></div>
  </div>;
}

function CategoryActionEditor({ action, categories, saving, cancel, save }: {
  action: Extract<AIAction, { type: 'create_category' | 'update_category' }>; categories: Category[]; saving: boolean; cancel(): void; save(action: AIAction): Promise<void>;
}) {
  const current = action.type === 'update_category' ? categories.find(category => category.id === action.id) : null;
  const [name, setName] = useState(action.type === 'create_category' ? action.category.name : action.patch.name ?? current?.name ?? '');
  const [color, setColor] = useState(action.type === 'create_category' ? action.category.color : action.patch.color ?? current?.color ?? '#b55232');
  return <div className="proposal-editor is-category">
    <label><span>标签名称</span><input value={name} maxLength={30} onChange={event => setName(event.target.value)} /></label>
    <label><span>标签颜色</span><span className="proposal-color-editor"><input type="color" aria-label="建议标签颜色" value={color} onChange={event => setColor(event.target.value)} /><code>{color}</code></span></label>
    <div className="proposal-editor-footer"><small><LockSimple size={13} />仅修改建议草稿</small><span><button type="button" disabled={saving} onClick={cancel}>取消</button><button type="button" className="primary" disabled={saving || !name.trim()} onClick={() => void save(action.type === 'create_category' ? { ...action, category: { ...action.category, name: name.trim(), color } } : { ...action, patch: { name: name.trim(), color } })}>{saving ? '正在保存…' : '保存修改'}</button></span></div>
  </div>;
}

function ActionDetails({ action, tasks, categories, actions }: { action: AIAction; tasks: Task[]; categories: Category[]; actions: AIAction[] }) {
  const names = proposedCategoryNames(actions);
  if (action.type === 'create') return <dl className="proposal-card-details">
    <div><dt>时间</dt><dd><strong>{taskValue('dueAt', action.task.dueAt, categories, names)}</strong></dd></div>
    {action.task.kind === 'task' ? <div><dt>优先级</dt><dd><strong>{taskValue('priority', action.task.priority, categories, names)}</strong></dd></div> : null}
    <div><dt>标签</dt><dd><strong>{taskValue('categoryId', action.task.categoryId, categories, names)}</strong></dd></div>
  </dl>;
  if (action.type === 'update') {
    const current = tasks.find(task => task.id === action.id);
    return current ? <dl className="proposal-card-details is-diff">{Object.entries(action.patch).map(([key, next]) => <div key={key}><dt>{taskLabels[key] ?? key}</dt><dd><span>{taskValue(key, (current as unknown as Record<string, unknown>)[key], categories, names)}</span><ArrowRight size={13} /><strong>{taskValue(key, next, categories, names)}</strong></dd></div>)}</dl> : <p className="proposal-card-error">事项已变化，请重新生成建议。</p>;
  }
  if (action.type === 'remove') {
    const current = tasks.find(task => task.id === action.id);
    return current ? <p className="proposal-category-summary">确认应用后删除“{current.title}”，放入回收保护（软删除）。</p> : <p className="proposal-card-error">事项已变化，请重新生成建议。</p>;
  }
  if (action.type === 'create_category') return <p className="proposal-category-summary"><i style={{ backgroundColor: action.category.color }} />创建标签“{action.category.name}”</p>;
  const current = categories.find(category => category.id === action.id);
  if (!current) return <p className="proposal-card-error">标签已变化，请重新生成建议。</p>;
  if (action.type === 'remove_category') return <p className="proposal-category-summary"><i style={{ backgroundColor: current.color }} />删除后，关联事项会变为无标签。</p>;
  return <dl className="proposal-card-details is-diff">{Object.entries(action.patch).map(([key, next]) => <div key={key}><dt>{key === 'name' ? '名称' : '颜色'}</dt><dd><span>{String(current[key as 'name' | 'color'])}</span><ArrowRight size={13} /><strong>{String(next)}</strong></dd></div>)}</dl>;
}

export function AIProposalCards({ entry, previousActions, tasks, categories, busy, mutating, apply, discard, adjust, updateAction }: {
  entry: ChatEntry; previousActions?: AIPlan['actions']; tasks: Task[]; categories: Category[]; busy: boolean; mutating: boolean;
  apply(entry: ChatEntry, items: AIProposalSelection[]): void; discard(entry: ChatEntry): void; adjust(entry: ChatEntry, index: number): void;
  updateAction(entry: ChatEntry, index: number, action: AIAction): Promise<void>;
}) {
  const proposal = entry.proposal!;
  const [actions, setActions] = useState<AIAction[]>(proposal.actions);
  const [selected, setSelected] = useState(() => new Set(proposal.actions.map((_, index) => index)));
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedCount = selected.size;
  function toggle(index: number) {
    if (editing !== null || busy || mutating) return;
    setSelected(current => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
        const candidate = actions[index];
        if (candidate?.type === 'create_category') {
          for (const [itemIndex, item] of actions.entries()) {
            const categoryId = item.type === 'create' ? item.task.categoryId : item.type === 'update' ? item.patch.categoryId : null;
            if (categoryId === candidate.category.id) next.delete(itemIndex);
          }
        }
      } else {
        next.add(index);
        const item = actions[index];
        const categoryId = item?.type === 'create' ? item.task.categoryId : item?.type === 'update' ? item.patch.categoryId : null;
        const dependency = actions.findIndex(candidate => candidate.type === 'create_category' && candidate.category.id === categoryId);
        if (dependency >= 0) next.add(dependency);
      }
      return next;
    });
  }
  async function save(index: number, action: AIAction) {
    setSaving(true); setError('');
    try {
      await updateAction(entry, index, action);
      setActions(current => current.map((candidate, itemIndex) => itemIndex === index ? action : candidate));
      setEditing(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法保存建议'); }
    finally { setSaving(false); }
  }
  return <section className="proposal-set" aria-label="待确认建议">
    <header className="proposal-set-heading"><span><b>需要你确认</b><small>可逐项选择、编辑，或继续让 AI 调整</small></span></header>
    <div className="proposal-card-list">{actions.map((action, index) => {
      const title = actionTitle(action, tasks, categories);
      const task = projectedTask(action, tasks);
      const category = task?.categoryId ? categories.find(item => item.id === task.categoryId) : null;
      const wasUpdated = previousActions?.some(previous => actionIdentity(previous) === actionIdentity(action) && JSON.stringify(previous) !== JSON.stringify(action));
      const isEditing = editing === index;
      return <article key={`${entry.id}-${index}`} className={`proposal-card${action.type === 'remove' ? ' is-danger' : ''}${selected.has(index) ? ' is-selected' : ''}${isEditing ? ' is-editing' : ''}${wasUpdated ? ' is-updated' : ''}`}>
        <span className="proposal-card-corners" aria-hidden="true" />
        <header className="proposal-card-head">
          <button type="button" className="proposal-check" aria-label={`${selected.has(index) ? '取消选择' : '选择建议'} ${title}`} aria-pressed={selected.has(index)} disabled={isEditing || busy || mutating} onClick={() => toggle(index)}>{selected.has(index) ? <Check size={14} weight="bold" /> : null}</button>
          <span className="proposal-card-title"><small>{actionKind(action)}</small><b>{title}</b>{category ? <em><i style={{ backgroundColor: category.color }} />{category.name}</em> : action.type.includes('category') ? <em><Tag size={12} />标签</em> : null}</span>
          <span className="proposal-card-status">{isEditing ? '编辑中' : wasUpdated ? '刚刚更新' : '待确认'}</span>
        </header>
        {wasUpdated && !isEditing ? <p className="proposal-updated-note">已根据你的追问更新</p> : null}
        {isEditing && (action.type === 'create' || action.type === 'update') ? <TaskActionEditor action={action} tasks={tasks} categories={categories} actions={actions} saving={saving} cancel={() => setEditing(null)} save={next => save(index, next)} />
          : isEditing && (action.type === 'create_category' || action.type === 'update_category') ? <CategoryActionEditor action={action} categories={categories} saving={saving} cancel={() => setEditing(null)} save={next => save(index, next)} />
            : <><ActionDetails action={action} tasks={tasks} categories={categories} actions={actions} /><footer className="proposal-card-actions">{editable(action) ? <button type="button" disabled={busy || mutating || editing !== null} onClick={() => setEditing(index)}><PencilSimple size={15} />编辑</button> : null}<button type="button" disabled={busy || mutating || editing !== null} onClick={() => adjust(entry, index)}><Sparkle size={15} weight="fill" />让 AI 调整</button></footer></>}
      </article>;
    })}</div>
    {error ? <p className="proposal-set-error" role="alert">{error}</p> : null}
    <div className="proposal-apply-bar"><strong>已选 {selectedCount} 项</strong><button type="button" disabled={busy || mutating || editing !== null} onClick={() => setSelected(selectedCount ? new Set() : new Set(actions.map((_, index) => index)))}>{selectedCount ? '取消全选' : '全选'}</button><button type="button" className="proposal-discard" disabled={busy || mutating || editing !== null} onClick={() => discard(entry)}>放弃建议</button><button type="button" className="primary" disabled={!selectedCount || busy || mutating || editing !== null} onClick={() => apply(entry, [...selected].sort((a, b) => a - b).map(index => ({ index, action: actions[index]! })))}>{editing !== null ? '先保存当前修改' : mutating ? '正在应用…' : `应用所选 ${selectedCount} 项`}</button></div>
  </section>;
}
