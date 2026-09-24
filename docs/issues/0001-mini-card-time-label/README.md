# Issue #1：收起状态下的卡片日期展示优化

- Issue：<https://github.com/zhshenry/To-Do-List/issues/1>
- 建档：2026-09-21
- 状态：已归档
- 类型：优化
- 涉及UI：是
- 分支：sdd/0001（worktree `../To-Do-List-sdd/0001`）

## 背景（issue 要点 + 代码勘察结论）

**用户诉求**（issue 原文）：收起状态卡片右上角当前有个时间，在时间前加上「完成时间」四个字，与日期大小一致，可以加粗。

**代码勘察**（2026-09-21）：

- 右上角时间渲染于 `src/MiniCard.tsx:458`：`<span className="corner-time">{dueLabel}</span>`，`dueLabel = scheduleStamp(current)`（`src/MiniCard.tsx:432`）。
- `scheduleStamp`（`shared/format.ts:10`）：有 `dueAt` 显示「M/D HH:mm」，否则只显示「M/D」。
- **语义核对（关键发现）**：该时间是当前事项的**截止时间/计划日期**，不是"已完成的时间"。经 issue 附图核对（未完成待办「完成 DAMA BOOK 学习」，勾选框为空、绿色待办徽章，右上角 `9/30 23:59` = 其截止时间），用户要的「完成时间」前缀应理解为**「要完成的时间/完成期限」**的标签——语义成立。
- 样式：`.corner-time`（`src/mini-card.css:47`）10px、`--muted`、tabular-nums；超期态 `.overdue` 红色加粗。
- **与 0.5.6 在途工作重叠**：`MiniCard.tsx`、`mini-card.css` 均不在主工作区未提交改动清单中，本 issue 与在途工作**零重叠**，可独立实现。

## 方案（mockup 见 [time-label-proposal.png](./time-label-proposal.png)，1:1 真实令牌渲染）

**主决策——前缀字重（二选一）**：

- **方案 A（推荐）**：「完成时间」前缀**加粗**（600），时间保持常规字重，10px 同字号——标签与数字有节奏区分，存在感适中。
- **方案 B**：前缀不加粗，整体更轻，但标签易被忽略。

**边界情形（两个建议，请确认）**：

1. **日程卡不加前缀**：日程（meeting）显示的是**开始时间**，标「完成时间」语义错，建议维持裸时间（mockup 第二行中卡）。
2. **无具体时间的待办保持一致**：只有日期（如 `10/8`）时同样加前缀，读作「完成期限 10/8」（mockup 第二行右卡）。
3. 超期态沿用现有红色加粗整体样式，前缀跟随，不新增样式规则。

## 决策记录

- 2026-09-21 建档：待 spec 审批（方案 A/B 选择 + 边界 1/2 确认）。
- 2026-09-21 批准（聊天，用户原话：「主决策现状 → 方案 A（前缀加粗）；日程的时间前面加个开始时间」）：
  - 主决策选**方案 A**（前缀加粗 600）；
  - **边界 1 被推翻**：日程卡同样加前缀，文案为「**开始时间**」；
  - 边界 2（无具体时间待办同样加前缀）未被反对，按建议执行（待办文案恒为「完成时间」）；
  - 边界 3（超期态沿用红色整体样式）未被反对，按建议执行。
- 2026-09-21 存量冒烟断言处置（聊天，用户：「修复下……并入」）：`ux-smoke.mjs` 与已发布 UI 的两处失配一并并入本分支修复（0.5.5 起模型行按钮 20px、0.5.6 起设置底部按钮「保存」），commit `847dec1`。
- 2026-09-21 验收打回（聊天 + 截图）：日程卡圆形按钮里的摄像头图标与圆框贴边，视觉太满——缩小图标留出呼吸空间，修复后重新交付。
- 2026-09-21 验收二审（聊天，用户：「这个视频这个图标是不是可以不要了」）：**删除日程摄像头图标**。理由（与用户一致）：① 打开编辑与点标题同效，按钮无独立功能；② 日程类型已由左上角「日程」徽章表达。删后日程标题占满整行，无功能损失。
- 2026-09-21 **验收通过**（聊天，用户「ok」）：issue #1 以 completed 关闭（任务代关 + 收尾评论），档案归档。分支 `sdd/0001` 原地保留，等用户合入（`git merge --no-ff sdd/0001`，建议合入后 `git worktree remove ../To-Do-List-sdd/0001` 并删分支）。

## 实现要点（动哪些文件、接口、风险）

