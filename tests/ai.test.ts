import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { validateEndpoint, parsePlan, requestPlan } from '../electron/ai';
import { newTask } from '../shared/contracts';
test('endpoint permits HTTPS and local HTTP but rejects credential-bearing URLs', () => {
  assert.equal(validateEndpoint('https://example.com/v1/'), 'https://example.com/v1');
  assert.equal(validateEndpoint('http://127.0.0.1:11434/v1'), 'http://127.0.0.1:11434/v1');
  for (const url of ['http://example.com/v1', 'https://user:pass@example.com', 'https://example.com?key=secret', 'file:///x']) assert.throws(() => validateEndpoint(url));
});
test('AI accepts structured plans and rejects arbitrary commands', () => {
  assert.equal(parsePlan(JSON.stringify({ message: '请确认', actions: [{ type: 'create', task: newTask('报告') }] })).actions.length, 1);
  assert.throws(() => parsePlan('{"message":"ok","actions":[{"type":"execute","sql":"DROP TABLE tasks"}]}'), /格式不正确/);
  assert.throws(() => parsePlan('not json'), /格式不正确/);
});
test('real HTTP adapter uses schema prompt and only returns a proposal', async () => {
  let received: any;
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk; received = JSON.parse(raw);
    assert.equal(req.url, '/v1/chat/completions');
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ message: '请核对', actions: [{ type: 'create', task: newTask('报告') }] }) } }] }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const address = server.address() as { port: number };
    const history = [{ role: 'user' as const, content: '明天下午开会' }, { role: 'assistant' as const, content: '需要提前提醒吗？' }];
    const result = await requestPlan({ endpoint: `http://127.0.0.1:${address.port}/v1`, model: 'test', key: '' }, '提前10分钟', history, [], [{ id: '43f07b99-78e2-4eef-9ddc-759b40a88e54', name: '工作', color: '#b55232', createdAt: '2026-09-14T00:00:00.000Z', updatedAt: '2026-09-14T00:00:00.000Z' }], AbortSignal.timeout(3000));
    assert.equal(result.actions.length, 1); assert.match(received.messages[0].content, /已有分类/); assert.match(received.messages[0].content, /工作/);
    assert.deepEqual(received.messages.slice(1).map((message: { role: string; content: string }) => [message.role, message.content]), [['user', '明天下午开会'], ['assistant', '需要提前提醒吗？'], ['user', '提前10分钟']]);
  } finally { server.closeAllConnections(); server.close(); }
});
