import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';

// All fixtures and conversations live in a fresh test profile, never the user's database.
const output = path.resolve('test-results/ux-current');
await mkdir(output, { recursive: true });
const dataDir = await mkdtemp(path.join(output, 'profile-'));
const env = { ...process.env, TODO_TEST: '1', TODO_TEST_DATA: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;
const errors = [];
const checks = [];
let app, page, assistant;
let releaseStream;
let testCategoryId = '';
let removeTargetId = '';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const day = offset => {
  const date = new Date(); date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const task = (title, extra = {}) => ({ title, kind: 'task', status: 'todo', priority: 'medium', plannedDate: day(0), dueAt: null, remindAt: null, note: '', categoryId: null, progress: null, ...extra });
const meeting = (title, extra = {}) => {
  const plannedDate = extra.plannedDate ?? day(0);
  return { title, kind: 'meeting', status: 'todo', priority: 'medium', plannedDate, dueAt: `${plannedDate}T10:00:00+08:00`, remindAt: null, note: '', categoryId: null, progress: null, ...extra, kind: 'meeting', plannedDate };
};
async function poll(check, message) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await wait(100); }
  throw new Error(`Timed out: ${message}`);
}
async function launch() {
  app = await electron.launch({ args: ['.'], env, timeout: 30000 });
  app.process().stderr.on('data', chunk => { if (/Uncaught|ERR_MODULE|Cannot find/.test(chunk.toString())) errors.push(chunk.toString()); });
  page = await app.firstWindow(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('.today-board').waitFor();
}
async function screenshot(name, target = page) {
  await target.evaluate(() => { for (const animation of document.getAnimations()) { try { animation.finish(); } catch {} } });
  await target.screenshot({ path: path.join(output, `${name}.png`), timeout: 3000 });
}
async function choose(label, name) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name, exact: true }).click();
}
async function resize(width, height) {
  await app.evaluate(({ BrowserWindow }, size) => {
    const main = BrowserWindow.getAllWindows().find(window => { const url = window.webContents.getURL(); return url && !url.includes('window=assistant') && !url.includes('window=dock'); });
    main.setResizable(true); main.setBounds({ x: 60, y: 60, ...size });
  }, { width, height });
}
async function checkLauncherInsets() {
  const { right, bottom } = await page.locator('.ai-launcher').evaluate(element => {
    const box = element.getBoundingClientRect(); return { right: innerWidth - box.right, bottom: innerHeight - box.bottom };
  });
  assert.ok(Math.abs(right - bottom) < 1 && right >= 12 && right <= 14, 'AI launcher keeps equal right and bottom insets');
}
async function openAssistant() {
  if (await page.locator('.assistant-overlay').count() === 0) await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  assistant = page;
  await page.locator('.assistant-overlay').getByLabel('AI 对话输入', { exact: true }).waitFor();
}
function event(res, delta, finish_reason = null) {
  res.write(`data: ${JSON.stringify({ id: 'chatcmpl-ux', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
}
const requests = [];
const server = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); requests.push(body);
  res.setHeader('Content-Type', 'text/event-stream');
  const content = body.messages.filter(message => message.role === 'user').at(-1)?.content;
  const user = typeof content === 'string' ? content : Array.isArray(content) ? content.map(part => part.text ?? '').join('') : '';
  const last = body.messages.at(-1);
  if (user === '检查我的事项' && last?.role !== 'tool') {
    event(res, { role: 'assistant', tool_calls: [{ index: 0, id: 'call-list', type: 'function', function: { name: 'list_tasks', arguments: '{}' } }] });
    event(res, {}, 'tool_calls');
  } else if (user === '检查我的事项') {
    event(res, { role: 'assistant', content: '已经读取你的事项，' });
    await new Promise(resolve => { releaseStream = resolve; });
    event(res, { content: '这是逐步显示的完整回复。' });
    event(res, {}, 'stop');
  } else {
    const actions = user === '安排待办' || user === '待确认事项'
      ? [{ type: 'create', task: task(user === '安排待办' ? 'AI 已确认事项' : 'AI 未确认事项') }]
      : user === '调整待办'
        ? [{ type: 'create', task: task('AI 已确认事项', { dueAt: new Date(`${day(0)}T16:00:00`).toISOString() }) }]
        : user === '两项待办'
          ? [{ type: 'create', task: task('选择应用的事项') }, { type: 'create', task: task('未选择的事项') }]
      : user === '修改标签预览'
        ? [{ type: 'update_category', id: testCategoryId, patch: { name: '重点工作', color: '#8c5c45' } }]
        : user === '删除待办'
          ? [{ type: 'remove', id: removeTargetId }]
        : [];
    event(res, { role: 'assistant', content: JSON.stringify({ message: actions.length ? '请确认下面的事项。' : '已连接本地测试模型。', actions }) });
    event(res, {}, 'stop');
  }
  res.end('data: [DONE]\n\n');
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');

try {
  await launch();
  assert.deepEqual(await page.evaluate(() => ({ node: typeof window.require, process: typeof window.process })), { node: 'undefined', process: 'undefined' });
  await screenshot('empty');
  await checkLauncherInsets();
  assert.equal(await page.getByRole('button', { name: '收起窗口', exact: true }).count(), 0);
  assert.ok(await page.locator('.plan-today').evaluate(element => element.getBoundingClientRect().height <= 120), 'empty today card stays compact');
  assert.equal(await page.getByRole('region', { name: '日程', exact: true }).count(), 1);
  await page.getByLabel('更多操作', { exact: true }).click();
  await screenshot('review-menu');
  await page.getByRole('button', { name: '今日复盘', exact: true }).click();
  await page.getByRole('dialog', { name: '今日复盘', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await poll(async () => await page.getByLabel('更多操作', { exact: true }).evaluate(element => element === document.activeElement), 'review restores focus to its trigger');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.plan-more').getAttribute('open'), null);
  await resize(340, 480);
  await screenshot('empty-narrow');
  await checkLauncherInsets();
  assert.ok(await page.locator('.plan-today').evaluate(element => element.getBoundingClientRect().height <= 120));
  await resize(440, 700);
  checks.push('compact empty state, unified schedule card and relocated keyboard-accessible review');
  await openAssistant();
  await assistant.getByText('请先配置 AI 大模型', { exact: true }).waitFor();
  const assistantInput = assistant.getByLabel('AI 对话输入', { exact: true });
  assert.equal(await assistantInput.getAttribute('placeholder'), 'Enter 发送 · Shift + Enter 换行');
  assert.equal(await assistantInput.evaluate(element => getComputedStyle(element).textAlign), 'left');
  const [assistantComposeBox, assistantInputBox] = await Promise.all([
    assistant.locator('.assistant-compose').boundingBox(),
    assistantInput.boundingBox()
  ]);
  assert.ok(assistantComposeBox && assistantInputBox);
  assert.ok(assistantInputBox.x - assistantComposeBox.x <= 20);
  assert.ok(assistantInputBox.width >= assistantComposeBox.width - 40);
  await screenshot('assistant-disabled', assistant);
  await assistant.getByRole('button', { name: '关闭 AI 助手', exact: true }).click();
  checks.push('isolated Electron renderer and disabled AI status');

  const fixture = await page.evaluate(async input => {
    let state = await window.desktop.createCategory({ name: '工作', color: '#365f73' });
    const categoryId = state.categories.find(category => category.name === '工作').id;
    await window.desktop.create({ ...input.today, categoryId });
    await window.desktop.create({ ...input.future, categoryId });
    await window.desktop.create(input.done);
    state = await window.desktop.create(input.deleted);
    const removed = state.tasks.find(item => item.title === input.deleted.title);
    await window.desktop.remove(removed.id, removed.updatedAt);
    return { categoryId, futureId: state.tasks.find(item => item.title === input.future.title).id, removedId: removed.id };
  }, { today: task('完成项目报告', { progress: 40 }), future: task('下周产品评审', { plannedDate: day(7), note: '季度目标核对', progress: 65 }), done: task('整理收件箱', { status: 'done' }), deleted: task('误删的事项') });
  testCategoryId = fixture.categoryId;
  const todayRow = page.locator('.plan-item').filter({ hasText: '完成项目报告' });
  await todayRow.getByText('工作', { exact: true }).waitFor();
  await todayRow.locator('.time-label', { hasText: '完成时间' }).waitFor();
  assert.equal(await todayRow.locator('.plan-progress-num').textContent(), '40%');
  assert.equal(await todayRow.locator('.plan-progress').count(), 0);
  await page.evaluate(async input => { await window.desktop.create(input); }, task('进度为零', { progress: 0, status: 'doing' }));
  const zeroRow = page.locator('.plan-item').filter({ hasText: '进度为零' });
  assert.equal(await zeroRow.locator('.plan-progress-num').textContent(), '0%');
  assert.equal(await zeroRow.getByText('进行中', { exact: true }).count(), 0, 'list does not show a doing status pill');
  await page.getByRole('region', { name: '待办' }).getByText('下周产品评审', { exact: true }).waitFor();
  await screenshot('main-rows');
  // v2 双步确认：主界面勾选 → armed 确认条 → 确认完成 → 离卡（openToday 过滤）
  await page.evaluate(async input => { await window.desktop.create(input); }, task('冒烟双步确认', { plannedDate: day(0) }));
  const smokeRow = page.locator('.plan-item').filter({ hasText: '冒烟双步确认' });
  await smokeRow.getByRole('button', { name: `完成 冒烟双步确认`, exact: true }).click();
  await smokeRow.getByRole('button', { name: `取消完成 冒烟双步确认`, exact: true }).waitFor(); // armed：再点圆框=取消
  await screenshot('board-armed');
  await smokeRow.locator('.confirm-bar .confirm-btn').click(); // 写入仅经「确认完成」按钮
  await poll(async () => (await page.evaluate(() => window.desktop.state())).tasks.find(item => item.title === '冒烟双步确认')?.status === 'done', 'board two-step completion');
  await poll(async () => await page.getByRole('region', { name: '待办' }).getByText('冒烟双步确认').count().then(n => n === 0), 'completed row leaves the board');
  checks.push('board checkbox two-step confirm with armed bar and completion leaving the card');
  // v2 方块视图：徽章 + 右上时间 + 底行百分比
  await page.getByRole('button', { name: '切换到方块视图', exact: true }).click();
  await page.locator('.plan-tiles').waitFor();
  assert.equal(await page.locator('.plan-tiles .tile-pill.pill-todo').count(), 0, 'tiles omit the todo type badge');
  assert.ok(await page.locator('.plan-tiles .tile-top time[datetime]').first().isVisible(), 'tiles show schedule stamp');
  assert.equal((await page.locator('.plan-tiles .plan-progress-num').allTextContents())[0], '40%', 'tiles show progress percentage');
  assert.equal(await page.locator('.plan-tiles .plan-progress').count(), 0, 'tiles do not draw a progress bar');
  const zeroTile = page.locator('.plan-tiles .plan-item').filter({ hasText: '进度为零' });
  assert.equal(await zeroTile.locator('.plan-progress-num').textContent(), '0%');
  assert.equal(await zeroTile.locator('.tile-pill').count(), 0, 'a tile that is not overdue has no status capsule');
  assert.equal(await zeroTile.getByText('进行中', { exact: true }).count(), 0, 'tiles omit doing status');
  await screenshot('board-tiles');
  await page.getByRole('button', { name: '切换到列表视图', exact: true }).click();
  await page.locator('.plan-list').first().waitFor();
  checks.push('tiles view redesigned with badge, stamp and percentage');
  assert.equal((await page.getByRole('region', { name: '日程' }).locator('.plan-empty').textContent()), '没有日程。');
  await page.evaluate(async input => { await window.desktop.create(input); }, meeting('明日准备材料', { plannedDate: day(1) }));
  await page.evaluate(async input => { await window.desktop.create(input); }, meeting('今日例会', { plannedDate: day(0) }));
  await page.locator('.plan-folder-tab').filter({ hasText: '今天' }).click();
  await page.getByRole('region', { name: '日程' }).getByText('今日例会', { exact: true }).waitFor();
  assert.equal(await page.locator('#plan-folder-today .task-check').count(), 0, 'today meetings have no complete circle');
  assert.equal(await page.locator('.plan-folder-tab').filter({ hasText: '近期' }).count(), 0, 'an empty soon group stays hidden');
  await page.locator('.plan-folder-tab').filter({ hasText: '明天' }).click();
  await page.locator('#plan-folder-tomorrow').getByText('明日准备材料', { exact: true }).waitFor();
  assert.equal(await page.locator('#plan-folder-tomorrow .task-check').count(), 0, 'upcoming meetings have no complete circle');
  await page.evaluate(async input => { await window.desktop.create(input); }, meeting('已完成的明日会', { plannedDate: day(1), status: 'done' }));
  await poll(async () => (await page.evaluate(() => window.desktop.state())).tasks.some(item => item.title === '已完成的明日会' && item.status === 'done'), 'completed meeting is stored');
  assert.equal(await page.locator('#plan-folder-tomorrow').getByText('已完成的明日会').count(), 0, 'completed meeting stays out of tomorrow');
  assert.equal(await page.locator('.plan-folder-tab').filter({ hasText: '明天' }).locator('.plan-folder-count').textContent(), '1');
  await screenshot('upcoming-open');
  await page.evaluate(async inputs => { for (const input of inputs) await window.desktop.create(input); }, [
    meeting('后天检查材料', { plannedDate: day(2) }),
    meeting('下周整理文档', { plannedDate: day(8) }),
    meeting('明年长期规划', { plannedDate: day(400) }),
  ]);
  await page.locator('.plan-folder-tab').filter({ hasText: '近期' }).click();
  assert.equal(await page.locator('#plan-folder-tomorrow').count(), 0);
  assert.deepEqual(await page.locator('#plan-folder-soon .plan-title b').allTextContents(), ['后天检查材料']);
  assert.deepEqual(await page.locator('#plan-folder-soon time[datetime]').evaluateAll(nodes => nodes.map(node => node.getAttribute('datetime'))), [`${day(2)}T10:00:00+08:00`]); // v2: 右栏统一 scheduleStamp（含日期），分类行仅逾期挂日期
  await screenshot('upcoming-week');
  await page.locator('.plan-folder-tab').filter({ hasText: '更晚' }).click();
  assert.deepEqual(await page.locator('#plan-folder-later .plan-title b').allTextContents(), ['下周整理文档', '明年长期规划']);
  assert.equal(await page.locator('#plan-folder-soon').count(), 0);
  await screenshot('upcoming-later');
  await resize(340, 480);
  await checkLauncherInsets();
  await page.locator('#plan-folder-later').scrollIntoViewIfNeeded();
  await screenshot('upcoming-narrow');
  await resize(440, 700);
  await page.locator('.plan-folder-tab').filter({ hasText: '更晚' }).click();
  checks.push('future date ranges are disjoint, ordered and reachable beyond one week; AI launcher insets match');
  await page.getByRole('button', { name: '切换到方块视图', exact: true }).click();
  await todayRow.getByText('工作', { exact: true }).waitFor();
  await screenshot('main-tiles');
  await page.getByRole('button', { name: '切换到列表视图', exact: true }).click();
  checks.push('visible category names in row and tile views');

  await page.getByRole('button', { name: '事项库', exact: true }).click();
  assert.equal(await page.getByLabel('搜索事项', { exact: true }).evaluate(element => getComputedStyle(element).outlineStyle), 'none', 'library search input does not draw a second accent focus frame');
  await screenshot('library-focus');
  await page.getByLabel('搜索事项', { exact: true }).fill('季度目标');
  await page.getByRole('button', { name: '编辑 下周产品评审', exact: true }).waitFor();
  await page.getByLabel('搜索事项', { exact: true }).fill('');
  await choose('标签筛选', '工作');
  await screenshot('library');
  await choose('标签筛选', '全部标签');
  await page.getByRole('button', { name: /^已删除/ }).click();
  await page.getByRole('button', { name: '恢复 误删的事项', exact: true }).click();
  await poll(async () => !(await page.evaluate(() => window.desktop.state())).tasks.find(item => item.id === fixture.removedId).deletedAt, 'restore from library');
  await screenshot('library-deleted');
  await page.getByRole('button', { name: /^未完成/ }).click();
  await page.getByLabel('搜索事项', { exact: true }).fill('下周产品评审');
  await page.getByRole('button', { name: '多选', exact: true }).click();
  await page.getByRole('checkbox', { name: '全选筛选结果', exact: true }).check();
  await page.getByRole('button', { name: '批量完成', exact: true }).click();
  await poll(async () => (await page.evaluate(() => window.desktop.state())).tasks.find(item => item.id === fixture.futureId).status === 'done', 'batch completion');
  await page.getByRole('button', { name: /^已完成/ }).click();
  await page.getByRole('checkbox', { name: '全选筛选结果', exact: true }).check();
  await page.getByRole('button', { name: '批量恢复', exact: true }).click();
  await poll(async () => (await page.evaluate(() => window.desktop.state())).tasks.find(item => item.id === fixture.futureId).status === 'todo', 'batch restore');
  const restoredFuture = (await page.evaluate(() => window.desktop.state())).tasks.find(item => item.id === fixture.futureId);
  assert.equal(restoredFuture.categoryId, fixture.categoryId, 'status-only updates retain category');
  assert.equal(restoredFuture.progress, 65, 'status-only updates retain progress');
  await page.getByRole('button', { name: '取消多选', exact: true }).click();
  await page.getByRole('button', { name: /^未完成/ }).click();
  await page.getByLabel('搜索事项', { exact: true }).fill('');
  checks.push('future task library, note search, category filter and trash restore');
  checks.push('batch complete and restore only filtered selections');

  await page.keyboard.press('Control+n');
  const kindSwitch = page.getByRole('radiogroup', { name: '类型', exact: true });
  assert.deepEqual(await kindSwitch.getByRole('radio').allTextContents(), ['待办', '日程']);
  assert.equal(await kindSwitch.evaluate(element => getComputedStyle(element, '::after').width), '1px', 'type switch keeps the center divider');
  assert.equal(await page.locator('.task-create-compose').count(), 1, 'expanded create uses the compact composer layout');
  assert.equal(await page.locator('.task-create-tools > button').count(), 4, 'expanded create exposes four optional setting tools');
  assert.equal(await page.getByLabel('完成期限', { exact: true }).count(), 0, 'optional fields stay collapsed until requested');
  await screenshot('editor-kind-switch');
  const createDialog = page.getByRole('dialog', { name: '新增事项', exact: true });
  const createLayout = await createDialog.boundingBox();
  assert.ok(createLayout, 'create dialog has a measurable fixed frame');
  const createSize = { width: Math.round(createLayout.width), height: Math.round(createLayout.height) };
  assert.ok(createSize.height >= 360, `create dialog reserves a stable detail viewport: ${JSON.stringify(createSize)}`);
  async function assertCreateSize(label) {
    const box = await createDialog.boundingBox();
    assert.ok(box, `${label}: create dialog remains visible`);
    assert.deepEqual({ width: Math.round(box.width), height: Math.round(box.height) }, createSize, `${label}: create dialog size stays fixed`);
  }
  const timeTool = page.getByRole('button', { name: /^时间安排：/ });
  await timeTool.click();
  await page.getByLabel('完成期限', { exact: true }).waitFor();
  await assertCreateSize('time settings open');
  await screenshot('editor-time-settings');
  await page.getByRole('combobox', { name: '时间', exact: true }).click();
  const halfHourOptions = page.getByRole('listbox', { name: '时间', exact: true });
  await halfHourOptions.waitFor();
  assert.equal(await halfHourOptions.getByRole('option').count(), 49, 'expanded create uses no-time plus 48 half-hour slots');
  const halfHourLabels = await halfHourOptions.getByRole('option').allTextContents();
  assert.equal(halfHourLabels[0], '不设时间');
  assert.equal(halfHourLabels.slice(1).every(label => /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(label)), true, 'every concrete time is on a half-hour boundary');
  for (const label of ['11:30', '12:00', '12:30']) assert.equal(await halfHourOptions.getByRole('option', { name: label, exact: true }).count(), 1);
  await screenshot('editor-half-hour-time');
  await halfHourOptions.getByRole('option', { name: '12:30', exact: true }).click();
  await assertCreateSize('half-hour selected');
  await timeTool.click();
  assert.equal(await page.getByLabel('完成期限', { exact: true }).count(), 0);
  await assertCreateSize('time settings closed');
  const priorityTool = page.getByRole('button', { name: /^优先级：/ });
  await priorityTool.click();
  await page.getByRole('combobox', { name: '优先级', exact: true }).waitFor();
  await assertCreateSize('priority settings open');
  await priorityTool.click();
  const tagTool = page.getByRole('button', { name: /^标签：/ });
  await tagTool.click();
  const tagSettings = page.getByLabel('标签设置', { exact: true });
  await tagSettings.getByRole('combobox', { name: '标签', exact: true }).waitFor();
  await assertCreateSize('tag settings open');
  await tagSettings.getByRole('button', { name: '新建标签', exact: true }).click();
  const expandedTagPalette = tagSettings.getByRole('group', { name: '新标签颜色', exact: true });
  const expandedTagColors = expandedTagPalette.getByRole('button', { name: /^选择颜色 / });
  assert.equal(await expandedTagPalette.getAttribute('class'), 'tag-color-presets', 'expanded creation uses the shared tag color palette');
  assert.equal(await expandedTagColors.count(), 16, 'expanded creation offers the same sixteen preset colors');
  assert.equal((await expandedTagPalette.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)), 8, 'expanded tag colors use the same eight-column layout');
  await expandedTagColors.last().click();
  assert.equal(await expandedTagColors.last().getAttribute('aria-pressed'), 'true');
  await assertCreateSize('tag palette open');
  await screenshot('editor-tag-palette');
  await tagSettings.getByRole('button', { name: '取消新建', exact: true }).click();
  await tagTool.click();
  const moreTool = page.getByRole('button', { name: /^更多设置：/ });
  await moreTool.click();
  await page.getByLabel('备注 / 进展', { exact: true }).waitFor();
  await assertCreateSize('more settings open');
  const progressToggle = page.getByRole('switch', { name: '进度', exact: true });
  await progressToggle.click();
  const expandedProgress = page.getByLabel('事项进度', { exact: true });
  await expandedProgress.fill('60');
  const expandedProgressStyle = await expandedProgress.evaluate(element => ({ className: element.className, appearance: getComputedStyle(element).appearance, backgroundImage: getComputedStyle(element).backgroundImage, value: element.style.getPropertyValue('--progress-value') }));
  assert.equal(expandedProgressStyle.className, 'progress-range', 'expanded creation uses the shared progress slider style');
  assert.equal(expandedProgressStyle.appearance, 'none');
  assert.match(expandedProgressStyle.backgroundImage, /linear-gradient/);
  assert.equal(expandedProgressStyle.value, '60%');
  await progressToggle.click();
  await moreTool.click();
  await page.getByLabel('待办名称', { exact: true }).fill('快捷键新建事项');
  const taskRadio = page.getByRole('radio', { name: '待办', exact: true });
  await taskRadio.focus(); await taskRadio.press('ArrowRight');
  assert.equal(await page.getByRole('radio', { name: '日程', exact: true }).evaluate(element => element === document.activeElement), true);
  await page.getByRole('radio', { name: '日程', exact: true }).press('ArrowLeft');
  await page.getByLabel('待办名称', { exact: true }).press('Enter');
  await page.getByRole('dialog', { name: '新增事项', exact: true }).waitFor({ state: 'hidden' });
  await page.keyboard.press('Control+f');
  await poll(async () => page.getByLabel('搜索事项', { exact: true }).evaluate(element => element === document.activeElement), 'Ctrl+F search focus');
  await page.getByLabel('搜索事项', { exact: true }).fill('快捷键新建事项');
  await page.getByRole('button', { name: '编辑 快捷键新建事项', exact: true }).waitFor();
  checks.push('fixed-size compact-style expanded creation, shared 待办/日程 control, half-hour time slots and quick save');

  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settingsDialog = page.getByRole('dialog', { name: '设置', exact: true });
  await screenshot('settings-general');
  const standardBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => /index.html/.test(window.webContents.getURL()) && !window.webContents.getURL().includes('window='))?.getBounds());
  assert.equal(await settingsDialog.getByRole('radio', { name: '标准', exact: true }).getAttribute('aria-checked'), 'true');
  await settingsDialog.getByRole('radio', { name: '窄版', exact: true }).click();
  await poll(() => page.evaluate(async () => (await window.desktop.state()).settings.mainWindowWidth === 'narrow' && innerWidth === 340), 'narrow width preset');
  const narrowBounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => /index.html/.test(window.webContents.getURL()) && !window.webContents.getURL().includes('window='))?.getBounds());
  assert.equal(narrowBounds.height, standardBounds.height, 'width preset keeps the current height');
  assert.ok(narrowBounds.x === standardBounds.x || narrowBounds.x + narrowBounds.width === standardBounds.x + standardBounds.width, 'width preset keeps one horizontal screen edge anchored');
  await screenshot('settings-general-narrow');
  await settingsDialog.getByRole('radio', { name: '标准', exact: true }).click();
  await poll(() => page.evaluate(async () => (await window.desktop.state()).settings.mainWindowWidth === 'standard' && innerWidth === 440), 'standard width preset');
  const generalSettingsBox = await settingsDialog.boundingBox();
  await page.getByRole('button', { name: '窗口宽度说明', exact: true }).hover();
  const generalTipFits = await page.evaluate(() => {
    const bubble = document.querySelector('.window-width-setting .help-tip-bubble');
    const modal = document.querySelector('.settings-modal');
    if (!bubble || !modal) return false;
    const b = bubble.getBoundingClientRect(); const m = modal.getBoundingClientRect();
    return getComputedStyle(bubble).display === 'block' && b.left >= m.left + 4 && b.right <= m.right - 4;
  });
  assert.equal(generalTipFits, true, 'general help tip bubble stays fully inside the settings modal');
  const sheetActionHeights = await page.evaluate(() => [...document.querySelectorAll('.sheet-card .actions > button')].map(button => Math.round(button.getBoundingClientRect().height)));
  assert.ok(sheetActionHeights.length === 2 && sheetActionHeights.every(height => height <= 24), `local data action buttons stay compact: ${JSON.stringify(sheetActionHeights)}`);
  assert.equal(await settingsDialog.getByRole('tab').count(), 2, 'settings only keeps the general and AI tabs');
  assert.equal(await settingsDialog.getByRole('tab', { name: '待办配置', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '悬浮入口说明', exact: true }).count(), 0, 'Dock settings are absent from the shipping UI');
  assert.equal(await page.getByRole('checkbox', { name: '显示悬浮入口', exact: true }).count(), 0);
  assert.equal((await page.evaluate(() => window.desktop.state())).settings.dockEnabled, false, 'runtime state reports the dormant Dock as disabled');
  await page.getByRole('tab', { name: 'AI配置', exact: true }).click();
  await page.getByRole('switch', { name: '启用 AI', exact: true }).waitFor();
  assert.deepEqual(await settingsDialog.boundingBox(), generalSettingsBox, 'settings dialog keeps the same bounds across tabs');
  await page.getByRole('switch', { name: '启用 AI', exact: true }).click();
  await page.getByText('开启 AI 前，请先添加供应商和模型', { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.state())).settings.aiEnabled, false);
  assert.equal(await page.getByRole('switch', { name: '启用 AI', exact: true }).getAttribute('aria-checked'), 'false', 'failed immediate save rolls switch back to persisted state');
  await page.getByRole('button', { name: '添加供应商', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '高级设置', exact: true }).count(), 0, 'protocol lives in the main flow, no advanced disclosure');
  assert.equal(await page.getByLabel('服务地址', { exact: true }).isVisible(), true);
  assert.equal(await page.getByLabel('服务协议', { exact: true }).isVisible(), true);
  await screenshot('settings-ai-simple');
  await choose('供应商类型', '自定义');
  await page.getByLabel('供应商名称', { exact: true }).fill('本地测试');
  await page.getByLabel('服务地址', { exact: true }).fill(`http://127.0.0.1:${server.address().port}/v1`);
  await choose('服务协议', 'OpenAI Chat Completions');
  await page.getByLabel('模型名称 / ID', { exact: true }).fill('test-model');
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await page.getByRole('button', { name: '模型 test-model 连接成功', exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.state())).settings.providers.length, 0, 'connection testing must not silently save a draft');
  await page.getByRole('button', { name: '添加并使用', exact: true }).click();
  await poll(async () => (await page.evaluate(() => window.desktop.state())).settings.models.length === 1, 'add provider and active model');
  const modelRowMetrics = await page.evaluate(() => {
    const row = document.querySelector('.model-list li');
    if (!row) return null;
    const buttons = [...row.querySelectorAll('button')].map(button => { const r = button.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    const name = row.querySelector('.category-name');
    const nameStyle = name ? getComputedStyle(name) : null;
    return { buttons, nameNowrap: nameStyle?.whiteSpace === 'nowrap', nameEllipsis: nameStyle?.textOverflow === 'ellipsis' };
  });
  assert.ok(modelRowMetrics, 'the created model renders a list row');
  assert.ok(modelRowMetrics.buttons.every(([w, h]) => w === 24 && h === 24), `model row action buttons use the 24px standard inline size: ${JSON.stringify(modelRowMetrics.buttons)}`);
  assert.ok(modelRowMetrics.nameNowrap && modelRowMetrics.nameEllipsis, 'model names stay on one line with an ellipsis');
  await page.getByRole('switch', { name: '启用 AI', exact: true }).click();
  await poll(async () => (await page.evaluate(() => window.desktop.state())).settings.aiEnabled, 'AI switch immediate save');
  await screenshot('settings-ai');
  await page.getByRole('button', { name: '完成', exact: true }).last().click();
  checks.push('fixed-size two-tab settings, persisted standard/narrow width presets, immediate persistence, advanced disclosure, local connection test and missing-model validation');

  await page.evaluate(() => window.desktop.assistant({ action: 'show', source: 'tray', animate: false }));
  await poll(async () => app.windows().some(window => window.url().includes('window=assistant')), 'standalone assistant window');
  const floatingAssistant = app.windows().find(window => window.url().includes('window=assistant'));
  await floatingAssistant.getByLabel('AI 对话输入', { exact: true }).waitFor();
  await poll(async () => await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(window => window.webContents.getURL().includes('window=assistant') && window.isVisible())), 'standalone assistant visible');
  await screenshot('assistant-standalone', floatingAssistant);
  await page.evaluate(() => window.desktop.assistant({ action: 'hide', animate: false }));
  checks.push('standalone tray assistant renders with the shared typography and composer');

  await openAssistant();
  await assistant.getByText('可以连续聊一件事', { exact: true }).waitFor();
  await assistant.getByLabel('AI 对话输入', { exact: true }).fill('检查我的事项');
  await assistant.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistant.getByText('已经读取你的事项，', { exact: true }).waitFor();
  assert.ok(requests.some(body => body.messages.some(message => message.role === 'tool')), 'actual tool result must return to model');
  await assistant.locator('.assistant-activity-row summary').filter({ hasText: '读取事项和标签' }).waitFor();
  await assistant.locator('.assistant-activity-row summary').filter({ hasText: '读取事项和标签' }).click();
  await assistant.locator('.assistant-activity-row > p').filter({ hasText: '下周产品评审' }).waitFor();
  await screenshot('assistant-streaming', assistant);
  releaseStream();
  await assistant.getByText('已经读取你的事项，这是逐步显示的完整回复。', { exact: true }).waitFor();
  await screenshot('assistant-tools', assistant);
  await assistant.getByLabel('AI 对话输入', { exact: true }).fill('安排待办');
  await assistant.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistant.getByRole('button', { name: '应用所选 1 项', exact: true }).waitFor();
  assert.equal(await assistant.getByLabel('历史对话', { exact: true }).isEnabled(), true, 'a pending proposal does not turn the conversation into a blocking modal');
  assert.equal(await assistant.getByLabel('AI 对话输入', { exact: true }).isEnabled(), true, 'a pending proposal can be refined through normal follow-up');
  await poll(async () => await assistant.getByRole('button', { name: '应用所选 1 项', exact: true }).evaluate(button => {
    const action = button.getBoundingClientRect();
    const viewport = button.closest('.chat-scroll').getBoundingClientRect();
    return action.top >= viewport.top && action.bottom <= viewport.bottom;
  }), 'pending proposal decision stays visible');
  await assistant.getByLabel('AI 对话输入', { exact: true }).fill('调整待办');
  await assistant.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistant.getByText('建议已根据后续对话更新。', { exact: true }).waitFor();
  await assistant.getByText('已根据你的追问更新', { exact: true }).waitFor();
  await assistant.getByRole('button', { name: '编辑', exact: true }).click();
  await assistant.getByLabel('待办标题', { exact: true }).fill('AI 手动编辑事项');
  await assistant.getByRole('button', { name: '保存修改', exact: true }).click();
  await assistant.getByText('AI 手动编辑事项', { exact: true }).waitFor();
  await screenshot('assistant-proposal', assistant);
  assert.equal((await page.evaluate(() => window.desktop.state())).tasks.some(item => item.title === 'AI 已确认事项'), false);
  await assistant.getByRole('button', { name: '应用所选 1 项', exact: true }).click();
  await assistant.getByText('已应用到事项。', { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.state())).tasks.some(item => item.title === 'AI 手动编辑事项'), true);
  await assistant.getByLabel('AI 对话输入', { exact: true }).fill('两项待办');
  await assistant.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistant.getByRole('button', { name: '应用所选 2 项', exact: true }).waitFor();
  await assistant.getByRole('button', { name: '取消选择 未选择的事项', exact: true }).click();
  await assistant.getByRole('button', { name: '应用所选 1 项', exact: true }).click();
  await assistant.getByText('已应用到事项。', { exact: true }).last().waitFor();
  assert.equal((await page.evaluate(() => window.desktop.state())).tasks.some(item => item.title === '选择应用的事项'), true);
  assert.equal((await page.evaluate(() => window.desktop.state())).tasks.some(item => item.title === '未选择的事项'), false);
  removeTargetId = (await page.evaluate(() => window.desktop.state())).tasks.find(item => item.title === 'AI 手动编辑事项').id;
  await assistant.getByLabel('AI 对话输入', { exact: true }).fill('删除待办');
  await assistant.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistant.getByRole('button', { name: '应用所选 1 项', exact: true }).waitFor();
  const removeCard = assistant.locator('.proposal-card').last();
  assert.equal(await removeCard.locator('small').first().textContent(), '删除事项', 'remove proposal card is flagged as deletion');
  await screenshot('assistant-remove-proposal', assistant);
  await assistant.getByRole('button', { name: '应用所选 1 项', exact: true }).click();
  await assistant.getByText('已应用到事项。', { exact: true }).last().waitFor();
  const removedTarget = (await page.evaluate(() => window.desktop.state())).tasks.find(item => item.id === removeTargetId);
  assert.equal(removedTarget.deletedAt !== null, true, 'confirmed remove action soft-deletes the task');
  await assistant.getByLabel('AI 对话输入', { exact: true }).fill('修改标签预览');
  await assistant.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistant.getByRole('button', { name: '应用所选 1 项', exact: true }).waitFor();
  const categoryProposal = assistant.locator('.proposal-card').last();
  await categoryProposal.getByText('工作', { exact: true }).waitFor();
  assert.equal(await categoryProposal.getByText('工作', { exact: true }).count(), 1, 'category update keeps the original label visible as the before value');
  await categoryProposal.getByText('重点工作', { exact: true }).first().waitFor();
  assert.equal(await categoryProposal.getByText('重点工作', { exact: true }).count(), 2, 'category update shows the proposed label in the card title and after value');
  await categoryProposal.getByText('#365f73', { exact: true }).waitFor();
  await categoryProposal.getByText('#8c5c45', { exact: true }).waitFor();
  await screenshot('assistant-category-update', assistant);
  await assistant.getByRole('button', { name: '放弃建议', exact: true }).click();
  await assistant.getByText('已放弃，没有修改事项。', { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.state())).categories.some(category => category.name === '重点工作'), false);
  checks.push('non-blocking proposal refinement, inline editing and selective confirmation only modify chosen tasks');
  await assistant.getByLabel('AI 对话输入', { exact: true }).fill('下次继续的草稿');
  await poll(async () => (await page.evaluate(() => window.desktop.chatOpen())).draft === '下次继续的草稿', 'conversation draft persistence');
  checks.push('real tool loop and intermediate streamed response');
  await app.close(); assistant = null;
  await launch();
  await openAssistant();
  await assistant.getByText('已经读取你的事项，这是逐步显示的完整回复。', { exact: true }).waitFor();
  assert.equal(await assistant.getByLabel('AI 对话输入', { exact: true }).inputValue(), '下次继续的草稿');
  await screenshot('assistant-restored', assistant);
  await assistant.getByRole('button', { name: '新对话', exact: true }).click();
  await assistant.getByRole('dialog', { name: '开始新对话？', exact: true }).waitFor();
  await assistant.getByRole('button', { name: '继续当前对话', exact: true }).click();
  assert.equal(await assistant.getByLabel('AI 对话输入', { exact: true }).inputValue(), '下次继续的草稿');
  await assistant.getByRole('button', { name: '新对话', exact: true }).click();
  await assistant.getByRole('button', { name: '开始新对话', exact: true }).click();
  await poll(async () => await assistant.locator('.chat-message').count() === 0, 'new session without deleting history');
  await assistant.getByLabel('历史对话', { exact: true }).click();
  await assistant.getByRole('button', { name: '删除 新对话', exact: true }).click();
  await assistant.getByRole('button', { name: '确认删除 新对话', exact: true }).click();
  await assistant.getByText('已经读取你的事项，这是逐步显示的完整回复。', { exact: true }).waitFor();
  await assistant.getByLabel('历史对话', { exact: true }).click();
  await assistant.getByRole('option', { name: '检查我的事项', exact: true }).click();
  await assistant.getByText('已经读取你的事项，这是逐步显示的完整回复。', { exact: true }).waitFor();
  assert.equal(await assistant.getByLabel('AI 对话输入', { exact: true }).inputValue(), '下次继续的草稿');
  checks.push('conversation and draft survive full Electron restart');
  checks.push('new conversation confirmation preserves historical conversations and drafts');
  await assistant.getByLabel('AI 对话输入', { exact: true }).fill('待确认事项');
  await assistant.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistant.getByRole('button', { name: '应用所选 1 项', exact: true }).waitFor();
  await app.close(); assistant = null;
  await launch(); await openAssistant();
  await assistant.getByText(/建议已过期|建议已失效|需要重新生成/).first().waitFor();
  assert.equal(await assistant.getByRole('button', { name: '应用所选 1 项', exact: true }).count(), 0);
  assert.equal((await page.evaluate(() => window.desktop.state())).tasks.some(item => item.title === 'AI 未确认事项'), false);
  checks.push('pending proposal expires safely after restart without applying');
  await resize(340, 480);
  await wait(300);
  await page.locator('.plan-today .plan-list, .plan-today .plan-tiles').evaluate(element => { element.scrollTop = 0; });
  const overlayFit = await page.evaluate(() => {
    const overlay = document.querySelector('.assistant-overlay')?.getBoundingClientRect();
    const todo = document.querySelector('.plan-today')?.getBoundingClientRect();
    const firstTodo = document.querySelector('.plan-today .plan-item')?.getBoundingClientRect();
    const conversation = document.querySelector('.assistant-overlay .ai-conversation')?.getBoundingClientRect();
    return { overlayTop: overlay?.top, overlayHeight: overlay?.height, overlayBottom: overlay?.bottom, todoTop: todo?.top, firstTodoBottom: firstTodo?.bottom, conversationHeight: conversation?.height, inner: innerHeight };
  });
  assert.ok(overlayFit.overlayHeight <= 520 && overlayFit.overlayBottom <= overlayFit.inner + 1 && overlayFit.firstTodoBottom + 4 <= overlayFit.overlayTop && overlayFit.conversationHeight >= 40, JSON.stringify(overlayFit));
  const overlayChrome = await page.locator('.assistant-overlay').evaluate(element => {
    const head = element.querySelector('.assistant-overlay-head');
    const date = document.querySelector('.date-heading h1');
    return {
      scan: getComputedStyle(element, '::after').content,
      borderBottom: head ? getComputedStyle(head).borderBottomWidth : '0px',
      dateTransform: date ? getComputedStyle(date).transform : 'none',
    };
  });
  assert.equal(overlayChrome.scan, 'none', 'opening the assistant does not sweep a light across the panel');
  assert.notEqual(overlayChrome.borderBottom, '0px', 'assistant title is separated from the conversation');
  assert.equal(overlayChrome.dateTransform, 'none', 'opening the assistant does not move the page behind it');
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(item => item.webContents.getURL().includes('window=assistant'))), false, 'main assistant stays inside the todo window');
  await screenshot('assistant-narrow');
  await page.getByRole('button', { name: '关闭 AI 助手', exact: true }).click();
  await poll(async () => await page.locator('.assistant-overlay').count() === 0, 'assistant overlay closes');

  await resize(340, 480);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await screenshot('main-narrow');
  assert.equal(await page.locator('.date-heading h1').evaluate(element => element.getBoundingClientRect().height <= parseFloat(getComputedStyle(element).lineHeight) * 1.5), true, 'date stays on one line in the narrow window');
  await page.keyboard.press('Control+n');
  await page.getByLabel('待办名称', { exact: true }).fill('短窗口表单');
  await screenshot('editor-narrow');
  assert.equal(await page.getByRole('button', { name: '创建', exact: true }).evaluate(element => {
    const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight;
  }), true, 'editor save action remains reachable');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  assert.equal(await page.getByLabel('待办名称', { exact: true }).inputValue(), '短窗口表单');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '放弃修改', exact: true }).click();
  await resize(440, 700);
  assert.equal(await page.getByRole('button', { name: '收起为图标', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /悬浮入口/ }).count(), 0, 'Dock control is absent from the shipping titlebar');
  await poll(() => app.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows().some(window => window.webContents.getURL().includes('window=dock'))), 'Dock window stays offline');
  await page.getByRole('button', { name: '最小化', exact: true }).click();
  await poll(() => app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    return !windows.some(w => w.webContents.getURL().includes('window=dock')) && !windows.some(w => /index.html/.test(w.webContents.getURL()) && !w.webContents.getURL().includes('window=') && w.isVisible());
  }), 'hidden main does not create a Dock window');
  await page.evaluate(() => window.desktop.window('show'));
  await poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(w => /index.html/.test(w.webContents.getURL()) && !w.webContents.getURL().includes('window=') && w.isVisible())), 'show main without Dock');
  checks.push('narrow editor, unsaved draft recovery and shipping Dock feature kept offline');
  assert.deepEqual(errors, []);
  const result = { result: 'passed', checks, screenshots: output };
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await screenshot('failure').catch(() => {});
  if (assistant) await screenshot('failure-assistant', assistant).catch(() => {});
  console.error(await page?.locator('body').innerText().catch(() => ''));
  throw error;
} finally {
  releaseStream?.();
  if (app) await app.close().catch(() => {});
  server.closeAllConnections(); server.close();
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
