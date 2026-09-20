import { DockIcon, DOCK_ICONS } from './DockIcon';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { CaretDown, Eye, EyeSlash, Lightning, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react';
import type { AIModel, AIProtocol, AIProvider, AIProviderKind, DesktopAPI, MainWindowWidth, Settings, State, UpdaterStatus } from '../shared/contracts';
import { AI_PROVIDER_PRESETS, DOCK_FEATURE_ENABLED } from '../shared/contracts';
import { Modal, IconButton, Segmented, Select, HelpTip, errorText } from './ui';
import './settings.css';

const TABS = [
  { id: 'general', label: '通用' },
  { id: 'ai', label: 'AI配置' },
] as const;
export type SettingsTab = typeof TABS[number]['id'];

function updaterText(updater: UpdaterStatus): string {
  if (!updater.active) return `当前版本 v${updater.version}。自动更新仅在安装版中可用；免安装版请手动下载新版解压替换。`;
  if (updater.state === 'checking') return '正在检查更新…';
  if (updater.state === 'downloading') return `正在下载新版本…${updater.progress > 0 ? `（${updater.progress}%）` : ''}`;
  if (updater.state === 'ready') return `新版本 v${updater.readyVersion} 已下载，重启后即可完成安装。`;
  if (updater.state === 'latest') return `已是最新版本 v${updater.version}。`;
  if (updater.state === 'error') return `检查更新失败：${updater.message}`;
  return `当前版本 v${updater.version}。启动后会自动检查更新，也可手动检查。`;
}

type RegisterFlush = (id: string, flush: (() => Promise<void>) | null) => void;

const PROVIDER_KIND_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'custom', label: '自定义' },
];
const PROTOCOL_OPTIONS = [
  { value: 'openai-chat', label: 'OpenAI Chat Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic', label: 'Anthropic Messages' },
];
type ProviderDraft = { id: string; kind: AIProviderKind; name: string; endpoint: string; protocol: AIProtocol; apiKey: string; clearKey: boolean };
function emptyProvider(): ProviderDraft {
  return { id: '', kind: 'openai', ...AI_PROVIDER_PRESETS.openai, apiKey: '', clearKey: false };
}
function providerDraftFrom(provider: AIProvider): ProviderDraft {
  return { id: provider.id, kind: provider.kind, name: provider.name, endpoint: provider.endpoint, protocol: provider.protocol, apiKey: '', clearKey: false };
}
function withKind(kind: AIProviderKind, current: ProviderDraft): ProviderDraft {
  const preset = AI_PROVIDER_PRESETS[kind];
  return { ...current, kind, name: preset.name, endpoint: preset.endpoint, protocol: preset.protocol };
}

