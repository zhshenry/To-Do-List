# Issue #18：AI 对话支持关联已有事项（＋/​/ 选择，单选聚焦上下文）

- Issue：<https://github.com/zhshenry/To-Do-List/issues/18>
- 建档：2026-09-22
- 状态：已归档（合入 97e2297）
- 类型：功能
- 涉及UI：是
- 分支：sdd/0018（已删，stack 后 HEAD `6760d58`）

> **设计提前完成声明**：需求与高保真设计已在建档前完成——2026-09-22 与用户三轮设计讨论（0.6.0 助手升级提案，源目录 `docs/design-proposals/2026-09-22-assistant-upgrade-060/`），单选、入口形态（＋二级菜单 + `/` 快捷写法）、折叠态向下弹菜单不换页等均由用户逐项拍板。mockup-first 要求的画板即本档案 PNG，spec 就绪即里程碑评论发出。

## 背景（issue 要点 + 代码勘察结论）

**用户诉求**：新增"选择已有事项进行对话"——通过选择栏选择事项（名称 + 类型待办/日程 + 标签），让对话围绕该事项展开；展开态与折叠态都要有入口。

**勘察**（main `708e1a7`）：

- 助手窗口已持有全量 `State`（`AssistantApp.tsx:108-129` 每次changed 重载），但模型只看系统提示词里的 top-120 快照 + `list_tasks`；用户无法指定"这句是针对哪件事"；
- `chat:ask`（`shared/contracts.ts:125`）只有 `sessionId/text`；`ChatEntry`（`:77-81`）无关联字段；
- 历史菜单已有 portal 定位先例（`HistoryMenu`，`AssistantApp.tsx:9-62`）；折叠态临时扩展窗口机制已存在（`compact:height`，模型菜单用 380px）。

## 方案（mockup 见本档案 PNG；单选——D1 已拍板）

画板：[expanded-picker.png](./expanded-picker.png)（＋→二级面板）· [expanded-slash.png](./expanded-slash.png)（`/` 快捷）· [mini-default.png](./mini-default.png)/[mini-default-linked.png](./mini-default-linked.png)（折叠态入口）· [mini-picker.png](./mini-picker.png)（折叠态弹出菜单）· [overlay-context.png](./overlay-context.png)（overlay 同构）

**展开态（悬浮窗/overlay 同一套组件）**

1. 入口：输入卡左下角 **「＋」34px 图标按钮**（模型选择器左侧）→ 点击弹出根菜单（portal 向上，内含「选择事项 ▸」）→ **悬停展开二级面板**：搜索框（标题/标签）+ 日期分组列表（今天/明天/近期/更晚/无日期），每行 = 类型胶囊（待办=绿 success-soft、日程=蓝灰 #e3ecf3，同小卡片语义色）+ 标题 + 次行（标签色点+名称 · 时间 · 优先级）；
2. **单选：点行即关联并关闭全部菜单**；已关联时输入卡顶部显示 chip（色点 + 标题 + 标签名 + ✕，**带外框**；✕ 取消，点 chip 重开菜单更换）；
3. **`/` 快捷写法**：输入框键入 `/` 唤出同一事项列表（锚在输入框上方，间距 ~4px），继续输入即时筛选，↑↓ 移动、Enter 关联、Esc 关闭；`/` 触发字符从输入中移除、不发给模型；
4. 发送后：用户气泡顶部渲染只读引用 chip（带外框，超 1 项不适用——单选），随消息持久化；
5. 对话区与输入栏之间加**分隔线**（`assistant-footer` 上边线，替换现有渐变淡出）。

**折叠态（mini 卡 104px）**

6. 「＋」位于**左下角工具行**（18px 小按钮，模型按钮左侧），与展开态同逻辑；已关联时「＋」旁显示 chip（截断省略），placeholder 跟随变为 `针对「<事项名>」提问…`；
7. 点击**向下弹出菜单**（**卡片不切换页面**）：`compact:height` 临时扩展窗口，菜单浮在卡片下方扩展区（间距 ~5px），单行条目（胶囊+标题+标签点），**无搜索、无分组标题、无确认按钮**，单选点选即关联并关闭、窗口弹回 176px；`/` 快捷写法在折叠态输入框同样可用。

**数据流**

