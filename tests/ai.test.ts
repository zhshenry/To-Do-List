import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mapAiError, parsePlan, piApi, planFromReply, requestPlan, testConnection, validateEndpoint } from '../electron/ai';
import { newTask } from '../shared/contracts';
import type { AIToolEvent } from '../shared/contracts';

test('Pi exposes real tool execution events without forwarding reasoning or credentials', async () => {
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (body.messages.some((message: { role: string }) => message.role === 'tool')) { writeChatSse(res, '目前没有事项，可以告诉我你的安排。'); return; }
    res.setHeader('Content-Type', 'text/event-stream');
    res.write(`data: ${JSON.stringify({ id: 'tools', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: 'private reasoning must not appear', tool_calls: [{ index: 0, id: 'call-list', type: 'function', function: { name: 'list_tasks', arguments: '{}' } }] }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ id: 'tools', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const events: AIToolEvent[] = []; const deltas: string[] = [];
    const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
    const plan = await requestPlan({ endpoint, model: 'test', protocol: 'openai-chat', key: 'secret-fixture-key' }, '查看事项', [], [], [], AbortSignal.timeout(15000), text => deltas.push(text), event => events.push(event));
    assert.equal(plan.actions.length, 0);
    assert.deepEqual(events.map(event => [event.id, event.status]), [['call-list', 'running'], ['call-list', 'complete']]);
    assert.match(events[1].output, /"tasks":\[\]/);
    assert.doesNotMatch(JSON.stringify({ events, deltas }), /private reasoning|secret-fixture-key/);
  } finally { server.closeAllConnections(); server.close(); }
});

test('Pi cancellation stops a waiting response', async () => {
  const controller = new AbortController();
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    res.setHeader('Content-Type', 'text/event-stream'); res.flushHeaders();
    controller.abort();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
    await assert.rejects(requestPlan({ endpoint, model: 'test', protocol: 'openai-chat', key: '' }, '请回答', [], [], [], controller.signal), /已取消/);
  } finally { server.closeAllConnections(); server.close(); }
});

test('Pi reports rejected tool arguments as a failed tool event without applying data', async () => {
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (body.messages.some((message: { role: string }) => message.role === 'tool')) { writeChatSse(res, '请告诉我事项名称。'); return; }
    res.setHeader('Content-Type', 'text/event-stream');
    res.write(`data: ${JSON.stringify({ id: 'invalid-tool', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call-invalid', type: 'function', function: { name: 'propose_create', arguments: '{}' } }] }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ id: 'invalid-tool', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const events: AIToolEvent[] = [];
    const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
    const plan = await requestPlan({ endpoint, model: 'test', protocol: 'openai-chat', key: '' }, '新增', [], [], [], AbortSignal.timeout(15000), undefined, event => events.push(event));
    assert.equal(plan.actions.length, 0);
    assert.ok(events.some(event => event.id === 'call-invalid' && event.status === 'error' && event.output));
  } finally { server.closeAllConnections(); server.close(); }
});

function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => typeof part === 'string' ? part : part && typeof part === 'object' && 'text' in part ? String(part.text) : '').join('');
}

function writeChatSse(res: import('node:http').ServerResponse, text: string, status = 200, pieces?: string[]): void {
  res.statusCode = status;
  if (status !== 200) { res.end('unauthorized'); return; }
  res.setHeader('Content-Type', 'text/event-stream');
  const id = 'chatcmpl-test';
  const deltas = pieces ?? [text];
  for (const [index, part] of deltas.entries()) {
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { ...(index === 0 ? { role: 'assistant' as const } : {}), content: part }, finish_reason: null }] })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } })}\n\n`);
  res.end('data: [DONE]\n\n');
}

test('endpoint permits HTTPS and remote HTTP but rejects credential-bearing URLs', () => {
  assert.equal(validateEndpoint('https://example.com/v1/'), 'https://example.com/v1');
  assert.equal(validateEndpoint('http://127.0.0.1:11434/v1'), 'http://127.0.0.1:11434/v1');
  assert.equal(validateEndpoint('http://example.com/v1'), 'http://example.com/v1');
  for (const url of ['https://user:pass@example.com', 'https://example.com?key=secret', 'file:///x']) assert.throws(() => validateEndpoint(url));
});
test('AI accepts structured plans and rejects arbitrary commands', () => {
  assert.equal(parsePlan(JSON.stringify({ message: '请确认', actions: [{ type: 'create', task: newTask('报告') }] })).actions.length, 1);
  assert.throws(() => parsePlan('{"message":"ok","actions":[{"type":"execute","sql":"DROP TABLE tasks"}]}'), /格式不正确/);
  assert.throws(() => parsePlan('not json'), /格式不正确/);
});
test('Pi protocol mapping and reply assembly keep confirm-before-write', () => {
  assert.equal(piApi('openai-chat'), 'openai-completions');
  assert.equal(piApi('openai-responses'), 'openai-responses');
  assert.equal(piApi('anthropic'), 'anthropic-messages');
  const task = newTask('报告');
  const known = new Set(['11111111-1111-4111-8111-111111111111']);
  assert.equal(planFromReply('', [{ type: 'create', task }], new Set()).actions[0]?.type, 'create');
  assert.equal(planFromReply(JSON.stringify({ message: '请核对', actions: [{ type: 'create', task }] }), [], new Set()).message, '请核对');
  assert.equal(planFromReply('具体几点？', [], new Set()).actions.length, 0);
  assert.throws(() => planFromReply('', [{ type: 'update', id: '11111111-1111-4111-8111-111111111111', patch: { title: '改' } }], new Set()), /不存在的事项/);
  assert.equal(planFromReply('', [{ type: 'update', id: '11111111-1111-4111-8111-111111111111', patch: { title: '改' } }], known).actions.length, 1);
  assert.throws(() => planFromReply('', [{ type: 'remove', id: '11111111-1111-4111-8111-111111111111' }], new Set()), /不存在的事项/);
  assert.equal(planFromReply('', [{ type: 'remove', id: '11111111-1111-4111-8111-111111111111' }], known).actions[0]?.type, 'remove');
  const categoryId = '43f07b99-78e2-4eef-9ddc-759b40a88e54';
  assert.equal(planFromReply('', [{ type: 'create_category', category: { id: categoryId, name: '学习', color: '#335577' } }], new Set(), new Set()).actions[0]?.type, 'create_category');
  assert.throws(() => planFromReply('', [{ type: 'remove_category', id: categoryId }], new Set(), new Set()), /不存在的标签/);
  assert.equal(planFromReply('', [{ type: 'remove_category', id: categoryId }], new Set(), new Set([categoryId])).actions[0]?.type, 'remove_category');
  const abort = new AbortController(); abort.abort();
  assert.match(mapAiError(new Error('boom'), abort.signal).message, /已取消/);
  assert.match(mapAiError({ status: 401, message: 'nope' }, new AbortController().signal).message, /认证失败/);
});
test('Pi OpenAI-compatible loop returns JSON plans and forwards conversation history', async () => {
  const received: { headers: Record<string, string | string[] | undefined>; body: any }[] = [];
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); received.push({ headers: req.headers, body });
    const last = messageText(body.messages?.at(-1)?.content);
    const plan = last === '提前10分钟'
      ? { message: '请核对', actions: [{ type: 'create', task: newTask('报告') }] }
      : { message: '你希望提前多久提醒？', actions: [] };
    writeChatSse(res, JSON.stringify(plan));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const address = server.address() as { port: number };
    const history = [{ role: 'user' as const, content: '明天下午开会' }, { role: 'assistant' as const, content: '需要提前提醒吗？' }];
    const endpoint = `http://127.0.0.1:${address.port}/v1`;
    const categories = [{ id: '43f07b99-78e2-4eef-9ddc-759b40a88e54', name: '工作', color: '#b55232', createdAt: '2026-09-14T00:00:00.000Z', updatedAt: '2026-09-14T00:00:00.000Z' }];
    const plan = await requestPlan({ endpoint, model: 'test', protocol: 'openai-chat', key: 'openai-key' }, '提前10分钟', history, [], categories, AbortSignal.timeout(15000));
    assert.equal(plan.actions.length, 1);
    const last = received.at(-1);
    assert.ok(last); assert.equal(last.headers.authorization, 'Bearer openai-key');
    assert.match(messageText(last.body.messages[0].content), /已有标签/);
    assert.deepEqual(last.body.messages.filter((message: { role: string }) => message.role !== 'system').map((message: { role: string; content: unknown }) => [message.role, messageText(message.content)]), [['user', '明天下午开会'], ['assistant', '需要提前提醒吗？'], ['user', '提前10分钟']]);
    assert.equal(last.body.stream, true);
  } finally { server.closeAllConnections(); server.close(); }
});
test('Pi streams visible assistant text and emits parsed JSON only after completion', async () => {
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const last = messageText(JSON.parse(raw).messages?.at(-1)?.content);
    if (last === 'stream please') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream');
      const id = 'chatcmpl-stream';
      res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: '你好' }, finish_reason: null }] })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 40));
      res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: '世界' }, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 } })}\n\n`);
      res.end('data: [DONE]\n\n');
    } else writeChatSse(res, JSON.stringify({ message: '请核对', actions: [] }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
    const streamed: string[] = [];
    const prose = await requestPlan({ endpoint, model: 'test', protocol: 'openai-chat', key: 'openai-key' }, 'stream please', [], [], [], AbortSignal.timeout(15000), text => streamed.push(text));
    assert.equal(prose.message, '你好世界');
    assert.ok(streamed.some(item => item === '你好' || item.startsWith('你好') && item.length < 4));
    assert.equal(streamed.at(-1), '你好世界');
    const jsonSeen: string[] = [];
    const json = await requestPlan({ endpoint, model: 'test', protocol: 'openai-chat', key: 'openai-key' }, 'json please', [], [], [], AbortSignal.timeout(15000), text => jsonSeen.push(text));
    assert.equal(json.message, '请核对');
    assert.deepEqual(jsonSeen, ['请核对']);
  } finally { server.closeAllConnections(); server.close(); }
});
test('Pi maps HTTP 401 to the existing authentication error', async () => {
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk; void raw;
    res.statusCode = 401; res.end('unauthorized');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
    await assert.rejects(requestPlan({ endpoint, model: 'test', protocol: 'openai-chat', key: 'bad' }, 'hello', [], [], [], AbortSignal.timeout(15000)), /认证失败/);
  } finally { server.closeAllConnections(); server.close(); }
});
test('connection test pings the named model and maps auth failures', async () => {
  const received: { url?: string; body: any }[] = [];
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); received.push({ url: req.url, body });
    if (body.model === 'blocked') { res.statusCode = 401; res.end('unauthorized'); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
    assert.equal(await testConnection({ endpoint, model: 'by-model', protocol: 'openai-chat', key: 'k' }, AbortSignal.timeout(5000)), '模型 by-model 连接成功');
    assert.equal(received[0]?.url, '/v1/chat/completions');
    assert.equal(received[0]?.body.model, 'by-model');
    await assert.rejects(testConnection({ endpoint, model: 'blocked', protocol: 'openai-chat', key: 'k' }, AbortSignal.timeout(5000)), /认证失败/);
  } finally { server.closeAllConnections(); server.close(); }
});
