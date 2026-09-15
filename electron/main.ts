import { app, BrowserWindow, ipcMain, Menu, Tray, Notification, globalShortcut, powerMonitor, screen, safeStorage, dialog, shell, nativeImage } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store';
import { requestPlan, validateEndpoint } from './ai';
import { aiConversationTurnSchema, type Proposal, type Settings, type State, type Task } from '../shared/contracts';

const testMode = !app.isPackaged && process.env.TODO_TEST === '1';
if (testMode && process.env.TODO_TEST_DATA) app.setPath('userData', process.env.TODO_TEST_DATA);
else if (app.isPackaged && process.env.TODO_PACKAGED_SMOKE === '1' && process.env.TODO_PACKAGED_SMOKE_DATA) app.setPath('userData', process.env.TODO_PACKAGED_SMOKE_DATA);
else app.setPath('userData', path.join(app.getPath('appData'), 'To-Do-List'));
app.setName('To Do List');
app.setAppUserModelId('com.zhshenry.todolist');
app.commandLine.appendSwitch('lang', 'zh-CN');
let store: Store;
let win: BrowserWindow;
let assistantWin: BrowserWindow | null = null;
let tray: Tray;
let quitting = false;
let timer: ReturnType<typeof setInterval>;
let activeRequest: AbortController | null = null;
let pending: { plan: Proposal; revisions: Map<string, string> } | null = null;
let notificationBusy = false;
let assistantReady = false;
let assistantShouldShow = false;
let queuedAssistantPrompt: string | null = null;
const iconPath = path.join(app.getAppPath(), 'assets/icon.png');

function settings(): Settings {
  return { endpoint: store.setting('endpoint', ''), model: store.setting('model', ''), hasKey: !!store.setting('apiKey', ''),
    aiEnabled: store.setting('aiEnabled', false), alwaysOnTop: store.setting('alwaysOnTop', true),
    autoStart: !testMode && app.getLoginItemSettings().openAtLogin, compact: store.setting('compact', false) };
}
function state(): State { return { tasks: store.all(true), categories: store.categories(), settings: settings() }; }
function changed(): State {
  for (const target of [win, assistantWin]) if (target && !target.isDestroyed() && !target.webContents.isDestroyed()) target.webContents.send('changed');
  return state();
}
function assistantVisible(): boolean { return !!assistantWin && !assistantWin.isDestroyed() && assistantWin.isVisible(); }
function notifyAssistantVisibility(): void {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('assistant:visibility', assistantVisible());
}
function protectWindow(target: BrowserWindow): void {
  target.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  target.webContents.on('will-navigate', event => event.preventDefault());
  target.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}
