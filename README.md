# To Do List · Windows 悬浮待办

Windows 桌面悬浮待办与 AI 日程助手。Electron + React + TypeScript，内置 SQLite，无需安装 Node.js。

## 主要功能

- 悬浮卡片 + 主界面双形态：今日待办/日程/逾期提醒一目了然，支持"稍后 10 分钟"、托盘常驻、登录自启。
- 待办、日程、标签、优先级、进度与备注；事项库提供全量搜索、筛选、恢复与批量处理。
- 可选 AI 助手：自然语言记录与调整安排，逐项确认后才写入；对话与数据保存在本机。
- JSON 备份/导出；安装版内置自动更新。

## 下载与运行

- **安装版（推荐）**：从 [GitHub Releases](https://github.com/zhshenry/To-Do-List/releases) 下载 `To-Do-List-Setup-x64.exe` 安装，内置自动更新。
- **免安装版**：下载 Portable ZIP 解压到任意文件夹，运行其中的 `To Do List.exe`；升级时整体替换目录。
- 事项数据保存在 `%APPDATA%/To-Do-List`，升级或卸载不会清空。
- Windows x64（实测 Windows 11）；安装包未签名，首次安装可能提示"发布者未验证"。

## AI 与隐私

- 在 设置 → AI 中选择供应商、填写 API Key 与模型即可启用；API Key 使用 Windows 系统加密。
- 每次 AI 对话会上传输入内容、最近对话与事项摘要到你所配置的模型服务；事项与对话本机 SQLite 存储，无自有云、无遥测，模型费用由服务方收取。

## 开发者

构建、测试与发布流程见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 版本历史

更新日志见 [CHANGELOG.md](CHANGELOG.md)，各版本下载见 [GitHub Releases](https://github.com/zhshenry/To-Do-List/releases)。
