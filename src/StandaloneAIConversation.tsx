import { useEffect, useRef } from 'react';
import { ArrowClockwise, CalendarCheck, CaretDown, CheckCircle, FileText, Info, Sparkle } from '@phosphor-icons/react';
import type { AIAction, AIProposalSelection, AIToolEvent, Category, ChatEntry, Task } from '../shared/contracts';
import { AIProposalCards } from './AIProposalCards';
import { renderMarkdown } from './markdown';

export interface StandaloneConversationProps {
  entries: ChatEntry[]; pendingText: string; busy: boolean; error: string; actionError: string;
  tasks: Task[]; categories: Category[]; aiEnabled: boolean; configured: boolean; mutating: boolean; retry: (() => void) | null;
  openSettings(): void; enable(): void; apply(entry: ChatEntry, items?: AIProposalSelection[]): void; discard(entry: ChatEntry): void;
  adjust(entry: ChatEntry, index: number): void; updateAction(entry: ChatEntry, index: number, action: AIAction): Promise<void>;
}

function toolStatus(tool: AIToolEvent): string {
  return tool.status === 'running' ? '进行中' : tool.status === 'complete' ? '完成' : tool.status === 'error' ? '失败' : '已中断';
}
function toolSummary(tool: AIToolEvent): string {
  if (!tool.output) return tool.status === 'running' ? '正在处理…' : '未返回可见结果';
  if (tool.name === 'list_tasks') {
    try {
      const parsed = JSON.parse(tool.output) as { tasks?: unknown[]; categories?: unknown[] };
      return `${parsed.tasks?.length ?? 0} 项事项 · ${parsed.categories?.length ?? 0} 个标签`;
    } catch { /* Show the bounded visible output below. */ }
  }
  return tool.output.replace(/\s+/g, ' ').slice(0, 180);
}
function ActivityDisclosure({ tools, active }: { tools: AIToolEvent[]; active: boolean }) {
  const running = tools.some(tool => tool.status === 'running');
  const failed = tools.some(tool => tool.status === 'error');
  return <details className={`assistant-activity${active || running ? ' is-active' : ''}${failed ? ' has-error' : ''}`} open={active || running || undefined}>
    <summary><span><FileText size={15} /><b>{active || running ? '正在处理' : '查看本轮操作'}</b></span><span>{!active && !running ? <CheckCircle size={16} weight="fill" /> : <i className="assistant-activity-pulse" />}<CaretDown size={13} /></span></summary>
    <div className="assistant-activity-list">{tools.map(tool => <details key={tool.id} className={`assistant-activity-row is-${tool.status}`}>
      <summary><span className="assistant-activity-icon">{tool.name === 'list_tasks' ? <FileText size={16} /> : tool.name.includes('update') ? <CalendarCheck size={16} /> : <Sparkle size={16} weight="fill" />}</span><span><b>{tool.label}</b><small>{toolSummary(tool)}</small></span><em>{toolStatus(tool)}</em><CaretDown size={12} /></summary>
      {tool.output ? <p>{tool.output.slice(0, 1000)}</p> : null}
    </details>)}</div>
    <p className="assistant-activity-note"><Info size={13} />仅展示可见操作和结果，不显示内部思考</p>
  </details>;
}

