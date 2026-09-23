// #19 真机证据：ask_user 三面（展开提问卡 / 回答收敛 / 折叠提问视图）。
// 官方 smoke mock 原样 + 设置 UI 流建供应商。worktree 根目录运行：
// `node tooling/capture-ask.mjs <输出目录>`
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

let cycles = 0;
const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const hasToolResult = body.messages.some(message => message.role === 'tool');
  const lastUser = [...body.messages].reverse().find(message => message.role === 'user');
  const userText = typeof lastUser?.content === 'string' ? lastUser.content : Array.isArray(lastUser?.content) ? lastUser.content.map(part => part.text ?? '').join('') : '';
  res.setHeader('Content-Type', 'text/event-stream');
  const event = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id: 'chatcmpl-ask', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  if (userText === 'ping') { event({ role: 'assistant', content: JSON.stringify({ message: '已连接本地测试模型。', actions: [] }) }); event({}, 'stop'); res.end('data: [DONE]\n\n'); return; }
  console.log('MOCK REQ hasTool:', hasToolResult, '| cycles now:', cycles + (hasToolResult ? 0 : 1));
  if (!hasToolResult) {
    cycles++;
    const args = cycles === 1
      ? '{"question":"周报今天发还是明天发？","options":[{"label":"今天发","description":"下班前发出"},{"label":"明天发","description":"留出缓冲时间"}]}'
      : '{"question":"周报发给谁？","options":[{"label":"发我本人"},{"label":"发团队邮箱","description":"抄送全组"}]}';
    event({ role: 'assistant', tool_calls: [{ index: 0, id: `call-ask-${cycles}`, type: 'function', function: { name: 'ask_user', arguments: args } }] });
    event({}, 'tool_calls');
  } else {
    event({ role: 'assistant', content: JSON.stringify({ message: '好的，已按你的选择处理周报安排。', actions: [] }) });
    event({}, 'stop');
  }
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

// ── 设置：UI 流建供应商并启用 AI ──
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

// ── 展开态：提问 → 提问卡 → 选项回答 → 收敛 ──
await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
await page.locator('.assistant-overlay textarea, .assistant-compose textarea').last().fill('帮我安排周报');
await page.keyboard.press('Enter');
await page.locator('.ask-card').waitFor({ timeout: 8000 }).catch(async () => {
    await page.screenshot({ path: path.join(outputDir, 'DEBUG-ask.png') });
    const dump = await page.evaluate(async () => ({ surface: document.querySelector('.assistant-overlay')?.className ?? null, bubbles: [...document.querySelectorAll('.chat-bubble')].map(node => node.textContent?.slice(0, 60)), tools: document.querySelector('.mini-ai-log')?.textContent?.slice(0, 80) ?? null, tools: await window.desktop.chatOpen().then(session => session.entries.flatMap(entry => entry.tools ?? []).map(tool => ({ name: tool.name, status: tool.status, output: tool.output?.slice(0, 400) }))) }));
    console.log('ASK DEBUG:', JSON.stringify(dump, null, 1));
    throw new Error('ask card missing');
  });
await page.locator('.ask-card .ask-options button', { hasText: '明天发' }).waitFor();
await page.evaluate(() => { for (const animation of document.getAnimations()) { try { animation.finish(); } catch { /* ignore */ } } });
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(outputDir, '19-ask-expanded.png') });
await page.locator('.ask-card .ask-options button', { hasText: '明天发' }).click();
await page.locator('.ask-converged').waitFor();
await page.locator('.chat-bubble').last().waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(outputDir, '19-ask-answered.png') });
const converged = await page.locator('.ask-converged').innerText();
if (!converged.includes('周报今天发还是明天发') || !converged.includes('明天发')) throw new Error(`converged pill unexpected: ${converged}`);
const sessionAfterOverlay = await page.evaluate(async () => {
  const session = await window.desktop.chatOpen();
  const tool = session.entries.flatMap(entry => entry.tools ?? []).find(item => item.name === 'ask_user');
  return { question: tool?.question ?? null, answer: tool?.answer ?? null };
});
if (sessionAfterOverlay.question !== '周报今天发还是明天发？' || !sessionAfterOverlay.answer?.includes('明天发')) throw new Error(`persistence unexpected: ${JSON.stringify(sessionAfterOverlay)}`);

