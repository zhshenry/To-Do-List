// 真机证据：#13 翻页器悬停间距 + #16 armed 挤压与修复演示。
// 运行时样式注入仅作用于本次截图会话，不改任何仓库代码。worktree 根目录运行：
// `node tooling/capture-13-16.mjs <输出目录>`
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const outputDir = path.resolve(process.argv[2]);
await mkdir(outputDir, { recursive: true });
await mkdir('test-results', { recursive: true });
const dataDir = await mkdtemp(path.join(path.resolve('test-results'), 'capture-'));
const env = { ...process.env, TODO_TEST: '1', TODO_TEST_DATA: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;

const app = await electron.launch({ args: [process.cwd()], env, timeout: 30000 });
const page = await app.firstWindow();
page.setDefaultTimeout(12000);
await page.locator('.today-board').waitFor();

const date = new Date();
const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const task = title => ({ title, kind: 'task', status: 'todo', priority: 'medium', plannedDate: today, dueAt: null, remindAt: null, note: '', categoryId: null, progress: null });
await page.evaluate(async input => { await window.desktop.create(input); }, task('创建一个本项目的自动化问题单处理机制并持续优化'));
await page.evaluate(async input => { await window.desktop.create(input); }, task('回复邮件'));
const providerId = await page.evaluate(async () => (await window.desktop.saveProvider({ kind: 'custom', name: '验证用', endpoint: 'http://127.0.0.1:9/v1', protocol: 'openai-chat', apiKey: 'sk-test' })).settings.providers[0].id);
const activeModelId = await page.evaluate(async id => (await window.desktop.saveModel({ providerId: id, name: '验证模型' })).settings.activeModelId, providerId);
if (!activeModelId) throw new Error('activeModelId not set');
await page.evaluate(async () => { await window.desktop.settings({ aiEnabled: true, autoStart: false }); });

await page.evaluate(() => window.desktop.window('collapse'));
await page.locator('.mini-task-open').first().waitFor();
await page.evaluate(() => { for (const animation of document.getAnimations()) { try { animation.finish(); } catch {} } });

const measure = () => page.evaluate(() => {
  const card = document.querySelector('.mini-task-front');
  const meta = document.querySelector('.front-meta');
  const title = document.querySelector('.mini-task-open > b');
  const check = document.querySelector('.mini-task-check');
  const box = el => { const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(1), height: +r.height.toFixed(1) }; };
  return { metaHeight: box(meta).height, titleTop: box(title).top, checkTop: box(check).top, cardHeight: box(card).height };
});

// ── #16：normal → armed（现状会挤压上移）──
const normal = await measure();
await page.locator('.mini-task-check').first().click();
await page.locator('.confirm-bar').waitFor();
await page.waitForTimeout(200);
const armed = await measure();
await page.screenshot({ path: path.join(outputDir, '16-armed-squeeze.png') });
console.log('#16 normal:', JSON.stringify(normal));
console.log('#16 armed:', JSON.stringify(armed), '→ meta 涨', (armed.metaHeight - normal.metaHeight).toFixed(1), 'px，标题上移', (normal.titleTop - armed.titleTop).toFixed(1), 'px');

// ── #16 修复演示：注入 front-meta 固定高度 ──
await page.addStyleTag({ content: '.mini-home .front-meta { height: 18px; }' });
await page.waitForTimeout(150);
const armedFixed = await measure();
await page.screenshot({ path: path.join(outputDir, '16-armed-fixed-demo.png') });
console.log('#16 armed+fix:', JSON.stringify(armedFixed), '→ 标题 top 与 normal 差', Math.abs(normal.titleTop - armedFixed.titleTop).toFixed(1), 'px');
await page.locator('.confirm-cancel').click(); // 解除 armed
await page.waitForTimeout(200);

// ── #13：翻页器悬停 before → 注入 5px → after ──
const upBtn = page.getByLabel('上一项', { exact: true });
await upBtn.hover();
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(outputDir, '13-hover-before.png') });
const pager = await page.evaluate(() => {
  const span = document.querySelector('.mini-deck-pager > span');
  const btn = document.querySelector('.mini-deck-pager button');
  return { gap: +(btn.getBoundingClientRect().left - span.getBoundingClientRect().right).toFixed(1) };
});
console.log('#13 before gap:', pager.gap, 'px');
await page.addStyleTag({ content: '.mini-deck-pager > span { margin-right: 5px; }' });
await page.waitForTimeout(150);
await upBtn.hover();
await page.waitForTimeout(150);
await page.screenshot({ path: path.join(outputDir, '13-hover-after.png') });
const pagerAfter = await page.evaluate(() => {
  const span = document.querySelector('.mini-deck-pager > span');
  const btn = document.querySelector('.mini-deck-pager button');
  return { gap: +(btn.getBoundingClientRect().left - span.getBoundingClientRect().right).toFixed(1) };
});
console.log('#13 after gap:', pagerAfter.gap, 'px');
await app.close();
console.log('saved 16-armed-squeeze.png / 16-armed-fixed-demo.png / 13-hover-before.png / 13-hover-after.png');
