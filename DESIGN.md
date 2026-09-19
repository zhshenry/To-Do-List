---
version: alpha
name: To Do List
description: Windows 桌面的米白悬浮待办，以今日计划卡片和暖棕色操作提示保持专注。
colors:
  primary: "#b54f2b"
  paper: "#faf8f5"
  titlebar: "#f2eee8"
  ink: "#171923"
  muted: "#726d67"
  accent: "#b54f2b"
  accent-hover: "#963e20"
  accent-soft: "#f6e2d9"
  line: "#e4ded6"
  subtle: "#efebe6"
  danger: "#a3312d"
  white: "#ffffff"
  completed: "#6d675f"
  progress-track: "#b8babd"
  mini-paper: "#faf8f5"
  mini-ink: "#171923"
  mini-icon: "#a66c50"
  mini-hover: "#f5ebe4"
  mini-focus: "#8d8176"
  mini-line: "#e4ded6"
  mini-check: "#827c74"
  mini-completed: "#6d675f"
  mini-input-focus: "#9c8e81"
  mini-compose-line: "#cec4ba"
  mini-compose-focus: "#9b7d6e"
typography:
  sans:
    fontFamily: '"Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
rounded:
  DEFAULT: "18px"
  card: "14px"
  control: "10px"
  select: "10px"
  menu: "12px"
  mini-tile: "12px"
  mini-check: "5px"
  mini-decision: "7px"
  mini-compose: "9px"
  mini-send: "6px"
spacing:
  content-inset: "24px"
  narrow-inset: "17px"
  mini-inset: "10px"
  mini-gap: "6px"
components:
  widget:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  divider:
    backgroundColor: "{colors.line}"
  titlebar:
    backgroundColor: "{colors.titlebar}"
  icon-button:
    textColor: "{colors.accent}"
  icon-button-hover:
    backgroundColor: "{colors.subtle}"
  task-row:
    textColor: "{colors.muted}"
  completed-task:
    textColor: "{colors.completed}"
  compose-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
  compose-button-hover:
    backgroundColor: "{colors.accent-hover}"
  ai-user-message:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
  modal:
    backgroundColor: "{colors.paper}"
  field-error:
    textColor: "{colors.danger}"
  mini-card:
    backgroundColor: "{colors.mini-paper}"
    rounded: "{rounded.DEFAULT}"
    padding: "{spacing.mini-inset}"
    height: "176px"
  mini-quick-action:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.mini-tile}"
  mini-quick-action-hover:
    backgroundColor: "{colors.mini-hover}"
---

# To Do List Design System

## Overview

用户确认“方案3布局 + 方案1色调字体”，以确认稿为参考；Windows 实用性优先。面向个人在工作桌面上随手记录、查看下一项与接收提醒，非营销页面。中文 UI 不代表额外推断任何地域市场。当前只支持 Windows 桌面，浅色模式。

主视觉是安静的米白便笺：保留极淡暖冷 mesh 背景，日期与文字化的事项库/新增入口，今日计划大卡片、单张「后续事项」卡（含明天、近期、更晚分组）与右下角 AI 星形入口；不恢复旧版大时间区与纵向时间线。圆环红点 Logo 与第3版应用图标沿用用户确认资产。

Token 所有权：`src/styles.css` 是共享运行时来源，`src/mini-card.css` 拥有已确认的 176px 持续标题栏卡片局部变体；本文件为 Model B 人工维护镜像，不从 Markdown 生成 CSS。变更时同时核对本文件与 CSS，严格审查重复控件和新增硬编码。

## Colors

paper 是主背景，ink 用于正文，muted 为辅助文字；completed 加深至 #6d675f。accent 用于操作状态与焦点，不只用颜色表达类别或状态。line 是弱分隔，不能代替键盘焦点。高对比度模式遵循系统色；没有自动深色主题。

`mini-*` 是用户参考图确认的小卡片局部色值：更浅的纸面、暖棕细线图标与白色快捷块；共享正文、辅助文字、提交按钮与错误仍沿用既有语义色。局部焦点和输入边框保持可见，不将这些变体推广为全局新主题。

