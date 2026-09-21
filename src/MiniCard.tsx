import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import {
  ArrowsOutLineVertical, Bell, CalendarBlank, CaretDown, CaretLeft, CaretRight, Check, Circle, Clock,
  DotsThree, Flag, GearSix, Minus, Plus, PushPin, Sparkle, Tag, X,
} from '@phosphor-icons/react';
import {
  DOCK_FEATURE_ENABLED, activeToday, localDay, newTask,
  type Category, type DesktopAPI, type MainWindowWidth, type State, type Task, type TaskInput, type UpdaterStatus,
} from '../shared/contracts';
import { AssistantApp } from './AssistantApp';
import { DEFAULT_TAG_COLOR, TagColorPresets } from './TagColorPresets';
import { BrandMark, HALF_HOUR_TIMES, IconButton, Segmented, errorText, scheduleStamp, stampLabel } from './ui';
import './mini-card.css';

export type MiniMode = 'home' | 'add' | 'ai';
export type MiniMotion = 'idle' | 'expanding' | 'entering';
type AddSelector = 'datetime' | 'priority' | 'tag' | 'more';
type ReminderChoice = 'none' | 'ontime' | 'ten' | 'custom';

const PANEL_HEIGHT: Record<AddSelector, number> = { datetime: 526, priority: 376, tag: 390, more: 438 };
const PANEL_ARROW: Record<AddSelector, number> = { datetime: 22, priority: 49, tag: 76, more: 103 };
const SETTINGS_PANEL_HEIGHT = 318;
const SETTINGS_MODEL_EXTRA = 128;
const ARM_RESET_MS = 4000;

function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDay(date);
}

function nextMonday(day: string) {
  const date = new Date(`${day}T12:00:00`);
  const distance = ((8 - date.getDay()) % 7) || 7;
  return shiftDay(day, distance);
}

function nextHalfHour() {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() < 30 ? 30 : 60);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function localTime(instant: string | null) {
  if (!instant) return '';
  const date = new Date(instant);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toInstant(day: string, time: string) {
  return new Date(`${day}T${time}:00`).toISOString();
}

function monthCells(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const first = new Date(year, month - 1, 1 - start.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first); date.setDate(first.getDate() + index);
    return { iso: localDay(date), day: date.getDate(), outside: date.getMonth() !== month - 1 };
  });
}

function priorityName(priority: TaskInput['priority']) {
  return priority === 'high' ? '高' : priority === 'medium' ? '中' : '低';
}

function insightFor(task: Task | undefined, count: number, now: Date) {
  if (!task) return null;
  const due = task.dueAt ? Date.parse(task.dueAt) : NaN;
  const minutes = Number.isFinite(due) ? Math.round((due - now.getTime()) / 60000) : null;
  if (task.kind === 'meeting' && minutes !== null && minutes >= 0 && minutes <= 60) {
    return {
      title: `为「${task.title}」留出会前准备`,
      context: minutes === 0 ? '即将开始' : `距开始约 ${minutes} 分钟`,
      prompt: `请针对即将开始的日程“${task.title}”生成简短的会前准备清单；如需新增或修改事项，请只生成等待我确认的建议。`,
    };
  }
  if (task.kind === 'task' && minutes !== null && minutes <= 90) {
    return {
      title: minutes < 0 ? `重新安排已到期的「${task.title}」` : `先拆出「${task.title}」的下一步`,
      context: minutes < 0 ? '截止时间已过' : `距截止约 ${minutes} 分钟`,
      prompt: `请帮我处理待办“${task.title}”：先拆出下一步，并根据今天的安排给出可确认的调整建议。`,
    };
  }
  if (count >= 3 && !task.dueAt) {
    return {
      title: `为今天剩余的 ${count} 项安排先后顺序`,
      context: '当前事项没有具体时间',
      prompt: '请读取今天尚未完成的事项，给出简短的执行顺序；如需调整时间，请只生成等待我确认的建议。',
    };
  }
  return null;
}

function SelectorShell({ kind, title, icon, close, children, footer }: {
  kind: AddSelector; title: string; icon: ReactNode; close(): void; children: ReactNode; footer: ReactNode;
}) {
  return <section className={`mini-selector is-${kind}`} style={{ '--mini-arrow-x': `${PANEL_ARROW[kind]}px` } as CSSProperties} aria-label={`${title}设置`}>
    <header className="mini-selector-head"><span>{icon}</span><b>{title}</b><IconButton label={`关闭${title}`} onClick={close}><X size={13} /></IconButton></header>
    <div className="mini-selector-content">{children}</div>
    <footer className="mini-selector-footer">{footer}</footer>
  </section>;
}

