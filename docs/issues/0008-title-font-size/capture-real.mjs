// 真机验证截图：构建产物 + 临时数据目录（绝不触碰用户数据库）。
// 运行方式：在 sdd worktree 根目录执行 `node tooling/capture-issue.mjs <输出目录>`
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const outputDir = path.resolve(process.argv[2]);
await mkdir(outputDir, { recursive: true });
const output = path.join(outputDir, 'verify-collapsed-12.5px.png');
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

// 启用一个本地假模型，让收起卡走标准变体（无 AI 建议条），截到 12.5px 两行标题
const providerId = await page.evaluate(async () => (await window.desktop.saveProvider({ kind: 'custom', name: '验证用', endpoint: 'http://127.0.0.1:9/v1', protocol: 'openai-chat', apiKey: 'sk-test' })).settings.providers[0].id);
const activeModelId = await page.evaluate(async id => (await window.desktop.saveModel({ providerId: id, name: '验证模型' })).settings.activeModelId, providerId);
if (!activeModelId) throw new Error('activeModelId not set');
await page.evaluate(async () => { await window.desktop.settings({ aiEnabled: true, autoStart: false }); });

await page.evaluate(() => window.desktop.window('collapse'));
await page.locator('.mini-task-open').filter({ hasText: '自动化问题单处理机制' }).waitFor();
await page.locator('.mini-home:not(.mini-home-with-insight)').waitFor();
await page.evaluate(() => { for (const animation of document.getAnimations()) { try { animation.finish(); } catch {} } });
await page.waitForTimeout(300);
await page.screenshot({ path: output, timeout: 3000 });
await app.close();
console.log(`saved ${output}`);
