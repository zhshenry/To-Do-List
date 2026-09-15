import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PushPin, Minus, CaretDown, CaretUp, Plus, GearSix, Sparkle, PaperPlaneTilt, Note, Check, Clock, X, ArrowCounterClockwise } from '@phosphor-icons/react';
import { activeToday, localDay, newTask, taskTime, type State, type Task } from '../shared/contracts';
import { IconButton, Modal, errorText, timeText } from './ui';
import { TaskEditor } from './TaskEditor';
import { SettingsPanel } from './SettingsPanel';

export function App() {
  const api = window.desktop;
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [clock, setClock] = useState(() => new Date());
  const [view, setView] = useState<'today' | 'all' | 'trash'>('today');
  const [limit, setLimit] = useState(50); const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [editor, setEditor] = useState<Task | 'new' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState(''); const [assistantVisible, setAssistantVisible] = useState(false);
  const [mutating, setMutating] = useState(false);
  const seq = useRef(0); const manualCompose = useRef<HTMLInputElement>(null); const searchInput = useRef<HTMLInputElement>(null);
  const today = localDay(clock);
  function accept(state: State) { seq.current++; setData(state); }
  useEffect(() => {
    if (!api) return;
    let alive = true;
    const load = async () => { const request = ++seq.current; try { const state = await api.state(); if (alive && request === seq.current) setData(state); } catch (e) { if (alive) setError(errorText(e)); } };
    void load(); void api.assistant({ action: 'status' }).then(visible => { if (alive) setAssistantVisible(visible); });
    const off = api.onChanged(() => { void load(); });
    const offAssistant = api.onAssistantVisibility(setAssistantVisible);
    const offSettings = api.onOpenSettings(() => setSettingsOpen(true));
    const timer = setInterval(() => setClock(new Date()), 10000);
    return () => { alive = false; off(); offAssistant(); offSettings(); clearInterval(timer); };
  }, [api]);
  useEffect(() => { setLimit(50); }, [view, search, categoryFilter]);
  useEffect(() => { if (data && categoryFilter !== 'all' && categoryFilter !== 'uncategorized' && !data.categories.some(category => category.id === categoryFilter)) setCategoryFilter('all'); }, [data, categoryFilter]);
  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timeout); }, [notice]);
  async function mutate(action: () => Promise<State>, message = '') {
    if (mutating) return; setMutating(true); setError('');
    try { accept(await action()); if (message) setNotice(message); } catch (e) { setError(errorText(e)); } finally { setMutating(false); }
  }
  async function send(event: FormEvent) {
    event.preventDefault(); if (!api || mutating || !manualInput.trim()) return;
    setError(''); setMutating(true);
    try { accept(await api.create(newTask(manualInput))); setManualInput(''); setNotice('待办已保存'); }
    catch (e) { setError(errorText(e)); }
    finally { setMutating(false); }
  }
  if (!api) return <main className="standalone-message"><h1>To Do List</h1><p>请启动 Windows 桌面应用使用本地待办和提醒。</p></main>;
  if (!data) return <main className="standalone-message"><h1>To Do List</h1><p role="status">{error || '正在读取本地待办…'}</p>{error ? <button onClick={() => window.location.reload()}>重新加载</button> : null}</main>;
  const todayTasks = activeToday(data.tasks, today);
  const active = data.tasks.filter(t => !t.deletedAt && t.status !== 'done');
  const next = [...active].filter(t => t.dueAt).sort((a, b) => taskTime(a) - taskTime(b))[0];
  const dueReminders = todayTasks.filter(t => t.status !== 'done' && t.remindAt && Date.parse(t.remindAt) <= clock.getTime());
  const selected = view === 'today' ? todayTasks : data.tasks.filter(t => view === 'trash' ? t.deletedAt : !t.deletedAt).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || b.plannedDate.localeCompare(a.plannedDate) || taskTime(a) - taskTime(b));
  const filtered = selected.filter(t => `${t.title} ${t.note}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (categoryFilter === 'all' || (categoryFilter === 'uncategorized' ? !t.categoryId : t.categoryId === categoryFilter)));
  const categoryById = new Map(data.categories.map(category => [category.id, category]));
  const compact = data.settings.compact;
  const switchView = (value: typeof view) => { setView(value); setSearch(''); };
  return <main className={`widget ${compact ? 'compact' : ''}`}>
    <header className="titlebar">
      <img className="brand-logo" src="./brand-logo.png" alt="" aria-hidden="true" />
      <span className="app-title">To Do List</span>
      <div className="window-actions">
        <IconButton label={data.settings.alwaysOnTop ? '取消置顶' : '置顶窗口'} aria-pressed={data.settings.alwaysOnTop} onClick={() => void mutate(() => api.window('pin'))}><PushPin size={19} weight={data.settings.alwaysOnTop ? 'fill' : 'regular'} /></IconButton>
        {!compact ? <IconButton label="设置" onClick={() => setSettingsOpen(true)}><GearSix size={19} /></IconButton> : null}
        <IconButton label="隐藏到托盘" onClick={() => void mutate(() => api.window('hide'))}><Minus size={20} /></IconButton>
        <IconButton label={compact ? '展开面板' : '收起为小条'} onClick={() => void mutate(() => api.window(compact ? 'expand' : 'compact'))}>{compact ? <CaretDown size={19} /> : <CaretUp size={19} />}</IconButton>
      </div>
    </header>
    {compact ? <button className="compact-content" onClick={() => void mutate(() => api.window('expand'))} aria-label="展开面板查看待办">
      <strong>{next ? timeText(next.dueAt) : `${active.length} 项`}</strong><div><b>{next?.title || '待办事项'}</b><small>{next?.remindAt ? `${timeText(next.remindAt)} 提醒` : '点击查看今日安排'}</small></div><CaretDown size={18} />
    </button> : <>
      <div className="dashboard-top">
        <div className="date-heading"><h1>{clock.getMonth() + 1}月{clock.getDate()}日 · {['周日', '周一', '周二', '周三', '周四', '周五', '周六'][clock.getDay()]}</h1><span>专注当下</span></div>
        <section className="next-section" aria-label="下一项">
          <div className="eyebrow">{next && Date.parse(next.dueAt!) < clock.getTime() ? '待处理' : '下一项'}</div>
          {next ? <button className="next-task" onClick={() => setEditor(next)}><strong className="next-time">{timeText(next.dueAt)}</strong><span className="next-detail"><b>{next.title}</b><small>{next.remindAt ? `${localDay(new Date(next.remindAt)) === today ? '' : `${localDay(new Date(next.remindAt))} `}${timeText(next.remindAt)} 提醒` : localDay(new Date(next.dueAt!)) === today ? '今天 · 未设置提醒' : `${localDay(new Date(next.dueAt!))} · 未设置提醒`}</small></span></button> : <div className="next-empty"><strong>从一件小事开始</strong><span>添加事项，为今天留一点方向。</span></div>}
        </section>
      </div>
      <section className="agenda">
        <div className="agenda-heading"><h2>{view === 'today' ? '今日安排' : view === 'all' ? '全部事项' : '已删除'}</h2><span>{filtered.length} 项</span><select className="category-filter" aria-label="按分类筛选" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="all">全部分类</option><option value="uncategorized">未分类</option>{data.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select><IconButton label="添加待办" onClick={() => setEditor('new')}><Plus size={19} /></IconButton></div>
        {view !== 'today' ? <div className="search-field"><input ref={searchInput} aria-label="搜索事项" placeholder="搜索名称或备注" value={search} onChange={e => setSearch(e.target.value)} />{search ? <IconButton label="清除搜索" onClick={() => { setSearch(''); searchInput.current?.focus(); }}><X size={16} /></IconButton> : null}</div> : null}
        <div className="task-scroll">
          {filtered.length ? <ul className="task-list">{filtered.slice(0, limit).map(task => <li key={task.id} className={`task-row ${task.status === 'done' ? 'done' : ''}`}>
            <button className="task-main" onClick={() => task.deletedAt ? undefined : setEditor(task)} disabled={!!task.deletedAt} aria-label={`编辑 ${task.title}`}>
              <time>{timeText(task.dueAt)}</time><span className={`timeline-marker ${task.priority === 'high' ? 'important' : ''}`}>{task.status === 'done' ? <Check size={12} weight="bold" /> : null}</span>
              <span className="task-copy"><b>{task.title}</b><small>{task.categoryId && categoryById.get(task.categoryId) ? <span className="task-category"><i style={{ backgroundColor: categoryById.get(task.categoryId)!.color }} />{categoryById.get(task.categoryId)!.name}</span> : null}<span>{task.status === 'done' ? '已完成' : task.plannedDate < today ? `未完成 · ${task.plannedDate}` : task.remindAt ? `${timeText(task.remindAt)} 提醒` : task.status === 'doing' ? '进行中' : task.kind === 'meeting' ? '会议' : task.plannedDate !== today ? task.plannedDate : '待办'}</span></small></span>
            </button>
            {task.deletedAt ? <IconButton label={`恢复 ${task.title}`} disabled={mutating} onClick={() => void mutate(() => api.restore(task.id), '事项已恢复')}><ArrowCounterClockwise size={20} /></IconButton> : <button className="task-check" aria-label={`${task.status === 'done' ? '恢复待办' : '完成'} ${task.title}`} aria-pressed={task.status === 'done'} disabled={mutating} onClick={() => void mutate(() => api.update(task.id, { status: task.status === 'done' ? 'todo' : 'done' }, task.updatedAt))}>{task.status === 'done' ? <Check size={17} weight="bold" /> : null}</button>}
          </li>)}</ul> : <div className="empty-state"><Note size={30} weight="light" /><b>{search ? '没有匹配的事项' : view === 'trash' ? '没有已删除的事项' : '今天，留给重要的事'}</b><p>{search ? '试试其他关键词。' : view === 'trash' ? '删除的事项会保留在这里，可随时恢复。' : '点击 + 添加，或在下方写下一件事。'}</p></div>}
          {filtered.length > limit ? <button className="load-more" onClick={() => setLimit(limit + 50)}>再显示50项</button> : null}
        </div>
      </section>
      <footer className="widget-footer">
        {dueReminders.length ? <div className="reminder-strip"><Clock size={16} /><span>{dueReminders[0].title}</span><button disabled={mutating} onClick={() => void mutate(() => api.snooze(dueReminders[0].id), '将在10分钟后提醒')}>稍后10分钟</button></div> : null}
        {error ? <div className="error inline-error" role="alert"><span>{error}</span><IconButton label="关闭提示" onClick={() => setError('')}><X size={15} /></IconButton></div> : null}
        <form className="compose" noValidate onSubmit={send}>
          <IconButton label={assistantVisible ? '隐藏 AI 助手' : '打开 AI 助手'} aria-pressed={assistantVisible} onClick={async () => { try { setAssistantVisible(await api.assistant({ action: 'toggle' })); } catch (e) { setError(errorText(e)); } }}><Sparkle size={25} weight={assistantVisible ? 'fill' : 'regular'} /></IconButton>
          <input ref={manualCompose} aria-label="快速添加待办" value={manualInput} onChange={e => setManualInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault(); }} placeholder="记一件事，回车添加…" maxLength={200} />
          <button className="send-button" type="submit" aria-label="添加事项" disabled={!manualInput.trim() || mutating}><PaperPlaneTilt size={21} /></button>
        </form>
        <div className="footer-links"><span className="input-mode">{assistantVisible ? 'AI 助手已打开' : '普通记录'}</span><button onClick={() => switchView(view === 'today' ? 'all' : 'today')}>{view === 'today' ? '全部事项' : '返回今天'}</button>{view !== 'today' ? <button onClick={() => switchView(view === 'trash' ? 'all' : 'trash')}>{view === 'trash' ? '全部' : '已删除'}</button> : null}<button className="review-button" onClick={async () => { try { setReview(await api.review()); } catch (e) { setError(errorText(e)); } }}><Note size={17} />今日复盘</button></div>
        <div className="toast" role="status" aria-live="polite">{notice}</div>
      </footer>
    </>}
    {editor ? <TaskEditor key={editor === 'new' ? 'new' : editor.id} task={editor === 'new' ? undefined : editor} categories={data.categories} api={api} changed={accept} saved={state => { accept(state); setNotice('事项已保存'); }} close={() => setEditor(null)} /> : null}
    {settingsOpen ? <SettingsPanel settings={data.settings} categories={data.categories} api={api} changed={accept} saved={state => { accept(state); setNotice('设置已保存'); }} close={() => setSettingsOpen(false)} /> : null}
    {review !== null ? <Modal title="今日复盘" close={() => setReview(null)}><div className="form-body"><pre className="review-content">{review}</pre><p className="field-help">以上由本地任务记录生成。点击下方按钮，会把相关任务和最近对话发送到已配置的模型进行总结。</p><button className="primary" onClick={async () => { if (!data.settings.aiEnabled) { setReview(null); setSettingsOpen(true); return; } const prompt = '请根据今日任务和进展生成简短的中文每日复盘：完成事项、未完成事项、明日建议。只返回总结，不修改任何任务。'; setReview(null); try { setAssistantVisible(await api.assistant({ action: 'show', prompt })); } catch (e) { setError(errorText(e)); } }}>{data.settings.aiEnabled ? '在 AI 助手中总结' : '先设置 AI 助手'}</button></div></Modal> : null}
  </main>;
}
