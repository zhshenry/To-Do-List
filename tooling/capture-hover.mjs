// #17 二期交付证据：官方 smoke mock 原样 + Markdown 富化回复。
// 三阶段截图：展开态渲染 / 折叠态降级 / 悬停浮层。worktree 根目录运行：
// `node tooling/capture-hover.mjs <输出目录>`
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

const MD_REPLY = '已经读取你的事项，**优先处理**：\n\n- 先跑 `npm run build` 确认产物\n- 再发 **0.5.11** 版本\n\n> 有问题随时叫我。';

const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const probe = body.messages.filter(message => message.role === 'user').at(-1)?.content;
  console.log('MOCK REQ', req.url, typeof probe === 'string' ? probe.slice(0, 40) : JSON.stringify(probe)?.slice(0, 60));
  res.setHeader('Content-Type', 'text/event-stream');
  const event = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id: 'chatcmpl-cap', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  const content = body.messages.filter(message => message.role === 'user').at(-1)?.content;
  const user = typeof content === 'string' ? content : Array.isArray(content) ? content.map(part => part.text ?? '').join('') : '';
  const last = body.messages.at(-1);
  if (user === '检查我的事项' && last?.role !== 'tool') {
    event({ role: 'assistant', tool_calls: [{ index: 0, id: 'call-list', type: 'function', function: { name: 'list_tasks', arguments: '{}' } }] });
    event({}, 'tool_calls');
  } else if (user === '检查我的事项') {
    event({ role: 'assistant', content: '已经读取你的事项，' });
    event({ content: '**优先处理**：\n\n- 先跑 `npm run build` 确认产物\n- 再发 **0.5.11** 版本\n\n> 有问题随时叫我。' });
    event({}, 'stop');
  } else {
    event({ role: 'assistant', content: JSON.stringify({ message: '已连接本地测试模型。', actions: [] }) });
    event({}, 'stop');
  }
  res.end('data: [DONE]\n\n');
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const port = server.address().port;

const app = await electron.launch({ args: [process.cwd()], env, timeout: 30000 });
const page = await app.firstWindow();
page.setDefaultTimeout(15000);
page.on('console', message => { if (/error|warn|SUBMIT|CHATASK/i.test(message.type() + message.text())) console.log('PAGE:', message.text().slice(0, 300)); });
page.on('pageerror', error => console.log('PAGEERROR:', String(error).slice(0, 400)));
await page.locator('.today-board').waitFor();

async function poll(check, message) { for (let i = 0; i < 100; i++) { if (await check()) return; await page.waitForTimeout(100); } throw new Error(message); }
async function choose(label, name) { await page.getByLabel(label, { exact: true }).click(); await page.getByRole('option', { name, exact: true }).click(); }

// ── 设置：smoke 官方 UI 流程原样 ──
await page.getByRole('button', { name: '设置', exact: true }).click();
await page.getByRole('dialog', { name: '设置', exact: true }).waitFor();
await page.waitForTimeout(400);
await page.getByRole('tab', { name: 'AI配置', exact: true }).click();
await page.getByRole('button', { name: '添加供应商', exact: true }).click();
await page.waitForTimeout(400);
await page.getByLabel('服务地址', { exact: true }).isVisible();
await choose('供应商类型', '自定义');
await page.getByLabel('供应商名称', { exact: true }).fill('本地测试');
await page.getByLabel('服务地址', { exact: true }).fill(`http://127.0.0.1:${port}/v1`);
await choose('服务协议', 'OpenAI Chat Completions');
await page.getByLabel('模型名称 / ID', { exact: true }).fill('test-model');
await page.getByRole('button', { name: '测试连接', exact: true }).click();
await page.getByRole('button', { name: '模型 test-model 连接成功', exact: true }).waitFor();
await page.getByRole('button', { name: '添加并使用', exact: true }).click();
await poll(async () => (await page.evaluate(() => window.desktop.state())).settings.models.length === 1, 'add provider and active model');
await page.getByRole('switch', { name: '启用 AI', exact: true }).click();
const switchState = await page.getByRole('switch', { name: '启用 AI', exact: true }).getAttribute('aria-checked');
const mainAiEnabled = await page.evaluate(() => window.desktop.state().then(state => state.settings.aiEnabled));
console.log('SWITCH aria-checked:', switchState, '| main aiEnabled:', mainAiEnabled);
await page.getByRole('button', { name: '关闭', exact: true }).click();