## Typography

使用 Windows 系统字体及微软雅黑回退，中文控制文案不使用斜体。正文14px，列表标题14px，日期28px（窄/短窗24px），辅助标签11px；时间使用等宽数字。列表长标题省略且可点击编辑看全文，标签使用色点加名称，磁贴标题可换行。

176px 小卡片继承相同字体：事项标题14px，操作与输入11px，建议、状态、AI 回复及确认标题10–11px，计数和辅助信息8–10px。长事项标题省略后可展开编辑；普通 AI 回复在卡片中显示两行摘要，完整内容在独立助手查看，真实工具记录和多项变更摘要可在标题栏下方内容区滚动。

## Layout

今日计划为空时使用约96px的紧凑卡片，不拉伸空边框填满窗口；有事项时仍让列表使用剩余空间。后续事项是一张连续外框，明天、近期（后天至第7天）、更晚（第8天起）之间用细线分隔，保留展开收起；分组显示日期范围，组内按计划日期与时间排序，事项显示具体日期。主窗口仍由用户决定尺寸，不因空状态自动缩窗。

主窗口默认440×700 CSS px。「设置 → 通用 → 窗口宽度」提供标准440px与窄版340px，既有用户默认标准；选择即时调整并持久化，保持当前高度和距离最近的水平屏幕边缘，展开与收起共用所选宽度。独立悬浮入口当前从正式产品下线：启动与重启均不创建该窗口，主界面标题栏、设置和托盘不露出相关控制；既有窗口实现、图标资产、IPC 与用户保存的开关、位置、置顶和外观配置继续保留，且不因本次下线而改写。AI 助手仍是独立的对话气泡窗口（默认380×620 CSS px），箭头从主界面指向右下角星形入口；空间不够时改到另一侧或上下。可在320×420至620×820之间拖动缩放。窄窗口内容内边距由24px降至17px；短窗口压缩顶部留白，列表和对话各自独立滚动，右下角 AI 星形入口保持可达。无边框标题条可拖动，交互元素显式排除拖动区域。关闭主界面不隐藏已打开的 AI；AI 已打开时再次调用只聚焦，手动移动后停止跟随，隐藏后重新打开才重新定位。

窗口本身是固定高度桌面容器；这不是共享网页表单上的表格高度约束。表单由弹窗独立滚动，顶部标题和底部保存保持可达。不要增加侧栏、统计卡片或多列控制台布局。

已确认的小卡片由完整主窗顶栏独立「收起为卡片」按钮进入：保持已选的标准440px或窄版340px宽度与上沿，用约180ms让底边向上收至176px；展开用约240ms向下恢复收起前高度，位置和尺寸均约束在当前屏幕可用区域内。标题栏52px持续保留，只有其下124px内容区切换。首页显示今天及逾期的未完成事项，有具体时间者优先，再按创建顺序排列；叠层卡显示当前一项，右侧只保留「新增事项」与「AI 助手」。可执行的 AI 建议最多显示一条并在卡片内部向下展开；未配置可用模型时仍保留建议栏，显示「请先配置AI大模型」并引导到 AI 配置页。440px和340px沿用相同结构。新增、AI与首页在内容区横向擦换；附着选择面板和模型菜单只让原生窗口向下临时延长，顶部、宽度和176px卡片本体不动。同一触发按钮再次点击收起面板。减少动态效果时取消位移、扫描与循环流光。收起或展开均不改变 AI 窗口与主窗置顶状态。

## Elevation & Depth

主窗口使用细边框与实色，无背景模糊依赖。AI 对话气泡用 CSS 阴影勾外形，不用系统矩形窗口阴影；模态编辑框使用轻阴影与半透明遮罩区分编辑层。不为每条事项或普通消息添加阴影卡片。

## Shapes

主面板18px圆角，普通按钮10px，卡片14px，下拉菜单12px。完成勾选框28px；开关与提示至少24px。AI 星形入口44px，右侧与底部均为12px；默认砖红色图标配浅暖色底，打开助手后使用砖红底白色图标。

