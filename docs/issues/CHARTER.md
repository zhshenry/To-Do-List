# SDD 问题单流水线 · 工作章程

> 本文件是 issue 自动化流水线**唯一的权威规则**。定时任务每轮运行必先通读本章程并严格照办；
> 章程与任何聊天记忆、既往习惯冲突时，以本章程为准。用户手改本文件即刻生效（下一轮起）。
>
> 建立日期：2026-09-21 · 维护者：zhshenry

## 1. 身份与范围

- 仓库：github.com/zhshenry/To-Do-List（gh 已认证账号 **zhshenry**）
- 触发：定时任务每 2 小时一轮；**周一至周五下午 2–6 点不运行**（14:00/16:00/18:00 三次跳过，20:00 恢复），周末全天照常
- **接单范围：仅** open 且带 `sdd` label（精确小写）的 issue。无此 label 的一律忽略，报告中也不必提
- 选单顺序：带 `priority: high` 的优先；同级按 issue 创建时间先后（FIFO）
- 并发上限：同一时刻最多 **1 个** issue 处于「spec待审」、最多 **1 个** 处于「实现中」

## 2. 档案与状态机

每个接单的 issue 建档案 `docs/issues/<四位补零issue号>-<英文短名>/`（如 `0012-crash-on-start`）。
**不用日期**命名（issue 号天然递增）；建档日期写在 README 头部。

文件夹结构（后三件仅 `涉及UI：是` 的变更需要，沿用 docs/design-proposals 惯例）：

```
0012-<英文短名>/
  README.md      # 档案主文档，唯一状态载体
  preview.html   # 静态高保真预览
  capture.mjs    # 截图脚本（msedge 捕获出 PNG）
  *.png          # mockup 图 / 实现后验证截图
```

README 固定模板：

```markdown
# Issue #NN：<标题>

- Issue：<链接>
- 建档：YYYY-MM-DD
- 状态：排队中 | spec待审 | 实现中 | 已实现待验收 | 已归档 | 已取消
- 类型：缺陷 | 功能 | 优化 | 工程 | 文档
- 涉及UI：是 | 否
- 分支：sdd/00NN（实现阶段起才有）

## 背景（issue 要点 + 代码勘察结论）
## 方案（涉及UI=是 时必须先放 mockup PNG）
## 决策记录（逐条追加：日期 + 谁 + 决定了什么）
## 实现要点（动哪些文件、接口、风险）
## 验收记录（交付摘要：验证结果、diff 概览、本地验证方法）
```

状态机（状态行是流水线唯一状态载体，无任何其它状态文件）：

```
排队中 → spec待审 → 实现中 → 已实现待验收 → 已归档
                └──────────────┴→ 已取消（任意阶段 /discard 或用户以 not planned 关闭）
```

队列索引 `docs/issues/README.md` 每轮由任务**重建**（机器生成，禁止手编）。

## 3. 类型 → 验收清单

| 类型 | 验收要求 |
|---|---|
| 缺陷 | 复现 → 修复 → 回归测试堵住 |
| 功能 | 新能力 + 测试 + 同步 UX-CONTRACT.md / DESIGN.md + CHANGELOG |
| 优化 | 前后对比证据（UI 截图 / 性能数据 / 体积数字） |
| 工程 | 构建全绿 + 打包冒烟（`npm run dist:portable` 能出产物） |
| 文档 | 与代码一致、链接有效 |

- 建档时由任务依据 issue 的 labels（bug/enhancement/…）与内容预判类型，spec 审批时用户顺手确认，可改。
- `涉及UI：是` ⇒ **mockup-first**：spec 阶段必须先出 preview.html + capture.mjs → PNG，spec 获批前不写任何实现代码；验收时过 design-qa.md 清单。

## 4. 两个人工关口与指令通道

- **关口一 · spec 审批**：spec待审 → 获批后进「实现中」。
- **关口二 · 验收**：已实现待验收 → 通过后归档。

指令三通道，**先到先得**；每条指令执行后必须立刻写入该档案「决策记录」（含日期、来源、内容），后续轮次凭决策记录去重，不重复执行：

1. 聊天中用户的明确表态（自然语言即可）；
2. issue 评论指令：仅 **zhshenry** 账号发出的 `/approve`（通过当前关口）、`/reject <理由>`（打回当前阶段）、`/discard`（整单取消）有效，其他账号一律忽略；
3. 用户在网页上直接关闭 issue：reason=completed 视为验收通过，reason=not planned 视为取消。

**绝不自动放行**。用户表态有歧义（如含糊的"差不多行了吧"）时不得行动，列入报告「等你决策」追问。绝不猜。

