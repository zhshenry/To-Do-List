# Issue #13：在鼠标放到向上切换的按钮时，能看到这个按钮和隔壁的页码有重叠

- Issue：<https://github.com/zhshenry/To-Do-List/issues/13>
- 建档：2026-09-22
- 状态：已归档
- 类型：优化
- 涉及UI：是
- 分支：sdd/0013（基于 main `c49d633`）

## 背景（issue 要点 + 勘察结论）

**用户诉求**（issue + 截图）：悬停「上一项」按钮时按钮底色与页码重叠；希望页码与上下切换按钮之间隔开一点（或按钮整体右移）。

**勘察**（main `776c38a`）：

- 根因：`.mini-deck-pager`（`mini-card.css:71`）**没有任何间距**——#3 紧凑化时「页码 | 上一项 | 下一项」三元素连成步进器形态，页码与按钮零间距；
- 悬停态 `button:hover` 有 `accent-soft` 14px 圆角底色（`mini-card.css:74`），零间距下圆角块直接贴住「1 / 2」字形，即用户看到的「重叠」。

## 方案（v3 真机对照见 [13-hover-before.png](./13-hover-before.png) / [13-hover-after.png](./13-hover-after.png)）

- 仅加一行 CSS：`.mini-deck-pager > span { margin-right: 5px; }`——页码与按钮组之间 5px 呼吸位（真机实测 0px → 5px）；
- **两枚按钮之间保持 0 间距**，不破坏 #3 定下的步进器连体形态；不采用「整体右移」（按钮已由 `margin-left:auto` 贴右缘，右移会造成底行右侧失衡）。

## 实现要点

- `src/mini-card.css`：`:72` 后加一行。仅此一处。
- 验证：`npm test` + `npm run build` + `npm run test:desktop` 回归；真机悬停态截图。
- CHANGELOG：[未发布] 一条。
- 风险：极低。

## 决策记录

- 2026-09-22 建档：用户给了两个方向（加间距 / 整体右移），取「加间距」——步进器形态是 #3 的既定设计，只断开「读数 | 操作」的分组边界。
- 2026-09-22 **spec 门**：`deny:ui` → `HUMAN_REVIEW`（UI 类硬政策，未调用 Jev，无概率表），置 spec待审。
- 2026-09-22 **/reject（issue 评论 23:52，来源:用户(/reject)）**：意见「上一项|下一项两个按钮高度不一致」——系 v1 mockup 手绘箭头（CSS border 旋转 + translate）尺寸失真，非提案本身问题（真实应用两按钮同为 14px 等高方盒）。v2 改用内联 SVG 等尺寸重绘。
- 2026-09-23 **/reject（issue 评论 00:01，来源:用户(/reject)）**：意见「v2 连两个按钮都没显示了」——v2 的 SVG 箭头 9px 灰线对比度过低，静态图里几乎不可见。连续两版手绘失真，**v3 放弃画图，改用真机截图**：构建产物上 playwright `hover` 实拍悬停态（before），运行时 `addStyleTag` 注入 5px 规则再实拍（after，仅会话内样式，不改仓库代码）——程序实测间距 **0px → 5px**（capture-real.mjs）。方案本身两版未变。
- 2026-09-23 **批准**（issue 评论 `/approve` 00:08，来源:用户(/approve)）：按 v3 真机对照方案实现（页码后 5px）。
- 2026-09-23 **accept 门**：`deny:ui` → `HUMAN_REVIEW`（UI 类不自动放行，未调用 Jev，无概率表）。
- 2026-09-23 **验收通过 + 预合并**（issue 评论 `/approve` 00:22，来源:用户(/approve)）：状态核验（head `d0d9897`/base `c49d633` 未漂移）→ `_integrate` 试合 + 37/37 → 树哈希一致（`09cbf45`）→ 主干合并 `50781b7` → 合并后先 build 再冒烟 passed。分支/工作树清理完成，关单归档。

## 验收记录

- **交付 commit**：`d0d9897` @ `sdd/0013`（基线 main `c49d633`），2 文件 +2/−1：`src/mini-card.css`（`.mini-deck-pager > span` 加 `margin-right: 5px`）+ `CHANGELOG.md` 一条。
- **验证**：`npm test` 37/37 · `npm run build` · `npm run test:desktop` **passed**。
- **真机截图**：![交付悬停态](./13-delivered-hover.png)——悬停底色与页码明确分离，程序断言间距 **5px**（此前 0px）；两枚按钮等高连体（步进器形态不变）。截图脚本 [capture-delivered.mjs](./capture-delivered.mjs)。
- **Jev accept 门**：`deny:ui` → `HUMAN_REVIEW`（UI 类人工终审，来源:jev(v2, deny:ui 未调用命题)）。
