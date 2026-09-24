# AI 助手 0.6.0 升级方案（第二轮，吸收 10 条反馈）

日期：2026-09-22 · 状态：**提案 / 高保真阶段，未写代码**
目标版本：0.6.0（三项能力一并发布）

三个功能：

1. **事项选择栏**——把一个已有事项（名称 + 类型待办/日程 + 标签）显式关联进对话上下文，**单选**（已拍板）；
2. **澄清提问工具 `ask_user`**——模型在循环中途向用户提问并等待选择，类似 Claude Code 的 AskUserQuestion；
3. **Markdown 渲染**——助手回复从纯文本升级为渲染后的 Markdown，折叠态降级纯文本 + 「展开全文」出口。

每个功能覆盖三个渲染面：**悬浮气泡窗**（380×620）、**主窗展开态 overlay**（520px）、**折叠态小卡片 AI**（104px 内容区）。

已拍板（2026-09-22 第二、三轮讨论）：

- **单选**：一次只关联一个事项（所有入口均点选即关联并关闭）；
- **入口形态**：展开态输入卡**左下角「＋」图标**（不是文字胶囊）→ 菜单「选择事项」→ **悬停展开二级面板**（搜索 + 分组列表）；另支持 **`/` 快捷写法**（输入框打 `/` 唤出同一列表，继续输入即筛选，↑↓/Enter/Esc 键盘操作）；
- **折叠态**：「＋」放在**左下角工具行**（与展开态同逻辑），点击**向下弹出菜单**，卡片**不切换页面**；菜单再精简（单行条目、无搜索、无确认按钮）；
- chips / 用户气泡引用 chip **带外框**；对话区与输入栏之间加**分隔线**；
- 折叠态提问视图精简且**底部留足边界**（~262px）；
- 折叠态长回复 → **悬停预览**（浮层内保持 Markdown 格式，移开收起）+「展开全文 ›」进展开态；
- expanded-ask / md-compare 画板方向确认。

---

## 0. 现状盘点（结论的依据）

| 维度 | 现状 |
|---|---|
| Agent 循环 | 主进程 `electron/ai.ts` `requestPlan()`，用 `@earendil-works/pi-coding-agent` v0.85.1 的 `createAgentSession` + 自定义 `todolist` provider；`noTools:'builtin'`，系统提示词内嵌 top-120 事项快照（note 裁剪 1000 字） |
| 现有工具 | `list_tasks` / `propose_create` / `propose_update` / `propose_remove` / `propose_create_category` / `propose_update_category` / `propose_remove_category`，全部只累积建议、不落库 |
| 澄清方式 | **纯提示词**（"存在歧义时用中文提问"），模型把问题当普通文本回复，用户下一轮再答；循环中途无法阻塞等待 |
| 消息渲染 | `<p>{entry.content}</p>` + `white-space: pre-wrap`，无任何 Markdown 处理 |
| 超时 | `ask()` 整体 45s 超时（`main.ts:1068`），`cancelAI` 可中断（AbortSignal → `session.abort()`） |
| 面板状态机 | 折叠态 mini：默认输入 / is-working / is-result；展开态：完整 transcript + 建议卡片 + 历史菜单 |

## 1. 为什么不接线 Pi 的 `ExtensionUIContext`，而自定义 `ask_user` 工具

Pi 确实有这套原语（`ctx.ui.select / confirm / input`，语义就是"阻塞等用户回答"），但逐层核对后四条理由都不利于直接用：

1. **接线入口不可达（硬伤）**：`setUIContext()` 只存在于 Pi 内部的 `ExtensionRunner`（`core/extensions/runner.d.ts:109`）。我们用的公开入口 `createAgentSession` 返回 `extensionsResult.runtime`（`core/sdk.d.ts:58-65`），**没有暴露 `setUIContext`**。要接线只能 import dist 内部模块或 fork——绑定内部实现，升级即碎。
2. **表达力不够**：`select(title, options: string[])` 只有纯字符串数组（`types.d.ts:68-69`），没有 description / 跳过 / 结构化返回；返回 `string | undefined`。我们要的「选项+描述」「跳过」「自由输入也算回答」塞不进去，只能把描述拼进字符串再在渲染层解析（hack）。
3. **桥接代码一行不少**：即便接上，Pi 给的只是一个 Promise 接口；把问题路由到三个 Electron 渲染面（悬浮窗 > overlay > 折叠 mini）、处理中止/超时/持久化，这些工作一样要做。自定义 `ask_user` 走的是与现有 7 个工具完全相同的 `defineTool` + AIToolEvent 管线，schema、事件、持久化全部自控。
4. **它的宿命是终端**：同一接口里挤着 `setFooter` / `pasteToEditor` / `onTerminalInput`；Pi 为嵌入场景准备的是 RPC 模式的 UI 桥（终端 RPC 协议），对进程内直调的我们是绕远路。

