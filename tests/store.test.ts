import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../electron/store';
import { activeToday, newTask, taskInputSchema } from '../shared/contracts';

test('task date and title validation rejects invalid input', () => {
  assert.equal(taskInputSchema.safeParse(newTask('   ')).success, false);
  assert.equal(taskInputSchema.safeParse({ ...newTask('报告'), plannedDate: '2026-02-30' }).success, false);
  assert.equal(taskInputSchema.safeParse({ ...newTask('报告'), remindAt: 'tomorrow' }).success, false);
});
test('SQLite persists tasks and settings after reopening', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'todo-store-test-')), 'tasks.db');
  let store = new Store(file); const task = store.create(newTask('报告'));
  store.setSetting('position', { x: 120, y: 50 }); store.close(); store = new Store(file);
  assert.equal(store.get(task.id).title, '报告'); assert.deepEqual(store.setting('position', null), { x: 120, y: 50 }); store.close();
});
test('custom categories persist, enforce unique names, and detach tasks when deleted', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'todo-category-test-')), 'tasks.db');
  let store = new Store(file); const category = store.createCategory({ name: '工作', color: '#b55232' });
  const task = store.create({ ...newTask('分类事项'), categoryId: category.id });
  assert.throws(() => store.createCategory({ name: ' 工作 ', color: '#111111' }), /同名分类/);
  store.close(); store = new Store(file);
  assert.equal(store.categories()[0].name, '工作'); assert.equal(store.get(task.id).categoryId, category.id);
  const updated = store.updateCategory(category.id, { name: '项目', color: '#335577' }, category.updatedAt);
  store.removeCategory(updated.id, updated.updatedAt);
  assert.equal(store.categories().length, 0); assert.equal(store.get(task.id).categoryId, null); store.close();
});
test('old task records without category fields remain readable as uncategorized', () => {
  const store = new Store(':memory:'); const task = store.create(newTask('旧版本事项'));
  const legacy = { ...task } as Partial<typeof task>; delete legacy.categoryId;
  store.db.prepare('UPDATE tasks SET payload=? WHERE id=?').run(JSON.stringify(legacy), task.id);
  assert.equal(store.get(task.id).categoryId, null); store.close();
});
test('reminders survive restart and are deduplicated by scheduled occurrence', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'todo-reminder-test-')), 'tasks.db');
  let store = new Store(file);
  const task = store.create({ ...newTask('开会'), dueAt: '2026-09-14T15:00:00+08:00', remindAt: '2026-09-14T14:50:00+08:00' });
  assert.equal(store.due(new Date('2026-09-14T14:49:00+08:00')).length, 0);
  const due = store.due(new Date('2026-09-14T14:51:00+08:00')); assert.equal(due.length, 1); store.markNotified(due); store.close();
  store = new Store(file); assert.equal(store.due(new Date('2026-09-15T00:00:00+08:00')).length, 0);
  store.update(task.id, { remindAt: '2026-09-15T14:50:00+08:00' });
  assert.equal(store.due(new Date('2026-09-15T15:00:00+08:00')).length, 1); store.close();
});
test('completion/deletion suppress alarms; snooze preserves original deadline', () => {
  const store = new Store(':memory:'); const now = new Date('2026-09-14T15:00:00Z');
  const task = store.create({ ...newTask('报告'), dueAt: '2026-09-14T14:00:00Z', remindAt: '2026-09-14T13:00:00Z' });
  const snoozed = store.snooze(task.id, now); assert.equal(snoozed.dueAt, task.dueAt); assert.equal(snoozed.remindAt, '2026-09-14T15:10:00.000Z');
  assert.equal(store.due(now).length, 0);
  const done = store.update(task.id, { status: 'done' }); assert.equal(store.due(new Date('2026-09-15')).length, 0);
  const reopened = store.update(task.id, { status: 'todo' }, done.updatedAt); store.remove(task.id, reopened.updatedAt);
  assert.equal(store.all().length, 0); assert.equal(store.all(true).length, 1); assert.equal(store.due(new Date('2026-09-15')).length, 0);
  store.restore(task.id); assert.equal(store.all().length, 1); store.close();
});
test('stale edit is rejected instead of overwriting newer changes', () => {
  const store = new Store(':memory:'); const task = store.create(newTask('报告')); store.update(task.id, { title: '报告新版' }, task.updatedAt);
  assert.throws(() => store.update(task.id, { title: '旧请求' }, task.updatedAt), /已在其他操作中更新/);
  assert.equal(store.get(task.id).title, '报告新版'); store.close();
});
test('AI operation group rolls back when an update targets a deleted task', () => {
  const store = new Store(':memory:'); const task = store.create(newTask('旧事项')); store.remove(task.id, task.updatedAt);
  const deleted = store.get(task.id);
  assert.throws(() => store.applyPlan({ message: '操作', actions: [{ type: 'create', task: newTask('不应留下') }, { type: 'update', id: task.id, patch: { title: '修改' } }] }, new Map([[task.id, deleted.updatedAt]])), /已删除/);
  assert.equal(store.all().length, 0); store.close();
});
test('AI rejects stale and nonexistent task references', () => {
  const store = new Store(':memory:'); const task = store.create(newTask('报告')); store.update(task.id, { title: '新版' });
  assert.throws(() => store.applyPlan({ message: '', actions: [{ type: 'update', id: task.id, patch: { status: 'done' } }] }, new Map([[task.id, task.updatedAt]])), /已变化/);
  assert.throws(() => store.get(randomUUID()), /不存在/); store.close();
});
test('today includes carried-over work without duplicating task IDs or changing deadlines', () => {
  const store = new Store(':memory:'); const old = store.create({ ...newTask('跨天事项'), plannedDate: '2026-09-10' });
  store.create({ ...newTask('未来事项'), plannedDate: '2026-09-20' });
  assert.deepEqual(activeToday(store.all(), '2026-09-14').map(t => t.id), [old.id]);
  assert.equal(store.get(old.id).plannedDate, '2026-09-10'); store.close();
});
