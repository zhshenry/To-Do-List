import { app, BrowserWindow, ipcMain, Menu, Tray, Notification, globalShortcut, powerMonitor, screen, safeStorage, dialog, shell, nativeImage } from 'electron';
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store';
import { requestPlan, testConnection, validateEndpoint } from './ai';
import { DOCK_FEATURE_ENABLED, aiActionSchema, aiConversationTurnSchema, aiProtocolSchema, aiProviderKindSchema, dockIconPresetSchema, mainWindowWidthSchema, type AIAction, type AIProtocol, type AIProviderKind, type MainWindowWidth, type Proposal, type Settings, type State, type Task, type UpdaterStatus } from '../shared/contracts';

const testMode = !app.isPackaged && process.env.TODO_TEST === '1';
if (testMode && process.env.TODO_TEST_DATA) app.setPath('userData', process.env.TODO_TEST_DATA);
else if (app.isPackaged && process.env.TODO_PACKAGED_SMOKE === '1' && process.env.TODO_PACKAGED_SMOKE_DATA) app.setPath('userData', process.env.TODO_PACKAGED_SMOKE_DATA);
else app.setPath('userData', path.join(app.getPath('appData'), 'To-Do-List'));
app.setName('To Do List');
app.setAppUserModelId('com.zhshenry.todolist.app');
app.commandLine.appendSwitch('lang', 'zh-CN');
let store: Store;
let win: BrowserWindow;
let dockWin: BrowserWindow | null = null;
let assistantWin: BrowserWindow | null = null;
let taskbarWin: BrowserWindow | null = null;
let tray: Tray;
let quitting = false;
let timer: ReturnType<typeof setInterval>;
let mainMotionTimer: ReturnType<typeof setInterval> | null = null;
let mainMotionResolve: (() => void) | null = null;
let assistantMotionTimer: ReturnType<typeof setInterval> | null = null;
let assistantMotionResolve: (() => void) | null = null;
let assistantRestBounds: Electron.Rectangle | null = null;
let assistantAnimate = true;
let activeRequest: AbortController | null = null;
let pending: { plan: Proposal; revisions: Map<string, string> } | null = null;
function proposalActionWithinScope(original: AIAction, candidate: AIAction): AIAction {
  const action = aiActionSchema.parse(candidate);
  if (original.type !== action.type) throw new Error('只能编辑当前建议，不能替换操作类型');
  if ((original.type === 'update' || original.type === 'remove' || original.type === 'update_category' || original.type === 'remove_category')
    && action.type === original.type && action.id !== original.id) throw new Error('只能编辑当前建议对象');
  if (original.type === 'create_category' && action.type === 'create_category' && action.category.id !== original.category.id) {
    throw new Error('只能编辑当前建议对象');
  }
  return action;
}
function emitChat(session: import('../shared/contracts').ChatSession, selected = false) {
  for (const target of [win, assistantWin]) {
    if (target && !target.isDestroyed() && !target.webContents.isDestroyed()) target.webContents.send(selected ? 'chat:selected' : 'chat:update', session);
  }
}
let notificationBusy = false;
let assistantReady = false;
let assistantShouldShow = false;
let queuedAssistantPrompt: string | null = null;
let updaterActive = false;
let manualSource: 'tray' | 'settings' | null = null;
let updateReadyVersion: string | null = null;
let updaterPhase: UpdaterStatus['state'] = 'idle';
let updaterProgress = 0;
let updaterMessage = '';
let dockHovering = false;
let dockMoving = false;
let dockSide: 'left' | 'right' = 'right';
let assistantSource: 'main' | 'dock' | 'tray' = 'main';
let assistantDetached = false;
let lastAssistantAnchor = { x: 0, y: 0, r: 0 };
const DOCK_SIZE = 72;
const DOCK_PAD = 52;
const DOCK_LIFT = 32;
const MINI_CARD_HEIGHT = 176;
const MAIN_WINDOW_WIDTHS: Record<MainWindowWidth, number> = { standard: 440, narrow: 340 };
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
const LAUNCHER_SIZE = 44;
const LAUNCHER_BOTTOM = 12;
const ASSISTANT_GAP = 6;
type TailSide = 'left' | 'right' | 'top' | 'bottom';
let assistantTail: { side: TailSide; along: number } = { side: 'left', along: 0.78 };
let placingAssistant = false;
const iconPath = path.join(app.getAppPath(), 'assets/icon.png');
const windowIcon = process.platform === 'win32' && existsSync(path.join(app.getAppPath(), 'assets/icon.ico'))
  ? path.join(app.getAppPath(), 'assets/icon.ico')
  : iconPath;

type StoredProvider = { id: string; kind: AIProviderKind; name: string; endpoint: string; protocol: AIProtocol; apiKey: string };
type StoredModel = { id: string; providerId: string; name: string };
type StoredProfile = { id: string; name: string; endpoint: string; model: string; protocol: AIProtocol; apiKey: string };
const MAX_PROVIDERS = 8;
const MAX_MODELS = 8;

