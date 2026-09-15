import { useEffect, useRef } from 'react';
import { ArrowClockwise, Sparkle } from '@phosphor-icons/react';
import type { Category, Proposal, Task } from '../shared/contracts';
import { dateTimeText } from './ui';

export type ConversationEntry = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposal?: Proposal;
  actionState?: 'pending' | 'applied' | 'discarded';
};

export function AIConversation({ entries, pendingText, busy, error, actionError, tasks, categories, aiEnabled, mutating, retry, openSettings, apply, discard }: {
  entries: ConversationEntry[];
  pendingText: string;
  busy: boolean;
  error: string;
  actionError: string;
  tasks: Task[];
  categories: Category[];
  aiEnabled: boolean;
  mutating: boolean;
  retry: (() => void) | null;
  openSettings(): void;
  apply(entry: ConversationEntry): void;
  discard(entry: ConversationEntry): void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const categoryById = new Map(categories.map(category => [category.id, category]));
  useEffect(() => {
    if (follow.current) scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [entries, pendingText, busy, error, actionError]);

  return <section className="ai-conversation" aria-label="AI 助手对话">
    <div className="chat-scroll" ref={scroll} role="log" aria-label="AI 对话" aria-live="polite" aria-relevant="additions text" onScroll={event => {
      const element = event.currentTarget;
      follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    }}>
      {!entries.length && !pendingText ? <div className="chat-empty">
        <Sparkle size={28} weight="light" />
        <b>{aiEnabled ? '可以连续聊一件事' : '先启用 AI 助手'}</b>
        <p>{aiEnabled ? '例如：明天下午3点产品评审，提前10分钟提醒。涉及事项的建议会等你确认。' : '在设置中填写模型服务后，才能进行任务对话。'}</p>
        {!aiEnabled ? <button type="button" onClick={openSettings}>打开 AI 设置</button> : null}
      </div> : null}
      <ol className="chat-messages">
        {entries.map(entry => <li key={entry.id} className={`chat-message ${entry.role}${entry.proposal?.actions.length ? ' with-proposal' : ''}`}>
          <div className="chat-message-row">
            {entry.role === 'assistant' ? <span className="assistant-avatar" aria-hidden="true"><Sparkle size={15} weight="fill" /></span> : null}
            <div className="chat-bubble"><p>{entry.content}</p></div>
          </div>
          {entry.proposal?.actions.length ? <div className="chat-proposal">
            {entry.proposal.actions.map((action, index) => {
              const current = action.type === 'update' ? tasks.find(task => task.id === action.id) : undefined;
              const item = action.type === 'create' ? action.task : current ? { ...current, ...action.patch } : null;
              return <section className="proposal-action" key={index}>
                <small>{action.type === 'create' ? '新增事项' : '修改事项'}</small>
                {item ? <><h3>{item.title}</h3><p>计划：{item.plannedDate} · {item.status === 'done' ? '已完成' : item.status === 'doing' ? '进行中' : '待办'}</p><p>分类：{item.categoryId ? categoryById.get(item.categoryId)?.name ?? '未分类' : '未分类'}</p><p>时间：{dateTimeText(item.dueAt ?? null)}</p><p>提醒：{dateTimeText(item.remindAt ?? null)}</p>{item.note ? <p>{item.note}</p> : null}</> : <p className="error">事项已经变化，请放弃并重新生成建议。</p>}
              </section>;
            })}
            {entry.actionState === 'pending' ? <div className="chat-proposal-actions"><button type="button" disabled={mutating} onClick={() => discard(entry)}>放弃建议</button><button type="button" className="primary" disabled={mutating} onClick={() => apply(entry)}>{mutating ? '正在应用…' : `应用 ${entry.proposal.actions.length} 项操作`}</button></div> : <p className={`chat-action-state ${entry.actionState}`}>{entry.actionState === 'applied' ? '已应用到待办。' : '已放弃，没有修改事项。'}</p>}
          </div> : null}
        </li>)}
        {pendingText ? <li className="chat-message user pending"><div className="chat-message-row"><div className="chat-bubble"><p>{pendingText}</p></div></div></li> : null}
        {busy ? <li className="chat-message assistant generating"><div className="chat-message-row"><span className="assistant-avatar" aria-hidden="true"><Sparkle size={15} weight="fill" /></span><div className="chat-bubble"><span className="typing-indicator" aria-label="AI 正在生成回复"><i /><i /><i /></span></div></div></li> : null}
      </ol>
      {error ? <div className="chat-error" role="alert"><span>{error}</span>{retry ? <button type="button" onClick={retry}><ArrowClockwise size={15} />重试</button> : null}</div> : null}
      {actionError ? <p className="chat-error" role="alert">{actionError}</p> : null}
    </div>
  </section>;
}
