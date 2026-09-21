import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';

const output = path.resolve('test-results/mini-card-current');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(output, 'profile-'));
const errors = [];
const checks = [];
let app;
let main;
let releaseToolFollowup;

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(run, label) {
  for (let index = 0; index < 120; index++) {
    if (await run()) return;
    await wait(80);
  }
  throw new Error(`Timed out: ${label}`);
}

function messageText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => typeof part === 'string' ? part : part?.text ?? '').join('');
}

function writeTextSse(res, pieces) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  pieces.forEach((content, index) => res.write(`data: ${JSON.stringify({ id: 'chatcmpl-mini', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { ...(index === 0 ? { role: 'assistant' } : {}), content }, finish_reason: null }] })}\n\n`));
  res.write(`data: ${JSON.stringify({ id: 'chatcmpl-mini', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
  res.end('data: [DONE]\n\n');
}

function writeToolSse(res, name, args, id) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.write(`data: ${JSON.stringify({ id: 'chatcmpl-tool', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ id: 'chatcmpl-tool', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
  res.end('data: [DONE]\n\n');
}

const server = createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const messages = body.messages ?? [];
  const lastUser = [...messages].reverse().find(message => message.role === 'user');
  const prompt = messageText(lastUser?.content);
  const hasToolResult = messages.some(message => message.role === 'tool');

  if (!hasToolResult) {
    if (prompt.includes('安排待办')) {
      writeToolSse(res, 'propose_create', { title: 'AI 卡片确认事项', plannedDate: today, priority: 'high', note: '由 AI 建议，确认后写入。' }, 'call-create');
    } else {
      writeToolSse(res, 'list_tasks', {}, 'call-list');
    }
    return;
  }

  if (prompt.includes('查看今天')) {
    await new Promise(resolve => { releaseToolFollowup = resolve; });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ id: 'chatcmpl-stream', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: '今天先处理' }, finish_reason: null }] })}\n\n`);
    await wait(800);
    res.write(`data: ${JSON.stringify({ id: 'chatcmpl-stream', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: '临近截止的事项。' }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ id: 'chatcmpl-stream', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
    return;
  }
  writeTextSse(res, ['已生成一项待确认建议。']);
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');

async function launch() {
  const env = { ...process.env, TODO_TEST: '1', TODO_TEST_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  app = await electron.launch({ args: ['.'], env });
  await poll(async () => {
    main = app.windows().find(window => window.url().includes('index.html') && !window.url().includes('window='));
    return !!main && await main.locator('.widget, .mini-root').count() > 0;
  }, 'main window');
  main.on('pageerror', error => errors.push(error.message));
  main.setDefaultTimeout(10000);
}

async function windows() {
  return app.evaluate(({ BrowserWindow }) => Object.fromEntries(BrowserWindow.getAllWindows().filter(window => window.webContents.getURL()).map(window => {
    const url = window.webContents.getURL();
    const name = url.includes('window=dock') ? 'dock' : url.includes('window=assistant') ? 'assistant' : 'main';
    return [name, { visible: window.isVisible(), pinned: window.isAlwaysOnTop(), bounds: window.getBounds() }];
  })));
}

async function capture(name) {
  await main.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await wait(380);
  await main.screenshot({ path: path.join(output, `${name}.png`), omitBackground: true });
  const geometry = await main.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
    card: document.querySelector('.mini-window')?.getBoundingClientRect().toJSON() ?? null,
    selector: document.querySelector('.mini-selector')?.getBoundingClientRect().toJSON() ?? null,
    modelMenu: document.querySelector('.mini-ai-model-menu')?.getBoundingClientRect().toJSON() ?? null,
  }));
  await writeFile(path.join(output, `${name}-geometry.json`), JSON.stringify(geometry, null, 2));
  assert.equal(geometry.viewport.scrollWidth, geometry.viewport.width, `${name}: no horizontal overflow`);
}

async function traceMotion(name, trigger, settled) {
  const frames = [];
  const start = (await windows()).main.bounds;
  await trigger();
  for (let index = 0; index < 60; index++) {
    frames.push((await windows()).main.bounds);
    if (await settled()) break;
    await wait(12);
  }
  await poll(settled, `${name} settled`);
  frames.push((await windows()).main.bounds);
  await writeFile(path.join(output, `${name}-motion.json`), JSON.stringify(frames, null, 2));
  assert.ok(frames.every(frame => frame.x === start.x && frame.y === start.y && frame.width === start.width), `${name}: top and width stay fixed`);
  return { start, end: frames.at(-1), frames };
}

