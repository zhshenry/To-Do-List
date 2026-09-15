import { useRef, useState, type FormEvent } from 'react';
import { CaretDown, Eye, EyeSlash } from '@phosphor-icons/react';
import type { Category, DesktopAPI, Settings, State } from '../shared/contracts';
import { Modal, IconButton, errorText } from './ui';

function CategoryRow({ category, api, changed, fail }: { category: Category; api: DesktopAPI; changed(state: State): void; fail(message: string): void }) {
  const [editing, setEditing] = useState(false); const [confirming, setConfirming] = useState(false); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(category.name); const [color, setColor] = useState(category.color);
  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true); fail('');
    try { changed(await api.updateCategory(category.id, { name, color }, category.updatedAt)); setEditing(false); }
    catch (e) { fail(errorText(e)); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); fail('');
    try { changed(await api.removeCategory(category.id, category.updatedAt)); }
    catch (e) { fail(errorText(e)); setBusy(false); }
  }
  return <li className={`category-row${editing ? ' editing' : confirming ? ' confirming' : ''}`}>
    {editing ? <>
      <input autoFocus aria-label={`分类名称 ${category.name}`} value={name} maxLength={30} onChange={e => setName(e.target.value)} />
      <input aria-label={`分类颜色 ${category.name}`} className="category-color-input" type="color" value={color} onChange={e => setColor(e.target.value)} />
      <button type="button" aria-label={`保存分类 ${category.name}`} disabled={!name.trim() || busy} onClick={() => void save()}>{busy ? '保存中…' : '保存'}</button>
      <button type="button" aria-label={`取消编辑分类 ${category.name}`} disabled={busy} onClick={() => { setEditing(false); setName(category.name); setColor(category.color); }}>取消</button>
    </> : confirming ? <>
      <span className="category-dot" style={{ backgroundColor: category.color }} /><span className="category-name">删除“{category.name}”？事项会变为未分类。</span>
      <button type="button" aria-label={`保留分类 ${category.name}`} disabled={busy} onClick={() => setConfirming(false)}>保留</button><button type="button" className="danger" aria-label={`确认删除分类 ${category.name}`} disabled={busy} onClick={() => void remove()}>删除</button>
    </> : <>
      <span className="category-dot" style={{ backgroundColor: category.color }} /><span className="category-name">{category.name}</span>
      <button type="button" aria-label={`编辑分类 ${category.name}`} onClick={() => setEditing(true)}>编辑</button><button type="button" className="text-danger" aria-label={`删除分类 ${category.name}`} onClick={() => setConfirming(true)}>删除</button>
    </>}
  </li>;
}

