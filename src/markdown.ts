// renderMarkdown：AI 助手回复的唯一 Markdown 出口（marked GFM + DOMPurify 净化）
// 铁律：任何要渲染为 HTML 的助手内容必须经过本函数；用户输入与事项文本不经过。
// node 测试路径：测试文件须先以 jsdom 装配 global.window 再动态导入本模块。
import { marked } from 'marked';
import createDOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const purify: any = typeof window !== 'undefined' ? createDOMPurify(window) : null;

if (purify) {
  purify.addHook('afterSanitizeAttributes', (node: Element) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

export function renderMarkdown(content: string): string {
  if (!purify) throw new Error('renderMarkdown requires a DOM (browser, or jsdom setup in tests)');
  const raw = marked.parse(String(content ?? ''), { async: false }) as string;
  return purify.sanitize(raw, {
    FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'button', 'textarea', 'select', 'object', 'embed'],
    FORBID_ATTR: ['style'],
  });
}
