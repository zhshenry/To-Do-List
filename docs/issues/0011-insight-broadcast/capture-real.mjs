// 真机行为证据：建议条内容两段式 + 翻页不消失。worktree 根目录运行：
// `node tooling/capture-insight.mjs <输出目录>`
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

const now = Date.now();
const at = offset => new Date(now + offset).toISOString();
const today = new Date(now + 8 * 3600 * 1000);
const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
await page.evaluate(async input => { await window.desktop.create(input); }, { title: '创建一个本项目的自动化问题单处理机制并持续优化', kind: 'task', status: 'todo', priority: 'medium', plannedDate: day, dueAt: at(45 * 60 * 1000), remindAt: null, note: '', categoryId: null, progress: null });
await page.evaluate(async input => { await window.desktop.create(input); }, { title: '回复邮件', kind: 'task', status: 'todo', priority: 'medium', plannedDate: day, dueAt: null, remindAt: null, note: '', categoryId: null, progress: null });

const providerId = await page.evaluate(async () => (await window.desktop.saveProvider({ kind: 'custom', name: '验证用', endpoint: 'http://127.0.0.1:9/v1', protocol: 'openai-chat', apiKey: 'sk-test' })).settings.providers[0].id);
const activeModelId = await page.evaluate(async id => (await window.desktop.saveModel({ providerId: id, name: '验证模型' })).settings.activeModelId, providerId);
if (!activeModelId) throw new Error('activeModelId not set');
await page.evaluate(async () => { await window.desktop.settings({ aiEnabled: true, autoStart: false }); });

await page.evaluate(() => window.desktop.window('collapse'));
await page.locator('.mini-insight').waitFor();
const bar1 = await page.locator('.mini-insight').innerText();
if (!bar1.includes('创建一个本项目的自动化问题单处理机制') || !bar1.includes('先拆出下一步')) throw new Error(`card 1 bar unexpected: ${bar1}`);
await page.evaluate(() => { for (const animation of document.getAnimations()) { try { animation.finish(); } catch {} } });
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(outputDir, 'verify-insight-card1.png') });

// 翻到第 2 张卡（无截止时间）——建议必须保持
await page.getByLabel('下一项', { exact: true }).click();
await page.locator('.mini-task-open').filter({ hasText: '回复邮件' }).waitFor();
await page.waitForTimeout(400);
const bar2 = await page.locator('.mini-insight').innerText();
if (!bar2.includes('创建一个本项目的自动化问题单处理机制') || !bar2.includes('先拆出下一步')) throw new Error(`card 2 bar must persist: ${bar2}`);
await page.evaluate(() => { for (const animation of document.getAnimations()) { try { animation.finish(); } catch {} } });
await page.waitForTimeout(250);
await page.screenshot({ path: path.join(outputDir, 'verify-insight-card2-persist.png') });
await app.close();
console.log('saved verify-insight-card1.png / verify-insight-card2-persist.png (broadcast verified)');
