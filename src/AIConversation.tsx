import { useEffect, useRef } from 'react';
import { ArrowClockwise, ArrowRight, ListChecks, Sparkle } from '@phosphor-icons/react';
import { newTask, type AIAction, type AIPlan, type AIProposalSelection, type Category, type ChatEntry, type Task } from '../shared/contracts';
import { dateTimeText } from './ui';
import { StandaloneAIConversation } from './StandaloneAIConversation';
import { renderMarkdown } from './markdown';

export type ConversationEntry = ChatEntry;

const proposalTaskLabels: Record<string, string> = {
  title: '标题', kind: '类型', status: '状态', priority: '优先级', plannedDate: '计划日期',
  dueAt: '时间', remindAt: '提醒', categoryId: '标签', progress: '进度', note: '备注'
};
const proposalTaskWords: Record<string, string> = {
  task: '待办', meeting: '日程', todo: '未开始', doing: '进行中', done: '已完成', low: '低', medium: '中', high: '高'
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
function proposalFieldLabel(key: string, kind?: Task['kind']): string {
  if (key === 'plannedDate') return kind === 'meeting' ? '日期' : '完成期限';
  if (key === 'name') return '名称';
  if (key === 'color') return '颜色';
  return proposalTaskLabels[key] ?? key;
}
export type MiniProposalRow = { label: string; from?: string; to: string };
function proposalObjectWord(action: AIAction, current?: Task | Category): string {
  if (action.type === 'create_category' || action.type === 'update_category' || action.type === 'remove_category') return '标签';
  const kind = action.type === 'create' ? action.task.kind : current && 'kind' in current ? current.kind : undefined;
  if (kind === 'meeting') return '日程';
  if (kind === 'task') return '待办';
  return '事项';
}
function proposalVerb(action: AIAction, current?: Task | Category): string {
  const act = action.type.startsWith('create') ? '新增' : action.type.startsWith('remove') ? '删除' : '修改';
  return `${act}${proposalObjectWord(action, current)}`;
}
export function miniProposalView(action: AIAction, tasks: Task[], categories: Category[], proposedNames = new Map<string, string>()): { verb: string; title: string; danger: boolean; missing: boolean; rows: MiniProposalRow[] } {
  const current = action.type === 'update' || action.type === 'remove' ? tasks.find(task => task.id === action.id)
    : action.type === 'update_category' || action.type === 'remove_category' ? categories.find(category => category.id === action.id)
    : undefined;
  const title = action.type === 'create' ? action.task.title
    : action.type === 'create_category' ? action.category.name
    : current ? 'title' in current ? current.title : current.name
    : '对象已变化';
  const verb = proposalVerb(action, current);
  const value = (key: string, item: unknown) => proposalTaskValue(key, item, categories, proposedNames);
  if (action.type === 'remove' || action.type === 'remove_category') {
    return { verb, title, danger: true, missing: !current, rows: current ? [{ label: action.type === 'remove' ? '事项' : '标签', to: action.type === 'remove' ? '确认后软删除' : '关联事项改为无标签' }] : [] };
  }
  if (action.type === 'create') {
    const defaults = newTask();
    const kind = action.task.kind;
    const rows = proposalCreateFields.filter(key => JSON.stringify(action.task[key]) !== JSON.stringify(defaults[key])).map(key => ({ label: proposalFieldLabel(key, kind), to: value(key, action.task[key]) }));
    return { verb, title, danger: false, missing: false, rows };
  }
  if (action.type === 'create_category') {
    return { verb, title, danger: false, missing: false, rows: [{ label: '颜色', to: action.category.color }] };
  }
  if (!current) return { verb, title, danger: false, missing: true, rows: [] };
  if (action.type === 'update') {
    if (!('title' in current)) return { verb, title, danger: false, missing: true, rows: [] };
    const kind = action.patch.kind ?? current.kind;
    const rows = Object.entries(action.patch)
      .filter(([key, next]) => JSON.stringify(next) !== JSON.stringify((current as unknown as Record<string, unknown>)[key]))
      .map(([key, next]) => ({ label: proposalFieldLabel(key, kind), from: value(key, (current as unknown as Record<string, unknown>)[key]), to: value(key, next) }));
    return { verb, title: action.patch.title ?? current.title, danger: false, missing: false, rows };
  }
  const rows = Object.entries(action.patch)
    .filter(([key, next]) => JSON.stringify(next) !== JSON.stringify((current as unknown as Record<string, unknown>)[key]))
    .map(([key, next]) => ({ label: proposalFieldLabel(key), from: value(key, (current as unknown as Record<string, unknown>)[key]), to: value(key, next) }));
  return { verb, title, danger: false, missing: false, rows };
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
            <div className={"chat-bubble" + (entry.role === 'assistant' && entry.content ? ' md' : '')}>{entry.role === 'assistant' && entry.content ? <div className="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.content) }} /> : entry.content ? <p>{entry.content}</p> : entry.streaming ? <span className="typing-indicator" aria-label="AI 正在生成回复"><i /><i /><i /></span> : <p>{entry.content}</p>}</div>
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
  const view = miniProposalView(action, tasks, categories, proposedNames);
  return <section className={`proposal-action mini-proposal${view.danger ? ' is-danger' : ''}`}>
    <h3><span className="mini-proposal-verb">{view.verb}</span><span className="mini-proposal-title">{view.title}</span></h3>
    {view.missing ? <p>对象已变化，请展开对话并重新生成。</p> : view.rows.map(row => <p key={row.label}>{row.label}：{row.from ? <><span className="mini-before">{row.from}</span> → </> : null}<strong>{row.to}</strong></p>)}
  </section>;
}
