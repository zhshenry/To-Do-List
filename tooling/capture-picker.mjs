// #18 真机证据：关联事项选择器（展开 picker / chip / 气泡引用 / slash / mini 下拉）。
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const outputDir = path.resolve(process.argv[2]);
mkdirSync(outputDir, { recursive: true });
const dataDir = mkdtempSync(path.join(path.resolve('test-results'), 'capture-'));
const env = { ...process.env, TODO_TEST: '1', TODO_TEST_DATA: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;

const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  if (!raw) { res.end(); return; }
  const body = JSON.parse(raw);
  res.setHeader('Content-Type', 'text/event-stream');
  const event = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id: 'chatcmpl-tp', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  const lastUser = [...body.messages].reverse().find(message => message.role === 'user');
  const userText = typeof lastUser?.content === 'string' ? lastUser.content : Array.isArray(lastUser?.content) ? lastUser.content.map(part => part.text ?? '').join('') : '';
  const system = typeof body.messages?.[0]?.content === 'string' ? body.messages[0].content : '';
  if (userText === 'ping') { event({ role: 'assistant', content: JSON.stringify({ message: '已连接本地测试模型。', actions: [] }) }); event({}, 'stop'); res.end('data: [DONE]\n\n'); return; }
  if (system.includes('用户本轮关联事项')) {
    console.log('FOCUSED SYSTEM hit（关联注入生效）');
    event({ role: 'assistant', content: JSON.stringify({ message: '已围绕关联事项给出安排。', actions: [] }) });
  } else {
    event({ role: 'assistant', content: JSON.stringify({ message: '已连接本地测试模型。', actions: [] }) });
  }
  event({}, 'stop');
  res.end('data: [DONE]\n\n');
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const port = server.address().port;

const app = await electron.launch({ args: [process.cwd()], env, timeout: 30000 });
const page = await app.firstWindow();
page.setDefaultTimeout(15000);
await page.locator('.today-board').waitFor();

async function poll(check, message) { for (let i = 0; i < 100; i++) { if (await check()) return; await page.waitForTimeout(100); } throw new Error(message); }
async function choose(label, name) { await page.getByLabel(label, { exact: true }).click(); await page.getByRole('option', { name, exact: true }).click(); }
const due = new Date(Date.now() + 60 * 60000).toLocaleString('sv-SE').replace(' ', 'T') + '+08:00';

// ── 设置流：供应商 + 启用 AI ──
await page.getByRole('button', { name: '设置', exact: true }).click();
await page.getByRole('dialog', { name: '设置', exact: true }).waitFor();
await page.waitForTimeout(400);
await page.getByRole('tab', { name: 'AI配置', exact: true }).click();
await page.getByRole('button', { name: '添加供应商', exact: true }).click();
await page.waitForTimeout(400);
await choose('供应商类型', '自定义');
await page.getByLabel('供应商名称', { exact: true }).fill('本地测试');
await page.getByLabel('服务地址', { exact: true }).fill(`http://127.0.0.1:${port}/v1`);
await choose('服务协议', 'OpenAI Chat Completions');
await page.getByLabel('模型名称 / ID', { exact: true }).fill('test-model');
await page.getByRole('button', { name: '测试连接', exact: true }).click();
await page.getByRole('button', { name: '模型 test-model 连接成功', exact: true }).waitFor();
await page.getByRole('button', { name: '添加并使用', exact: true }).click();
await poll(async () => (await page.evaluate(() => window.desktop.state())).settings.models.length === 1, 'provider added');
await page.getByRole('switch', { name: '启用 AI', exact: true }).click();
await page.getByRole('button', { name: '关闭', exact: true }).click();

// ── 种三件事（今天/明天/无日期）──
const weeklyId = await page.evaluate(async () => {
  const due = new Date(Date.now() + 60 * 60000).toLocaleString('sv-SE').replace(' ', 'T') + '+08:00';
  const state = await window.desktop.create({ title: '写周报', kind: 'task', status: 'todo', priority: 'high', dueAt: due, plannedDate: new Date().toLocaleDateString('sv-SE'), remindAt: null, categoryId: null, progress: null, note: '' });
  return state.tasks[state.tasks.length - 1].id;
});
await page.evaluate(async () => {
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const due = new Date(Date.now() + 26 * 3600 * 1000).toLocaleString('sv-SE').replace(' ', 'T') + '+08:00';
  await window.desktop.create({ title: '牙医预约', kind: 'meeting', status: 'todo', priority: 'medium', dueAt: due, plannedDate: tomorrow.toLocaleDateString('sv-SE'), remindAt: null, categoryId: null, progress: null, note: '' });
  await window.desktop.create({ title: '提交报销单', kind: 'task', status: 'todo', priority: 'low', dueAt: null, plannedDate: new Date().toLocaleDateString('sv-SE'), remindAt: null, categoryId: null, progress: null, note: '' });
});

// ── 展开态：＋ → 根菜单 → 二级面板 → 点选关联 → chip ──
await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
await page.locator('.assistant-overlay textarea').last().waitFor();
await page.getByRole('button', { name: '关联已有事项' }).click();
await page.locator('.plus-root').waitFor();
await page.getByRole('menuitem', { name: /选择事项/ }).click();
await page.locator('.plus-sub').waitFor();
await page.locator('.picker-row', { hasText: '写周报' }).first().waitFor();
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(outputDir, '18-picker-expanded.png') });
await page.locator('.picker-row', { hasText: '写周报' }).first().click();
await page.locator('.linked-chip-row').waitFor();
const chipText = await page.locator('.linked-chip').innerText();
if (!chipText.includes('写周报')) throw new Error(`chip unexpected: ${chipText}`);
await page.screenshot({ path: path.join(outputDir, '18-linked-chip.png') });

