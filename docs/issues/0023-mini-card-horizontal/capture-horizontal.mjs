// #23 真机证据：确认态卡片横排 meta（长标题 + 标签/时间同行 + footer 完整可见无滚动）。
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

let categoryId = '';
const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  if (!raw) { res.end(); return; }
  const body = JSON.parse(raw);
  res.setHeader('Content-Type', 'text/event-stream');
  const event = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id: 'chatcmpl-hz', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  const lastUser = [...body.messages].reverse().find(message => message.role === 'user');
  const userText = typeof lastUser?.content === 'string' ? lastUser.content : Array.isArray(lastUser?.content) ? lastUser.content.map(part => part.text ?? '').join('') : '';
  if (userText === 'ping') { event({ role: 'assistant', content: JSON.stringify({ message: '已连接本地测试模型。', actions: [] }) }); event({}, 'stop'); res.end('data: [DONE]\n\n'); return; }
  const proposal = {
    message: '好的，已生成创建建议，请确认。',
    actions: [{ type: 'create', task: { title: '完成个人工作台初版建设并发布版', kind: 'task', status: 'todo', priority: 'medium', plannedDate: new Date().toLocaleDateString('sv-SE'), dueAt: new Date(Date.now() + 60 * 60000).toLocaleString('sv-SE').replace(' ', 'T') + '+08:00', remindAt: null, categoryId, progress: null, note: '' } }],
  };
  event({ role: 'assistant', content: JSON.stringify(proposal) });
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

// ── 设置流：供应商 + 启用 AI + 种标签 ──
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
categoryId = await page.evaluate(async () => {
  const state = await window.desktop.createCategory({ name: '个人开发', color: '#8a5fb0' });
  return state.categories[state.categories.length - 1].id;
});

// ── 折叠态：AI 面板提问 → 长标题确认卡 → 横排 meta + footer 完整 ──
await page.evaluate(() => window.desktop.window('collapse'));
await page.locator('.mini-quick-actions').waitFor();
await page.getByRole('button', { name: 'AI 助手' }).click();
await page.locator('.mini-ai-compose textarea').waitFor();
await page.locator('.mini-ai-compose textarea').fill('帮我建一个工作台初版的任务');
await page.locator('.mini-ai-compose button[type="submit"]').click();
await page.locator('.mini-proposal-meta').waitFor();
await page.waitForTimeout(400);
// 数值验收：meta 单行（高度 ≈15px±3）+ footer 完整可见（底部差值 = 0 滚动）
const metrics = await page.evaluate(() => {
  const meta = document.querySelector('.mini-proposal-meta');
  const foot = document.querySelector('.mini-ai-result-footer');
  return { metaH: meta?.getBoundingClientRect().height ?? null, footBottom: foot ? Math.round(foot.getBoundingClientRect().bottom) : null, innerH: window.innerHeight, scrollH: document.querySelector('.mini-content')?.scrollHeight ?? null, clientH: document.querySelector('.mini-content')?.clientHeight ?? null };
});
if (metrics.metaH === null || metrics.metaH > 18) throw new Error(`meta row height unexpected: ${metrics.metaH}`);
if (metrics.scrollH > metrics.clientH) throw new Error(`vertical overflow: scroll ${metrics.scrollH} > client ${metrics.clientH}`);
await page.screenshot({ path: path.join(outputDir, '23-horizontal-meta.png') });

server.close();
console.log('saved 23-horizontal-meta.png（横排 meta 单行 + footer 完整 + 无纵向溢出，断言通过）');
await app.close();
