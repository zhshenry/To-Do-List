import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../shared/contracts';
const api: DesktopAPI = {
  state: () => ipcRenderer.invoke('state'), create: task => ipcRenderer.invoke('create', task),
  update: (id, patch, revision) => ipcRenderer.invoke('update', id, patch, revision),
  remove: (id, revision) => ipcRenderer.invoke('remove', id, revision), restore: id => ipcRenderer.invoke('restore', id),
  snooze: id => ipcRenderer.invoke('snooze', id),
  createCategory: category => ipcRenderer.invoke('category:create', category),
  updateCategory: (id, category, revision) => ipcRenderer.invoke('category:update', id, category, revision),
  removeCategory: (id, revision) => ipcRenderer.invoke('category:remove', id, revision),
  window: action => ipcRenderer.invoke('window', action),
  assistant: input => ipcRenderer.invoke('assistant', input), assistantReady: () => ipcRenderer.invoke('assistant:ready'),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  settings: input => ipcRenderer.invoke('settings', input), ask: input => ipcRenderer.invoke('ask', input),
  apply: token => ipcRenderer.invoke('apply', token), cancelAI: () => ipcRenderer.invoke('cancelAI'),
  review: () => ipcRenderer.invoke('review'), exportData: () => ipcRenderer.invoke('exportData'),
  openData: () => ipcRenderer.invoke('openData'), testNotification: () => ipcRenderer.invoke('testNotification'),
  onChanged: callback => { const listener = () => callback(); ipcRenderer.on('changed', listener); return () => ipcRenderer.removeListener('changed', listener); },
  onAssistantVisibility: callback => { const listener = (_event: Electron.IpcRendererEvent, visible: boolean) => callback(visible); ipcRenderer.on('assistant:visibility', listener); return () => ipcRenderer.removeListener('assistant:visibility', listener); },
  onAssistantPrompt: callback => { const listener = (_event: Electron.IpcRendererEvent, prompt: string) => callback(prompt); ipcRenderer.on('assistant:prompt', listener); return () => ipcRenderer.removeListener('assistant:prompt', listener); },
  onOpenSettings: callback => { const listener = () => callback(); ipcRenderer.on('settings:open', listener); return () => ipcRenderer.removeListener('settings:open', listener); },
};
contextBridge.exposeInMainWorld('desktop', api);
