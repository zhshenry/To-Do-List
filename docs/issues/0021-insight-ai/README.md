# Issue #21：AI 建议真 AI 化（折叠卡建议条 · 渐进式增强）

- Issue：<https://github.com/zhshenry/To-Do-List/issues/21>
- 建档：2026-09-23
- 状态：已归档（合入 a45f5a9）
- 类型：功能
- 涉及UI：是
- 分支：sdd/0021（已删，stack `d633da0` 后合并）

> **设计提前完成声明**：需求与高保真设计已在建档前完成——2026-09-23 与用户进行设计讨论（源目录 `docs/design-proposals/2026-09-23-insight-ai/`），四轮迭代：初版方案 → D1–D6 拍板 → 第四轮标签/文案调整（本地兜底改「建议」、AI 版 = ✦+「AI 建议」、预览文案说人话、引导条同步）。mockup-first 要求的画板即本档案 PNG，spec 就绪即里程碑评论发出。**实施排序：#17 → #18 → #19 之后**（建议→对话链路在 18/19 落地后体验完整，无硬依赖）。

## 背景（issue 要点 + 代码勘察结论）

**用户诉求**：折叠卡独有的「AI 建议」条目前是纯本地规则（`shared/contracts.ts:179` `insightTarget`：日程距开始 ≤60 分钟 → 待办距截止 ≤90 分钟 → 今日 ≥3 项给排序建议），不调用模型。希望做成**真正用 AI**。

**勘察**（main `708e1a7`）：

- 建议条计算在 `MiniCard.tsx:312`：`suggestion = !suggestionIgnored && aiAvailable ? insightTarget(remaining, new Date()) : null`，纯本地、零网络请求；
- 点击「生成方案」→ `startSuggestion(prompt)` 发送固定模板 prompt 进 AI 对话——这是唯一与 AI 的连接点；
- `aiAvailable` 未配置/未启用时显示引导条（`MiniCard.tsx:462`）；
- 密钥只在主进程（safeStorage），渲染层不可达 → 生成必须在主进程、经 IPC 下发。

## 方案（mockup 见本档案 PNG）

画板：[insight-local.png](./insight-local.png)（本地兜底）· [insight-ai.png](./insight-ai.png)（AI 就位）· [insight-ai-open.png](./insight-ai-open.png)（展开预览）· [insight-off.png](./insight-off.png)（未配置引导）

**核心设计：渐进式增强 + 职责切分**

| 职责 | 归属 | 理由 |
|---|---|---|
| 挑目标事项 | **AI** | 规则只看"最近截止"；AI 能看懂日程密度、事项被拖了多久 |
| 建议短语（context） | **AI** ≤8 字 + 本地拼接「 · 距开始/截止约 {min} 分钟」 | 个性化；数字渲染时本地替换，永不过期、不为刷新重调 |
| 点击后的 prompt | **AI 起草** + 主进程统一追加安全后缀 | 从固定模板升级为个性化提问；红线由后缀硬保证 |

AI 输出（单次补全，JSON，zod 严格校验）：

```json
{ "taskId": "必须∈今日剩余事项",
  "action": "prepare | next-step | reschedule | order | focus",
  "context": "≤8字短语（{min} 占位）",
  "prompt": "≤80字，给对话助手的提问" }
```

任何校验失败（taskId 不存在 / 超长 / 非法 JSON / 超时）→ 静默回退 `insightTarget` 结果。**建议条永不报错、永不空白、永不直接写数据**。

**标签与文案（第四轮拍板）**

- 本地兜底 / 未配置引导：标签 **「建议」**（不占用「AI 建议」名义）；引导条文案「建议 / 配置 AI 后可获得个性化建议 / 配置」；
- AI 生成：**✦ sparkle 图标 + 「AI 建议」文字 + accent 描边浅底**（`is-ai` 类），200ms 过渡换入，`aria-label="AI 生成的建议"`；
- 展开预览文案：标题「**让 AI 助手处理这条建议**」，说明「会针对『<事项名>』给出处理建议；改动先出建议卡，确认后才写入。」；按钮 忽略/调整/生成方案 不变。

**通道：主进程单次补全（不走 Pi agent 工具循环）**

- 新 `electron/insight.ts` `generateInsight()`：复用 `electron/ai.ts` 的 provider 装配（createAgentSession + `noTools:'builtin'` + 单轮、maxTokens ~300）；实现期核实 Pi 是否暴露更轻 one-shot API，有则替换；
- 输入仅**今日剩余事项紧凑清单**（300–600 token），非 120 项全量；
- 单飞锁（独立于对话 `activeRequest`）、10s 超时、失败重试 1 次、连续失败指数退避（5min→15min）。

**触发与节流（主进程持有）**

- 状态哈希 = 剩余事项排序后 (id, status, dueAt, plannedDate, title)；
- 触发点仅四个：启动加载完、`changed` 且哈希变且距上次 ≥90s、TTL 60 分钟、跨天；翻卡/开窗不触发；
- 最近一次建议持久化（settings 独立键，含 generatedAt/model），重启先显旧建议再后台刷新；
- 可选观测：调用日志 `userData/insight-log.jsonl`。