function ProviderCard({ provider, models, activeModelId, api, changed, fail, onClose, onDirty, onPending, registerFlush, canCancel = false }: {
  provider: AIProvider | null; models: AIModel[]; activeModelId: string; api: DesktopAPI;
  changed(state: State): void; fail(message: string): void; onClose?(): void; onDirty(dirty: boolean): void;
  registerFlush: RegisterFlush; canCancel?: boolean; onPending(dirty: boolean): void;
}) {
  const [draft, setDraft] = useState<ProviderDraft>(() => provider ? providerDraftFrom(provider) : emptyProvider());
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [rename, setRename] = useState(!provider);
  const [editing, setEditing] = useState(!provider);
  const [modelsOpen, setModelsOpen] = useState(true);
  const [adding, setAdding] = useState(!provider || models.length === 0);
  const [modelName, setModelName] = useState('');
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [modelDraft, setModelDraft] = useState('');
  const [testNote, setTestNote] = useState('');
  const draftRef = useRef(draft); draftRef.current = draft;
  const modelRef = useRef(modelName); modelRef.current = modelName;
  const modelEditRef = useRef({ id: editingModel, name: modelDraft }); modelEditRef.current = { id: editingModel, name: modelDraft };
  const queue = useRef(Promise.resolve());
  const baseline = useRef(draft);
  const storedRef = useRef(provider); storedRef.current = provider ?? storedRef.current;
  const saved = provider;
  const current = models.some(model => model.id === activeModelId);
  function update(next: ProviderDraft) { draftRef.current = next; setDraft(next); if (!saved) onDirty(true); else onPending(JSON.stringify(next) !== JSON.stringify(baseline.current)); }
  async function persist(next = draft): Promise<{ stored: AIProvider; state: State }> {
    const name = next.name.trim() || AI_PROVIDER_PRESETS[next.kind].name;
    if (!name || !next.endpoint.trim()) throw new Error('请填写供应商名称和服务地址');
    const state = await api.saveProvider({ ...next, id: next.id || undefined, name });
    const stored = state.settings.providers.find(item => next.id ? item.id === next.id : item.name === name);
    if (!stored) throw new Error('供应商未保存');
    storedRef.current = stored;
    baseline.current = providerDraftFrom(stored);
    if (draftRef.current === next) { draftRef.current = baseline.current; setDraft(baseline.current); onPending(false); }
    changed(state);
    return { stored, state };
  }
  async function run(action: () => Promise<void>) {
    if (busy) return; setBusy(true); fail(''); setTestNote('');
    try { await action(); } catch (e) { fail(errorText(e)); } finally { setBusy(false); }
  }
  async function finishNew(state: State) {
    setModelName(''); setAdding(false); onDirty(false); onClose?.(); changed(state);
  }
  async function addModel() {
    const name = modelName.trim(); if (!name) return;
    await run(async () => {
      await flushProvider();
      const target = storedRef.current ?? (await persist(draftRef.current)).stored;
      let state = await api.saveModel({ providerId: target.id, name: modelRef.current.trim() || name });
      if (!saved) {
        const created = state.settings.models.find(model => model.providerId === target.id && model.name === name);
        if (created) state = await api.activateProfile(created.id);
      }
      await finishNew(state);
    });
  }
  async function flushProvider() {
    if (!provider) return;
    const operation = queue.current.catch(() => undefined).then(async () => {
      const next = draftRef.current;
      if (JSON.stringify(next) !== JSON.stringify(baseline.current)) await persist(next);
    });
    queue.current = operation;
    return operation;
  }
  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  flushRef.current = async () => {
    await flushProvider();
    const edit = modelEditRef.current;
    if (edit.id) {
      const model = models.find(item => item.id === edit.id);
      if (model) await renameModel(model);
    }
  };
  useEffect(() => {
    const id = provider ? `provider-${provider.id}` : 'provider-new';
    registerFlush(id, () => flushRef.current());
    return () => registerFlush(id, null);
  }, [provider?.id, registerFlush]);
  function saveOnBlur() { if (saved) void flushProvider().catch(e => fail(errorText(e))); }
  async function probe(name: string) {
    await run(async () => {
      const model = name.trim();
      if (!model) throw new Error('请先填写模型名称或 ID');
      const next = draftRef.current;
      setTestNote(await api.testConnection({
        providerId: saved?.id,
        endpoint: next.endpoint.trim() || undefined,
        protocol: next.protocol,
        apiKey: next.apiKey || undefined,
        model,
      }));
    });
  }
  async function renameModel(model: AIModel) {
    const name = modelEditRef.current.name.trim();
    if (!name) throw new Error('请填写模型名称，修改才能自动保存');
    if (name === model.name) { setEditingModel(null); onPending(false); return; }
    const operation = queue.current.catch(() => undefined).then(async () => {
      if (modelEditRef.current.id !== model.id) return;
      changed(await api.saveModel({ id: model.id, providerId: model.providerId, name }));
      modelEditRef.current.id = null; setEditingModel(null); onPending(false);
    });
    queue.current = operation;
    await operation;
  }
  return <article className="provider-card">
    {saved ? <header className="provider-card-head">
      {!rename ? <b>{saved.name}</b> : null}
      {!editing ? <IconButton label={`编辑 ${saved.name}`} onClick={() => { setEditing(true); setRename(true); }}><PencilSimple size={16} /></IconButton> : <button type="button" disabled={busy} onClick={() => void run(async () => { await flushProvider(); setEditing(false); setRename(false); })}>收起编辑</button>}
      {current ? <span className="provider-badge">当前</span> : null}
      <span className="provider-card-spacer" />
      {confirming ? <>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}>保留</button>
        <button type="button" className="danger" disabled={busy} onClick={() => void run(async () => { const state = await api.removeProvider(saved.id); onDirty(false); onPending(false); changed(state); })}>删除</button>
      </> : <IconButton className="text-danger" label={`删除供应商 ${saved.name}`} onClick={() => setConfirming(true)}><Trash size={16} /></IconButton>}
    </header> : null}
    {!saved ? <p className="field-help">选择服务，填写密钥和模型后添加。新供应商在点击添加前不会保存。</p> : null}
    {!saved || editing ? <>
      <label htmlFor={saved ? `ai-provider-kind-${saved.id}` : 'ai-provider-kind'}>供应商类型</label>
      <Select id={saved ? `ai-provider-kind-${saved.id}` : 'ai-provider-kind'} aria-label="供应商类型" value={draft.kind} onChange={value => {
        const kind = value as AIProviderKind;
        const next = withKind(kind, draftRef.current);
        // A stored credential is never forwarded to a different service by changing its preset.
        if (kind !== draft.kind && (saved?.hasKey || draftRef.current.apiKey)) { fail('当前已填写密钥。请先移除密钥再切换供应商，或添加新供应商。'); return; }
        update(next);
        if (saved) void flushProvider().catch(e => fail(errorText(e)));
      }} options={PROVIDER_KIND_OPTIONS} />
    </> : null}
    {rename || (!saved && draft.kind === 'custom') ? <>
      <div className="label-with-help">
        <label htmlFor={saved ? `ai-provider-name-${saved.id}` : 'ai-provider-name'}>供应商名称</label>
      </div>
      <input id={saved ? `ai-provider-name-${saved.id}` : 'ai-provider-name'} aria-label="供应商名称" value={draft.name} maxLength={30} placeholder="请输入供应商名称" autoComplete="off" onChange={e => update({ ...draft, name: e.target.value })} onBlur={saveOnBlur} />
    </> : null}
    {!saved || editing ? <>
      <label htmlFor={saved ? `ai-endpoint-${saved.id}` : 'ai-endpoint'}>服务地址</label>
      <input id={saved ? `ai-endpoint-${saved.id}` : 'ai-endpoint'} aria-label="服务地址" value={draft.endpoint} placeholder="https://你的服务域名/v1" autoComplete="off" onChange={e => update({ ...draft, endpoint: e.target.value })} onBlur={saveOnBlur} />
      {draft.endpoint.trim().toLowerCase().startsWith('http://') ? <p className="warning">当前使用 HTTP：API Key、事项和对话内容会明文传输。仅建议用于可信内网或本机服务；公网服务请使用 HTTPS。</p> : null}
      <label htmlFor={saved ? `ai-key-${saved.id}` : 'ai-key'} className="label-with-help">API Key <HelpTip label="API Key 说明" place="up">同一供应商的模型共用密钥。使用 Windows 加密后保存在本机。</HelpTip></label>
      <div className="secret-field"><input id={saved ? `ai-key-${saved.id}` : 'ai-key'} type={visible ? 'text' : 'password'} value={draft.apiKey} onChange={e => update({ ...draft, apiKey: e.target.value, clearKey: false })} onBlur={saveOnBlur} autoComplete="new-password" placeholder={saved?.hasKey && !draft.clearKey ? '••••••••' : '填写服务提供的密钥'} /><IconButton label={!draft.apiKey ? '输入新密钥后可查看' : visible ? '隐藏密钥' : '显示密钥'} disabled={!draft.apiKey} onClick={() => setVisible(!visible)}>{visible ? <EyeSlash size={20} /> : <Eye size={20} />}</IconButton>{saved?.hasKey && !draft.clearKey ? <IconButton className="text-danger" label="移除已保存的密钥" onClick={() => { update({ ...draftRef.current, clearKey: true, apiKey: '' }); void flushProvider().catch(e => fail(errorText(e))); }}><X size={16} /></IconButton> : null}</div>
      <label htmlFor={saved ? `ai-protocol-${saved.id}` : 'ai-protocol'} className="label-with-help">服务协议 <HelpTip label="服务协议说明">助手通过所选协议访问 /chat/completions、/responses 或 /messages。预设供应商会填好协议，一般无需更改。</HelpTip></label>
      <Select id={saved ? `ai-protocol-${saved.id}` : 'ai-protocol'} aria-label="服务协议" value={draft.protocol} onChange={value => { update({ ...draftRef.current, protocol: value as AIProtocol }); if (saved) void flushProvider().catch(e => fail(errorText(e))); }} options={PROTOCOL_OPTIONS} />
    </> : null}
    <button type="button" className="model-toggle" aria-expanded={modelsOpen} aria-controls={saved ? `models-${saved.id}` : 'models-new'} onClick={() => setModelsOpen(open => !open)}>
      <span>模型列表{models.length ? `（${models.length}）` : ''}</span>
      <CaretDown size={14} weight="bold" />
    </button>
    {modelsOpen ? <div className="model-box" id={saved ? `models-${saved.id}` : 'models-new'}>
      {models.length ? <ul className="model-list" aria-label={`${saved?.name || draft.name || '新供应商'} 的模型`}>{models.map(model => <li key={model.id}>
        {editingModel === model.id ? <input aria-label={`编辑模型 ${model.name}`} value={modelDraft} maxLength={200} autoFocus onChange={e => { modelEditRef.current.name = e.target.value; setModelDraft(e.target.value); onPending(e.target.value !== model.name); }} onBlur={() => void renameModel(model).catch(e => fail(errorText(e)))} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void renameModel(model).catch(cause => fail(errorText(cause))); } }} /> : <span className="category-name">{model.name}</span>}
        <button type="button" className="model-test-button" disabled={busy || !(saved || draft.endpoint.trim())} aria-label={`测试连接 ${model.name}`} onClick={() => void probe(model.name)}><Lightning size={13} /></button>
        {editingModel === model.id ? null : <IconButton label={`重命名 ${model.name}`} onClick={() => { modelEditRef.current = { id: model.id, name: model.name }; setEditingModel(model.id); setModelDraft(model.name); }}><PencilSimple size={15} /></IconButton>}
        <IconButton className="text-danger" label={`删除 ${model.name}`} onClick={() => void run(async () => { changed(await api.removeModel(model.id)); })}><Trash size={15} /></IconButton>
      </li>)}</ul> : <p className="field-help">还没有模型。同一供应商可添加多个模型名称或 ID，每个都能单独测试。</p>}
      {adding ? <div className="model-create"><input id={saved ? `ai-model-${saved.id}` : 'ai-model'} aria-label="模型名称 / ID" value={modelName} maxLength={200} placeholder="填写服务提供的模型名称" autoComplete="off" onChange={e => { modelRef.current = e.target.value; setModelName(e.target.value); onDirty(Boolean(e.target.value)); }} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void addModel(); } }} /><button type="button" disabled={busy || !modelName.trim() || !draft.endpoint.trim()} onClick={() => void addModel()}>{saved ? '添加模型' : '添加并使用'}</button><button type="button" className="model-test-button" disabled={busy || !modelName.trim() || !(saved || draft.endpoint.trim())} aria-label="测试连接" onClick={() => void probe(modelName)}><Lightning size={13} /></button></div> : models.length < 8 ? <button type="button" className="model-add-button" onClick={() => setAdding(true)}><Plus size={14} weight="bold" /> 添加模型</button> : null}
      {adding ? <p className="field-help">新模型填写后请点击“{saved ? '添加模型' : '添加并使用'}”。测试连接不会保存草稿。</p> : null}
      {testNote ? <p className="field-help" role="status">{testNote}</p> : null}
    </div> : null}
    {!saved && canCancel ? <button type="button" onClick={onClose}>取消添加</button> : null}
  </article>;
}