function TimeList({ value, allowEmpty, onChange }: { value: string; allowEmpty?: boolean; onChange(value: string): void }) {
  const [open, setOpen] = useState(false);
  const options = allowEmpty ? ['', ...HALF_HOUR_TIMES] : HALF_HOUR_TIMES;
  const [activeIndex, setActiveIndex] = useState(Math.max(0, options.indexOf(value)));
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const option = menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[activeIndex];
    option?.focus({ preventScroll: true });
    option?.scrollIntoView({ block: 'center' });
  }, [activeIndex, open]);
  function show(direction: 1 | -1 = 1) {
    const selected = options.indexOf(value);
    setActiveIndex(selected >= 0 ? selected : direction > 0 ? 0 : options.length - 1);
    setOpen(true);
  }
  function hide(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
  }
  function choose(index: number) {
    onChange(options[index]);
    hide();
  }
  function handleKeys(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) show(event.key === 'ArrowDown' ? 1 : -1);
      else setActiveIndex(index => (index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
    } else if (open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault(); setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
    } else if (open && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); choose(activeIndex);
    } else if (open && event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); hide();
    }
  }
  return <div className="mini-time-list">
    <button ref={trigger} type="button" className="mini-time-trigger" aria-haspopup="listbox" aria-expanded={open} onKeyDown={handleKeys} onClick={() => open ? hide(false) : show()}>
      <span>{value || (allowEmpty ? '不设时间' : nextHalfHour())}</span><CaretDown size={10} />
    </button>
    {open ? <div ref={menu} className="mini-time-menu" role="listbox" aria-label="选择具体时间" onKeyDown={handleKeys}>
      {options.map((time, index) => <button key={time || 'empty'} type="button" role="option" tabIndex={index === activeIndex ? 0 : -1} aria-selected={value === time} className={value === time ? 'is-selected' : ''} onFocus={() => setActiveIndex(index)} onClick={() => choose(index)}>{time || '不设时间'}</button>)}
    </div> : null}
  </div>;
}