> 结论：`ctx.ui` 是"Pi 的 TUI 扩展问终端用户"；我们要的是"应用问自己的用户"。桥一样要自己搭，接口按我们的需求定义。

## 2. 功能一：事项选择栏（上下文关联，单选）

### 2.1 交互设计

**展开态（气泡窗与 overlay 共用同一套组件）**

- **入口一「＋」**：输入卡左下角、模型选择器左侧的 34px 图标按钮：
  - 点击弹出根菜单（portal，向上），内含「选择事项 ▸」；
  - 悬停该项展开**二级面板**（搜索 + 日期分组列表：类型胶囊 + 标题 + 次行标签/时间/优先级）；
  - **单选：点行即关联并关闭全部菜单**；已关联时输入卡顶部显示 chip（✕ 取消，点 chip 可重开菜单更换）；
- **入口二 `/` 快捷写法**：输入框键入 `/` 直接唤出事项列表（锚在输入框上方），继续输入即时筛选，↑↓ 选择、Enter 关联、Esc 关闭；关联结果与「＋」一致（`/` 触发字符从输入中移除，不发给模型）；
- **发送后**：用户气泡顶部渲染只读引用 chip（**带外框**），随消息持久化；
- 对话区与输入栏之间加一条**分隔线**（`assistant-footer` 上边线）。

**折叠态（mini 卡 104px）**

- 「＋」位于**左下角工具行**（模型按钮左侧，18px 小按钮），**与展开态同逻辑**；
- 点击后**向下弹出菜单**（卡片本体不切换页面）：`compact:height` 临时扩展窗口，菜单浮在卡片下方的扩展区域，单行条目（类型胶囊 + 标题 + 标签点），**无搜索、无确认按钮**，单选点选即关联并关闭、窗口弹回 176px；
- 已关联：「＋」旁显示 chip（色点 + 标题 + ✕），placeholder 变为 `针对「准备周会材料」提问…`；
- `/` 快捷写法在折叠态输入框同样可用（唤出同一菜单）。

### 2.2 数据流与后端改动

```
UI → chat:ask { sessionId, text, taskId }        ← contracts.ts 扩展（单选，一个可空 id）
主进程 ask() → requestPlan(text, focusedTask)
  ├─ 系统提示词追加「用户本轮关联事项」区块：全字段（note 不裁剪、status、progress、提醒、标签）
  └─ 转写 ≤12 轮历史时，带 taskId 的历史消息同样注入关联区块
持久化：ChatEntry.taskId → 渲染层据此画引用 chip
```

- 校验：id 仍须在库中；已删除/不存在 → 发送前 UI 过滤并提示；
- `list_tasks` 与全量快照保持不变（模型仍可看全局，关联是聚焦不是限定）。

## 3. 功能二：澄清提问工具 `ask_user`

### 3.1 工具定义（TypeBox）

```ts
ask_user: {
  question: string            // ≤200 字，中文
  options?: { label: string; description?: string }[]  // 2–4 个
}
```

`execute`：向当前活动面（assistantWin > 主窗 overlay > 折叠 mini）发 `ai:ask {id, …}`，返回 Promise；由 `ask:answer {id, answer}` resolve。工具结果（文本）：

- 选项回答：`用户选择：14:00 – 15:00（选项 2）`；
- 自由输入：`用户输入：<文本>`（提问挂起时在输入框发送 = 回答该问题，不开新轮）；
- 跳过：`用户跳过了这个问题，请按你的判断继续，并在结果中说明假设`。

### 3.2 循环与超时语义

- 45s 整体超时改为**分段**：模型流式阶段保持 45s；`ask_user` 挂起期间不计时；
- `cancelAI`/停止按钮：abort 同时 reject 挂起的 ask → 工具结果 `用户已取消`，loop 终止；
- 窗口都隐藏时：自动 presentAssistant()（本机单人桌面，没别人会回答）；折叠态直接切提问视图并扩展高度；
- 持久化：问题与回答记入 `ChatEntry.tools`，重启后渲染为"已回答"收敛态。

### 3.3 UI 设计

**展开态**——transcript 中的提问卡片（语言承接 `assistant-activity`）：

