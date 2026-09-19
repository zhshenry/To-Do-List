import { useEffect, useRef } from 'react';
import { ArrowClockwise, ArrowRight, ListChecks, Sparkle } from '@phosphor-icons/react';
import type { AIAction, AIPlan, AIProposalSelection, Category, ChatEntry, Task } from '../shared/contracts';
import { dateTimeText } from './ui';
import { StandaloneAIConversation } from './StandaloneAIConversation';

export type ConversationEntry = ChatEntry;

const proposalTaskLabels: Record<string, string> = {
  title: '标题', kind: '类型', status: '状态', priority: '优先级', plannedDate: '计划日期',
  dueAt: '时间', remindAt: '提醒', categoryId: '标签', progress: '进度', note: '备注'
};
const proposalTaskWords: Record<string, string> = {
  task: '待办', meeting: '日程', todo: '待办', doing: '进行中', done: '已完成', low: '低', medium: '中', high: '高'
};
const proposalCreateFields = ['kind', 'status', 'priority', 'plannedDate', 'categoryId', 'dueAt', 'remindAt', 'progress', 'note'] as const;

function proposalTaskValue(key: string, value: unknown, categories: Category[], proposedNames: Map<string, string>): string {
  if (key === 'categoryId') return value ? categories.find(category => category.id === value)?.name ?? proposedNames.get(String(value)) ?? '无标签' : '无标签';
  if (key === 'dueAt' || key === 'remindAt') return dateTimeText(value ? String(value) : null);
  if (key === 'progress') return value === null || value === undefined ? '未维护' : `${value}%`;
  if (key === 'note') return value ? String(value) : '无备注';
  if (value === null || value === undefined || value === '') return '未设置';
  return ['kind', 'status', 'priority'].includes(key) ? proposalTaskWords[String(value)] ?? String(value) : String(value);
}

export interface AIConversationProps {
  compact?: boolean;
  entries: ConversationEntry[];
  pendingText: string;
  busy: boolean;
  error: string;
  actionError: string;
  tasks: Task[];
  categories: Category[];
  aiEnabled: boolean;
  configured: boolean;
  mutating: boolean;
  retry: (() => void) | null;
  openSettings(): void;
  enable(): void;
  apply(entry: ConversationEntry, items?: AIProposalSelection[]): void;
  discard(entry: ConversationEntry): void;
  adjust(entry: ConversationEntry, index: number): void;
  updateAction(entry: ConversationEntry, index: number, action: AIAction): Promise<void>;
}

export function AIConversation(props: AIConversationProps) {
  if (!props.compact) return <StandaloneAIConversation {...props} />;
  return <CompactAIConversation {...props} compact />;
}

