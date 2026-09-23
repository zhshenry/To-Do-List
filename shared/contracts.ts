import { z } from 'zod';

// Keep the dock implementation and saved preferences available for a future return,
// while excluding the feature from the current shipping runtime and UI.
export const DOCK_FEATURE_ENABLED = false;

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请填写有效的计划日期').refine(value => {
  const d = new Date(`${value}T12:00:00`);
  return Number.isFinite(d.getTime()) && localDay(d) === value;
}, '日期无效');
const instant = z.iso.datetime({ offset: true, error: '请填写有效时间' }).nullable();
export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, '请填写标签名称').max(30, '标签名称最多30字'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '请选择有效的标签颜色'),
}).strict();
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export const categoryPatchSchema = categoryInputSchema.partial().strict();
export interface Category extends CategoryInput { id: string; createdAt: string; updatedAt: string; }
export const taskFields = z.object({
  title: z.string().trim().min(1, '请填写事项名称').max(200, '名称最多200字'),
  kind: z.enum(['task', 'meeting']),
  status: z.enum(['todo', 'doing', 'done']),
  priority: z.enum(['high', 'medium', 'low']),
  plannedDate: day,
  dueAt: instant,
  remindAt: instant,
  categoryId: z.string().uuid().nullable().default(null),
  progress: z.number().int().min(0).max(100).nullable().default(null),
  note: z.string().max(5000, '备注最多5000字'),
}).strict();
export type TaskInput = z.infer<typeof taskFields>;
export interface Task extends TaskInput {
  id: string; createdAt: string; updatedAt: string; completedAt: string | null;
  notifiedFor: string | null; deletedAt: string | null;
}
export const taskInputSchema = taskFields;
// Creation defaults must not turn omitted patch fields into destructive nulls.
export const taskPatchSchema = taskFields.extend({
  categoryId: taskFields.shape.categoryId.removeDefault(),
  progress: taskFields.shape.progress.removeDefault(),
}).partial().strict();
export const aiActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), task: taskFields }).strict(),
  z.object({ type: z.literal('update'), id: z.string().uuid(), patch: taskPatchSchema }).strict(),
  z.object({ type: z.literal('remove'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('create_category'), category: categoryInputSchema.extend({ id: z.string().uuid() }) }).strict(),
  z.object({ type: z.literal('update_category'), id: z.string().uuid(), patch: categoryPatchSchema.refine(patch => Object.keys(patch).length > 0, '请提供要修改的标签字段') }).strict(),
  z.object({ type: z.literal('remove_category'), id: z.string().uuid() }).strict(),
]);
export type AIAction = z.infer<typeof aiActionSchema>;
export const aiPlanSchema = z.object({
  message: z.string().max(6000),
  actions: z.array(aiActionSchema).max(20),
}).strict();
export type AIPlan = z.infer<typeof aiPlanSchema>;
export interface AIProposalSelection { index: number; action: AIAction; }
export const aiConversationTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(6000),
}).strict();
export type AIConversationTurn = z.infer<typeof aiConversationTurnSchema>;
export const aiProtocolSchema = z.enum(['openai-chat', 'openai-responses', 'anthropic']);
export type AIProtocol = z.infer<typeof aiProtocolSchema>;
export const aiProviderKindSchema = z.enum(['openai', 'anthropic', 'deepseek', 'custom']);
export type AIProviderKind = z.infer<typeof aiProviderKindSchema>;
export const AI_PROVIDER_PRESETS: Record<AIProviderKind, { name: string; endpoint: string; protocol: AIProtocol }> = {
  openai: { name: 'OpenAI', endpoint: 'https://api.openai.com/v1', protocol: 'openai-chat' },
  anthropic: { name: 'Anthropic', endpoint: 'https://api.anthropic.com', protocol: 'anthropic' },
  deepseek: { name: 'DeepSeek', endpoint: 'https://api.deepseek.com/v1', protocol: 'openai-chat' },
  custom: { name: '', endpoint: '', protocol: 'openai-chat' },
};
export const rlcdProviderKindSchema = z.enum(['typesafe', 'openrouter', 'custom']);
export type RlcdProviderKind = z.infer<typeof rlcdProviderKindSchema>;
export const RLCD_PROVIDER_PRESETS: Record<RlcdProviderKind, { name: string; endpoint: string; protocol: AIProtocol }> = {
  typesafe: { name: 'TypeSafe', endpoint: 'https://api.typesafe.ai/v1', protocol: 'openai-chat' },
  openrouter: { name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1', protocol: 'openai-chat' },
  custom: { name: '', endpoint: '', protocol: 'openai-chat' },
};
export interface Proposal extends AIPlan { token: string; }
export interface AIToolEvent { id: string; name: string; label: string; status: 'running' | 'complete' | 'error' | 'interrupted'; output: string; question?: string; answer?: string; }
export interface AIAskOption { label: string; description?: string; }
export interface AIAsk { id: string; question: string; options: AIAskOption[]; }
export interface ChatEntry {
  id: string; role: 'user' | 'assistant'; content: string; proposal?: Proposal;
  actionState?: 'pending' | 'applied' | 'discarded' | 'expired' | 'revised'; streaming?: boolean;
  tools?: AIToolEvent[]; error?: string;
}
export interface ChatSession { id: string; title: string; updatedAt: string; entries: ChatEntry[]; draft: string; }
export interface ChatSummary { id: string; title: string; updatedAt: string; }
export interface AIProvider {
  id: string; kind: AIProviderKind; name: string; endpoint: string; protocol: AIProtocol; hasKey: boolean;
}
export interface AIModel {
  id: string; providerId: string; name: string; vision: boolean;
}
export interface RlcdProvider {
  id: string; kind: RlcdProviderKind; name: string; endpoint: string; protocol: AIProtocol; hasKey: boolean;
}
export interface RlcdModel {
  id: string; providerId: string; name: string; vision: boolean;
}
export interface AIProfile {
  id: string; name: string; endpoint: string; model: string; protocol: AIProtocol; hasKey: boolean;
}
export const dockIconPresetSchema = z.enum(['orbit', 'note', 'sprout', 'cat']);
export type DockIconPreset = z.infer<typeof dockIconPresetSchema>;
export const mainWindowWidthSchema = z.enum(['standard', 'narrow']);
export type MainWindowWidth = z.infer<typeof mainWindowWidthSchema>;
export interface Settings {
  providers: AIProvider[]; models: AIModel[]; activeModelId: string;
  rlcdProviders: RlcdProvider[]; rlcdModels: RlcdModel[]; activeRlcdModelId: string;
  profiles: AIProfile[]; activeProfileId: string;
  endpoint: string; model: string; protocol: AIProtocol; hasKey: boolean; aiEnabled: boolean;
  alwaysOnTop: boolean; autoStart: boolean; mainVisible: boolean; mainCollapsed: boolean; mainWindowWidth: MainWindowWidth; dockEnabled: boolean; dockAlwaysOnTop: boolean;
  dockSide: 'left' | 'right'; dockIcon: string; dockIconSource: 'default' | 'custom'; dockIconPreset: DockIconPreset;
}
export interface State { tasks: Task[]; categories: Category[]; settings: Settings; }
export type UpdaterState = 'idle' | 'checking' | 'downloading' | 'ready' | 'latest' | 'error';
export interface UpdaterStatus { active: boolean; version: string; state: UpdaterState; progress: number; readyVersion: string | null; message: string; }
export type AssistantAnchor = { side: 'left' | 'right' | 'top' | 'bottom'; along: number };
export interface DesktopAPI {
  state(): Promise<State>;
  create(task: TaskInput): Promise<State>;
  update(id: string, patch: Partial<TaskInput>, revision: string): Promise<State>;
  remove(id: string, revision: string): Promise<State>;
  restore(id: string): Promise<State>;
  snooze(id: string): Promise<State>;
  createCategory(category: CategoryInput): Promise<State>;
  updateCategory(id: string, category: CategoryInput, revision: string): Promise<State>;
  removeCategory(id: string, revision: string): Promise<State>;
  window(action: 'show' | 'hide' | 'pin' | 'dockPin' | 'collapse' | 'expand', animate?: boolean): Promise<State>;
  windowWidth(width: MainWindowWidth, animate?: boolean): Promise<State>;
  compactHeight(height: number | null): Promise<void>;
  dockEnabled(enabled: boolean): Promise<State>;
  dockHover(open: boolean): Promise<'left' | 'right'>;
  dockMove(point: { x: number; y: number } | null): Promise<void>;
  dockIcon(action: 'choose' | 'useDefault' | 'useCustom', preset?: DockIconPreset): Promise<State>;
  assistant(input: { action: 'toggle' | 'show' | 'hide' | 'status'; source?: 'main' | 'dock' | 'tray'; prompt?: string; animate?: boolean }): Promise<boolean>;
  assistantReady(): Promise<void>;
  openSettings(animate?: boolean): Promise<void>;
  settings(input: { aiEnabled: boolean; autoStart: boolean }): Promise<State>;
  saveProvider(input: { id?: string; kind: AIProviderKind; name: string; endpoint: string; protocol: AIProtocol; apiKey?: string; clearKey?: boolean }): Promise<State>;
  removeProvider(id: string): Promise<State>;
  saveModel(input: { id?: string; providerId: string; name: string }): Promise<State>;
  removeModel(id: string): Promise<State>;
  setModelVision(input: { modelId: string; vision: boolean }): Promise<State>;
  testConnection(input: { providerId?: string; endpoint?: string; protocol?: AIProtocol; apiKey?: string; model: string }): Promise<string>;
  saveRlcdProvider(input: { id?: string; kind: RlcdProviderKind; name: string; endpoint: string; protocol: AIProtocol; apiKey?: string; clearKey?: boolean }): Promise<State>;
  removeRlcdProvider(id: string): Promise<State>;
  saveRlcdModel(input: { id?: string; providerId: string; name: string }): Promise<State>;
  removeRlcdModel(id: string): Promise<State>;
  testRlcdConnection(input: { providerId?: string; endpoint?: string; protocol?: AIProtocol; apiKey?: string; model: string }): Promise<string>;
  activateProfile(id: string): Promise<State>;
  ask(input: { text: string; history: AIConversationTurn[] }): Promise<Proposal>;
  chatList(): Promise<ChatSummary[]>;
  chatOpen(id?: string): Promise<ChatSession>;
  chatNew(): Promise<ChatSession>;
  chatRemove(id: string): Promise<ChatSession>;
  chatDraft(id: string, text: string): Promise<void>;
  chatAsk(input: { sessionId: string; text: string }): Promise<ChatSession>;
  onAIAsk(callback: (ask: AIAsk) => void): () => void;
  answerAsk(input: { id: string; kind: 'option' | 'text' | 'skip'; value?: string }): void;
  onChatUpdate(callback: (session: ChatSession) => void): () => void;
  onChatSelected(callback: (session: ChatSession) => void): () => void;
  updateProposal(input: { token: string; index: number; action: AIAction }): Promise<ChatSession>;
  apply(input: { token: string; items: AIProposalSelection[] }): Promise<State>;
  cancelAI(): Promise<void>;
  onAskDelta(callback: (text: string) => void): () => void;
  review(): Promise<string>;
  exportData(): Promise<string | null>;
  openData(): Promise<void>;
  updaterStatus(): Promise<UpdaterStatus>;
  updaterCheck(): Promise<void>;
  updaterInstall(): Promise<void>;
  openUpdateLog(tag?: string): Promise<void>;
  onUpdater(callback: (status: UpdaterStatus) => void): () => void;
  onChanged(callback: () => void): () => void;
  onAssistantVisibility(callback: (visible: boolean) => void): () => void;
  onAssistantPrompt(callback: (prompt: string) => void): () => void;
  onAssistantAnchor(callback: (anchor: AssistantAnchor) => void): () => void;
  onOpenSettings(callback: () => void): () => void;
}
export function newTask(title = ''): TaskInput {
  return { title, kind: 'task', status: 'todo', priority: 'medium', plannedDate: localDay(), dueAt: null, remindAt: null, categoryId: null, progress: null, note: '' };
}
export function taskTime(task: Task): number { return task.dueAt ? Date.parse(task.dueAt) : Number.MAX_SAFE_INTEGER; }
function visibleToday(task: Task, today: string): boolean {
  if (task.deletedAt) return false;
  if (task.status === 'done') return Boolean(task.completedAt && localDay(new Date(task.completedAt)) === today);
  return task.kind === 'task' || task.plannedDate <= today;
}
export function activeToday(tasks: Task[], today = localDay()): Task[] {
  return tasks.filter(t => visibleToday(t, today))
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || taskTime(a) - taskTime(b) || a.createdAt.localeCompare(b.createdAt));
}
export function openToday(tasks: Task[], today = localDay()): Task[] {
  return activeToday(tasks, today).filter(t => t.status !== 'done');
}
export interface InsightSuggestion { title: string; context: string; prompt: string; }
export function insightTarget(tasks: Task[], now = new Date()): InsightSuggestion | null {
  const due = (t: Task) => (t.dueAt ? Date.parse(t.dueAt) : NaN);
  const soonest = (list: Task[]) => list.filter(t => Number.isFinite(due(t))).sort((a, b) => due(a) - due(b))[0];
  const meeting = soonest(tasks.filter(t => t.kind === 'meeting'));
  if (meeting) {
    const minutes = Math.round((due(meeting) - now.getTime()) / 60000);
    if (minutes >= 0 && minutes <= 60) return {
      title: meeting.title,
      context: `留出会前准备 · ${minutes === 0 ? '即将开始' : `距开始约 ${minutes} 分钟`}`,
      prompt: `请针对即将开始的日程“${meeting.title}”生成简短的会前准备清单；如需新增或修改事项，请只生成等待我确认的建议。`,
    };
  }
  const task = soonest(tasks.filter(t => t.kind === 'task'));
  if (task) {
    const minutes = Math.round((due(task) - now.getTime()) / 60000);
    if (minutes <= 90) return {
      title: task.title,
      context: minutes < 0 ? '重新安排 · 截止时间已过' : `先拆出下一步 · 距截止约 ${minutes} 分钟`,
      prompt: `请帮我处理待办“${task.title}”：先拆出下一步，并根据今天的安排给出可确认的调整建议。`,
    };
  }
  if (tasks.length >= 3) return {
    title: `今日剩余的 ${tasks.length} 项`,
    context: '安排先后顺序',
    prompt: '请读取今天尚未完成的事项，给出简短的执行顺序；如需调整时间，请只生成等待我确认的建议。',
  };
  return null;
}
