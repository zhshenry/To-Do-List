// #15 真机证据：设置 AI 页 RLCD 配置区 + 视觉开关 + 模型行 22×22 紧凑钮。
// 官方 smoke mock 原样 + 设置 UI 流建 LLM 与 RLCD 供应商。worktree 根目录运行：
// `node tooling/capture-rlcd.mjs <输出目录>`
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
  const body = JSON.parse(raw);
  res.setHeader('Content-Type', 'text/event-stream');
  const event = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id: 'chatcmpl-rlcd', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  event({ role: 'assistant', content: JSON.stringify({ message: '已连接本地测试模型。', actions: [] }) });
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

// ── 设置 UI 流：建 LLM 供应商（custom + test-model）──
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
await poll(async () => (await page.evaluate(() => window.desktop.state())).settings.models.length === 1, 'LLM provider added');

// ── 视觉开关：点亮 test-model ──
const visionButton = page.getByRole('button', { name: /视觉（多模态） test-model/ });
await visionButton.waitFor();
await visionButton.click();
await poll(async () => (await page.evaluate(() => window.desktop.state())).settings.models[0].vision === true, 'vision toggled on');

// ── RLCD 供应商：typesafe + jev-1.13 ──
try {
  await page.getByRole('button', { name: /添加 RLCD 供应商/ }).click();
  await page.waitForTimeout(400);
  await page.getByLabel('服务地址', { exact: true }).isVisible();
  await choose('供应商类型', 'TypeSafe');
  await page.getByLabel('服务地址', { exact: true }).fill(`http://127.0.0.1:${port}/v1`);
  // LLM 卡的添加行仍展开（同名输入框共存），锚定到 RLCD 创建卡（唯一带「取消添加」的 article）
  const rlcdCard = page.getByRole('article').filter({ hasText: '取消添加' });
  await rlcdCard.getByLabel('模型名称 / ID', { exact: true }).fill('jev-1.13');
} catch (error) {
  await page.screenshot({ path: path.join(outputDir, 'DEBUG-rlcd.png') });
  const dump = await page.evaluate(() => ({ cards: [...document.querySelectorAll('.settings-modal .sheet-card')].map(card => card.textContent?.slice(0, 500)), inputs: [...document.querySelectorAll('.settings-modal input')].map(node => node.getAttribute('aria-label') || node.id), addingRows: document.querySelectorAll('.model-create').length }));
  console.log('RLCD DUMP:', JSON.stringify(dump, null, 1));
  throw error;
}
const rlcdCard2 = page.getByRole('article').filter({ hasText: '取消添加' });
await rlcdCard2.getByRole('button', { name: '测试连接', exact: true }).click();
await rlcdCard2.getByRole('button', { name: '模型 jev-1.13 连接成功', exact: true }).waitFor();
await rlcdCard2.getByRole('button', { name: '添加并使用', exact: true }).click();
await poll(async () => (await page.evaluate(() => window.desktop.state())).settings.rlcdModels.length === 1, 'RLCD provider added');

// ── 断言：存储隔离 + vision 持久化 + 按钮尺寸（尺寸阶 --ctl-xs=22）──
const metrics = await page.evaluate(() => {
  const row = document.querySelector('.settings-modal .model-list li');
  const buttons = [...row.querySelectorAll('button')].map(button => { const rect = button.getBoundingClientRect(); return [Math.round(rect.width), Math.round(rect.height)]; });
  const visionActive = row.querySelector('.vision-toggle.is-active') !== null;
  const rlcdHead = [...document.querySelectorAll('.ai-surface-head')].map(node => node.textContent);
  return { buttons, visionActive, rlcdHead };
});
if (!metrics.buttons.every(([w, h]) => w === 22 && h === 22)) throw new Error(`model row buttons must be 22x22, got ${JSON.stringify(metrics.buttons)}`);
if (!metrics.visionActive) throw new Error('vision button should be lit (is-active)');
if (!metrics.rlcdHead.some(text => text.includes('RLCD 模型') && text.includes('决策用 · 实验'))) throw new Error('RLCD card head missing');
const state = await page.evaluate(() => window.desktop.state());
if (state.settings.rlcdProviders.length !== 1 || state.settings.rlcdProviders[0].kind !== 'typesafe') throw new Error('RLCD provider not stored');
if (state.settings.rlcdModels[0].name !== 'jev-1.13' || state.settings.rlcdModels[0].vision !== false) throw new Error('RLCD model not stored (vision default false)');
if (state.settings.models[0].vision !== true) throw new Error('LLM vision must persist');
if (state.settings.endpoint.includes('127.0.0.1') === false) throw new Error('LLM active endpoint must be untouched by RLCD storage');

await page.waitForTimeout(300);
// 两段截图：LLM 卡（视觉开关点亮 + 22×22 行钮）→ RLCD 卡（独立配置区）
await page.getByRole('article').filter({ hasText: '本地测试' }).getByRole('button', { name: /视觉（多模态） test-model/ }).scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(outputDir, '15-settings-llm.png') });
await page.getByRole('article').filter({ hasText: 'jev-1.13' }).scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(outputDir, '15-settings-rlcd.png') });
await app.close();
server.close();
console.log('saved 15-settings-llm.png / 15-settings-rlcd.png（视觉开关 + 22×22 紧凑钮 + RLCD 配置区，存储隔离断言通过）');
