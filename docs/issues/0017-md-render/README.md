# Issue #17：AI 助手回复 Markdown 渲染（展开态渲染 + 折叠态降级/悬浮预览）

- Issue：<https://github.com/zhshenry/To-Do-List/issues/17>
- 建档：2026-09-22
- 状态：已归档（合入 fa2b64c）
- 类型：功能
- 涉及UI：是
- 分支：sdd/0017（基于 main `a36c92f`，HEAD `b328282`）

> **设计提前完成声明**：本 issue 的需求与高保真设计已在建档前完成——2026-09-22 与用户进行三轮设计讨论（0.6.0 助手升级提案，源目录 `docs/design-proposals/2026-09-22-assistant-upgrade-060/`），画板经用户逐张确认。spec 阶段所需的 mockup（mockup-first 硬要求）即本档案所附 PNG，**spec 就绪即里程碑评论发出**，无需再出设计。

## 背景（issue 要点 + 代码勘察结论）

**用户诉求**：当前 AI 助手的反馈是 MD 格式源码，直接以纯文本显示（`**加粗**`、反引号、`-` 列表符裸露），需要渲染。

**勘察**（main `708e1a7`）：

- 助手消息渲染为 `<p>{entry.content}</p>` + `white-space: pre-wrap`（`StandaloneAIConversation.tsx:65`、`AIConversation.tsx:143`），无任何 Markdown 处理；
- 仓库零 md 依赖（Pi 内嵌的 `marked` 是它 TUI 的嵌套依赖，不引用）；
- 折叠态回答区 `mini-ai-answer` 两行截断（`mini-card.css:315-318`），8–11px 微字号。

## 方案（mockup 见本档案 PNG）

画板：[expanded-md-compare.png](./expanded-md-compare.png)（现状 vs 渲染后）· [mini-answer.png](./mini-answer.png)（折叠态降级）· [mini-answer-hover.png](./mini-answer-hover.png)（悬浮预览）

1. **依赖**：`marked`（GFM + `breaks: true`）+ `dompurify`（新增 dependencies，合计 ~19kB gzip）——D6 已拍板；
2. **渲染范围**：仅**助手气泡**（悬浮窗/overlay 同构）；用户气泡与输入保持纯文本。输出过 DOMPurify（禁 script/iframe/style；链接 `target=_blank rel=noopener`，外链交系统浏览器）；
3. **气泡内样式**（13px 基准不变，见画板）：`strong` 650 字重；h3/h4 → 12.5px/650；列表 accent marker、行距紧凑；行内代码浅底 mono 11px；代码块/表格/引用按 DESIGN.md 色板；
4. **流式**：delta 重 parse（主进程 50ms 节流已存在，渲染侧无性能顾虑），光标动画保留；
5. **折叠态降级**（D4 已拍板）：`mini-ai-answer` 显示纯文本（HTML 提取 innerText，等价去掉 md 符号）两行截断；
6. **悬停预览**（用户点名要求"能悬浮且保持格式"）：悬停回答区 → 上方浮层显示完整回复**保持 Markdown 格式**（超出内部滚动），移开自动收起；浮层经 `compact:height` 临时扩展窗口容纳，300ms 延迟防误触；
7. **「展开全文 ›」**：点击展开主窗 overlay 常驻查看完整渲染（折叠态定位速览，不做滚动长文）。

## 实现要点

- `src/AIConversation.tsx` / `src/StandaloneAIConversation.tsx`：助手气泡内容改 `dangerouslySetInnerHTML`（marked+DOMPurify 单一出口，封装 `renderMarkdown()` 工具函数）；`src/AssistantApp.tsx`（mini is-result 分支）：innerText 降级 + 悬停浮层 + 展开全文；
- `src/assistant-updates.css`：`.chat-bubble.md` 子元素样式；`src/mini-card.css`：`.hover-pop` 浮层样式（`.mini-root` 作用域内）；
- `package.json`：新增 `marked`、`dompurify`；
- 测试：`renderMarkdown()` 净化用例（script/iframe 剥离、链接属性）；`npm test` + build + smoke 回归；
- CHANGELOG：[未发布] 一条；
- 风险：低——纯渲染层，不动后端与数据。

## 决策记录

