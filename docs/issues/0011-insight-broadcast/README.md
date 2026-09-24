# Issue #11：收起状态下AI建议看不出来是什么内容

- Issue：<https://github.com/zhshenry/To-Do-List/issues/11>
- 建档：2026-09-22
- 状态：已归档
- 类型：优化
- 涉及UI：是
- 分支：sdd/0011（基于 main `f94e3ae`）

## 背景（issue 要点 + 勘察结论）

**用户诉求**（issue + 两张截图）：① 收起卡 AI 建议条看不出是什么内容；② 切换卡片后建议就消失了——用户预期它是「类似广播的东西，不随下面的卡变化」。

**勘察**（main `f94e3ae`）：

- ① 内容不可读的根因：`insightFor` 返回拼接长句（如「先拆出『<事项名>』的下一步」），建议条 `<b>` 单行截断（`mini-card.css:106`）——事项名嵌在句中，长名一截断就失去指向；
- ② 翻页即消失的根因：`suggestion = insightFor(current, …)`（`MiniCard.tsx:339`）按**当前卡**计算；`insightFor` 仅在「日程 ≤60 分钟 / 待办 ≤90 分钟 / 总数 ≥3」时返回建议，翻到不满足条件的卡 → null → 整条消失（`showInsight` 联动）；
- 现状真机佐证见 issue 截图与 A/B 图 A 侧。

## 方案（A/B 对比见 [insight-broadcast-a-b.png](./insight-broadcast-a-b.png)）

对应两条诉求的 v1 提案：

1. **广播化（诉求②）**：建议目标从「今日全部未完成事项」全局挑选，不随翻页变化——优先级：最紧急的有截止**日程**（距开始 ≤60 分钟）→ 最紧急的有截止**待办**（距截止 ≤90 分钟）→ 今日未完成 ≥3 项时给「排序建议」；均不满足则不显示（保持现有空态逻辑）。`insightFor(task,…)` 重构为 `insightTarget(tasks, now)` 返回 `{task, action, context, prompt}`；
2. **内容可读（诉求①）**：建议条改两段式——`<b>` = **目标事项名**（1 行截断），`<small>` = 动作短语 + 时间（如「先拆出下一步 · 距截止约 45 分钟」）；「查看 / 生成方案 / 调整 / 忽略」交互与现有 prompt 组装全部保留（prompt 本就按目标事项生成）；
3. 展开态、卡面布局、其余 AI 流程零改动。

## 实现要点

- `src/MiniCard.tsx`：`insightFor` → `insightTarget`（全局挑选 + 结构化返回）；`:339` 建议计算改用全局结果；`:486-489` 建议条渲染改两段式。
- `src/mini-card.css`：`<b>/<small>` 宽度分配微调（事项名优先占宽）。
- 测试：新增 `insightTarget` 挑选顺序单测（日程临近 > 待办临近 > 排序建议 > 空）；`npm test` + build + smoke 回归。
- CHANGELOG：[未发布] 一条。
- 风险：低——仅收起卡建议层，不动数据与 AI 请求链路。

## 决策记录

- 2026-09-22 建档：诉求②用户已给出方向（广播式），诉求①收敛为「事项名为主、动作为辅」两段式；无其它开放决策点。
- 2026-09-22 **spec 门**：`deny:ui` → `HUMAN_REVIEW`（UI 类硬政策，未调用 Jev，无概率表），置 spec待审。
- 2026-09-22 **批准**（issue 评论 `/approve` 22:40，来源:用户(/approve)）：按广播化 + 两段式方案实现。
- 2026-09-22 **accept 门**：`deny:ui` → `HUMAN_REVIEW`（UI 类不自动放行，未调用 Jev，无概率表）。
- 2026-09-22 **验收通过 + 预合并**（issue 评论 `/approve` 23:18，来源:用户(/approve)）：状态核验（head `fe6ba81`/base `f94e3ae` 未漂移）→ `_integrate` 试合 + 37/37 → 树哈希一致（`65e21ae`）→ 主干合并 `776c38a` → 合并后先 build 再冒烟 passed。分支/工作树清理完成，关单归档。

## 验收记录

- **交付 commit**：`fe6ba81` @ `sdd/0011`（基线 main `f94e3ae`），5 文件 +59/−32：`shared/contracts.ts`（新增可单测纯函数 `insightTarget`：临近日程 ≤60 分钟 > 临近待办 ≤90 分钟（含逾期「重新安排」）> ≥3 项排序建议）、`src/MiniCard.tsx`（删除按当前卡计算的 `insightFor`，建议改全局挑选，翻页不消失）、`src/mini-card.css`（建议条两段式宽度：事项名优先占宽、动作段封顶 50%）、`tests/store.test.ts`（新增挑选顺序单测）、`CHANGELOG.md`。
- **验证**：`npm test` 37/37（新增 6 断言用例；首跑出现 1 次未复现的偶发失败，连跑两次稳定全绿）· `npm run build` · `npm run test:desktop` **passed**。
- **真机证据**：![卡1 建议条](./verify-insight-card1.png)（两段式：事项名粗体为主 + 「先拆出下一步 · 距截止约 45 分钟」）· ![翻到卡2](./verify-insight-card2-persist.png)（第 2 张卡无截止时间，旧逻辑下建议会消失，现保持同一条——广播化达成，程序断言通过）。截图脚本 [capture-real.mjs](./capture-real.mjs)。
- **Jev accept 门**：`deny:ui` → `HUMAN_REVIEW`（UI 类人工终审，来源:jev(v2, deny:ui 未调用命题)）。