function legacyProfiles(): StoredProfile[] {
  const stored = store.setting<StoredProfile[] | undefined>('aiProfiles', undefined);
  if (Array.isArray(stored)) {
    return stored.filter(profile => profile && typeof profile.id === 'string' && typeof profile.name === 'string');
  }
  const endpoint = store.setting('endpoint', '');
  const model = store.setting('model', '');
  const protocol = aiProtocolSchema.catch('openai-chat').parse(store.setting('protocol', 'openai-chat'));
  const apiKey = store.setting('apiKey', '');
  if (!endpoint && !model && !apiKey) return [];
  return [{ id: randomUUID(), name: (model || '默认').slice(0, 30), endpoint, model, protocol, apiKey }];
}
function persistAi(providers: StoredProvider[], models: StoredModel[], activeModelId: string): void {
  const validModels = models.filter(model => providers.some(provider => provider.id === model.providerId));
  const activeModel = validModels.find(model => model.id === activeModelId) ?? validModels[0];
  const activeProvider = providers.find(provider => provider.id === activeModel?.providerId);
  store.setSetting('aiProviders', providers);
  store.setSetting('aiModels', validModels);
  store.setSetting('aiActiveModelId', activeModel?.id ?? '');
  store.setSetting('endpoint', activeProvider?.endpoint ?? '');
  store.setSetting('model', activeModel?.name ?? '');
  store.setSetting('protocol', activeProvider?.protocol ?? 'openai-chat');
  store.setSetting('apiKey', activeProvider?.apiKey ?? '');
}
function ensureProviders(): void {
  if (store.setting<StoredProvider[] | undefined>('aiProviders', undefined) !== undefined) return;
  const providers: StoredProvider[] = [];
  const models: StoredModel[] = [];
  for (const profile of legacyProfiles()) {
    providers.push({ id: profile.id, kind: 'custom', name: profile.name.slice(0, 30), endpoint: profile.endpoint, protocol: profile.protocol, apiKey: profile.apiKey });
    models.push({ id: randomUUID(), providerId: profile.id, name: profile.model || profile.name || 'default' });
  }
  const activeProfileId = store.setting('aiActiveProfileId', '');
  persistAi(providers, models, models.find(model => model.providerId === activeProfileId)?.id ?? '');
}
function loadProviders(): StoredProvider[] {
  ensureProviders();
  return (store.setting<StoredProvider[]>('aiProviders', [])).filter(provider => provider && typeof provider.id === 'string' && typeof provider.name === 'string').map(provider => ({
    ...provider,
    kind: aiProviderKindSchema.catch('custom').parse(provider.kind),
    protocol: aiProtocolSchema.catch('openai-chat').parse(provider.protocol),
  }));
}
function loadModels(): StoredModel[] {
  ensureProviders();
  const providers = new Set(loadProviders().map(provider => provider.id));
  return (store.setting<StoredModel[]>('aiModels', [])).filter(model => model && typeof model.id === 'string' && typeof model.name === 'string' && providers.has(model.providerId));
}
function publicProviders(providers = loadProviders()) {
  return providers.map(({ apiKey, ...provider }) => ({ ...provider, hasKey: !!apiKey }));
}
function derivedProfiles(providers = loadProviders(), models = loadModels()) {
  const named = new Map(providers.map(provider => [provider.id, provider]));
  const multi = providers.length > 1;
  return models.flatMap(model => {
    const provider = named.get(model.providerId);
    if (!provider) return [];
    return [{ id: model.id, name: multi ? `${provider.name} / ${model.name}` : model.name, endpoint: provider.endpoint, model: model.name, protocol: provider.protocol, hasKey: !!provider.apiKey }];
  });
}
function activeConnection(providers = loadProviders(), models = loadModels()) {
  const model = models.find(item => item.id === store.setting('aiActiveModelId', '')) ?? models[0];
  const provider = providers.find(item => item.id === model?.providerId);
  return model && provider ? { model, provider } : undefined;
}
function settings(): Settings {
  const providers = loadProviders();
  const models = loadModels();
  const active = activeConnection(providers, models);
  const profiles = derivedProfiles(providers, models);
  return {
    providers: publicProviders(providers), models, activeModelId: active?.model.id ?? '',
    profiles, activeProfileId: active?.model.id ?? '',
    endpoint: active?.provider.endpoint ?? '', model: active?.model.name ?? '', protocol: active?.provider.protocol ?? 'openai-chat', hasKey: !!active?.provider.apiKey,
    aiEnabled: store.setting('aiEnabled', false), alwaysOnTop: store.setting('alwaysOnTop', true),
    autoStart: !testMode && app.getLoginItemSettings().openAtLogin, mainVisible: !!win?.isVisible(), mainCollapsed: store.setting('mainCollapsed', false), mainWindowWidth: savedMainWindowWidth(),
    dockEnabled: DOCK_FEATURE_ENABLED && store.setting('dockEnabled', true), dockAlwaysOnTop: store.setting('dockAlwaysOnTop', true),
    dockIconPreset: store.setting('dockIconPreset', 'orbit'),
    dockSide, dockIcon: dockIconData(), dockIconSource: dockIconSource(),
  };
}
function savedMainWindowWidth(): MainWindowWidth {
  const stored = mainWindowWidthSchema.safeParse(store.setting('mainWindowWidth', undefined));
  if (stored.success) return stored.data;
  const legacy = store.setting<{ width?: number }>('mainExpandedSize', {});
  return typeof legacy.width === 'number' && legacy.width <= 370 ? 'narrow' : 'standard';
}
function dockIconFile(): string { return path.join(app.getPath('userData'), 'dock-icon.png'); }
function dockIconData(): string {
  try {
    const file = dockIconFile();
    if (!existsSync(file)) return '';
    return `data:image/png;base64,${readFileSync(file).toString('base64')}`;
  } catch { return ''; }
}
function dockIconSource(): 'default' | 'custom' {
  if (!existsSync(dockIconFile())) return 'default';
  return store.setting<'default' | 'custom'>('dockIconSource', 'custom') === 'default' ? 'default' : 'custom';
}
function encryptKey(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密暂不可用，未保存密钥，请稍后重试');
  return safeStorage.encryptString(value).toString('base64');
}
function decryptKey(encrypted: string): string {
  if (!encrypted) return '';
  try { return safeStorage.decryptString(Buffer.from(encrypted, 'base64')); }
  catch { throw new Error('密钥无法解密，请在设置中重新填写'); }
}
function assertUniqueName(items: { id: string; name: string }[], name: string, exceptId: string | undefined, message: string): void {
  const normalized = name.trim().toLocaleLowerCase('zh-CN');
  if (items.some(item => item.id !== exceptId && item.name.toLocaleLowerCase('zh-CN') === normalized)) throw new Error(message);
}
function state(): State { return { tasks: store.all(true), categories: store.categories(), settings: settings() }; }
function changed(): State {
  for (const target of [win, dockWin, assistantWin]) if (target && !target.isDestroyed() && !target.webContents.isDestroyed()) target.webContents.send('changed');
  return state();
}
function assistantVisible(): boolean { return !!assistantWin && !assistantWin.isDestroyed() && assistantWin.isVisible(); }
function notifyAssistantVisibility(): void {
  for (const target of [win, dockWin]) if (target && !target.isDestroyed() && !target.webContents.isDestroyed()) target.webContents.send('assistant:visibility', assistantVisible());
}
function protectWindow(target: BrowserWindow): void {
  target.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  target.webContents.on('will-navigate', event => event.preventDefault());
  target.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}