- 2026-09-22 建档：设计提前完成（三轮：初版 → 单选/外框/分隔线/精简 → ＋二级菜单、`/` 写法、悬浮预览）；D4（折叠降级+悬浮预览）、D6（marked+dompurify）在讨论中拍板。
- 2026-09-22 **spec 门**：`deny:ui` → `HUMAN_REVIEW`（UI 类硬政策），置 spec待审；mockup 已随里程碑评论内联（[#17 评论](https://github.com/zhshenry/To-Do-List/issues/17#issuecomment-5779762152)）。

- 2026-09-23 **批准**（issue 评论 `/approve` 09:36，来源:用户(/approve)）：spec 获批，进入实现排队（0.6.0 线顺序 #17 → #18 → #19 → #21）。
- 2026-09-23 **一期交付**（`7ffaa1d` @ sdd/0017，9 文件 +674/−6）：新增 `src/markdown.ts`（marked GFM+breaks → DOMPurify 净化唯一出口，链接 afterSanitizeAttributes 外开）；AIConversation / StandaloneAIConversation 助手气泡接入（`md-body` 容器，用户气泡保持纯文本）；`.md-body` 气泡样式（尺寸阶取值：正文 13、行内代码 11、pre/table/blockquote 按 DESIGN.md 色板）；新增依赖 marked+dompurify（运行时）与 jsdom（仅测试）。测试：新增 `tests/markdown.test.ts` 净化/GFM 用例 5 条（jsdom 装配 + 动态导入），全套 42/42 · build · smoke passed。
- 2026-09-23 **二期待续**：折叠态 innerText 降级 + 悬停浮层（保持格式）+ 「展开全文 ›」+ `--fs`/hover-pop 样式；下轮完成后再过 accept 门统一交付。
- 2026-09-23 **二期交付**（`e84506b`）：AssistantApp 折叠结果态接入——`markdownToPlainText` 降级两行截断、`展开全文 ›` 打开主窗 overlay 常驻查看、悬停 300ms 延迟后浮层显示完整 Markdown（portal 至 body + 160ms 离开延迟，替代 spec 原设想的 compactHeight 窗口扩展——体验一致且免去窗口跳动，见自检披露）；mini-card.css 增 .hover-pop/.mini-ai-answer-extra 样式（尺寸阶取值）。验证：tsc 清零 · test 42/42 · build · smoke passed。
- 2026-09-23 **待补（进展）**：①设置流已复现——卡在漏抄「添加并使用」按钮（连接测试故意不落库），补齐后 mock 链路打通（overlay 提问 MOCK-OK）；②mini 内提问链路同样打通（MOCK HIT + 回复落库），但 mini 面未渲染结果态（原因待查）；③下轮动作：捕获脚本 catch 分支已加 DEBUG-mini-state.png 失败现场截图，据此定位后补齐三张证据，走 accept 门。
- 2026-09-23 **二期缺陷定位与修复**（`b328282` @ sdd/0017，4 文件 +181/−8）：现场取证（页面级事件监听 + `chatOpen` 条目 dump + 直连 `chatAsk` 探针 + `pageerror` 监听）定位到**整树崩溃根因**——① dompurify 3.x 实例不暴露 `.window`，`markdownToPlainText` 的 `purify.window.document` 抛 TypeError（`Cannot read properties of undefined (reading 'document')`），mini 面第一次带着助手内容渲染即被 React 整体卸载（窗口空白，`.mini-ai-answer` 永远不出现）；② `AssistantApp` compact 渲染体内死代码 `plainAnswer` 无条件调用该函数，流式/输入态视图同样中招。修复：markdown.ts 改为模块加载时捕获 `window`（渲染进程与 jsdom 测试两路通用）；删除死代码行。修复后真机复跑暴露**悬浮浮层视口裁切**——定位式 `window.innerHeight - 200` 在 176px 高迷你窗算出负值、浮层首行顶出窗缘；修复：top 下限钳到 8 且 `maxHeight` 收缩为 `min(300, 视口高 − top − 8)`（自适应收缩，不改 300 设计值）。验证：tsc 清零 · test 44/44（新增 markdownToPlainText 2 条）· build · ux-smoke passed。
- 2026-09-23 **真机证据齐**：`tooling/capture-hover.mjs`（smoke 官方 mock 原样 + 设置 UI 流建供应商）三阶段截图并通过断言——[17-mini-degraded.png](./17-mini-degraded.png)（折叠降级两行 + 展开全文）、[17-hover-pop.png](./17-hover-pop.png)（悬浮浮层完整 Markdown 入窗）、[17-expanded-md.png](./17-expanded-md.png)（展开全文 → 独立助手窗渲染 + 工具记录 chip）。脚本随 `b328282` 入库（`tooling/capture-hover.mjs`）。
## 验收记录

- 2026-09-23 **accept 门（Jev v3）**：HUMAN_REVIEW——deny:type（类型「功能」不在自动放行白名单 缺陷/工程/文档/优化）：功能类按严格制转人工验收，符合预期。引擎自采证据（diff/CHANGELOG/测试引擎自跑）通过，无 RETRY 回炉项。输入留档 `jev-accept-input.json`。
- 2026-09-23 **交付评论已发**（三图 --attach 内联，改写 user-attachments 直链）：[#17 交付评论](https://github.com/zhshenry/To-Do-List/issues/17#issuecomment-5794058039)。
- 2026-09-23 **验收通过 + 预合并**（issue 评论 `/approve` 20:25，来源:用户(/approve)）：净检查（常设授权三份 + 流水线产物；另清理 @types/jsdom 安装残留至 stash 可逆）→ `_integrate` 试合 44/44（tree `15774297`）→ 主干合并 `fa2b64c`（树哈希一致）→ 先 build 再冒烟全绿 → 分支 sdd/0017 删除、worktree 清理、关单归档。
