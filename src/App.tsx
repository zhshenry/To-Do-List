import { useEffect, useRef, useState } from 'react';
import { PushPin, Minus, Plus, GearSix, Sparkle, Note, Check, Clock, X, ArrowsOut, ArrowsInLineVertical, List, SquaresFour, CaretDown, Archive, DotsThree, Circle } from '@phosphor-icons/react';
import { DOCK_FEATURE_ENABLED, activeToday, localDay, openToday, taskTime, type State, type Task } from '../shared/contracts';
import { BrandMark, IconButton, Modal, errorText, timeText } from './ui';
import { TaskEditor } from './TaskEditor';
import { SettingsPanel, type SettingsTab } from './SettingsPanel';
import { TaskLibrary } from './TaskLibrary';
import { DockIcon } from './DockIcon';
import { MiniCard, type MiniMode, type MiniMotion } from './MiniCard';

const DOCK_LIFT = 32;

export function App() {
  const api = window.desktop;
  const dockSurface = new URLSearchParams(window.location.search).get('window') === 'dock';
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [clock, setClock] = useState(() => new Date());
  const [editor, setEditor] = useState<Task | 'new' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [review, setReview] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [assistantVisible, setAssistantVisible] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [planView, setPlanView] = useState<'rows' | 'tiles'>('rows');
  const [dockOpen, setDockOpen] = useState(false);
  const [miniMode, setMiniMode] = useState<MiniMode>('home');
  const [miniDraft, setMiniDraft] = useState('');
  const [mainMotion, setMainMotion] = useState<'idle' | 'collapsing' | 'expanding' | 'entering'>('idle');
  const seq = useRef(0);
  const mainMotionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dockLeave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dockDrag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const today = localDay(clock);
  function accept(state: State) { seq.current++; setData(state); }
  function motionEnabled() { return !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false); }
  async function changeMainCollapsed(collapsed: boolean, after?: () => void | Promise<void>) {
    if (mutating) return;
    setMutating(true); setError('');
    const animate = motionEnabled();
    setMainMotion(collapsed ? 'collapsing' : 'expanding');
    try {
      const next = await api!.window(collapsed ? 'collapse' : 'expand', animate);
      setMainMotion('entering');
      accept(next);
      await after?.();
      if (mainMotionTimeout.current) clearTimeout(mainMotionTimeout.current);
      mainMotionTimeout.current = setTimeout(() => setMainMotion('idle'), animate ? 200 : 0);
    } catch (e) {
      setMainMotion('idle'); setError(errorText(e));
    } finally { setMutating(false); }
  }
  useEffect(() => {
    if (!api) return;
    let alive = true;
    const load = async () => { const request = ++seq.current; try { const state = await api.state(); if (alive && request === seq.current) setData(state); } catch (e) { if (alive) setError(errorText(e)); } };
    void load(); void api.assistant({ action: 'status' }).then(visible => { if (alive) setAssistantVisible(visible); });
    const off = api.onChanged(() => { void load(); });
    const offAssistant = api.onAssistantVisibility(setAssistantVisible);
    const offSettings = api.onOpenSettings(() => { setSettingsTab('ai'); setSettingsOpen(true); });
    const timer = setInterval(() => setClock(new Date()), 10000);
    return () => { alive = false; off(); offAssistant(); offSettings(); clearInterval(timer); if (mainMotionTimeout.current) clearTimeout(mainMotionTimeout.current); };
  }, [api]);
  useEffect(() => { if (!notice) return; const timeout = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timeout); }, [notice]);
  useEffect(() => {
    if (!api) return;
    function shortcut(event: KeyboardEvent) {
      if (dockSurface || !event.ctrlKey || event.altKey || event.shiftKey || event.isComposing || document.querySelector('dialog[open]')) return;
      if (event.key.toLowerCase() === 'n' || event.key.toLowerCase() === 'f') {
        event.preventDefault();
        if (event.key.toLowerCase() === 'n') {
          if (data?.settings.mainCollapsed) setMiniMode('add'); else setEditor('new');
        } else {
          const openLibrary = () => { setLibraryOpen(true); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[aria-label="搜索事项"]')?.focus()); };
          if (data?.settings.mainCollapsed) void changeMainCollapsed(false, openLibrary); else openLibrary();
        }
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [api, dockSurface, data?.settings.mainCollapsed, mutating]);
  useEffect(() => {
    if (!data?.settings.dockEnabled) setDockOpen(false);
  }, [data?.settings.dockEnabled]);
  async function mutate(action: () => Promise<State>, message = '') {
    if (mutating) return; setMutating(true); setError('');
    try { accept(await action()); if (message) setNotice(message); } catch (e) { setError(errorText(e)); } finally { setMutating(false); }
  }
  if (!api) return <main className="standalone-message"><h1>To Do List</h1><p>请启动 Windows 桌面应用使用本地待办和提醒。</p></main>;
  if (!data) return <main className="standalone-message"><h1>To Do List</h1><p role="status">{error || '正在读取本地待办…'}</p>{error ? <button onClick={() => window.location.reload()}>重新加载</button> : null}</main>;
  const todayTasks = activeToday(data.tasks, today);
  const dueReminders = todayTasks.filter(t => t.status !== 'done' && t.remindAt && Date.parse(t.remindAt) <= clock.getTime());
  const categoryById = new Map(data.categories.map(category => [category.id, category]));
  async function openDock(open: boolean) {
    if (!api || !dockSurface || (open && dockDrag.current?.moved)) return;
    if (dockLeave.current) { clearTimeout(dockLeave.current); dockLeave.current = null; }
    setDockOpen(open);
    void api.dockHover(open).catch(e => setError(errorText(e)));
  }
  if (dockSurface && !DOCK_FEATURE_ENABLED) return null;
  if (dockSurface) {
    const dockSide = data.settings.dockSide;
    const lifted = window.innerHeight > 88;
    const dockOrigin = dockSide === 'left'
      ? { x: window.screenX + Math.max(window.innerWidth, 72) - 72, y: window.screenY + (lifted ? DOCK_LIFT : 0) }
      : { x: window.screenX, y: window.screenY + (lifted ? DOCK_LIFT : 0) };
    return <main className={`widget dock is-${dockSide}${dockOpen ? ' is-open' : ''}`} tabIndex={0} aria-label="悬浮入口" aria-expanded={dockOpen} onMouseEnter={() => { if (dockDrag.current) return; void openDock(true); }} onPointerMove={() => { if (dockDrag.current || dockOpen) return; void openDock(true); }} onMouseLeave={() => { if (dockDrag.current) return; dockLeave.current = setTimeout(() => void openDock(false), 180); }} onFocus={() => { if (dockDrag.current) return; void openDock(true); }} onBlur={event => { if (event.currentTarget.contains(event.relatedTarget as Node | null) || dockDrag.current) return; dockLeave.current = setTimeout(() => void openDock(false), 180); }}>
      <div className="dock-stage">
        <div className={`dock-logo${data.settings.dockIconSource === 'custom' ? ' is-photo' : ''}`} onPointerDown={event => { if (event.button !== 0) return; dockDrag.current = { pointerId: event.pointerId, startX: event.screenX, startY: event.screenY, originX: dockOrigin.x, originY: dockOrigin.y, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { const drag = dockDrag.current; if (!drag || drag.pointerId !== event.pointerId) return; const dx = event.screenX - drag.startX; const dy = event.screenY - drag.startY; if (!drag.moved && dx * dx + dy * dy < 36) return; if (!drag.moved) { drag.moved = true; setDockOpen(false); } void api.dockMove({ x: drag.originX + dx, y: drag.originY + dy }); }} onPointerUp={event => { if (dockDrag.current?.pointerId !== event.pointerId) return; dockDrag.current = null; void api.dockMove(null); }} onPointerCancel={() => { dockDrag.current = null; void api.dockMove(null); }}>
          <DockIcon preset={data.settings.dockIconPreset} custom={data.settings.dockIconSource === 'custom' ? data.settings.dockIcon : undefined} />
        </div>
        <div className="dock-menu" role="menu" aria-label="悬浮快捷操作">
          <IconButton role="menuitem" label="打开待办" onClick={() => { setDockOpen(false); void mutate(() => api.window('show')); }}><ArrowsOut size={18} /></IconButton>
          <IconButton role="menuitem" label="发起 AI 对话" aria-pressed={assistantVisible} onClick={async () => { try { setAssistantVisible(await api.assistant({ action: 'show', source: 'dock', animate: !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) })); } catch (e) { setError(errorText(e)); } }}><Sparkle size={18} weight={assistantVisible ? 'fill' : 'regular'} /></IconButton>
          <IconButton role="menuitem" label={data.settings.dockAlwaysOnTop ? '取消图标置顶' : '置顶图标'} aria-pressed={data.settings.dockAlwaysOnTop} onClick={() => void mutate(() => api.window('dockPin'))}><PushPin size={18} weight={data.settings.dockAlwaysOnTop ? 'fill' : 'regular'} /></IconButton>
        </div>
      </div>
    </main>;
  }
  if (data.settings.mainCollapsed) return <MiniCard data={data} today={today} api={api} mode={miniMode} setMode={setMiniMode} draft={miniDraft} setDraft={setMiniDraft} mutating={mutating} motion={(mainMotion === 'entering' ? 'entering' : mainMotion === 'expanding' ? 'expanding' : 'idle') as MiniMotion} error={error} clearError={() => setError('')} mutate={mutate} expand={ai => {
    void changeMainCollapsed(false, async () => { if (ai) await api.assistant({ action: 'show', source: 'main', animate: false }); });
  }} edit={task => { void changeMainCollapsed(false, () => setEditor(task)); }} />;
  return <main className={`widget${mainMotion === 'collapsing' ? ' is-collapsing' : mainMotion === 'entering' ? ' is-entering' : ''}`}>
    <span className="brand-logo" role="img" aria-label="To Do List"><BrandMark /></span>
    <div className="widget-surface">
      <header className="titlebar">
        <span className="brand-logo-slot" aria-hidden="true" />
        <span className="app-title">To Do List</span>
        <div className="window-actions">
          <IconButton label={data.settings.alwaysOnTop ? '取消置顶' : '置顶窗口'} aria-pressed={data.settings.alwaysOnTop} onClick={() => void mutate(() => api.window('pin'))}><PushPin size={19} weight={data.settings.alwaysOnTop ? 'fill' : 'regular'} /></IconButton>
          {DOCK_FEATURE_ENABLED ? <IconButton label={data.settings.dockEnabled ? '隐藏悬浮入口' : '显示悬浮入口'} aria-pressed={data.settings.dockEnabled} disabled={mutating} onClick={() => void mutate(() => api.dockEnabled(!data.settings.dockEnabled))}><Circle size={19} weight={data.settings.dockEnabled ? 'fill' : 'regular'} /></IconButton> : null}
          <IconButton label="设置" onClick={() => { setSettingsTab('general'); setSettingsOpen(true); }}><GearSix size={19} /></IconButton>
          <IconButton label="收起为卡片" disabled={mutating} onClick={() => { setMiniMode('home'); void changeMainCollapsed(true); }}><ArrowsInLineVertical size={19} /></IconButton>
          <IconButton label="最小化" onClick={() => void mutate(() => api.window('hide'))}><Minus size={20} /></IconButton>
        </div>
      </header>
      <div className="dashboard-top">
        <div className="date-heading"><h1>{clock.getMonth() + 1}月{clock.getDate()}日</h1><span>{['周日', '周一', '周二', '周三', '周四', '周五', '周六'][clock.getDay()]} · 专注当下</span></div>
        <div className="date-actions">
          <button type="button" className="library-entry" title="事项库 · Ctrl+F" aria-pressed={libraryOpen} onClick={() => setLibraryOpen(open => !open)}><Archive size={17} />事项库</button>
          <button type="button" className="add-task-entry" aria-label="添加待办" title="新增 · Ctrl+N" onClick={() => setEditor('new')}><Plus size={17} />新增</button>
        </div>
      </div>
      <section className="agenda">
        {libraryOpen ? <TaskLibrary tasks={data.tasks} categories={data.categories} api={api} changed={accept} edit={setEditor} close={() => setLibraryOpen(false)} /> : <>
          <div className="plan-view-toolbar"><button type="button" aria-label={planView === 'rows' ? '切换到方块视图' : '切换到列表视图'} onClick={() => setPlanView(planView === 'rows' ? 'tiles' : 'rows')}>{planView === 'rows' ? <SquaresFour size={15} /> : <List size={15} />}{planView === 'rows' ? '方块视图' : '列表视图'}</button>
            <details className="plan-more" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
              <summary aria-label="更多操作" title="更多操作"><DotsThree size={20} weight="bold" /></summary>
              <button type="button" onClick={async event => { const menu = event.currentTarget.closest('details'); if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); } try { setReview(await api.review()); } catch (e) { setError(errorText(e)); } }}><Note size={17} />今日复盘</button>
            </details>
          </div>
          <TodayBoard tasks={data.tasks} today={today} categoryById={categoryById} planView={planView} mutating={mutating} api={api} mutate={mutate} setEditor={setEditor} />
        </>}
      </section>
      <footer className="widget-footer">
        {dueReminders.length ? <div className="reminder-strip"><Clock size={16} /><span>{dueReminders[0].title}</span><button disabled={mutating} onClick={() => void mutate(() => api.snooze(dueReminders[0].id), '将在10分钟后提醒')}>稍后10分钟</button></div> : null}
        {error ? <div className="error inline-error" role="alert"><span>{error}</span><IconButton label="关闭提示" onClick={() => setError('')}><X size={15} /></IconButton></div> : null}
        <IconButton className="ai-launcher" label={assistantVisible ? '隐藏 AI 助手' : '打开 AI 助手'} aria-pressed={assistantVisible} onClick={async () => { try { setAssistantVisible(await api.assistant({ action: 'toggle', source: 'main', animate: !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) })); } catch (e) { setError(errorText(e)); } }}><Sparkle size={25} weight={assistantVisible ? 'fill' : 'regular'} /></IconButton>
        <div className="toast" role="status" aria-live="polite">{notice}</div>
      </footer>
    </div>
    {editor ? <TaskEditor key={editor === 'new' ? 'new' : editor.id} task={editor === 'new' ? undefined : editor} categories={data.categories} api={api} changed={accept} saved={state => { accept(state); setNotice('事项已保存'); }} close={() => setEditor(null)} /> : null}
    {settingsOpen ? <SettingsPanel settings={data.settings} api={api} changed={accept} saved={state => { accept(state); setNotice('设置已保存'); }} close={() => setSettingsOpen(false)} initialTab={settingsTab} /> : null}
    {review !== null ? <Modal title="今日复盘" close={() => setReview(null)}><div className="form-body"><div className="sheet-card"><pre className="review-content">{review}</pre><p className="field-help">以上由本地事项记录生成。点击下方按钮，会把相关事项和最近对话发送到已配置的模型进行总结。</p></div><button className="primary" onClick={async () => { if (!data.settings.aiEnabled) { setReview(null); setSettingsTab('ai'); setSettingsOpen(true); return; } const prompt = '请根据今日待办、日程和进展生成简短的中文每日复盘：完成事项、未完成事项、明日建议。只返回总结，不修改任何事项。'; setReview(null); try { setAssistantVisible(await api.assistant({ action: 'show', source: 'main', prompt, animate: !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) })); } catch (e) { setError(errorText(e)); } }}>{data.settings.aiEnabled ? '在 AI 助手中总结' : '先设置 AI 助手'}</button></div></Modal> : null}
  </main>;
}