小卡片保留18px外圆角，事项叠层与快捷操作12–14px、输入容器9px、确认与发送按钮7px；紧凑工具按钮22–24px，标题栏图标按钮30px。附着时间面板宽286px，优先级与标签面板宽220px。此密度仅限已确认的小卡片，不替换完整主窗控件规格。

## Components

- `src/ui.tsx` 的 IconButton 统一图标按钮名称、提示和尺寸；Modal 统一原生 dialog 的模态焦点、Escape、关闭恢复焦点以及未保存确认；Select 统一所有有限枚举下拉的触发器、圆角菜单和选中态；DatePicker / TimePicker 统一计划日期和时间的纸色圆角弹层；Segmented 统一两项互斥选择。
- `TaskEditor` 的展开态新增与 `MiniCard` 共用紧凑新增语法：标题栏放「新增事项」、待办/日程与「返回」，标题输入和「创建」组成单一主操作，时间安排、优先级、标签、进度与备注通过下方图标按需展开。新增弹窗在各工具开合与切换时保持同一宽高，较长内容只在内部详情区滚动；编辑既有事项仍使用完整表单。展开态与小卡片共用一列48个半小时档位，日期与提醒在同一面板；日程使用现有单一时间字段，地点或参与人可先写入备注。错误保留输入，使用 inline alert 和字段关联，不弹浏览器 alert/confirm/prompt。
- `SettingsPanel` 只保留「通用 / AI配置」两个页签，弹窗在页签切换时保持相同宽高，长内容在正文区内部滚动，底部保存状态与「完成」固定可达。通用页顶部提供标准/窄版窗口宽度双选并即时保存。开关即存、文本失焦保存；完成或切换页签前补存，显示保存中/已保存/失败。既有数据不再询问放弃已保存修改；未完成新建草稿关闭时确认。供应商预设先行，默认只显密钥和模型，地址与协议进高级设置，自定义自动展开。所有密钥在主进程加密，不回传。
- `AssistantApp` 是独立非模态的本地 AI 对话窗；顶部只保留身份、会话状态、新对话与关闭，历史对话及「保存在本机」位于次级栏，模型选择收进底部 composer。正文以普通用户/AI 对话为主并按流式增量可见；只有真实工具调用才以内嵌折叠区显示 running / complete / error / interrupted 和可见输出，不使用「执行轨迹」、固定总步数或虚构 Skill。每项 create / update / category 建议分别成为独立科技感卡片，可单选、多选、卡内编辑或预填「让 AI 调整」追问；待确认期间仍可自然追问，新一轮方案会把上一版标记为已更新。只有「应用所选」把当前选中卡片事务写入本地，放弃不写入。会话、草稿与可见过程由 SQLite 持久化，新建对话需确认，旧对话进入历史，重启不自动重放建议。对话区独立滚动，composer 固定留在底部；执行中发送位切换为「停止」并取消请求，初始加载失败提供「重试 / 关闭」。独立窗口在320–620px宽度内响应式收缩，窄宽时压缩次要控制并纵向排列 diff / 编辑表单；减少动态效果时停止流式光标和状态脉冲。本合同只适用于 standalone 分支；compact / `MiniCard` 收缩卡片完全不在本轮范围，既有结构、状态与视觉合同保持不变。
- `MiniCard` 首页显示一条可操作 AI 建议、当前事项叠层及「新增事项」「AI 助手」两个操作；未配置可用模型时，该位置显示「请先配置AI大模型」并打开 AI 配置页。待办可直接完成，标题进入完整编辑。卡片 AI 复用 `AssistantApp` / `AIConversation` 与本机会话；底部快捷指令随当前待办或日程变化，模型菜单在右下角按供应商分组。Pi Agent Loop 开始时不预估总步骤，只显示当前真实工具、已完成数量与不定进度，随后显示真实流式回复和处理记录；变更固定使用「放弃建议」/「应用 N 项」确认，绝不自动写入。长对话、历史与模型配置仍由独立助手或展开态承担。
- 每项最多关联一个自定义标签。列表与磁贴都显示色点和名称；标签筛选位于独立事项库。展开态与小卡片的新建标签共用16种低饱和预设色、相同选中态，按两行8色排列。删除标签只解除事项关联。
- 事项类型用标题旁的分段控制器切换待办/日程。展开态与小卡片共用同一组件语法：紧凑圆角外框、白色选中块及中间细分割线。待办表单为待办名称，日程表单为日程名称；切换时选中项约180ms滑动，下方表单随方向淡入。优先级、标签、状态、供应商类型与 AI 协议使用同一套自定义圆角下拉；优先级为高、中、低，新建待办默认为中，日程表单不显示优先级。待办时间可不填；日程必须填写时间。新增事项的计划时间使用与小卡片相同的单列半小时档位，不提供任意分钟；日期使用纸色圆角弹层，选中为 accent-soft。提醒时间仍用平台原生 datetime-local。
- 搜索是本地同步过滤，不发网络请求；清除按钮恢复输入焦点。输入提交防止中文 IME Enter 提前发送。
- 默认、hover、active、focus-visible、disabled、busy、error 与成功提示有明确状态。禁用使用真实 disabled；耗时 AI 可取消，45秒超时。
- 删除为软删除，可从已删除中恢复；无永久删除入口。事项删除先把按钮改成「确认删除」并抖动，再点一次才执行。AI 可以追问和解释；涉及事项的建议必须先预览，再确认，不能直接执行任意代码。展开版待确认时允许继续追问并以新方案替换旧方案；收缩卡片仍按既有单轮确认节奏工作。
- Phosphor regular 图标用于默认控件；fill 表达置顶、AI选中及已确认的优先级/标签颜色。图标不替代必要的文字或可访问名称。
- 控件仅有120ms颜色反馈；左上角 Logo 为品牌展示，悬停时红点绕圆环旋转；主窗收为176px卡片用约180ms向上收紧，展开用约240ms向下恢复，固定标题栏不参与内容切换。首页、新增与 AI 在124px内容区横向擦换，进入 AI 时使用低亮度暖色扫描提示；AI 内容卡片边框有缓慢暖色追光。附着面板和模型菜单约180ms向下展开；设置、事项编辑、待办/日程切换与删除确认沿用既有动效。减少动态效果时移除尺寸过渡、擦换、扫描和循环追光。
- 全局滚动条基础应用于所有滚动区域，不依赖附加 class；强制颜色模式交还系统。

