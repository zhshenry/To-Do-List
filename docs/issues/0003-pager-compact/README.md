# Issue #3：收起状态下的卡片展示图标优化（翻页区紧凑化）

- Issue：<https://github.com/zhshenry/To-Do-List/issues/3>
- 建档：2026-09-21
- 状态：已归档
- 类型：优化
- 涉及UI：是
- 分支：sdd/0003（worktree `../To-Do-List-sdd/0003`，基于 main `f833086`）

## 背景（issue 要点 + 代码勘察结论）

**用户诉求**（issue 原文 + 红框截图）：页数计数与上下翻页钮（「2 / 2 ˄ ˅」）再紧凑一点。

**代码勘察**（2026-09-21，基于 `sdd/0002` 现状）：

- 翻页区样式 `.mini-deck-pager`（`src/mini-card.css`）：按钮 18×18、按钮间 gap 2px、计数 `padding-right: 3px`、字号 10px；箭头图标 10px。
- 该区域与 #2 动效改动同文件同区段（front-meta 内），实现分支继续堆叠。

## 方案（A/B 对比见 [pager-compact-proposal.png](./pager-compact-proposal.png)，含 4× 放大）

三处参数收紧，其余不动：

| 参数 | 现状 | 提案 |
|---|---|---|
| 翻页按钮尺寸 | 18×18 | **16×16** |
| 按钮间 gap | 2px | **1px** |
| 计数右留白 | 3px | **1px** |

- 字号 10px、箭头 10px 不变（16px 按钮内容仍居中）；鼠标热区 16px 足够；
- 整块宽度约省 8px，收卡右缘与右上角时间的右对齐更齐整。

## 决策记录

- 2026-09-21 建档：待 spec 审批（参数如表，默认按推荐执行）。
- 2026-09-21 批准但加严（聊天，用户：「可以再紧凑点」）：在 16px 方案上再紧一档，终版参数——按钮 **14×14**、按钮间距 **0**、计数留白 **0**、箭头图标 10→**9px**（三者连成一体呈步进器形态）；字号 10px 不变。
- 2026-09-21 **验收通过**（聊天，用户「可以」）：issue #3 以 completed 关闭（任务代关 + 收尾评论），档案归档。分支 `sdd/0003` 原地保留，等用户合入指令。

## 实现要点（动哪些文件、接口、风险）

- `src/mini-card.css` 仅 3 条声明改值：`.mini-deck-pager { gap: 2px→1px }`、`.mini-deck-pager > span { padding-right: 3px→1px }`、`.mini-deck-pager button { width/height 18px→16px }`。
- 测试：`npm test` 回归 + `npm run build` + `npm run test:desktop`；真机前后截图对比。
- CHANGELOG：并入 [未发布] 收起卡片条目或单列一条。
- 风险：极低——纯样式数值；hover 背景随按钮缩小自然收窄。

## 验收记录

- **交付 commit**：`a955f23` @ `sdd/0003`（基于 main `f833086`），3 文件 +5/−4：`src/mini-card.css`（翻页钮 14×14、去 gap 与计数留白）、`src/MiniCard.tsx`（翻页箭头 10→9px）、`CHANGELOG.md`（[未发布] 条目）。
- **最终参数**（按批准加严终版）：按钮 14×14、按钮间距 0、计数留白 0、箭头 9px、字号 10px——步进器形态。
- **验证结果**：`npm test` 33/33 · `npm run build` 通过 · `npm run test:desktop` **passed**。
- **真机截图**：整卡 ![紧凑后整卡](./pager-compact-real.png) · 翻页区 6× 放大 ![翻页区 6x](./pager-compact-zoom.png)——计数与双钮连成一体。
- **本地验证方法**：默认看上方真机截图；有疑义先退出常驻实例再 `cd ../To-Do-List-sdd/0003 && npm start`。
- **合入提示**：main 干净时 `git merge --no-ff sdd/0003`；合入后删分支、`git worktree remove ../To-Do-List-sdd/0003`。
