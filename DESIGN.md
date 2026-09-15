---
version: alpha
name: To Do List
description: Windows 桌面的米白色悬浮待办，以时间线和暖棕色提示下一件事。
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
  completed: "#807a73"
typography:
  sans:
    fontFamily: '"Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
rounded:
  DEFAULT: "18px"
  control: "10px"
spacing:
  content-inset: "24px"
  narrow-inset: "17px"
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
---

# To Do List Design System

## Overview

用户确认“方案3布局 + 方案1色调字体”，以确认稿为参考；Windows 实用性优先。面向个人在工作桌面上随手记录、查看下一项与接收提醒，非营销页面。中文 UI 不代表额外推断任何地域市场。当前只支持 Windows 桌面，浅色模式。

主视觉是像桌面便笺一样安静的米白面板：上方下一项的大时间、纵向时间线、底部暖棕色输入。左上角使用用户提供的圆环红点 Logo；应用、托盘与通知使用用户确认的第3版米白圆角图标。设计稿中的桌面背景不属于产品。

Token 所有权：`src/styles.css` 是运行时唯一来源，本文件为 Model B 人工维护镜像；不从 Markdown 生成 CSS。变更时同时核对本文件与 CSS，严格审查重复控件和新增硬编码。

## Colors

paper 是主背景，titlebar 区分拖动条；ink 用于正文及标题，muted 为辅助文字。accent 用于焦点、发送按钮、时间线节点，danger 只用于错误与删除。line 只做弱分隔，不能代替焦点状态。高对比度模式遵循系统色；没有自动深色主题。

## Typography

使用 Windows 系统字体及微软雅黑回退，中文控制文案不使用斜体。正文14px，任务标题16px，日期23px，下一项时间48px；时间使用等宽数字特性。长任务名称在列表换行，在下一项区域省略，点击可查看全文。

## Layout

展开窗口440×700 CSS px，小条340×116，桌面可用区域内定位。AI 助手是独立的380×620 CSS px悬浮窗口，首次打开优先停靠在主窗口右侧，空间不足时放到左侧，可在320×420至620×820之间拖动缩放。窄窗口内容内边距由24px降至17px；短窗口压缩顶部留白，列表和对话各自独立滚动，底部输入保留。无边框标题条可拖动，交互元素显式排除拖动区域。

窗口本身是固定高度桌面容器；这不是共享网页表单上的表格高度约束。表单由弹窗独立滚动，顶部标题和底部保存保持可达。不要增加侧栏、统计卡片或多列控制台布局。

## Elevation & Depth

主窗口使用细边框与实色，无背景模糊依赖。AI 悬浮窗使用系统窗口阴影但没有遮罩；模态编辑框使用轻阴影与半透明遮罩区分编辑层。不为每条任务或普通消息添加阴影卡片。

## Shapes

主面板18px圆角，普通按钮10px，表单输入8px。时间线是15px圆点，完成动作是方形勾选框，两者职责不同。发送按钮为圆形。

## Components

- `src/ui.tsx` 的 IconButton 统一图标按钮名称、提示和尺寸；Modal 统一原生 dialog 的模态焦点、Escape、关闭恢复焦点以及未保存确认。
- `TaskEditor` 是新增和编辑唯一入口；共享 Zod 合同校验。错误保留输入，使用 inline alert 和字段关联，不弹浏览器 alert/confirm/prompt。
- `SettingsPanel` 是配置唯一入口；分类管理直接可见，AI 设置默认折叠。密钥遮罩、可切换显示，已保存密钥从不回传渲染进程。原生文件保存和数据目录操作由 Windows 拥有。
- `AssistantApp` 是独立、非模态的 AI 悬浮窗口；`AIConversation` 负责其消息与建议区域。用户消息使用 accent-soft，助手消息使用 titlebar，事项建议使用白色确认卡；主待办列表始终保持可见。关闭悬浮窗仅隐藏，顶部“新对话”显式清空，完全退出应用后会话消失。
- 每项最多关联一个自定义分类。列表显示小色点和名称，顶栏原生 select 负责筛选；删除分类只解除任务关联，不删除任务。
- 日期、日期时间与有限枚举 select 明确使用平台原生控件，接受 Windows/Chromium 弹层的形状和语言规则。不声称自定义弹层像素或跨平台一致。
- 搜索是本地同步过滤，不发网络请求；清除按钮恢复输入焦点。输入提交防止中文 IME Enter 提前发送。
- 默认、hover、active、focus-visible、disabled、busy、error 与成功提示有明确状态。禁用使用真实 disabled；耗时 AI 可取消，45秒超时。
- 删除为软删除，可从已删除中恢复；无永久删除入口。AI 可以追问和解释；涉及事项的建议必须先预览，再确认，不能直接执行任意代码。待确认时暂停新消息，应用或放弃后才可继续。
- Phosphor regular 图标用于控件，fill 仅表达置顶和AI选中状态。图标不替代必要的文字或可访问名称。
- 仅有120ms颜色反馈，不使用装饰运动；减少动态效果设置移除过渡。
- 全局滚动条基础应用于所有滚动区域，不依赖附加 class；强制颜色模式交还系统。

## Do's and Don'ts

- 保持下一项、时间线与快捷记录的层级；实用入口比装饰优先。
- AI 涉及的时间、任务变更必须可读、可确认；失败保留原文。
- 普通快速记录固定为今天、未分类、无事项时间、无提醒；需要时间时进入事项编辑器填写。
- 不把示例任务写入用户数据；测试使用隔离目录。
- 不承诺退出或关机时仍有提醒，不用淡色文字掩盖重要状态。
