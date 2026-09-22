import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { ArrowClockwise, ArrowsOutSimple, CaretDown, CaretLeft, PaperPlaneTilt, Sparkle, Stop, Trash, X } from '@phosphor-icons/react';
import { createPortal } from 'react-dom';
import type { AIAction, AIProposalSelection, AssistantAnchor, ChatSession, ChatSummary, State } from '../shared/contracts';
import { AIConversation, type ConversationEntry } from './AIConversation';
import { IconButton, Modal, Select, errorText } from './ui';
import './assistant-updates.css';

function HistoryMenu({ sessions, value, disabled, onOpen, onDelete }: {
  sessions: ChatSummary[]; value: string; disabled: boolean; onOpen: (id: string) => void; onDelete: (id: string) => void;
}) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const label = sessions.find(item => item.id === value)?.title ?? '新对话';
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { if (!open) setArmed(null); }, [open]);
  useLayoutEffect(() => {
    const list = menu.current; const button = trigger.current;
    if (!open || !list || !button) return;
    const rect = button.getBoundingClientRect();
    list.style.width = `${Math.min(Math.max(rect.width, 220), window.innerWidth - 16)}px`;
    const height = list.offsetHeight;
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
    let left = rect.left;
    if (left + list.offsetWidth > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - list.offsetWidth);
    list.style.top = `${top}px`; list.style.left = `${left}px`;
  }, [open, sessions, armed]);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const node = event.target as Node;
      if (root.current?.contains(node) || menu.current?.contains(node)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault(); setOpen(false); trigger.current?.focus();
    }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => { document.removeEventListener('pointerdown', onPointerDown); window.removeEventListener('keydown', onKeyDown, true); };
  }, [open]);
  return <div ref={root} className="select assistant-session">
    <button type="button" ref={trigger} className="select-trigger" role="combobox" aria-label="历史对话" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} disabled={disabled} onClick={() => setOpen(current => !current)}>
      <span>{label}</span><CaretDown size={12} weight="bold" />
    </button>
    {open ? createPortal(<div ref={menu} id={listId} className="select-menu history-menu" role="listbox" aria-label="历史对话">
      {sessions.map(item => <div key={item.id} className={`history-row${item.id === value ? ' is-current' : ''}`}>
        <button type="button" role="option" className="history-pick" aria-selected={item.id === value} onClick={() => { setOpen(false); onOpen(item.id); }}>{item.title}</button>
        <button type="button" className={`history-delete${armed === item.id ? ' is-confirm' : ''}`} aria-label={armed === item.id ? `确认删除 ${item.title}` : `删除 ${item.title}`} onClick={() => {
          if (armed !== item.id) { setArmed(item.id); return; }
          setOpen(false); onDelete(item.id);
        }}>{armed === item.id ? '确认' : <Trash size={14} />}</button>
      </div>)}
    </div>, document.body) : null}
  </div>;
}

function AssistantShell({ children }: { children: ReactNode }) {
  const [anchor, setAnchor] = useState<AssistantAnchor>({ side: 'left', along: 0.78 });
  useEffect(() => window.desktop?.onAssistantAnchor(setAnchor), []);
  return <div className="assistant-shell" data-tail={anchor.side} style={{ '--tail-along': `${Math.round(anchor.along * 10000) / 100}%` } as CSSProperties}><span className="assistant-tail" aria-hidden="true" />{children}</div>;
}

