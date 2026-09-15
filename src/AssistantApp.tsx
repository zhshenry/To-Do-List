import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PaperPlaneTilt, Sparkle, X } from '@phosphor-icons/react';
import type { AIConversationTurn, State } from '../shared/contracts';
import { AIConversation, type ConversationEntry } from './AIConversation';
import { IconButton, errorText } from './ui';

export function AssistantApp() {
  const api = window.desktop;
  const [data, setData] = useState<State | null>(null);
  const [loadError, setLoadError] = useState('');
  const [input, setInput] = useState('');
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [pendingText, setPendingText] = useState('');
  const [busy, setBusy] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [failedRequest, setFailedRequest] = useState<{ text: string; history: AIConversationTurn[] } | null>(null);
  const requestSequence = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ready = useRef(false);
  const hasPendingAction = conversation.some(entry => entry.actionState === 'pending');

  useEffect(() => {
    if (!api) return;
    let alive = true;
    const load = async () => { try { const state = await api.state(); if (alive) { setData(state); setLoadError(''); } } catch (cause) { if (alive) setLoadError(errorText(cause)); } };
    void load();
    const off = api.onChanged(() => { void load(); });
    return () => { alive = false; off(); };
  }, [api]);

  useEffect(() => {
    if (!api) return;
    return api.onAssistantPrompt(prompt => {
      setInput(prompt);
      if (data?.settings.aiEnabled && !busy && !hasPendingAction) void askAI(prompt);
      else requestAnimationFrame(() => inputRef.current?.focus());
    });
  }, [api, data, busy, hasPendingAction, conversation]);

  useEffect(() => {
    if (!api || !data || ready.current) return;
    ready.current = true;
    void api.assistantReady();
  }, [api, data]);

  function historyFrom(entries: ConversationEntry[]): AIConversationTurn[] {
    return entries.slice(-12).map(entry => ({ role: entry.role, content: `${entry.content}${entry.proposal?.actions.length ? `\n[建议状态：${entry.actionState === 'applied' ? '用户已应用' : entry.actionState === 'discarded' ? '用户已放弃' : '等待用户确认'}]` : ''}`.slice(0, 6000) }));
  }

  async function askAI(text: string, suppliedHistory?: AIConversationTurn[]) {
    if (!api || busy) return;
    const trimmed = text.trim(); if (!trimmed) return;
    const history = suppliedHistory ?? historyFrom(conversation);
    const request = ++requestSequence.current;
    setBusy(true); setPendingText(trimmed); setError(''); setActionError(''); setFailedRequest(null);
    try {
      const proposal = await api.ask({ text: trimmed, history });
      if (request !== requestSequence.current) return;
      setConversation(entries => [...entries, { id: crypto.randomUUID(), role: 'user', content: trimmed }, { id: crypto.randomUUID(), role: 'assistant', content: proposal.message, proposal, actionState: proposal.actions.length ? 'pending' : undefined }]);
      setInput(current => current.trim() === trimmed ? '' : current);
    } catch (cause) {
      if (request !== requestSequence.current) return;
      setError(errorText(cause)); setFailedRequest({ text: trimmed, history });
    } finally {
      if (request === requestSequence.current) { setBusy(false); setPendingText(''); }
    }
  }

  function cancelRequest() {
    requestSequence.current++; setBusy(false); setPendingText(''); setFailedRequest(null); setError('已取消生成，输入内容已保留。'); void api?.cancelAI(); inputRef.current?.focus();
  }

  function newConversation() {
    requestSequence.current++; setBusy(false); setPendingText(''); setConversation([]); setError(''); setActionError(''); setFailedRequest(null); void api?.cancelAI(); inputRef.current?.focus();
  }

  async function apply(entry: ConversationEntry) {
    if (!api || !entry.proposal || entry.actionState !== 'pending' || mutating) return;
    setMutating(true); setActionError('');
    try {
      setData(await api.apply(entry.proposal.token));
      setConversation(entries => entries.map(item => item.id === entry.id ? { ...item, actionState: 'applied' } : item));
      inputRef.current?.focus();
    } catch (cause) { setActionError(errorText(cause)); }
    finally { setMutating(false); }
  }

  function discard(entry: ConversationEntry) {
    if (entry.actionState !== 'pending' || mutating) return;
    void api?.cancelAI(); setActionError(''); setConversation(entries => entries.map(item => item.id === entry.id ? { ...item, actionState: 'discarded' } : item)); inputRef.current?.focus();
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!api || busy || mutating || hasPendingAction || !input.trim()) return;
    if (!data?.settings.aiEnabled) { await api.openSettings(); return; }
    await askAI(input);
  }

  if (!api) return <main className="standalone-message"><h1>AI 助手</h1><p>请从 To Do List 打开 AI 助手。</p></main>;
  if (!data) return <main className="assistant-widget"><header className="assistant-titlebar"><Sparkle size={20} weight="fill" /><b>AI 助手</b></header><div className="assistant-loading" role={loadError ? 'alert' : 'status'}>{loadError || '正在读取本地待办…'}</div></main>;

  return <main className="assistant-widget">
    <header className="assistant-titlebar">
      <Sparkle className="assistant-title-icon" size={21} weight="fill" aria-hidden="true" />
      <span>AI 助手</span>
      <button type="button" className="assistant-new-chat" disabled={!conversation.length && !pendingText && !error} onClick={newConversation}>新对话</button>
      <IconButton label="关闭 AI 助手" onClick={() => void api.assistant({ action: 'hide' })}><X size={20} /></IconButton>
    </header>
    <AIConversation entries={conversation} pendingText={pendingText} busy={busy} error={error} actionError={actionError} tasks={data.tasks} categories={data.categories} aiEnabled={data.settings.aiEnabled} mutating={mutating} retry={failedRequest ? () => void askAI(failedRequest.text, failedRequest.history) : null} openSettings={() => void api.openSettings()} apply={entry => void apply(entry)} discard={discard} />
    <footer className="assistant-footer">
      <form className="assistant-compose" noValidate onSubmit={send}>
        <Sparkle size={20} weight="fill" aria-hidden="true" />
        <textarea ref={inputRef} autoFocus className="assistant-compose-input resize-none" aria-label="AI 对话输入" value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !(event.nativeEvent.isComposing || event.keyCode === 229)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={hasPendingAction ? '请先处理上方建议…' : '继续和 AI 讨论…'} maxLength={10000} disabled={hasPendingAction} />
        {busy ? <IconButton label="取消 AI 请求" onClick={cancelRequest}><X size={20} /></IconButton> : <button className="send-button" type="submit" aria-label="发送给 AI" disabled={!input.trim() || hasPendingAction || mutating}><PaperPlaneTilt size={20} /></button>}
      </form>
      <div className="assistant-footer-status" role="status">{busy ? 'AI 正在理解…' : hasPendingAction ? '请确认或放弃上方建议' : '对话仅在本次运行中保留'}</div>
    </footer>
  </main>;
}