async function openAdd() {
  await main.getByRole('button', { name: '新增事项', exact: true }).click();
  await main.getByLabel('事项标题', { exact: true }).waitFor();
}

async function backHome() {
  if (await main.getByRole('button', { name: '返回', exact: true }).count()) await main.getByRole('button', { name: '返回', exact: true }).click();
  await main.getByRole('button', { name: '新增事项', exact: true }).waitFor();
}

try {
  await launch();
  const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
  const dueAt = new Date(Date.now() + 35 * 60_000).toISOString();

  await main.getByRole('button', { name: '收起为卡片' }).click();
  await main.locator('.mini-root').waitFor();
  const configureAI = main.getByRole('button', { name: 'AI建议：请先配置AI大模型', exact: true });
  await configureAI.waitFor();
  assert.equal(await configureAI.locator('span').textContent(), 'AI建议：');
  assert.equal(await configureAI.locator('b').textContent(), '请先配置AI大模型');
  const emptyTask = await main.locator('.mini-task-front.is-empty').boundingBox();
  const compactHome = await main.locator('.mini-home-main').boundingBox();
  assert.ok(emptyTask && compactHome && emptyTask.y + emptyTask.height <= compactHome.y + compactHome.height, 'unconfigured AI prompt keeps the empty task card inside the compact home');
  await capture('home-ai-unconfigured');
  await main.getByRole('button', { name: '设置', exact: true }).click();
  const unconfiguredQuick = main.getByRole('region', { name: '快捷设置' });
  await unconfiguredQuick.waitFor();
  await unconfiguredQuick.getByRole('button', { name: '去配置', exact: true }).waitFor();
  assert.match(await unconfiguredQuick.locator('.mini-settings-row.is-update small').textContent(), /v\d|正在读取版本/);
  await unconfiguredQuick.getByRole('button', { name: '关闭快捷设置' }).click();
  await unconfiguredQuick.waitFor({ state: 'detached' });
  await configureAI.click();
  const settingsDialog = main.getByRole('dialog', { name: '设置' });
  await settingsDialog.waitFor();
  assert.equal(await settingsDialog.getByRole('tab', { name: 'AI配置' }).getAttribute('aria-selected'), 'true', 'AI setup prompt opens the AI settings tab');
  await settingsDialog.getByRole('button', { name: '关闭', exact: true }).click();
  await settingsDialog.waitFor({ state: 'detached' });
  checks.push('unconfigured AI prompt stays visible and opens the AI settings tab');

  await main.evaluate(async ({ endpoint, today, dueAt }) => {
    const api = window.desktop;
    let state = await api.createCategory({ name: '工作', color: '#b8532f' });
    const categoryId = state.categories.find(category => category.name === '工作').id;
    await api.create({ title: '产品周会', kind: 'meeting', status: 'todo', priority: 'medium', plannedDate: today, dueAt, remindAt: null, categoryId, progress: null, note: '' });
    await api.create({ title: '完成项目报告', kind: 'task', status: 'todo', priority: 'high', plannedDate: today, dueAt: null, remindAt: null, categoryId, progress: null, note: '' });
    await api.create({ title: '整理收件箱', kind: 'task', status: 'todo', priority: 'low', plannedDate: today, dueAt: null, remindAt: null, categoryId: null, progress: null, note: '' });
    state = await api.saveProvider({ kind: 'custom', name: 'OpenAI 测试', endpoint, protocol: 'openai-chat' });
    const firstProvider = state.settings.providers.find(provider => provider.name === 'OpenAI 测试');
    state = await api.saveModel({ providerId: firstProvider.id, name: '工作模型' });
    const firstModel = state.settings.models.find(model => model.name === '工作模型');
    state = await api.saveProvider({ kind: 'custom', name: 'DeepSeek 测试', endpoint, protocol: 'openai-chat' });
    const secondProvider = state.settings.providers.find(provider => provider.name === 'DeepSeek 测试');
    await api.saveModel({ providerId: secondProvider.id, name: '快速模型' });
    await api.activateProfile(firstModel.id);
    await api.settings({ aiEnabled: true, autoStart: false });
  }, { endpoint, today, dueAt });

  assert.equal((await windows()).dock, undefined, 'Dock window is not created while the feature is offline');
  const expandedLogo = await main.getByRole('img', { name: 'To Do List' }).boundingBox();
  const collapse = await traceMotion('collapse', () => main.getByRole('button', { name: '收起为卡片' }).click(), async () => await main.locator('.mini-root').count() > 0);
  assert.equal(collapse.end.height, 176);
  assert.ok(new Set(collapse.frames.map(frame => frame.height)).size >= 3, 'collapse includes intermediate heights');
  assert.deepEqual(await main.getByRole('img', { name: 'To Do List' }).boundingBox(), expandedLogo, 'brand logo stays fixed when the standard-width window collapses');
  assert.equal((await windows()).dock, undefined, 'collapsed mode does not revive the offline Dock');
  await capture('home');
  assert.equal(await main.locator('.mini-pill.pill-meeting').textContent(), '日程', 'meeting task shows a pill badge');
  const timedTime = await main.locator('.corner-time').textContent();
  const timedClock = timedTime.match(/(\d{1,2}:\d{2})$/)?.[1];
  assert.ok(timedClock, 'timed stack line includes a clock');
  await main.getByRole('button', { name: '下一项', exact: true }).click();
  const dateTime = await main.locator('.corner-time').textContent();
  assert.doesNotMatch(dateTime, /\d{1,2}:\d{2}/);
  await main.getByRole('button', { name: '完成 完成项目报告', exact: true }).click();
  assert.equal((await main.evaluate(() => window.desktop.state())).tasks.find(task => task.title === '完成项目报告').status, 'todo', 'first click only arms the confirmation');
  await main.getByRole('button', { name: '确认完成 完成项目报告', exact: true }).click();
  assert.equal((await main.evaluate(() => window.desktop.state())).tasks.find(task => task.title === '完成项目报告').status, 'done');
  await main.getByRole('button', { name: '上一项' }).click();
  assert.equal(await main.getByRole('button', { name: '新增事项', exact: true }).count(), 1);
  assert.equal(await main.getByRole('button', { name: 'AI 助手', exact: true }).count(), 1);
  assert.equal(await main.locator('.mini-insight').count(), 1, 'home shows one actionable AI suggestion');
  await main.locator('.mini-insight').click();
  await main.getByLabel('AI 建议预览').waitFor();
  await capture('suggestion-open');
  assert.equal((await windows()).main.bounds.height, 176, 'suggestion reveal stays in the compact card');
  await main.locator('.mini-insight').click();
  await main.getByRole('button', { name: '设置', exact: true }).click();
  const quickSettings = main.getByRole('region', { name: '快捷设置' });
  await quickSettings.waitFor();
  await capture('quick-settings');
  assert.ok((await windows()).main.bounds.height >= 300, 'quick settings extends the compact window');
  assert.equal(await quickSettings.getByRole('switch', { name: '启用 AI' }).getAttribute('aria-checked'), 'true');
  assert.equal(await quickSettings.getByRole('radiogroup', { name: '窗口宽度' }).getByRole('radio', { name: '标准', exact: true }).getAttribute('aria-checked'), 'true');
  const quickLayout = await quickSettings.evaluate(panel => ({
    update: panel.querySelector('.mini-settings-row.is-update').getBoundingClientRect().toJSON(),
    footer: panel.querySelector('.mini-selector-footer').getBoundingClientRect().toJSON(),
  }));
  assert.ok(quickLayout.update.bottom + 4 <= quickLayout.footer.top, `update row stays clear of the footer: ${JSON.stringify(quickLayout)}`);
  await quickSettings.getByRole('button', { name: /^切换模型，当前为 / }).click();
  await quickSettings.getByRole('option', { name: /^快速模型/ }).waitFor();
  assert.ok((await windows()).main.bounds.height >= 400, 'model list grows the compact window');
  await capture('quick-settings-models');
  await quickSettings.getByRole('option', { name: /^快速模型/ }).click();
  await poll(async () => {
    const state = await main.evaluate(() => window.desktop.state());
    return state.settings.models.find(model => model.id === state.settings.activeModelId)?.name === '快速模型';
  }, 'quick settings switches the active model');
  await quickSettings.getByRole('button', { name: /^切换模型，当前为 / }).click();
  await quickSettings.getByRole('option', { name: /^工作模型/ }).click();
  await poll(async () => {
    const state = await main.evaluate(() => window.desktop.state());
    return state.settings.models.find(model => model.id === state.settings.activeModelId)?.name === '工作模型';
  }, 'quick settings restores the working model');
  await quickSettings.getByRole('radio', { name: '窄版', exact: true }).click();
  await poll(async () => (await windows()).main.bounds.width === 340 && await quickSettings.getByRole('radio', { name: '窄版', exact: true }).getAttribute('aria-checked') === 'true', 'quick settings applies narrow width');
  await quickSettings.getByRole('radio', { name: '标准', exact: true }).click();
  await poll(async () => (await windows()).main.bounds.width === 440 && await quickSettings.getByRole('radio', { name: '标准', exact: true }).getAttribute('aria-checked') === 'true', 'quick settings restores standard width');
  await quickSettings.getByRole('button', { name: '关闭快捷设置' }).click();
  await quickSettings.waitFor({ state: 'detached' });
  assert.equal((await windows()).main.bounds.height, 176, 'closing quick settings restores compact height');
  checks.push('fixed titlebar collapse, time-ordered stack, two primary actions, downward AI suggestion reveal and no Dock window');

  await openAdd();
  const compactKindSwitch = main.getByRole('radiogroup', { name: '新增类型', exact: true });
  assert.deepEqual(await compactKindSwitch.getByRole('radio').allTextContents(), ['待办', '日程']);
  assert.equal(await compactKindSwitch.evaluate(element => getComputedStyle(element, '::after').width), '1px', 'compact type switch keeps the center divider');
  await capture('add-kind-switch');
  await main.getByLabel('事项标题', { exact: true }).fill('正式版新增事项');
  const timeButton = main.getByRole('button', { name: /^时间安排：/ });
  await timeButton.click();
  const datetimePanel = main.getByLabel('时间安排设置');
  await datetimePanel.waitFor();
  assert.equal((await windows()).main.bounds.height, 526);
  await capture('add-datetime');
  const datetimeLayout = await datetimePanel.evaluate(panel => ({
    reminder: panel.querySelector('.mini-reminder-options').getBoundingClientRect().toJSON(),
    footer: panel.querySelector('.mini-selector-footer').getBoundingClientRect().toJSON(),
  }));
  assert.ok(datetimeLayout.reminder.bottom + 6 <= datetimeLayout.footer.top, `reminder controls stay clear of the footer: ${JSON.stringify(datetimeLayout)}`);
  await main.locator('.mini-time-trigger').click();
  const timeOptions = main.getByRole('listbox', { name: '选择具体时间' });
  await timeOptions.waitFor();
  assert.equal(await timeOptions.getByRole('option').count(), 49, 'one half-hour list includes no-time plus 48 half-hours');
  for (const label of ['11:30', '12:00', '12:30']) assert.equal(await timeOptions.getByRole('option', { name: label, exact: true }).count(), 1);
  await timeOptions.getByRole('option', { name: '12:30', exact: true }).click();
  await main.getByRole('button', { name: '自定义', exact: true }).click();
  await main.getByRole('dialog', { name: '自定义提醒' }).waitFor();
  await main.getByRole('dialog', { name: '自定义提醒' }).getByRole('button', { name: '时', exact: true }).click();
  await capture('add-reminder-custom');
  await main.getByRole('dialog', { name: '自定义提醒' }).getByRole('button', { name: '完成', exact: true }).click();
  await main.getByLabel('时间安排设置').getByRole('button', { name: '确定', exact: true }).click();
  assert.equal((await windows()).main.bounds.height, 176);
  await poll(async () => await timeButton.evaluate(element => document.activeElement === element), 'datetime trigger regains focus');
  await timeButton.click();
  await main.getByRole('button', { name: '自定义', exact: true }).click();
  const reopenedReminder = main.getByRole('dialog', { name: '自定义提醒' });
  assert.equal(await reopenedReminder.locator('strong').textContent(), '30', 'custom reminder amount survives reopening');
  assert.equal(await reopenedReminder.getByRole('button', { name: '时', exact: true }).getAttribute('aria-pressed'), 'true', 'custom reminder unit survives reopening');
  await reopenedReminder.getByRole('button', { name: '完成', exact: true }).click();
  await main.getByLabel('时间安排设置').getByRole('button', { name: '确定', exact: true }).click();

  const priorityButton = main.getByRole('button', { name: /^优先级：/ });
  await priorityButton.click();
  await main.getByLabel('优先级设置').waitFor();
  assert.ok((await main.getByLabel('优先级设置').boundingBox()).width <= 220);
  await priorityButton.click();
  await main.getByLabel('优先级设置').waitFor({ state: 'detached' });
  assert.equal((await windows()).main.bounds.height, 176, 'same toolbar button closes its panel');
  await priorityButton.click();
  await main.locator('.mini-option.priority-high').click();
  await main.getByLabel('优先级设置').getByRole('button', { name: '确定', exact: true }).click();
  assert.ok((await priorityButton.getAttribute('class')).includes('priority-high'));
  assert.equal(await priorityButton.locator('svg').getAttribute('fill'), 'currentColor', 'confirmed priority fills the flag');

  const tagButton = main.getByRole('button', { name: /^标签：/ });
  await tagButton.click();
  const tagPanel = main.getByLabel('标签设置');
  await tagPanel.waitFor();
  assert.ok((await tagPanel.boundingBox()).width <= 220);
  await tagPanel.getByRole('button', { name: '＋ 新建标签', exact: true }).click();
  const compactTagPalette = tagPanel.getByRole('group', { name: '新标签颜色', exact: true });
  const tagColors = compactTagPalette.getByRole('button', { name: /^选择颜色 / });
  assert.equal(await compactTagPalette.getAttribute('class'), 'tag-color-presets', 'compact creation uses the shared tag color palette');
  assert.equal(await tagColors.count(), 16, 'new tags offer sixteen preset colors');
  assert.equal((await compactTagPalette.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)), 8, 'compact tag colors use the shared eight-column layout');
  await tagColors.last().click();
  assert.equal(await tagColors.last().getAttribute('aria-pressed'), 'true');
  await capture('tag-palette');
  await tagPanel.getByRole('button', { name: '＋ 新建标签', exact: true }).click();
  await tagPanel.getByRole('button', { name: '工作', exact: true }).click();
  await tagPanel.getByRole('button', { name: '确定', exact: true }).click();
  assert.equal(await tagButton.locator('svg').getAttribute('fill'), 'currentColor', 'confirmed tag fills the tag icon');
  assert.match(await tagButton.getAttribute('style'), /--tool-color/);

  const moreButton = main.getByRole('button', { name: /^更多设置：/ });
  await moreButton.click();
  const morePanel = main.getByLabel('更多设置设置');
  await morePanel.waitFor();
  assert.equal(await morePanel.getByLabel('事项进度').count(), 0, 'progress slider is hidden by default');
  await morePanel.getByRole('switch').click();
  const progressSlider = morePanel.getByLabel('事项进度');
  assert.equal(await progressSlider.getAttribute('class'), 'progress-range', 'compact creation uses the shared progress slider style');
  await progressSlider.fill('0');
  assert.equal(await progressSlider.evaluate(element => element.style.getPropertyValue('--progress-value')), '0%', 'zero progress leaves the track empty at the left endpoint');
  await capture('add-progress-0');
  await progressSlider.fill('100');
  assert.equal(await progressSlider.evaluate(element => element.style.getPropertyValue('--progress-value')), '100%', 'full progress fills the track to the right endpoint');
  await capture('add-progress-100');
  await progressSlider.fill('60');
  await morePanel.locator('textarea').fill('需要在今天完成第一版。');
  const noteLayout = await morePanel.evaluate(panel => ({ textarea: panel.querySelector('textarea').getBoundingClientRect().toJSON(), footer: panel.querySelector('.mini-selector-footer').getBoundingClientRect().toJSON() }));
  assert.ok(noteLayout.textarea.bottom <= noteLayout.footer.top, `note field does not overlap the fixed footer: ${JSON.stringify(noteLayout)}`);
  await capture('add-more');
  await morePanel.getByRole('button', { name: '确定', exact: true }).click();
  await main.getByRole('button', { name: '创建', exact: true }).click();
  await poll(async () => (await main.evaluate(() => window.desktop.state())).tasks.some(task => task.title === '正式版新增事项'), 'created compact item');
  const created = (await main.evaluate(() => window.desktop.state())).tasks.find(task => task.title === '正式版新增事项');
  assert.equal(created.priority, 'high');
  assert.equal(created.progress, 60);
  assert.equal(created.note, '需要在今天完成第一版。');
  assert.ok(created.categoryId);
  assert.ok(created.dueAt && created.remindAt);
  assert.equal(Date.parse(created.dueAt) - Date.parse(created.remindAt), 30 * 60 * 60 * 1000, 'custom reminder offset survives panel reopen');
  checks.push('unified date/time/reminder panel, preserved custom reminder, focus restoration, sixteen tag colors, narrow vertical priority/tag panels and edge-aligned 0/100 progress');

  await main.getByRole('button', { name: 'AI 助手', exact: true }).click();
  await main.getByLabel('AI 对话输入', { exact: true }).waitFor();
  assert.equal(await main.locator('.mini-ai-context b').textContent(), 'AI 助手');
  assert.equal(await main.getByText(/^针对：/).count(), 0);
  for (const name of ['拆成步骤', '安排专注', '调整截止', '会前准备', '改期建议', '会后跟进']) {
    assert.equal(await main.getByRole('button', { name, exact: true }).count(), 0, `${name} shortcut is removed from compact AI`);
  }
  await main.emulateMedia({ reducedMotion: 'no-preference' });
  const aiSurface = main.locator('.mini-ai-surface');
  const glowStyle = await aiSurface.evaluate(element => {
    const style = getComputedStyle(element, '::before');
    return { animationName: style.animationName, backgroundImage: style.backgroundImage, filter: style.filter, zIndex: style.zIndex };
  });
  assert.equal(glowStyle.animationName, 'mini-border-glow');
  assert.match(glowStyle.backgroundImage, /conic-gradient/);
  assert.notEqual(glowStyle.filter, 'none');
  assert.equal(glowStyle.zIndex, '3', 'AI border glow is painted above the card background');
  const glowAngleStart = await aiSurface.evaluate(element => getComputedStyle(element, '::before').getPropertyValue('--mini-glow-angle'));
  await wait(140);
  const glowAngleEnd = await aiSurface.evaluate(element => getComputedStyle(element, '::before').getPropertyValue('--mini-glow-angle'));
  assert.notEqual(glowAngleEnd, glowAngleStart, 'AI border glow advances around the card');
  await capture('ai-border-glow');
  await main.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await aiSurface.evaluate(element => getComputedStyle(element, '::before').animationName), 'none', 'reduced motion disables the looping glow');
  await main.emulateMedia({ reducedMotion: 'no-preference' });
  checks.push('visible warm AI border glow with reduced-motion fallback');
  const modelButton = main.getByRole('button', { name: /^切换模型，当前为/ });
  await modelButton.click();
  const modelMenu = main.getByRole('menu', { name: '按供应商选择模型' });
  await modelMenu.waitFor();
  assert.equal((await windows()).main.bounds.height, 380);
  assert.equal(await modelMenu.getByRole('group', { name: 'OpenAI 测试' }).count(), 1);
  assert.equal(await modelMenu.getByRole('group', { name: 'DeepSeek 测试' }).count(), 1);
  const menuBox = await modelMenu.boundingBox();
  const buttonBox = await modelButton.boundingBox();
  assert.ok(menuBox.y >= buttonBox.y + buttonBox.height - 1, 'model menu opens downward from its trigger');
  await capture('ai-model-menu');
  await modelButton.click();
  await modelMenu.waitFor({ state: 'detached' });
  assert.equal((await windows()).main.bounds.height, 176);

  await main.getByLabel('AI 对话输入', { exact: true }).fill('查看今天');
  await main.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await main.locator('.mini-ai-surface.is-working').waitFor();
  await poll(async () => (await main.locator('.mini-ai-surface').textContent()).includes('已完成 1 项'), 'real tool completes');
  await capture('ai-tool-loop');
  assert.doesNotMatch(await main.locator('.mini-ai-surface').textContent(), /\d+\s*\/\s*\d+/, 'agent loop does not invent a total step count');
  releaseToolFollowup?.();
  releaseToolFollowup = null;
  await main.getByText('AI 正在回复', { exact: false }).waitFor();
  await capture('ai-streaming');
  await poll(async () => (await main.locator('.mini-ai-answer').textContent()).includes('今天先处理临近截止的事项。'), 'streamed answer complete');
  await main.getByRole('button', { name: /^处理记录 · 1$/ }).click();
  await main.getByText('读取事项和标签', { exact: true }).waitFor();
  await main.getByRole('button', { name: '返回回答', exact: true }).click();
  await main.getByRole('button', { name: '继续提问', exact: true }).click();
  await main.getByLabel('AI 对话输入', { exact: true }).fill('安排待办');
  await main.getByRole('button', { name: '发送给 AI', exact: true }).click();
  await main.getByRole('button', { name: '应用 1 项', exact: true }).waitFor();
  assert.ok(!(await main.evaluate(() => window.desktop.state())).tasks.some(task => task.title === 'AI 卡片确认事项'));
  await capture('ai-confirmation');
  await main.getByRole('button', { name: '应用 1 项', exact: true }).click();
  await poll(async () => (await main.evaluate(() => window.desktop.state())).tasks.some(task => task.title === 'AI 卡片确认事项'), 'confirmed AI proposal');
  checks.push('provider-grouped model menu, real tool count/log, streaming response and confirm-before-write proposal');

  await main.getByRole('button', { name: '展开主界面', exact: true }).click();
  await main.locator('.today-board').waitFor();
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(item => /index.html/.test(item.webContents.getURL()) && !item.webContents.getURL().includes('window='));
    window.setBounds({ x: 60, y: 60, width: 440, height: 540 });
  });
  await main.getByRole('button', { name: '设置', exact: true }).click();
  const widthSettingsDialog = main.getByRole('dialog', { name: '设置', exact: true });
  await widthSettingsDialog.getByRole('radio', { name: '窄版', exact: true }).click();
  await poll(async () => (await windows()).main.bounds.width === 340, 'narrow width preset');
  assert.deepEqual((await windows()).main.bounds, { x: 60, y: 60, width: 340, height: 540 });
  await capture('settings-narrow-width');
  await widthSettingsDialog.getByRole('button', { name: '关闭', exact: true }).click();
  const narrowExpandedLogo = await main.getByRole('img', { name: 'To Do List' }).boundingBox();
  await main.getByRole('button', { name: '收起为卡片' }).click();
  await main.locator('.mini-root').waitFor();
  assert.deepEqual((await windows()).main.bounds, { x: 60, y: 60, width: 340, height: 176 });
  const narrowCollapsedLogo = await main.getByRole('img', { name: 'To Do List' }).boundingBox();
  assert.deepEqual(narrowCollapsedLogo, narrowExpandedLogo, 'brand logo stays fixed when the narrow window collapses');
  await capture('home-narrow');
  await openAdd();
  await main.getByRole('button', { name: /^标签：/ }).click();
  assert.ok((await main.getByLabel('标签设置').boundingBox()).width <= 220);
  await capture('tag-narrow');
  await main.getByRole('button', { name: /^标签：/ }).click();
  await backHome();
  await app.close();
  app = null;

  await launch();
  await main.locator('.mini-root').waitFor();
  assert.deepEqual((await windows()).main.bounds, { x: 60, y: 60, width: 340, height: 176 });
  await main.getByRole('button', { name: '展开主界面', exact: true }).click();
  await main.locator('.today-board').waitFor();
  assert.deepEqual((await windows()).main.bounds, { x: 60, y: 60, width: 340, height: 540 });
  assert.deepEqual(await main.getByRole('img', { name: 'To Do List' }).boundingBox(), narrowCollapsedLogo, 'brand logo stays fixed when the narrow window expands');
  checks.push('settings-selected 340 px layout and 176 px collapsed state persist; expansion restores the prior height without shifting the brand logo');

  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ checks, errors, profile }, null, 2));
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  releaseToolFollowup?.();
  if (app) await app.close();
  server.closeAllConnections();
  server.close();
}