- 活动态：头部 `[图标] AI 想确认 + 呼吸点`；问题 13px/600；选项整行按钮（radio + label 650 + description 弱化）；底部 `也可直接输入回答 · 跳过`；
- 回答后收敛单行：`✓ 已回答：「问题…」 → 选项`（accent 胶囊）；
- 处理记录里同步出现 `向用户提问` 行。

**折叠态**——`mini-ai-surface is-asking`，`compact:height` 扩展至 **~252px**（精简版）：

- 头部不变（AI 助手 / 展开 / 返回）；
- 问题 10px 两行内 + 单行选项按钮（radio + 时间段 + 右侧一词备注），底部 `跳过 · 取消`；
- 头部「展开」进展开态看完整选项描述。

## 4. 功能三：Markdown 渲染

### 4.1 依赖与规则

- `marked`（GFM + `breaks:true`）+ `dompurify`（禁 style/iframe/script，链接加 `target=_blank rel=noopener`）；
- 仅渲染**助手气泡**；用户侧纯文本；
- 气泡内样式：strong 650；h3/h4 → 12.5px/650（不出大气泡层级）；列表 accent marker；行内代码浅底；代码块/表格/引用按 DESIGN.md 色板；
- 流式期间按 delta 重 parse（50ms 节流，无性能顾虑）。

### 4.2 折叠态降级与长文出口

- `mini-ai-answer` 两行截断区显示**纯文本**（从 HTML 提取 innerText，等价去掉 `**`、反引号、marker）；
- **悬停预览（第三轮新增）**：鼠标悬停回答区 → 上方浮层显示完整回复且**保持 Markdown 格式**（加粗/列表/行内代码，超出内部滚动），移开自动收起；实现上浮层经 `compact:height` 临时扩展窗口容纳，300ms 延迟防误触；
- **「展开全文 ›」**：点击展开主窗 overlay 常驻查看完整渲染——折叠态定位是速览，不做滚动长文；
- 「处理记录 / 继续提问」等现有底栏不变。

## 5. 决策点状态

| # | 问题 | 状态 |
|---|---|---|
| D1 | 关联数量 | **已定：单选** |
| D2 | ask_user 是否允许无选项纯开放提问 | 待定（建议：允许，提示词鼓励给候选） |
| D3 | 窗口全隐藏时来了 ask_user | 待定（建议：自动弹出助手气泡窗） |
| D4 | 折叠态 md | **已定：降级纯文本 + 展开全文出口** |
| D5 | 自由输入是否也能回答 ask_user | 待定（建议：是） |
| D6 | 依赖引入 marked + dompurify | 待定（建议：是） |

## 6. 建议的实施切分（SDD issues，通过后建）

1. `md-render`（最小独立，先落地）；
2. `task-context`（contracts + 单选面板/chip + 折叠态 ＋ 入口与精简面板）；
3. `ask-user`（工具 + IPC 桥 + 分段超时 + 三面卡片态 + 持久化）；
4. 每期 mockup 确认 → spec → 实现 → /approve；合并发布 0.6.0。

## 7. 高保真清单（本目录，第二轮已更新）

| 文件 | 内容 |
|---|---|
| `preview.html` | 全部画板（真实样式复刻 + 新功能样式） |
| `capture.mjs` | Playwright/msedge 逐画板截图 |
| `expanded-picker.png` | 气泡窗：左下「＋」→ 菜单「选择事项」→ 二级面板（单选）+ chip + 引用外框 |
| `expanded-slash.png` | 气泡窗：输入 `/` 唤出事项菜单（筛选 + 键盘操作提示） |
| `expanded-ask.png` | 气泡窗：ask_user 活动卡片 + 已回答收敛态 + md 气泡（已确认） |
| `expanded-md-compare.png` | 同一段回复 纯文本 vs 渲染后（已确认） |
| `overlay-context.png` | 主窗 overlay：＋ 入口 + 单 chip + 分隔线 + ask_user 卡片 |
| `mini-default.png` | 折叠态未关联：左下角「＋」入口 |
| `mini-default-linked.png` | 折叠态已关联：＋旁 chip + 跟随 placeholder |
| `mini-picker.png` | 折叠态：＋下方弹出的精简菜单（卡片不换页，窗口临时扩展） |
| `mini-ask.png` | 折叠态精简提问视图（~262px，底部留白已修复） |
| `mini-answer.png` | 折叠态回答：纯文本两行 + 「展开全文 ›」 |
| `mini-answer-hover.png` | 折叠态回答区悬停预览（浮层保持 Markdown 格式） |