// ── 折叠态：mini 内提问 → 降级纯文本两行截断 + 展开全文 ──
await page.evaluate(() => window.desktop.window('collapse'));
await page.locator('.mini-quick-actions').waitFor();
await page.getByRole('button', { name: 'AI 助手' }).click();
await page.locator('.mini-ai-compose textarea').waitFor();
await page.locator('.mini-ai-compose textarea').fill('检查我的事项');
await page.evaluate(() => {
  window.__clicks = [];
  window.__btn = document.querySelector('.mini-ai-compose button[type="submit"]');
  window.__size0 = [window.innerWidth, window.innerHeight];
  document.addEventListener('mousedown', event => window.__clicks.push(['down', String(event.target?.className || '').slice(0, 40), Math.round(event.clientX), Math.round(event.clientY)]), true);
  document.addEventListener('click', event => window.__clicks.push(['click', event.defaultPrevented, String(event.target?.className || '').slice(0, 40), Math.round(event.clientX), Math.round(event.clientY)]), true);
  document.addEventListener('submit', event => window.__clicks.push(['SUBMIT', String(event.target?.className || '')]), true);
});
await page.locator('.mini-ai-compose button[type="submit"]').click();
try {
  await page.locator('.mini-ai-answer').waitFor({ timeout: 8000 });
} catch {
  // 现场取证：原始点击事件流 + 渲染分支 + 会话条目，纯净无污染
  await page.screenshot({ path: path.join(outputDir, 'DEBUG-mini-state.png') });
  const dbg = await page.evaluate(async () => {
    const surface = document.querySelector('.mini-ai-surface');
    const session = await window.desktop.chatOpen().catch(error => ({ dumpError: String(error) }));
    return {
      clicks: window.__clicks ?? null,
      surfaceClass: surface ? surface.className : null,
      surfaceText: surface?.textContent?.slice(0, 120) ?? null,
      answerEl: !!document.querySelector('.mini-ai-answer'),
      composeEl: !!document.querySelector('.mini-ai-compose'),
      quickActions: !!document.querySelector('.mini-quick-actions'),
      miniRoot: !!document.querySelector('.mini-root'),
      domTree: [...document.querySelectorAll('#root *')].slice(0, 12).map(node => `${node.tagName}.${String(node.className).slice(0, 40)}`),
      entries: session && Array.isArray(session.entries) ? session.entries.map(entry => ({ role: entry.role, len: (entry.content || '').length, error: entry.error ?? null, streaming: !!entry.streaming })) : session,
    };
  });
  console.log('DEBUG:', JSON.stringify(dbg, null, 1));
  throw new Error('mini answer missing（现场已取证）');
}
const degraded = await page.locator('.mini-ai-answer').waitFor().then(() => page.locator('.mini-ai-answer').innerText());
console.log('degraded:', JSON.stringify(degraded.slice(0, 100)));
if (!degraded.includes('npm run build')) throw new Error('degraded text unexpected');
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(outputDir, '17-mini-degraded.png') });

// ── 悬停浮层：真实鼠标轨迹（先移出框再进入，保证 mouseenter 边界穿越）→ 300ms 后浮层（保持 Markdown）──
const answerBox = await page.locator('.mini-ai-answer').boundingBox();
await page.mouse.move(Math.max(8, answerBox.x - 12), Math.min(answerBox.y + answerBox.height + 24, 168), { steps: 4 });
await page.waitForTimeout(220);
await page.mouse.move(answerBox.x + answerBox.width / 2, answerBox.y + answerBox.height / 2, { steps: 8 });
let popOk = false;
for (let i = 0; i < 30 && !popOk; i++) {
  popOk = await page.locator('.hover-pop').count() === 1;
  if (!popOk) { await page.mouse.move(answerBox.x + answerBox.width / 2 + (i % 2), answerBox.y + answerBox.height / 2, { steps: 1 }); await page.waitForTimeout(120); }
}
if (!popOk) throw new Error('hover pop missing after polling');
const popHtml = await page.locator('.hover-pop').innerHTML();
if (!popHtml.includes('<strong>')) throw new Error('pop should contain rendered strong');
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(outputDir, '17-hover-pop.png') });

// ── 展开全文：鼠标先移开等浮层关闭（160ms 收起计时），再点开独立助手窗（showAssistant → assistantWin）──
await page.mouse.move(8, 8, { steps: 4 });
await page.waitForTimeout(400);
await page.getByRole('button', { name: '展开全文 ›' }).click();
let assistantPage = null;
for (let i = 0; i < 50 && !assistantPage; i++) {
  assistantPage = app.windows().find(candidate => candidate !== page) ?? null;
  if (!assistantPage) await page.waitForTimeout(100);
}
if (!assistantPage) throw new Error('assistant window missing after 展开全文');
await assistantPage.locator('.chat-bubble.md').waitFor();
await assistantPage.locator('.chat-bubble.md strong').first().waitFor();
await assistantPage.evaluate(() => { for (const animation of document.getAnimations()) { try { animation.finish(); } catch {} } });
await assistantPage.waitForTimeout(250);
await assistantPage.screenshot({ path: path.join(outputDir, '17-expanded-md.png') });
const expandedMd = await assistantPage.locator('.chat-bubble.md').innerText();
if (!expandedMd.includes('npm run build') || !expandedMd.includes('优先处理')) throw new Error('expanded md render unexpected');
await app.close();
server.close();
console.log('saved 17-expanded-md.png / 17-mini-degraded.png / 17-hover-pop.png（三阶段验证通过）');
