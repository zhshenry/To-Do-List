import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import sharp from 'sharp';

const output = path.resolve('test-results'); await mkdir(output, { recursive: true });
const dataDir = await mkdtemp(path.join(output, 'desktop-'));
const env = { ...process.env, TODO_TEST: '1', TODO_TEST_DATA: dataDir }; delete env.ELECTRON_RUN_AS_NODE;
let app; let page; let assistantPage; const errors = [];
async function launch() {
  app = await electron.launch({ args: ['.'], env, timeout: 30000 });
  app.process().stderr.on('data', chunk => { const text = chunk.toString(); if (/Uncaught|ERR_MODULE|Cannot find/.test(text)) errors.push(text); });
  page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
  await page.waitForSelector('.agenda-heading');
}
async function waitFor(check, label) {
  for (let n = 0; n < 80; n++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(`Timed out: ${label}`);
}
const day = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const task = (title, extra = {}) => ({ title, kind: 'task', status: 'todo', priority: 'normal', plannedDate: day(), dueAt: null, remindAt: null, note: '', ...extra });
let server; let visualCategoryId;
try {
  await launch();
  assert.deepEqual(await page.evaluate(() => ({ node: typeof window.require, process: typeof window.process })), { node: 'undefined', process: 'undefined' });
  await page.getByText('To Do List', { exact: true }).waitFor();
  assert.equal(await page.locator('.brand-logo').evaluate(image => image.complete && image.naturalWidth > 0), true);
  await page.screenshot({ path: path.join(output, 'empty.png') });
  await page.getByRole('button', { name: '添加待办', exact: true }).click();
  await page.getByRole('button', { name: '保存事项' }).click();
  await page.getByRole('alert').getByText('请填写事项名称').waitFor();
  await page.getByLabel('事项名称', { exact: true }).fill('桌面测试事项');
  await page.getByRole('button', { name: '新建分类', exact: true }).click();
  await page.getByLabel('新分类名称', { exact: true }).fill('工作');
  await page.getByLabel('新分类颜色', { exact: true }).fill('#365f73');
  await page.getByRole('button', { name: '创建并选中', exact: true }).click();
  await page.getByLabel('类型', { exact: true }).selectOption('meeting');
  await page.getByLabel('优先级', { exact: true }).selectOption('high');
  await page.getByLabel('计划日期', { exact: true }).fill(day());
  await page.getByLabel('事项时间', { exact: false }).fill(`${day()}T23:59`);
  await page.getByLabel('提醒时间', { exact: false }).fill(`${day()}T23:49`);
  await page.getByRole('button', { name: '不提醒', exact: true }).click();
  await page.getByLabel('备注 / 进展', { exact: true }).fill('中文输入和原生日期字段测试');
  await page.getByRole('button', { name: '保存事项' }).click();
  await page.getByRole('button', { name: '编辑 桌面测试事项', exact: true }).waitFor();
  const created = (await page.evaluate(() => window.desktop.state())).tasks.find(t => t.title === '桌面测试事项');
  assert.equal(created.kind, 'meeting'); assert.equal(created.priority, 'high'); assert.equal(created.remindAt, null);
  assert.equal((await page.evaluate(() => window.desktop.state())).categories.find(c => c.id === created.categoryId).name, '工作');
  await page.getByLabel('按分类筛选').selectOption({ label: '工作' });
  await page.getByRole('button', { name: '编辑 桌面测试事项', exact: true }).waitFor();
  await page.getByLabel('按分类筛选').selectOption('all');
  assert.equal(new Date(created.dueAt).getHours(), 23);
  await page.getByLabel('快速添加待办').fill('输入法尚未确认');
  await page.getByLabel('快速添加待办').dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true });
  assert.equal((await page.evaluate(() => window.desktop.state())).tasks.some(t => t.title === '输入法尚未确认'), false);
  await page.getByLabel('快速添加待办').fill('快速默认值'); await page.getByLabel('快速添加待办').press('Enter');
  await page.getByRole('button', { name: '编辑 快速默认值', exact: true }).waitFor();
  const quick = (await page.evaluate(() => window.desktop.state())).tasks.find(t => t.title === '快速默认值');
  assert.equal(quick.plannedDate, day()); assert.equal(quick.categoryId, null); assert.equal(quick.dueAt, null); assert.equal(quick.remindAt, null);
  await page.getByRole('button', { name: '完成 桌面测试事项', exact: true }).click();
  await page.getByRole('button', { name: '恢复待办 桌面测试事项', exact: true }).waitFor();
  await page.getByRole('button', { name: '编辑 桌面测试事项', exact: true }).click();
  await page.getByLabel('事项名称', { exact: true }).fill('已编辑的事项');
  await page.getByRole('button', { name: '保存事项' }).click();
  await page.getByRole('button', { name: '编辑 已编辑的事项', exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '确认删除', exact: true }).click();
  await page.getByRole('button', { name: '全部事项', exact: true }).click();
  await page.getByRole('button', { name: '已删除', exact: true }).click();
  await page.getByRole('button', { name: '恢复 已编辑的事项', exact: true }).click();
  await page.getByRole('button', { name: '返回今天', exact: true }).click();
  await page.getByRole('button', { name: '编辑 已编辑的事项', exact: true }).waitFor();
  const alarmState = await page.evaluate(t => window.desktop.create(t), task('隐藏窗口提醒', { remindAt: new Date(Date.now() + 1400).toISOString() }));
  const alarm = alarmState.tasks.find(t => t.title === '隐藏窗口提醒');
  await page.getByRole('button', { name: '隐藏到托盘' }).click();
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  await waitFor(async () => { try { return (await readFile(path.join(dataDir, 'notifications.jsonl'), 'utf8')).includes(alarm.id); } catch { return false; } }, 'background reminder');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await page.getByRole('button', { name: '稍后10分钟' }).click();
  const snoozed = await page.evaluate(id => window.desktop.state().then(s => s.tasks.find(t => t.id === id)), alarm.id);
  assert.ok(Date.parse(snoozed.remindAt) > Date.now() + 590000);
  await page.evaluate(async id => { const s = await window.desktop.state(); const t = s.tasks.find(t => t.id === id); await window.desktop.remove(t.id, t.updatedAt); }, alarm.id);
  await app.close(); await launch();
  assert.ok((await page.evaluate(() => window.desktop.state())).tasks.some(t => t.title === '已编辑的事项'));
  let aiStatus = 200; const aiRequests = [];
  server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); aiRequests.push(body);
    const message = body.messages.at(-1)?.content;
    res.statusCode = aiStatus; res.setHeader('Content-Type', 'application/json');
    const plan = message === '明天下午三点产品评审' ? { message: '你希望提前多久提醒？', actions: [] }
      : message === '提前10分钟' ? { message: '好的，我准备创建这条事项。', actions: [{ type: 'create', task: task('连续对话事项') }] }
      : message === '明天下午安排产品评审' ? { message: '具体几点？需要提前提醒吗？', actions: [] }
      : message === '15:00，提前10分钟' ? { message: '好的，我整理成以下事项。', actions: [{ type: 'create', task: task('产品评审', { plannedDate: '2026-09-15', dueAt: '2026-09-15T15:00:00+08:00', remindAt: '2026-09-15T14:50:00+08:00', categoryId: visualCategoryId }) }] }
      : message === '创建要放弃的事项' ? { message: '这条建议需要你确认。', actions: [{ type: 'create', task: task('不应创建事项') }] }
      : message === '失败后保留输入' ? { message: '重试成功，输入内容已经保留。', actions: [] }
      : { message: '已识别一条待办，请确认。', actions: [{ type: 'create', task: task('AI 测试事项') }] };
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByText('当前分类', { exact: true }).waitFor();
  assert.equal(await page.locator('.category-directory-heading').getByText('1 个', { exact: true }).count(), 1);
  const categoryRow = page.locator('.category-row').first();
  await categoryRow.getByRole('button', { name: '编辑分类 工作', exact: true }).click();
  await categoryRow.getByLabel('分类名称 工作', { exact: true }).fill('项目');
  await categoryRow.getByRole('button', { name: '保存分类 工作', exact: true }).click();
  assert.ok((await page.evaluate(() => window.desktop.state())).categories.some(category => category.name === '项目'));
  const renamedRow = page.locator('.category-row').filter({ hasText: '项目' });
  await renamedRow.getByRole('button', { name: '删除分类 项目', exact: true }).click();
  await renamedRow.getByRole('button', { name: '确认删除分类 项目', exact: true }).click();
  const categoryDeleted = await page.evaluate(() => window.desktop.state());
  assert.equal(categoryDeleted.categories.some(category => category.name === '项目'), false);
  assert.equal(categoryDeleted.tasks.find(task => task.title === '已编辑的事项').categoryId, null);
  await page.getByText('当前还没有分类', { exact: true }).waitFor();
  assert.equal(await page.locator('.category-directory-heading').getByText('0 个', { exact: true }).count(), 1);
  assert.equal(await page.getByLabel('服务地址', { exact: true }).count(), 0, 'AI settings should start collapsed');
  await page.locator('.disclosure-button').click();
  await page.getByLabel('启用 AI', { exact: true }).check();
  await page.getByLabel('服务地址', { exact: true }).fill(endpoint);
  await page.getByLabel('模型名称', { exact: true }).fill('test-model');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  const assistantWindow = app.waitForEvent('window');
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  assistantPage = await assistantWindow; assistantPage.on('pageerror', error => errors.push(error.message));
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).waitFor();
  assert.equal(await page.locator('.agenda').isVisible(), true, 'main task list stays visible while assistant is open');
  assert.equal(await page.locator('.ai-conversation').count(), 0, 'assistant conversation must not replace the task list');
  const assistantWindowContract = await app.evaluate(({ BrowserWindow }) => {
    const assistant = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('window=assistant'));
    return { resizable: assistant.isResizable(), minimum: assistant.getMinimumSize(), maximum: assistant.getMaximumSize() };
  });
  assert.deepEqual(assistantWindowContract, { resizable: true, minimum: [320, 420], maximum: [620, 820] });
  assert.equal(await assistantPage.locator('.assistant-titlebar').evaluate(element => getComputedStyle(element).webkitAppRegion), 'drag');
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('明天下午三点产品评审');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  const firstReply = assistantPage.getByText('你希望提前多久提醒？', { exact: true });
  await firstReply.or(assistantPage.getByRole('alert')).waitFor();
  assert.equal(await assistantPage.getByRole('alert').count(), 0, await assistantPage.locator('body').innerText());
  await firstReply.waitFor();
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('提前10分钟');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistantPage.getByRole('button', { name: '应用 1 项操作', exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.state())).tasks.some(t => t.title === '连续对话事项'), false);
  assert.equal(await assistantPage.getByLabel('AI 对话输入', { exact: true }).isDisabled(), true);
  assert.deepEqual(aiRequests.at(-1).messages.slice(-3).map(message => [message.role, message.content]), [['user', '明天下午三点产品评审'], ['assistant', '你希望提前多久提醒？'], ['user', '提前10分钟']]);
  await assistantPage.screenshot({ path: path.join(output, 'ai-floating-conversation.png') });
  await assistantPage.getByRole('button', { name: '应用 1 项操作', exact: true }).click();
  await assistantPage.getByText('已应用到待办。', { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.state())).tasks.some(t => t.title === '连续对话事项'), true);
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('创建要放弃的事项');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistantPage.getByRole('button', { name: '放弃建议', exact: true }).click();
  await assistantPage.getByText('已放弃，没有修改事项。', { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.state())).tasks.some(t => t.title === '不应创建事项'), false);
  aiStatus = 401;
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('失败后保留输入');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistantPage.getByRole('alert').getByText(/模型认证失败/).waitFor();
  assert.equal(await assistantPage.getByLabel('AI 对话输入', { exact: true }).inputValue(), '失败后保留输入');
  aiStatus = 200; await assistantPage.getByRole('button', { name: '重试', exact: true }).click();
  await assistantPage.getByText('重试成功，输入内容已经保留。', { exact: true }).waitFor();
  await assistantPage.getByRole('button', { name: '关闭 AI 助手', exact: true }).click();
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).waitFor();
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('window=assistant')).isVisible()), false);
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  await assistantPage.getByText('重试成功，输入内容已经保留。', { exact: true }).waitFor();
  await assistantPage.getByRole('button', { name: '新对话', exact: true }).click();
  await assistantPage.getByText('可以连续聊一件事', { exact: true }).waitFor();
  assert.equal(await assistantPage.getByText('你希望提前多久提醒？', { exact: true }).count(), 0);
  await assistantPage.getByRole('button', { name: '关闭 AI 助手', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.toast')?.textContent);
  await page.locator('.date-heading').click();
  // Visual fixture lives only in the isolated test database, never the user's profile.
  await page.evaluate(async () => { const state = await window.desktop.state(); for (const t of state.tasks.filter(t => !t.deletedAt)) await window.desktop.remove(t.id, t.updatedAt); });
  await page.clock.install({ time: new Date('2026-09-14T11:30:00+08:00') });
  const fixtureCategories = await page.evaluate(async () => {
    let state = await window.desktop.state();
    if (!state.categories.some(category => category.name === '工作')) state = await window.desktop.createCategory({ name: '工作', color: '#365f73' });
    if (!state.categories.some(category => category.name === '生活')) state = await window.desktop.createCategory({ name: '生活', color: '#b55232' });
    return Object.fromEntries(state.categories.map(category => [category.name, category.id]));
  });
  visualCategoryId = fixtureCategories['工作'];
  for (const t of [task('产品评审', { plannedDate: '2026-09-14', kind: 'meeting', dueAt: '2026-09-14T15:00:00+08:00', remindAt: '2026-09-14T14:50:00+08:00', categoryId: fixtureCategories['工作'] }), task('完成项目报告', { plannedDate: '2026-09-14', dueAt: '2026-09-14T17:00:00+08:00', categoryId: fixtureCategories['工作'] }), task('整理收件箱', { plannedDate: '2026-09-14', status: 'done', dueAt: '2026-09-14T10:00:00+08:00', categoryId: fixtureCategories['生活'] })]) await page.evaluate(t => window.desktop.create(t), t);
  await page.clock.runFor(10000);
  await page.getByText('产品评审').first().waitFor();
  await page.screenshot({ path: path.join(output, 'expanded.png') });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'settings-collapsed.png') });
  await page.locator('.disclosure-button').click();
  await page.screenshot({ path: path.join(output, 'settings-ai-expanded.png') });
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '收起为小条' }).click();
  await page.waitForSelector('.compact');
  await page.screenshot({ path: path.join(output, 'compact.png') });
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => !window.webContents.getURL().includes('window=assistant')).getBounds().height), 116);
  await page.getByRole('button', { name: '展开面板', exact: true }).click();
  await page.waitForSelector('.agenda');
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(window => !window.webContents.getURL().includes('window=assistant')); w.setResizable(true); w.setBounds({ width: 340, height: 540 }); });
  await page.screenshot({ path: path.join(output, 'narrow.png') });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  assert.equal(await page.locator('.compose').evaluate(el => el.getBoundingClientRect().bottom <= window.innerHeight), true);
  await page.getByRole('button', { name: '添加待办', exact: true }).click();
  await page.getByLabel('事项名称', { exact: true }).fill('未保存的输入');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: '放弃未保存的修改' }).waitFor();
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  assert.equal(await page.getByLabel('事项名称', { exact: true }).inputValue(), '未保存的输入');
  await page.screenshot({ path: path.join(output, 'editor-narrow.png') });
  assert.equal(await page.getByRole('button', { name: '保存事项' }).evaluate(el => {
    const box = el.getBoundingClientRect(), modal = el.closest('dialog').getBoundingClientRect();
    return box.bottom <= modal.bottom && box.top >= modal.top;
  }), true, 'save button must not be clipped in short windows');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '放弃修改', exact: true }).click();

  await app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(window => !window.webContents.getURL().includes('window=assistant'));
    main.setBounds({ x: 80, y: 80, width: 440, height: 700 });
  });
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('明天下午安排产品评审');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistantPage.getByText('具体几点？需要提前提醒吗？', { exact: true }).waitFor();
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('15:00，提前10分钟');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistantPage.getByRole('button', { name: '应用 1 项操作', exact: true }).waitFor();
  await app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    const main = windows.find(window => !window.webContents.getURL().includes('window=assistant'));
    const assistant = windows.find(window => window.webContents.getURL().includes('window=assistant'));
    main.setBounds({ x: 80, y: 80, width: 440, height: 700 });
    assistant.setBounds({ x: 532, y: 120, width: 380, height: 620 });
  });
  const mainFloatingPath = path.join(output, 'floating-main.png');
  const assistantFloatingPath = path.join(output, 'floating-assistant.png');
  await page.screenshot({ path: mainFloatingPath });
  await assistantPage.screenshot({ path: assistantFloatingPath });
  const mainPng = await sharp(mainFloatingPath).resize({ width: 440, height: 700, fit: 'fill' }).png().toBuffer();
  const assistantPng = await sharp(assistantFloatingPath).resize({ width: 380, height: 620, fit: 'fill' }).png().toBuffer();
  await sharp({ create: { width: 1010, height: 780, channels: 4, background: '#e8e5df' } })
    .composite([{ input: mainPng, left: 64, top: 40 }, { input: assistantPng, left: 556, top: 80 }])
    .png().toFile(path.join(output, 'floating-workspace.png'));

  await app.evaluate(({ BrowserWindow }) => {
    const assistant = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('window=assistant'));
    assistant.setBounds({ width: 320, height: 420 });
  });
  assert.equal(await assistantPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  assert.equal(await assistantPage.locator('.assistant-footer').evaluate(element => element.getBoundingClientRect().bottom <= window.innerHeight), true);
  await assistantPage.screenshot({ path: path.join(output, 'assistant-narrow.png') });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'passed', checks: ['branding', 'category create + edit + filter + safe delete', 'quick-add defaults', 'CRUD + restore', 'SQLite restart persistence', 'hidden-window reminder dispatch', 'snooze', 'AI settings disclosure', 'independent AI floating window', 'AI multi-turn context', 'AI inline preview + apply + discard', 'AI error retry', 'session conversation reset', 'assistant resize contract', 'sandbox isolation', 'compact window', 'narrow layout', 'unsaved draft recovery', 'floating workspace visual fixture'], dataDir, screenshots: output }, null, 2));
} finally { if (app) await app.close().catch(() => {}); if (server) { server.closeAllConnections(); server.close(); } }
