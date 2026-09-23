// #21 真机证据：AI 建议（AI 版 / 未配置引导 / 本地兜底）三态。
// launch#1：未配置引导 → UI 建供应商+启用 AI → 种事项 → mock 返回合法 AI JSON → ✦ AI 建议；
// launch#2（同数据目录，mock 改投垃圾 JSON）：生成失败静默回退本地规则 →「建议」。
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const outputDir = path.resolve(process.argv[2]);
mkdirSync(outputDir, { recursive: true });
let dataDir = mkdtempSync(path.join(path.resolve('test-results'), 'capture-'));
const baseEnv = { TODO_TEST: '1', TODO_TEST_DATA: dataDir };

let insightMode = 'ai';
const AI_JSON = '{"taskId":"__TASK__","action":"next-step","context":"距开始约{min}分","prompt":"帮我推进这份周报的第一步"}';
const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  res.setHeader('Content-Type', 'text/event-stream');
  const event = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id: 'chatcmpl-ins', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  const lastUser = [...body.messages].reverse().find(message => message.role === 'user');
  const userText = typeof lastUser?.content === 'string' ? lastUser.content : Array.isArray(lastUser?.content) ? lastUser.content.map(part => part.text ?? '').join('') : '';
  const isInsight = typeof body.messages?.[0]?.content === 'string' && body.messages[0].content.includes('AI 建议');
  if (userText === 'ping') { event({ role: 'assistant', content: JSON.stringify({ message: '已连接本地测试模型。', actions: [] }) }); event({}, 'stop'); res.end('data: [DONE]\n\n'); return; }
  if (isInsight) {
    console.log('INSIGHT REQ mode:', insightMode);
    if (insightMode === 'ai' && globalThis.__taskId) {
      event({ role: 'assistant', content: AI_JSON.replace('__TASK__', globalThis.__taskId) });
    } else if (insightMode === 'garbage') {
      event({ role: 'assistant', content: '这不是 JSON。' });
    } else {
      event({ role: 'assistant', content: AI_JSON.replace('__TASK__', 'missing-id') });
    }
    event({}, 'stop');
    res.end('data: [DONE]\n\n');
    return;
  }
  event({ role: 'assistant', content: JSON.stringify({ message: '已连接本地测试模型。', actions: [] }) });
  event({}, 'stop');
  res.end('data: [DONE]\n\n');
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const port = server.address().port;

const makeApp = async () => {
  const env = { ...process.env, ...baseEnv };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  const app = await electron.launch({ args: [process.cwd()], env, timeout: 30000 });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => console.log('PAGEERROR:', String(error).slice(0, 300)));
  await page.locator('.today-board').waitFor({ timeout: 20000 }).catch(async error => {
    await page.screenshot({ path: path.join(outputDir, 'DEBUG-boot.png') }).catch(() => {});
    console.log('BOOT FAIL:', String(error).slice(0, 200));
    throw error;
  });
  return { app, page };
};
async function poll(page, check, message) { for (let i = 0; i < 100; i++) { if (await check()) return; await page.waitForTimeout(100); } throw new Error(message); }
async function choose(page, label, name) { await page.getByLabel(label, { exact: true }).click(); await page.getByRole('option', { name, exact: true }).click(); }

