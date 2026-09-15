import { useRef, useState, type FormEvent } from 'react';
import { newTask, taskInputSchema, type Category, type Task, type TaskInput, type DesktopAPI, type State } from '../shared/contracts';
import { Modal, errorText, dateTimeText } from './ui';

function localInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function TaskEditor({ task, initialTitle, categories, api, close, saved, changed }: { task?: Task; initialTitle?: string; categories: Category[]; api: DesktopAPI; close(): void; saved(state: State): void; changed(state: State): void }) {
  const [draft, setDraft] = useState<TaskInput>(() => task ? { title: task.title, kind: task.kind, status: task.status, priority: task.priority, plannedDate: task.plannedDate, dueAt: task.dueAt, remindAt: task.remindAt, categoryId: task.categoryId, note: task.note } : newTask(initialTitle));
  const initial = useRef(JSON.stringify(draft));
  const [error, setError] = useState(''); const [invalid, setInvalid] = useState(''); const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false); const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryName, setCategoryName] = useState(''); const [categoryColor, setCategoryColor] = useState('#b55232');
  const titleRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== initial.current;
  function change<K extends keyof TaskInput>(key: K, value: TaskInput[K]) { setDraft(d => ({ ...d, [key]: value })); setError(''); setInvalid(''); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const parsed = taskInputSchema.safeParse(draft);
    if (!parsed.success) {
      const field = String(parsed.error.issues[0].path[0]);
      setError(parsed.error.issues[0].message); setInvalid(field);
      const id = field === 'plannedDate' ? 'task-date' : field === 'dueAt' ? 'task-time' : field === 'remindAt' ? 'task-reminder' : 'task-title';
      document.getElementById(id)?.focus(); return;
    }
    setBusy(true);
    try { saved(task ? await api.update(task.id, parsed.data, task.updatedAt) : await api.create(parsed.data)); close(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function addCategory() {
    if (!categoryName.trim() || categoryBusy) return;
    setCategoryBusy(true); setError('');
    try {
      const state = await api.createCategory({ name: categoryName, color: categoryColor });
      const created = state.categories.find(category => category.name.toLocaleLowerCase('zh-CN') === categoryName.trim().toLocaleLowerCase('zh-CN'));
      changed(state);
      if (created) change('categoryId', created.id);
      setAddingCategory(false); setCategoryName('');
    } catch (e) { setError(errorText(e)); } finally { setCategoryBusy(false); }
  }
  return <Modal title={task ? '编辑事项' : '添加待办'} close={close} dirty={dirty && !busy}>
    <form noValidate onSubmit={submit} className="form-body">
      <label htmlFor="task-title">事项名称</label>
      <input id="task-title" ref={titleRef} autoFocus value={draft.title} maxLength={200} onChange={e => change('title', e.target.value)} placeholder="接下来要做什么？" aria-invalid={invalid === 'title'} aria-describedby={error ? 'task-error' : undefined} />
      <div className="form-grid">
        <div><label htmlFor="task-kind">类型</label><select id="task-kind" value={draft.kind} onChange={e => change('kind', e.target.value as TaskInput['kind'])}><option value="task">任务</option><option value="meeting">会议</option></select></div>
        <div><label htmlFor="task-priority">优先级</label><select id="task-priority" value={draft.priority} onChange={e => change('priority', e.target.value as TaskInput['priority'])}><option value="normal">普通</option><option value="high">重要</option></select></div>
      </div>
      <div className="field-heading"><label htmlFor="task-category">分类</label><button type="button" className="text-button" onClick={() => setAddingCategory(!addingCategory)}>{addingCategory ? '取消新建' : '新建分类'}</button></div>
      <select id="task-category" value={draft.categoryId ?? ''} onChange={e => change('categoryId', e.target.value || null)}><option value="">未分类</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
      {addingCategory ? <div className="inline-category-editor">
        <input aria-label="新分类名称" value={categoryName} maxLength={30} onChange={e => setCategoryName(e.target.value)} placeholder="例如：工作" autoFocus />
        <label className="color-picker" title="分类颜色"><span>颜色</span><input aria-label="新分类颜色" type="color" value={categoryColor} onChange={e => setCategoryColor(e.target.value)} /></label>
        <button type="button" disabled={!categoryName.trim() || categoryBusy} onClick={() => void addCategory()}>{categoryBusy ? '创建中…' : '创建并选中'}</button>
      </div> : null}
      <label htmlFor="task-date">计划日期</label><input id="task-date" type="date" value={draft.plannedDate} onChange={e => change('plannedDate', e.target.value)} aria-invalid={invalid === 'plannedDate'} aria-describedby={error ? 'task-error' : undefined} />
      <label htmlFor="task-time">事项时间 <span className="muted">可不填</span></label>
      <input id="task-time" type="datetime-local" value={localInput(draft.dueAt)} onChange={e => change('dueAt', e.target.value ? new Date(e.target.value).toISOString() : null)} />
      <label htmlFor="task-reminder">提醒时间 <span className="muted">可不填</span></label>
      <input id="task-reminder" type="datetime-local" value={localInput(draft.remindAt)} onChange={e => change('remindAt', e.target.value ? new Date(e.target.value).toISOString() : null)} aria-invalid={invalid === 'remindAt'} aria-describedby={error ? 'task-error' : undefined} />
      <div className="reminder-presets"><button type="button" disabled={!draft.dueAt} onClick={() => change('remindAt', draft.dueAt)}>准时</button><button type="button" disabled={!draft.dueAt} onClick={() => change('remindAt', new Date(Date.parse(draft.dueAt!) - 600000).toISOString())}>提前10分钟</button><button type="button" onClick={() => change('remindAt', null)}>不提醒</button></div>
      <p className="field-help">时间按此电脑时区保存。退出应用后停止提醒。</p>
      {task ? <><label htmlFor="task-status">状态</label><select id="task-status" value={draft.status} onChange={e => change('status', e.target.value as TaskInput['status'])}><option value="todo">待办</option><option value="doing">进行中</option><option value="done">已完成</option></select></> : null}
      <label htmlFor="task-note">备注 / 进展</label><textarea id="task-note" rows={3} className="resize-none" value={draft.note} maxLength={5000} onChange={e => change('note', e.target.value)} placeholder="补充信息或记录进展" />
      {error ? <p className="error" id="task-error" role="alert">{error}</p> : null}
      {deleting && task ? <div className="delete-confirm" role="group" aria-label="确认删除"><p>删除「{task.title}」？可以从“已删除”中恢复。</p><button type="button" onClick={() => setDeleting(false)}>保留</button><button type="button" className="danger" disabled={busy} onClick={async () => { setBusy(true); try { saved(await api.remove(task.id, task.updatedAt)); close(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }}>确认删除</button></div> : null}
      <div className="actions sticky-actions">{task ? <button type="button" className="text-danger" disabled={busy} onClick={() => setDeleting(true)}>删除</button> : null}<button className="primary" disabled={busy} type="submit">{busy ? '保存中…' : '保存事项'}</button></div>
      {task?.updatedAt ? <p className="field-help">最近更新：{dateTimeText(task.updatedAt)}</p> : null}
    </form>
  </Modal>;
}