function shiftDay(day: string, days: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDay(date);
}

function TodayBoard({ tasks, today, categoryById, planView, mutating, api, mutate, setEditor }: {
  tasks: Task[]; today: string; categoryById: Map<string, { id: string; name: string; color: string }>;
  planView: 'rows' | 'tiles'; mutating: boolean;
  api: NonNullable<typeof window.desktop>; mutate: (action: () => Promise<State>, message?: string) => Promise<void> | void;
  setEditor: (task: Task | 'new') => void;
}) {
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const openItems = openToday(tasks, today);
  const todos = openItems.filter(task => task.kind === 'task');
  const meetings = openItems.filter(task => task.kind === 'meeting');
  const currentId = openItems[0]?.id;
  const tomorrow = shiftDay(today, 1);
  const dayAfter = shiftDay(today, 2);
  const weekEnd = shiftDay(today, 7);
  const laterStart = shiftDay(today, 8);
  const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
  const folders = [
    { id: 'tomorrow', label: '明天', range: shortDate(tomorrow), empty: '明天还没有日程。', from: tomorrow, through: tomorrow },
    { id: 'soon', label: '近期', range: `${shortDate(dayAfter)} – ${shortDate(weekEnd)}`, empty: '未来一周暂无其他日程。', from: dayAfter, through: weekEnd },
    { id: 'later', label: '更晚', range: `${shortDate(laterStart)} 起`, empty: '还没有更远的日程。', from: laterStart, through: null },
  ].map(folder => ({ ...folder, items: tasks.filter(task => !task.deletedAt && task.kind === 'meeting' && task.plannedDate >= folder.from && (!folder.through || task.plannedDate <= folder.through))
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || taskTime(a) - taskTime(b) || a.createdAt.localeCompare(b.createdAt)) }));
  return <div className="today-board">
    <section className={`plan-card plan-today${todos.length ? '' : ' is-empty'}`} aria-label="待办">
      <header className="plan-card-heading"><h2>待办</h2></header>
      {todos.length ? <ul className={planView === 'tiles' ? 'plan-tiles' : 'plan-list'}>{todos.map(task => <PlanRow key={task.id} task={task} tiles={planView === 'tiles'} category={task.categoryId ? categoryById.get(task.categoryId) : undefined} current={task.id === currentId} today={today} mutating={mutating} api={api} mutate={mutate} setEditor={setEditor} />)}</ul> : <div className="plan-empty">点击 + 添加，或让 AI 帮你安排。</div>}
    </section>
    <section className="plan-schedule" aria-label="日程">
      <header className="plan-card-heading"><h2>日程</h2></header>
      {meetings.length ? <ul className="plan-list">{meetings.map(task => <PlanRow key={task.id} task={task} tiles={false} category={task.categoryId ? categoryById.get(task.categoryId) : undefined} current={task.id === currentId} today={today} mutating={mutating} api={api} mutate={mutate} setEditor={setEditor} />)}</ul> : <div className="plan-empty">今天没有日程。</div>}
      <div className="plan-schedule-upcoming">
      {folders.map(folder => {
        const open = openFolder === folder.id;
        return <section key={folder.id} className={`plan-folder${open ? ' is-open' : ''}`}>
          <button type="button" className="plan-folder-tab" aria-expanded={open} aria-controls={`plan-folder-${folder.id}`} onClick={() => setOpenFolder(open ? null : folder.id)}>
            <h3>{folder.label}<small>{folder.range}</small></h3>
            <span className="plan-folder-count">{folder.items.length}</span>
            <CaretDown className="plan-folder-caret" size={12} weight="bold" />
          </button>
          {open ? <div id={`plan-folder-${folder.id}`} className="plan-folder-body">
            {folder.items.length ? <ul className="plan-list">{folder.items.map(task => <PlanRow key={task.id} task={task} tiles={false} category={task.categoryId ? categoryById.get(task.categoryId) : undefined} current={false} today={today} mutating={mutating} api={api} mutate={mutate} setEditor={setEditor} />)}</ul> : <div className="plan-empty">{folder.empty}</div>}
          </div> : null}
        </section>;
      })}
      </div>
    </section>
  </div>;
}

