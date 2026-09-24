# Windows v0.4 设计与功能验收记录

## 展开版 AI 助手重设计 · 2026-09-19

- 按用户确认的 B+C 高保真方向重做独立 AI 助手，收缩卡片内容和交互保持不变。展开版以普通对话为主；流式正文直接出现在 AI 消息中，真实工具调用以内嵌折叠区显示，不使用「执行轨迹」、固定次数或虚构 Skill。
- 每项建议独立成卡，可逐项选择、卡内编辑或预填「让 AI 调整」继续追问；待确认不再锁住输入。产生新方案时旧方案标记为已更新，只有「应用所选」会事务写入对应事项。模型选择移动到底部输入框内。
- 视觉沿用主产品的米白 mesh、陶土 accent、圆角与 Phosphor 图标；建议卡增加细角标、点阵和暖色边线，但没有引入另一套背景或高饱和霓虹。对照已确认高保真后检查字体层级、窗口布局、颜色、工具图标和中文文案，380×620 与 320×420 均无横向溢出或底部操作遮挡。
- 验证：`npm run build` 通过；27 项 Node 单元测试通过；`npm run test:desktop` 的14组隔离 Electron 流程通过；`tooling/mini-card-test.mjs` 的6组收缩卡片专项通过；保留的 `tooling/desktop-test.mjs` 兼容流程通过。覆盖真实工具循环、流式中间回复、追问替换建议、卡内编辑、选择性应用、放弃、模型切换、认证错误重试、历史草稿、重启失效和窄窗。
- 证据：`test-results/ux-current/assistant-streaming.png`、`assistant-tools.png`、`assistant-proposal.png`、`assistant-category-update.png`、`assistant-disabled.png`、`assistant-narrow.png`。测试均使用隔离 SQLite 和本机模拟模型服务，不读取真实事项或密钥；本轮未验证公网模型、屏幕阅读器或发行包。

## 最新布局修订 · 2026-09-17

- 根据用户新反馈覆盖下方旧布局：仅点击 Logo 收起；Dock 默认图标居中并取消浮动；明天/后天合成一张后续事项卡；今日空卡约96px；复盘进入今日计划旁的更多操作，支持键盘及焦点恢复。
- 构建通过，13 组隔离 Electron 流程通过；新增空卡高度、单一后续卡、展开分组、复盘打开/关闭/Escape/焦点、Logo-only收起、Dock双轴居中断言。检查默认尺寸与340×480最小主窗，未动真实数据或发布包。
- 截图：`test-results/ux-current/empty.png`、`empty-narrow.png`、`review-menu.png`、`upcoming-open.png`、`compact.png`；结果 `result.json`。
- Premium 静态严格扫描未全绿：6 条既有检查提示（4处将 React Select 识别成原生select、1处已明确由系统拥有的提醒时间控件、1处焦点/悬停触发的 HelpTip 按钮）。未为通过扫描恢复用户已删除的配置或扩大到无关组件改造；本轮新增交互通过真实窗口验证。

## 当前增量验收 · 2026-09-17

本节覆盖下方历史记录；旧截图和“退出清空对话”等结论不再作为当前基线。

- 保留已确认的米白、极淡 mesh、圆环红点 Logo、今日卡片与明后天折叠卡。新增日期旁「历史事项」入口，独立视图搜索/标签过滤/状态分组/恢复/批量处理。
- 设置只保留通用与 AI配置；两页弹窗尺寸一致，正文内部滚动。设置统一即时保存与明确状态；文字失焦保存，完成前等待保存，失败不关闭。常用供应商隐藏地址/协议，自定义展开；未完成新建草稿仍需确认。
- AI 状态依据实际配置与请求状态；SQLite 保存历史、草稿和真实工具过程。新对话需确认且不删除旧记录；重启后待应用建议过期，不自动执行。
- 修复分段键盘焦点、完成态对比、点击目标、窄窗日期换行、下拉菜单延迟滚动误关闭，以及部分更新误清空分类/进度的回归。
- 验证：构建通过；26 项单元测试通过；`tooling/ux-smoke.mjs` 的 12 组真实 Electron 流程通过，覆盖本地 SSE 工具循环、流式中间回复、确认后写入、3 次进程启动/重启、历史草稿、设置保存、远期搜索、误删恢复、批量处理、键盘与 Dock。结果见 `test-results/ux-current/result.json`。
- 新截图：`test-results/ux-current/main-rows.png`、`main-tiles.png`、`library.png`、`library-deleted.png`、`settings-categories.png`、`settings-ai-simple.png`、`assistant-streaming.png`、`assistant-tools.png`、`assistant-restored.png`、`main-narrow.png`、`editor-narrow.png`、`compact.png`。
- Impeccable 变更文件扫描：0 主问题，41 advisory 提示；不是全应用无问题保证。未改动已确认的视觉主题去追求零提示。
- 测试使用隔离 SQLite 与本地模拟模型服务，不读取真实数据或密钥、不发示例系统通知。没有重新验证公网模型、Windows 睡眠/登录行为、屏幕阅读器或发行包；本轮未重新打包或推送。

## 历史记录 · 2026-09-14

日期：2026-09-14。范围：在既有方案3布局、方案1字体色调、用户 Logo 和第3版应用图标基础上，把 AI 从主清单内嵌区域改为独立、非模态的悬浮对话窗；主清单保持显示。

## 对照证据