function DateTimePanel({ value, today, close, confirm }: { value: TaskInput; today: string; close(): void; confirm(value: Pick<TaskInput, 'plannedDate' | 'dueAt' | 'remindAt'>): void }) {
  const [day, setDay] = useState(value.plannedDate);
  const [time, setTime] = useState(localTime(value.dueAt));
  const selectedDate = new Date(`${value.plannedDate}T12:00:00`);
  const [view, setView] = useState({ year: selectedDate.getFullYear(), month: selectedDate.getMonth() + 1 });
  const due = value.dueAt ? Date.parse(value.dueAt) : NaN;
  const remind = value.remindAt ? Date.parse(value.remindAt) : NaN;
  const initialReminder: ReminderChoice = !value.remindAt || !value.dueAt ? 'none' : remind === due ? 'ontime' : due - remind === 600000 ? 'ten' : 'custom';
  const customOffset = Number.isFinite(due) && Number.isFinite(remind) ? Math.max(60000, due - remind) : 1800000;
  const initialCustomUnit = customOffset % 86400000 === 0 && customOffset / 86400000 <= 99 ? 'day' : customOffset % 3600000 === 0 && customOffset / 3600000 <= 99 ? 'hour' : 'minute';
  const initialCustomAmount = Math.min(99, Math.max(1, Math.round(customOffset / (initialCustomUnit === 'day' ? 86400000 : initialCustomUnit === 'hour' ? 3600000 : 60000))));
  const [reminder, setReminder] = useState<ReminderChoice>(initialReminder);
  const [customOpen, setCustomOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState(initialCustomAmount);
  const [customUnit, setCustomUnit] = useState<'minute' | 'hour' | 'day'>(initialCustomUnit);
  function finish() {
    const dueAt = time ? toInstant(day, time) : null;
    let remindAt: string | null = null;
    if (dueAt && reminder !== 'none') {
      const base = Date.parse(dueAt);
      if (reminder === 'ontime') remindAt = dueAt;
      else if (reminder === 'ten') remindAt = new Date(base - 600000).toISOString();
      else {
        const unit = customUnit === 'minute' ? 60000 : customUnit === 'hour' ? 3600000 : 86400000;
        remindAt = new Date(base - customAmount * unit).toISOString();
      }
    }
    confirm({ plannedDate: day, dueAt, remindAt });
  }
  return <SelectorShell kind="datetime" title="时间安排" icon={<CalendarBlank size={14} />} close={close} footer={<><button type="button" onClick={() => { setDay(today); setTime(''); setReminder('none'); }}>恢复默认</button><button type="button" className="primary" onClick={finish}>确定</button></>}>
    <div className="mini-date-presets">
      {[{ label: '今天', value: today }, { label: '明天', value: shiftDay(today, 1) }, { label: '下周一', value: nextMonday(today) }].map(item => <button key={item.label} type="button" className={day === item.value ? 'is-selected' : ''} onClick={() => setDay(item.value)}>{item.label}</button>)}
    </div>
    <div className="mini-calendar-head"><strong>{view.year}年{view.month}月</strong><span><button type="button" aria-label="上个月" onClick={() => setView(current => current.month === 1 ? { year: current.year - 1, month: 12 } : { ...current, month: current.month - 1 })}><CaretLeft size={12} /></button><button type="button" aria-label="下个月" onClick={() => setView(current => current.month === 12 ? { year: current.year + 1, month: 1 } : { ...current, month: current.month + 1 })}><CaretRight size={12} /></button></span></div>
    <div className="mini-weekdays">{['日', '一', '二', '三', '四', '五', '六'].map(name => <span key={name}>{name}</span>)}</div>
    <div className="mini-calendar" role="grid">{monthCells(view.year, view.month).map(cell => <button key={cell.iso} type="button" role="gridcell" aria-label={cell.iso} aria-selected={cell.iso === day} className={`${cell.outside ? 'is-outside ' : ''}${cell.iso === today ? 'is-today ' : ''}${cell.iso === day ? 'is-selected' : ''}`} onClick={() => setDay(cell.iso)}>{cell.day}</button>)}</div>
    <div className="mini-datetime-settings">
      <div className="mini-setting-row"><span><Clock size={12} />时间</span><TimeList value={time} allowEmpty={value.kind === 'task'} onChange={setTime} /></div>
      <div className="mini-setting-row"><span><Bell size={12} />提醒</span><div className="mini-reminder-options">
        {([['none', '不提醒'], ['ontime', '准时'], ['ten', '提前10分'], ['custom', '自定义']] as const).map(([choice, label]) => <button key={choice} type="button" disabled={!time && choice !== 'none'} className={reminder === choice ? 'is-selected' : ''} onClick={() => { setReminder(choice); setCustomOpen(choice === 'custom'); }}>{label}</button>)}
        {customOpen && time ? <div className="mini-reminder-custom" role="dialog" aria-label="自定义提醒">
          <span>提前</span><button type="button" aria-label="减少提醒时间" onClick={() => setCustomAmount(value => Math.max(1, value - 1))}>−</button><strong>{customAmount}</strong><button type="button" aria-label="增加提醒时间" onClick={() => setCustomAmount(value => Math.min(99, value + 1))}>＋</button>
          <span className="mini-reminder-unit" role="group" aria-label="提醒单位">{([['minute', '分'], ['hour', '时'], ['day', '天']] as const).map(([unit, label]) => <button key={unit} type="button" aria-pressed={customUnit === unit} onClick={() => setCustomUnit(unit)}>{label}</button>)}</span>
          <button type="button" className="primary" onClick={() => setCustomOpen(false)}>完成</button>
        </div> : null}
      </div></div>
    </div>
  </SelectorShell>;
}

function PriorityPanel({ value, close, confirm }: { value: TaskInput['priority']; close(): void; confirm(value: TaskInput['priority']): void }) {
  const [selected, setSelected] = useState(value);
  const options: Array<{ value: TaskInput['priority']; label: string; note: string }> = [
    { value: 'high', label: '高', note: '尽快处理' }, { value: 'medium', label: '中', note: '正常安排' }, { value: 'low', label: '低', note: '低压跟进' },
  ];
  return <SelectorShell kind="priority" title="优先级" icon={<Flag size={14} weight="fill" />} close={close} footer={<><button type="button" onClick={() => setSelected('medium')}>恢复默认</button><button type="button" className="primary" onClick={() => confirm(selected)}>确定</button></>}>
    <div className="mini-option-list">{options.map(option => <button key={option.value} type="button" className={`mini-option priority-${option.value}${selected === option.value ? ' is-selected' : ''}`} onClick={() => setSelected(option.value)}><Flag size={15} weight="fill" /><b>{option.label}</b><small>{option.note}</small></button>)}</div>
  </SelectorShell>;
}

function TagPanel({ value, categories, close, confirm, create }: { value: string | null; categories: Category[]; close(): void; confirm(value: string | null): void; create(name: string, color: string): Promise<string | null> }) {
  const [selected, setSelected] = useState<string | null>(value);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_TAG_COLOR);
  const [busy, setBusy] = useState(false);
  async function add(event: FormEvent) {
    event.preventDefault(); if (!name.trim() || busy) return;
    setBusy(true);
    try { const id = await create(name.trim(), color); if (id) { setSelected(id); setAdding(false); setName(''); } }
    finally { setBusy(false); }
  }
  return <SelectorShell kind="tag" title="标签" icon={<Tag size={14} weight={value ? 'fill' : 'regular'} />} close={close} footer={<><button type="button" onClick={() => setSelected(null)}>清除</button><button type="button" className="primary" onClick={() => confirm(selected)}>确定</button></>}>
    <p className="mini-selector-help">每项最多选择一个标签。</p>
    <div className="mini-option-list mini-tag-list">
      <button type="button" className={`mini-option${selected === null ? ' is-selected' : ''}`} onClick={() => setSelected(null)}><Tag size={15} /><b>无标签</b></button>
      {categories.map(category => <button key={category.id} type="button" className={`mini-option${selected === category.id ? ' is-selected' : ''}`} onClick={() => setSelected(category.id)} style={{ '--tag-color': category.color } as CSSProperties}><Tag size={15} weight="fill" /><b>{category.name}</b></button>)}
      <button type="button" className="mini-option mini-new-tag" onClick={() => setAdding(value => !value)}>＋ 新建标签</button>
    </div>
    {adding ? <form className="mini-new-tag-form" onSubmit={add}><input aria-label="新标签名称" maxLength={30} value={name} onChange={event => setName(event.target.value)} placeholder="标签名称" /><TagColorPresets value={color} onChange={setColor} /><button type="submit" className="primary" disabled={!name.trim() || busy}>{busy ? '创建中…' : '创建'}</button></form> : null}
  </SelectorShell>;
}