**已拍板（D1–D6，2026-09-23 用户全部同意）**

- D1 开关：跟随「启用 AI」，不加新设置；D2 模型：跟随当前选中模型；D3 视觉：✦+「AI 建议」+ 描边浅底（第四轮细化）；D4 失败完全静默；D5 prompt 允许 AI 起草、主进程追加安全后缀「如需新增或修改事项，请只生成等待我确认的建议」；D6 本地规则保留为兜底。

## 实现要点

- 新：`electron/insight.ts`；
- 改：`electron/main.ts`（触发器 + IPC）、`electron/ai.ts`（装配复用导出）、`shared/contracts.ts`（`InsightSuggestion` 增 `source/generatedAt` + 新通道 `insight:suggestion`/`insight:refresh`）、`electron/preload.ts`、`src/MiniCard.tsx`（`aiSuggestion ?? insightTarget` + `is-ai` 类 + `{min}` 替换 + 预览文案）、`src/mini-card.css`（`.mini-insight.is-ai`）；
- 测试：fake SSE 三分支（合法 JSON 生效 / 无效 taskId 回退 / 超时回退）+ 节流单测（哈希不变不调用）+ `{min}` 替换单测；`npm test` + build + smoke；UX-CONTRACT「小卡片 AI」行与 CHANGELOG 同步；
- 风险：主进程新增一条对外请求路径——三层防刷（哈希+防抖+退避）为验收项。

## 决策记录

- 2026-09-23 建档：D1–D6 用户全部同意；第四轮拍板标签方案（本地「建议」/ AI「✦ AI 建议」）、预览文案改写（讲清点击后会发生什么）、引导条同步；条内短语预算收紧（≤8 字，场景化长理由进 prompt）。
- 2026-09-23 **spec 门**：`deny:ui` → `HUMAN_REVIEW`（UI 类硬政策），置 spec待审；mockup 已随里程碑评论内联。

- 2026-09-23 **批准**（issue 评论 `/approve` 09:47，来源:用户(/approve)）：spec 获批，进入实现排队（0.6.0 线顺序 #17 → #18 → #19 → #21）。
- 2026-09-23 **实现交付**（`beb97bb` @ sdd/0021，7 文件 +208/−8）：①新增 electron/insight.ts——generateInsight 单次补全（Pi 会话无工具循环、10s 预算）+ parseInsightReply（zod 严格校验、容忍 fenced JSON、未知 taskId 回退）+ insightTasksHash；②main.ts 调度接入 changed()——90s 防抖、60min TTL、跨天强制、连续失败退避 5/15min、单飞锁、重试 1 次后静默回退 insightTarget，结果持久化 insightSuggestion 并经 settings().insight 下发；③MiniCard——AI 建议优先（is-ai 描边浅底 + ✦「AI 建议」，本地兜底标「建议」），{min} 本地替换（renderInsightContext），引导条不再借用 AI 名义；④tests/insight.test.ts 解析/回退/占位/哈希 4 条，全套 41/41。验证：tsc 清零 · build · smoke passed。**尺寸阶自检**：is-ai 仅复用既有 --accent/--accent-soft 色板与行高，无新增尺寸。**待补（下轮）**：真机三态截图（AI 版/本地兜底/未配置引导）→ accept 门 → 交付评论。
- 2026-09-23 **实现交付**（`beb97bb`+`db99e7f` @ sdd/0021）：真机四态证据 21-insight-off/21-insight-ai/21-insight-ai-open/21-insight-local（capture-insight.mjs 入库，含安全后缀与标签断言）。
- 2026-09-23 **accept 门（Jev v3）**：HUMAN_REVIEW——deny:type（功能类转人工验收）。输入留档 `jev-accept-input.json`。
- 2026-09-23 **交付评论已发**（四图 --attach 内联）：[#21 交付评论](https://github.com/zhshenry/To-Do-List/issues/21#issuecomment-5796705276)。**待用户 /approve 后走预合并八步合入**（正文留档 `delivery-body.md`）。
- 2026-09-23 **验收反馈修订**（issue 评论 22:34，来源:用户(聊天→修订)）：用户指出展开预览态的 ✦ AI 建议条未占满一横且与预览卡无间隙——修复 `.mini-insight.is-open { width:100%; margin-bottom:8px }`（`87d323a`），重拍 21-insight-ai-open 合格，已回复请复验（[修订回复](https://github.com/zhshenry/To-Do-List/issues/21#issuecomment-5798113428)）。
- 2026-09-23 **复验通过 + 预合并**（issue 评论 `/approve` 23:57，来源:用户(/approve 复验)）：先叠合 main@516d304 预解 CHANGELOG/contracts/main.ts/mini-card.css 四处冲突（双方新增全保留，stack `d633da0`，堆叠后 tsc 清零 51/51）→ `_integrate` 试合（tree `258191a9`）→ 主干合并 `a45f5a9`（树哈希一致）→ build + 冒烟全绿 → 分支 sdd/0021 删除、worktree 清理、关单归档。
## 验收记录

（待实现后填写）