// ── 折叠态：mini 内再次提问 → is-asking 视图 → 选项回答 ──
await page.evaluate(() => window.desktop.window('collapse'));
await page.locator('.mini-quick-actions').waitFor();
await page.getByRole('button', { name: 'AI 助手' }).click();
await page.locator('.mini-ai-compose textarea').waitFor();
await page.locator('.mini-ai-compose textarea').fill('再问一次');
await page.evaluate(() => { window.__asks = []; window.desktop.onAIAsk(ask => window.__asks.push(ask)); });
await page.locator('.mini-ai-compose button[type="submit"]').click();
await page.locator('.mini-ai-surface.is-asking').waitFor({ timeout: 8000 }).catch(async () => {
  await page.screenshot({ path: path.join(outputDir, 'DEBUG-mini-ask.png') });
  const windowDump = await Promise.all(app.windows().map(async (candidate, index) => ({
    index,
    url: candidate.url(),
    mini: await candidate.evaluate(() => !!document.querySelector('.mini-ai-surface')).catch(() => 'err'),
    asks: await candidate.evaluate(() => (window.__asks ?? 'none').length ?? 'none').catch(() => 'err'),
  })));
  console.log('WINDOWS:', JSON.stringify(windowDump));
  const dump = await page.evaluate(() => ({ surfaces: [...document.querySelectorAll('.mini-ai-surface')].map(node => node.className), windowAsks: window.__asks ?? 'no-probe', overlayInDom: !!document.querySelector('.assistant-overlay'), hasSupport: CSS.supports('selector(:has(*))'), innerH: window.innerHeight, miniWindowH: document.querySelector('.mini-window')?.getBoundingClientRect().height ?? null, rootH: document.querySelector('.mini-root')?.getBoundingClientRect().height ?? null, askingH: document.querySelector('.mini-ai-surface.is-asking')?.getBoundingClientRect().height ?? null, winClass: document.querySelector('.mini-window')?.className ?? null }));
  console.log('MINI ASK DEBUG:', JSON.stringify(dump, null, 1));
  throw new Error('mini is-asking missing');
});
await page.waitForTimeout(700);
await page.screenshot({ path: path.join(outputDir, '19-ask-mini.png') });
const probe = await page.evaluate(() => {
  const win = document.querySelector('.mini-window');
  const computed = win ? getComputedStyle(win) : null;
  return {
    hasSupport: CSS.supports('selector(:has(*))'), innerH: window.innerHeight,
    bodyH: document.body.getBoundingClientRect().height,
    rootH: document.querySelector('.mini-root')?.getBoundingClientRect().height ?? null,
    winH: win?.getBoundingClientRect().height ?? null,
    winClass: win?.className ?? null,
    computedHeight: computed?.height ?? null,
    parentChain: (() => { let node = document.querySelector('.mini-ai-surface.is-asking'); const chain = []; while (node && chain.length < 8) { chain.push(node.className?.toString().slice(0, 40) || node.tagName); node = node.parentElement; } return chain; })(),
    askingH: document.querySelector('.mini-ai-surface.is-asking')?.getBoundingClientRect().height ?? null,
  };
});
console.log('MINI PROBE:', JSON.stringify(probe));
await page.locator('.mini-ask-options button', { hasText: '发我本人' }).click();
await poll(async () => {
  const session = await page.evaluate(() => window.desktop.chatOpen());
  const asks = session.entries.flatMap(entry => entry.tools ?? []).filter(item => item.name === 'ask_user');
  return asks.length >= 2 && asks.every(item => item.status === 'complete');
}, 'mini ask answered');
console.log('saved 19-ask-expanded.png / 19-ask-answered.png / 19-ask-mini.png（三面提问证据，持久化断言通过）');
await app.close();
server.close();