function updaterSummary(updater: UpdaterStatus | null, error: string) {
  if (error) return error;
  if (!updater) return '正在读取版本…';
  if (!updater.active) return `v${updater.version} · 仅安装版可检查`;
  if (updater.state === 'checking') return '正在检查更新…';
  if (updater.state === 'downloading') return updater.progress > 0 ? `正在下载 ${updater.progress}%` : '正在下载…';
  if (updater.state === 'ready') return `v${updater.readyVersion} 已下载`;
  if (updater.state === 'latest') return `已是最新 v${updater.version}`;
  if (updater.state === 'error') return updater.message || '检查更新失败';
  return `当前 v${updater.version}`;
}

function SettingsQuickPanel({ data, api, mutating, mutate, close, modelOpen, setModelOpen }: {
  data: State; api: DesktopAPI; mutating: boolean; close(): void; modelOpen: boolean;
  mutate(action: () => Promise<State>): Promise<void>; setModelOpen(open: boolean): void;
}) {
  const [updater, setUpdater] = useState<UpdaterStatus | null>(null);
  const [updateError, setUpdateError] = useState('');
  const animate = !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const activeModel = data.settings.models.find(model => model.id === data.settings.activeModelId);
  const modelLabel = activeModel?.name ?? (data.settings.models.length ? '选择模型' : '尚未配置');
  const modelGroups = data.settings.providers.map(provider => ({
    provider,
    models: data.settings.models.filter(model => model.providerId === provider.id),
  })).filter(group => group.models.length);
  useEffect(() => {
    let alive = true;
    void api.updaterStatus().then(status => { if (alive) { setUpdater(status); setUpdateError(''); } }).catch(cause => { if (alive) setUpdateError(errorText(cause)); });
    const off = api.onUpdater(status => { setUpdater(status); setUpdateError(''); });
    return () => { alive = false; off(); };
  }, [api]);
  const busyUpdate = updater?.state === 'checking' || updater?.state === 'downloading';
  const installReady = updater?.active && updater.state === 'ready' && !!updater.readyVersion;
  return <section className="mini-selector is-settings" aria-label="快捷设置">
    <header className="mini-selector-head"><span><GearSix size={14} /></span><b>快捷设置</b><IconButton label="关闭快捷设置" onClick={close}><X size={13} /></IconButton></header>
    <div className="mini-settings-row"><span>启用 AI</span><button type="button" className="toggle" role="switch" aria-checked={data.settings.aiEnabled} aria-label="启用 AI" disabled={mutating} onClick={() => void mutate(() => api.settings({ aiEnabled: !data.settings.aiEnabled, autoStart: data.settings.autoStart }))} /></div>
    <div className="mini-settings-row"><span>登录 Windows 后自动启动</span><button type="button" className="toggle" role="switch" aria-checked={data.settings.autoStart} aria-label="登录 Windows 后自动启动" disabled={mutating} onClick={() => void mutate(() => api.settings({ aiEnabled: data.settings.aiEnabled, autoStart: !data.settings.autoStart }))} /></div>
    <div className="mini-settings-row"><span>窗口宽度</span><Segmented aria-label="窗口宽度" value={data.settings.mainWindowWidth} onChange={value => void api.windowWidth(value as MainWindowWidth, animate)} options={[{ value: 'standard', label: '标准' }, { value: 'narrow', label: '窄版' }]} /></div>
    <div className="mini-settings-row">
      <span>当前模型</span>
      {data.settings.models.length
        ? <button type="button" className="mini-settings-model" aria-label={`切换模型，当前为 ${modelLabel}`} aria-haspopup="listbox" aria-expanded={modelOpen} disabled={mutating} onClick={() => setModelOpen(!modelOpen)}><span>{modelLabel}</span><CaretDown size={10} /></button>
        : <button type="button" className="mini-settings-action" onClick={() => void api.openSettings(animate)}>去配置</button>}
    </div>
    {modelOpen && data.settings.models.length ? <div className="mini-settings-models" role="listbox" aria-label="按供应商选择模型">
      {modelGroups.map(group => <section key={group.provider.id} role="group" aria-label={group.provider.name}>
        <b>{group.provider.name}</b>
        {group.models.map(model => <button key={model.id} type="button" role="option" aria-selected={model.id === data.settings.activeModelId} className={model.id === data.settings.activeModelId ? 'is-selected' : ''} disabled={mutating} onClick={() => { if (model.id !== data.settings.activeModelId) void mutate(() => api.activateProfile(model.id)); setModelOpen(false); }}><span>{model.name}</span><small>{model.id === data.settings.activeModelId ? '当前' : ''}</small></button>)}
      </section>)}
    </div> : null}
    <div className="mini-settings-row is-update">
      <span>应用更新<small>{updaterSummary(updater, updateError)}</small></span>
      {updater?.active ? <button type="button" className={`mini-settings-action${installReady ? ' is-accent' : ''}`} disabled={mutating || busyUpdate} onClick={() => {
        setUpdateError('');
        void (installReady ? api.updaterInstall() : api.updaterCheck()).catch(cause => setUpdateError(errorText(cause)));
      }}>{installReady ? '重启安装' : busyUpdate ? '请稍候' : '检查更新'}</button> : null}
    </div>
    <footer className="mini-selector-footer"><button type="button" onClick={() => void api.openSettings(animate)}>打开全部设置</button></footer>
  </section>;
}

