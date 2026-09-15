# To Do List · Windows 悬浮待办

基于已确认视觉稿开发的第一版真实桌面应用。Electron + React + TypeScript，使用 Electron 内置 Node.js 的 SQLite；用户不需要安装 Node.js、Python 或 SQLite。

## 下载与运行（默认免安装版）

默认把 `release/portable/To Do List-0.4.0-Windows-x64-Portable.zip` 提供给用户：

1. 将 ZIP 完整解压到任意普通文件夹。
2. 双击其中的 `To Do List.exe`。
3. 整个解压目录必须一起保留，不能只复制 exe，也不要直接在压缩包预览窗口中运行。

需要开始菜单、桌面快捷方式或卸载入口时，再提供可选安装版 `release/installer/To Do List Setup-0.4.0-x64.exe`。

升级免安装版时，先从托盘右键退出旧版本，再解压新版并替换整个程序目录。任务数据独立保存在 `%APPDATA%/To-Do-List`，更换程序目录不会清空事项；仍建议升级前从设置导出一次备份。

本版针对 Windows x64，当前实测 Windows 11；尚未在干净 Windows 10/ARM64 上验证。不提供 macOS 构建。安装包尚未购买代码签名证书，Windows 可能提示发布者未验证。

## 日常使用

- 拖动顶栏移动，图钉切换置顶；右上角收起成小条。
- “−”隐藏到托盘，不退出；点击托盘或 `Ctrl + Shift + Space` 再显示。快捷键被其他软件占用时使用托盘。
- 点“+”填写名称、分类、计划日期、事项时间、提醒时间和备注；事项时间与提醒时间是两个独立字段。分类可自定义名称和颜色，删除分类只会把关联事项变为“未分类”。
- 下方默认普通记录：回车创建“今天、未分类、无事项时间、无提醒”的待办；需要具体时间时，点击事项进入编辑器填写。点星形打开或隐藏独立 AI 悬浮窗，主清单不会被替换；AI 默认关闭，设置后才可用。
- 点列表条目编辑，点方框完成；从“全部事项 → 已删除”恢复误删事项。
- 到期事项可“稍后10分钟”。未完成任务跨天保留，不自动篡改原截止时间。
- 设置里可启用登录启动、发测试提醒、导出 JSON 备份、打开数据目录。
- 托盘右键“退出（停止提醒）”才结束进程。关机、睡眠和应用退出期间无法发通知；重新启动/唤醒后补查未送达提醒。Windows 勿扰模式或通知权限可能阻止弹出。

## AI 设置和隐私

在设置中展开“AI 助手”，填写兼容 Chat Completions + JSON 输出的服务地址（通常以 `/v1` 结尾）、模型名称及 API Key，然后启用 AI。支持本机 `http://127.0.0.1` / localhost 服务；远程要求 HTTPS。当前不实现其他厂商专有协议或工具执行。

例：先说“明天下午产品评审”，AI 可以在独立悬浮窗中追问具体时间；回复“3点，提前10分钟提醒”后，会给出完整建议。你也可以继续讨论“把项目报告改到周五下午5点”或“总结今天的工作”。主清单始终可见，AI 窗口可拖动，并可在 320×420 到 620×820 之间缩放。所有新增和修改都必须点击“应用”才会写入，也可以直接放弃。有歧义时模型应继续提问。请自行核对时间和任务对象，模型输出不保证正确。

每次 AI 发送会上传本次输入、当前对话最近6轮、已有分类和最近最多120条任务（每条备注最多1000字）到用户配置的服务；AI 只能引用已有分类，不能自行创建或删除分类。对话只存在于当前程序运行期间，隐藏或关闭 AI 悬浮窗不会清空；点击“新对话”或完全退出应用后清空，不写入 SQLite。不自动上传，不提供自己的云端服务或遥测。API Key 使用 Windows 系统加密保存，不进入渲染进程或任务备份；任务正文保存在本地 SQLite，**不做数据库加密**。模型费用由服务方收取。

## 数据与备份

实际目录以设置中的“打开数据目录”为准，继续使用 `%APPDATA%/To-Do-List` 以兼容旧版本数据。`tasks.db` 包含任务、分类与设置；运行中可能还有 `tasks.db-wal` 和 `tasks.db-shm`。迁移完整数据库前先从托盘退出应用，不要运行中只复制单个 db。JSON 导出不含密钥；本版尚无 JSON 导入入口。卸载默认保留用户数据。

原始 `SKILL.md` 和 `scripts/` 保留，未自动读取或迁移原 Skill 的外部日记文件。桌面应用数据与原脚本数据独立。

## 开发与验证

需要 Node.js 24+，在本仓库运行：

```powershell
npm ci
npm run setup:runtime
npm run dev
```

修改主进程或 preload 后重启开发进程；React/CSS 支持热更新。

```powershell
npm test
npm run build
npm run test:desktop
npm run dist:win       # 默认：只生成免安装版
npm run dist:installer # 同时生成免安装版和可选安装版
```

运行时下载必须通过官方 SHA256 校验，不关闭 TLS 校验。打包可复用已安装运行时：

```powershell
npm run dist:portable
```

测试使用独立 `test-results/desktop-*` SQLite，测试提醒是记录调度结果，不会向系统发送示例任务通知。真实 AI 需要用户密钥，自动测试使用本机模拟服务器，不能据此声称所有模型已兼容。

## 目录

- `electron/`：窗口、托盘、通知、加密、SQLite、AI 网络与 IPC。
- `shared/contracts.ts`：共享 Zod 校验和类型。
- `src/`：悬浮面板、编辑、设置与交互状态。
- `tests/`、`tooling/desktop-test.mjs`：数据与真实桌面流程测试。
- `docs/approved-design.png`、`docs/approved-ai-floating-design.png`、`DESIGN.md`、`UX-CONTRACT.md`、`design-qa.md`：视觉来源、设计规范与验证记录。
- `release/portable/`：默认对外提供的完整免安装目录和 ZIP；`release/installer/`：可选安装包；`release/archive/`：旧版发布物。

当前没有重复任务、云同步、自动更新、语音输入或多设备功能；AI 对话也不跨重启保存。优先把 Windows 单机记录和提醒做好。
