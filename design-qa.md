# Windows v0.4 设计与功能验收记录

日期：2026-09-14。范围：在既有方案3布局、方案1字体色调、用户 Logo 和第3版应用图标基础上，把 AI 从主清单内嵌区域改为独立、非模态的悬浮对话窗；主清单保持显示。

## 对照证据

- Source visual truth：`docs/approved-ai-floating-design.png`，1536×1024 px，包含主清单与右侧 AI 悬浮窗的同一目标状态。
- Implementation：`test-results/floating-workspace.png`，1010×780 px，由真实 Electron 主窗口和 AI 窗口分别截图后组合；主窗截图 `floating-main.png` 为880×1400，AI截图 `floating-assistant.png` 为760×1240，对应 Windows 200% DPI 下的440×700与380×620 CSS px。
- Full-view comparison：`test-results/assistant-design-comparison.png`，1840×650。两侧都先缩放进900×600的同密度画布，再并排比较，不把DPI差异当作字号问题。
- Focused evidence：`test-results/ai-floating-conversation.png`（380×620 CSS px，@2x）用于检查消息、建议卡和按钮；`assistant-narrow.png`（320×420 CSS px，@2x）用于检查最小尺寸。细节在原图中足够清晰，因此不再制造额外裁剪放大图。
- 状态：2026-09-14浅色主题；主窗3条隔离测试事项；AI完成“明天下午安排产品评审 → 追问时间 → 15:00、提前10分钟 → 待确认建议”。测试数据不进入生产用户目录。

## Findings

- 无未解决 P0/P1/P2。确认稿中的双窗口层级、暖米白/暖棕配色、右侧对话、助手头像、事项建议卡和底部输入均已落地；主清单没有被 AI 覆盖。
- [P3 / 可接受差异] 真实主窗比概念稿多分类筛选、添加、稍后提醒、全部事项和复盘入口，信息密度稍高。这些是已实现功能的必要入口，没有改变“下一项 → 今日安排 → 快速记录”的主层级。
- [P3 / 可接受差异] 实际 AI 窗在待确认状态显示“请先处理上方建议”和状态提示，概念稿只展示输入占位文案。该差异用于防止未决建议时继续发送造成歧义。

## 五项视觉核对

- 字体：确认稿与实现都使用接近 Segoe UI / 微软雅黑的无衬线层级；日期、下一项时间、任务名和小型辅助文案的权重关系一致。长文本允许换行，关键操作不靠截断表达。
- 布局：主窗440×700、AI窗380×620；首次停靠主窗右侧，空间不足时放左侧。AI窗可在320×420至620×820之间缩放，最小尺寸无横向溢出，底部输入保持可达。
- 颜色：`paper/titlebar/ink/muted/accent/accent-soft/line` 与确认稿的米白、暖灰和陶土棕方向一致；用户气泡和主按钮的强调关系清晰，焦点与错误不只依赖颜色。
- 图像质量：左上角使用用户原始圆环红点 Logo；应用、托盘和通知使用确认的第3版图标。其余操作图标来自同一 Phosphor 图标族，没有用 emoji、CSS图形或临时占位替代目标资产。
- 文案：窗口名为“To Do List”，AI标题、追问、建议确认和会话生命周期说明可独立理解；界面没有设计提示词、开发说明或伪造的生产任务。

## 行为验证

- 星形入口打开/隐藏独立 AI BrowserWindow，主清单同时可见；AI 标题栏可拖动，原生窗口声明可缩放，最小/最大尺寸为320×420和620×820。
- AI 支持多轮上下文、追问、建议预览、应用、放弃、401错误保留输入与重试。隐藏后再打开保留本次会话；“新对话”清空；完全退出不持久化对话。
- 主窗隐藏、收起为小条或关闭到托盘时，AI窗同步隐藏；托盘可单独打开 AI 助手。
- 普通快速记录仍固定创建“今天、未分类、无事项时间、无提醒”的事项；具体时间可在事项编辑器填写，或由 AI 解析后先预览再确认。

## Comparison history

1. 首次同状态并排比较：未发现 P0/P1/P2；无需视觉修正。随后在380×620与320×420两个尺寸复核聊天建议卡、滚动区和底部输入，结果仍无阻断项。

## 验证结果

| 检查 | 结果 / 边界 |
| --- | --- |
| TypeScript + Vite + Electron构建 | 通过 |
| Node单元/HTTP测试 | 13项通过 |
| Windows真实窗口流程 | 双窗口、主清单保留、多轮对话、确认/放弃、错误重试、隐藏恢复、尺寸边界、分类/CRUD/提醒等均通过 |
| Strict UI audit | 运行结果记录在 `test-results/premium-audit.json` |
| DESIGN.md lint | 运行结果记录在本次发布验证中 |
| 打包程序 | 由 `tooling/packaged-smoke.mjs` 验证 sandbox、safeStorage、主窗与AI窗；截图为 `packaged-profile.png`、`packaged-ai-floating.png` |
| 免安装包 | `release/portable/To Do List-0.4.0-Windows-x64-Portable.zip` 为默认交付物 |
| NSIS安装包 | `release/installer/To Do List Setup-0.4.0-x64.exe` 为可选项；Authenticode仍为NotSigned |

## 剩余限制

- 本机实测 Windows 11 x64，未做干净 Windows 10、ARM64、实际重启登录、多显示器拔插和完整屏幕阅读器认证。
- AI自动化使用本机模拟 Chat Completions 服务；仍需用户配置的真实服务做兼容联调。
- 安装包未签名，未实现自动更新；对话不跨应用重启保存。

final result: passed