export function SettingsPanel({ settings, categories, api, saved, changed, close }: { settings: Settings; categories: Category[]; api: DesktopAPI; saved(state: State): void; changed(state: State): void; close(): void }) {
  const [draft, setDraft] = useState({ endpoint: settings.endpoint, model: settings.model, apiKey: '', clearKey: false, aiEnabled: settings.aiEnabled, autoStart: settings.autoStart });
  const initial = useRef(JSON.stringify(draft));
  const [visible, setVisible] = useState(false); const [aiOpen, setAiOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [categoryName, setCategoryName] = useState(''); const [categoryColor, setCategoryColor] = useState('#b55232'); const [categoryBusy, setCategoryBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { saved(await api.settings(draft)); close(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  async function addCategory() {
    if (!categoryName.trim() || categoryBusy) return;
    setCategoryBusy(true); setError('');
    try { changed(await api.createCategory({ name: categoryName, color: categoryColor })); setCategoryName(''); setNotice('分类已创建。'); }
    catch (e) { setError(errorText(e)); } finally { setCategoryBusy(false); }
  }
  return <Modal title="设置" close={close} dirty={JSON.stringify(draft) !== initial.current && !busy}>
    <form noValidate onSubmit={submit} className="form-body">
      <h3>桌面与提醒</h3>
      <label className="check-label"><input type="checkbox" checked={draft.autoStart} onChange={e => setDraft({ ...draft, autoStart: e.target.checked })} />登录 Windows 后自动启动</label>
      <p className="field-help">关闭面板会留在托盘。Ctrl + Shift + Space 显示 / 隐藏。可从托盘菜单移回主屏幕。</p>
      <button type="button" onClick={async () => { try { await api.testNotification(); setNotice('已请求测试通知；若未看到，请检查 Windows 通知权限和勿扰模式。'); } catch (e) { setError(errorText(e)); } }}>发送测试提醒</button>

      <h3>分类管理</h3>
      <div className="category-create"><input aria-label="分类名称" value={categoryName} maxLength={30} onChange={e => setCategoryName(e.target.value)} placeholder="例如：工作" /><input aria-label="分类颜色" className="category-color-input" type="color" value={categoryColor} onChange={e => setCategoryColor(e.target.value)} /><button type="button" disabled={!categoryName.trim() || categoryBusy} onClick={() => void addCategory()}>{categoryBusy ? '创建中…' : '新建'}</button></div>
      <div className="category-directory">
        <div className="category-directory-heading"><b>当前分类</b><span aria-live="polite">{categories.length} 个</span></div>
        {categories.length ? <ul className="category-list" aria-label="当前分类">{categories.map(category => <CategoryRow key={category.id} category={category} api={api} changed={changed} fail={setError} />)}</ul> : <div className="category-empty"><b>当前还没有分类</b><span>在上方输入名称并新建；创建后可用于事项和筛选。</span></div>}
      </div>

      <section className="settings-disclosure">
        <button type="button" className="disclosure-button" aria-expanded={aiOpen} aria-controls="ai-settings" onClick={() => setAiOpen(!aiOpen)}><span><b>AI 助手</b><small>{draft.aiEnabled ? '已启用' : '未启用'} · 普通记录与提醒不依赖 AI</small></span><CaretDown size={20} className={aiOpen ? 'open' : ''} /></button>
        {aiOpen ? <div id="ai-settings" className="disclosure-content">
          <label className="check-label"><input type="checkbox" checked={draft.aiEnabled} onChange={e => setDraft({ ...draft, aiEnabled: e.target.checked })} />启用 AI</label>
          <p className="field-help">每次点击 AI 发送，会把本次输入、当前对话最近6轮、已有分类和最近最多120条任务的名称、时间及备注发送到你配置的服务。对话只在本次运行中保留，点击“新对话”或完全退出应用后清空，不写入本地数据库。普通记录和本地提醒不依赖 AI。</p>
          <label htmlFor="ai-endpoint">服务地址</label><input id="ai-endpoint" value={draft.endpoint} onChange={e => setDraft({ ...draft, endpoint: e.target.value })} placeholder="https://你的服务域名/v1" autoComplete="off" />
          <p className="field-help">需兼容 Chat Completions 和 JSON 输出。填写到 /v1；本机服务允许 http://127.0.0.1。</p>
          <label htmlFor="ai-model">模型名称</label><input id="ai-model" value={draft.model} onChange={e => setDraft({ ...draft, model: e.target.value })} placeholder="填写服务提供的模型名称" autoComplete="off" />
          <label htmlFor="ai-key">API Key {settings.hasKey ? <span className="muted">已保存，留空保留</span> : null}</label>
          <div className="secret-field"><input id="ai-key" type={visible ? 'text' : 'password'} value={draft.apiKey} onChange={e => setDraft({ ...draft, apiKey: e.target.value, clearKey: false })} autoComplete="new-password" placeholder="使用 Windows 加密后保存" /><IconButton label={visible ? '隐藏密钥' : '显示密钥'} onClick={() => setVisible(!visible)}>{visible ? <EyeSlash size={20} /> : <Eye size={20} />}</IconButton></div>
          {settings.hasKey ? <label className="check-label"><input type="checkbox" checked={draft.clearKey} onChange={e => setDraft({ ...draft, clearKey: e.target.checked, apiKey: '' })} />清除已保存的密钥</label> : null}
          <p className="field-help">模型费用由服务提供方收取。AI 可以继续追问和解释；涉及事项变更时仍会先生成建议，由你确认应用。AI 只能使用已有分类。</p>
        </div> : null}
      </section>

      <h3>本地数据</h3><div className="actions"><button type="button" onClick={async () => { try { const result = await api.exportData(); if (result) setNotice('备份已导出，不包含模型密钥。'); } catch (e) { setError(errorText(e)); } }}>导出备份</button><button type="button" onClick={async () => { try { await api.openData(); } catch (e) { setError(errorText(e)); } }}>打开数据目录</button></div>
      {notice ? <p role="status" className="field-help">{notice}</p> : null}{error ? <p role="alert" className="error">{error}</p> : null}
      <div className="actions sticky-actions"><button className="primary" type="submit" disabled={busy}>{busy ? '保存中…' : '保存设置'}</button></div>
    </form>
  </Modal>;
}
