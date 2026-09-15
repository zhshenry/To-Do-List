# Windows v0.4 交互合同

范围来源：本次用户授权“开始开发，先只考虑 Windows 的实用性”；确认稿为方案3布局与方案1字体色调。业务数据合同以 `shared/contracts.ts`、持久化状态转换以 `electron/store.ts`、平台行为以 `electron/main.ts` 为准。

| 场景 | UI 行为 | 验证来源 |
| --- | --- | --- |
| 新增 / 编辑 | 表单校验 → 保存 → 关闭 → 列表更新。失败保留输入。版本冲突要求重开编辑 | store.test.ts / desktop-test.mjs |
| 快速记录 | 原样创建名称；默认今天、未分类、无事项时间、无提醒，不解析自然语言时间 | contracts.ts / desktop-test.mjs |
| 分类 | 设置页始终显示“当前分类”和数量；可直接改名、改色、删除。事项最多一个分类；列表筛选；删除分类只解除关联，任务保留 | store.test.ts / desktop-test.mjs |
| 关闭未保存表单 | Escape 或关闭按钮 → 放弃修改确认，默认允许继续编辑 | ui.tsx / desktop-test.mjs |
| 完成 | 即时保存，打勾和划线，可恢复待办 | store.ts / desktop-test.mjs |
| 删除 | 名称与可恢复说明 → 确认 → 软删除；已删除列表可恢复 | TaskEditor.tsx / desktop-test.mjs |
| 今日 | 未完成事项跨日仍可见；今天完成事项可见；不自动改原截止时间 | contracts.ts / store.test.ts |
| 提醒 | 主进程轮询；隐藏窗口不停止。重新启动、唤醒后补查。单次提醒以提醒时间去重 | main.ts / store.test.ts |
| 稍后提醒 | 当前时间后10分钟，保留原事项时间 | store.test.ts / desktop-test.mjs |
| 托盘退出 | 停止提醒；下一次启动补查未送达提醒 | main.ts |
| AI 对话 | 星形入口打开独立、非模态悬浮窗，主清单始终保留；主动发送才访问配置服务；携带当前对话最近6轮并刷新任务快照；可追问和解释；所有事项变更在对话内预览，确认后事务写入，放弃不写入；错误和取消不丢输入 | ai.test.ts / desktop-test.mjs |
| AI 悬浮窗 | 首次优先停靠主窗右侧，空间不足放左侧；可拖动，在320×420至620×820间缩放。关闭仅隐藏且保留本次会话；主窗隐藏或收起时同步隐藏 | main.ts / desktop-test.mjs |
| 设置 | AI 内容默认折叠；模型地址验证，密钥Windows加密；自动启动默认关闭 | main.ts / SettingsPanel.tsx |
| 备份 | Windows保存对话框 → JSON任务备份，不含API Key；当前无导入UI | main.ts |

权限与数据生命周期：本地单用户应用，无账户、角色、云同步或计费系统。模型费用由用户选择的服务方产生。SQLite 不加密任务正文；密钥使用 Windows 系统加密。本应用没有遥测与应用服务器，不自动上传任务。AI 对话仅保留在 AI 窗口的渲染进程内存中，隐藏或关闭窗口不清空；新建对话或应用完全退出后清空，不写入 SQLite。卸载默认保留用户数据。未来更改上述策略需再次确认。

控件所有权：Modal / IconButton 来自 src/ui.tsx；表单由 TaskEditor / SettingsPanel 拥有，类型/状态/优先级 select 和 date/datetime-local 弹层由 Windows/Chromium 拥有；无 app-owned listbox。严格审查不将这些平台选择当作临时替代。目录/导出文件选择器由系统拥有。

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | Windows/Chromium native select | TaskEditor.tsx / App.tsx | 有限枚举与分类筛选，无自定义弹层 | desktop-test + Windows键盘 |
| Date | Windows/Chromium native inputs | TaskEditor.tsx | date / datetime-local | store.test + desktop-test |
| Form | TaskEditor / SettingsPanel | shared/contracts.ts | 新增、编辑、设置 | build + desktop-test |
| AI floating window | Electron / AssistantApp | electron/main.ts / src/AssistantApp.tsx | 非模态、可拖动缩放、会话内隐藏恢复 | desktop-test + packaged-smoke |
| Scrollbar | 全局CSS | src/styles.css | thin / forced-colors system | audit + screenshot |
| Toast | App成功提示 / 弹窗状态 | src/App.tsx | 成功5秒、错误持续 | desktop-test |
| CRUD | DesktopAPI + Store | electron/store.ts | 事项创建/版本校验/软删除恢复；分类创建/编辑/安全解除 | store.test + desktop-test |

提示范围：字段错误留在弹窗；后台和 AI 错误留在面板；普通成功提示5秒消失。AI忙碌时可取消，没有假进度百分比；失败可重试，主动取消不提供无效重试。AI 建议待确认时锁定下一次发送，避免对未决变更产生歧义。焦点样式统一，中文输入法提交按键须在 composition 结束后生效；AI 输入用 Enter 发送、Shift+Enter 换行。

测试隔离：TODO_TEST 只对非打包应用有效，提醒自动测试仅验证调度与去重、不向 Windows 发送测试任务通知。实机系统通知及实际睡眠/登录行为单独记录，不由模拟测试替代。