export function AssistantApp({ compact = false, embedded = false, closing = false, back, expand, onClose, initialPrompt = null, consumedPrompt }: {
  compact?: boolean; embedded?: boolean; closing?: boolean; back?: () => void; expand?: () => void; onClose?: () => void;
  initialPrompt?: { id: number; text: string } | null; consumedPrompt?: () => void;
} = {}) {
  const api = window.desktop;
  const [data, setData] = useState<State | null>(null);
  const [chat, setChat] = useState<ChatSession | null>(null);
  const [sessions, setSessions] = useState<ChatSummary[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [failedText, setFailedText] = useState('');
  const [confirmNew, setConfirmNew] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [modelOpen, setModelOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [compactComposer, setCompactComposer] = useState(true);
  const selectedId = useRef('');
  const sending = useRef(false);
  const changingChat = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelToggleRef = useRef<HTMLButtonElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const gateButtonRef = useRef<HTMLButtonElement>(null);
  const ready = useRef(false);
  const draftWrites = useRef(0);
  const handledPrompt = useRef<number | null>(null);
  const conversation = chat?.entries ?? [];
  const hasPendingAction = conversation.some(entry => entry.actionState === 'pending');
  const configured = !!data?.settings.endpoint.trim() && !!data?.settings.model.trim();
  const available = !!data?.settings.aiEnabled && configured;

  function selectChat(next: ChatSession) {
    selectedId.current = next.id; setChat(next); setInput(next.draft); setBusy(next.entries.some(entry => entry.streaming)); setError(''); setActionError(''); setFailedText('');
  }
  useEffect(() => {
    if (!api) return;
    let alive = true;
    const load = async () => {
      const expectedId = selectedId.current;
      try {
        const [state, session] = await Promise.all([api.state(), api.chatOpen()]);
        const summaries = await api.chatList();
        if (!alive) return;
        setData(state); setSessions(summaries); setLoadError('');
        if (selectedId.current === expectedId) {
          if (!expectedId || session.id !== expectedId) selectChat(session);
          else { setChat(session); setBusy(session.entries.some(entry => entry.streaming)); }
        }
      } catch (cause) { if (alive) setLoadError(errorText(cause)); }
    };
    void load();
    const offChanged = api.onChanged(() => { void load(); });
    const offChat = api.onChatUpdate(session => { if (session.id === selectedId.current && alive) { setChat(session); setBusy(session.entries.some(entry => entry.streaming)); if (!draftWrites.current) setInput(session.draft); } });
    const offSelected = api.onChatSelected(session => { if (alive) selectChat(session); });
    return () => { alive = false; offChanged(); offChat(); offSelected(); };
  }, [api, loadAttempt]);
  useEffect(() => {
    if (!api || compact) return;
    return api.onAssistantPrompt(prompt => {
      setInput(prompt);
      if (available && !busy && chat) void askAI(prompt);
      else { if (chat) void api.chatDraft(chat.id, prompt); requestAnimationFrame(() => inputRef.current?.focus()); }
    });
  }, [api, available, busy, hasPendingAction, chat, compact]);
  useEffect(() => {
    if (!api || compact || !data || !chat || ready.current) return;
    ready.current = true; void api.assistantReady();
  }, [api, data, chat, compact]);
  useEffect(() => {
    if (!api || !compact) return;
    void api.compactHeight(modelOpen ? 380 : null);
    return () => { if (modelOpen) void api.compactHeight(null); };
  }, [api, compact, modelOpen]);
  useEffect(() => {
    if (!modelOpen) return;
    requestAnimationFrame(() => {
      const target = modelMenuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? modelMenuRef.current?.querySelector<HTMLButtonElement>('button');
      target?.focus({ preventScroll: true });
    });
  }, [modelOpen]);
  useEffect(() => {
    if ((!compact && !embedded) || !initialPrompt || !chat || !data || busy || hasPendingAction || handledPrompt.current === initialPrompt.id) return;
    handledPrompt.current = initialPrompt.id;
    consumedPrompt?.();
    setCompactComposer(false);
    void askAI(initialPrompt.text);
  }, [compact, embedded, initialPrompt, chat, data, busy, hasPendingAction]);

  function saveDraft(text: string) {
    setInput(text);
    if (!api || !chat) return;
    draftWrites.current++;
    void api.chatDraft(chat.id, text).catch(cause => setError(errorText(cause))).finally(() => { draftWrites.current--; });
  }

  async function askAI(text: string) {
    if (!api || !chat || busy || sending.current || !text.trim() || (compact && hasPendingAction)) return;
    if (!available) { gateButtonRef.current?.focus(); return; }
    sending.current = true; setBusy(true); setCompactComposer(false); setModelOpen(false); setLogOpen(false); setError(''); setActionError(''); setFailedText(''); setInput('');
    try { setChat(await api.chatAsk({ sessionId: chat.id, text: text.trim() })); }
    catch (cause) {
      setError(errorText(cause)); setFailedText(text); setInput(current => current || text);
      try { setChat(await api.chatOpen(chat.id)); } catch { /* Keep the last visible transcript when reload fails. */ }
    } finally { sending.current = false; setBusy(false); void api.chatList().then(setSessions); }
  }
  async function newConversation() {
    if (!api || busy || mutating || changingChat.current) return;
    changingChat.current = true; setMutating(true);
    try { selectChat(await api.chatNew()); setSessions(await api.chatList()); setConfirmNew(false); inputRef.current?.focus(); }
    catch (cause) { setError(errorText(cause)); }
    finally { changingChat.current = false; setMutating(false); }
  }
  async function removeConversation(id: string) {
    if (!api || busy || mutating || changingChat.current) return;
    changingChat.current = true; setMutating(true);
    try { selectChat(await api.chatRemove(id)); setSessions(await api.chatList()); }
    catch (cause) { setError(errorText(cause)); }
    finally { changingChat.current = false; setMutating(false); }
  }
  async function apply(entry: ConversationEntry, items?: AIProposalSelection[]) {
    if (!api || !chat || !entry.proposal || entry.actionState !== 'pending' || mutating) return;
    setMutating(true); setActionError('');
    const selected = items ?? entry.proposal.actions.map((action, index) => ({ index, action }));
    try { setData(await api.apply({ token: entry.proposal.token, items: selected })); setChat(await api.chatOpen(chat.id)); inputRef.current?.focus(); }
    catch (cause) { setActionError(errorText(cause)); }
    finally { setMutating(false); }
  }
  async function discard(_entry?: ConversationEntry) {
    if (!api || !chat || mutating) return;
    setMutating(true);
    try { await api.cancelAI(); setChat(await api.chatOpen(chat.id)); setActionError(''); inputRef.current?.focus(); }
    catch (cause) { setActionError(errorText(cause)); }
    finally { setMutating(false); }
  }
  async function updateAction(entry: ConversationEntry, index: number, action: AIAction) {
    if (!api || !entry.proposal || entry.actionState !== 'pending') throw new Error('建议已失效，请重新生成');
    const next = await api.updateProposal({ token: entry.proposal.token, index, action });
    setChat(next);
  }
  function enableAI() {
    if (!api || !data) return;
    void api.settings({ aiEnabled: true, autoStart: data.settings.autoStart }).then(setData).catch(cause => setError(errorText(cause)));
  }
  function adjust(entry: ConversationEntry, index: number) {
    const action = entry.proposal?.actions[index];
    if (!action) return;
    const title = action.type === 'create' ? action.task.title
      : action.type === 'update' ? data?.tasks.find(task => task.id === action.id)?.title ?? '这条事项'
        : action.type === 'create_category' ? action.category.name
          : data?.categories.find(category => category.id === action.id)?.name ?? '这个标签';
    const prompt = `请调整建议“${title}”：`;
    saveDraft(prompt);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(prompt.length, prompt.length);
    });
  }
  async function send(event: FormEvent) { event.preventDefault(); if (!mutating) await askAI(input); }
  function closeModelMenu(restoreFocus = true) {
    setModelOpen(false);
    if (restoreFocus) requestAnimationFrame(() => modelToggleRef.current?.focus());
  }
  function handleModelMenuKeys(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      items[(current + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); closeModelMenu();
    } else if (event.key === 'Tab') {
      setModelOpen(false);
    }
  }

  const status = busy ? '正在回复…' : !data?.settings.aiEnabled ? '未启用' : !configured ? '未配置模型' : hasPendingAction ? '等待确认' : '可用';
  if (!api) return <main className="standalone-message"><h1>AI 助手</h1><p>请从 To Do List 打开 AI 助手。</p></main>;
  const gate = available || !data ? null : configured
    ? { label: 'AI 未启用，启用后即可对话', action: '启用 AI', onAction: enableAI }
    : { label: '请先配置模型服务', action: '打开 AI 设置', onAction: () => void api.openSettings(!(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)) };
  if (compact) {
    const pendingEntry = conversation.find(entry => entry.actionState === 'pending' && entry.proposal?.actions.length);
    const latestAssistant = [...conversation].reverse().find(entry => entry.role === 'assistant');
    const tools = latestAssistant?.tools ?? [];
    const completedTools = tools.filter(tool => tool.status === 'complete').length;
    const currentTool = tools.find(tool => tool.status === 'running') ?? [...tools].reverse().find(tool => tool.status !== 'complete');
    const activeModel = data?.settings.models.find(model => model.id === data.settings.activeModelId);
    const modelLabel = activeModel?.name ?? '选择模型';
    const compactHeader = <div className="mini-ai-context"><span className="mini-ai-mark"><Sparkle size={11} weight="fill" /></span><span><b>AI 助手</b></span><IconButton label="展开 AI 对话" onClick={expand}><ArrowsOutSimple size={12} /></IconButton><button type="button" className="mini-ai-back" onClick={() => { setModelOpen(false); back?.(); }}><CaretLeft size={10} />返回</button></div>;
    const modelControl = data?.settings.models.length ? <button ref={modelToggleRef} type="button" className="mini-ai-model-toggle" aria-label={`切换模型，当前为 ${modelLabel}`} aria-haspopup="menu" aria-expanded={modelOpen} disabled={busy} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setModelOpen(true); } else if (event.key === 'Escape' && modelOpen) { event.preventDefault(); closeModelMenu(); } }} onClick={() => modelOpen ? closeModelMenu() : setModelOpen(true)}><span>{modelLabel}</span><CaretLeft size={9} /></button> : null;
    const modelMenu = modelOpen && data ? createPortal(<div ref={modelMenuRef} className="mini-ai-model-menu" role="menu" aria-label="按供应商选择模型" onKeyDown={handleModelMenuKeys}>
      {data.settings.providers.map(provider => {
        const models = data.settings.models.filter(model => model.providerId === provider.id);
        return models.length ? <section key={provider.id} role="group" aria-label={provider.name}><b>{provider.name}</b>{models.map(model => <button key={model.id} type="button" role="menuitemradio" aria-checked={model.id === data.settings.activeModelId} className={model.id === data.settings.activeModelId ? 'is-active' : ''} onClick={() => { if (model.id !== data.settings.activeModelId) void api.activateProfile(model.id).then(setData).catch(cause => setError(errorText(cause))); closeModelMenu(); }}><span>{model.name}</span><small>{model.id === data.settings.activeModelId ? '✓' : ''}</small></button>)}</section> : null;
      })}
      <button type="button" className="mini-ai-model-manage" onClick={() => { setModelOpen(false); void api.openSettings(!(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)); }}>管理模型…<CaretLeft size={9} /></button>
    </div>, document.body) : null;
    const log = tools.length ? <ol className="mini-ai-log" aria-label="AI 处理记录">{tools.map(tool => <li key={tool.id}><span>{tool.label}</span><small>{tool.status === 'running' ? '执行中' : tool.status === 'complete' ? '已完成' : tool.status === 'error' ? '失败' : '已中断'}</small><i>{tool.status === 'complete' ? '✓' : tool.status === 'running' ? '•' : '!'}</i></li>)}</ol> : <p className="mini-ai-log-empty">本次尚未调用工具</p>;
    if (!data || !chat) return <section className="mini-ai-surface"><div className="mini-ai-loading" role={loadError ? 'alert' : 'status'}>{loadError || '正在读取对话…'}</div></section>;
    if (pendingEntry) return <section className="mini-ai-surface is-result">
      {compactHeader}
      <AIConversation compact entries={[pendingEntry]} pendingText="" busy={false} error={error || loadError} actionError={actionError} tasks={data.tasks} categories={data.categories} aiEnabled={available} configured={configured} mutating={mutating} retry={failedText ? () => void askAI(failedText) : null} openSettings={() => void api.openSettings(!(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false))} enable={enableAI} apply={(entry, items) => void apply(entry, items)} discard={entry => void discard(entry)} adjust={adjust} updateAction={updateAction} />
      <footer className="mini-ai-result-footer"><button type="button" onClick={() => void discard()} disabled={mutating}>放弃建议</button><button type="button" className="primary" onClick={() => void apply(pendingEntry)} disabled={mutating}>{mutating ? '正在应用…' : `应用 ${pendingEntry.proposal!.actions.length} 项`}</button>{modelControl}</footer>{modelMenu}
    </section>;
    if (busy) return <section className="mini-ai-surface is-working" aria-live="polite">
      {compactHeader}
      {logOpen ? log : latestAssistant?.content ? <div className="mini-ai-stream"><span><i />AI 正在回复 <small>流式</small></span><p>{latestAssistant.content}<em /></p></div> : <div className="mini-ai-operation"><span className="mini-ai-spinner" /><span><em>{currentTool ? '工具' : '阶段'}</em><b>{currentTool?.label ?? '正在准备模型上下文'}</b><small>{currentTool?.output || '工具与执行次数由 Agent Loop 实时决定'}</small></span><strong>执行中</strong></div>}
      <footer className="mini-ai-working-footer">{!logOpen && !latestAssistant?.content ? <span className="mini-ai-loop-track" aria-label="执行时间与工具次数不固定"><i /></span> : <span className="mini-ai-progress-note">{logOpen ? '操作记录 · 不含内部推理' : '正在生成可确认方案'}</span>}<small>已完成 {completedTools} 项</small><button type="button" onClick={() => setLogOpen(value => !value)}>{logOpen ? '返回进度' : '处理记录'}</button><IconButton label="取消 AI 请求" onClick={() => void api.cancelAI()}><X size={13} /></IconButton></footer>
    </section>;
    if (!compactComposer && latestAssistant) return <section className="mini-ai-surface is-result">
      {compactHeader}
      {logOpen ? log : <div className="mini-ai-answer"><p><span>AI 回复</span>{latestAssistant.content || latestAssistant.error || '本次处理没有返回文本。'}</p>{latestAssistant.error ? <button type="button" onClick={() => { setCompactComposer(true); setInput(failedText); }}>重试</button> : null}</div>}
      <footer className="mini-ai-result-footer"><button type="button" onClick={() => setLogOpen(value => !value)}>{logOpen ? '返回回答' : `处理记录 · ${tools.length}`}</button><button type="button" onClick={() => { setLogOpen(false); setCompactComposer(true); requestAnimationFrame(() => inputRef.current?.focus()); }}>继续提问</button>{modelControl}</footer>{modelMenu}
    </section>;
    return <section className="mini-ai-surface">
      {compactHeader}
      <form className="mini-ai-compose" onSubmit={send}><textarea ref={inputRef} aria-label="AI 对话输入" rows={1} value={input} maxLength={10000} onChange={event => saveDraft(event.target.value)} placeholder="一句话告诉 AI 你想怎么处理" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !(event.nativeEvent.isComposing || event.keyCode === 229)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button type="submit" aria-label="发送给 AI" disabled={!input.trim() || mutating}><PaperPlaneTilt size={13} /></button></form>
      <div className="mini-ai-quick">{gate ? <><span className="mini-ai-gate-label">{gate.label}</span><button type="button" className="mini-ai-gate-button" ref={gateButtonRef} onClick={gate.onAction}>{gate.action}</button></> : null}{modelControl}</div>{modelMenu}
    </section>;
  }
  const history = chat ? (sessions.some(item => item.id === chat.id) ? sessions : [{ id: chat.id, title: chat.title, updatedAt: chat.updatedAt }, ...sessions]) : [];
  const overlayHead = <header className="assistant-overlay-head">
    {chat ? <HistoryMenu sessions={history} value={chat.id} disabled={busy || mutating} onOpen={id => { if (!busy && !mutating && id !== chat.id) void api.chatOpen(id).then(selectChat).catch(cause => setError(errorText(cause))); }} onDelete={id => void removeConversation(id)} /> : <span className="assistant-overlay-title">AI 助手</span>}
    <button type="button" className="assistant-new-chat" disabled={!chat || busy || mutating || !conversation.length && !input} onClick={() => setConfirmNew(true)}>新对话</button>
    <IconButton label="关闭 AI 助手" onClick={() => onClose?.()}><X size={18} /></IconButton>
  </header>;
  if (embedded && (!data || !chat)) return <section className={`assistant-overlay${closing ? ' is-closing' : ''}`} aria-label="AI 助手">{overlayHead}<div className={`assistant-loading${loadError ? ' is-error' : ''}`} role={loadError ? 'alert' : 'status'}><span>{loadError || '正在准备你的本地工作区…'}</span>{loadError ? <div className="assistant-loading-actions"><button type="button" onClick={() => { setLoadError(''); setLoadAttempt(attempt => attempt + 1); }}><ArrowClockwise size={15} />重试</button><button type="button" onClick={() => onClose?.()}>关闭</button></div> : null}</div></section>;
  if (!data || !chat) return <AssistantShell><main className="assistant-widget"><header className="assistant-titlebar"><span className="assistant-identity"><span className="assistant-header-avatar" aria-hidden="true"><Sparkle size={20} weight="fill" /></span><span className="assistant-identity-text"><b>AI 助手</b><small>{loadError ? '读取失败' : '正在读取本地对话…'}</small></span></span><span className="assistant-header-controls"><IconButton label="关闭 AI 助手" onClick={() => void api.assistant({ action: 'hide', animate: !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) })}><X size={18} /></IconButton></span></header><div className={`assistant-loading${loadError ? ' is-error' : ''}`} role={loadError ? 'alert' : 'status'}><span>{loadError || '正在准备你的本地工作区…'}</span>{loadError ? <div className="assistant-loading-actions"><button type="button" onClick={() => { setLoadError(''); setLoadAttempt(attempt => attempt + 1); }}><ArrowClockwise size={15} />重试</button><button type="button" onClick={() => void api.assistant({ action: 'hide', animate: false })}>关闭</button></div> : null}</div></main></AssistantShell>;
  const conversationBody = <>
    <AIConversation entries={conversation} pendingText="" busy={busy} error={error} actionError={actionError} tasks={data.tasks} categories={data.categories} aiEnabled={available} configured={configured} mutating={mutating} retry={failedText && !busy ? () => void askAI(failedText) : null} openSettings={() => void api.openSettings(!(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false))} enable={enableAI} apply={(entry, items) => void apply(entry, items)} discard={entry => void discard(entry)} adjust={adjust} updateAction={updateAction} />
    {gate && conversation.length ? <div className="ai-gate" role="status"><span>{gate.label}</span><button type="button" ref={gateButtonRef} onClick={gate.onAction}>{gate.action}</button></div> : null}
    <footer className="assistant-footer"><form className="assistant-compose" noValidate onSubmit={send}>
      <span className="assistant-compose-copy">
        <textarea ref={inputRef} autoFocus rows={2} className="assistant-compose-input resize-none" aria-label="AI 对话输入" value={input} onChange={event => saveDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !(event.nativeEvent.isComposing || event.keyCode === 229)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={hasPendingAction ? '继续追问，或告诉我如何调整建议…' : 'Enter 发送 · Shift + Enter 换行'} maxLength={10000} />
      </span>
      <span className="assistant-compose-meta">
        <span className="assistant-compose-options">
          {data.settings.models.length ? <Select className="assistant-model" aria-label="当前模型" disabled={busy} value={data.settings.activeModelId || data.settings.models[0].id} onChange={id => { if (!busy && id !== data.settings.activeModelId) void api.activateProfile(id).then(setData).catch(cause => setError(errorText(cause))); }} options={data.settings.models.map(model => ({ value: model.id, label: model.name }))} /> : null}
        </span>
        {busy ? <button type="button" className="assistant-stop" aria-label="停止并取消 AI 请求" onClick={() => void api.cancelAI()}><Stop size={13} weight="fill" /><span>停止</span></button> : <button className="send-button" type="submit" aria-label="发送给 AI" disabled={!input.trim() || mutating}><PaperPlaneTilt size={16} weight="fill" /></button>}
      </span>
    </form></footer>
    {confirmNew ? <Modal className="assistant-confirm" title="开始新对话？" close={() => setConfirmNew(false)}>
      <div className="confirm-copy">
        <p>当前对话和草稿会留在历史里。</p>
        {hasPendingAction ? <p>未应用的建议会放弃，不会改动事项。</p> : null}
      </div>
      <div className="assistant-confirm-actions">
        <button type="button" disabled={mutating} onClick={() => setConfirmNew(false)}>继续当前对话</button>
        <button type="button" className="primary" disabled={mutating} onClick={() => void newConversation()}>开始新对话</button>
      </div>
    </Modal> : null}
  </>;
  if (embedded) return <section className={`assistant-overlay${closing ? ' is-closing' : ''}`} aria-label="AI 助手">{overlayHead}{conversationBody}</section>;
  return <AssistantShell><main className="assistant-widget">
    <header className="assistant-titlebar">
      <span className="assistant-identity"><span className="assistant-header-avatar" aria-hidden="true"><Sparkle size={20} weight="fill" /><i className={`assistant-online${busy ? ' is-busy' : ''}${!available ? ' is-unavailable' : ''}`} /></span><span className="assistant-identity-text"><b>AI 助手</b><small role="status">{status}</small></span></span>
      <HistoryMenu sessions={sessions.some(item => item.id === chat.id) ? sessions : [{ id: chat.id, title: chat.title, updatedAt: chat.updatedAt }, ...sessions]} value={chat.id} disabled={busy || mutating} onOpen={id => { if (!busy && !mutating && id !== chat.id) void api.chatOpen(id).then(selectChat).catch(cause => setError(errorText(cause))); }} onDelete={id => void removeConversation(id)} />
      <span className="assistant-header-controls">
        <button type="button" className="assistant-new-chat" disabled={busy || mutating || !conversation.length && !input} onClick={() => setConfirmNew(true)}>新对话</button>
        <IconButton label="关闭 AI 助手" onClick={() => void api.assistant({ action: 'hide', animate: !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false) })}><X size={18} /></IconButton>
      </span>
    </header>
    {conversationBody}
  </main></AssistantShell>;
}