function CompactAIConversation({ entries, pendingText, busy, error, actionError, tasks, categories, aiEnabled, configured, mutating, retry, openSettings, enable, apply, discard, compact = true }: AIConversationProps) {
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (compact && entries.some(entry => entry.actionState === 'pending')) scroll.current?.scrollTo({ top: 0 });
    else if (!compact && entries.some(entry => entry.actionState === 'pending')) scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
    else if (follow.current) scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [entries, pendingText, busy, error, actionError, compact]);

  return <section className={`ai-conversation ${compact ? 'is-compact' : 'is-standalone'}`} aria-label="AI 助手对话" aria-busy={busy}>
    <div className="chat-scroll" ref={scroll} role="log" aria-label="AI 对话" aria-live="polite" aria-relevant="additions text" onScroll={event => {
      const element = event.currentTarget;
      follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    }}>
      {!entries.length && !pendingText ? <div className="chat-empty">
        {!compact ? <span className="chat-empty-avatar" aria-hidden="true"><Sparkle size={28} weight="fill" /></span> : null}
        <b>{aiEnabled ? compact ? '今天，想先做哪一件？' : '可以连续聊一件事' : !configured ? compact ? '先配置模型服务' : '请先配置 AI 大模型' : '先启用 AI 助手'}</b>
        <p>{aiEnabled ? compact ? '可以问我，也可以让我帮你安排待办。' : '例如：明天下午3点产品评审，提前10分钟提醒。涉及事项或标签的建议会等你确认。' : !configured ? compact ? '在设置中填写模型服务后，才能进行事项对话。' : '在 AI 配置中添加模型服务并启用后，就可以开始对话。' : '模型已就绪，启用后即可开始对话。'}</p>
        {!compact ? <p>对话和工具记录保存在本机，退出后仍可继续。重启后未确认的建议需要重新生成。</p> : null}
        {!aiEnabled ? configured ? <button type="button" onClick={enable}>启用 AI</button> : <button type="button" onClick={openSettings}>打开 AI 设置</button> : null}
      </div> : null}
      <ol className="chat-messages">
        {entries.map(entry => {
          const tools = entry.tools ?? [];
          const completedTools = tools.filter(tool => tool.status === 'complete').length;
          const runningTool = tools.find(tool => tool.status === 'running');
          const failedTools = tools.filter(tool => tool.status === 'error');
          const interruptedTools = tools.filter(tool => tool.status === 'interrupted');
          const issueTool = failedTools[0] ?? interruptedTools[0];
          const workTitle = runningTool?.label ?? (entry.streaming ? '正在生成回复' : issueTool?.label ?? `已完成 ${completedTools} 项处理`);
          const workLabel = runningTool ? 'AI 正在处理' : entry.streaming ? 'AI 正在回复' : failedTools.length ? '处理失败' : interruptedTools.length ? '处理已中断' : 'AI 已完成处理';
          const workCount = runningTool || entry.streaming ? '执行中' : failedTools.length ? `失败 ${failedTools.length} 项` : interruptedTools.length ? `中断 ${interruptedTools.length} 项` : `已完成 ${completedTools} 项`;
          const proposedNames = new Map(entry.proposal?.actions.flatMap(candidate => candidate.type === 'create_category' ? [[candidate.category.id, candidate.category.name] as const] : []) ?? []);
          return <li key={entry.id} className={`chat-message ${entry.role}${entry.proposal?.actions.length ? ' with-proposal' : ''}${entry.streaming ? ' streaming' : ''}`}>
          {!(compact && entry.actionState === 'pending') ? <div className="chat-message-row">
            {entry.role === 'assistant' ? <span className="assistant-avatar" aria-hidden="true"><Sparkle size={15} weight="fill" /></span> : null}
            <div className="chat-bubble">{entry.content ? <p>{entry.content}</p> : entry.streaming ? <span className="typing-indicator" aria-label="AI 正在生成回复"><i /><i /><i /></span> : <p>{entry.content}</p>}</div>
          </div> : null}
          {tools.length ? compact ? <div className="chat-tools" aria-label="工具执行过程">{tools.map(tool => <details key={tool.id}><summary>{tool.label}<span>{tool.status === 'running' ? '执行中' : tool.status === 'complete' ? '已完成' : tool.status === 'error' ? '执行失败' : '已中断'}</span></summary><pre className="chat-tool-output">{tool.output || (tool.status === 'running' ? '正在执行…' : '未返回结果')}</pre></details>)}</div> : <div className={`chat-tools assistant-work-rail${entry.streaming || runningTool ? ' is-active' : ''}${failedTools.length ? ' has-error' : interruptedTools.length ? ' is-interrupted' : ''}`} aria-label="工具执行过程">
            <div className="assistant-work-overview">
              <span className="assistant-work-mark" aria-hidden="true"><Sparkle size={14} weight="fill" /></span>
              <span className="assistant-work-copy"><small>{workLabel}</small><b>{workTitle}</b></span>
              <span className="assistant-work-count">{workCount}</span>
            </div>
            {entry.streaming || runningTool ? <span className="assistant-work-progress" aria-hidden="true"><i /></span> : null}
            <div className="assistant-work-log"><span>处理记录</span>{tools.map(tool => <details key={tool.id}><summary><span>{tool.label}</span><small>{tool.status === 'running' ? '执行中' : tool.status === 'complete' ? '已完成' : tool.status === 'error' ? '执行失败' : '已中断'}</small></summary><pre className="chat-tool-output">{tool.output || (tool.status === 'running' ? '正在执行…' : '未返回结果')}</pre></details>)}</div>
          </div> : null}
          {entry.error ? <p className="chat-entry-error">{entry.error}</p> : null}
          {entry.proposal?.actions.length ? <div className="chat-proposal">
            {!compact ? <div className="chat-proposal-heading"><span aria-hidden="true"><ListChecks size={17} weight="fill" /></span><span><b>建议变更</b><small>我计划为你更新以下 {entry.proposal.actions.length} 项内容</small></span></div> : null}
            {entry.proposal.actions.map((action, index) => {
              if (compact) return <MiniProposal key={index} action={action} tasks={tasks} categories={categories} proposedNames={proposedNames} />;
              if (action.type === 'create_category') {
                return <section className="proposal-action" key={index}>
                  <small>新增标签</small>
                  <h3><span className="task-category"><i style={{ backgroundColor: action.category.color }} />{action.category.name}</span></h3>
                </section>;
              }
              if (action.type === 'update_category') {
                const current = categories.find(category => category.id === action.id);
                const next = current ? { ...current, ...action.patch } : null;
                return <section className="proposal-action" key={index}>
                  <small>修改标签</small>
                  {next && current ? <><h3><span className="task-category"><i style={{ backgroundColor: current.color }} />{current.name}</span></h3><dl className="proposal-detail-list is-diff">{Object.entries(action.patch).map(([key, nextValue]) => {
                    const previousValue = (current as unknown as Record<string, unknown>)[key];
                    return <div key={key}><dt>{key === 'name' ? '名称' : '颜色'}</dt><dd><span>{key === 'color' ? <span className="proposal-color-value"><i style={{ backgroundColor: String(previousValue) }} />{String(previousValue)}</span> : String(previousValue)}</span><ArrowRight size={12} aria-hidden="true" /><strong>{key === 'color' ? <span className="proposal-color-value"><i style={{ backgroundColor: String(nextValue) }} />{String(nextValue)}</span> : String(nextValue)}</strong></dd></div>;
                  })}</dl></> : <p className="error">标签已经变化，请放弃并重新生成建议。</p>}
                </section>;
              }
              if (action.type === 'remove_category') {
                const current = categories.find(category => category.id === action.id);
                return <section className="proposal-action" key={index}>
                  <small>删除标签</small>
                  {current ? <><h3><span className="task-category"><i style={{ backgroundColor: current.color }} />{current.name}</span></h3><p>关联事项会变为无标签。</p></> : <p className="error">标签已经变化，请放弃并重新生成建议。</p>}
                </section>;
              }
              if (action.type === 'remove') {
                const current = tasks.find(task => task.id === action.id);
                return <section className="proposal-action is-danger" key={index}>
                  <small>删除事项</small>
                  {current ? <><h3>{current.title}</h3><p>确认应用后才会删除，删除为软删除。</p></> : <p className="error">事项已经变化，请放弃并重新生成建议。</p>}
                </section>;
              }
              if (action.type === 'create') return <section className="proposal-action" key={index}>
                <small>新增事项</small>
                <h3>{action.task.title}</h3>
                <dl className="proposal-detail-list">{proposalCreateFields.map(key => <div key={key}><dt>{proposalTaskLabels[key]}</dt><dd>{proposalTaskValue(key, action.task[key], categories, proposedNames)}</dd></div>)}</dl>
              </section>;
              const current = tasks.find(task => task.id === action.id);
              const item = current ? { ...current, ...action.patch } : null;
              return <section className="proposal-action" key={index}>
                <small>修改事项</small>
                {item && current ? <><h3>{item.title}</h3><dl className="proposal-detail-list is-diff">{Object.entries(action.patch).map(([key, next]) => <div key={key}><dt>{proposalTaskLabels[key] ?? key}</dt><dd><span>{proposalTaskValue(key, (current as unknown as Record<string, unknown>)[key], categories, proposedNames)}</span><ArrowRight size={12} aria-hidden="true" /><strong>{proposalTaskValue(key, next, categories, proposedNames)}</strong></dd></div>)}</dl></> : <p className="error">事项已经变化，请放弃并重新生成建议。</p>}
              </section>;
            })}
            {entry.actionState === 'pending' ? compact ? null : <><p className="chat-proposal-note">确认后才会修改本地事项。</p><div className="chat-proposal-actions"><button type="button" disabled={mutating} onClick={() => discard(entry)}>放弃建议</button><button type="button" className="primary" disabled={mutating} onClick={() => apply(entry)}>{mutating ? '正在应用…' : `应用 ${entry.proposal.actions.length} 项操作`}</button></div></> : <p className={`chat-action-state ${entry.actionState}`}>{entry.actionState === 'applied' ? '已应用到待办。' : entry.actionState === 'expired' ? '建议已过期，未修改事项。请重新生成后确认。' : '已放弃，没有修改事项。'}</p>}
          </div> : null}
        </li>})}
        {pendingText ? <li className="chat-message user pending"><div className="chat-message-row"><div className="chat-bubble"><p>{pendingText}</p></div></div></li> : null}
        {busy && !entries.some(entry => entry.streaming) ? <li className="chat-message assistant generating"><div className="chat-message-row"><span className="assistant-avatar" aria-hidden="true"><Sparkle size={15} weight="fill" /></span><div className="chat-bubble"><span className="typing-indicator" aria-label="AI 正在生成回复"><i /><i /><i /></span></div></div></li> : null}
      </ol>
      {error ? <div className="chat-error" role="alert"><span>{error}</span>{retry ? <button type="button" onClick={retry}><ArrowClockwise size={15} />重试</button> : null}</div> : null}
      {actionError ? <p className="chat-error" role="alert">{actionError}</p> : null}
    </div>
  </section>;
}