function MorePanel({ value, close, confirm }: { value: TaskInput; close(): void; confirm(value: Pick<TaskInput, 'progress' | 'note'>): void }) {
  const [maintain, setMaintain] = useState(value.progress !== null);
  const [progress, setProgress] = useState(value.progress ?? 0);
  const [note, setNote] = useState(value.note);
  return <SelectorShell kind="more" title="更多设置" icon={<DotsThree size={15} />} close={close} footer={<><button type="button" onClick={() => { setMaintain(false); setProgress(0); setNote(''); }}>清除内容</button><button type="button" className="primary" onClick={() => confirm({ progress: maintain ? progress : null, note })}>确定</button></>}>
    <p className="mini-selector-help">备注与进度保存在事项里，不挤占快捷创建区。</p>
    <div className="mini-more-progress"><div><b>维护进度</b><button type="button" className="mini-switch" role="switch" aria-checked={maintain} onClick={() => setMaintain(value => !value)}><i /></button>{maintain ? <output>{progress}%</output> : null}</div>{maintain ? <><input className="progress-range" aria-label="事项进度" type="range" min="0" max="100" step="5" value={progress} style={{ '--progress-value': `${progress}%` } as CSSProperties} onChange={event => setProgress(Number(event.target.value))} /><span><small>未开始</small><small>完成</small></span></> : null}</div>
    <label className="mini-note-field"><span>事项备注 <small>创建后仍可继续补充</small></span><textarea value={note} maxLength={5000} onChange={event => setNote(event.target.value)} placeholder="补充信息，或记录当前进展" /></label>
  </SelectorShell>;
}

