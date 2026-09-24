# Issue #19：AI 助手澄清提问工具 ask_user（循环中途向用户提问）

- Issue：<https://github.com/zhshenry/To-Do-List/issues/19>
- 建档：2026-09-22
- 状态：已归档（合入 516d304）
- 类型：功能
- 涉及UI：是
- 分支：sdd/0019（已删，HEAD 合并前 `de330e3`）

> **设计提前完成声明**：需求与高保真设计已在建档前完成——2026-09-22 与用户三轮设计讨论（0.6.0 助手升级提案，源目录 `docs/design-proposals/2026-09-22-assistant-upgrade-060/`）。Pi SDK 澄清能力分析（用户点名要求先分析）结论已定：不用 `ExtensionUIContext`，自定义 `ask_user` 工具。mockup-first 要求的画板即本档案 PNG，spec 就绪即里程碑评论发出。

## 背景（issue 要点 + 代码勘察结论）

**用户诉求**：针对 AI 助手新增一个澄清工具，类似 Claude Code 的 AskUserQuestion——模型在处理中途能向用户提问并等待选择，而不是把问题混在回复文本里、下一轮才能得到答案。要求同时覆盖展开态与折叠态。

**勘察**（main `708e1a7`，用户问"Pi 本身有没有"的分析结论）：

- Pi 扩展体系确有 `ExtensionUIContext`（`select/confirm/input`，语义即"阻塞等用户回答"，`pi-coding-agent/dist/core/extensions/types.d.ts:68-77`），但**不可直接用**：
  1. **接线入口不可达（硬伤）**：`setUIContext()` 只在内部 `ExtensionRunner`（`runner.d.ts:109`）；公开入口 `createAgentSession` 返回的 `extensionsResult.runtime`（`sdk.d.ts:58-65`）不暴露它——接线只能 import dist 内部模块，升级即碎；
  2. **表达力不够**：`select(title, options: string[])` 纯字符串数组，无 description/跳过/结构化返回；
  3. **桥接代码省不了**：路由到三个 Electron 渲染面、中止/超时/持久化仍要自己做；
- 现状澄清靠纯提示词（"存在歧义时用中文提问"），模型问题即普通回复，循环不阻塞；
- 现有 7 个工具全部 `defineTool` + TypeBox，工具结果为纯文本回给模型；AIToolEvent 流（`session.subscribe`）已把工具事件推给渲染面；
- **45s 整体超时**（`main.ts:1068`）会误杀等待用户的挂起——必须分段。

## 方案（mockup 见本档案 PNG）

画板：[expanded-ask.png](./expanded-ask.png)（活动卡片 + 已回答收敛态）· [mini-ask.png](./mini-ask.png)（折叠态提问视图）· [overlay-context.png](./overlay-context.png)（overlay 同构）

**工具定义（TypeBox，与现有 7 工具同管线）**

```ts
ask_user: {
  question: string            // ≤200 字，中文
  options?: { label: string; description?: string }[]  // 2–4 个
}
```

`execute`：向当前活动面（assistantWin > 主窗 overlay > 折叠 mini）发 `ai:ask {id, …}`，返回 Promise，由 `ask:answer {id, answer}` resolve。工具结果（文本）：

- 选项回答：`用户选择：<label>（选项 N）`；
- 自由输入：`用户输入：<文本>`——提问挂起时输入框直接发送 = 回答该问题，不开新轮（D5 建议）；
- 跳过：`用户跳过了这个问题，请按你的判断继续，并在结果中说明假设`；
- 取消：abort → `用户已取消`，loop 终止。

允许无选项纯开放提问（D2 建议：模型可只给 question，提示词鼓励给候选）。

**循环与超时语义（关键改动）**

