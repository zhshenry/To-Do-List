import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, copyFile, readFile, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const output = path.resolve('test-results/dock-current');
await mkdir(output, { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function poll(run, label) {
  for (let i = 0; i < 100; i++) { if (await run()) return; await wait(80); }
  throw new Error(`Timed out: ${label}`);
}
const errors = [], checks = [];
let app, main, dock;
async function launch(profile, hidden = false) {
  const env = { ...process.env, TODO_TEST: '1', TODO_TEST_DATA: profile };
  delete env.ELECTRON_RUN_AS_NODE; delete env.TODO_DEV_URL;
  app = await electron.launch({ args: ['.', ...(hidden ? ['--hidden'] : [])], env });
  await poll(async () => {
    main = app.windows().find(w => /index.html/.test(w.url()) && !w.url().includes('window='));
    return !!main && await main.locator('.today-board').count() > 0;
  }, 'main renderer');
  main.on('pageerror', e => errors.push(e.message));
  await main.emulateMedia({ reducedMotion: 'reduce' });
}
async function getDock() {
  await poll(async () => {
    dock = app.windows().find(w => w.url().includes('window=dock'));
    return !!dock && await dock.locator('.dock').count() > 0;
  }, 'dock renderer');
  dock.on('pageerror', e => errors.push(e.message));
  await dock.emulateMedia({ reducedMotion: 'reduce' });
}
async function windows() {
  return app.evaluate(({ BrowserWindow }) => Object.fromEntries(BrowserWindow.getAllWindows().map(w => {
    const url = w.webContents.getURL();
    const key = !url ? 'taskbar' : url.includes('window=dock') ? 'dock' : url.includes('window=assistant') ? 'assistant' : 'main';
    return [key, { visible: w.isVisible(), pinned: w.isAlwaysOnTop(), bounds: w.getBounds() }];
  })));
}
async function seed(profile, values) {
  const db = new DatabaseSync(path.join(profile, 'tasks.db'));
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  for (const [key, value] of Object.entries(values)) db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(key, JSON.stringify(value));
  db.close();
}
try {
  const profile = await mkdtemp(path.join(output, 'fresh-'));
  await launch(profile); await getDock();
  await poll(async () => { const w = await windows(); return w.main.visible && w.dock.visible; }, 'first launch coexistence');
  assert.equal(await main.getByRole('button', { name: '收起为图标' }).count(), 0);
  await main.getByRole('button', { name: '设置', exact: true }).click();
  const group = main.getByRole('group', { name: '悬浮图标外观' });
  for (const [id, name] of [['orbit','圆环'], ['note','小笺'], ['sprout','嫩芽'], ['cat','团猫']]) {
    await group.getByRole('button', { name: `使用${name}图标` }).click();
    await poll(async () => (await main.evaluate(() => window.desktop.state())).settings.dockIconPreset === id, `persist ${id}`);
    await poll(async () => dock.locator('.dock-logo img').evaluate((img, id) => img.complete && img.naturalWidth === 72 && img.src.endsWith(`${id}.svg`), id), `render ${id}`);
    await dock.locator('.dock-logo').screenshot({ path: path.join(output, `icon-${id}.png`), omitBackground: true });
  }
  await main.screenshot({ path: path.join(output, 'settings.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => /index.html/.test(w.webContents.getURL()) && !w.webContents.getURL().includes('window=')).setBounds({ width: 340, height: 540 }));
  await main.screenshot({ path: path.join(output, 'settings-narrow.png') });
  assert.equal(await group.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'presets wrap in narrow settings');
  await main.getByRole('checkbox', { name: '显示悬浮入口' }).click();
  await poll(async () => !(await windows()).dock.visible, 'disable dock from settings');
  assert.equal((await windows()).main.visible, true);
  await main.getByRole('checkbox', { name: '显示悬浮入口' }).click();
  await poll(async () => (await windows()).dock.visible, 'enable dock');
  await main.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭', exact: true }).click();
  checks.push('coexistence, four presets, narrow settings and independent enable switch');

  const beforePin = await windows();
  await main.evaluate(() => window.desktop.window('dockPin'));
  let w = await windows();
  assert.equal(w.main.pinned, beforePin.main.pinned); assert.notEqual(w.dock.pinned, beforePin.dock.pinned);
  await main.evaluate(() => window.desktop.assistant({ action: 'show', source: 'dock', animate: false }));
  await poll(async () => (await windows()).assistant?.visible, 'assistant opens');
  const assistant = app.windows().find(p => p.url().includes('window=assistant'));
  await assistant.locator('.assistant-shell').waitFor();
  const aiBefore = (await windows()).assistant;
  await main.evaluate(() => window.desktop.window('pin'));
  assert.equal((await windows()).assistant.pinned, aiBefore.pinned, 'main pin leaves assistant unchanged');
  const initial = await windows();
  await main.evaluate(() => window.desktop.window('hide'));
  w = await windows();
  assert.equal(w.main.visible, false); assert.equal(w.dock.visible, true); assert.equal(w.assistant.visible, true);
  assert.equal(w.taskbar.visible, false); assert.deepEqual(w.main.bounds, initial.main.bounds);
  await dock.locator('.dock').focus();
  await dock.getByRole('menuitem', { name: '打开待办' }).click();
  await poll(async () => (await windows()).main.visible, 'open main through dock');
  assert.equal((await windows()).dock.visible, true);
  const aiBounds = (await windows()).assistant.bounds;
  await main.evaluate(() => window.desktop.assistant({ action: 'show', source: 'main', animate: false }));
  assert.deepEqual((await windows()).assistant.bounds, aiBounds, 'repeated open does not relocate AI');
  await main.evaluate(() => window.desktop.dockEnabled(false));
  assert.equal((await windows()).assistant.visible, true, 'disabling anchor preserves AI');
  await main.evaluate(() => window.desktop.dockEnabled(true));
  checks.push('independent visibility, taskbar, pinning and AI conversation');

  await app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(w => /index.html/.test(w.webContents.getURL()) && !w.webContents.getURL().includes('window='));
    globalThis.mainBoundsCalls = [];
    const original = main.setBounds.bind(main);
    main.setBounds = (...args) => { globalThis.mainBoundsCalls.push(args[0]); return original(...args); };
  });
  const area = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await dock.evaluate(point => window.desktop.dockMove(point), { x: area.x + 100, y: area.y + 120 });
  await dock.evaluate(() => window.desktop.dockMove(null));
  await poll(async () => (await windows()).dock.bounds.x === area.x + 100, 'dock moves independently');
  const dockBounds = (await windows()).dock.bounds;
  await main.evaluate(() => window.desktop.window('hide'));
  await main.evaluate(() => window.desktop.window('show'));
  assert.deepEqual((await windows()).dock.bounds, dockBounds);
  assert.deepEqual(await app.evaluate(() => globalThis.mainBoundsCalls), [], 'dock operations never resize the main window');
  // Real pointer drag must preserve the drag/menu contract after decoupling compact mode.
  const box = await dock.locator('.dock-logo').boundingBox();
  await dock.mouse.move(box.x + 36, box.y + 36); await dock.mouse.down();
  await dock.mouse.move(box.x + 56, box.y + 46, { steps: 3 }); await dock.mouse.up();
  await poll(async () => (await windows()).dock.bounds.x !== dockBounds.x, 'pointer drag');
  await dock.locator('.dock').focus();
  await dock.getByRole('menuitem', { name: '打开待办' }).press('Enter');
  assert.equal((await windows()).main.visible, true);
  checks.push('independent position, pointer drag and keyboard menu');

  // Exercise negative-coordinate monitor selection without requiring a physical second monitor.
  await main.evaluate(() => window.desktop.assistant({ action: 'hide', animate: false }));
  await app.evaluate(({ screen }) => {
    globalThis.originalDisplayNearest = screen.getDisplayNearestPoint;
    globalThis.anchorQueries = [];
    screen.getDisplayNearestPoint = point => {
      globalThis.anchorQueries.push(point);
      if (point.x < 0) return { id: 99, workArea: { x: -1600, y: 0, width: 1600, height: 1000 } };
      return globalThis.originalDisplayNearest(point);
    };
  });
  await dock.evaluate(() => window.desktop.dockMove({ x: -1000, y: 200 }));
  await dock.evaluate(() => window.desktop.dockMove(null));
  await dock.evaluate(() => window.desktop.assistant({ action: 'show', source: 'dock', animate: false }));
  const anchorQueries = await app.evaluate(() => globalThis.anchorQueries);
  assert.ok(anchorQueries.some(p => p.x === -964 && p.y === 236), 'AI chooses display using dock anchor');
  const positioned = (await windows()).assistant.bounds;
  assert.ok(positioned.x >= -1600 && positioned.x + positioned.width <= 0, 'AI stays on the source monitor');
  await app.evaluate(({ BrowserWindow }) => {
    const ai = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('window=assistant'));
    ai.setPosition(-800, 100); ai.emit('moved');
  });
  const detached = (await windows()).assistant.bounds;
  await dock.evaluate(() => window.desktop.dockMove({ x: -1200, y: 250 }));
  await dock.evaluate(() => window.desktop.dockMove(null));
  assert.deepEqual((await windows()).assistant.bounds, detached, 'user-moved AI is not pulled back');
  await app.evaluate(({ screen }) => { screen.getDisplayNearestPoint = globalThis.originalDisplayNearest; screen.emit('display-removed', {}, { id: 99 }); });
  await poll(async () => (await windows()).dock.bounds.x >= area.x, 'removed display recovers dock');
  w = await windows();
  assert.ok(w.assistant.bounds.x >= area.x, 'removed display recovers AI');
  checks.push('simulated secondary monitor anchoring, detached AI and display removal');

  const savedDock = w.dock.bounds;
  await main.evaluate(() => window.desktop.window('hide'));
  await app.close(); app = null;
  await launch(profile); await getDock();
  await poll(async () => (await windows()).dock.visible, 'restart dock');
  w = await windows();
  assert.equal(w.main.visible, false); assert.equal(w.assistant, undefined);
  assert.deepEqual(w.dock.bounds, savedDock);
  assert.equal((await main.evaluate(() => window.desktop.state())).settings.dockIconPreset, 'cat');
  await main.evaluate(() => window.desktop.dockEnabled(false));
  await main.evaluate(() => window.desktop.window('show'));
  await app.close(); app = null;
  await launch(profile, true);
  await wait(400);
  w = await windows(); assert.equal(w.main.visible, false); assert.ok(!w.dock?.visible);
  await app.close(); app = null;
  await launch(profile);
  await poll(async () => (await windows()).main.visible, 'hidden launch preserves manual launch preference');
  await app.close(); app = null;
  checks.push('restart restores independent preferences; --hidden preserves main preference');

  const legacy = await mkdtemp(path.join(output, 'legacy-'));
  await seed(legacy, { compact: true, alwaysOnTop: false, dockPosition: { x: area.x + 90, y: area.y + 150 }, dockIconSource: 'custom' });
  await copyFile('assets/icon.png', path.join(legacy, 'dock-icon.png'));
  const uploaded = await readFile(path.join(legacy, 'dock-icon.png'));
  await launch(legacy); await getDock();
  await poll(async () => (await windows()).dock.visible, 'legacy dock');
  w = await windows(); assert.equal(w.main.visible, false); assert.equal(w.dock.pinned, false);
  const old = (await main.evaluate(() => window.desktop.state())).settings;
  assert.equal(old.dockIconSource, 'custom'); assert.equal(old.dockIconPreset, 'orbit');
  await dock.evaluate(() => window.desktop.dockIcon('useDefault', 'sprout'));
  await dock.evaluate(() => window.desktop.dockIcon('useCustom'));
  assert.equal((await main.evaluate(() => window.desktop.state())).settings.dockIconSource, 'custom');
  assert.deepEqual(await readFile(path.join(legacy, 'dock-icon.png')), uploaded);
  await main.evaluate(() => window.desktop.dockEnabled(false));
  await main.evaluate(() => window.desktop.window('show'));
  await app.close(); app = null;
  await launch(legacy);
  await poll(async () => (await windows()).main.visible, 'migrated preference overrides old compact');
  assert.ok(!(await windows()).dock?.visible);
  checks.push('legacy compact/custom icon/position migration runs once and preserves uploaded bytes');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ result: 'passed', checks, output }, null, 2));
  console.log(JSON.stringify({ result: 'passed', checks, output }, null, 2));
} finally { if (app) await app.close(); }
