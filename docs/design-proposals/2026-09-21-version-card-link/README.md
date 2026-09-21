# 版本与更新卡片 · 更新日志改链接跳转

提案日期：2026-09-21 · 目标版本：0.5.6 · 预览：`preview.html` → `capture.mjs` → `version-card-proposal.png`

## 背景与决策

0.5.4→0.5.5 自动更新暴露两个问题：

1. electron-updater 从 GitHub 拿到的发布说明是渲染后的 HTML，0.5.4 的 `normalizeReleaseNotes` 按 markdown 清洗导致 `<p>`/`<li>` 标签原样显示在设置面板；
2. 内嵌日志框在下载期间长期占据卡片主体，信息价值低（进度本身已足够）。

决策（用户确认）：

- **下载更新过程中不显示发布说明**——本提案进一步取消整段内嵌日志框（所有状态都不再内嵌），显示 bug 随之消失，`normalizeReleaseNotes` 的 HTML 清洗不再必要；
- **下载中加进度条**——沿用待办卡 `plan-progress` 的 3px 细条语言（`--subtle` 轨道 + accent 填充），放在状态行下占满卡宽；
- **卡片内提供「查看更新日志」链接跳转**——安装版在操作行右侧常驻弱化外链；待重启安装时链接换为指向**新版本**的 Release 页（用户决定是否重启时最需要看的就是这一版改了什么）。

## 状态与链接映射

| 状态 | 状态行 | 进度条 | 操作 | 链接 | 目标 |
|---|---|---|---|---|---|
| 空闲 / 已是最新 | 当前版本 vX | — | 检查更新 | 查看更新日志 | `…/releases` |
| 检查中 | 正在检查更新… | — | 禁用 | 查看更新日志 | `…/releases` |
| 下载中 | 正在下载新版本…（n%） | 有（n%） | 禁用 | 查看更新日志 | `…/releases` |
| 待重启安装 | 新版本 vY 已下载… | — | 重启并安装 vY（主色） | 查看更新日志（指向 vY 的 Release 页） | `…/releases/tag/vY` |
| 检查失败 | 检查更新失败：… | — | 检查更新（重试） | 查看更新日志 | `…/releases` |
| 免安装版 | 说明更新器不可用 | — | 无按钮 | 前往 GitHub 下载新版 | `…/releases` |

## 实现要点（0.5.6）

- `shared/contracts.ts` / `electron/main.ts`：新增 `openExternal(url)` IPC（`shell.openExternal`，仅允许 `https://github.com/zhshenry/To-Do-List/...` 前缀），渲染层加 `api.openReleaseNotes(tag?)`。
- `SettingsPanel.tsx`：移除 `release-notes` 内嵌框与 `updater.releaseNotes` 的展示分支；按状态表渲染链接文案与目标。`normalizeReleaseNotes` 与 `updateNotesHeadline`（系统通知摘要）一并移除；`updater.releaseNotes` 字段从 `UpdaterStatus` 删除。
- 下载进度条为纯渲染层改动：`updater.progress` 已存在并按百分比推送，复用 `plan-progress` 的轨道/填充样式即可。
- 通知文案兜底：托盘/系统通知不再引用 release notes 首行。

## 已核对

- 六个状态（空闲 / 检查中 / 下载中 / 待重启 / 失败 / 免安装版）渲染真实尺寸与真实令牌（`--paper`、`--accent`、`--line` 等，Segoe UI Variable 栈）。
- 链接悬浮变 accent 并加下划线（offset 3px），focus-visible 描边；禁用态沿用全局 opacity .55。