## 5. GitHub 写操作白名单（此外一律禁止）

1. spec 就绪时：该 issue 发一条里程碑评论（spec 已就绪待审 + 档案链接）；
2. 交付时：该 issue 发一条交付评论（改动摘要、分支名、本地验证方法、合入提示）；
3. 收到验收信号后：以 reason=completed 关闭 issue，并留收尾评论（档案链接、分支名、合入命令提示）。

**永不** push；**永不**增删改任何 label（`sdd`、`priority: high` 归用户管）；**永不**执行白名单外的任何远程写操作。

## 6. worktree 与分支（隔离红线）

- 实现一律在独立 worktree 进行：仓库同级目录 `../To-Do-List-sdd/<00NN>/`，分支 `sdd/00NN`，基于本地 main HEAD 创建（`git worktree add ../To-Do-List-sdd/<00NN> -b sdd/00NN main`）。
- worktree 首次使用先 `npm install`（依赖不进 git）；需运行桌面验证时再 `npm run setup:runtime`。
- **绝不改动主工作区的任何已跟踪文件**——那里长期有用户未提交的在途工作；档案与 spec 一律以**新增未跟踪文件**落在 `docs/issues/` 下。
- commit 只落 `sdd/00NN` 分支；**绝不 commit 到 main；绝不 push**。
- 若 issue 涉及的文件在主工作区有未提交改动（用 `git status` 核对），必须在 spec 中显式标注——这影响后续合入时机。
- 验收归档后分支**原地保留**；合入仅凭用户明确指令，时机建议用户在途工作提交之后（`git merge --no-ff sdd/00NN`）；合入后删分支并 `git worktree remove`。
- 例外：用户明确要求"把改动叠进主工作区"（在途工作提交前就要拿到改动）时才可直接叠加，并在报告里提醒这会与在途工作混在一起。

## 7. 实现与验证标准

- 验证命令（worktree 内）：`npm test`（单测）；`npm run build`（tsc --noEmit 类型检查 + vite 构建）；涉及UI/交互的另跑 `npm run test:desktop`（UX 冒烟）。全部通过才算交付。
- **优化边界（用户确认）**：修好 issue 本身 + 补测试 + 验证全绿 + 顺手清理所改代码的明显问题；**不做大重构**。
- UI 实现完成后在 worktree 截验证 PNG 放入档案。
- CHANGELOG：按 Keep a Changelog 既有条目样式（`**短标题**：一句话描述`）在顶部「## [未发布]」小节（无则新建）记录本变更；合入时由用户归并到版本小节。

## 8. 每轮固定流程

1. **自检**：gh 认证与仓库绑定（`GH_HOST=github.com GH_REPO=github.com/zhshenry/To-Do-List`）；失败 → 报告并结束本轮。
2. **读取**：带 `sdd` 的 open issues；扫描 `docs/issues/*/README.md` 状态行；待审 issue（spec待审 / 已实现待验收）下的新评论。
3. **处理指令**：逐条对照各档案「决策记录」去重后执行 /approve、/reject、/discard 及用户关闭事件。
4. **推进流水线**（遵守并发上限与选单顺序）：
   - 无 spec待审 且队列有货 ⇒ 为队首 issue 建档、勘察代码、写 spec（UI 类出 mockup PNG），置 spec待审，发里程碑评论；
   - 有已批准待实现的 ⇒ 进 worktree 实现 + 验证 + 提交，置 已实现待验收，发交付评论；
   - 有已交付的 ⇒ 不动，等验收；
   - 有 issue 被关闭 ⇒ completed → 置已归档（分支保留）；not planned → 删分支、置已取消。
5. **重建队列索引** `docs/issues/README.md`。
6. **输出报告**：`等你决策`（置顶：每项写清 issue 号、停在哪关口、等你什么表态）→ `队列快照` → `本轮动作`。无事可做则输出一行静默报告（如"本轮无待办，队列空"）。

## 9. 用户速查

- 提需求：GitHub 建 issue + 打 `sdd`；急单再加 `priority: high`。
- 看 spec：`docs/issues/00NN-*/README.md`（UI 类附 PNG mockup）。
- 批准/打回：聊天直说，或 issue 评论 `/approve`、`/reject 理由`、`/discard`（手机可用）。
- 验收：去 `../To-Do-List-sdd/<00NN>` 跑起来验证；满意 → 关 issue 或聊天说"验收通过"（任务代关 + 归档）。
- 合入：等在途工作提交后说"把 sdd/00NN 合进来"。
