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
let askCount = 0;
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
  if (userText !== 'ping') askCount += 1;
  if (userText === 'ping') { event({ role: 'assistant', content: JSON.stringify({ message: '已连接本地测试模型。', actions: [] }) }); event({}, 'stop'); res.end('data: [DONE]\n\n'); return; }
  if (askCount === 1) {
    event({ role: 'assistant', content: JSON.stringify({ message: '好的，收到。', actions: [] }) });
  } else {
    const lines = ['第一，先把周报的数据部分补齐，数据从上周的统计里导出即可。', '第二，周报的文字部分列出三项本周重点：项目进度、风险与下周计划，每项两到三句。', '第三，把周报发给负责人之前，先自查一遍格式与错别字。', '第四，如果时间紧张，可以只保留前两部分，其余放到明天处理。'];
    event({ role: 'assistant', content: JSON.stringify({ message: lines.join('\n\n'), actions: [] }) });
  }
  if (false) {
    console.log('FOCUSED SYSTEM hit（关联注入生效）');
    event({ role: 'assistant', content: JSON.stringify({ message: '已围绕关联事项给出安排。', actions: [] }) });
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

// ── 双问句：短回复 → 长回复，暴露头像沉底错位 ──
await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
await page.locator('.assistant-overlay textarea').last().waitFor();
const ta = page.locator('.assistant-overlay textarea').last();
await ta.fill('今天有什么安排？');
await page.keyboard.press('Enter');
await page.locator('.chat-bubble').nth(1).waitFor();
await page.waitForTimeout(800);
await ta.fill('帮我规划一下怎么写周报，越详细越好，从数据到文字到自查都安排上');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
await page.evaluate(() => { for (const animation of document.getAnimations()) { try { animation.finish(); } catch {} } });
await page.waitForTimeout(300);
const align = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.chat-message.assistant')];
  const last = rows[rows.length - 1];
  const avatar = last?.querySelector('.assistant-avatar');
  const row = last?.querySelector('.chat-message-row');
  return { avatarTop: avatar?.getBoundingClientRect().top ?? null, rowTop: row?.getBoundingClientRect().top ?? null };
});
if (align.avatarTop === null || Math.abs(align.avatarTop - align.rowTop) > 4) throw new Error('avatar not top-aligned with its reply row: ' + JSON.stringify(align));
await page.screenshot({ path: path.join(outputDir, '20-avatar-fixed.png') });

server.close();
console.log('saved 20-avatar-fixed.png（头像与本轮答复顶部对齐，偏差 ≤4px 断言通过）');
await app.close();