## Do's and Don'ts

- 保持今日计划、单张「后续事项」卡（含明天、近期、更晚分组）与独立事项库层级；实用入口优先，不能恢复已弃用的时间线布局。
- AI 涉及的时间、事项变更必须可读、可确认；失败保留原文。
- 主窗底部只保留 AI 星形入口。今日复盘放在「今日计划」标题旁的更多操作中，支持键盘打开、Escape 关闭和弹窗关闭后恢复焦点。日期右侧「新增」和 Ctrl+N 进入手动表单；「事项库」和 Ctrl+F 进入跨日期搜索。方向键切换分段控件同步移动 DOM 焦点。
- 不把示例事项写入用户数据；测试使用隔离目录。
- 不承诺退出或关机时仍有提醒，不用淡色文字掩盖重要状态。

## 独立悬浮入口（暂时下线）

正式运行不创建悬浮入口窗口，也不显示标题栏、设置或托盘控制。`DOCK_FEATURE_ENABLED` 是唯一正式可用性开关，当前为关闭。72×72 窗口布局、`src/DockIcon.tsx`、`public/dock-icons/` 四款 SVG、自定义图片、IPC 以及用户保存的开关、位置、置顶和外观配置全部保留；关闭期间不清空或覆盖这些配置，后续恢复时可继续使用。新小卡片的 `mainCollapsed` 仍独立保存，与旧 `compact` 迁移及 Dock 配置无关。
