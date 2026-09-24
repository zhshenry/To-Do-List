# Issue #20：AI助手对话框中，左侧AI助手的图标错位了

- Issue：<https://github.com/zhshenry/To-Do-List/issues/20>
- 建档：2026-09-24
- 状态：已归档（合入 57c653e）
- 类型：缺陷
- 涉及UI：是
- 分支：sdd/0020（已删）

## 背景（issue 要点 + 勘察结论）

**用户诉求**（附截图）：AI 助手对话框中，左侧 AI 助手图标错位——显示在**上一轮对话 AI 答复的底端**，而不是**这一轮 AI 答复的顶端**。

**勘察**（main `a45f5a9`，真机复现见 [20-avatar-defect.png](./20-avatar-defect.png)：四段长回复下头像沉底至「第四…」行旁）：

- 根因在 `src/styles.css:222`：`.chat-message-row { display: flex; align-items: flex-end; gap: 8px; }`——头像与气泡**底对齐**；
- 短回复时头像与文字基本平齐不易察觉；回复一旦变长（多段），28px 头像沉到气泡底部，视觉上脱离本轮答复顶端、像是挂在上一轮消息末尾；
- 用户气泡无头像，`align-items: flex-end` 对用户行仅影响气泡自身，不受影响。

## 方案（修复示意即 [20-avatar-defect.png](./20-avatar-defect.png) 反例，实现后同位置重拍对比图）

- 助手行改为**顶对齐**：`.chat-message.assistant .chat-message-row { align-items: flex-start; }`（新增一条覆盖规则，不改基线规则——用户行的底对齐语义保留）；
- 头像尺寸/间距不变（28px、gap 8px），仅垂直对齐位调整；
- 验证：真机同场景（短回复 + 四段长回复）重拍对比图，头像应钉在本轮 AI 答复首行旁；`npm test` + build + smoke 回归。

## 实现要点

- `src/styles.css`：新增一条覆盖规则（一行）；
- 测试：既有 53 条回归 + 真机对比截图；
- CHANGELOG：[未发布] 一条；
- 风险：低——纯 CSS 一行，无逻辑改动。

## 决策记录

- 2026-09-24 建档：缺陷类型；修复方案 = 助手行顶对齐（用户行不动）；真机缺陷现场已复现存档。
- 2026-09-24 **spec 门（Jev v2）**：HUMAN_REVIEW——deny:ui（涉及UI=是，mockup-first 硬政策），置 spec待审；缺陷现场图已随里程碑评论内联（[#20 评论](https://github.com/zhshenry/To-Do-List/issues/20#issuecomment-5800259948)）。输入留档 `jev-spec-input.json`。
- 2026-09-24 **批准**（issue 评论 `/approve` 09:13，来源:用户(/approve)）：spec 获批，当轮实现。
- 2026-09-24 **实现交付**（`45d5bf9` @ sdd/0020，styles.css 一行覆盖 + CHANGELOG）：助手行顶对齐；**数值口径修正**——答复行顶部含「AI 助手」说话人标签，头像与标签顶对齐即视觉正确（bubbleTop 差 21px 来自标签高度，非沉底），故断言基准改为答复行 top 偏差 ≤4px。验证：tsc 清零 · 51/51 · build · smoke passed · 真机断言通过（20-avatar-fixed vs 20-avatar-defect 对比留档）。
- 2026-09-24 **accept 门（Jev v3）**：HUMAN_REVIEW——快车道条件不满足（type/spec_numeric），UI 人工验收。输入留档 `jev-accept-input.json`。
- 2026-09-24 **交付评论已发**（前后对比双图内联）：[#20 交付评论](https://github.com/zhshenry/To-Do-List/issues/20#issuecomment-5806345883)。**待用户 /approve 后走预合并八步合入**（正文留档 `delivery-body.md`）。
- 2026-09-24 **验收通过 + 预合并**（issue 评论 `/approve` 10:32，来源:用户(/approve 验收)）：`_integrate` 试合 51/51（tree `4ed13d22`）→ 主干合并 `57c653e`（树哈希一致）→ build + 冒烟全绿 → 分支 sdd/0020 删除、worktree 清理、关单归档。
## 验收记录

（待实现后填写）