function loadRenderer(target: BrowserWindow, surface: 'main' | 'dock' | 'assistant'): void {
  if (process.env.TODO_DEV_URL && !app.isPackaged) {
    const url = new URL(process.env.TODO_DEV_URL);
    if (surface !== 'main') url.searchParams.set('window', surface);
    void target.loadURL(url.toString());
  } else {
    void target.loadFile(path.join(app.getAppPath(), 'dist/index.html'), surface === 'main' ? undefined : { query: { window: surface } });
  }
}
function sendAssistantAnchor(): void {
  if (!assistantWin || assistantWin.isDestroyed() || assistantWin.webContents.isDestroyed()) return;
  assistantWin.webContents.send('assistant:anchor', assistantTail);
}
function clampAlong(value: number): number { return Math.max(0.14, Math.min(0.86, Number.isFinite(value) ? value : 0.78)); }
function assistantAnchorPoint(): { x: number; y: number; r: number } {
  if (assistantSource === 'dock' && dockWin?.isVisible()) {
    const origin = logoOrigin();
    lastAssistantAnchor = { x: origin.x + DOCK_SIZE / 2, y: origin.y + DOCK_SIZE / 2, r: DOCK_SIZE / 2 };
  } else if (assistantSource === 'main' && win.isVisible()) {
    const main = win.getBounds();
    lastAssistantAnchor = { x: main.x + main.width - LAUNCHER_BOTTOM - LAUNCHER_SIZE / 2, y: main.y + main.height - LAUNCHER_BOTTOM - LAUNCHER_SIZE / 2, r: LAUNCHER_SIZE / 2 };
  }
  return lastAssistantAnchor;
}
function placeAssistant(): void {
  if (!assistantWin || assistantWin.isDestroyed() || !win || win.isDestroyed()) return;
  const target = assistantAnchorPoint();
  const area = screen.getDisplayNearestPoint({ x: Math.round(target.x), y: Math.round(target.y) }).workArea;
  const current = assistantWin.getBounds();
  const width = Math.min(Math.max(current.width || 380, 320), Math.min(620, area.width));
  const height = Math.min(Math.max(current.height || 620, 420), Math.min(820, area.height));
  const preferred: TailSide[] = assistantSource === 'dock'
    ? (target.x >= area.x + area.width / 2 ? ['right', 'left', 'bottom', 'top'] : ['left', 'right', 'bottom', 'top'])
    : ['left', 'right', 'bottom', 'top'];
  let best: { bounds: Electron.Rectangle; side: TailSide; along: number; score: number } | null = null;
  for (const side of preferred) {
    const x = side === 'left' ? Math.round(target.x + target.r + ASSISTANT_GAP) : side === 'right' ? Math.round(target.x - target.r - ASSISTANT_GAP - width) : Math.round(target.x - width * 0.78);
    const y = side === 'top' ? Math.round(target.y + target.r + ASSISTANT_GAP) : side === 'bottom' ? Math.round(target.y - target.r - ASSISTANT_GAP - height) : Math.round(target.y - height * 0.78);
    const bounds = clampRect(x, y, width, height, area);
    const along = clampAlong(side === 'left' || side === 'right' ? (target.y - bounds.y) / bounds.height : (target.x - bounds.x) / bounds.width);
    const tip = side === 'left' ? { x: bounds.x, y: bounds.y + along * bounds.height } : side === 'right' ? { x: bounds.x + bounds.width, y: bounds.y + along * bounds.height } : side === 'top' ? { x: bounds.x + along * bounds.width, y: bounds.y } : { x: bounds.x + along * bounds.width, y: bounds.y + bounds.height };
    const aim = side === 'left' ? { x: target.x + target.r, y: target.y } : side === 'right' ? { x: target.x - target.r, y: target.y } : side === 'top' ? { x: target.x, y: target.y + target.r } : { x: target.x, y: target.y - target.r };
    const score = (tip.x - aim.x) ** 2 + (tip.y - aim.y) ** 2;
    if (!best || score < best.score) best = { bounds, side, along, score };
  }
  if (!best) return;
  assistantTail = { side: best.side, along: best.along };
  placingAssistant = true;
  assistantWin.setBounds(best.bounds);
  placingAssistant = false;
  assistantRestBounds = assistantWin.getBounds();
  sendAssistantAnchor();
}
function fitAssistantToDisplay(): void {
  if (!assistantWin || assistantWin.isDestroyed()) return;
  const current = assistantWin.getBounds();
  const area = screen.getDisplayMatching(current).workArea;
  const width = Math.min(current.width, area.width);
  const height = Math.min(current.height, area.height);
  placingAssistant = true;
  assistantWin.setBounds({ x: Math.max(area.x, Math.min(current.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(current.y, area.y + area.height - height)), width, height });
  placingAssistant = false;
  if (assistantMotionTimer === null) assistantRestBounds = assistantWin.getBounds();
}
function followAssistant(source: 'main' | 'dock'): void {
  if (assistantSource !== source || assistantDetached || !(source === 'main' ? win.isVisible() : dockWin?.isVisible())) return;
  if (!assistantShouldShow || assistantMotionTimer !== null || !assistantWin || assistantWin.isDestroyed()) return;
  placeAssistant();
}
function pointAssistantTail(): void {
  if (placingAssistant || assistantMotionTimer !== null || !assistantWin || assistantWin.isDestroyed() || !win || win.isDestroyed()) return;
  const bounds = assistantWin.getBounds();
  const target = assistantAnchorPoint();
  const dx = target.x - (bounds.x + bounds.width / 2);
  const dy = target.y - (bounds.y + bounds.height / 2);
  const side: TailSide = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
  const along = clampAlong(side === 'left' || side === 'right' ? (target.y - bounds.y) / bounds.height : (target.x - bounds.x) / bounds.width);
  assistantTail = { side, along };
  if (assistantMotionTimer === null) assistantRestBounds = bounds;
  sendAssistantAnchor();
}
function rememberAssistantRest(): void {
  if (assistantMotionTimer !== null || !assistantWin || assistantWin.isDestroyed() || !assistantWin.isVisible()) return;
  assistantRestBounds = assistantWin.getBounds();
}
function createAssistantWindow(): BrowserWindow {
  if (assistantWin && !assistantWin.isDestroyed()) return assistantWin;
  assistantReady = false;
  assistantWin = new BrowserWindow({ width: 380, height: 620, minWidth: 320, minHeight: 420, maxWidth: 620, maxHeight: 820,
    title: 'AI 助手', frame: false, transparent: true, backgroundColor: '#00000000', resizable: true, maximizable: false,
    fullscreenable: false, show: false, skipTaskbar: true, alwaysOnTop: settings().alwaysOnTop, hasShadow: false, icon: iconPath,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true },
  });
  placeAssistant();
  assistantWin.on('show', notifyAssistantVisibility);
  assistantWin.on('hide', notifyAssistantVisibility);
  assistantWin.on('moved', () => { if (!placingAssistant && assistantMotionTimer === null && assistantWin?.isVisible()) assistantDetached = true; rememberAssistantRest(); pointAssistantTail(); });
  assistantWin.on('resized', () => { rememberAssistantRest(); pointAssistantTail(); });
  assistantWin.on('close', event => { if (!quitting) { event.preventDefault(); void hideAssistant(); } });
  assistantWin.on('closed', () => { assistantWin = null; assistantReady = false; assistantShouldShow = false; assistantRestBounds = null; notifyAssistantVisibility(); });
  assistantWin.once('ready-to-show', () => { if (assistantShouldShow) void presentAssistant(true, assistantAnimate); });
  protectWindow(assistantWin);
  loadRenderer(assistantWin, 'assistant');
  return assistantWin;
}
function assistantSlideDelta(): { dx: number; dy: number } {
  const dist = 12;
  if (assistantTail.side === 'left') return { dx: -dist, dy: 0 };
  if (assistantTail.side === 'right') return { dx: dist, dy: 0 };
  if (assistantTail.side === 'top') return { dx: 0, dy: -dist };
  return { dx: 0, dy: dist };
}
function cancelAssistantMotion(): void {
  if (assistantMotionTimer !== null) clearInterval(assistantMotionTimer);
  assistantMotionTimer = null;
  const resolve = assistantMotionResolve;
  assistantMotionResolve = null;
  resolve?.();
}
function presentAssistant(open: boolean, animate: boolean): Promise<void> {
  cancelAssistantMotion();
  const target = assistantWin;
  if (!target || target.isDestroyed()) {
    notifyAssistantVisibility();
    return Promise.resolve();
  }
  const rest = assistantRestBounds ?? target.getBounds();
  assistantRestBounds = rest;
  const settle = (visible: boolean) => {
    if (target.isDestroyed()) return;
    if (!visible) {
      if (target.isVisible()) target.hide();
      target.setOpacity(1);
      target.setBounds(rest);
      return;
    }
    target.setOpacity(1);
    target.setBounds(rest);
    if (!target.isVisible()) target.show();
    target.focus();
  };
  if (!animate) {
    settle(open);
    return Promise.resolve();
  }
  if (open && target.isVisible() && target.getOpacity() >= 0.99) {
    target.focus();
    return Promise.resolve();
  }
  if (!open && !target.isVisible()) {
    settle(false);
    return Promise.resolve();
  }
  const slide = assistantSlideDelta();
  const fromX = target.isVisible() ? target.getBounds().x : rest.x + slide.dx;
  const fromY = target.isVisible() ? target.getBounds().y : rest.y + slide.dy;
  const fromOpacity = target.isVisible() ? target.getOpacity() : 0;
  const toX = open ? rest.x : rest.x + slide.dx;
  const toY = open ? rest.y : rest.y + slide.dy;
  const toOpacity = open ? 1 : 0;
  if (!target.isVisible()) {
    target.setOpacity(fromOpacity);
    target.setBounds({ ...rest, x: fromX, y: fromY });
    target.show();
  }
  if (open) target.focus();
  const size = target.getBounds();
  const duration = 180;
  return new Promise(resolve => {
    const started = Date.now();
    const animationTimer = setInterval(() => {
      if (target.isDestroyed()) {
        clearInterval(animationTimer);
        if (assistantMotionTimer === animationTimer) assistantMotionTimer = null;
        if (assistantMotionResolve === resolve) assistantMotionResolve = null;
        resolve();
        return;
      }
      const progress = Math.min(1, (Date.now() - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      target.setOpacity(fromOpacity + (toOpacity - fromOpacity) * eased);
      target.setBounds({ x: Math.round(fromX + (toX - fromX) * eased), y: Math.round(fromY + (toY - fromY) * eased), width: size.width, height: size.height });
      if (progress < 1) return;
      clearInterval(animationTimer);
      if (assistantMotionTimer === animationTimer) assistantMotionTimer = null;
      if (assistantMotionResolve === resolve) assistantMotionResolve = null;
      settle(open);
      resolve();
    }, 16);
    assistantMotionTimer = animationTimer;
    assistantMotionResolve = resolve;
  });
}
function showAssistant(prompt?: string, animate = true, source: 'main' | 'dock' | 'tray' = 'tray'): Promise<void> {
  const alreadyOpen = assistantShouldShow;
  if (!alreadyOpen) {
    assistantSource = source;
    assistantDetached = false;
    lastAssistantAnchor = { ...screen.getCursorScreenPoint(), r: 0 };
  }
  const target = createAssistantWindow();
  if (!alreadyOpen) placeAssistant();
  assistantShouldShow = true;
  assistantAnimate = animate;
  if (prompt) {
    if (assistantReady) target.webContents.send('assistant:prompt', prompt);
    else queuedAssistantPrompt = prompt;
  }
  if (alreadyOpen) { if (target.isVisible()) target.focus(); return Promise.resolve(); }
  if (target.webContents.isLoadingMainFrame() && !target.isVisible()) return Promise.resolve();
  return presentAssistant(true, animate);
}
function hideAssistant(animate = true): Promise<void> {
  assistantShouldShow = false;
  if (!assistantWin || assistantWin.isDestroyed()) {
    notifyAssistantVisibility();
    return Promise.resolve();
  }
  return presentAssistant(false, animate);
}
function clampRect(x: number, y: number, width: number, height: number, area: Electron.Rectangle): Electron.Rectangle {
  const w = Math.min(width, area.width);
  const h = Math.min(height, area.height);
  return { x: Math.max(area.x, Math.min(x, area.x + area.width - w)), y: Math.max(area.y, Math.min(y, area.y + area.height - h)), width: w, height: h };
}
function chooseDockSide(origin: { x: number; y: number }, area: Electron.Rectangle): 'left' | 'right' {
  const rightFits = origin.x + DOCK_SIZE + DOCK_PAD <= area.x + area.width;
  const leftFits = origin.x - DOCK_PAD >= area.x;
  const preferLeft = origin.x + DOCK_SIZE / 2 >= area.x + area.width / 2;
  return preferLeft ? (leftFits || !rightFits ? 'left' : 'right') : (rightFits || !leftFits ? 'right' : 'left');
}
function dockFrame(logo: { x: number; y: number }, area: Electron.Rectangle, side: 'left' | 'right'): Electron.Rectangle {
  return side === 'left'
    ? clampRect(logo.x - DOCK_PAD, logo.y - DOCK_LIFT, DOCK_SIZE + DOCK_PAD, DOCK_SIZE + DOCK_LIFT * 2, area)
    : clampRect(logo.x, logo.y - DOCK_LIFT, DOCK_SIZE + DOCK_PAD, DOCK_SIZE + DOCK_LIFT * 2, area);
}
function logoOrigin(): { x: number; y: number } {
  const area = screen.getPrimaryDisplay().workArea;
  return store.setting('dockPosition', { x: area.x + area.width - DOCK_SIZE - 20, y: area.y + 60 });
}
function positionDock(): void {
  if (!dockWin || dockWin.isDestroyed()) return;
  const current = logoOrigin();
  const area = screen.getDisplayNearestPoint(current).workArea;
  dockSide = chooseDockSide(current, area);
  const logo = clampRect(current.x, current.y, DOCK_SIZE, DOCK_SIZE, {
    x: area.x + (dockSide === 'left' ? DOCK_PAD : 0), y: area.y + DOCK_LIFT,
    width: area.width - DOCK_PAD, height: area.height - DOCK_LIFT * 2,
  });
  store.setSetting('dockPosition', { x: logo.x, y: logo.y });
  dockWin.setBounds(dockFrame(logo, area, dockSide));
}
function createDockWindow(): BrowserWindow {
  if (dockWin && !dockWin.isDestroyed()) return dockWin;
  dockWin = new BrowserWindow({ width: DOCK_SIZE + DOCK_PAD, height: DOCK_SIZE + DOCK_LIFT * 2,
    title: 'To Do List', frame: false, thickFrame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    show: false, skipTaskbar: true, resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    alwaysOnTop: settings().dockAlwaysOnTop, icon: windowIcon,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  positionDock();
  dockWin.on('close', event => { if (!quitting) { event.preventDefault(); void setDockEnabled(false); } });
  dockWin.on('closed', () => { dockWin = null; });
  protectWindow(dockWin);
  loadRenderer(dockWin, 'dock');
  return dockWin;
}
async function waitForSurface(target: BrowserWindow, selector: string): Promise<void> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (target.isDestroyed() || target.webContents.isDestroyed()) throw new Error('窗口交接已取消');
    try {
      const ready = await Promise.race<boolean>([
        target.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`),
        delay(1000).then(() => false),
      ]);
      if (ready) { await delay(34); return; }
    } catch {
      // Vite may replace the document while optimizing dependencies; retry the new renderer.
    }
    await delay(50);
  }
  throw new Error('窗口画面准备超时');
}
async function warmSurface(target: BrowserWindow): Promise<void> {
  try {
    await Promise.race([target.webContents.capturePage().then(() => undefined), delay(750)]);
  } catch {
    // The DOM readiness check remains authoritative; capture only primes Chromium's surface.
  }
}
function revealSurface(target: BrowserWindow): void {
  target.showInactive();
  target.moveTop();
  target.webContents.invalidate();
}
async function showDock(): Promise<void> {
  if (!DOCK_FEATURE_ENABLED || !settings().dockEnabled || quitting) return;
  const dock = createDockWindow();
  await waitForSurface(dock, '.dock');
  await warmSurface(dock);
  if (!quitting && !dock.isDestroyed() && settings().dockEnabled) revealSurface(dock);
}
async function setDockEnabled(enabled: boolean): Promise<State> {
  if (!DOCK_FEATURE_ENABLED) {
    dockWin?.hide();
    return state();
  }
  store.setSetting('dockEnabled', enabled);
  dockMoving = false;
  dockHovering = false;
  if (enabled) await showDock();
  else dockWin?.hide();
  tray.setContextMenu(Menu.buildFromTemplate(trayContextMenu()));
  return changed();
}
function fitWindow(): Promise<void> {
  if (win.isDestroyed()) return Promise.resolve();
  const current = win.getBounds();
  const saved = store.setting<{ x: number; y: number }>('position', { x: current.x, y: current.y });
  const size = store.setting('mainExpandedSize', { width: 440, height: 700 });
  const width = MAIN_WINDOW_WIDTHS[savedMainWindowWidth()];
  const collapsed = store.setting('mainCollapsed', false);
  const area = screen.getDisplayNearestPoint(saved).workArea;
  const target = clampRect(saved.x, saved.y, Math.min(width, area.width), Math.min(collapsed ? MINI_CARD_HEIGHT : size.height, area.height), area);
  win.setMinimumSize(Math.min(340, area.width), Math.min(collapsed ? MINI_CARD_HEIGHT : 480, area.height));
  win.setBounds(target);
  win.setHasShadow(true);
  if (dockWin && !dockWin.isDestroyed()) positionDock();
  followAssistant('main');
  return Promise.resolve();
}
function setMainWindowWidth(preset: MainWindowWidth, animate = true): Promise<void> {
  if (win.isDestroyed()) return Promise.resolve();
  cancelMainMotion();
  const current = win.getBounds();
  const area = screen.getDisplayMatching(current).workArea;
  const targetWidth = Math.min(MAIN_WINDOW_WIDTHS[preset], area.width);
  const leftGap = Math.abs(current.x - area.x);
  const rightGap = Math.abs(area.x + area.width - current.x - current.width);
  const targetX = rightGap < leftGap ? current.x + current.width - targetWidth : current.x;
  const target = clampRect(targetX, current.y, targetWidth, current.height, area);
  const expanded = store.setting('mainExpandedSize', { width: 440, height: 700 });
  store.setSetting('mainWindowWidth', preset);
  store.setSetting('mainExpandedSize', { ...expanded, width: MAIN_WINDOW_WIDTHS[preset] });
  const settle = () => {
    if (win.isDestroyed()) return;
    win.setBounds(target);
    const { x, y } = win.getBounds();
    store.setSetting('position', { x, y });
    followAssistant('main');
  };
  if (!animate || current.width === target.width) {
    settle();
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const started = Date.now();
    const animationTimer = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(animationTimer);
        if (mainMotionTimer === animationTimer) mainMotionTimer = null;
        if (mainMotionResolve === resolve) mainMotionResolve = null;
        resolve();
        return;
      }
      const progress = Math.min(1, (Date.now() - started) / 180);
      const eased = 1 - Math.pow(1 - progress, 3);
      win.setBounds({
        x: Math.round(current.x + (target.x - current.x) * eased),
        y: Math.round(current.y + (target.y - current.y) * eased),
        width: Math.round(current.width + (target.width - current.width) * eased),
        height: Math.round(current.height + (target.height - current.height) * eased),
      });
      followAssistant('main');
      if (progress < 1) return;
      clearInterval(animationTimer);
      if (mainMotionTimer === animationTimer) mainMotionTimer = null;
      if (mainMotionResolve === resolve) mainMotionResolve = null;
      settle();
      resolve();
    }, 16);
    mainMotionTimer = animationTimer;
    mainMotionResolve = resolve;
  });
}
function cancelMainMotion(): void {
  if (mainMotionTimer !== null) clearInterval(mainMotionTimer);
  mainMotionTimer = null;
  const resolve = mainMotionResolve;
  mainMotionResolve = null;
  resolve?.();
}
function setMainCollapsed(collapsed: boolean, animate = true): Promise<void> {
  if (win.isDestroyed() || store.setting('mainCollapsed', false) === collapsed) return Promise.resolve();
  cancelMainMotion();
  const current = win.getBounds();
  if (collapsed) store.setSetting('mainExpandedSize', { width: current.width, height: current.height });
  const area = screen.getDisplayMatching(current).workArea;
  const height = collapsed ? MINI_CARD_HEIGHT : store.setting('mainExpandedSize', { height: 700 }).height;
  const target = clampRect(current.x, current.y, Math.min(current.width, area.width), Math.min(height, area.height), area);
  win.setMinimumSize(Math.min(340, area.width), Math.min(MINI_CARD_HEIGHT, area.height));
  const settle = () => {
    if (win.isDestroyed()) return;
    win.setBounds(target);
    store.setSetting('mainCollapsed', collapsed);
    win.setMinimumSize(Math.min(340, area.width), Math.min(collapsed ? MINI_CARD_HEIGHT : 480, area.height));
    const { x, y } = win.getBounds();
    store.setSetting('position', { x, y });
    followAssistant('main');
  };
  if (!animate) {
    settle();
    return Promise.resolve();
  }
  const duration = collapsed ? 180 : 240;
  return new Promise(resolve => {
    const started = Date.now();
    const animationTimer = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(animationTimer);
        if (mainMotionTimer === animationTimer) mainMotionTimer = null;
        if (mainMotionResolve === resolve) mainMotionResolve = null;
        resolve();
        return;
      }
      const progress = Math.min(1, (Date.now() - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      win.setBounds({
        x: Math.round(current.x + (target.x - current.x) * eased),
        y: Math.round(current.y + (target.y - current.y) * eased),
        width: Math.round(current.width + (target.width - current.width) * eased),
        height: Math.round(current.height + (target.height - current.height) * eased),
      });
      followAssistant('main');
      if (progress < 1) return;
      clearInterval(animationTimer);
      if (mainMotionTimer === animationTimer) mainMotionTimer = null;
      if (mainMotionResolve === resolve) mainMotionResolve = null;
      settle();
      resolve();
    }, 16);
    mainMotionTimer = animationTimer;
    mainMotionResolve = resolve;
  });
}
function setCompactHeight(height: number | null): void {
  if (win.isDestroyed() || !store.setting('mainCollapsed', false)) return;
  const current = win.getBounds();
  const area = screen.getDisplayMatching(current).workArea;
  const requested = height ?? MINI_CARD_HEIGHT;
  const availableBelow = area.y + area.height - current.y;
  const nextHeight = Math.max(MINI_CARD_HEIGHT, Math.min(requested, availableBelow));
  win.setMinimumSize(Math.min(340, area.width), Math.min(MINI_CARD_HEIGHT, area.height));
  win.setBounds({ x: current.x, y: current.y, width: current.width, height: nextHeight });
  followAssistant('main');
}
function createTaskbarHost(): BrowserWindow {
  if (taskbarWin && !taskbarWin.isDestroyed()) return taskbarWin;
  taskbarWin = new BrowserWindow({
    title: 'To Do List', icon: windowIcon, width: 32, height: 32, x: -32000, y: -32000, show: false,
    frame: true, transparent: false, skipTaskbar: false, minimizable: true, maximizable: false, resizable: false, fullscreenable: false,
    backgroundColor: '#faf8f5', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  taskbarWin.setMenu(null);
  taskbarWin.setIgnoreMouseEvents(true);
  taskbarWin.on('close', event => { if (!quitting) { event.preventDefault(); hideMain(); } });
  taskbarWin.on('focus', () => {
    if (quitting || !win || win.isDestroyed()) return;
    if (win.isVisible()) win.focus();
    else show();
  });
  return taskbarWin;
}
function showTaskbarButton(): void {
  const host = createTaskbarHost();
  host.setSkipTaskbar(false);
  host.setBounds({ x: -32000, y: -32000, width: 32, height: 32 });
  if (!host.isVisible()) host.showInactive();
}
function hideTaskbarButton(): void {
  if (!taskbarWin || taskbarWin.isDestroyed()) return;
  taskbarWin.setSkipTaskbar(true);
  taskbarWin.hide();
}
function show(): void {
  if (win.isDestroyed()) return;
  store.setSetting('mainVisible', true);
  showTaskbarButton();
  win.show(); win.focus();
  changed();
}
function hideMain(): void {
  if (win.isDestroyed()) return;
  store.setSetting('mainVisible', false);
  hideTaskbarButton();
  win.hide();
  changed();
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
  notification.once('click', () => show());
  try { notification.show(); } catch { release(); }
  setTimeout(release, 15000).unref();
}
function tick(): void { displayNotification(store.due()); }
function notifyUpdate(title: string, body: string, action?: () => void): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body, icon: iconPath, timeoutType: 'default' });
  if (action) notification.once('click', action);
  notification.show();
}
function trayContextMenu(): MenuItemConstructorOptions[] {
  return [
    { label: '打开待办', click: () => show() },
    { label: '打开 AI 助手', click: () => showAssistant() },
    ...(DOCK_FEATURE_ENABLED ? [{ label: '显示悬浮入口', type: 'checkbox' as const, checked: settings().dockEnabled, click: (item: Electron.MenuItem) => { void setDockEnabled(item.checked).catch(error => { console.error('Dock failed to open.', error); show(); }); } }] : []),
    { label: '移动到主屏幕', click: () => { const a = screen.getPrimaryDisplay().workArea; store.setSetting('position', { x: a.x + 30, y: a.y + 30 }); store.setSetting('dockPosition', { x: a.x + a.width - DOCK_SIZE - 20, y: a.y + 60 }); void fitWindow(); show(); } },
    { label: '打开数据目录', click: () => { void shell.openPath(app.getPath('userData')); } },
    ...(updaterActive ? [{ label: updateReadyVersion ? `重启更新（v${updateReadyVersion}）` : '检查更新…', click: () => { if (updateReadyVersion) autoUpdater.quitAndInstall(); else checkForUpdates('tray'); } }] : []),
    { type: 'separator' }, { label: '退出（停止提醒）', click: () => { quitting = true; app.quit(); } },
  ];
}
// Release notes come from the GitHub release body (string or localized entries); the changelog
// block sits below our "## 更新内容" marker, so prefer that part and strip markdown decoration.
function updaterPayload(): UpdaterStatus {
  return { active: updaterActive, version: app.getVersion(), state: updaterPhase, progress: updaterProgress, readyVersion: updateReadyVersion, message: updaterMessage };
}
function pushUpdater(): void {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('updater:status', updaterPayload());
}
function checkForUpdates(source: 'tray' | 'settings' | null): void {
  if (!updaterActive || updateReadyVersion) return;
  manualSource = source;
  updaterPhase = 'checking'; updaterProgress = 0; updaterMessage = ''; pushUpdater();
  void autoUpdater.checkForUpdates().catch(error => {
    if (manualSource === 'tray') notifyUpdate('检查更新失败', '网络异常或服务不可用，可稍后从托盘重试。');
    updaterPhase = 'error'; updaterMessage = error instanceof Error ? error.message : '网络异常，请稍后重试。'; manualSource = null; pushUpdater();
  });
}
function setupUpdater(): void {
  // Portable builds ship without resources/app-update.yml (package-release.ps1 strips it);
  // only the installer may self-update.
  if (!app.isPackaged || process.env.TODO_PACKAGED_SMOKE || !existsSync(path.join(process.resourcesPath, 'app-update.yml'))) return;
  updaterActive = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', info => { if (manualSource === 'tray') notifyUpdate(`发现新版本 v${info.version}`, '正在后台下载，完成后会再次通知。'); manualSource = null; updaterPhase = 'downloading'; pushUpdater(); });
  autoUpdater.on('update-not-available', () => { if (manualSource === 'tray') notifyUpdate('已是最新版本', `当前版本 v${app.getVersion()}。`); manualSource = null; updaterPhase = 'latest'; pushUpdater(); });
  autoUpdater.on('download-progress', info => { const percent = Math.floor(info.percent); if (percent !== updaterProgress) { updaterProgress = percent; pushUpdater(); } });
  autoUpdater.on('error', error => { if (manualSource === 'tray') notifyUpdate('检查更新失败', '网络异常或服务不可用，可稍后从托盘重试。'); manualSource = null; updaterPhase = 'error'; updaterMessage = error instanceof Error ? error.message : '网络异常，请稍后重试。'; pushUpdater(); });
  autoUpdater.on('update-downloaded', info => {
    updateReadyVersion = info.version; updaterPhase = 'ready'; pushUpdater();
    if (tray && !tray.isDestroyed()) tray.setContextMenu(Menu.buildFromTemplate(trayContextMenu()));
    notifyUpdate(`新版本 v${info.version} 已下载`, '点击立即重启并安装；之后退出应用时也会自动安装。', () => autoUpdater.quitAndInstall());
  });
  setTimeout(() => checkForUpdates(null), 30000).unref();
  setInterval(() => checkForUpdates(null), 4 * 60 * 60 * 1000).unref();
}
function checkSender(event: IpcMainInvokeEvent): void {
  const allowed = [win, dockWin, assistantWin].some(target => target && !target.isDestroyed() && event.sender === target.webContents && event.senderFrame === target.webContents.mainFrame);
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
  handle('window', async (action, animate) => {
    const nextAction = z.enum(['show', 'hide', 'pin', 'dockPin', 'collapse', 'expand']).parse(action);
    const shouldAnimate = z.boolean().optional().parse(animate) ?? true;
    switch (nextAction) {
      case 'show': show(); break;
      case 'hide': hideMain(); break;
      case 'collapse': await setMainCollapsed(true, shouldAnimate); break;
      case 'expand': await setMainCollapsed(false, shouldAnimate); break;
      case 'pin': store.setSetting('alwaysOnTop', !settings().alwaysOnTop); win.setAlwaysOnTop(settings().alwaysOnTop); break;
      case 'dockPin': store.setSetting('dockAlwaysOnTop', !settings().dockAlwaysOnTop); dockWin?.setAlwaysOnTop(settings().dockAlwaysOnTop); break;
    }
    return changed();
  });
  handle('window:width', async (width, animate) => {
    await setMainWindowWidth(mainWindowWidthSchema.parse(width), z.boolean().optional().parse(animate) ?? true);
    return changed();
  });
  handle('compact:height', height => {
    const next = height === null ? null : z.number().int().min(MINI_CARD_HEIGHT).max(620).parse(height);
    setCompactHeight(next);
  });
  handle('dockEnabled', enabled => setDockEnabled(z.boolean().parse(enabled)));
  handle('dockHover', open => {
    const want = z.boolean().parse(open);
    if (!settings().dockEnabled || !dockWin || dockWin.isDestroyed() || (dockMoving && want)) return dockSide;
    dockHovering = want;
    return dockSide;
  });
  handle('dockMove', point => {
    if (point === null) { dockMoving = false; return; }
    const { x, y } = z.object({ x: z.number().finite(), y: z.number().finite() }).parse(point);
    if (!settings().dockEnabled || !dockWin || dockWin.isDestroyed()) return;
    dockMoving = true;
    dockHovering = false;
    const area = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea;
    const logo = clampRect(Math.round(x), Math.round(y), DOCK_SIZE, DOCK_SIZE, area);
    store.setSetting('dockPosition', { x: logo.x, y: logo.y });
    positionDock();
    followAssistant('dock');
    changed();
  });
  handle('dockIcon', async (action, preset) => {
    const next = z.enum(['choose', 'useDefault', 'useCustom']).parse(action);
    if (next === 'useDefault') {
      store.setSetting('dockIconPreset', dockIconPresetSchema.parse(preset ?? 'orbit'));
      store.setSetting('dockIconSource', 'default');
      return changed();
    }
    if (next === 'useCustom') {
      if (existsSync(dockIconFile())) store.setSetting('dockIconSource', 'custom');
      return changed();
    }
    const result = await dialog.showOpenDialog(win, { title: '选择悬浮图标', filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) return changed();
    const image = nativeImage.createFromPath(result.filePaths[0]);
    if (image.isEmpty()) throw new Error('无法读取这张图片，请换一张 PNG 或 JPEG');
    const size = image.getSize();
    const edge = Math.min(size.width, size.height);
    const cropped = image.crop({ x: Math.max(0, Math.round((size.width - edge) / 2)), y: Math.max(0, Math.round((size.height - edge) / 2)), width: edge, height: edge });
    writeFileSync(dockIconFile(), cropped.resize({ width: 128, height: 128, quality: 'best' }).toPNG());
    store.setSetting('dockIconSource', 'custom');
    return changed();
  });
  handle('assistant', async input => {
    const request = z.object({ action: z.enum(['toggle', 'show', 'hide', 'status']), source: z.enum(['main', 'dock', 'tray']).optional(), prompt: z.string().trim().min(1).max(10000).optional(), animate: z.boolean().optional() }).strict().parse(input);
    const animate = request.animate !== false;
    if (request.action === 'toggle') await (assistantVisible() || assistantShouldShow ? hideAssistant(animate) : showAssistant(request.prompt, animate, request.source ?? 'main'));
    else if (request.action === 'show') await showAssistant(request.prompt, animate, request.source ?? 'main');
    else if (request.action === 'hide') await hideAssistant(animate);
    return assistantShouldShow || assistantVisible();
  });
  handle('assistant:ready', () => {
    assistantReady = true;
    sendAssistantAnchor();
    if (queuedAssistantPrompt && assistantWin && !assistantWin.isDestroyed()) {
      assistantWin.webContents.send('assistant:prompt', queuedAssistantPrompt);
      queuedAssistantPrompt = null;
    }
  });
  handle('settings:open', async animate => {
    await setMainCollapsed(false, z.boolean().optional().parse(animate) ?? true);
    show();
    win.webContents.send('settings:open');
  });
  handle('settings', input => {
    const data = z.object({ aiEnabled: z.boolean(), autoStart: z.boolean() }).strict().parse(input);
    if (data.aiEnabled && !activeConnection()) throw new Error('开启 AI 前，请先添加供应商和模型');
    store.setSetting('aiEnabled', data.aiEnabled);
    if (!testMode && data.autoStart !== settings().autoStart) {
      app.setLoginItemSettings({ openAtLogin: data.autoStart, path: process.execPath, args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'] });
    }
    activeRequest?.abort(); pending = null;
    return changed();
  });
  handle('provider:save', input => {
    const data = z.object({
      id: z.union([z.string().uuid(), z.literal('')]).optional(), kind: aiProviderKindSchema,
      name: z.string().trim().min(1, '请填写供应商名称').max(30, '供应商名称最多30字'),
      endpoint: z.string().max(2000), protocol: aiProtocolSchema,
      apiKey: z.string().max(4000).optional(), clearKey: z.boolean().optional(),
    }).strict().parse(input);
    const endpoint = validateEndpoint(data.endpoint.trim());
    const providers = loadProviders();
    const models = loadModels();
    let next: StoredProvider;
    if (data.id) {
      const current = providers.find(provider => provider.id === data.id);
      if (!current) throw new Error('供应商不存在');
      assertUniqueName(providers, data.name, current.id, '已有同名供应商');
      next = {
        ...current, kind: data.kind, name: data.name, endpoint, protocol: data.protocol,
        apiKey: data.clearKey ? '' : data.apiKey ? encryptKey(data.apiKey) : current.apiKey,
      };
      providers.splice(providers.findIndex(provider => provider.id === current.id), 1, next);
    } else {
      if (providers.length >= MAX_PROVIDERS) throw new Error('最多保存8个供应商');
      assertUniqueName(providers, data.name, undefined, '已有同名供应商');
      next = { id: randomUUID(), kind: data.kind, name: data.name, endpoint, protocol: data.protocol, apiKey: data.apiKey ? encryptKey(data.apiKey) : '' };
      providers.push(next);
    }
    persistAi(providers, models, store.setting('aiActiveModelId', ''));
    activeRequest?.abort(); pending = null;
    return changed();
  });
  handle('provider:remove', id => {
    const providerId = z.string().uuid().parse(id);
    const providers = loadProviders().filter(provider => provider.id !== providerId);
    if (providers.length === loadProviders().length) throw new Error('供应商不存在');
    const models = loadModels().filter(model => model.providerId !== providerId);
    store.transaction(() => {
      persistAi(providers, models, store.setting('aiActiveModelId', ''));
      if (!models.length) store.setSetting('aiEnabled', false);
    });
    activeRequest?.abort(); pending = null;
    return changed();
  });
  handle('model:save', input => {
    const data = z.object({
      id: z.union([z.string().uuid(), z.literal('')]).optional(),
      providerId: z.string().uuid(),
      name: z.string().trim().min(1, '请填写模型名称或 ID').max(200, '模型名称最多200字'),
    }).strict().parse(input);
    const providers = loadProviders();
    if (!providers.some(provider => provider.id === data.providerId)) throw new Error('请先保存供应商');
    const models = loadModels();
    const siblings = models.filter(model => model.providerId === data.providerId);
    let next: StoredModel;
    if (data.id) {
      const current = models.find(model => model.id === data.id);
      if (!current || current.providerId !== data.providerId) throw new Error('模型不存在');
      assertUniqueName(siblings, data.name, current.id, '该供应商已有同名模型');
      next = { ...current, name: data.name };
      models.splice(models.findIndex(model => model.id === current.id), 1, next);
    } else {
      if (siblings.length >= MAX_MODELS) throw new Error('每个供应商最多保存8个模型');
      assertUniqueName(siblings, data.name, undefined, '该供应商已有同名模型');
      next = { id: randomUUID(), providerId: data.providerId, name: data.name };
      models.push(next);
    }
    persistAi(providers, models, store.setting('aiActiveModelId', '') || next.id);
    return changed();
  });
  handle('model:remove', id => {
    const modelId = z.string().uuid().parse(id);
    const remaining = loadModels().filter(model => model.id !== modelId);
    if (remaining.length === loadModels().length) throw new Error('模型不存在');
    store.transaction(() => {
      persistAi(loadProviders(), remaining, store.setting('aiActiveModelId', ''));
      if (!remaining.length) store.setSetting('aiEnabled', false);
    });
    activeRequest?.abort(); pending = null;
    return changed();
  });
  handle('provider:test', async input => {
    const data = z.object({
      providerId: z.string().uuid().optional(),
      endpoint: z.string().max(2000).optional(),
      protocol: aiProtocolSchema.optional(),
      apiKey: z.string().max(4000).optional(),
      model: z.string().trim().min(1, '请填写模型名称或 ID').max(200),
    }).strict().parse(input);
    const provider = data.providerId ? loadProviders().find(item => item.id === data.providerId) : undefined;
    if (data.providerId && !provider) throw new Error('供应商不存在');
    const endpoint = data.endpoint?.trim() || provider?.endpoint || '';
    const protocol = data.protocol ?? provider?.protocol ?? 'openai-chat';
    const key = data.apiKey || (provider ? decryptKey(provider.apiKey) : '');
    if (!endpoint) throw new Error('请填写服务地址');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try { return await testConnection({ endpoint, model: data.model, protocol, key }, controller.signal); }
    finally { clearTimeout(timeout); }
  });
  handle('profile:activate', id => {
    const modelId = z.string().uuid().parse(id);
    const models = loadModels();
    if (!models.some(model => model.id === modelId)) throw new Error('模型不存在');
    persistAi(loadProviders(), models, modelId);
    return changed();
  });
  handle('chat:list', () => store.chats());
  handle('chat:open', id => {
    const activeId = store.setting('activeChatId', '');
    const selected = id ? z.string().uuid().parse(id) : activeId;
    const chat = selected ? store.chat(selected) : store.newChat();
    store.setSetting('activeChatId', chat.id);
    if (!activeRequest) {
      for (const entry of chat.entries) if (entry.actionState === 'pending' && entry.proposal?.token !== pending?.plan.token) entry.actionState = 'expired';
    }
    const saved = store.saveChat(chat);
    if (id && id !== activeId) emitChat(saved, true);
    return saved;
  });
  handle('chat:new', () => {
    if (activeRequest) throw new Error('请先等待回复完成或取消生成');
    const currentId = store.setting('activeChatId', '');
    if (pending && currentId && store.chat(currentId).entries.some(entry => entry.proposal?.token === pending?.plan.token)) {
      store.resolveChatProposal(pending.plan.token, 'discarded'); pending = null;
    }
    const chat = store.newChat(); emitChat(chat, true); return chat;
  });
  handle('chat:draft', (id, text) => {
    const chat = store.chat(z.string().uuid().parse(id));
    chat.draft = z.string().max(10000).parse(text); emitChat(store.saveChat(chat));
  });
  const ask = async (input: unknown, sessionId?: string) => {
    const request = z.object({ text: z.string().trim().min(1).max(10000, '输入最多10000字'), history: z.array(aiConversationTurnSchema).max(12) }).strict().parse(input);
    const config = settings();
    const connection = activeConnection();
    if (!config.aiEnabled || !connection) throw new Error('请先在设置中配置并启用 AI');
    if (activeRequest) throw new Error('已有 AI 请求正在处理');
    const key = decryptKey(connection.provider.apiKey);
    const chat = sessionId ? store.chat(sessionId) : null;
    const pendingInChat = pending && chat?.entries.some(entry => entry.actionState === 'pending' && entry.proposal?.token === pending?.plan.token) ? pending : null;
    if (pending && !pendingInChat) { store.resolveChatProposal(pending.plan.token, 'expired'); pending = null; }
    const previousPending = pendingInChat;
    const assistantId = randomUUID();
    if (chat) {
      chat.entries.push({ id: randomUUID(), role: 'user', content: request.text }, { id: assistantId, role: 'assistant', content: '', streaming: true, tools: [] });
      if (chat.title === '新对话') chat.title = request.text.slice(0, 32);
      chat.draft = ''; store.saveChat(chat); emitChat(chat);
    }
    const updateEntry = (change: (entry: import('../shared/contracts').ChatEntry) => void) => {
      if (!chat) return;
      const latest = store.chat(chat.id); const entry = latest.entries.find(item => item.id === assistantId)!;
      change(entry); emitChat(store.saveChat(latest));
    };
    const controller = new AbortController(); activeRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 45000);
    const tasks = store.all(); const categories = store.categories();
    let deltaTimer: ReturnType<typeof setTimeout> | null = null; let latestDelta = '';
    const pushDelta = (text: string) => {
      updateEntry(entry => { entry.content = text; });
      if (!assistantWin || assistantWin.isDestroyed() || assistantWin.webContents.isDestroyed()) return;
      assistantWin.webContents.send('ai:delta', text);
    };
    const onDelta = (text: string) => {
      latestDelta = text;
      if (deltaTimer) return;
      deltaTimer = setTimeout(() => { deltaTimer = null; if (latestDelta) pushDelta(latestDelta); }, 50);
    };
    try {
      const plan = await requestPlan({ endpoint: connection.provider.endpoint, model: connection.model.name, protocol: connection.provider.protocol, key }, request.text, request.history, tasks, categories, controller.signal, onDelta, tool => updateEntry(entry => {
        const tools = entry.tools ?? []; const index = tools.findIndex(item => item.id === tool.id);
        if (index < 0) tools.push(tool); else tools[index] = tool;
        entry.tools = tools;
      }));
      if (controller.signal.aborted) throw new Error('已取消生成，输入内容已保留。');
      if (deltaTimer) { clearTimeout(deltaTimer); deltaTimer = null; }
      if (latestDelta) pushDelta(latestDelta);
      const proposal = { ...plan, token: randomUUID() };
      if (proposal.actions.length) {
        if (previousPending) store.resolveChatProposal(previousPending.plan.token, 'revised');
        pending = { plan: proposal, revisions: new Map([...tasks, ...categories].map(item => [item.id, item.updatedAt])) };
      }
      updateEntry(entry => {
        entry.content = proposal.message; entry.streaming = false;
        if (proposal.actions.length) { entry.proposal = proposal; entry.actionState = 'pending'; }
      });
      return proposal;
    } catch (cause) {
      if (deltaTimer) { clearTimeout(deltaTimer); deltaTimer = null; }
      updateEntry(entry => {
        entry.streaming = false; entry.error = cause instanceof Error ? cause.message : '请求失败，请重试';
        for (const tool of entry.tools ?? []) if (tool.status === 'running') tool.status = 'interrupted';
      });
      if (chat) { const latest = store.chat(chat.id); latest.draft ||= request.text; emitChat(store.saveChat(latest)); }
      throw cause;
    } finally { if (deltaTimer) clearTimeout(deltaTimer); clearTimeout(timeout); activeRequest = null; }
  };
  handle('ask', input => ask(input));
  handle('chat:ask', async input => {
    const request = z.object({ sessionId: z.string().uuid(), text: z.string().trim().min(1).max(10000) }).strict().parse(input);
    const chat = store.chat(request.sessionId);
    const stateText = { pending: '等待用户确认', applied: '用户已应用', discarded: '用户已放弃', expired: '已过期，未应用', revised: '已被后续对话更新' } as const;
    const history = chat.entries.filter(entry => !entry.streaming && !entry.error && entry.content.trim()).slice(-12).map(entry => ({
      role: entry.role,
      content: `${entry.content}${entry.actionState ? `\n[建议状态：${stateText[entry.actionState]}]` : ''}${entry.actionState === 'pending' && entry.proposal ? `\n[待确认建议：${JSON.stringify(entry.proposal.actions)}]` : ''}`.slice(0, 6000),
    }));
    await ask({ text: request.text, history }, chat.id);
    return store.chat(chat.id);
  });
  handle('proposal:update', input => {
    if (activeRequest) throw new Error('请先等待当前回复完成');
    const request = z.object({ token: z.string().uuid(), index: z.number().int().min(0), action: aiActionSchema }).strict().parse(input);
    if (!pending || pending.plan.token !== request.token) throw new Error('建议已应用或已过期，请重新生成');
    const original = pending.plan.actions[request.index];
    if (!original) throw new Error('建议不存在，请重新生成');
    const actions = [...pending.plan.actions];
    actions[request.index] = proposalActionWithinScope(original, request.action);
    pending.plan = { ...pending.plan, actions };
    const chat = store.updateChatProposal(request.token, actions); emitChat(chat); return chat;
  });
  handle('apply', input => {
    if (activeRequest) throw new Error('请先等待当前回复完成');
    const request = z.object({
      token: z.string().uuid(),
      items: z.array(z.object({ index: z.number().int().min(0), action: aiActionSchema }).strict()).min(1, '请至少选择一项建议').max(20),
    }).strict().parse(input);
    if (!pending || pending.plan.token !== request.token) throw new Error('建议已应用或已过期，请重新生成');
    const seen = new Set<number>();
    const actions = [...request.items].sort((a, b) => a.index - b.index).map(item => {
      if (seen.has(item.index)) throw new Error('建议选择重复，请重试');
      seen.add(item.index);
      const original = pending!.plan.actions[item.index];
      if (!original) throw new Error('建议不存在，请重新生成');
      return proposalActionWithinScope(original, item.action);
    });
    store.applyPlan({ message: pending.plan.message, actions }, pending.revisions, pending.plan.token); pending = null; tick(); return changed();
  });
  handle('cancelAI', () => {
    if (activeRequest) { activeRequest.abort(); return; }
    if (pending) { const chat = store.resolveChatProposal(pending.plan.token, 'discarded'); if (chat) emitChat(chat); pending = null; }
  });
  handle('review', () => store.review());
  handle('exportData', async () => {
    const result = await dialog.showSaveDialog(win, { title: '导出待办备份', defaultPath: `To Do List-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'JSON 备份', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return null;
    writeFileSync(result.filePath, JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), tasks: store.all(true), categories: store.categories() }, null, 2), 'utf8');
    return result.filePath;
  });
  handle('openData', async () => { const error = await shell.openPath(app.getPath('userData')); if (error) throw new Error('无法打开数据目录'); });
  handle('updater:status', () => updaterPayload());
  handle('updater:check', () => { checkForUpdates('settings'); });
  handle('updater:install', () => { if (updateReadyVersion) autoUpdater.quitAndInstall(); });
  handle('updater:openLog', (tag?: string) => {
    const base = 'https://github.com/zhshenry/To-Do-List/releases';
    const url = tag && /^\d+\.\d+\.\d+$/.test(tag) ? `${base}/tag/v${tag}` : base;
    return shell.openExternal(url);
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) show(); });
  app.whenReady().then(() => {
    const dataDir = app.getPath('userData'); mkdirSync(dataDir, { recursive: true });
    store = new Store(path.join(dataDir, 'tasks.db'));
    // Migrate once: old compact mode describes which surface was visible, not an ongoing constraint.
    if (store.setting('mainVisible', undefined) === undefined) store.setSetting('mainVisible', !store.setting('compact', false));
    if (store.setting('dockEnabled', undefined) === undefined) store.setSetting('dockEnabled', true);
    if (store.setting('dockAlwaysOnTop', undefined) === undefined) store.setSetting('dockAlwaysOnTop', store.setting('alwaysOnTop', true));
    if (store.setting('dockIconPreset', undefined) === undefined) store.setSetting('dockIconPreset', 'orbit');
    if (store.setting('mainWindowWidth', undefined) === undefined) store.setSetting('mainWindowWidth', savedMainWindowWidth());
    const area = screen.getPrimaryDisplay().workArea;
    const position = store.setting<{ x: number; y: number }>('position', { x: area.x + area.width - 470, y: area.y + 40 });
    win = new BrowserWindow({ width: 440, height: 700, x: position.x, y: position.y, minWidth: 340, minHeight: 480,
      title: 'To Do List', frame: false, thickFrame: false, transparent: true, backgroundColor: '#00000000', resizable: false, maximizable: false, minimizable: false,
      show: false, skipTaskbar: true, alwaysOnTop: settings().alwaysOnTop, icon: windowIcon,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true },
    });
    fitWindow();
    let moveTimer: ReturnType<typeof setTimeout>;
    win.on('moved', () => {
      followAssistant('main');
      clearTimeout(moveTimer); moveTimer = setTimeout(() => { if (win.isDestroyed()) return; const { x, y } = win.getBounds(); store.setSetting('position', { x, y }); }, 250);
    });
    win.on('close', event => { if (!quitting) { event.preventDefault(); hideMain(); } });
    protectWindow(win);
    registerHandlers();
    tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 24, height: 24 }));
    tray.setToolTip('To Do List · 点击查看待办');
    tray.setContextMenu(Menu.buildFromTemplate(trayContextMenu()));
    tray.on('click', () => { if (win.isVisible()) hideMain(); else show(); });
    setupUpdater();
    globalShortcut.register('CommandOrControl+Shift+Space', () => { if (win.isVisible()) hideMain(); else show(); });
    screen.on('display-removed', () => { void fitWindow(); fitAssistantToDisplay(); changed(); });
    screen.on('display-metrics-changed', () => { void fitWindow(); fitAssistantToDisplay(); changed(); });
    powerMonitor.on('resume', () => { tick(); changed(); });
    timer = setInterval(tick, testMode ? 200 : 15000);
    loadRenderer(win, 'main');
    win.once('ready-to-show', () => {
      tick();
      if (!process.argv.includes('--hidden') && store.setting('mainVisible', true)) show();
      if (DOCK_FEATURE_ENABLED) void showDock().catch(error => {
        console.error('Dock failed to open; restoring the main window.', error);
        show();
      });
    });
  }).catch(error => { dialog.showErrorBox('To Do List 无法启动', `请保留数据目录后重试。\n${error.message}`); app.quit(); });
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => {
    quitting = true; activeRequest?.abort(); clearInterval(timer); cancelMainMotion(); cancelAssistantMotion(); globalShortcut.unregisterAll();
    if (dockWin && !dockWin.isDestroyed()) dockWin.destroy();
    if (taskbarWin && !taskbarWin.isDestroyed()) taskbarWin.destroy();
  });
  app.on('will-quit', () => { store?.close(); });
}