- `src/MiniCard.tsx`（corner-time 一处）：待办（`kind === 'task'`）时在 `dueLabel` 前渲染 `<span className="time-label">完成时间</span>`；日程不加。纯渲染层改动，无 IPC、无契约变更。
- `src/mini-card.css`：新增 `.corner-time .time-label { margin-right: 3px; font-weight: 600; }`（方案 A；若选 B 去掉 font-weight）。无新设计令牌。
- 测试：为时间标签补组件断言（待办有前缀、日程无前缀）；`npm test` + `npm run build` 全绿，`npm run test:desktop` 冒烟覆盖收起卡。
- 实现于 worktree 分支 `sdd/0001`（基于 main HEAD）；CHANGELOG 记入「未发布」小节。
- 风险：极低——单点渲染改动；唯一注意窄宽度下前缀+时间约 100px，卡片 212px 宽度足够（mockup 已按真实宽度验证无溢出）。

## 验收记录

- **交付 commit**：`d0e78bd`（本体）+ `847dec1`（冒烟对齐）+ `197f01c`（图标缩距）+ `46b9279`（删除日程图标，验收二审终局）@ `sdd/0001`。核心改动：`shared/format.ts`（新增纯函数 `stampLabel`）、`src/ui.tsx`（re-export）、`src/MiniCard.tsx`（corner-time 渲染前缀；移除日程摄像头按钮与 `VideoCamera` 引用，日程标题占满整行）、`src/mini-card.css`（`.corner-time .time-label` 加粗规则；`.front-main.is-meeting` 单列布局；清理 `.mini-kind-button` 三条规则）、`tests/ui.test.ts`（标签断言）、`CHANGELOG.md`（[未发布] 条目）。
- **最终行为**（按批准决策）：收起卡片右上角时间前渲染同字号（10px）加粗前缀——待办「完成时间」、日程「开始时间」；超期态沿用红色整体加粗；`mini-home-with-insight` 紧凑变体（9px）同样生效。
- **验证结果**（随 `197f01c` 后全绿）：
  - `npm test`：**33/33 通过**（含新增 `corner time label names completion for tasks and start for meetings`）；
  - `npm run build`：通过（tsc --noEmit + vite；chunk >500kB 警告为 0.5.x 既有提示）；
  - `npm run test:desktop`：**通过（result: passed）**。首跑暴露两处脚本与已发布 UI 的存量失配（均先于本分支存在于 main，经 CHANGELOG 与源码核实后修复）：① 模型行按钮断言 24×24，实装自 0.5.5 起为 20px；② 设置底部按钮等待「完成」，0.5.6 起实为「保存」（`SettingsPanel.tsx:404`）。修复仅动 `tooling/ux-smoke.mjs` 两行。
- **图标贴边修复（`197f01c`）→ 删除（`46b9279`，终局）**：日程圆形按钮内摄像头图标先由 14px 缩至 11px，用户二审仍觉别扭，定局**整个删除**——按钮功能与点标题重复（同为打开编辑），日程类型已由「日程」徽章表达；`.front-main.is-meeting` 单列布局让日程标题占满整行，`.mini-kind-button` 样式与 `VideoCamera` 引用一并清理，无功能损失。
- **本地验证方法**：默认看下方真实应用截图（用户本地常驻实例无法另开）；有疑义先退出常驻实例再 `cd ../To-Do-List-sdd/0001 && npm start`。

### 真实应用验证截图（worktree 构建，2026-09-21）

| 待办卡 | 日程卡 |
|---|---|
| ![待办：完成时间 9/21 23:59](./verify-collapsed-todo.png) | ![日程：开始时间 9/21 21:00](./verify-collapsed-meeting.png) |

- 左图：待办「完成 DAMA BOOK 学习」，右上角「**完成时间** 9/21 23:59」——前缀加粗、与时间同字号，绿色待办徽章。
- 右图：日程「周会：数据复盘」，右上角「**开始时间** 9/21 21:00」——日程文案按批准决策使用「开始时间」，蓝灰日程徽章 + 视频图标。
- 截取自 worktree 构建产物（playwright 启动、临时数据目录，未触碰用户真实数据库）。
- **合入提示**：main 已含 0.5.6 提交（db00553），工作区若干净可随时 `git merge --no-ff sdd/0001`（含 `d0e78bd` 功能 + `847dec1` 冒烟对齐两个提交）；CHANGELOG 需手工把 [未发布] 条目归并进版本小节（可能有少量冲突）。
