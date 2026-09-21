import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateText, dateTimeText, scheduleStamp, stampLabel } from '../shared/format';
import { newTask, type Category, type Task } from '../shared/contracts';
import { miniProposalView } from '../src/AIConversation';

test('schedule stamp shows date with time, and date only when time is empty', () => {
  const withTime = scheduleStamp({ plannedDate: '2026-09-20', dueAt: '2026-09-20T15:59:00+08:00' });
  const dateOnly = scheduleStamp({ plannedDate: '2026-09-20', dueAt: null });
  assert.equal(withTime, dateTimeText('2026-09-20T15:59:00+08:00'));
  assert.match(withTime, /20/);
  assert.match(withTime, /15:59/);
  assert.equal(dateOnly, dateText('2026-09-20'));
  assert.match(dateOnly, /20/);
  assert.doesNotMatch(dateOnly, /\d{1,2}:\d{2}/);
});

test('corner time label names completion for tasks and start for meetings', () => {
  assert.equal(stampLabel('task'), '完成时间');
  assert.equal(stampLabel('meeting'), '开始时间');
});

function sampleTask(title: string, extra: Partial<Task> = {}): Task {
  return { ...newTask(title), id: '11111111-1111-4111-8111-111111111111', createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z', completedAt: null, notifiedFor: null, deletedAt: null, ...extra };
}

test('compact proposal lists only changed fields as before to after', () => {
  const current = sampleTask('完成 DAMA BOOK 学习', { plannedDate: '2026-09-20', priority: 'medium' });
  const view = miniProposalView({
    type: 'update',
    id: current.id,
    patch: { plannedDate: '2026-09-30', dueAt: '2026-09-30T23:59:00+08:00', priority: 'high' },
  }, [current], []);
  assert.equal(view.verb, '修改待办');
  assert.deepEqual(view.rows.map(row => row.label), ['完成期限', '时间', '优先级']);
  assert.equal(view.rows.find(row => row.label === '优先级')?.from, '中');
  assert.equal(view.rows.find(row => row.label === '优先级')?.to, '高');
  assert.equal(view.rows.some(row => row.label === '标签'), false);
});

function sampleCategory(): Category {
  return { id: '22222222-2222-4222-8222-222222222222', name: '工作', color: '#c45c26', createdAt: '2026-09-20T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z' };
}

test('compact proposal verbs name the object', () => {
  const todo = sampleTask('完成 DAMA BOOK 学习');
  const meeting = sampleTask('周会', { kind: 'meeting' });
  const category = sampleCategory();
  assert.equal(miniProposalView({ type: 'create', task: newTask('读一章') }, [], []).verb, '新增待办');
  assert.equal(miniProposalView({ type: 'create', task: { ...newTask('周会'), kind: 'meeting', dueAt: '2026-09-20T15:00:00+08:00' } }, [], []).verb, '新增日程');
  assert.equal(miniProposalView({ type: 'update', id: todo.id, patch: { priority: 'high' } }, [todo], []).verb, '修改待办');
  assert.equal(miniProposalView({ type: 'update', id: meeting.id, patch: { title: '复盘会' } }, [meeting], []).verb, '修改日程');
  assert.equal(miniProposalView({ type: 'remove', id: todo.id }, [todo], []).verb, '删除待办');
  assert.equal(miniProposalView({ type: 'remove', id: meeting.id }, [meeting], []).verb, '删除日程');
  assert.equal(miniProposalView({ type: 'create_category', category: { id: category.id, name: '工作', color: '#c45c26' } }, [], []).verb, '新增标签');
  assert.equal(miniProposalView({ type: 'update_category', id: category.id, patch: { name: '学习' } }, [], [category]).verb, '修改标签');
  assert.equal(miniProposalView({ type: 'remove_category', id: category.id }, [], [category]).verb, '删除标签');
});