// ── launch #1：未配置引导态（mini home，AI 未配置）──
{
  const { app, page } = await makeApp();
  await page.evaluate(() => window.desktop.window('collapse'));
  await page.locator('.mini-insight').waitFor();
  await page.waitForTimeout(250);
  const guideText = await page.locator('.mini-insight').innerText();
  if (!guideText.includes('建议') || guideText.includes('AI 建议')) throw new Error(`guide label unexpected: ${guideText}`);
  await page.screenshot({ path: path.join(outputDir, '21-insight-off.png') });
  console.log('guide state ok');
  // ── 配置供应商 + 启用 AI（回到展开态设置流）──
  await page.evaluate(() => window.desktop.window('expand'));
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog', { name: '设置', exact: true }).waitFor();
  await page.waitForTimeout(400);
  await page.getByRole('tab', { name: 'AI配置', exact: true }).click();
  await page.getByRole('button', { name: '添加供应商', exact: true }).click();
  await page.waitForTimeout(400);
  await choose(page, '供应商类型', '自定义');
  await page.getByLabel('供应商名称', { exact: true }).fill('本地测试');
  await page.getByLabel('服务地址', { exact: true }).fill(`http://127.0.0.1:${port}/v1`);
  await choose(page, '服务协议', 'OpenAI Chat Completions');
  await page.getByLabel('模型名称 / ID', { exact: true }).fill('test-model');
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await page.getByRole('button', { name: '模型 test-model 连接成功', exact: true }).waitFor();
  await page.getByRole('button', { name: '添加并使用', exact: true }).click();
  await poll(page, async () => (await page.evaluate(() => window.desktop.state())).settings.models.length === 1, 'provider added');
  await page.getByRole('switch', { name: '启用 AI', exact: true }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  // ── 种今日事项 → changed 触发生成 ──
  const taskId = await page.evaluate(async () => {
    const state = await window.desktop.create({ title: '写周报', kind: 'task', status: 'todo', priority: 'medium', dueAt: new Date(Date.now() + 60 * 60000).toLocaleString('sv-SE').replace(' ', 'T') + '+08:00', plannedDate: new Date().toLocaleDateString('sv-SE'), remindAt: null, categoryId: null, progress: null, note: '' });
    return state.tasks[state.tasks.length - 1].id;
  });
  globalThis.__taskId = taskId;
  await poll(page, async () => (await page.evaluate(() => window.desktop.state())).settings.insight?.source === 'ai', 'AI insight generated');
  const stored = await page.evaluate(() => window.desktop.state().then(state => state.settings.insight));
  if (!stored.prompt.includes('等待我确认')) throw new Error('safety suffix missing');
  await page.evaluate(() => window.desktop.window('collapse'));
  await page.locator('.mini-insight.is-ai').waitFor();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outputDir, '21-insight-ai.png') });
  // 展开预览
  await page.locator('.mini-insight.is-ai').click();
  await page.locator('.mini-suggestion-preview').waitFor();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outputDir, '21-insight-ai-open.png') });
  await app.close();
  console.log('AI state ok');
}

// ── launch #2：全新数据目录 + 垃圾 JSON → 生成失败静默回退本地「建议」──
insightMode = 'garbage';
baseEnv.TODO_TEST_DATA = mkdtempSync(path.join(path.resolve('test-results'), 'capture-'));
{
  const { app, page } = await makeApp();
  // 配置供应商 + 启用 AI（AI 开着但生成必败 → 本地兜底）
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('dialog', { name: '设置', exact: true }).waitFor();
  await page.waitForTimeout(400);
  await page.getByRole('tab', { name: 'AI配置', exact: true }).click();
  await page.getByRole('button', { name: '添加供应商', exact: true }).click();
  await page.waitForTimeout(400);
  await choose(page, '供应商类型', '自定义');
  await page.getByLabel('供应商名称', { exact: true }).fill('本地测试');
  await page.getByLabel('服务地址', { exact: true }).fill(`http://127.0.0.1:${port}/v1`);
  await choose(page, '服务协议', 'OpenAI Chat Completions');
  await page.getByLabel('模型名称 / ID', { exact: true }).fill('test-model');
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await page.getByRole('button', { name: '模型 test-model 连接成功', exact: true }).waitFor();
  await page.getByRole('button', { name: '添加并使用', exact: true }).click();
  await poll(page, async () => (await page.evaluate(() => window.desktop.state())).settings.models.length === 1, 'provider added');
  await page.getByRole('switch', { name: '启用 AI', exact: true }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.evaluate(async () => { await window.desktop.create({ title: '回退验证事项', kind: 'task', status: 'todo', priority: 'medium', dueAt: new Date(Date.now() + 60 * 60000).toLocaleString('sv-SE').replace(' ', 'T') + '+08:00', plannedDate: new Date().toLocaleDateString('sv-SE'), remindAt: null, categoryId: null, progress: null, note: '' }); });
  await page.evaluate(() => window.desktop.window('collapse'));
  await page.locator('.mini-insight').waitFor();
  // 生成失败静默：不落 AI 建议，渲染层回退本地规则（无 ✦ 标签）
  await poll(page, async () => !(await page.locator('.mini-insight').innerText()).includes('✦'), 'fallback local bar');
  await page.evaluate(() => window.desktop.window('collapse'));
  await page.locator('.mini-insight').waitFor();
  const fallbackText = await page.locator('.mini-insight').innerText();
  if (fallbackText.includes('✦ AI 建议')) throw new Error(`fallback should not show AI label: ${fallbackText}`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outputDir, '21-insight-local.png') });
  await app.close();
  console.log('fallback state ok');
}

server.close();
console.log('saved 21-insight-off.png / 21-insight-ai.png / 21-insight-ai-open.png / 21-insight-local.png（三态 + 安全后缀断言通过）');
