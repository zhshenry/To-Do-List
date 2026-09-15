import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { aiPlanSchema, categoryInputSchema, localDay, taskInputSchema, taskPatchSchema, type AIPlan, type Category, type CategoryInput, type Task, type TaskInput } from '../shared/contracts';

export class Store {
  readonly db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version=2;`);
  }
  all(includeDeleted = false): Task[] {
    return (this.db.prepare('SELECT payload FROM tasks').all() as { payload: string }[])
      .map(row => this.normalizeTask(JSON.parse(row.payload) as Task)).filter(t => includeDeleted || !t.deletedAt);
  }
  get(id: string): Task {
    const row = this.db.prepare('SELECT payload FROM tasks WHERE id=?').get(id) as { payload: string } | undefined;
    if (!row) throw new Error('事项不存在，请刷新后重试');
    return this.normalizeTask(JSON.parse(row.payload));
  }
  normalizeTask(task: Task): Task { return { ...task, categoryId: task.categoryId ?? null }; }
  put(task: Task): Task {
    this.db.prepare('INSERT OR REPLACE INTO tasks(id,payload) VALUES (?,?)').run(task.id, JSON.stringify(task));
    return task;
  }
  create(input: unknown): Task {
    const data = taskInputSchema.parse(input);
    this.assertCategory(data.categoryId);
    const now = new Date().toISOString();
    return this.put({ ...data, id: randomUUID(), createdAt: now, updatedAt: now,
      completedAt: data.status === 'done' ? now : null, notifiedFor: null, deletedAt: null });
  }
  update(id: string, patch: unknown, revision?: string): Task {
    const old = this.get(id);
    if (old.deletedAt) throw new Error('这条事项已删除');
    if (revision && old.updatedAt !== revision) throw new Error('事项已在其他操作中更新，请重新打开后修改');
    const next = taskInputSchema.parse({ ...this.fields(old), ...taskPatchSchema.parse(patch) });
    this.assertCategory(next.categoryId);
    const now = new Date(Math.max(Date.now(), Date.parse(old.updatedAt) + 1)).toISOString();
    return this.put({ ...old, ...next, updatedAt: now,
      completedAt: next.status === 'done' ? old.completedAt ?? now : null,
      notifiedFor: next.remindAt !== old.remindAt || (old.status === 'done' && next.status !== 'done') ? null : old.notifiedFor });
  }
  fields(task: Task): TaskInput {
    const { title, kind, status, priority, plannedDate, dueAt, remindAt, categoryId, note } = task;
    return { title, kind, status, priority, plannedDate, dueAt, remindAt, categoryId, note };
  }
  categories(): Category[] {
    return (this.db.prepare('SELECT payload FROM categories').all() as { payload: string }[])
      .map(row => JSON.parse(row.payload) as Category)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  getCategory(id: string): Category {
    const row = this.db.prepare('SELECT payload FROM categories WHERE id=?').get(id) as { payload: string } | undefined;
    if (!row) throw new Error('分类不存在，请刷新后重试');
    return JSON.parse(row.payload);
  }
  putCategory(category: Category): Category {
    this.db.prepare('INSERT OR REPLACE INTO categories(id,payload) VALUES (?,?)').run(category.id, JSON.stringify(category));
    return category;
  }
  assertCategory(id: string | null): void { if (id) this.getCategory(id); }
  assertUniqueCategory(name: string, exceptId?: string): void {
    const normalized = name.trim().toLocaleLowerCase('zh-CN');
    if (this.categories().some(category => category.id !== exceptId && category.name.toLocaleLowerCase('zh-CN') === normalized)) {
      throw new Error('已有同名分类');
    }
  }
  createCategory(input: unknown): Category {
    const data = categoryInputSchema.parse(input);
    this.assertUniqueCategory(data.name);
    const now = new Date().toISOString();
    return this.putCategory({ ...data, id: randomUUID(), createdAt: now, updatedAt: now });
  }
  updateCategory(id: string, input: unknown, revision: string): Category {
    const old = this.getCategory(id);
    if (old.updatedAt !== revision) throw new Error('分类已在其他操作中更新，请刷新后重试');
    const data = categoryInputSchema.parse(input);
    this.assertUniqueCategory(data.name, id);
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(old.updatedAt) + 1)).toISOString();
    return this.putCategory({ ...old, ...data, updatedAt });
  }
  removeCategory(id: string, revision: string): void {
    const category = this.getCategory(id);
    if (category.updatedAt !== revision) throw new Error('分类已在其他操作中更新，请刷新后重试');
    this.transaction(() => {
      for (const task of this.all(true).filter(item => item.categoryId === id)) {
        const updatedAt = new Date(Math.max(Date.now(), Date.parse(task.updatedAt) + 1)).toISOString();
        this.put({ ...task, categoryId: null, updatedAt });
      }
      this.db.prepare('DELETE FROM categories WHERE id=?').run(id);
    });
  }
  remove(id: string, revision: string): void {
    const task = this.get(id);
    if (task.updatedAt !== revision) throw new Error('事项已更新，请重新打开后删除');
    const now = new Date(Math.max(Date.now(), Date.parse(task.updatedAt) + 1)).toISOString();
    this.put({ ...task, deletedAt: now, updatedAt: now });
  }
  restore(id: string): void {
    const task = this.get(id);
    this.put({ ...task, deletedAt: null, updatedAt: new Date(Math.max(Date.now(), Date.parse(task.updatedAt) + 1)).toISOString() });
  }
  snooze(id: string, now = new Date()): Task {
    const old = this.get(id);
    if (old.deletedAt || old.status === 'done') throw new Error('已完成或已删除的事项不能稍后提醒');
    // A snooze deliberately may be later than the due time; it must not change the deadline.
    return this.put({ ...old, remindAt: new Date(now.getTime() + 600000).toISOString(), notifiedFor: null, updatedAt: new Date(Math.max(Date.now(), Date.parse(old.updatedAt) + 1)).toISOString() });
  }
  due(now = new Date()): Task[] {
    return this.all().filter(t => t.status !== 'done' && t.remindAt && Date.parse(t.remindAt) <= now.getTime() && t.notifiedFor !== t.remindAt);
  }
  markNotified(tasks: Task[]): void {
    this.transaction(() => { for (const task of tasks) {
      const current = this.get(task.id);
      if (current.remindAt === task.remindAt) this.put({ ...current, notifiedFor: task.remindAt });
    } });
  }
  setting<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : fallback;
  }
  setSetting(key: string, value: unknown): void {
    this.db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)').run(key, JSON.stringify(value));
  }
  transaction<T>(run: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = run(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  applyPlan(input: AIPlan, revisions: Map<string, string>): void {
    const plan = aiPlanSchema.parse(input);
    this.transaction(() => {
      for (const action of plan.actions) {
        if (action.type === 'update' && this.get(action.id).updatedAt !== revisions.get(action.id)) throw new Error('AI 建议中的事项已变化，请重新生成建议');
      }
      for (const action of plan.actions) {
        if (action.type === 'create') this.create(action.task);
        else this.update(action.id, action.patch);
      }
    });
  }
  review(today = localDay()): string {
    const tasks = this.all();
    const completed = tasks.filter(t => t.completedAt && localDay(new Date(t.completedAt)) === today);
    const pending = tasks.filter(t => t.status !== 'done' && t.plannedDate <= today);
    return `# ${today} 每日复盘\n\n## 已完成 · ${completed.length} 项\n${completed.map(t => `- ${t.title}${t.note ? `\n  ${t.note}` : ''}`).join('\n') || '今天还没有完成的事项。'}\n\n## 待继续 · ${pending.length} 项\n${pending.map(t => `- ${t.title}${t.dueAt ? `（${new Date(t.dueAt).toLocaleString('zh-CN')}）` : ''}`).join('\n') || '今天的事项都已处理。'}`;
  }
  close(): void { this.db.close(); }
}