- 45s 整体超时改**分段**：模型流式阶段保持 45s；`ask_user` 挂起期间**不计时**（等的是用户不是网络）；
- `cancelAI`/停止按钮：abort 同时 reject 挂起的 ask → 工具结果 `用户已取消`；
- 窗口全隐藏时：自动 presentAssistant()（D3 建议：本机单人桌面，没别人会回答）；折叠态直接切提问视图并扩展高度；
- 持久化：问题与回答记入 `ChatEntry.tools`（ask_user 事件带 question/answer），重启后渲染为"已回答"收敛态，不再是可交互卡片。

**UI**

- **展开态**：transcript 内提问卡片——活动态头部 `[图标] AI 想确认 + 呼吸点`，问题 13px/600，选项整行按钮（radio + label 650 + description 弱化），底部 `也可直接在下方输入回答 · 跳过`；回答后收敛单行 `✓「问题」 → 答案`（accent 胶囊）；处理记录（ActivityDisclosure）同步出现 `向用户提问` 行；
- **折叠态**：`mini-ai-surface is-asking`，`compact:height` 扩展至 ~262px——问题 10px + 单行选项按钮（radio + 时间段 + 右侧一词备注）+ 底部 `已暂停 · 等待回答 | 跳过 | 取消`，**底部留足边界**（第二轮已修复贴边问题）；头部「展开」进展开态看完整选项描述。

## 实现要点

- `electron/ai.ts`：`defineTool ask_user` + execute IPC 往返（Promise + AbortSignal 联动）；`electron/main.ts`：`ai:ask`/`ask:answer` IPC、分段超时改造、窗口隐藏时 presentAssistant；`electron/preload.ts` + `shared/contracts.ts`：`onAIAsk`/`answerAsk` 桥；
- 三面组件：`StandaloneAIConversation.tsx`（提问卡/收敛态）、`AIConversation.tsx`、`AssistantApp.tsx`（mini is-asking 分支 + 输入框发送优先作为回答）；css 两处；
- 测试：fake SSE 模拟模型调 ask_user → 脚本应答 → 循环继续（`tests/ai.test.ts` 模式）；abort/跳过/超时三分支单测；
- CHANGELOG 一条；
- 风险：高——动 agent 循环与超时语义，需保证无 ask_user 的常规请求路径零回归。

## 决策记录