function MiniProposal({ action, tasks, categories, proposedNames }: { action: AIPlan['actions'][number]; tasks: Task[]; categories: Category[]; proposedNames: Map<string, string> }) {
  const labels: Record<string, string> = { title: '标题', kind: '类型', status: '状态', priority: '优先级', plannedDate: '计划', dueAt: '时间', remindAt: '提醒', categoryId: '标签', progress: '进度', note: '备注', name: '名称', color: '颜色' };
  const words: Record<string, string> = { task: '待办', meeting: '日程', todo: '待办', doing: '进行中', done: '已完成', low: '低', medium: '中', high: '高' };
  function value(key: string, item: unknown): string {
    if (key === 'categoryId') return categories.find(category => category.id === item)?.name ?? proposedNames.get(String(item)) ?? '无标签';
    if (item === null || item === undefined || item === '') return '未设置';
    if (key === 'dueAt' || key === 'remindAt') return dateTimeText(String(item));
    if (key === 'progress') return `${item}%`;
    return ['kind', 'status', 'priority'].includes(key) ? words[String(item)] ?? String(item) : String(item);
  }
  const current = action.type === 'update' || action.type === 'remove' ? tasks.find(task => task.id === action.id) : action.type === 'update_category' || action.type === 'remove_category' ? categories.find(category => category.id === action.id) : undefined;
  const fields = action.type === 'create' ? action.task : action.type === 'create_category' ? action.category : action.type === 'remove' || action.type === 'remove_category' ? {} : action.patch;
  const title = action.type === 'create' ? action.task.title : action.type === 'create_category' ? action.category.name : current ? 'title' in current ? current.title : current.name : '对象已变化，请重新生成';
  const task = action.type === 'create' ? action.task : action.type === 'update' && current && 'title' in current ? { ...current, ...action.patch } : null;
  if (action.type === 'create' || action.type === 'update') return <section className="proposal-action mini-proposal">
    <h3>{action.type === 'create' ? '新增' : '修改'} · {title}</h3>
    {task ? <><p className="mini-proposal-key">{words[task.kind]} · {task.plannedDate} · {value('dueAt', task.dueAt)}</p><p>提醒：{value('remindAt', task.remindAt)} · 标签：{value('categoryId', task.categoryId)}</p></> : <p>对象已变化，请展开对话并重新生成。</p>}
  </section>;
  return <section className={`proposal-action mini-proposal${action.type === 'remove' ? ' is-danger' : ''}`}>
    <h3>{action.type.startsWith('create') ? '新增' : action.type.startsWith('remove') ? '删除' : '修改'} · {title}</h3>
    {action.type === 'remove_category' ? <p>关联事项改为无标签，保留事项。</p> : action.type === 'remove' ? <p>确认应用后才会删除。</p> : Object.entries(fields).filter(([key]) => key !== 'id').map(([key, next]) => <p key={key}>{labels[key] ?? key}：{current ? <><span className="mini-before">{value(key, (current as unknown as Record<string, unknown>)[key])}</span> → </> : null}{value(key, next)}</p>)}
  </section>;
}