function settingsDraft(settings: Settings) {
  return { aiEnabled: settings.aiEnabled, autoStart: settings.autoStart };
}

export function SettingsPanel({ settings, api: rawApi, changed, close, initialTab = 'general' }: { settings: Settings; api: DesktopAPI; saved(state: State): void; changed(state: State): void; close(): void; initialTab?: SettingsTab }) {
  const [draft, setDraft] = useState(() => settingsDraft(settings));
  const settingsRef = useRef(draft); settingsRef.current = draft;
  const persistedSettings = useRef(draft);
  const settingsQueue = useRef(Promise.resolve());
  const flushers = useRef(new Map<string, () => Promise<void>>());
  const [pending, setPending] = useState(0);
  const pendingWrites = useRef(new Set<Promise<unknown>>());
  const [hasSaved, setHasSaved] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, boolean>>({});
  const [uncommitted, setUncommitted] = useState<Record<string, boolean>>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [paneDir, setPaneDir] = useState<'next' | 'prev' | ''>('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [updater, setUpdater] = useState<UpdaterStatus | null>(null);
  const [creating, setCreating] = useState(false);
  const api = useMemo<DesktopAPI>(() => {
    function track<T>(action: () => Promise<T>): Promise<T> {
      setPending(count => count + 1); setError('');
      const request = action().then(value => { setHasSaved(true); return value; }).catch(cause => { setError(errorText(cause)); throw cause; }).finally(() => {
        pendingWrites.current.delete(request); setPending(count => count - 1);
      });
      pendingWrites.current.add(request);
      return request;
    }
    return { ...rawApi,
      settings: input => track(() => rawApi.settings(input)),
      dockIcon: (action, preset) => track(() => rawApi.dockIcon(action, preset)),
      dockEnabled: enabled => track(() => rawApi.dockEnabled(enabled)),
      windowWidth: (width, animate) => track(() => rawApi.windowWidth(width, animate)),
      saveProvider: input => track(() => rawApi.saveProvider(input)),
      removeProvider: id => track(() => rawApi.removeProvider(id)),
      saveModel: input => track(() => rawApi.saveModel(input)),
      removeModel: id => track(() => rawApi.removeModel(id)),
      activateProfile: id => track(() => rawApi.activateProfile(id)),
    };
  }, [rawApi]);
  const registerFlush = useMemo<RegisterFlush>(() => (id, flush) => {
    if (flush) flushers.current.set(id, flush); else flushers.current.delete(id);
  }, []);
  useEffect(() => { void api.updaterStatus().then(setUpdater).catch(e => setError(errorText(e))); return api.onUpdater(setUpdater); }, []);
  useEffect(() => {
    if (JSON.stringify(settingsRef.current) !== JSON.stringify(persistedSettings.current)) return;
    const next = settingsDraft(settings);
    persistedSettings.current = next; settingsRef.current = next; setDraft(next);
  }, [settings.aiEnabled, settings.autoStart]);
  useEffect(() => { setTab(initialTab); setPaneDir(''); }, [initialTab]);
  async function flushEdits() {
    await settingsQueue.current.catch(() => undefined);
    if (JSON.stringify(settingsRef.current) !== JSON.stringify(persistedSettings.current)) {
      const next = settingsRef.current;
      const state = await api.settings(next); persistedSettings.current = next; changed(state);
    }
    for (const flush of flushers.current.values()) await flush();
    await Promise.all([...pendingWrites.current]);
  }
  async function selectTab(next: SettingsTab) {
    if (next === tab) return;
    try { await flushEdits(); } catch (e) { setError(errorText(e)); return false; }
    const from = TABS.findIndex(item => item.id === tab);
    const to = TABS.findIndex(item => item.id === next);
    const forward = (to - from + TABS.length) % TABS.length;
    setPaneDir(forward <= TABS.length / 2 ? 'next' : 'prev');
    setTab(next);
    return true;
  }
  function updateSettings(next: typeof draft) {
    settingsRef.current = next; setDraft(next);
    const operation = settingsQueue.current.catch(() => undefined).then(async () => {
      const state = await api.settings(next); persistedSettings.current = next; changed(state);
    });
    settingsQueue.current = operation;
    void operation.catch(e => {
      if (settingsRef.current === next) {
        settingsRef.current = persistedSettings.current;
        setDraft(persistedSettings.current);
      }
      setError(errorText(e));
    });
  }
  async function finish() {
    if (busy) return; setBusy(true); setError('');
    try {
      await flushEdits();
      if (Object.values(drafts).some(Boolean)) setConfirmDiscard(true);
      else close();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); await finish();
  }
  function onTabListKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex(item => item.id === tab);
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? TABS[(index + 1) % TABS.length]
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? TABS[(index + TABS.length - 1) % TABS.length]
      : event.key === 'Home' ? TABS[0]
      : event.key === 'End' ? TABS[TABS.length - 1]
      : null;
    if (!next) return;
    event.preventDefault();
    void selectTab(next.id).then(selected => { if (selected) requestAnimationFrame(() => document.getElementById(`settings-tab-${next.id}`)?.focus()); });
  }
  const tabs = <div className="settings-tabs" role="tablist" aria-label="设置分组" data-tab={tab} onKeyDown={onTabListKey}>
    {TABS.map(item => <button key={item.id} type="button" role="tab" id={`settings-tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`settings-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => selectTab(item.id)}>{item.label}</button>)}
  </div>;
  const paneClass = `settings-pane${paneDir ? ` is-${paneDir}` : ''}`;
  return <><Modal className="settings-modal" title="设置" close={() => void finish()} subhead={tabs}>
    <form noValidate onSubmit={submit} className="form-body">
      <div hidden={tab !== 'general'} className={paneClass} role="tabpanel" id="settings-panel-general" aria-labelledby="settings-tab-general">
        <section className="sheet-card">
          <h3>桌面</h3>
          <div className="window-width-setting">
            <div className="label-with-help"><span>窗口宽度</span><HelpTip label="窗口宽度说明">标准 440 px；窄版 340 px。展开与收起保持同一宽度。</HelpTip></div>
            <Segmented aria-label="窗口宽度" value={settings.mainWindowWidth} onChange={value => void api.windowWidth(value as MainWindowWidth, !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)).then(changed).catch(cause => setError(errorText(cause)))} options={[{ value: 'standard', label: '标准' }, { value: 'narrow', label: '窄版' }]} />
          </div>
          <label className="check-label"><input type="checkbox" checked={draft.autoStart} onChange={e => updateSettings({ ...settingsRef.current, autoStart: e.target.checked })} />登录 Windows 后自动启动</label>
          <p className="field-help">隐藏主界面后，AI 对话和提醒继续保留。Ctrl + Shift + Space 显示 / 隐藏主界面。可从托盘菜单移回主屏幕。</p>
        </section>
        {DOCK_FEATURE_ENABLED ? <section className="sheet-card">
          <h3 className="label-with-help">悬浮入口 <HelpTip label="悬浮入口说明">悬浮入口与主界面独立显示。鼠标悬停或键盘聚焦后，可打开待办、AI 对话或设置图标置顶。拖动可调整位置；关闭后可从这里或托盘菜单重新开启。</HelpTip></h3>
          <label className="check-label"><input type="checkbox" checked={settings.dockEnabled} disabled={pending > 0} onChange={e => void api.dockEnabled(e.target.checked).then(changed).catch(cause => setError(errorText(cause)))} />显示悬浮入口</label>
          <div className="actions dock-icon-row" role="group" aria-label="悬浮图标外观">
            {DOCK_ICONS.map(icon => <button key={icon.id} type="button" className={`dock-icon-choice${settings.dockIconSource !== 'custom' && settings.dockIconPreset === icon.id ? ' is-selected' : ''}`} aria-pressed={settings.dockIconSource !== 'custom' && settings.dockIconPreset === icon.id} aria-label={`使用${icon.name}图标`} onClick={() => void api.dockIcon('useDefault', icon.id).then(changed).catch(cause => setError(errorText(cause)))}><DockIcon preset={icon.id} /><span>{icon.name}</span></button>)}
            {settings.dockIcon ? <button type="button" className={`dock-icon-choice${settings.dockIconSource === 'custom' ? ' is-selected' : ''}`} aria-pressed={settings.dockIconSource === 'custom'} aria-label="使用已上传的图标" onClick={() => void api.dockIcon('useCustom').then(changed).catch(cause => setError(errorText(cause)))}><DockIcon preset={settings.dockIconPreset} custom={settings.dockIcon} /><span>自定义</span></button> : null}
          </div>
          <button type="button" onClick={() => void api.dockIcon('choose').then(changed).catch(cause => setError(errorText(cause)))}>上传图标</button>
        </section> : null}
        <section className="sheet-card">
          <h3>版本与更新</h3>
          {updater ? <div className="actions">
            <span aria-live="polite" className="field-help">{updaterText(updater)}</span>
            {updater.active && updater.state !== 'ready' ? <button type="button" disabled={updater.state === 'checking' || updater.state === 'downloading'} onClick={() => void api.updaterCheck()}>检查更新</button> : null}
            {updater.state === 'ready' && updater.readyVersion ? <button type="button" className="primary" onClick={() => void api.updaterInstall()}>重启并安装 v{updater.readyVersion}</button> : null}
          </div> : null}
          {updater?.releaseNotes ? <div className="release-notes">{updater.releaseNotes}</div> : null}
        </section>
        <section className="sheet-card">
          <h3>本地数据</h3>
          <div className="actions"><button type="button" onClick={async () => { try { const result = await api.exportData(); if (result) setNotice('备份已导出，不包含模型密钥。'); } catch (e) { setError(errorText(e)); } }}>导出备份</button><button type="button" onClick={async () => { try { await api.openData(); } catch (e) { setError(errorText(e)); } }}>打开数据目录</button></div>
        </section>
      </div>

      <div hidden={tab !== 'ai'} className={paneClass} role="tabpanel" id="settings-panel-ai" aria-labelledby="settings-tab-ai">
        <section className="sheet-card">
          <div className="toggle-row">
            <button type="button" className="toggle" role="switch" aria-checked={draft.aiEnabled} aria-label="启用 AI" onClick={() => updateSettings({ ...settingsRef.current, aiEnabled: !settingsRef.current.aiEnabled })} />
            <span>启用 AI</span>
            <HelpTip label="启用 AI 说明">发送时会把本次输入、当前对话最近6轮、已有标签和最近最多120条事项的名称、时间及备注发送到选用的模型服务。对话历史保存在本机，退出后仍保留。可在 AI 助手中管理历史；本地事项和提醒不依赖 AI。</HelpTip>
          </div>
        </section>
        {!settings.providers.length && !creating ? <p className="field-help">还没有供应商。</p> : null}
        {settings.providers.map(provider => <ProviderCard key={provider.id} provider={provider} models={settings.models.filter(model => model.providerId === provider.id)} activeModelId={settings.activeModelId} api={api} changed={changed} fail={setError} registerFlush={registerFlush} onDirty={dirty => setDrafts(current => ({ ...current, [provider.id]: dirty }))} onPending={dirty => setUncommitted(current => ({ ...current, [provider.id]: dirty }))} />)}
        {creating ? <ProviderCard provider={null} models={[]} activeModelId={settings.activeModelId} api={api} changed={changed} fail={setError} onDirty={dirty => setDrafts(current => ({ ...current, new: dirty }))} onPending={() => undefined} canCancel onClose={() => { setCreating(false); setDrafts(current => ({ ...current, new: false })); }} registerFlush={registerFlush} /> : null}
        {settings.providers.length < 8 && !creating ? <button type="button" className="provider-add-button" onClick={() => setCreating(true)}><Plus size={14} weight="bold" /> 添加供应商</button> : null}
      </div>

      {notice ? <p role="status" className="field-help">{notice}</p> : null}{error ? <p role="alert" className="error">{error}</p> : null}
      <div className="actions sticky-actions"><span className="settings-save-state field-help" role="status">{pending || busy ? '保存中…' : error ? '请检查上方提示' : Object.values(uncommitted).some(Boolean) ? '离开输入框后自动保存' : hasSaved ? '已保存' : '已有设置自动保存'}</span><button className="primary" type="submit" disabled={busy || pending > 0}>完成</button></div>
    </form>
  </Modal>{confirmDiscard ? <Modal className="confirm" title="放弃新建草稿？" close={() => setConfirmDiscard(false)}><p>新供应商或模型尚未添加。已有设置的修改已经保存。</p><div className="actions"><button type="button" onClick={() => setConfirmDiscard(false)}>继续填写</button><button type="button" className="danger" onClick={close}>放弃草稿并关闭</button></div></Modal> : null}</>;
}
