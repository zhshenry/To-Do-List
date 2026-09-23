// jsdom 仅用于测试环境的 DOM 装配；@types 包因 worktree .npmrc 限制未能安装，此处显式声明。
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: unknown);
    window: Window & typeof globalThis;
  }
}
