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
  await page.waitForSelector('.today-board');
}
async function waitFor(check, label) {
  for (let n = 0; n < 80; n++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(`Timed out: ${label}`);
}
async function finishMotion() {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      try { animation.finish(); } catch { /* already finished */ }
    }
  });
}
const day = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
async function choose(label, optionName) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}
const task = (title, extra = {}) => ({ title, kind: 'task', status: 'todo', priority: 'medium', plannedDate: day(), dueAt: null, remindAt: null, note: '', ...extra });
function messageText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => typeof part === 'string' ? part : part?.text || '').join('');
}
function writeChatSse(res, text, status = 200) {
  res.statusCode = status;
  if (status !== 200) { res.end('unauthorized'); return; }
  res.setHeader('Content-Type', 'text/event-stream');
  const id = 'chatcmpl-desktop';
  const parts = [];
  for (let index = 0; index < text.length; index += 8) parts.push(text.slice(index, index + 8));
  for (const [index, part] of parts.entries()) {
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { ...(index === 0 ? { role: 'assistant' } : {}), content: part }, finish_reason: null }] })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } })}\n\n`);
  res.end('data: [DONE]\n\n');
}
let server; let visualCategoryId;
try {
  await launch();
  assert.deepEqual(await page.evaluate(() => ({ node: typeof window.require, process: typeof window.process })), { node: 'undefined', process: 'undefined' });
  await page.getByText('To Do List', { exact: true }).waitFor();
  // Electron 44 removed isSkipTaskbar(); taskbar presence is asserted via the anchor window (visible window with no loaded URL).
  await waitFor(async () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(window => !window.webContents.getURL() && window.isVisible())), 'taskbar host');
  assert.equal(await page.locator('.brand-logo svg').evaluate(svg => svg instanceof SVGElement && svg.viewBox.baseVal.width === 24), true);
  await page.locator('.brand-logo').hover();
  assert.equal(await page.locator('.brand-logo-orbit').evaluate(node => getComputedStyle(node).animationName), 'brand-dot-spin');
  await page.screenshot({ path: path.join(output, 'empty.png') });
  assert.equal(await page.getByLabel('AI 事项输入', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '发送给 AI', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '打开 AI 助手', exact: true }).count(), 1);
  await page.getByRole('button', { name: '添加待办', exact: true }).click();
  const createButton = page.getByRole('button', { name: '创建', exact: true });
  assert.equal(await createButton.isDisabled(), true);
  await page.getByLabel('待办名称', { exact: true }).fill('桌面测试事项');
  assert.equal(await createButton.isEnabled(), true);
  await page.getByRole('button', { name: '标签：无标签', exact: true }).click();
  await page.getByRole('button', { name: '新建标签', exact: true }).click();
  await page.getByLabel('新标签名称', { exact: true }).fill('工作');
  const tagColors = page.getByRole('group', { name: '新标签颜色', exact: true }).getByRole('button', { name: /^选择颜色 / });
  assert.equal(await tagColors.count(), 16);
  await tagColors.nth(7).click();
  await page.getByRole('button', { name: '创建并选中', exact: true }).click();
  await page.getByRole('button', { name: /^优先级：/ }).click();
  await page.getByRole('combobox', { name: '优先级', exact: true }).click();
  assert.deepEqual(await page.getByRole('option').allTextContents(), ['高', '中', '低']);
  await page.getByRole('option', { name: '高', exact: true }).click();
  await page.getByRole('radio', { name: '日程', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: /^优先级：/ }).count(), 0);
  await createButton.click();
  await page.getByRole('alert').getByText('请填写日程时间').waitFor();
  await page.getByLabel('日期', { exact: true }).click();
  await page.getByRole('dialog', { name: '选择日期' }).waitFor();
  await page.getByRole('button', { name: '今天', exact: true }).click();
  await page.getByLabel('时间', { exact: true }).click();
  const timeOptions = page.getByRole('listbox', { name: '时间', exact: true });
  await timeOptions.waitFor();
  assert.equal(await timeOptions.getByRole('option').count(), 49);
  await timeOptions.getByRole('option', { name: '23:30', exact: true }).click();
  await timeOptions.waitFor({ state: 'hidden' });
  assert.equal(await page.getByLabel('提醒时间', { exact: false }).count(), 0);
  await page.getByRole('switch', { name: '提醒', exact: true }).click();
  await page.getByLabel('提醒时间', { exact: false }).fill(`${day()}T23:49`);
  await page.getByRole('switch', { name: '提醒', exact: true }).click();
  await page.getByRole('button', { name: /^更多设置：/ }).click();
  await page.getByLabel('备注 / 进展', { exact: true }).fill('中文输入和原生日期字段测试');
  await createButton.click();
  await page.getByRole('dialog', { name: '新增事项' }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '编辑 桌面测试事项', exact: true }).waitFor();
  const created = (await page.evaluate(() => window.desktop.state())).tasks.find(t => t.title === '桌面测试事项');
  assert.equal(created.kind, 'meeting'); assert.equal(created.priority, 'high'); assert.equal(created.remindAt, null);
  assert.equal((await page.evaluate(() => window.desktop.state())).categories.find(c => c.id === created.categoryId).name, '工作');
  assert.equal(new Date(created.dueAt).getHours(), 23);
  await page.getByRole('button', { name: '完成 桌面测试事项', exact: true }).click();
  await page.getByRole('button', { name: '恢复待办 桌面测试事项', exact: true }).waitFor();
  await page.getByRole('button', { name: '编辑 桌面测试事项', exact: true }).click();
  await page.getByLabel('日程名称', { exact: true }).fill('已编辑的事项');
  await page.getByRole('button', { name: '保存日程' }).click();
  await page.getByRole('button', { name: '编辑 已编辑的事项', exact: true }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  const confirmDelete = page.getByRole('button', { name: '确认删除', exact: true });
  await confirmDelete.waitFor();
  assert.equal(await confirmDelete.evaluate(element => element.classList.contains('shake')), true);
  await confirmDelete.click();
  const removed = (await page.evaluate(() => window.desktop.state())).tasks.find(t => t.title === '已编辑的事项');
  assert.ok(removed.deletedAt);
  await page.evaluate(id => window.desktop.restore(id), removed.id);
  await page.getByRole('button', { name: '编辑 已编辑的事项', exact: true }).waitFor();
  const alarmState = await page.evaluate(t => window.desktop.create(t), task('隐藏窗口提醒', { remindAt: new Date(Date.now() + 1400).toISOString() }));
  const alarm = alarmState.tasks.find(t => t.title === '隐藏窗口提醒');
  await page.getByRole('button', { name: '最小化' }).click();
  assert.deepEqual(await app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(window => { const url = window.webContents.getURL(); return url && !url.includes('window=assistant') && !url.includes('window=dock'); });
    return { visible: main.isVisible(), taskbarEntry: BrowserWindow.getAllWindows().some(window => !window.webContents.getURL() && window.isVisible()) };
  }), { visible: false, taskbarEntry: false });
  await waitFor(async () => { try { return (await readFile(path.join(dataDir, 'notifications.jsonl'), 'utf8')).includes(alarm.id); } catch { return false; } }, 'background reminder');
  await app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(window => { const url = window.webContents.getURL(); return url && !url.includes('window=assistant') && !url.includes('window=dock'); });
    main.show();
  });
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
    const message = messageText(body.messages.at(-1)?.content);
    const plan = message === '明天下午三点产品评审' ? { message: '你希望提前多久提醒？', actions: [] }
      : message === '提前10分钟' ? { message: '好的，我准备创建这条事项。', actions: [{ type: 'create', task: task('连续对话事项') }] }
      : message === '改到下午四点' ? { message: '已把这条建议调整到下午四点。', actions: [{ type: 'create', task: task('连续对话事项', { dueAt: new Date(`${day()}T16:00:00`).toISOString() }) }] }
      : message === '创建两项待办' ? { message: '我整理了两条独立建议，你可以分别选择。', actions: [{ type: 'create', task: task('只应用这一项') }, { type: 'create', task: task('不要应用这一项') }] }
      : message === '明天下午安排产品评审' ? { message: '具体几点？需要提前提醒吗？', actions: [] }
      : message === '15:00，提前10分钟' ? { message: '好的，我整理成以下事项。', actions: [{ type: 'create', task: task('产品评审', { plannedDate: '2026-09-15', dueAt: '2026-09-15T15:00:00+08:00', remindAt: '2026-09-15T14:50:00+08:00', categoryId: visualCategoryId }) }] }
      : message === '创建要放弃的事项' ? { message: '这条建议需要你确认。', actions: [{ type: 'create', task: task('不应创建事项') }] }
      : message === '失败后保留输入' ? { message: '重试成功，输入内容已经保留。', actions: [] }
      : message === '新建分类学习' ? { message: '将新增一个分类。', actions: [{ type: 'create_category', category: { id: '22222222-2222-4222-8222-222222222222', name: '学习', color: '#335577' } }] }
      : message === '切换到默认模型' ? { message: '当前使用默认模型。', actions: [] }
      : message === '切换到备用模型' ? { message: '当前使用备用模型。', actions: [] }
      : { message: '已识别一条待办，请确认。', actions: [{ type: 'create', task: task('AI 测试事项') }] };
    writeChatSse(res, JSON.stringify(plan), aiStatus);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await finishMotion();
  const settingsDialog = page.getByRole('dialog', { name: '设置', exact: true });
  const generalSettingsBox = await settingsDialog.boundingBox();
  assert.equal(await page.getByRole('button', { name: '悬浮入口说明', exact: true }).count(), 0);
  assert.equal(await page.getByRole('checkbox', { name: '显示悬浮入口', exact: true }).count(), 0);
  assert.equal((await page.evaluate(() => window.desktop.state())).settings.dockEnabled, false);
  assert.equal(await settingsDialog.getByRole('tab').count(), 2);
  assert.equal(await settingsDialog.getByRole('tab', { name: '待办配置', exact: true }).count(), 0);
  assert.equal(await page.getByLabel('服务地址', { exact: true }).count(), 0, 'AI settings live on the AI tab');
  await page.getByRole('tab', { name: 'AI配置', exact: true }).click();
  await finishMotion();
  await page.getByLabel('启用 AI', { exact: true }).waitFor();
  assert.deepEqual(await settingsDialog.boundingBox(), generalSettingsBox, 'settings dialog keeps the same bounds across tabs');
  await page.getByLabel('启用 AI', { exact: true }).check();
  await page.getByRole('button', { name: '添加供应商', exact: true }).click();
  await page.getByLabel('供应商名称', { exact: true }).fill('测试');
  await page.getByRole('button', { name: '高级设置', exact: true }).click();
  await page.getByLabel('服务协议', { exact: true }).click();
  assert.deepEqual(await page.getByRole('option').allTextContents(), ['OpenAI Chat Completions', 'OpenAI Responses', 'Anthropic Messages']);
  await page.getByRole('option', { name: 'OpenAI Responses', exact: true }).click();
  await choose('服务协议', 'OpenAI Chat Completions');
  await page.getByLabel('服务地址', { exact: true }).fill(endpoint);
  await page.getByText(/当前使用 HTTP：API Key/).waitFor();
  await page.getByLabel('模型名称 / ID', { exact: true }).fill('test-model');
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await page.getByText('模型 test-model 连接成功', { exact: true }).waitFor();
  await page.getByRole('button', { name: '添加并使用', exact: true }).click();
  await page.getByLabel('启用 AI', { exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).last().click();
  const savedAi = await page.evaluate(() => window.desktop.state());
  assert.equal(savedAi.settings.profiles.length, 1);
  assert.equal(savedAi.settings.profiles[0].model, 'test-model');
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  await waitFor(async () => { assistantPage = app.windows().find(window => window.url().includes('window=assistant')); return !!assistantPage; }, 'assistant window');
  assistantPage.on('pageerror', error => errors.push(error.message));
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).waitFor();
  assert.equal(await page.locator('.today-board').isVisible(), true, 'main task list stays visible while assistant is open');
  await waitFor(async () => app.evaluate(({ BrowserWindow }) => {
    const assistant = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('window=assistant'));
    return !!assistant && assistant.isVisible() && assistant.getOpacity() >= 0.99;
  }), 'assistant open fade');
  // The assistant never creates an additional taskbar entry; the host may be absent when this legacy flow persisted a hidden main window before restart.
  assert.equal(await app.evaluate(({ BrowserWindow }) => {
    const assistant = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('window=assistant'));
    return assistant.isVisible() && BrowserWindow.getAllWindows().filter(window => !window.webContents.getURL() && window.isVisible()).length <= 1;
  }), true);
  assert.equal(await page.locator('.ai-conversation').count(), 0, 'assistant conversation must not replace the task list');
  const assistantWindowContract = await app.evaluate(({ BrowserWindow }) => {
    const assistant = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('window=assistant'));
    return { resizable: assistant.isResizable(), minimum: assistant.getMinimumSize(), maximum: assistant.getMaximumSize() };
  });
  assert.deepEqual(assistantWindowContract, { resizable: true, minimum: [320, 420], maximum: [620, 820] });
  assert.equal(await assistantPage.locator('.assistant-titlebar').evaluate(element => getComputedStyle(element).webkitAppRegion), 'drag');
  assert.ok(['left', 'right', 'top', 'bottom'].includes(await assistantPage.locator('.assistant-shell').getAttribute('data-tail') || ''));
  assert.equal(await page.getByLabel('AI 事项输入', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '发送给 AI', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '隐藏 AI 助手', exact: true }).count(), 1);
  await assistantPage.getByText('可以连续聊一件事', { exact: true }).waitFor();
  await assistantPage.getByLabel('当前模型', { exact: true }).waitFor();
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('明天下午三点产品评审');
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).press('Enter');
  await assistantPage.locator('.chat-message.user').getByText('明天下午三点产品评审', { exact: true }).waitFor();
  assert.equal(await assistantPage.getByLabel('AI 对话输入', { exact: true }).inputValue(), '');
  const firstReply = assistantPage.getByText('你希望提前多久提醒？', { exact: true });
  await firstReply.or(assistantPage.getByRole('alert')).waitFor();
  assert.equal(await assistantPage.getByRole('alert').count(), 0, await assistantPage.locator('body').innerText());
  await firstReply.waitFor();
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('提前10分钟');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistantPage.getByRole('button', { name: '应用所选 1 项', exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.state())).tasks.some(t => t.title === '连续对话事项'), false);
  assert.equal(await assistantPage.getByLabel('AI 对话输入', { exact: true }).isEnabled(), true);
  assert.deepEqual(aiRequests.at(-1).messages.filter(message => message.role !== 'system').slice(-3).map(message => [message.role, messageText(message.content)]), [['user', '明天下午三点产品评审'], ['assistant', '你希望提前多久提醒？'], ['user', '提前10分钟']]);
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('改到下午四点');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistantPage.getByText('已把这条建议调整到下午四点。', { exact: true }).waitFor();
  await assistantPage.getByText('建议已根据后续对话更新。', { exact: true }).waitFor();
  await assistantPage.getByText('已根据你的追问更新', { exact: true }).waitFor();
  await assistantPage.getByRole('button', { name: '编辑', exact: true }).click();
  await assistantPage.getByLabel('待办标题', { exact: true }).fill('连续对话事项（手动编辑）');
  await assistantPage.getByRole('button', { name: '保存修改', exact: true }).click();
  await assistantPage.getByText('连续对话事项（手动编辑）', { exact: true }).waitFor();
  await assistantPage.screenshot({ path: path.join(output, 'ai-floating-conversation.png') });
  await assistantPage.getByRole('button', { name: '应用所选 1 项', exact: true }).click();
  await assistantPage.getByText('已应用到事项。', { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.state())).tasks.some(t => t.title === '连续对话事项（手动编辑）'), true);
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('创建两项待办');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistantPage.getByRole('button', { name: '应用所选 2 项', exact: true }).waitFor();
  await assistantPage.getByRole('button', { name: '取消选择 不要应用这一项', exact: true }).click();
  await assistantPage.getByRole('button', { name: '应用所选 1 项', exact: true }).click();
  await assistantPage.getByText('已应用到事项。', { exact: true }).last().waitFor();
  assert.equal((await page.evaluate(() => window.desktop.state())).tasks.some(t => t.title === '只应用这一项'), true);
  assert.equal((await page.evaluate(() => window.desktop.state())).tasks.some(t => t.title === '不要应用这一项'), false);
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('创建要放弃的事项');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistantPage.getByRole('button', { name: '放弃建议', exact: true }).click();
  await assistantPage.getByText('已放弃，没有修改事项。', { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.state())).tasks.some(t => t.title === '不应创建事项'), false);
  aiStatus = 401;
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('失败后保留输入');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistantPage.getByRole('alert').getByText(/模型认证失败/).first().waitFor();
  assert.equal(await assistantPage.getByLabel('AI 对话输入', { exact: true }).inputValue(), '失败后保留输入');
  aiStatus = 200; await assistantPage.getByRole('button', { name: '重试', exact: true }).click();
  await assistantPage.getByText('重试成功，输入内容已经保留。', { exact: true }).waitFor();
  await assistantPage.getByRole('button', { name: '关闭 AI 助手', exact: true }).click();
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).waitFor();
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('window=assistant')).isVisible()), false);
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  await assistantPage.getByText('重试成功，输入内容已经保留。', { exact: true }).waitFor();
  await assistantPage.getByRole('button', { name: '新对话', exact: true }).click();
  await assistantPage.getByRole('button', { name: '开始新对话', exact: true }).click();
  await assistantPage.getByText('可以连续聊一件事', { exact: true }).waitFor();
  assert.equal(await assistantPage.getByText('你希望提前多久提醒？', { exact: true }).count(), 0);
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('新建分类学习');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistantPage.getByText('新增标签', { exact: true }).waitFor();
  await assistantPage.getByRole('button', { name: '应用所选 1 项', exact: true }).click();
  await assistantPage.getByText('已应用到事项。', { exact: true }).last().waitFor();
  assert.ok((await page.evaluate(() => window.desktop.state())).categories.some(category => category.name === '学习'));
  await page.evaluate(async () => {
    const state = await window.desktop.state();
    const category = state.categories.find(item => item.name === '学习');
    if (category) await window.desktop.removeCategory(category.id, category.updatedAt);
  });
  await assistantPage.getByRole('button', { name: '关闭 AI 助手', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('tab', { name: 'AI配置', exact: true }).click();
  await page.getByRole('button', { name: '添加模型', exact: true }).click();
  await page.getByLabel('模型名称 / ID', { exact: true }).fill('other-model');
  await page.getByRole('button', { name: '添加模型', exact: true }).click();
  await page.getByRole('list', { name: '测试 的模型' }).getByText('other-model', { exact: true }).waitFor();
  await page.getByRole('button', { name: '完成', exact: true }).last().click();
  assert.equal((await page.evaluate(() => window.desktop.state())).settings.profiles.length, 2);
  assert.equal((await page.evaluate(() => window.desktop.state())).settings.providers.length, 1);
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  await assistantPage.getByLabel('当前模型', { exact: true }).click();
  await assistantPage.getByRole('option', { name: 'test-model', exact: true }).click();
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('切换到默认模型');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistantPage.getByText('当前使用默认模型。', { exact: true }).waitFor();
  assert.equal(aiRequests.at(-1).model, 'test-model');
  await assistantPage.getByLabel('当前模型', { exact: true }).click();
  await assistantPage.getByRole('option', { name: 'other-model', exact: true }).click();
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('切换到备用模型');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistantPage.getByText('当前使用备用模型。', { exact: true }).waitFor();
  assert.equal(aiRequests.at(-1).model, 'other-model');
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
  await page.clock.runFor(200);
  await finishMotion();
  const settingsGeneralBox = await page.getByRole('dialog', { name: '设置', exact: true }).boundingBox();
  await page.screenshot({ path: path.join(output, 'settings-general.png') });
  await page.getByRole('tab', { name: 'AI配置', exact: true }).click();
  await page.clock.runFor(200);
  await finishMotion();
  assert.deepEqual(await page.getByRole('dialog', { name: '设置', exact: true }).boundingBox(), settingsGeneralBox);
  await page.screenshot({ path: path.join(output, 'settings-ai.png') });
  await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '最小化' }).click();
  assert.equal(app.windows().some(window => window.url().includes('window=dock')), false, 'shipping build keeps the dormant Dock window offline');
  await app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(window => { const url = window.webContents.getURL(); return url && !url.includes('window=assistant') && !url.includes('window=dock'); });
    main.show();
  });
  await page.getByRole('button', { name: '最小化' }).waitFor();
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(window => { const url = window.webContents.getURL(); return url && !url.includes('window=assistant') && !url.includes('window=dock'); }); w.setResizable(true); w.setBounds({ width: 340, height: 540 }); });
  await page.screenshot({ path: path.join(output, 'narrow.png') });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  assert.equal(await page.locator('.ai-launcher').evaluate(el => {
    const box = el.getBoundingClientRect();
    return box.bottom <= window.innerHeight && box.right <= window.innerWidth && box.left > window.innerWidth / 2 && box.top > window.innerHeight / 2;
  }), true);
  await page.getByRole('button', { name: '添加待办', exact: true }).click();
  await page.getByLabel('待办名称', { exact: true }).fill('未保存的输入');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: '放弃未保存的修改' }).waitFor();
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  assert.equal(await page.getByLabel('待办名称', { exact: true }).inputValue(), '未保存的输入');
  await page.screenshot({ path: path.join(output, 'editor-narrow.png') });
  assert.equal(await page.getByRole('button', { name: '创建', exact: true }).evaluate(el => {
    const box = el.getBoundingClientRect(), modal = el.closest('dialog').getBoundingClientRect();
    return box.bottom <= modal.bottom && box.top >= modal.top;
  }), true, 'save button must not be clipped in short windows');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '放弃修改', exact: true }).click();

  await app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(window => { const url = window.webContents.getURL(); return url && !url.includes('window=assistant') && !url.includes('window=dock'); });
    main.setBounds({ x: 80, y: 80, width: 440, height: 700 });
  });
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('明天下午安排产品评审');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistantPage.getByText('具体几点？需要提前提醒吗？', { exact: true }).waitFor();
  await assistantPage.getByLabel('AI 对话输入', { exact: true }).fill('15:00，提前10分钟');
  await assistantPage.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await assistantPage.getByRole('button', { name: '应用所选 1 项', exact: true }).waitFor();
  const layout = await app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    const main = windows.find(window => { const url = window.webContents.getURL(); return url && !url.includes('window=assistant') && !url.includes('window=dock'); });
    const assistant = windows.find(window => window.webContents.getURL().includes('window=assistant'));
    return { main: main.getBounds(), assistant: assistant.getBounds() };
  });
  const mainFloatingPath = path.join(output, 'floating-main.png');
  const assistantFloatingPath = path.join(output, 'floating-assistant.png');
  await page.screenshot({ path: mainFloatingPath });
  await assistantPage.screenshot({ path: assistantFloatingPath });
  const pad = 48;
  const minX = Math.min(layout.main.x, layout.assistant.x);
  const minY = Math.min(layout.main.y, layout.assistant.y);
  const canvasW = Math.max(layout.main.x + layout.main.width, layout.assistant.x + layout.assistant.width) - minX + pad * 2;
  const canvasH = Math.max(layout.main.y + layout.main.height, layout.assistant.y + layout.assistant.height) - minY + pad * 2;
  const mainPng = await sharp(mainFloatingPath).resize({ width: layout.main.width, height: layout.main.height, fit: 'fill' }).png().toBuffer();
  const assistantPng = await sharp(assistantFloatingPath).resize({ width: layout.assistant.width, height: layout.assistant.height, fit: 'fill' }).png().toBuffer();
  await sharp({ create: { width: canvasW, height: canvasH, channels: 4, background: '#e8e5df' } })
    .composite([{ input: mainPng, left: layout.main.x - minX + pad, top: layout.main.y - minY + pad }, { input: assistantPng, left: layout.assistant.x - minX + pad, top: layout.assistant.y - minY + pad }])
    .png().toFile(path.join(output, 'floating-workspace.png'));

  await app.evaluate(({ BrowserWindow }) => {
    const assistant = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('window=assistant'));
    assistant.setBounds({ width: 320, height: 420 });
  });
  assert.equal(await assistantPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  assert.equal(await assistantPage.locator('.assistant-footer').evaluate(element => element.getBoundingClientRect().bottom <= window.innerHeight), true);
  await assistantPage.screenshot({ path: path.join(output, 'assistant-narrow.png') });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'passed', checks: ['branding', 'AI-only launcher', 'category creation and selection', 'CRUD + restore', 'SQLite restart persistence', 'hidden-window reminder dispatch', 'snooze', 'fixed-size two-tab settings', 'independent AI floating window', 'AI multi-turn context', 'AI inline preview + apply + discard', 'AI error retry', 'session conversation reset', 'AI category proposal', 'AI profile switching', 'assistant resize contract', 'sandbox isolation', 'shipping Dock offline', 'narrow layout', 'unsaved draft recovery', 'floating workspace visual fixture'], dataDir, screenshots: output }, null, 2));
} finally { if (app) await app.close().catch(() => {}); if (server) { server.closeAllConnections(); server.close(); } }
