// 真机交付截图：5px 间距已内置的悬停态。worktree 根目录运行：
// `node tooling/capture-hover.mjs <输出目录>`
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const outputDir = path.resolve(process.argv[2]);
await mkdir(outputDir, { recursive: true });
const output = path.join(outputDir, '13-delivered-hover.png');
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

await page.evaluate(() => window.desktop.window('collapse'));
await page.locator('.mini-task-open').first().waitFor();
await page.evaluate(() => { for (const animation of document.getAnimations()) { try { animation.finish(); } catch {} } });
await page.getByLabel('上一项', { exact: true }).hover();
await page.waitForTimeout(150);
const gap = await page.evaluate(() => {
  const span = document.querySelector('.mini-deck-pager > span');
  const btn = document.querySelector('.mini-deck-pager button');
  return +(btn.getBoundingClientRect().left - span.getBoundingClientRect().right).toFixed(1);
});
if (gap !== 5) throw new Error(`expected 5px gap, got ${gap}`);
await page.screenshot({ path: output, timeout: 3000 });
await app.close();
console.log(`gap=${gap}px verified; saved ${output}`);