```
UI → chat:ask { sessionId, text, taskId }     ← contracts.ts 扩展（单选，可空）
主进程 ask() → requestPlan(text, focusedTask)
  ├─ 系统提示词追加「用户本轮关联事项」区块：全字段（note 不裁剪 1000 字、status、progress、提醒、标签）
  └─ 转写 ≤12 轮历史时，带 taskId 的历史消息同样注入关联区块
持久化：ChatEntry.taskId → 渲染层据此画引用 chip
```

- 校验：taskId 仍须在库中；已删除/不存在 → 发送前 UI 过滤并提示；
- `list_tasks` 与全量快照**保持不变**（关联是聚焦不是限定）。

## 实现要点

- `shared/contracts.ts`：`chatAsk` 增 `taskId?: string | null`；`ChatEntry` 增 `taskId?: string | null`；
- `electron/main.ts`：`ask()` 透传 taskId；`electron/ai.ts`：`requestPlan` 聚焦注入（系统提示词 + 历史转写）；`electron/store.ts`：chats 持久化带 taskId；
- `src/AssistantApp.tsx`：＋根菜单/二级面板（复用 HistoryMenu portal 定位模式）、`/` 快捷菜单（textarea 键盘拦截）、mini 下拉菜单（compact:height）、chip 渲染；新组件 `TaskPickerMenu`（展开/折叠共用行渲染）；
- `src/assistant-updates.css`、`src/mini-card.css`：chip/菜单/分隔线样式；
- 测试：fake SSE（`tests/ai.test.ts` 既有模式）断言快照注入关联事项字段；`npm test` + build + smoke；
- UX-CONTRACT.md「AI 对话」「小卡片 AI」行同步；CHANGELOG 一条；
- 风险：中——contracts 变更跨主/渲染进程，折叠态窗口高度切换需处理焦点与 IME。

## 决策记录

