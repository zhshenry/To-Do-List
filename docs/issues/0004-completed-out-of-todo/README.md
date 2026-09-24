# Issue #4：已完成的任务还在待办里面，原则上应该只在事项库了

- Issue：<https://github.com/zhshenry/To-Do-List/issues/4>
- 建档：2026-09-21
- 状态：已归档
- 类型：缺陷
- 涉及UI：否（列表构成行为修正，无新增视觉设计）
- 分支：sdd/0004（worktree `../To-Do-List-sdd/0004`，基于 main `499992f`）

## 背景（issue 要点 + 代码勘察结论）

**用户诉求**（issue + 截图）：展开主界面的待办卡里，已完成事项（勾选划线态）仍然占位显示；已完成的应该只去事项库。

**代码勘察**（2026-09-21，main `f833086`）：

- 根因 `src/App.tsx:183`：待办卡只按类型过滤 `todayItems.filter(task => task.kind === 'task')`，未排除 `status === 'done'`；`activeToday`（`shared/contracts.ts:170`）只把已完成**排序到末尾**并不剔除，于是划线显示（`styles.css` `.plan-item.is-done`）。
- 事项库本来就有「未完成 / 已完成 / 已删除」筛选（`TaskLibrary.tsx:8`），已完成事项移出待办卡后**不会失联**。
- 其余消费方已各自排除 done：MiniCard 叠层（`MiniCard.tsx:332` `filter(status !== 'done')`）、到期提醒（`App.tsx:92`）——本次改动不影响它们。
- 冒烟「批量完成/恢复」流程全程在事项库内断言状态，与待办卡列表无关，不受影响（已核对 `ux-smoke.mjs:206-226`）。

## 方案

**待办卡立即移除已完成事项**（`App.tsx:183` 加 `&& task.status !== 'done'`）。配套两个小点，随本单一并处理：

1. **顺手去重（低风险）**：MiniCard 的 `activeToday(...).filter(status !== 'done')` 与本改动是同一语义——抽为共享纯函数 `openToday(tasks, today)`（`shared/contracts.ts`，= activeToday + 剔除 done），两处共用，并补单元测试（有测试目标正是这个抽法的价值）。MiniCard 行为不变，纯重构。
2. **日程卡同样处理（建议，待确认）**：日程卡 `meetings`（`App.tsx:184`）存在同样问题——完成的日程也会划线占位。按「已完成只在事项库」原则建议一并剔除；若你想保留当日已完成日程作参考，此条不做，只改待办卡。

**行为后果提示**（知情确认）：在主界面勾选完成某行后，该行**立即消失**（不再有划线停留）；误勾恢复路径 = 事项库 → 已完成 → 恢复。迷你卡完成本来就是二次确认 + 翻页，无此问题。

## 决策记录

- 2026-09-21 建档：待 spec 审批（默认含日程卡一并剔除 + openToday 抽取）。
- 2026-09-21 spec 门（Jev v1 预检）：HUMAN_REVIEW——S3 检出两个开放决策点（0.93），等用户。
- 2026-09-21 **批准**（GitHub 评论 `/approve`，评论 id 5756163548，经 issue-commands.mjs 代码验证）：① 日程卡同样剔除已完成 = **是**；② 空态文案改「今天全部完成」= **不用**。openToday 抽取按 spec 执行。同日 Jev v2 引擎上线，本单成为 accept 门 v2（证据自采）首个实战对象。
- 2026-09-21 **验收通过 + 预合并首演**（聊天，用户「同意」）：`--verify` 四哈希一致 → `_integrate` 临时 worktree 试合 + npm test 34/34 → 树哈希一致（`fffa11e`）→ 主干合并 `fd09eac` → 合并后冒烟 passed → 删分支/worktree → 关单归档。主干零污染窗口全程成立。

## 实现要点（动哪些文件、接口、风险）

- `shared/contracts.ts`：新增 `openToday()`（含 JSDoc 一行）；`tests/store.test.ts` 补两条断言（done 被剔除、排序保持）。
- `src/App.tsx:183`：`todos` 改用 `openToday`；`meetings` 视批准结果同样处理。
- `src/MiniCard.tsx:332`：`remaining` 改用 `openToday`（行为不变）。
- 验证：`npm test`（含新断言）+ `npm run build` + `npm run test:desktop`；真机截图：完成一项前后待办卡对比。
- CHANGELOG：[未发布] 记一条。
- 风险：低——过滤条件收紧，无数据/契约变更；注意待办卡清空时的空态文案是否仍通顺（「点击 + 添加…」在"都做完了"的场景下稍显误导，可顺带改为「今天全部完成 🎉」类文案——**可选**，spec 阶段一并定）。

## 验收记录

- **交付 commit**：`e78e440` @ `sdd/0004`（基于 main `499992f`），5 文件 +25/−8：`shared/contracts.ts`（新增 `openToday()`）、`src/App.tsx`（待办/日程卡与 currentId 改用 openToday——两类卡都剔除已完成，按批准决策①②；空态文案未动，按决策③）、`src/MiniCard.tsx`（remaining 同源）、`tests/store.test.ts`（新断言：done 剔除 + activeToday 保留）、`CHANGELOG.md`。
- **验证**：`npm test` **34/34**（含新断言，首跑失败为测试夹具漏 `completedAt`，修正后全绿）· `npm run build` · `npm run test:desktop` **passed**。
- **Jev accept 门 v2**（引擎自采真实 diff + 自跑 npm test + 哈希绑定，首个实战）：`HUMAN_REVIEW`——A2_matches_spec=0.81（复核带）、A5_regression_covered=0.92、A6_scope_contained=0.97；base `499992f` → head `e78e440`，policy `3f67d1d1`。
- **验收方式（严格制）**：评论 `/approve` 或聊天说验收通过；合并将走第 6 节预合并流程（哈希重验 → 临时 worktree 预合并测试 → 树哈希一致 → 主干合并 → 冒烟 → 清理 → 关单）。
