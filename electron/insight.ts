// #21 AI 建议真 AI 化：主进程单次补全（不走 Pi 工具循环）。
// 任何失败（非法 JSON / taskId 不存在 / 超长 / 超时 / abort）→ 返回 null，由调用方静默回退本地规则。
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import type { Task } from '../shared/contracts';
import { assistantText } from './ai';

export const aiInsightSchema = z.object({
  taskId: z.string().min(1),
  action: z.enum(['prepare', 'next-step', 'reschedule', 'order', 'focus']),
  context: z.string().trim().min(1).max(16),
  prompt: z.string().trim().min(1).max(80),
});
export type AiInsight = z.infer<typeof aiInsightSchema> & { taskId: string };

export function insightTasksHash(tasks: Task[]): string {
  return tasks
    .map(t => [t.id, t.status, t.dueAt ?? '', t.plannedDate, t.title].join('|'))
    .sort()
    .join('\n');
}

export function parseInsightReply(text: string, allowedTaskIds: Set<string>): AiInsight | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  const result = aiInsightSchema.safeParse(parsed);
  if (!result.success) return null;
  if (!allowedTaskIds.has(result.data.taskId)) return null;
  return result.data;
}

const systemPrompt = [
  '你是待办应用的“AI 建议”引擎。用户会给你今日剩余事项的紧凑清单。',
  '请挑选最值得现在处理的一条，输出严格 JSON（不要多余文字）：',
  '{"taskId":"清单中的 id","action":"prepare|next-step|reschedule|order|focus","context":"短语（含{min}占位）不超过16字符","prompt":"≤80字，给对话助手的处理提问"}',
  'context 会渲染在建议条上，数字用 {min} 占位（如“距开始约 {min} 分钟”）；prompt 用于点击后发起对话。',
].join('\n');

export async function generateInsight(config: { endpoint: string; model: string; protocol: string; key: string }, tasks: Task[], signal: AbortSignal): Promise<AiInsight | null> {
  const allowed = new Set(tasks.map(t => t.id));
  if (!tasks.length) return null;
  const workspace = mkdtempSync(path.join(tmpdir(), 'todolist-insight-'));
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
  try {
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
    const loader = new DefaultResourceLoader({
      cwd: workspace, agentDir: workspace, settingsManager,
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
      systemPromptOverride: () => systemPrompt,
    });
    await loader.reload();
    const modelRuntime = await ModelRuntime.create({
      authPath: path.join(workspace, 'auth.json'), modelsPath: null, modelsStorePath: path.join(workspace, 'models-store.json'),
      allowModelNetwork: false, refreshOnCreate: false, signal,
    });
    modelRuntime.registerProvider('todolist', {
      name: 'To Do List', baseUrl: config.endpoint, api: config.protocol === 'anthropic' ? 'anthropic-messages' : config.protocol === 'openai-responses' ? 'openai-responses' : 'openai-completions', apiKey: config.key || 'local',
      authHeader: config.protocol !== 'anthropic',
      models: [{
        id: config.model, name: config.model, reasoning: false, input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 300,
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
      }],
    });
    await modelRuntime.setRuntimeApiKey('todolist', config.key || 'local');
    const model = modelRuntime.getModel('todolist', config.model);
    if (!model) return null;
    session = (await createAgentSession({
      cwd: workspace, agentDir: workspace, model, thinkingLevel: 'off', modelRuntime, settingsManager, resourceLoader: loader,
      sessionManager: SessionManager.inMemory(workspace), noTools: 'builtin', customTools: [], tools: [],
    })).session;
    if (signal.aborted) return null;
    const list = tasks.map(t => `- id=${t.id} [${t.kind === 'meeting' ? '日程' : '待办'}] ${t.title}${t.dueAt ? `（截止 ${t.dueAt}）` : ''}`).join('\n');
    await session.prompt(`今日剩余事项：\n${list}\n\n请输出 JSON。`);
    const last = [...session.state.messages].reverse().find(message => message.role === 'assistant');
    const text = last ? assistantText(last) : '';
    return parseInsightReply(text, allowed);
  } catch {
    return null;
  } finally {
    try { session?.dispose(); } catch { /* ignore */ }
    rmSync(workspace, { recursive: true, force: true });
  }
}
