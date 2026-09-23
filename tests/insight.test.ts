// #21 AI 建议：解析/回退/占位替换/哈希 单测（网络分支由 fake SSE 在集成捕获中回归）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { insightTarget, newTask, renderInsightContext, type Task } from '../shared/contracts';
import { insightTasksHash, parseInsightReply } from '../electron/insight';

const mk = (title: string): Task => ({ ...newTask(title), id: title, createdAt: '2026-09-23T00:00:00.000Z', updatedAt: '2026-09-23T00:00:00.000Z', completedAt: null, notifiedFor: null, deletedAt: null });

test('parseInsightReply accepts plain and fenced JSON, rejects unknown taskId and malformed input', () => {
  const allowed = new Set([mk('写周报').id]);
  const ok = parseInsightReply('{"taskId":"写周报","action":"next-step","context":"先拆 {min} 分钟","prompt":"帮我拆解写周报的下一步"}', allowed);
  assert.equal(ok?.taskId, '写周报');
  assert.equal(ok?.action, 'next-step');
  const fenced = parseInsightReply('好的，建议如下：\n```json\n{"taskId":"写周报","action":"focus","context":"专注推进","prompt":"帮我推进写周报"}\n```', allowed);
  assert.equal(fenced?.action, 'focus');
  assert.equal(parseInsightReply('{"taskId":"不存在的事项","action":"focus","context":"专注","prompt":"x"}', allowed), null, '未知 taskId 必须回退');
  assert.equal(parseInsightReply('{"taskId":"写周报","action":"hijack","context":"专注","prompt":"x"}', allowed), null, '非法 action 必须回退');
  assert.equal(parseInsightReply('{"taskId":"写周报","action":"focus","context":"这个短语远远超过了十六个字符的长度限制啦","prompt":"x"}', allowed), null, '超长 context 必须回退');
  assert.equal(parseInsightReply('完全不是 JSON', allowed), null);
});

test('renderInsightContext substitutes {min} and tolerates unknown minutes', () => {
  assert.equal(renderInsightContext('距开始约 {min} 分钟', 12), '距开始约 12 分钟');
  assert.equal(renderInsightContext('距开始约 {min} 分钟', -3), '距开始约 0 分钟');
  assert.equal(renderInsightContext('距开始约 {min} 分钟', null), '距开始约  分钟');
  assert.equal(renderInsightContext('专注推进', 5), '专注推进');
});

test('insightTasksHash is order-insensitive but change-sensitive', () => {
  const a = mk('任务A');
  const b = { ...mk('任务B'), dueAt: '2026-09-23T18:00:00+08:00' };
  assert.equal(insightTasksHash([a, b]), insightTasksHash([b, a]), '排序不影响哈希');
  assert.notEqual(insightTasksHash([a, b]), insightTasksHash([a]), '事项增减必须改变哈希');
  const renamed = { ...b, title: '任务B2' };
  assert.notEqual(insightTasksHash([a, b]), insightTasksHash([a, renamed]), '标题变化必须改变哈希');
  void randomUUID;
});

test('local fallback still picks soonest meeting within 60 minutes', () => {
  const meeting = { ...mk('周会'), kind: 'meeting' as const, dueAt: '2026-09-23T10:30:00+08:00' };
  const suggestion = insightTarget([meeting], new Date('2026-09-23T10:00:00+08:00'));
  assert.equal(suggestion?.title, '周会');
  assert.match(suggestion?.context ?? '', /距开始约 30 分钟/);
});
