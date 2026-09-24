// 真机交付证据（#14）：外层零滚动 + 两卡内部滚动。worktree 根目录运行：
// `node tooling/capture-split.mjs <输出目录>`
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
const day = offset => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const mk = (title, kind, offset, due) => page.evaluate(async input => { await window.desktop.create(input); }, { title, kind, status: 'todo', priority: 'medium', plannedDate: day(offset ?? 0), dueAt: due ? `${day(offset ?? 0)}T${due}:00+08:00` : null, remindAt: null, note: '', categoryId: null, progress: null });
const titles = ['梳理季度 OKR 并拆解到月', '回复合作方邮件', '预约年度体检', '给车做保养', '整理书桌与线缆', '采购家用耗材', '写周报并同步进展', 'Review 团队 PR'];
for (const t of titles) await mk(t, 'task', 0, null);
await mk('创建一个本项目的自动化问题单处理机制并持续优化', 'task', 0, '23:50');
await mk('项目周会', 'meeting', 0, '10:00');
await mk('与设计师对稿', 'meeting', 0, '15:00');
await mk('客户演示', 'meeting', 0, '17:00');
await mk('牙医复诊', 'meeting', 1, '09:30');
await mk('版本发布评审', 'meeting', 4, null);
await mk('季度回顾会', 'meeting', 5, '14:00');
await mk('跨团队同步', 'meeting', 6, '11:00');

await page.evaluate(() => { for (const animation of document.getAnimations()) { try { animation.finish(); } catch {} } });
await page.waitForTimeout(200);

// 断言：外层不滚动；待办/日程各自内部滚动
const m = await page.evaluate(() => {
  const sc = el => ({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollable: el.scrollHeight > el.clientHeight });
  const todoBody = document.querySelector('.plan-today .plan-list') ?? document.querySelector('.plan-today .plan-tiles');
  return {
    board: sc(document.querySelector('.today-board')),
    todoList: sc(todoBody),
    groups: sc(document.querySelector('.plan-schedule-groups')),
    ratio: (() => { const t = document.querySelector('.plan-today').getBoundingClientRect(); const s = document.querySelector('.plan-schedule').getBoundingClientRect(); return +(t.height / (t.height + s.height) * 100).toFixed(1); })(),
  };
});
console.log(JSON.stringify(m, null, 1));
if (m.board.scrollable) throw new Error('outer board must NOT scroll');
if (!m.todoList.scrollable) throw new Error('todo list should scroll internally');
const groupsOverflow = await page.evaluate(() => getComputedStyle(document.querySelector('.plan-schedule-groups')).overflowY);
if (groupsOverflow !== 'auto') throw new Error(`schedule groups overflow-y should be auto, got ${groupsOverflow}`);
await page.screenshot({ path: path.join(outputDir, '14-delivered-list.png') });

// 方块模式同样内部滚动
await page.getByLabel('切换到方块视图').click();
await page.waitForTimeout(250);
const tiles = await page.evaluate(() => {
  const el = document.querySelector('.plan-today .plan-tiles');
  return { scrollable: el.scrollHeight > el.clientHeight, clientHeight: el.clientHeight };
});
console.log('tiles:', JSON.stringify(tiles));
if (!tiles.scrollable) throw new Error('tiles should scroll internally');
await page.screenshot({ path: path.join(outputDir, '14-delivered-tiles.png') });
await app.close();
console.log(`board ratio todo=${m.ratio}%；saved 14-delivered-list.png / 14-delivered-tiles.png`);
