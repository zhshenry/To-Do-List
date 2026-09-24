# Issue #15：AI模型新增单独的RLCD模型配置区域

- Issue：<https://github.com/zhshenry/To-Do-List/issues/15>
- 建档：2026-09-23
- 状态：已归档（合入 023d18a）
- 类型：功能
- 涉及UI：是
- 影响面：结构（设置页新增区块 + 存储扩展；不改既有交互语义）
- 分支：sdd/0015（基于 main `a36c92f`，HEAD `e561038`）

## 背景（issue 要点 + 勘察结论）

**用户诉求**（issue 原文三点）：① 设置 AI 页新增独立于 LLM 的「RLCD 模型」配置区（供应商可选 typesafe / openrouter / 自定义，提供测试等服务）；② LLM 模型行现有三小按钮紧凑化；③ 编辑按钮右侧新增「是否支持视觉（多模态）」开关，用户自选；「本期新增配置不会有任何影响，是给后面打基础的」。

**勘察**（main `31c9b84`）：

- 设置 AI 页结构：`SettingsPanel.tsx:394-401`——启用 AI 卡 + ProviderCard 列表（每卡：供应商头 + 模型行列表 + 添加模型）；模型行三按钮 = 测试连接（ModelTestButton）/ 重命名（PencilSimple）/ 删除（Trash），图标 15px；
- 存储：`contracts.ts` AIProviderKind = openai/anthropic/deepseek/custom；`saveProvider/saveModel/removeModel` IPC 齐备；无 vision 字段、无 RLCD 概念；
- 供应商预设（`contracts.ts:69-73`）含 typesafe 需新增（endpoint `https://api.typesafe.ai/v1` 类，protocol openai-chat）。

## 方案（见 [rlcd-config-proposal.png](./rlcd-config-proposal.png)）

- **① RLCD 独立区块**：AI 页 LLM 卡下方新增「RLCD 模型（决策用 · 实验）」卡——独立供应商/模型列表与连接测试，供应商 kinds = **typesafe / openrouter / 自定义**；存储新增 `rlcdProviders / rlcdModels / activeRlcdModelId`（与 LLM 数据零共享）；**本期不接任何行为**（纯基础配置）；
- **② 模型行按钮紧凑化**：测试/重命名/删除三钮收为 22×22 紧凑钮（触达达标、行高不变、不换行）；
- **③ 视觉开关**：重命名按钮右侧新增第四钮——点亮 = 该模型支持视觉，灰 = 不支持；存模型新字段 `vision: boolean`（默认 false），本期无行为联动；
- 设置页尺寸全部取自 DESIGN.md 尺寸阶（§7 硬性要求）。

## 实现要点

- `shared/contracts.ts`：AIProviderKind 扩展或新增 rlcd kinds（typesafe/openrouter/custom）、模型 `vision` 字段、rlcd 存储 schema 与 saveRlcdProvider/saveRlcdModel/removeRlcdModel/testRlcdConnection IPC。
- `electron/store.ts + main.ts`：rlcd 持久化与 IPC 实现；`SettingsPanel.tsx`：RLCD 卡 + 视觉钮 + 按钮紧凑化。
- 验证：`npm test`（新增 rlcd 存储往返单测）+ build + smoke + 真机截图（设置 AI 页全貌）。
- CHANGELOG：[未发布] 一条。
- 风险：中——新增存储与 IPC 面较大但与既有数据隔离；UI 全部为新增元素。

## 决策记录

- 2026-09-23 建档：存储隔离方案（独立 rlcd* 列表） vs 共享列表加标记——取隔离（用户要求「完全区分开」且零行为影响最易保证）；开放点：RLCD 卡命名文案、vision 是否需要按供应商默认值（批准时可 /reject 指定）。
- 2026-09-23 **spec 门（Jev v2）**：HUMAN_REVIEW——deny:ui（涉及UI=是，mockup-first 硬政策），置 spec待审；mockup 已随里程碑评论内联（[#15 评论](https://github.com/zhshenry/To-Do-List/issues/15)）。
- 2026-09-23 **批准**（issue 评论 `/approve` 11:15，来源:用户(/approve)）：spec 获批，进实现排队。用户未以 /reject 指定开放点——RLCD 卡命名按方案默认「RLCD 模型（决策用 · 实验）」，vision 默认 false 无供应商级默认值。补记于 19:35 轮（上轮 #17 证据攻坚期间未及入档）。
- 2026-09-23 **实现交付**（`e561038` @ sdd/0015，11 文件 +393/−42）：①「LLM 模型（对话用）/ RLCD 模型（决策用 · 实验）」双区块设置页；②RLCD 独立存储（`Store.rlcdProviders/rlcdModels/persistRlcd`，与 `aiProviders/aiModels` 零共享，脏行清洗+孤儿过滤，单测覆盖）+ 6 个 IPC（provider/model save/remove、连接测试、vision 开关），RLCD 删除不触碰 `aiEnabled` 与 LLM 端点镜像；③模型行「视觉（多模态）」开关钮（Eye 图标点亮 = vision:true，仅 LLM 行，RLCD 行按 mockup 无此钮）；④模型行动作钮 20→**22**（`--ctl-xs`，尺寸阶档）+ 15px 图标；⑤ProviderCard 以 `surface` 泛化复用（kinds/预设/IPC/存储范围按面分流）。验证：tsc 清零 · test 38/38（新增 RLCD 往返）· build · ux-smoke passed（22×22 断言同步更新）· 真机双图证据（capture-rlcd.mjs 随 `e561038` 入库，含存储隔离断言）。**尺寸阶自检**：行钮 22=--ctl-xs、徽章字号 10=--fs-micro、徽章圆角 999px 沿用 provider-badge 形制；无新增阶外值。

## 验收记录

- 2026-09-23 **accept 门（Jev v3）**：HUMAN_REVIEW——deny:type（类型「功能」不在自动放行白名单 缺陷/工程/文档/优化）：功能类按严格制转人工验收，符合预期。引擎自采证据（diff/CHANGELOG/测试引擎自跑）通过，无 RETRY 回炉项。输入留档 `jev-accept-input.json`。
- 2026-09-23 **交付评论已发**（双图 --attach 内联，改写 user-attachments 直链）：[#15 交付评论](https://github.com/zhshenry/To-Do-List/issues/15#issuecomment-5794455374)。
- 2026-09-23 **验收通过 + 预合并**（issue 评论 `/approve` 20:25，来源:用户(/approve)）：先叠合 sdd/0017 预解 CHANGELOG 冲突（stack commit `a8c983d`，堆叠后 45/45）→ `_integrate` 试合（tree `85bd12d5`）→ 主干合并 `023d18a`（树哈希一致）→ build + 冒烟全绿 → 分支 sdd/0015 删除、关单归档。
