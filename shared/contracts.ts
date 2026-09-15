import { z } from 'zod';

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请填写有效的计划日期').refine(value => {
  const d = new Date(`${value}T12:00:00`);
  return Number.isFinite(d.getTime()) && localDay(d) === value;
}, '日期无效');
const instant = z.iso.datetime({ offset: true, error: '请填写有效时间' }).nullable();
export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, '请填写分类名称').max(30, '分类名称最多30字'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, '请选择有效的分类颜色'),
}).strict();
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export interface Category extends CategoryInput { id: string; createdAt: string; updatedAt: string; }
export const taskFields = z.object({
  title: z.string().trim().min(1, '请填写事项名称').max(200, '名称最多200字'),
  kind: z.enum(['task', 'meeting']),
  status: z.enum(['todo', 'doing', 'done']),
  priority: z.enum(['normal', 'high']),
  plannedDate: day,
  dueAt: instant,
  remindAt: instant,
  categoryId: z.string().uuid().nullable().default(null),
  note: z.string().max(5000, '备注最多5000字'),
}).strict();
export type TaskInput = z.infer<typeof taskFields>;
export interface Task extends TaskInput {
  id: string; createdAt: string; updatedAt: string; completedAt: string | null;
  notifiedFor: string | null; deletedAt: string | null;
}
export const taskInputSchema = taskFields;
export const taskPatchSchema = taskFields.partial().strict();
export const aiPlanSchema = z.object({
  message: z.string().max(6000),
  actions: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('create'), task: taskFields }).strict(),
    z.object({ type: z.literal('update'), id: z.string().uuid(), patch: taskPatchSchema }).strict(),
  ])).max(20),
}).strict();
export type AIPlan = z.infer<typeof aiPlanSchema>;
export const aiConversationTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(6000),
}).strict();
export type AIConversationTurn = z.infer<typeof aiConversationTurnSchema>;
export interface Proposal extends AIPlan { token: string; }
export interface Settings {
  endpoint: string; model: string; hasKey: boolean; aiEnabled: boolean;
  alwaysOnTop: boolean; autoStart: boolean; compact: boolean;
}
export interface State { tasks: Task[]; categories: Category[]; settings: Settings; }
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
  window(action: 'compact' | 'expand' | 'hide' | 'pin'): Promise<State>;
  assistant(input: { action: 'toggle' | 'show' | 'hide' | 'status'; prompt?: string }): Promise<boolean>;
  assistantReady(): Promise<void>;
  openSettings(): Promise<void>;
  settings(input: { endpoint: string; model: string; apiKey?: string; clearKey?: boolean; aiEnabled: boolean; autoStart: boolean }): Promise<State>;
  ask(input: { text: string; history: AIConversationTurn[] }): Promise<Proposal>;
  apply(token: string): Promise<State>;
  cancelAI(): Promise<void>;
  review(): Promise<string>;
  exportData(): Promise<string | null>;
  openData(): Promise<void>;
  testNotification(): Promise<void>;
  onChanged(callback: () => void): () => void;
  onAssistantVisibility(callback: (visible: boolean) => void): () => void;
  onAssistantPrompt(callback: (prompt: string) => void): () => void;
  onOpenSettings(callback: () => void): () => void;
}
export function newTask(title = ''): TaskInput {
  return { title, kind: 'task', status: 'todo', priority: 'normal', plannedDate: localDay(), dueAt: null, remindAt: null, categoryId: null, note: '' };
}
export function taskTime(task: Task): number { return task.dueAt ? Date.parse(task.dueAt) : Number.MAX_SAFE_INTEGER; }
export function activeToday(tasks: Task[], today = localDay()): Task[] {
  return tasks.filter(t => !t.deletedAt && (t.status === 'done' ? t.completedAt && localDay(new Date(t.completedAt)) === today : t.plannedDate <= today))
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || taskTime(a) - taskTime(b) || a.createdAt.localeCompare(b.createdAt));
}
