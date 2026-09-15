import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

// Read-only task smoke check: no sample tasks, keys, or auto-start registration.
// Pass --notification to explicitly send one real Windows test notification.
await mkdir('test-results', { recursive: true });
const smokeData = await mkdtemp(path.resolve('test-results/packaged-'));
const env = { ...process.env, TODO_PACKAGED_SMOKE: '1', TODO_PACKAGED_SMOKE_DATA: smokeData }; delete env.ELECTRON_RUN_AS_NODE;
const packageInfo = JSON.parse(await readFile('package.json', 'utf8'));
const executablePath = process.env.TODO_PACKAGED_EXECUTABLE || path.resolve(`release/portable/To Do List ${packageInfo.version} Portable/To Do List.exe`);
const app = await electron.launch({ executablePath, args: [], env, timeout: 30000 });
try {
  const page = await app.firstWindow(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: '设置', exact: true }).waitFor();
  const snapshot = await page.evaluate(() => window.desktop.state());
  const runtime = await app.evaluate(({ app, BrowserWindow, safeStorage }) => ({
    packaged: app.isPackaged, dataDirectory: app.getPath('userData'), electron: process.versions.electron,
    node: process.versions.node, sandbox: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox,
    encryption: safeStorage.isEncryptionAvailable() && safeStorage.decryptString(safeStorage.encryptString('roundtrip-test')) === 'roundtrip-test',
  }));
  assert.equal(runtime.packaged, true); assert.equal(runtime.sandbox, true); assert.equal(runtime.encryption, true);
  assert.equal('apiKey' in snapshot.settings, false);
  await page.screenshot({ path: 'test-results/packaged-profile.png' });
  const assistantWindow = app.waitForEvent('window');
  await page.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  const assistantPage = await assistantWindow;
  assistantPage.on('pageerror', e => errors.push(e.message));
  await assistantPage.locator('.assistant-widget').waitFor();
  await assistantPage.getByText('先启用 AI 助手', { exact: true }).waitFor();
  assert.equal(await page.locator('.agenda').isVisible(), true);
  await assistantPage.screenshot({ path: 'test-results/packaged-ai-floating.png' });
  const notification = process.argv.includes('--notification') ? await app.evaluate(async ({ Notification }) => {
    if (!Notification.isSupported()) return 'unsupported';
    return await new Promise(resolve => {
      const toast = new Notification({ title: 'To Do List 测试提醒', body: 'Windows 实机测试：这是一条测试通知，不会创建待办。' });
      const timeout = setTimeout(() => resolve('no-show-event-within-8s'), 8000);
      toast.once('show', () => { clearTimeout(timeout); resolve('show-event-received'); });
      toast.once('failed', () => { clearTimeout(timeout); resolve('failed-event-received'); });
      toast.show();
    });
  }) : 'not-requested';
  assert.deepEqual(errors, []);
  const result = { runtime, tasksRead: snapshot.tasks.length, notification, errors, isolatedDataDirectory: smokeData };
  await writeFile('test-results/packaged-smoke.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await app.close(); }