- Source visual truth：`docs/approved-ai-floating-design.png`，1536×1024 px，包含主清单与右侧 AI 悬浮窗的同一目标状态。
- Implementation：`test-results/floating-workspace.png`，1010×780 px，由真实 Electron 主窗口和 AI 窗口分别截图后组合；主窗截图 `floating-main.png` 为880×1400，AI截图 `floating-assistant.png` 为760×1240，对应 Windows 200% DPI 下的440×700与380×620 CSS px。
- Full-view comparison：`test-results/assistant-design-comparison.png`，1840×650。两侧都先缩放进900×600的同密度画布，再并排比较，不把DPI差异当作字号问题。
- Focused evidence：`test-results/ai-floating-conversation.png`（380×620 CSS px，@2x）用于检查消息、建议卡和按钮；`assistant-narrow.png`（320×420 CSS px，@2x）用于检查最小尺寸。细节在原图中足够清晰，因此不再制造额外裁剪放大图。
- 状态：2026-09-14浅色主题；主窗3条隔离测试事项；AI完成“明天下午安排产品评审 → 追问时间 → 15:00、提前10分钟 → 待确认建议”。测试数据不进入生产用户目录。

## Findings

- 无未解决 P0/P1/P2。确认稿中的双窗口层级、暖米白/暖棕配色、右侧对话、助手头像、事项建议卡和底部 AI 星形入口均已落地；主清单没有被 AI 覆盖。
- [P3 / 可接受差异] 真实主窗比概念稿多分类筛选、添加、稍后提醒、全部事项和复盘入口，信息密度稍高。这些是已实现功能的必要入口，没有改变“下一项 → 今日安排 → 快速记录”的主层级。
- [P3 / 可接受差异] 实际 AI 窗在待确认状态显示“请先处理上方建议”和状态提示，概念稿只展示输入占位文案。该差异用于防止未决建议时继续发送造成歧义。

## 五项视觉核对

- 字体：确认稿与实现都使用接近 Segoe UI / 微软雅黑的无衬线层级；日期、下一项时间、事项名和小型辅助文案的权重关系一致。长文本允许换行，关键操作不靠截断表达。
- 布局：主窗440×700、AI窗380×620；首次停靠主窗右侧，空间不足时放左侧。AI窗可在320×420至620×820之间缩放，最小尺寸无横向溢出，底部 AI 入口保持可达。
- 颜色：`paper/titlebar/ink/muted/accent/accent-soft/line` 与确认稿的米白、暖灰和陶土棕方向一致；用户气泡和主按钮的强调关系清晰，焦点与错误不只依赖颜色。
- 图像质量：左上角使用用户原始圆环红点 Logo；应用、任务栏、托盘和通知使用确认的第3版图标。其余操作图标来自同一 Phosphor 图标族，没有用 emoji、CSS图形或临时占位替代目标资产。
- 文案：窗口名为“To Do List”，事项类型统一为“待办 / 日程”；AI标题、追问、建议确认和会话生命周期说明可独立理解；界面没有设计提示词、开发说明或伪造的生产事项。

## 行为验证

- 星形入口打开/隐藏独立 AI BrowserWindow，主清单同时可见；AI 标题栏可拖动，原生窗口声明可缩放，最小/最大尺寸为320×420和620×820。
- AI 支持多轮上下文、追问、建议预览、应用、放弃、401错误保留输入与重试。隐藏后再打开保留本次会话；“新对话”清空；完全退出不持久化对话。
- 主窗隐藏、收起为图标或关闭到托盘时，AI窗同步隐藏；托盘可单独打开 AI 助手。收起后为可拖动的圆形悬浮图标，悬停在空侧展开「展开主程序栏」和「发起 AI 对话」。
- 主窗口底部只保留星形 AI 入口，打开独立悬浮窗；普通手动新增仍通过列表旁的“+”进入事项编辑器，AI 解析出的时间和变更先预览再确认。

## Comparison history

1. 首次同状态并排比较：未发现 P0/P1/P2；无需视觉修正。随后在380×620与320×420两个尺寸复核聊天建议卡、滚动区和底部 AI 入口，结果仍无阻断项。

## 验证结果

| 检查 | 结果 / 边界 |
| --- | --- |
| TypeScript + Vite + Electron构建 | 通过 |
| Node单元/HTTP测试 | 13项通过 |
| Windows真实窗口流程 | 双窗口、主清单保留、多轮对话、确认/放弃、错误重试、隐藏恢复、尺寸边界、分类/CRUD/提醒等均通过 |
| Strict UI audit | 运行结果记录在 `test-results/premium-audit.json` |
| DESIGN.md lint | 运行结果记录在本次发布验证中 |
| 打包程序 | 由 `tooling/packaged-smoke.mjs` 验证 sandbox、safeStorage、主窗与AI窗；截图为 `packaged-profile.png`、`packaged-ai-floating.png` |
| 免安装包 | `release/portable/To Do List-0.4.2-Windows-x64-Portable.zip` 为默认交付物 |
| NSIS安装包 | `release/installer/To Do List Setup-0.4.2-x64.exe` 为可选项；Authenticode仍为NotSigned |

## 剩余限制

- 本机实测 Windows 11 x64，未做干净 Windows 10、ARM64、实际重启登录、多显示器拔插和完整屏幕阅读器认证。
- AI自动化使用本机模拟 Chat Completions 服务；仍需用户配置的真实服务做兼容联调。
- 安装包未签名，未实现自动更新；对话不跨应用重启保存。

final result: passed