- 2026-09-22 建档：设计提前完成（三轮）。技术路线拍板：**不用 Pi `ExtensionUIContext`，自定义 `ask_user` 工具**（三条理由见背景勘察，用户知悉）。D2（允许无选项提问）/D3（隐藏时自动弹出）/D5（输入即回答）按建议执行，用户未提异议；mini 提问视图拍板精简 ~262px 且底部留白（用户指出贴边问题后修复）。
- 2026-09-22 **spec 门**：`deny:ui` → `HUMAN_REVIEW`（UI 类硬政策），置 spec待审；mockup 已随里程碑评论内联（[#19 评论](https://github.com/zhshenry/To-Do-List/issues/19#issuecomment-5779767108)）。

- 2026-09-23 **批准**（issue 评论 `/approve` 09:46，来源:用户(/approve)）：spec 获批，进入实现排队（0.6.0 线顺序 #17 → #18 → #19 → #21）。
- 2026-09-23 **开工准备**（19:35 轮）：#17/#15 先后交付停等验收，实现位轮到本单——worktree `../To-Do-List-sdd/0019` 已建（sdd/0019 @ `a36c92f`），依赖与 Electron 运行时就绪；实现主体（ask_user 工具 + agent loop 接线 + mini/overlay 提问 UI）下轮开工，本轮时间预算止。
- 2026-09-23 **实现交付**（`bf9432f` @ sdd/0019，9 文件 +208/−12）：①ai.ts 新增 ask_user 工具（question + 2–4 可选带说明选项）经 onAskUser 桥接入循环，系统提示词歧义指引改为优先调用该工具；②main.ts `ai:ask`/`ask:answer` 往返——活动面投递（assistantWin>主窗，全隐藏自动 showAssistant），分段 45s 超时（提问挂起不计时），abort 将挂起问题 resolve 为「用户已取消」，回答按 option/text/skip 组词并连同 question 写入 ChatEntry.tools 持久化；③AssistantApp 三面 UI——展开态「AI 想确认」卡片（呼吸点+radio 选项+跳过+输入即回答 D5）+ 回答后收敛单行（持久化自 tools 事件），折叠态 is-asking 视图（262px compactHeight 扩展 + 跳过/取消 footer）；④样式全部阶内取值（--fs-body-sm/--fs-compact/--r-card/--ctl-sm 等）。验证：tsc 清零 · test 39/39（新增 ask_user 循环往返 + abort 分支 2 条）· build · smoke passed。**尺寸阶自检**：问句 var(--fs-body-sm) 13、选项标签 12=--fs-body-xs、说明 11=--fs-compact、卡片圆角 var(--r-card)、mini 行高 var(--ctl-sm)、mini footer 钮 var(--ctl-xs)；无阶外新增。**进展（20:07 轮）**：真机捕获 tooling/capture-ask.mjs（mock 按 ask_user 工具轮应答）——**展开态全链路已过**（提问卡出现 → 选项回答 → 收敛单行 ✓「周报…」→ 明天发 → tools.question/answer 持久化断言通过，19-ask-expanded/19-ask-answered 两图已产）；**mini 面 is-asking 未出现，调试中**：主进程文件日志证实 deliverAsk 两次均成功（assistant:false / main:true，ai:ask 已发往 win），但 mini 渲染层的 onAIAsk 探针未捕获事件且视图停在 is-result——嫌疑聚焦：①折叠后渲染层实例的订阅时序；②is-asking 分支被后续状态覆盖。DEBUG-mini-ask.png 已存档。下轮：定位 mini 投递断点 → 补 mini 证据 → accept 门 → 交付。
- 2026-09-23 **mini 投递谜团破案 + 视觉收口中**（20:07 轮续）：根因是**捕获脚本 mock 第二轮工具参数仍是单选项**（早前 bash 替换静默失败），minItems(2) 校验失败走「用户已取消」——修正后 **mini is-asking 出现、选项回答与持久化断言全过**（功能链路全绿）；发现并修复两处视觉问题：compactHeight 提问扩展 262→300（`472516e`）、`.mini-ai-surface` 固定 104px 网格对 is-asking 改自适应流式布局。**mini 收口完成**（`de330e3`）：高度约束链路为三层——`.mini-window` 176px → `.mini-content` 124px → `.mini-ai-surface` 104px 网格；修复 = AssistantApp 以 is-asking-window 类（`document.querySelector` 直接切换，不依赖 :has）释放窗口/内容固定高 + is-asking surface 改自适应流式；真机复核 19-ask-mini 全要素入窗（双选项 + 说明 + 暂停 footer）。
- 2026-09-23 **accept 门（Jev v3）**：HUMAN_REVIEW——deny:type（类型「功能」不在自动放行白名单）：功能类按严格制转人工验收，符合预期。输入留档 `jev-accept-input.json`。
- 2026-09-23 **交付评论已发**（三图 --attach 内联）：[#19 交付评论](https://github.com/zhshenry/To-Do-List/issues/19#issuecomment-5795475744)。**待用户 /approve 后走预合并八步合入**（正文留档 `delivery-body.md`）。
- 2026-09-23 **验收通过 + 预合并**（issue 评论 `/approve` 22:16，来源:用户(/approve)）：先叠合 main@023d18a 预解 AssistantApp.tsx / mini-card.css 冲突（双方新增全保留，stack `6d06122`，堆叠后 tsc 清零 47/47）→ `_integrate` 试合（tree `50674000`）→ 主干合并 `516d304`（树哈希一致）→ build + 冒烟全绿 → 分支 sdd/0019 删除、worktree 清理、关单归档。
## 验收记录

（待实现后填写）
