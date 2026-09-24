// 真机交付证据（#16 v2）：标准版 + 窄版 armed 前后零位移。worktree 根目录运行：
// `node tooling/capture-delivered.mjs <输出目录>`
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
  const meta = document.querySelector('.front-meta');
  const title = document.querySelector('.mini-task-open > b');
  const btn = document.querySelector('.confirm-btn');
  return {
    metaHeight: +meta.getBoundingClientRect().height.toFixed(1),
    titleTop: +title.getBoundingClientRect().top.toFixed(1),
    btnHeight: btn ? +btn.getBoundingClientRect().height.toFixed(1) : null,
    btnHasIcon: btn ? !!btn.querySelector('svg') : null,
  };
});

const freeze = () => page.evaluate(() => { for (const animation of document.getAnimations()) { try { animation.finish(); } catch {} } });

// ── 标准变体（已配 AI，无建议条）──
const stdNormal = await measure();
await page.locator('.mini-task-check').first().click();
await page.locator('.confirm-bar').waitFor();
await page.waitForTimeout(200);
const stdArmed = await measure();
freeze(); await page.waitForTimeout(200);
await page.screenshot({ path: path.join(outputDir, '14-delivered-standard-armed.png') });
console.log('标准 normal:', JSON.stringify(stdNormal));
console.log('标准 armed:', JSON.stringify(stdArmed), '→ 位移', Math.abs(stdNormal.titleTop - stdArmed.titleTop).toFixed(1), 'px');
if (stdNormal.titleTop !== stdArmed.titleTop) throw new Error('standard variant shifted');
if (stdArmed.btnHasIcon) throw new Error('icon should be removed');
if (stdArmed.btnHeight !== 15) throw new Error(`btn height ${stdArmed.btnHeight} != 15`);
await page.locator('.confirm-cancel').click();
await page.waitForTimeout(250);

// ── 窄变体（移除 AI 配置 → 建议条出现）──
await page.evaluate(async () => { await window.desktop.settings({ aiEnabled: false, autoStart: false }); });
await page.waitForTimeout(300);
const cmpNormal = await measure();
await page.locator('.mini-task-check').first().click();
await page.locator('.confirm-bar').waitFor();
await page.waitForTimeout(200);
const cmpArmed = await measure();
freeze(); await page.waitForTimeout(200);
await page.screenshot({ path: path.join(outputDir, '14-delivered-compact-armed.png') });
console.log('窄版 normal:', JSON.stringify(cmpNormal));
console.log('窄版 armed:', JSON.stringify(cmpArmed), '→ 位移', Math.abs(cmpNormal.titleTop - cmpArmed.titleTop).toFixed(1), 'px');
if (cmpNormal.titleTop !== cmpArmed.titleTop) throw new Error('compact variant shifted');
await app.close();
console.log('saved 14-delivered-standard-armed.png / 14-delivered-compact-armed.png（两变体零位移断言通过）');
