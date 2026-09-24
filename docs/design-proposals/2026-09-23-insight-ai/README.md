# AI 建议真 AI 化（折叠卡建议条 · 渐进式增强）

日期：2026-09-23 · 状态：**提案 / 高保真阶段，未写代码**
建议落位：0.6.0（#17/#18/#19）之后独立 issue（届时为 #20 insight-ai，类型 功能，涉及UI 是）

背景：折叠卡「AI 建议」条目前是**纯本地规则**（`shared/contracts.ts:179` `insightTarget`：日程 ≤60 分钟 → 待办 ≤90 分钟 → 今日 ≥3 项给排序建议），不调用模型。本方案让它真正用上 AI，同时保持"永不报错、永不空白、永不直接写数据"。

已拍板（2026-09-23 讨论，D1–D6 全部同意）：

- D1 开关：跟随现有「启用 AI」，不加新设置项；
- D2 模型：跟随当前选中模型，不设独立"建议模型"；
- D3 视觉：AI 生成建议 = ✦ sparkle 图标 + 「AI 建议」文字标签 + accent 描边浅底，200ms 过渡换入；**本地兜底与未配置引导的标签一律改为「建议」**（第四轮拍板：非 AI 生成不占用「AI 建议」名义）;
- D4 失败：完全静默回退本地规则；
- D5 prompt：允许 AI 起草个性化提问，但主进程统一追加安全后缀，守住"只生成待确认建议"红线；
- D6 本地规则保留为兜底。

## 方案（mockup 见本目录 PNG）

画板：[insight-local.png](./insight-local.png)（本地兜底=现状）· [insight-ai.png](./insight-ai.png)（AI 就位）· [insight-ai-open.png](./insight-ai-open.png)（展开预览）· [insight-off.png](./insight-off.png)（未配置引导，不变）

### 职责切分（核心设计）

| 职责 | 归属 | 理由 |
|---|---|---|
| 挑目标事项 | **AI** | 规则只看"最近截止"；AI 能看懂日程密度、事项被拖了多久 |
| 建议短语（context） | **AI**，可含 `{min}` 占位符 | 个性化场景感；数字永远新鲜（本地渲染时替换占位符） |
| 时间数字 | **本地**渲染时现算 | AI 写死分钟数半小时就过期；本地算不用为刷新数字重新调用 |
| 点击后的 prompt | **AI 起草** + 主进程安全后缀 | 从固定模板升级为"结合今天安排问对问题"；红线由后缀硬保证 |

AI 输出（单次补全，JSON，zod 严格校验）：

```json
{ "taskId": "必须∈今日剩余事项",
  "action": "prepare | next-step | reschedule | order | focus",
  "context": "≤8字短语 + 本地拼接「 · 距开始/截止约 {min} 分钟」（数字渲染时替换；AI 版条内空间有限，短语需精简）",
  "prompt": "≤80字，给对话助手的提问" }
```

任何校验失败（taskId 不存在 / 超长 / 解析不出）→ 静默回退 `insightTarget` 结果。建议条永不报错、永不空白。

### 通道：主进程单次补全（不走 Pi agent 工具循环）

- 新 `electron/insight.ts` `generateInsight()`：复用 `electron/ai.ts` 的 provider 装配（createAgentSession + `noTools:'builtin'` + systemPromptOverride，单轮、maxTokens ~300）；实现期核实 Pi 是否暴露更轻的 one-shot API，有则替换；
- 输入：**今日剩余事项紧凑清单**（id/标题/类型/截止/标签/优先级，非 120 项全量快照）+ 当前时刻，约 300–600 token；
- 单飞锁（独立于对话的 `activeRequest`）、10s 超时、失败重试 1 次、连续失败指数退避（5min→15min）；
- 密钥只在主进程（safeStorage），渲染层经 IPC 取结果，架构约束不变。

### 触发与节流（主进程持有）

- 相关状态哈希：剩余事项排序后 (id, status, dueAt, plannedDate, title)；
- 触发点：启动加载完成、`changed` 且哈希变且距上次 ≥90s、TTL 60 分钟、跨天；
- **不**在翻卡/开窗/每次显示时触发；
- 最近一次 AI 建议持久化（settings 独立键，含 generatedAt/model），重启先显旧建议再后台刷新；
- 可选观测：调用次数/耗时写 `userData/insight-log.jsonl`（同 notifications.jsonl 模式），便于核对成本。

### IPC 与契约

- `shared/contracts.ts`：`InsightSuggestion` 增 `source: 'ai' | 'local'`、`generatedAt?`；
- 新通道：`insight:suggestion`（主→渲染推送）、`insight:refresh`（渲染挂载拉取）；不动 `State` 与 ChatEntry。

### 渲染层（MiniCard）

- `suggestion = aiSuggestion ?? insightTarget(remaining, now)`；
- `source === 'ai'` → 建议条加 `is-ai` 类（✦ + 「AI 建议」标签 + 描边浅底 + 200ms 过渡，见画板 2）；`aria-label="AI 生成的建议"`；本地兜底/引导条标签为「建议」（画板 1/4）；
- `{min}` 占位符渲染时本地替换；「查看 / 调整 / 忽略 / 生成方案」交互与现状一致；**预览区文案改写**（第四轮）：标题「让 AI 助手处理这条建议」，说明「会针对『<事项名>』给出处理建议；改动先出建议卡，确认后才写入。」——讲清点击后会发生什么（画板 3）；「生成方案」发送 AI 起草的 prompt（主进程已追加安全后缀「如需新增或修改事项，请只生成等待我确认的建议」）；
- 与 #18/#19 的化学反应：目标事项自动作为 `taskId` 关联进对话；对话中 AI 不确定时用 `ask_user` 反问。

### 测试与验收

- fake SSE（`tests/ai.test.ts` 模式）：合法 JSON → 建议生效；taskId 无效 / 超时 / 非法 JSON → 回退本地；哈希不变 → 不发起调用（节流单测）；
- `npm test` + build + smoke 回归；UX-CONTRACT「小卡片 AI」行与 CHANGELOG 同步；
- 验收清单：四态降级链（AI 就位 / 生成中显示本地 / 失败静默停留本地 / 未配置引导不变）、数字新鲜度（改系统时间不重调模型也能刷新分钟数）、`{min}` 替换、忽略后本会话不再重生。

## 决策记录

- 2026-09-23 建档：D1–D6 用户全部同意；职责切分（AI 挑目标+写短语+起草 prompt，本地管数字与兜底）确认为核心设计；`{min}` 占位符方案随讨论确定。

## 实现要点（动哪些文件）

- 新：`electron/insight.ts`；
- 改：`electron/main.ts`（触发器 + IPC）、`electron/ai.ts`（装配复用导出）、`shared/contracts.ts`（类型 + 通道）、`electron/preload.ts`、`src/MiniCard.tsx`（建议来源切换 + is-ai 类 + `{min}` 替换）、`src/mini-card.css`（`.mini-insight.is-ai`）、`src/shared` 无关；
- 风险：主进程新增一条对外请求路径——三层防刷（哈希 + 防抖 + 退避）是验收项。
