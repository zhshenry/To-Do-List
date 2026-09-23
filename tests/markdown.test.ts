// renderMarkdown 净化用例：jsdom 装配 → 动态导入被测模块
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body></html>');
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).Node = dom.window.Node;

const { renderMarkdown, markdownToPlainText } = await import('../src/markdown');

test('renderMarkdown renders GFM essentials', () => {
  const html = renderMarkdown('**加粗** 与 `code`');
  assert.match(html, /<strong>加粗<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  const list = renderMarkdown('- 甲\n- 乙');
  assert.match(list, /<li>甲<\/li>/);
});

test('renderMarkdown strips scripts, iframes and inline handlers', () => {
  const html = renderMarkdown('前文<script>alert(1)</script>中<iframe src="x"></iframe>后<img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<script'), 'script must be stripped');
  assert.ok(!html.includes('<iframe'), 'iframe must be stripped');
  assert.ok(!html.includes('onerror'), 'onerror must be stripped');
  assert.ok(html.includes('前文') && html.includes('后'));
});

test('renderMarkdown hardens links with target and rel', () => {
  const html = renderMarkdown('[外链](https://example.com)');
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="[^"]*noopener/);
  assert.match(html, /href="https:\/\/example\.com"/);
});

test('renderMarkdown forbids style attributes and forms', () => {
  const html = renderMarkdown('<form action="x"></form><div style="position:fixed">t</div>');
  assert.ok(!html.includes('<form'));
  assert.ok(!html.includes('style='));
});

test('renderMarkdown keeps breaks as line breaks (breaks: true)', () => {
  const html = renderMarkdown('第一行\n第二行');
  assert.match(html, /<br/);
});

test('markdownToPlainText strips markup but keeps text and list structure', () => {
  const plain = markdownToPlainText('已经读取你的事项，**优先处理**：\n\n- 先跑 `npm run build` 确认产物\n- 再发 **0.5.11** 版本');
  assert.ok(plain.includes('优先处理'), 'bold text must survive');
  assert.ok(plain.includes('npm run build'), 'inline code text must survive');
  assert.ok(!plain.includes('**'), 'md emphasis marks must be gone');
  assert.ok(!plain.includes('<'), 'no html may leak');
});

test('markdownToPlainText tolerates empty input', () => {
  assert.equal(markdownToPlainText(''), '');
  assert.equal(markdownToPlainText(undefined as unknown as string), '');
});