// ── 发送 → 关联注入 + 用户气泡引用 chip ──
await page.locator('.assistant-overlay textarea').last().fill('这件事帮我看看怎么安排更合理');
await page.keyboard.press('Enter');
await page.locator('.bubble-ctx').first().waitFor({ timeout: 8000 }).catch(async () => {
    await page.screenshot({ path: path.join(outputDir, 'DEBUG-bubble.png') });
    const dump = await page.evaluate(async () => {
      const session = await window.desktop.chatOpen();
      return session.entries.map(entry => ({ role: entry.role, taskId: entry.taskId ?? null, len: (entry.content || '').length }));
    });
    console.log('BUBBLE DEBUG:', JSON.stringify(dump));
    throw new Error('bubble ctx missing');
  });
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(outputDir, '18-bubble-ref.png') });
const linkedState = await page.evaluate(async () => {
  const session = await window.desktop.chatOpen();
  const user = session.entries.find(entry => entry.role === 'user');
  return { taskId: user?.taskId ?? null };
});
if (linkedState.taskId !== weeklyId) throw new Error(`persisted taskId unexpected: ${JSON.stringify(linkedState)}`);

// ── `/` 快捷：空输入触发 → slash 菜单 ──
const ta = page.locator('.assistant-overlay textarea').last();
await ta.click();
await page.keyboard.type('/');
await page.locator('.slash-menu').waitFor();
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(outputDir, '18-slash.png') });
const slashRows = await page.locator('.slash-menu .picker-row').count();
if (slashRows < 3) throw new Error(`slash rows unexpected: ${slashRows}`);
await page.keyboard.press('Escape');

// ── 折叠态：＋ → 向下弹菜单 → 占位符跟随 ──
await page.evaluate(() => window.desktop.window('collapse'));
await page.locator('.mini-quick-actions').waitFor();
await page.getByRole('button', { name: 'AI 助手' }).click();
await page.locator('.mini-ai-compose textarea').waitFor();
await page.getByRole('button', { name: '关联已有事项' }).click();
await page.locator('.mini-task-picker').waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outputDir, '18-picker-mini.png') });
await page.locator('.mini-task-picker .picker-row', { hasText: '牙医预约' }).click();
await page.locator('.mini-linked-chip').waitFor();
const placeholder = await page.locator('.mini-ai-compose textarea').getAttribute('placeholder');
if (!placeholder?.includes('牙医预约')) throw new Error(`placeholder unexpected: ${placeholder}`);
await page.screenshot({ path: path.join(outputDir, '18-mini-linked.png') });

server.close();
console.log('saved 18-picker-expanded / 18-linked-chip / 18-bubble-ref / 18-slash / 18-picker-mini / 18-mini-linked（taskId 持久化 + 关联注入断言通过）');
await app.close();
