# Windows 交互合同

范围来源：本次用户授权“开始开发，先只考虑 Windows 的实用性”；确认稿为方案3布局与方案1字体色调。本合同随版本演进持续更新（初版为 v0.4）。业务数据合同以 `shared/contracts.ts`、持久化状态转换以 `electron/store.ts`、平台行为以 `electron/main.ts` 为准。

| 场景 | UI 行为 | 验证来源 |
| --- | --- | --- |
| 今日布局与复盘 | 待办/日程按55:45固定分区，各自内部滚动；待办卡空时呈现紧凑空状态。日程卡里今天、明天、近期、更晚用同一栏目，只列出有日程的组，都没有时只写「没有日程」。复盘从工具栏更多操作打开，关闭后焦点回到入口；底部只保留 AI 与提醒/反馈 | App.tsx / ux-smoke.mjs |
| 新增 / 编辑 | 展开态新增默认使用紧凑标题输入与「创建」，时间、优先级、标签、更多设置由图标按需展开；各工具开合时弹窗宽高固定，详情区内部滚动。新增时间与小卡片共用单列半小时档位；编辑既有事项保留完整表单。表单校验 → 保存 → 关闭 → 列表更新，失败保留输入，版本冲突要求重开编辑 | store.test.ts / ux-smoke.mjs |
| 主窗口 AI 入口 | 主窗右下角星形按钮在窗口内打开 AI 对话面板（内嵌 overlay，高度上限520px；高度不超过560px的矮窗顶部至少留出230px，收起卡状态先展开主窗再打开）；独立悬浮窗保留给定时和托盘入口。手动记录用日期右侧「新增」或 Ctrl+N，输入标题 Enter 保存 | App.tsx / ux-smoke.mjs |
| 标签 | 设置不再单列「待办配置」页；标签数据与事项关联保留，新建/编辑事项可选择或新建标签，事项库可按标签筛选。事项最多一个标签 | store.test.ts / ux-smoke.mjs |
| 关闭未保存表单 | Escape 或关闭按钮 → 放弃修改确认，默认允许继续编辑 | ui.tsx / desktop-test.mjs |
| 完成 | 即时保存，打勾和划线，可恢复待办 | store.ts / desktop-test.mjs |
| 删除 | 删除按钮变为「确认删除」并抖动，再点一次软删除；已删除列表可恢复 | TaskEditor.tsx / desktop-test.mjs |
| 今日 | 未完成待办不论完成期限是否在未来都留在待办卡，不改原截止日期；未完成日程按发生日收进今天（含逾期）、明天、近期、更晚栏目，空组不出现，都没有完成圆框。日期旁「事项库」/Ctrl+F 进入所有日期，支持搜索/标签筛选、未完成/已完成/已删除、恢复和批量完成/恢复 | TaskLibrary.tsx / ux-smoke.mjs |
| 提醒 | 事项表单默认关闭「提醒」开关；打开后才显示提醒时间和准时/提前10分钟。主进程轮询；隐藏窗口不停止。重新启动、唤醒后补查。单次提醒以提醒时间去重 | main.ts / store.test.ts / TaskEditor.tsx |
| 稍后提醒 | 当前时间后10分钟，保留原事项时间 | store.test.ts / desktop-test.mjs |
| 托盘退出 | 停止提醒；下一次启动补查未送达提醒 | main.ts |
| 任务栏 | 主窗显示时出现应用图标；点击“最小化”后隐藏主界面并从任务栏移除。AI 不单独占用任务栏。托盘单击和 Ctrl + Shift + Space 只切换主界面 | main.ts / desktop-test.mjs |
| AI 对话 | 主窗星形入口打开窗内对话面板，托盘和定时入口可打开独立非模态对话窗；主动发送才访问当前选用的模型服务；携带当前对话最近12轮并刷新事项快照；回复在普通对话内逐字流出，真实工具调用可折叠查看；可追问和解释。每项事项或标签变更各用一张可选择、卡内编辑的建议卡；待确认时仍可追问，后续方案替换并标记上一版；仅「应用所选」事务写入，放弃不写入；错误和取消不丢输入 | ai.test.ts / ux-smoke.mjs |
| 悬浮入口 | 当前正式版本下线：不创建独立窗口，主界面标题栏、设置和托盘不显示相关控制。`DOCK_FEATURE_ENABLED` 集中控制正式可用性；Dock 窗口、图标资产、IPC 与用户保存的开关、位置、置顶和外观配置继续保留 | contracts.ts / main.ts / App.tsx / DockIcon.tsx / ux-smoke.mjs |
| 主窗小卡片 | 顶栏独立收起按钮保持宽度和上沿，以约180ms将底边向上收至176px；展开以约240ms向下恢复先前高度。52px标题栏持续保留，只有下方124px内容区切换；减少动态效果时立即切换。`mainCollapsed` 与标准440px/窄版340px宽度选择独立持久化，展开和收起共用所选宽度。附着面板只向下临时延长原生窗口 | main.ts / App.tsx / MiniCard.tsx / mini-card-test.mjs |
| 小卡片首页与新增 | 首页显示未完成待办（含未到期长任务）以及今日与逾期的未完成日程，有时间者优先并按时间、创建顺序排列。卡片左上角固定类型徽章（待办＝绿、日程＝蓝灰）与超期徽章（已超期＝红，右上角时间同转红），事项标题最多两行后省略，截断时悬浮显示完整标题。开了维护进度时，底行分类后显示百分数，包括 0%；未维护则不显示。待办勾选为二次确认：首次点击进入待确认态（勾选框填充，底部就地出现 [✓ 确认完成] [取消]），再次点击圆框取消，只有「确认完成」写入并翻到下一项；Esc/取消/翻页/4 秒无操作解除，无停留无撤销。叠层只保留「新增事项」「AI 助手」两个操作。可执行 AI 建议最多一条，点击后在卡片内向下展开；未配置可用模型时仍保留建议栏，显示「配置 AI 后可获得个性化建议」并打开 AI 配置页，可访问名称与可见提示一致。新增可切换待办/日程；时间、日期与提醒合一，时间为一列30分钟档位；优先级与标签纵向窄面板；展开态与小卡片的新建标签共用两行共16种预设色及相同选中态，确认后工具图标填充对应颜色；更多设置默认隐藏进度条，启用维护后显示，并可填写备注。同一工具按钮再次点击收起面板 | App.tsx / TaskEditor.tsx / MiniCard.tsx / ux-smoke.mjs / mini-card-test.mjs |
| 小卡片 AI | 原位横向切换并使用暖色边框追光；点「AI 助手」进入普通对话，标题固定为「AI 助手」，不绑定叠层当前事项。底部只保留模型菜单，向下展开并按供应商分组，同一按钮再次点击收起。Pi Agent Loop 不预估总步骤，只显示当前真实工具、已完成数量和不定进度；回复流式显示，处理记录只含真实工具事件。待确认建议左侧用动作框标明对象化操作（新增/修改/删除 × 待办/日程/标签），右侧才是对象名；卡片高度内只列出真正改动的字段，写成「旧 → 新」对照（含优先级、完成期限等），未改字段不占地方；必须点击「应用 N 项」才写入，放弃不写入 | AssistantApp.tsx / AIConversation.tsx / ai.test.ts / mini-card-test.mjs |
| AI 悬浮窗 | 独立对话窗供托盘与定时入口使用，采用对话气泡外形；可拖动，在320×420至620×820间缩放。打开/关闭约180ms淡入滑出；关闭仅隐藏且保留本次会话；主窗隐藏不隐藏 AI；已打开时再次调用仅聚焦；手动移动后停止跟随，隐藏后重新打开才重新定位。模型选择位于底部输入框内，标题栏只保留身份、状态、新对话和关闭 | main.ts / ux-smoke.mjs |
| 设置 | 只保留「通用 / AI配置」两个页签；切换时弹窗外框尺寸不变，长内容在正文区内部滚动。通用页可选择标准440px或窄版340px，立即调整并自动保存；切换只改变宽度，保持当前高度和最近的水平屏幕边缘。开关即时保存，文本失焦保存；关闭/切换页签等待保存，状态可见，底部「完成」；新建草稿需添加且关闭时确认。常用供应商先密钥/模型，高级设置收起地址与协议，自定义自动展开；HTTP 明文风险提示；密钥加密 | SettingsPanel.tsx / main.ts / ux-smoke.mjs |
| 备份 | Windows保存对话框 → JSON事项备份，不含API Key；当前无导入UI | main.ts |