function loadRenderer(target: BrowserWindow, surface: 'main' | 'assistant'): void {
  if (process.env.TODO_DEV_URL && !app.isPackaged) {
    const url = new URL(process.env.TODO_DEV_URL);
    if (surface === 'assistant') url.searchParams.set('window', 'assistant');
    void target.loadURL(url.toString());
  } else {
    void target.loadFile(path.join(app.getAppPath(), 'dist/index.html'), surface === 'assistant' ? { query: { window: 'assistant' } } : undefined);
  }
}
function placeAssistant(): void {
  if (!assistantWin || assistantWin.isDestroyed()) return;
  const main = win.getBounds();
  const area = screen.getDisplayMatching(main).workArea;
  const current = assistantWin.getBounds();
  const width = Math.min(current.width, area.width);
  const height = Math.min(current.height, area.height);
  const gap = 12;
  const right = main.x + main.width + gap;
  const left = main.x - width - gap;
  const x = right + width <= area.x + area.width ? right : left >= area.x ? left : Math.max(area.x, Math.min(right, area.x + area.width - width));
  const y = Math.max(area.y, Math.min(main.y + 40, area.y + area.height - height));
  assistantWin.setBounds({ x, y, width, height });
}
function fitAssistantToDisplay(): void {
  if (!assistantWin || assistantWin.isDestroyed()) return;
  const current = assistantWin.getBounds();
  const area = screen.getDisplayMatching(current).workArea;
  const width = Math.min(current.width, area.width);
  const height = Math.min(current.height, area.height);
  assistantWin.setBounds({ x: Math.max(area.x, Math.min(current.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(current.y, area.y + area.height - height)), width, height });
}
function createAssistantWindow(): BrowserWindow {
  if (assistantWin && !assistantWin.isDestroyed()) return assistantWin;
  assistantReady = false;
  assistantWin = new BrowserWindow({ width: 380, height: 620, minWidth: 320, minHeight: 420, maxWidth: 620, maxHeight: 820,
    title: 'AI 助手', frame: false, transparent: true, backgroundColor: '#00000000', resizable: true, maximizable: false,
    fullscreenable: false, show: false, skipTaskbar: true, alwaysOnTop: settings().alwaysOnTop, hasShadow: true, icon: iconPath,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true },
  });
  placeAssistant();
  assistantWin.on('show', notifyAssistantVisibility);
  assistantWin.on('hide', notifyAssistantVisibility);
  assistantWin.on('close', event => { if (!quitting) { event.preventDefault(); assistantShouldShow = false; assistantWin?.hide(); } });
  assistantWin.on('closed', () => { assistantWin = null; assistantReady = false; assistantShouldShow = false; notifyAssistantVisibility(); });
  assistantWin.once('ready-to-show', () => { if (assistantShouldShow && assistantWin && !assistantWin.isDestroyed()) { assistantWin.show(); assistantWin.focus(); } });
  protectWindow(assistantWin);
  loadRenderer(assistantWin, 'assistant');
  return assistantWin;
}
function showAssistant(prompt?: string): void {
  const existing = !!assistantWin && !assistantWin.isDestroyed();
  const target = createAssistantWindow();
  if (!existing) placeAssistant();
  assistantShouldShow = true;
  if (prompt) {
    if (assistantReady) target.webContents.send('assistant:prompt', prompt);
    else queuedAssistantPrompt = prompt;
  }
  if (!target.isVisible() && !target.webContents.isLoadingMainFrame()) target.show();
  if (target.isVisible()) target.focus();
}
function hideAssistant(): void {
  assistantShouldShow = false;
  if (assistantWin && !assistantWin.isDestroyed()) assistantWin.hide();
  else notifyAssistantVisibility();
}
function fitWindow(): void {
  const compact = settings().compact;
  const current = win.getBounds();
  const area = screen.getDisplayMatching(current).workArea;
  const width = Math.min(compact ? 340 : 440, area.width);
  const height = Math.min(compact ? 116 : 700, area.height);
  win.setMinimumSize(compact ? 300 : 340, compact ? 110 : 480);
  win.setBounds({ x: Math.max(area.x, Math.min(current.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(current.y, area.y + area.height - height)), width, height });
}
function show(expand = false): void {
  if (expand) { store.setSetting('compact', false); fitWindow(); changed(); }
  win.show(); win.focus();
}
function displayNotification(tasks: Task[]): void {
  if (!tasks.length || notificationBusy) return;
  if (testMode) {
    appendFileSync(path.join(app.getPath('userData'), 'notifications.jsonl'), `${JSON.stringify(tasks.map(t => t.id))}\n`);
    store.markNotified(tasks); changed(); return;
  }
  if (!Notification.isSupported()) return;
  notificationBusy = true;
  const notification = new Notification({ title: tasks.length === 1 ? tasks[0].title : `${tasks.length} 条待办需要处理`,
    body: tasks.length === 1 ? '到提醒时间了，点击打开待办，可完成或稍后提醒。' : `${tasks.slice(0, 3).map(t => t.title).join('、')}。点击查看。`, icon: iconPath, timeoutType: 'default' });
  const release = () => { notificationBusy = false; };
  notification.once('show', () => { store.markNotified(tasks); changed(); release(); });
  notification.once('failed', release);
  notification.once('click', () => show(true));
  try { notification.show(); } catch { release(); }
  setTimeout(release, 15000).unref();
}
function tick(): void { displayNotification(store.due()); }
function checkSender(event: IpcMainInvokeEvent): void {
  const allowed = [win, assistantWin].some(target => target && !target.isDestroyed() && event.sender === target.webContents && event.senderFrame === target.webContents.mainFrame);
  if (!allowed) throw new Error('请求来源无效');
}
function handle(channel: string, fn: (...args: any[]) => unknown): void {
  ipcMain.handle(channel, async (event, ...args) => {
    checkSender(event);
    try { return await fn(...args); }
    catch (error) {
      if (error instanceof z.ZodError) throw new Error(error.issues[0]?.message || '请检查输入内容');
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) throw new Error('AI 请求已取消或超时，输入已保留，可重试');
      if (error instanceof TypeError) throw new Error('操作失败，请检查网络、模型设置或输入内容后重试');
      throw new Error(error instanceof Error ? error.message : '操作未完成，请重试');
    }
  });
}
function registerHandlers(): void {
  handle('state', () => state());
  handle('create', input => { store.create(input); tick(); return changed(); });
  handle('update', (id, patch, revision) => { store.update(z.string().uuid().parse(id), patch, z.string().parse(revision)); tick(); return changed(); });
  handle('remove', (id, revision) => { store.remove(z.string().uuid().parse(id), z.string().parse(revision)); return changed(); });
  handle('restore', id => { store.restore(z.string().uuid().parse(id)); return changed(); });
  handle('snooze', id => { store.snooze(z.string().uuid().parse(id)); return changed(); });
  handle('category:create', input => { store.createCategory(input); return changed(); });
  handle('category:update', (id, input, revision) => { store.updateCategory(z.string().uuid().parse(id), input, z.string().parse(revision)); return changed(); });
  handle('category:remove', (id, revision) => { store.removeCategory(z.string().uuid().parse(id), z.string().parse(revision)); return changed(); });
  handle('window', action => {
    switch (z.enum(['compact', 'expand', 'hide', 'pin']).parse(action)) {
      case 'hide': win.hide(); hideAssistant(); break;
      case 'pin': store.setSetting('alwaysOnTop', !settings().alwaysOnTop); win.setAlwaysOnTop(settings().alwaysOnTop); assistantWin?.setAlwaysOnTop(settings().alwaysOnTop); break;
      case 'compact': store.setSetting('compact', true); fitWindow(); hideAssistant(); break;
      case 'expand': store.setSetting('compact', false); fitWindow(); break;
    }
    return changed();
  });
  handle('assistant', input => {
    const request = z.object({ action: z.enum(['toggle', 'show', 'hide', 'status']), prompt: z.string().trim().min(1).max(10000).optional() }).strict().parse(input);
    if (request.action === 'toggle') assistantVisible() || assistantShouldShow ? hideAssistant() : showAssistant();
    else if (request.action === 'show') showAssistant(request.prompt);
    else if (request.action === 'hide') hideAssistant();
    return assistantVisible() || assistantShouldShow;
  });
  handle('assistant:ready', () => {
    assistantReady = true;
    if (queuedAssistantPrompt && assistantWin && !assistantWin.isDestroyed()) {
      assistantWin.webContents.send('assistant:prompt', queuedAssistantPrompt);
      queuedAssistantPrompt = null;
    }
  });
  handle('settings:open', () => {
    show(true);
    win.webContents.send('settings:open');
  });
  handle('settings', input => {
    const data = z.object({ endpoint: z.string().max(2000), model: z.string().trim().max(200), apiKey: z.string().max(4000).optional(), clearKey: z.boolean().optional(), aiEnabled: z.boolean(), autoStart: z.boolean() }).strict().parse(input);
    const endpoint = data.endpoint.trim() ? validateEndpoint(data.endpoint.trim()) : '';
    if (data.aiEnabled && (!endpoint || !data.model)) throw new Error('开启 AI 前，请填写服务地址和模型名称');
    let encrypted: string | undefined;
    if (data.apiKey) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密暂不可用，未保存密钥，请稍后重试');
      encrypted = safeStorage.encryptString(data.apiKey).toString('base64');
    }
    store.transaction(() => {
      store.setSetting('endpoint', endpoint); store.setSetting('model', data.model); store.setSetting('aiEnabled', data.aiEnabled);
      if (data.clearKey) store.setSetting('apiKey', '');
      else if (encrypted) store.setSetting('apiKey', encrypted);
    });
    if (!testMode && data.autoStart !== settings().autoStart) {
      app.setLoginItemSettings({ openAtLogin: data.autoStart, path: process.execPath, args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'] });
    }
    activeRequest?.abort(); pending = null;
    return changed();
  });
  handle('ask', async input => {
    const request = z.object({ text: z.string().trim().min(1).max(10000, '输入最多10000字'), history: z.array(aiConversationTurnSchema).max(12) }).strict().parse(input);
    const config = settings();
    if (!config.aiEnabled || !config.endpoint || !config.model) throw new Error('请先在设置中配置并启用 AI');
    if (activeRequest) throw new Error('已有 AI 请求正在处理');
    const encrypted = store.setting('apiKey', '');
    let key = '';
    if (encrypted) {
      try { key = safeStorage.decryptString(Buffer.from(encrypted, 'base64')); }
      catch { throw new Error('密钥无法解密，请在设置中重新填写'); }
    }
    const controller = new AbortController(); activeRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 45000);
    const tasks = store.all(); pending = null;
    try {
      const plan = await requestPlan({ endpoint: config.endpoint, model: config.model, key }, request.text, request.history, tasks, store.categories(), controller.signal);
      const proposal = { ...plan, token: randomUUID() };
      pending = { plan: proposal, revisions: new Map(tasks.map(t => [t.id, t.updatedAt])) };
      return proposal;
    } finally { clearTimeout(timeout); activeRequest = null; }
  });
  handle('apply', token => {
    if (!pending || pending.plan.token !== token) throw new Error('建议已应用或已过期，请重新生成');
    const { message, actions } = pending.plan;
    store.applyPlan({ message, actions }, pending.revisions); pending = null; tick(); return changed();
  });
  handle('cancelAI', () => { activeRequest?.abort(); pending = null; });
  handle('review', () => store.review());
  handle('exportData', async () => {
    const result = await dialog.showSaveDialog(win, { title: '导出待办备份', defaultPath: `To Do List-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON 备份', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return null;
    writeFileSync(result.filePath, JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), tasks: store.all(true), categories: store.categories() }, null, 2), 'utf8');
    return result.filePath;
  });
  handle('openData', async () => { const error = await shell.openPath(app.getPath('userData')); if (error) throw new Error('无法打开数据目录'); });
  handle('testNotification', () => {
    if (!Notification.isSupported()) throw new Error('当前系统不支持通知');
    new Notification({ title: 'To Do List 测试提醒', body: '提醒已就绪。收起窗口后也会继续提醒；请确认 Windows 通知权限已开启。', icon: iconPath }).show();
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) show(); });
  app.whenReady().then(() => {
    const dataDir = app.getPath('userData'); mkdirSync(dataDir, { recursive: true });
    store = new Store(path.join(dataDir, 'tasks.db'));
    const area = screen.getPrimaryDisplay().workArea;
    const position = store.setting<{ x: number; y: number }>('position', { x: area.x + area.width - 470, y: area.y + 40 });
    win = new BrowserWindow({ width: 440, height: 700, x: position.x, y: position.y, minWidth: 340, minHeight: 480,
      frame: false, transparent: true, backgroundColor: '#00000000', resizable: false, maximizable: false,
      show: false, skipTaskbar: true, alwaysOnTop: settings().alwaysOnTop, icon: iconPath,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true },
    });
    fitWindow();
    let moveTimer: ReturnType<typeof setTimeout>;
    win.on('moved', () => { clearTimeout(moveTimer); moveTimer = setTimeout(() => { if (!win.isDestroyed()) { const { x, y } = win.getBounds(); store.setSetting('position', { x, y }); } }, 250); });
    win.on('close', event => { if (!quitting) { event.preventDefault(); win.hide(); hideAssistant(); } });
    protectWindow(win);
    registerHandlers();
    tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 24, height: 24 }));
    tray.setToolTip('To Do List · 点击查看待办');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开待办', click: () => show(true) },
      { label: '打开 AI 助手', click: () => showAssistant() },
      { label: '移动到主屏幕', click: () => { const a = screen.getPrimaryDisplay().workArea; win.setPosition(a.x + 30, a.y + 30); fitWindow(); show(); } },
      { label: '打开数据目录', click: () => { void shell.openPath(dataDir); } },
      { type: 'separator' }, { label: '退出（停止提醒）', click: () => { quitting = true; app.quit(); } },
    ]));
    tray.on('click', () => { if (win.isVisible()) { win.hide(); hideAssistant(); } else show(); });
    globalShortcut.register('CommandOrControl+Shift+Space', () => { if (win.isVisible()) { win.hide(); hideAssistant(); } else show(); });
    screen.on('display-removed', () => { fitWindow(); fitAssistantToDisplay(); });
    screen.on('display-metrics-changed', () => { fitWindow(); fitAssistantToDisplay(); });
    powerMonitor.on('resume', () => { tick(); changed(); });
    timer = setInterval(tick, testMode ? 200 : 15000);
    loadRenderer(win, 'main');
    win.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) win.show(); tick(); });
  }).catch(error => { dialog.showErrorBox('To Do List 无法启动', `请保留数据目录后重试。\n${error.message}`); app.quit(); });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting = true; activeRequest?.abort(); clearInterval(timer); globalShortcut.unregisterAll(); });
  app.on('will-quit', () => { store?.close(); });
}