export function StandaloneAIConversation({ entries, pendingText, busy, error, actionError, tasks, categories, aiEnabled, configured, mutating, retry, openSettings, enable, apply, discard, adjust, updateAction }: StandaloneConversationProps) {
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (follow.current || entries.some(entry => entry.actionState === 'pending')) scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [entries, pendingText, busy, error, actionError]);
  return <section className="ai-conversation is-standalone" aria-label="AI 助手对话" aria-busy={busy}>
    <div className="chat-scroll" ref={scroll} role="log" aria-label="AI 对话" aria-live="polite" aria-relevant="additions text" onScroll={event => {
      const element = event.currentTarget;
      follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
    }}>
      {!entries.length && !pendingText ? <div className="chat-empty">
        <span className="chat-empty-avatar" aria-hidden="true"><Sparkle size={27} weight="fill" /></span>
        <b>{aiEnabled ? '可以连续聊一件事' : !configured ? '请先配置 AI 大模型' : 'AI 未启用'}</b>
        <p>{aiEnabled ? '直接告诉我你想安排、查询或调整什么。需要修改事项时，我会先给出可编辑的建议卡片。' : !configured ? '在 AI 配置中添加模型服务并启用后，就可以开始对话。' : '模型已就绪，启用后即可开始对话，随时可在设置中关闭。'}</p>
        <p>对话和可见操作记录保存在本机。</p>
        {!aiEnabled ? configured ? <button type="button" onClick={enable}>启用 AI</button> : <button type="button" onClick={openSettings}>打开 AI 设置</button> : null}
      </div> : null}
      <ol className="chat-messages">{entries.map((entry, index) => {
        const tools = entry.tools ?? [];
        const previousActions = entry.actionState === 'pending' ? [...entries.slice(0, index)].reverse().find(candidate => candidate.actionState === 'revised' && candidate.proposal?.actions.length)?.proposal?.actions : undefined;
        return <li key={entry.id} className={`chat-message ${entry.role}${entry.streaming ? ' streaming' : ''}`}>
          <div className="chat-message-row">
            {entry.role === 'assistant' ? <span className="assistant-avatar" aria-hidden="true"><Sparkle size={14} weight="fill" /></span> : null}
            <div className="chat-message-column">
              {entry.role === 'assistant' ? <span className="chat-speaker">AI 助手</span> : null}
              <div className={"chat-bubble" + (entry.role === 'assistant' && entry.content ? ' md' : '')}>{entry.role === 'assistant' && entry.content ? <div className="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.content) }} /> : entry.content ? <p>{entry.content}</p> : entry.streaming ? <span className="typing-indicator" aria-label="AI 正在生成回复"><i /><i /><i /></span> : null}
                {entry.role === 'assistant' && tools.length ? <ActivityDisclosure tools={tools} active={Boolean(entry.streaming || tools.some(tool => tool.status === 'running'))} /> : null}
                {entry.error ? <p className="chat-entry-error" role="alert">{entry.error}</p> : null}
                {entry.proposal?.actions.length && entry.actionState && entry.actionState !== 'pending' ? <p className={`chat-action-state ${entry.actionState}`}>{entry.actionState === 'applied' ? '已应用到事项。' : entry.actionState === 'discarded' ? '已放弃，没有修改事项。' : entry.actionState === 'revised' ? '建议已根据后续对话更新。' : '建议已过期，未修改事项。'}</p> : null}
              </div>
            </div>
          </div>
          {entry.proposal?.actions.length && entry.actionState === 'pending' ? <AIProposalCards entry={entry} previousActions={previousActions} tasks={tasks} categories={categories} busy={busy} mutating={mutating} apply={apply} discard={discard} adjust={adjust} updateAction={updateAction} /> : null}
        </li>;
      })}
        {pendingText ? <li className="chat-message user pending"><div className="chat-message-row"><div className="chat-message-column"><div className="chat-bubble"><p>{pendingText}</p></div></div></div></li> : null}
        {busy && !entries.some(entry => entry.streaming) ? <li className="chat-message assistant generating"><div className="chat-message-row"><span className="assistant-avatar" aria-hidden="true"><Sparkle size={14} weight="fill" /></span><div className="chat-message-column"><span className="chat-speaker">AI 助手</span><div className="chat-bubble"><span className="typing-indicator" aria-label="AI 正在生成回复"><i /><i /><i /></span></div></div></div></li> : null}
      </ol>
      {error ? <div className="chat-error" role="alert"><span>{error}</span>{retry ? <button type="button" onClick={retry}><ArrowClockwise size={15} />重试</button> : null}</div> : null}
      {actionError ? <p className="chat-error" role="alert">{actionError}</p> : null}
    </div>
  </section>;
}