function PlanRow({ task, tiles, category, current, today, mutating, api, mutate, setEditor }: {
  task: Task; tiles: boolean; category?: { name: string; color: string }; current: boolean; today: string; mutating: boolean;
  api: NonNullable<typeof window.desktop>; mutate: (action: () => Promise<State>, message?: string) => Promise<void> | void;
  setEditor: (task: Task | 'new') => void;
}) {
  const overdue = task.status !== 'done' && task.plannedDate < today;
  return <li className={`plan-item${tiles ? ' is-tile' : ''}${task.status === 'done' ? ' is-done' : ''}${current ? ' is-current' : ''}`}>
    <button type="button" className="task-check" aria-label={`${task.status === 'done' ? '恢复待办' : '完成'} ${task.title}`} aria-pressed={task.status === 'done'} disabled={mutating} onClick={() => void mutate(() => api.update(task.id, { status: task.status === 'done' ? 'todo' : 'done' }, task.updatedAt))}>{task.status === 'done' ? <Check size={14} weight="bold" /> : null}</button>
    <button type="button" className="plan-main" onClick={() => setEditor(task)} aria-label={`编辑 ${task.title}`}>
      <span className="plan-task-copy"><b title={task.title}>{task.title}</b><span className="plan-category"><i className="plan-dot" aria-hidden="true" style={{ backgroundColor: category?.color ?? 'var(--muted)' }} />{category?.name ?? '无标签'}{overdue || task.plannedDate > today ? <> · <time dateTime={task.plannedDate}>{task.plannedDate}</time></> : null}</span></span>
      {task.progress !== null ? <span className="plan-progress" role="progressbar" aria-label={`${task.title}进度`} aria-valuenow={task.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${task.progress}%` }} /></span> : null}
      {current && overdue ? <span className="plan-pill">待处理</span> : task.status === 'doing' ? <span className="plan-pill">进行中</span> : null}
      <time>{timeText(task.dueAt)}</time>
    </button>
  </li>;
}