export function MiniCard({ data, today, api, mode, setMode, draft, setDraft, mutating, motion, error, clearError, mutate, expand, edit }: {
  data: State; today: string; api: DesktopAPI; mode: MiniMode; setMode(mode: MiniMode): void;
  draft: string; setDraft(text: string): void; mutating: boolean; motion: MiniMotion; error: string; clearError(): void;
  mutate(action: () => Promise<State>): Promise<void>; expand(ai?: boolean): void; edit(task: Task): void;
}) {
  const [index, setIndex] = useState(0);
  const [selector, setSelector] = useState<AddSelector | null>(null);
  const [addItem, setAddItem] = useState<TaskInput>(() => newTask(draft));
  const [confirmed, setConfirmed] = useState({ datetime: false, priority: false, tag: false });
  const [addError, setAddError] = useState('');
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [suggestionIgnored, setSuggestionIgnored] = useState(false);
  const [aiSeed, setAiSeed] = useState<{ id: number; text: string } | null>(null);
  const [contentMotion, setContentMotion] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsModelOpen, setSettingsModelOpen] = useState(false);
  const [armedId, setArmedId] = useState<string | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectorTriggers = useRef<Partial<Record<AddSelector, HTMLButtonElement | null>>>({});
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const settingsWasOpen = useRef(false);
  const previousMode = useRef(mode);
  const remaining = useMemo(() => activeToday(data.tasks, today).filter(task => task.status !== 'done'), [data.tasks, today]);
  const current = remaining[index % Math.max(remaining.length, 1)];
  const armed = Boolean(current && armedId === current.id);
  const currentOverdue = Boolean(current && (current.dueAt ? new Date(current.dueAt).getTime() : new Date(`${current.plannedDate}T23:59:59`).getTime()) < Date.now());
  const category = current?.categoryId ? data.categories.find(item => item.id === current.categoryId) : null;
  const aiAvailable = data.settings.aiEnabled && !!data.settings.activeModelId;
  const suggestion = !suggestionIgnored && aiAvailable ? insightFor(current, remaining.length, new Date()) : null;
  const showInsight = !aiAvailable || !!suggestion;

  function disarmArm() {
    if (armTimer.current) { clearTimeout(armTimer.current); armTimer.current = null; }
    setArmedId(null);
  }
  function armComplete() {
    if (!current || current.kind !== 'task' || mutating) return;
    setArmedId(current.id);
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setArmedId(null), ARM_RESET_MS);
  }
  function confirmComplete() {
    if (!current || current.kind !== 'task' || mutating) return;
    disarmArm();
    const stamp = current.updatedAt;
    const id = current.id;
    void mutate(async () => api.update(id, { status: 'done' }, stamp));
  }
  useEffect(() => { if (index >= remaining.length) setIndex(0); }, [index, remaining.length]);
  useEffect(() => disarmArm(), [mode]);
  useEffect(() => {
    if (previousMode.current === mode) return;
    const before = previousMode.current; previousMode.current = mode;
    const direction = mode === 'ai' ? 'from-left' : mode === 'add' ? 'from-right' : before === 'ai' ? 'from-right' : 'from-left';
    setContentMotion(direction);
    const timer = setTimeout(() => setContentMotion(''), 340);
    if (mode !== 'add') setSelector(null);
    if (mode !== 'home') setSuggestionOpen(false);
    setSettingsOpen(false);
    setSettingsModelOpen(false);
    return () => clearTimeout(timer);
  }, [mode]);
  useEffect(() => { if (mode === 'add') titleInput.current?.focus({ preventScroll: true }); }, [mode]);
  useEffect(() => {
    if (settingsOpen) { void api.compactHeight(settingsModelOpen ? SETTINGS_PANEL_HEIGHT + SETTINGS_MODEL_EXTRA : SETTINGS_PANEL_HEIGHT); return; }
    if (mode === 'add' && selector) { void api.compactHeight(PANEL_HEIGHT[selector]); return; }
    if (mode !== 'ai') { void api.compactHeight(null); return; }
    // Leaving the settings panel on the AI surface must undo its height bump;
    // otherwise the AI surface manages its own height.
    if (settingsWasOpen.current) void api.compactHeight(null);
  }, [api, mode, selector, settingsOpen, settingsModelOpen]);
  useEffect(() => { settingsWasOpen.current = settingsOpen; }, [settingsOpen]);
  useEffect(() => () => { void api.compactHeight(null); }, [api]);

  function resetAdd() {
    setAddItem(newTask()); setDraft(''); setConfirmed({ datetime: false, priority: false, tag: false }); setSelector(null); setAddError('');
  }
  function closeSelector() {
    const current = selector;
    setSelector(null);
    if (current) requestAnimationFrame(() => selectorTriggers.current[current]?.focus());
  }
  function toggleSelector(next: AddSelector) { setAddError(''); setSettingsOpen(false); setSettingsModelOpen(false); setSelector(current => current === next ? null : next); }
  function toggleSettingsPanel() {
    setSelector(null);
    setSettingsOpen(open => {
      if (open) setSettingsModelOpen(false);
      return !open;
    });
  }
  function closeSettings() {
    setSettingsModelOpen(false);
    setSettingsOpen(false);
    requestAnimationFrame(() => settingsTrigger.current?.focus());
  }
  function startSuggestion(prompt = suggestion?.prompt) {
    if (!prompt) return;
    setAiSeed({ id: Date.now(), text: prompt }); setMode('ai');
  }
  async function createTag(name: string, color: string) {
    let id: string | null = null;
    await mutate(async () => {
      const next = await api.createCategory({ name, color });
      id = next.categories.find(item => item.name === name)?.id ?? null;
      return next;
    });
    return id;
  }
  function submitAdd(event: FormEvent) {
    event.preventDefault();
    const title = addItem.title.trim();
    if (!title || mutating) return;
    if (addItem.kind === 'meeting' && !addItem.dueAt) { setAddError('日程需要设置具体时间'); setSelector('datetime'); return; }
    void mutate(async () => {
      const next = await api.create({ ...addItem, title });
      resetAdd(); setMode('home'); return next;
    });
  }
  function completeCurrent() {
    if (armed) { confirmComplete(); return; }
    armComplete();
  }
  const dueLabel = current ? scheduleStamp(current) : '';
  const titlebar = <>
    <span className="mini-brand-logo" role="img" aria-label="To Do List"><BrandMark /></span>
    <header className="mini-titlebar"><span className="mini-logo-slot" aria-hidden="true" /><span className="mini-app-title">To Do List</span><div className="mini-window-actions">
      <IconButton label={data.settings.alwaysOnTop ? '取消置顶' : '置顶窗口'} aria-pressed={data.settings.alwaysOnTop} onClick={() => void mutate(() => api.window('pin'))}><PushPin size={19} weight={data.settings.alwaysOnTop ? 'fill' : 'regular'} /></IconButton>
      {DOCK_FEATURE_ENABLED ? <IconButton label={data.settings.dockEnabled ? '隐藏悬浮入口' : '显示悬浮入口'} aria-pressed={data.settings.dockEnabled} disabled={mutating} onClick={() => void mutate(() => api.dockEnabled(!data.settings.dockEnabled))}><Circle size={19} weight={data.settings.dockEnabled ? 'fill' : 'regular'} /></IconButton> : null}
      <IconButton ref={settingsTrigger} label="设置" aria-expanded={settingsOpen} onClick={toggleSettingsPanel}><GearSix size={19} /></IconButton>
      <IconButton label="展开主界面" disabled={mutating} onClick={() => expand()}><ArrowsOutLineVertical size={19} /></IconButton>
      <IconButton label="最小化" onClick={() => void mutate(() => api.window('hide'))}><Minus size={20} /></IconButton>
    </div></header>
  </>;

  return <main className={`mini-root${motion === 'expanding' ? ' is-expanding' : motion === 'entering' ? ' is-entering' : ''}`} aria-label="待办小卡片" onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { if (armed) disarmArm(); else if (settingsModelOpen) setSettingsModelOpen(false); else if (settingsOpen) closeSettings(); else if (selector) closeSelector(); else if (mode !== 'home') setMode('home'); } }}>
    <section className="mini-window">
      {titlebar}
      <div className={`mini-content motion-${contentMotion || 'idle'}${mode === 'ai' ? ' is-ai' : ''}`}>
        {mode === 'home' ? suggestionOpen && suggestion ? <>
          <button type="button" className="mini-insight is-open" aria-expanded="true" onClick={() => setSuggestionOpen(false)}><span>AI 建议</span><b>{suggestion.title}</b><small>{suggestion.context}</small><em>收起</em></button>
          <section className="mini-suggestion-preview" aria-label="AI 建议预览"><span><b>生成可确认的处理方案</b><small>AI 会先读取当前事项；写入前仍需你确认。</small></span><div><button type="button" onClick={() => { setSuggestionIgnored(true); setSuggestionOpen(false); }}>忽略</button><button type="button" onClick={() => startSuggestion(`${suggestion.prompt}\n请先和我确认目标，再生成建议。`)}>调整</button><button type="button" className="primary" onClick={() => startSuggestion()}>生成方案</button></div></section>
        </> : <div className={showInsight ? 'mini-home-with-insight' : 'mini-home'}>
          {!aiAvailable ? !!data.settings.endpoint.trim() && !!data.settings.model.trim() ? <button type="button" className="mini-insight" aria-label="AI建议：AI 未启用" disabled={mutating} onClick={() => void mutate(() => api.settings({ aiEnabled: true, autoStart: data.settings.autoStart }))}><span>AI建议：</span><b>AI 未启用</b><em>启用</em></button> : <button type="button" className="mini-insight" aria-label="AI建议：请先配置AI大模型" onClick={() => void api.openSettings(!(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false))}><span>AI建议：</span><b>请先配置AI大模型</b><em>配置</em></button> : suggestion ? <button type="button" className="mini-insight" aria-expanded="false" onClick={() => setSuggestionOpen(true)}><span>AI 建议</span><b>{suggestion.title}</b><small>{suggestion.context}</small><em>查看</em></button> : null}
          <div className="mini-home-main">
            <div className="mini-task-stack" onWheel={event => { if (remaining.length < 2) return; if (armed) disarmArm(); event.preventDefault(); setIndex(value => (value + (event.deltaY > 0 ? 1 : remaining.length - 1)) % remaining.length); }}>
              {remaining.length ? <><button type="button" className="mini-stack-sheet back" aria-label="查看下一项" disabled={remaining.length < 2} onClick={() => { disarmArm(); setIndex(value => (value + 1) % remaining.length); }} /><span className="mini-stack-sheet middle" />
                <article className="mini-task-front">
                  <span className="corner-badges">{current.kind === 'meeting' ? <span className="mini-pill pill-meeting">日程</span> : <span className="mini-pill pill-todo">待办</span>}{currentOverdue ? <span className="mini-pill pill-overdue">已超期</span> : null}</span>
                  <span className={`corner-time${currentOverdue ? ' overdue' : ''}`}><span className="time-label">{stampLabel(current.kind)}</span>{dueLabel}</span>
                  <div className={`front-main${current.kind === 'meeting' ? ' is-meeting' : ''}`}>
                    {current.kind === 'task' ? <button type="button" className={`mini-task-check${armed ? ' armed' : ''}`} aria-label={armed ? `确认完成 ${current.title}` : `完成 ${current.title}`} aria-pressed={armed} disabled={mutating} onClick={completeCurrent}><Check size={12} /></button> : null}
                    <button type="button" className="mini-task-open" title={`展开编辑：${current.title}`} onClick={() => edit(current)}><b>{current.title}</b></button>
                  </div>
                  <div className="front-meta">
                    <span className="meta-cat">{category ? <><i style={{ backgroundColor: category.color }} />{category.name}</> : current.kind === 'meeting' ? '日程安排' : `优先级 · ${priorityName(current.priority)}`}</span>
                    {armed ? <span className="confirm-bar"><button type="button" className="confirm-btn" disabled={mutating} onClick={confirmComplete}><Check size={10} weight="bold" />确认完成</button><button type="button" className="confirm-cancel" disabled={mutating} onClick={disarmArm}>取消</button></span> : <div className="mini-deck-pager"><span>{index + 1} / {remaining.length}</span><button type="button" aria-label="上一项" disabled={remaining.length < 2} onClick={() => { disarmArm(); setIndex(value => (value + remaining.length - 1) % remaining.length); }}><CaretDown size={10} className="is-up" /></button><button type="button" aria-label="下一项" disabled={remaining.length < 2} onClick={() => { disarmArm(); setIndex(value => (value + 1) % remaining.length); }}><CaretDown size={10} /></button></div>}
                  </div>
                </article></> : <article className="mini-task-front is-empty"><span><Plus size={18} /></span><button type="button" onClick={() => setMode('add')}><b>今天还没有安排</b><small>新增一项待办或日程</small></button></article>}
            </div>
            <nav className="mini-quick-actions" aria-label="快捷操作"><button type="button" onClick={() => setMode('add')}><Plus size={18} /><span>新增事项</span></button><button type="button" onClick={() => setMode('ai')}><Sparkle size={18} /><span>AI 助手</span></button></nav>
          </div>
        </div> : mode === 'add' ? <form className="mini-add-panel" noValidate onSubmit={submitAdd}>
          <header className="mini-panel-head"><Plus size={17} /><b>新增事项</b><Segmented aria-label="新增类型" value={addItem.kind} onChange={value => setAddItem(item => value === 'meeting' ? { ...item, kind: 'meeting', dueAt: item.dueAt ?? toInstant(item.plannedDate, nextHalfHour()) } : { ...item, kind: 'task' })} options={[{ value: 'task', label: '待办' }, { value: 'meeting', label: '日程' }]} /><button type="button" className="mini-back" onClick={() => { setSelector(null); setMode('home'); }}>返回</button></header>
          <div className="mini-inline-form"><input ref={titleInput} aria-label="事项标题" maxLength={200} value={addItem.title} onChange={event => { setAddItem(value => ({ ...value, title: event.target.value })); setDraft(event.target.value); setAddError(''); }} placeholder={addItem.kind === 'meeting' ? '输入日程名称' : '输入待办标题'} onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault(); }} /><button type="submit" disabled={!addItem.title.trim() || mutating}>{mutating ? '创建中…' : '创建'}</button></div>
          <div className="mini-add-tools" role="group" aria-label="事项设置">
            <button ref={element => { selectorTriggers.current.datetime = element; }} type="button" className={`${selector === 'datetime' ? 'is-open ' : ''}${confirmed.datetime ? 'is-configured' : ''}`} aria-label={`时间安排：${addItem.plannedDate}${addItem.dueAt ? ` ${localTime(addItem.dueAt)}` : ' 不设时间'}`} aria-expanded={selector === 'datetime'} onClick={() => toggleSelector('datetime')}><CalendarBlank size={14} /></button>
            {addItem.kind === 'task' ? <button ref={element => { selectorTriggers.current.priority = element; }} type="button" className={`${selector === 'priority' ? 'is-open ' : ''}${confirmed.priority ? ` is-configured priority-${addItem.priority}` : ''}`} aria-label={`优先级：${priorityName(addItem.priority)}`} aria-expanded={selector === 'priority'} onClick={() => toggleSelector('priority')}><Flag size={14} weight={confirmed.priority ? 'fill' : 'regular'} /></button> : null}
            <button ref={element => { selectorTriggers.current.tag = element; }} type="button" className={`${selector === 'tag' ? 'is-open ' : ''}${confirmed.tag && addItem.categoryId ? 'is-configured' : ''}`} style={confirmed.tag && addItem.categoryId ? { '--tool-color': data.categories.find(item => item.id === addItem.categoryId)?.color } as CSSProperties : undefined} aria-label={`标签：${data.categories.find(item => item.id === addItem.categoryId)?.name ?? '无标签'}`} aria-expanded={selector === 'tag'} onClick={() => toggleSelector('tag')}><Tag size={14} weight={confirmed.tag && addItem.categoryId ? 'fill' : 'regular'} /></button>
            <button ref={element => { selectorTriggers.current.more = element; }} type="button" className={`${selector === 'more' ? 'is-open ' : ''}${addItem.progress !== null || addItem.note ? 'is-configured' : ''}`} aria-label={`更多设置：${addItem.progress !== null ? `进度 ${addItem.progress}%` : addItem.note ? '已有备注' : '未设置'}`} aria-expanded={selector === 'more'} onClick={() => toggleSelector('more')}><DotsThree size={15} /></button>
            {addError ? <span className="mini-add-error" role="alert">{addError}</span> : null}
          </div>
        </form> : <AssistantApp compact back={() => setMode('home')} expand={() => expand(true)} initialPrompt={aiSeed} consumedPrompt={() => setAiSeed(null)} />}
      </div>
      {error ? <div className="mini-error" role="alert"><span>{error}</span><IconButton label="关闭提示" onClick={clearError}><X size={13} /></IconButton></div> : null}
    </section>
    {mode === 'add' && selector === 'datetime' ? <DateTimePanel key={`datetime-${addItem.plannedDate}-${addItem.dueAt ?? ''}-${addItem.remindAt ?? ''}`} value={addItem} today={today} close={closeSelector} confirm={value => { setAddItem(item => ({ ...item, ...value })); setConfirmed(state => ({ ...state, datetime: true })); closeSelector(); }} /> : null}
    {mode === 'add' && selector === 'priority' ? <PriorityPanel value={addItem.priority} close={closeSelector} confirm={value => { setAddItem(item => ({ ...item, priority: value })); setConfirmed(state => ({ ...state, priority: true })); closeSelector(); }} /> : null}
    {mode === 'add' && selector === 'tag' ? <TagPanel value={addItem.categoryId} categories={data.categories} close={closeSelector} create={createTag} confirm={value => { setAddItem(item => ({ ...item, categoryId: value })); setConfirmed(state => ({ ...state, tag: true })); closeSelector(); }} /> : null}
    {mode === 'add' && selector === 'more' ? <MorePanel value={addItem} close={closeSelector} confirm={value => { setAddItem(item => ({ ...item, ...value })); closeSelector(); }} /> : null}
    {settingsOpen ? <SettingsQuickPanel data={data} api={api} mutating={mutating} mutate={mutate} close={closeSettings} modelOpen={settingsModelOpen} setModelOpen={setSettingsModelOpen} /> : null}
  </main>;
}