- 2026-09-22 建档：设计提前完成（三轮）。D1 拍板**单选**（用户明确"不允许多选"）；入口形态拍板「＋图标 → 菜单 → 二级面板」+ `/` 快捷（用户提出）；折叠态拍板「向下弹菜单不换页」（用户点名注意）；菜单间距拍板贴近输入区（4px/5px）。
- 2026-09-22 **spec 门**：`deny:ui` → `HUMAN_REVIEW`（UI 类硬政策），置 spec待审；mockup 已随里程碑评论内联（[#18 评论](https://github.com/zhshenry/To-Do-List/issues/18#issuecomment-5779765716)）。
- 2026-09-23 **用户反馈 + mockup 修订 v2**（issue 评论「二级目录显示不全」，来源:用户(聊天)）：根因 = 展开态 mockup 的二级面板 left:168 + width:274 右缘达 442px，超出 380px 画布 62px。修订：根菜单 148→118px、二级面板 left 168→136 / width 274→232（右缘 368px，留 12px 边距），列表行完整含勾选与 footer；preview.html 已改并重拍全部 PNG。

- 2026-09-23 **批准**（issue 评论 `/approve` 00:11，来源:用户(/approve)）：mockup 修订 v2 获批，spec 生效，进实现。本期先落数据链路主干（contracts/主进程聚焦注入），选择器 UI 随后。
- 2026-09-24 **数据链路主干交付**（`b55c792`+`f4d0d27` @ sdd/0018）：①contracts——chatAsk/ChatEntry 增可选 taskId；②chat:ask 校验关联事项（已删/不存在发送前拒绝并提示）→ focusedTask 经 ask() 透传 requestPlan；用户消息持久化 taskId（store JSON 序列化自动覆盖，无需改 store）；③ai.ts——requestPlan 尾参 focusedTask，系统提示词追加「用户本轮关联事项」全字段块（note 完整不裁剪、标签名解析、状态/进度/提醒），list_tasks 与 top-120 快照保持不变（聚焦非限定）；④历史 ≤12 轮中带 taskId 的消息注入「（此句关联事项：…）」指针；⑤tests 新增聚焦注入（含完整 note 断言）与无关联不污染基线 2 条，全套 53/53。验证：tsc 清零 · build · 53/53。**待补（下轮）**：选择器 UI（＋根菜单/二级面板//快捷/chip/mini 下拉）→ 三态截图 → accept 门 → 交付。
- 2026-09-24 **选择器 UI 交付**（`d526caa` @ sdd/0018，4 文件 +133/−9）：①展开态——composer 新增 ＋ 钮 → 根菜单「选择事项 ▸」→ 二级面板（搜索 + 今天/明天/近期/更晚/无日期 分组行：类型胶囊+标题+标签点·时间·优先级+勾选，单选点选即关）；已关联 chip（色点+标题+标签+✕，点 chip 重开更换）；`/` 快捷（空输入或空格后触发，触发符不进输入框，↑↓/Enter/Esc 键盘流）；②折叠态——compose 工具行 ＋(24px)+截断 chip、向下弹菜单（compactHeight 320 扩展、无搜索无分组、单行条目）、placeholder 变「针对『事项』提问…」、`/` 同样可用；③用户气泡持久化引用 chip（entry.taskId → tasks 查找渲染）；④关联随 chatAsk 发送并在回答后清除；⑤footer 分隔线。验证：tsc 清零 · 53/53 · build · smoke passed。**尺寸阶自检**：＋钮 24=--ctl-sm、行胶囊 30px 圆角 999、菜单圆角 --r-control/--r-card、行高 --ctl-sm、字号 --fs-body-xs/--fs-compact/--fs-micro；无阶外新增。**待补（下轮）**：真机截图（展开 picker / slash / mini picker / chip / 气泡引用）→ accept 门 → 交付评论。
- 2026-09-24 **真机证据攻坚**（`9c2a4c4`± @ sdd/0018）：capture-picker.mjs 六面截图——**五面已绿**（展开 picker 完整入窗 / 关联 chip / 发送后气泡引用 chip + taskId 持久化断言 / `/` slash 菜单 / mini 关联后 placeholder 跟随），且 **FOCUSED SYSTEM 命中**（关联注入真实生效）；**遗留**：mini 向下弹菜单首帧窗口未扩展（同 #19 的 .mini-content 固定高链路，已应用 is-asking-window 类复用待查 compactHeight 触发时序），18-picker-mini 需重拍 → accept 门 → 交付。
- 2026-09-24 **mini 高度攻坚（续）**：内联像素高实验发现 picker 并不在 .mini-content 子树内（其 scrollHeight=124 不含 picker 74px），且 compactHeight 320 已生效（innerH=320）但组合视图仍被 176px 容器裁切——真正的裁切容器是 compose 视图的直接父级（非 .mini-content），下轮定位该父级并释放固定高 → 重拍 18-picker-mini → accept 门 → 交付。
- 2026-09-24 **mini 收口完成**（`184e16c`）：裁切根因 = compose 视图的 `.mini-ai-surface` 自身（fixed 104px grid + overflow hidden）——surface 随 miniPickerOpen 释放（height:auto + grid rows:none + overflow:visible），mini-content 涨至实测 171px，窗口 225px，三行菜单完整入窗（18-picker-mini 重拍合格）。
- 2026-09-24 **accept 门（Jev v3）**：HUMAN_REVIEW——deny:type（功能类转人工验收）。输入留档 `jev-accept-input.json`。
- 2026-09-24 **交付评论已发**（五图 --attach 内联）：[#18 交付评论](https://github.com/zhshenry/To-Do-List/issues/18#issuecomment-5799644946)。**待用户 /approve 后走预合并八步合入**（正文留档 `delivery-body.md`）。
- 2026-09-24 **验收反馈修订**（issue 评论 09:13 带图，来源:用户(评论→修订)）：关联 chip（发送前）应在输入卡左上方而非右下——已移至 composer 上方左对齐（`811e99c`），18-linked-chip 重拍合格，已回复请复验（[修订回复](https://github.com/zhshenry/To-Do-List/issues/18#issuecomment-5806849855)）。另：本轮起指令提取器新增最新评论披露（用户要求补纯文字反馈盲区）。
- 2026-09-24 **复验通过 + 预合并**（issue 评论 `/approve` 11:24，来源:用户(/approve 复验)）：先叠合 main@57c653e——CHANGELOG/styles.css 自动合并零冲突（堆叠后 tsc 清零 53/53）→ `_integrate` 试合（tree `67bfeac8`）→ 主干合并 `97e2297`（树哈希一致）→ build + 冒烟全绿 → 分支 sdd/0018 删除、worktree 清理、关单归档。
## 验收记录

（待实现后填写）
