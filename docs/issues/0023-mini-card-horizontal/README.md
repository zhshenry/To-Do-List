# Issue #23：折叠状态下的AI应用卡片的下面标签、时间等卡片内容是往下滚动的

- Issue：<https://github.com/zhshenry/To-Do-List/issues/23>
- 建档：2026-09-24
- 状态：已归档（合入 4c1b6dd）
- 类型：优化
- 涉及UI：是
- 影响面：参数（仅调整卡片内 meta 行排布与容器高度数值，不改交互）
- 分支：sdd/0023（已删，stack `e56a0ba` 后合并）

## 背景（issue 要点 + 勘察结论）

**用户诉求**（附截图）：折叠卡 AI 确认态卡片中，长标题换行后「标签」「时间」各占一行把 footer（放弃/应用）推出卡片底缘、需往下滚动才能看到；右侧本有空白，建议「标签/时间」**横向排布**，争取不用滚动。

**勘察**（main `a45f5a9`，用户截图存档 [user-report.png](./user-report.png)）：

- 该卡片 = 折叠卡 AI 确认态（`AIConversation compact` 的 pendingEntry 视图）：`proposalTaskLabels` 把 `categoryId→标签`、`dueAt→时间` 作为两条独立字段行渲染（每行 `proposalFieldLabel + 值`）；
- 长标题在标题行换行后，卡片固定高（compactHeight 确认态）内纵向空间不足 → footer 被推出视口。

## 方案（mockup 见 [23-horizontal-proposal.png](./23-horizontal-proposal.png)；现状对照 [23-current-compare.png](./23-current-compare.png)）

- **横排 meta 行**：「标签：个人开发」「时间：9/23 23:59」合并为一条横向 meta 行（`标签 · 时间` 同行、muted 弱化、`·` 分隔），置于标题行正下方；
- 确认态卡片纵向只占 标题行 + meta 行 + footer 三段，**无需滚动**；长标题仍换行（标题行 max 2 行，超出省略）；
- 仅改折叠卡确认态的 meta 排布，展开态与其他视图不动。

**数值验收标准**（快车道契约）：

- 确认态卡片内容总高 ≤ 卡片可用高（footer 完整可见、页面 scrollHeight 无纵向溢出，实测差值 = 0px）；
- meta 行为单行（`标签：…` 与 `时间：…` 同行，高度 = 一行文字 ≈ 15px ± 3px）；
- 长标题（≥20 字）场景标题行最多 2 行，第三行省略号截断。

## 实现要点

- `src/AIConversation.tsx`：compact 确认态 proposal 字段渲染合并 `标签/时间` 为单行 meta 行（横排、`·` 分隔）；
- `src/mini-card.css` / `src/assistant-updates.css`：meta 行样式 + 卡片纵向空间收紧；
- 测试：`{min}`/meta 渲染相关既有回归 + 新增横排断言（若可 DOM 级断言）；`npm test` + build + smoke；真机截图（长标题场景）；
- CHANGELOG：[未发布] 一条；
- 风险：低——单视图排布调整。

## 决策记录

- 2026-09-24 建档：横排 meta 方案（用户提议「横向排布、争取不用滚动」）；数值验收标准三条随 spec 附上（快车道契约——若用户批准时未声明保留人工验收且机械条件满足，accept 走快车道）。
- 2026-09-24 **批准**（issue 评论 `/approve` 09:13，来源:用户(/approve)）：spec（横排 meta + 数值验收标准）获批，进入实现排队。
- 2026-09-24 **实现交付**（`1500721`+CHANGELOG @ sdd/0023）：MiniProposal 行渲染合并为 `.mini-proposal-meta` 单行（flex-wrap、muted、· 分隔、before 值删除线）；capture-horizontal.mjs 真机断言（meta 单行 ≤18px + footer 完整 + 无纵向溢出）全过，23-horizontal-meta.png 合格。验证：51/51 · build · smoke。**尺寸阶自检**：meta 字号 --fs-compact(11)、行高 1.4≈15px、分隔色 #d8d0c6 沿用既有；无阶外新增。
- 2026-09-24 **accept 门（Jev v3）**：HUMAN_REVIEW——deny:ui 快车道机械条件过但语义命题偏低：A2_matches_spec=0.41、A5_regression_covered=0.14（横排合并无专项单测——已在交付评论中披露）、A6_scope_contained=0.86、A8_evidence_sufficient=0.63；首跑 RETRY（CHANGELOG 漏项）已补。输入留档 `jev-accept-input.json`。
- 2026-09-24 **交付评论已发**（三图内联）：[#23 交付评论](https://github.com/zhshenry/To-Do-List/issues/23#issuecomment-5806500281)。**待用户 /approve 后走预合并八步合入**。
- 2026-09-24 **验收通过 + 预合并**（issue 评论 `/approve` 11:34，来源:用户(/approve 验收)）：先叠合 main@97e2297 预解 CHANGELOG/mini-card.css 两处冲突（双方新增全保留，stack `e56a0ba`，堆叠后 tsc 清零 53/53）→ `_integrate` 试合（tree `09a5aa15`）→ 主干合并 `4c1b6dd`（树哈希一致）→ build + 冒烟全绿 → 分支 sdd/0023 删除、worktree 清理、关单归档。
## 验收记录

（待实现后填写）
