# docs/issues · 队列索引

> **本文件由 SDD 流水线每轮自动重建，请勿手编。** 状态详情见各档案 README；
> 流水线规则见 [CHARTER.md](./CHARTER.md)。**备注列必须标注各关口决策来源**：
> `来源:用户(/approve|聊天)` 或 `来源:jev(v2, 逐命题概率)`（与档案决策记录一致）。
>
> 最近重建：2026-09-24 11:45（例行轮）。
> 用户指示：全部在途单均属 0.6.0 线，不再按标签占用报并发提示。

| Issue | 档案 | 类型 | 涉及UI | 状态 | 备注 |
|---|---|---|---|---|---|
| [#1](https://github.com/zhshenry/To-Do-List/issues/1) 收起状态下的卡片日期展示优化 | [0001-mini-card-time-label](./0001-mini-card-time-label/) | 优化 | 是 | **已归档** | ✅ 已合入 main（a0a1353）；来源:spec=用户(聊天)/验收=用户(聊天) |
| [#2](https://github.com/zhshenry/To-Do-List/issues/2) 收起状态下的卡片展示动效优化 | [0002-deck-roll-motion](./0002-deck-roll-motion/) | 优化 | 是 | **已归档** | ✅ 已合入 main（f833086）；来源:spec=用户(聊天)/验收=用户(聊天) |
| [#3](https://github.com/zhshenry/To-Do-List/issues/3) 收起状态下的卡片展示图标优化 | [0003-pager-compact](./0003-pager-compact/) | 优化 | 是 | **已归档** | ✅ 已合入 main（499992f）；来源:spec=用户(聊天)/验收=用户(聊天) |
| [#4](https://github.com/zhshenry/To-Do-List/issues/4) 已完成的任务还在待办里面，原则上应该只在事项库了 | [0004-completed-out-of-todo](./0004-completed-out-of-todo/) | 缺陷 | 否 | **已归档** | ✅ 已合入 main（fd09eac）；来源:spec=用户(/approve)/验收=用户(聊天) |
| [#5](https://github.com/zhshenry/To-Do-List/issues/5) 项目README.MD简化 | [0005-readme-simplify](./0005-readme-simplify/) | 文档 | 否 | **已归档** | ✅ 已合入 main（204354e）；来源:spec=用户(聊天)/验收=用户(/approve) |
| [#6](https://github.com/zhshenry/To-Do-List/issues/6) 展开状态下的事项参考收起状态下的事项优化 | [0006-board-row-redesign](./0006-board-row-redesign/) | 优化 | 是 | **已归档** | ✅ 已合入 main（0fcb439）；来源:spec=用户(聊天 v2 修订)/验收=用户(聊天) |
| [#7](https://github.com/zhshenry/To-Do-List/issues/7) 方块视图下格式问题 | [0007-tiles-redesign](./0007-tiles-redesign/) | 优化 | 是 | **已归档** | ✅ 已合入 main（261a562）；来源:spec=用户(/reject 修订后批准)/验收=用户(/approve) |
| [#8](https://github.com/zhshenry/To-Do-List/issues/8) 收起状态下卡片里事项名称过大 | [0008-title-font-size](./0008-title-font-size/) | 优化 | 是 | **已归档** | ✅ 已合入 main（2e64113）；来源:spec=用户(/approve)/验收=用户(/approve) |
| [#9](https://github.com/zhshenry/To-Do-List/issues/9) 收起状态下确认完成按钮过大 | [0009-confirm-btn-compact](./0009-confirm-btn-compact/) | 优化 | 是 | **已归档** | ✅ 已合入 main（f94e3ae）；来源:spec=用户(/approve)/验收=用户(/approve)；实现中发现并修复 styles.css 层叠遮蔽 |
| [#10](https://github.com/zhshenry/To-Do-List/issues/10) 收起状态下确认完成方式统一化 | [0010-confirm-unify](./0010-confirm-unify/) | 优化 | 是 | **已取消** | 零改动提案获认可（0.5.9 已实现），用户 /discard；来源:spec=jev(v2, deny:ui)/终止=用户(/discard) |
| [#11](https://github.com/zhshenry/To-Do-List/issues/11) 收起状态下AI建议看不出来是什么内容 | [0011-insight-broadcast](./0011-insight-broadcast/) | 优化 | 是 | **已归档** | ✅ 已合入 main（776c38a）；来源:spec=用户(/approve)/验收=用户(/approve) |
| [#12](https://github.com/zhshenry/To-Do-List/issues/12) 展开模式下点击右下角的"打开AI助手"的若干问题 | [0012-assistant-glow](./0012-assistant-glow/) | 优化 | 是 | **已归档** | ✅ 已合入 main（c49d633）；来源:spec=用户(/approve)/验收=用户(/approve) |
| [#13](https://github.com/zhshenry/To-Do-List/issues/13) 在鼠标放到向上切换的按钮时，能看到这个按钮和隔壁的页码有重叠 | [0013-pager-gap](./0013-pager-gap/) | 优化 | 是 | **已归档** | ✅ 已合入 main（50781b7）；来源:spec=用户(/approve)/验收=用户(/approve)；两次 /reject 打回修订（v3 起改真机证据） |
| [#14](https://github.com/zhshenry/To-Do-List/issues/14) 针对展开状态下的页面，待办和日程各占屏幕上下一半（固定高度、各自内部滚动） | [0014-fixed-split](./0014-fixed-split/) | 优化 | 是 | **已归档** | ✅ 已合入 main（0.5.10 线）；来源:spec=用户(/approve 含 55:45 比例)/验收=用户(聊天) |
| [#15](https://github.com/zhshenry/To-Do-List/issues/15) AI模型新增单独的RLCD模型配置区域 | [0015-rlcd-config](./0015-rlcd-config/) | 功能 | 是 | **已归档** | ✅ 已合入 main（023d18a，叠合 sdd/0017 预解冲突 + 试合树哈希一致 + build/冒烟全绿）；来源:spec=用户(/approve 11:15)/accept=jev(v3, deny:type)/验收=用户(/approve 20:25) |
| [#16](https://github.com/zhshenry/To-Do-List/issues/16) 折叠状态下点击确认按钮挤压标题 | [0016-armed-squeeze](./0016-armed-squeeze/) | 缺陷 | 是 | **已归档** | ✅ 已合入 main（efe18d3 @ sdd/0014 合入，0.5.10 线）；来源:spec=用户(/approve)/验收=用户(聊天) |
| [#17](https://github.com/zhshenry/To-Do-List/issues/17) AI 助手回复 Markdown 渲染（展开态渲染 + 折叠态降级/悬浮预览） | [0017-md-render](./0017-md-render/) | 功能 | 是 | **已归档** | ✅ 已合入 main（fa2b64c，试合树哈希一致 + build/冒烟全绿）；来源:spec=用户(/approve 09:36)/accept=jev(v3, deny:type)/验收=用户(/approve 20:25) |
| [#18](https://github.com/zhshenry/To-Do-List/issues/18) AI 对话支持关联已有事项（＋/​/ 选择，单选聚焦上下文） | [0018-task-context](./0018-task-context/) | 功能 | 是 | **已归档** | ✅ 已合入 main（97e2297，叠合零冲突 + 试合树哈希一致 + build/冒烟全绿）；来源:spec=用户(/approve 00:11)/accept=jev(v3, deny:type)/反馈修订=用户(评论→chip 左上)/验收=用户(/approve 11:24) |
| [#19](https://github.com/zhshenry/To-Do-List/issues/19) AI 助手澄清提问工具 ask_user（循环中途向用户提问） | [0019-ask-user](./0019-ask-user/) | 功能 | 是 | **已归档** | ✅ 已合入 main（516d304，叠合预解冲突 + 试合树哈希一致 + build/冒烟全绿）；来源:spec=用户(/approve 09:46)/accept=jev(v3, deny:type)/验收=用户(/approve 22:16) |
| [#20](https://github.com/zhshenry/To-Do-List/issues/20) AI助手对话框中，左侧AI助手的图标错位了 | [0020-assistant-avatar-offset](./0020-assistant-avatar-offset/) | 缺陷 | 是 | **已归档** | ✅ 已合入 main（57c653e，试合树哈希一致 + build/冒烟全绿）；来源:spec=用户(/approve 09:13)/accept=jev(v3, deny:ui)/验收=用户(/approve 10:32) |
| [#21](https://github.com/zhshenry/To-Do-List/issues/21) AI 建议真 AI 化（折叠卡建议条 · 渐进式增强） | [0021-insight-ai](./0021-insight-ai/) | 功能 | 是 | **已归档** | ✅ 已合入 main（a45f5a9，叠合预解四处冲突 + 试合树哈希一致 + build/冒烟全绿）；来源:spec=用户(/approve 09:47)/accept=jev(v3, deny:type)/反馈=用户(聊天→修订 22:34)/验收=用户(/approve 23:57) |
| [#22](https://github.com/zhshenry/To-Do-List/issues/22) 组件尺寸归档（阶 token 化 + 存量视觉等价归并） | [0022-size-tokens](./0022-size-tokens/) | 优化 | 是 | **已归档** | ✅ 已合入 main（a36c92f，一期+二期）；来源:spec=用户(/approve)/验收=用户(/approve 10:47 + 预合并同轮) |
| [#23](https://github.com/zhshenry/To-Do-List/issues/23) 折叠状态下的AI应用卡片的下面标签、时间等卡片内容是往下滚动的 | [0023-mini-card-horizontal](./0023-mini-card-horizontal/) | 优化 | 是 | **已归档** | ✅ 已合入 main（4c1b6dd，叠合预解冲突 + 试合树哈希一致 + build/冒烟全绿）；来源:spec=用户(/approve 09:13)/accept=jev(v3, HUMAN_REVIEW: A2=0.41/A5=0.14/A6=0.86/A8=0.63)/验收=用户(/approve 11:34) |