权限与数据生命周期：Windows 本地单用户，无账户、云同步或应用遥测。SQLite 不加密事项和对话正文；密钥使用 Windows 系统加密。AI 历史、草稿、可见工具过程由主进程写入 SQLite；隐藏/退出保留，新建对话确认后保留旧记录。重启中断未完成请求并使待确认建议失效；禁止自动重放。事项 JSON 备份不含密钥或对话历史，卸载默认保留数据。

控件所有权：Modal / IconButton / Select / DatePicker / TimePicker / Segmented 来自 src/ui.tsx；表单由 TaskEditor / SettingsPanel 拥有。新增事项默认只展示标题输入、创建按钮与时间/优先级/标签/更多四个工具入口，外框尺寸固定，工具详情在内部按需展开并滚动；编辑事项使用完整表单。有限枚举、标签筛选与新增时间档位使用统一圆角弹层；新增时间与小卡片共享48个半小时值。事项类型用标题旁分段控制器，不使用 Windows 原生 select/date/time 弹层。待办显示优先级且时间可不填，日期为完成期限；日程必填时间、不显示优先级，日期为发生日。提醒时间仍用平台原生 datetime-local。目录/导出文件选择器由系统拥有。

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | src/ui.tsx Select | TaskEditor.tsx / App.tsx / SettingsPanel.tsx | 触发器10px、菜单12px、12px选项、选中项 accent-soft；标签筛选为紧凑变体；打开约180ms从触发器方向展开 | desktop-test + Windows键盘 |
| Segmented | src/ui.tsx Segmented | TaskEditor.tsx / MiniCard.tsx | 待办/日程切换共用紧凑圆角样式；中间有细分割线，选中为白底深色字；切换约180ms滑动，展开态表单随方向淡入 | desktop-test / mini-card-test |
| Date | src/ui.tsx DatePicker | TaskEditor.tsx | 纸色圆角日历、选中项 accent-soft；打开约180ms从触发器方向展开 | desktop-test |
| Time | src/ui.tsx HALF_HOUR_TIMES / Select / TimePicker | TaskEditor.tsx / MiniCard.tsx | 新增事项共用单列48个半小时档位，待办另有“不设时间”；既有事项编辑保留 TimePicker | ux-smoke / mini-card-test |
| Form | TaskEditor / SettingsPanel | shared/contracts.ts | 新增、编辑、设置 | build + desktop-test |
| AI floating window | Electron / AssistantApp | electron/main.ts / src/AssistantApp.tsx | 非模态、可拖动缩放、会话内隐藏恢复 | desktop-test + packaged-smoke |
| Main mini card | Electron / MiniCard | electron/main.ts / src/App.tsx / src/MiniCard.tsx / src/mini-card.css | 440px标准/340px窄版共享176px持续标题栏变体；宽度选择持久化；收起180ms向上、展开240ms向下；附着面板临时向下延长；主窗和独立入口状态分离 | mini-card-test |
| AI conversation | AssistantApp / StandaloneAIConversation / AIProposalCards | 主进程 Pi 会话、草稿与待确认方案 / src/AssistantApp.tsx | 独立助手与卡片共用会话；展开版是自然对话、真实工具折叠区和逐项建议卡，可追问更新、卡内编辑与选择性应用；收缩卡片保持既有流式回复和固定确认节奏 | ai.test + mini-card-test + ux-smoke |
| Scrollbar | 全局CSS | src/styles.css | thin / forced-colors system | audit + screenshot |
| Toast | App成功提示 / 弹窗状态 | src/App.tsx | 成功5秒、错误持续 | desktop-test |
| CRUD | DesktopAPI + Store | electron/store.ts | 事项创建/版本校验/软删除恢复；标签创建/编辑/安全解除 | store.test + desktop-test |

提示范围：字段错误留在弹窗；后台和 AI 错误留在面板；普通成功提示5秒消失。AI忙碌时可取消，没有假进度百分比；失败可重试，主动取消不提供无效重试。展开版建议待确认时可继续发送，主进程把当前方案带入上下文；若产生新方案，旧方案标记为已更新且不可再应用。焦点样式统一，中文输入法提交按键须在 composition 结束后生效；AI 输入用 Enter 发送、Shift+Enter 换行。

测试隔离：TODO_TEST 只对非打包应用有效，提醒自动测试仅验证调度与去重、不向 Windows 发送测试事项通知。实机系统通知及实际睡眠/登录行为单独记录，不由模拟测试替代。

独立窗口启动：新安装只按保存状态显示主界面；悬浮入口即使保存为开启也不创建窗口，原开关、图片、位置和置顶配置不改写。`--hidden` 只抑制主窗，不覆盖其手动启动偏好。独立 AI 对话窗从托盘或定时入口打开，屏幕移除后约束回可用区域。当前验收由 `tooling/ux-smoke.mjs` 与 `tooling/mini-card-test.mjs` 确认 Dock 窗口不存在；`tooling/dock-regression.mjs` 保留给未来恢复功能时使用。
