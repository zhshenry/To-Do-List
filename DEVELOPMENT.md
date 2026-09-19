# 开发与发布指南

面向本项目的开发与维护者。用户文档见 [README.md](README.md)，版本变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## 开发环境

需要 Node.js 24+，在本仓库运行：

```powershell
npm ci
npm run setup:runtime
npm run dev
```

仓库自带 `.npmrc`（`omit=`），防止部分环境的 `omit=dev` 配置把构建依赖剪掉；不要删除。若 electron 二进制下载超时，设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后重跑 `npm run setup:runtime`。

修改主进程或 preload 后重启开发进程；React/CSS 支持热更新。

## 测试与构建

```powershell
npm test
npm run build
npm run test:desktop
npm run dist:win       # 默认：只生成免安装版
npm run dist:installer # 同时生成免安装版和可选安装版
npm run dist:portable  # 复用已安装运行时，只做免安装版
```

- 测试使用独立 `test-results/` SQLite，不读取真实事项或密钥，不发送系统示例通知；AI 使用本机模拟流式服务器，验证真实 Pi 工具循环与渲染，不代表所有远程模型兼容。
- `tooling/ux-smoke.mjs` 是当前桌面测试入口；旧版 `tooling/desktop-test.mjs` 仅存档。
- `tooling/packaged-smoke.mjs` 按需解压 `release/portable/*.zip` 到临时目录验证打包产物，结束后自动清理。
- electron-builder 二进制下载超时时，设置 `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`。

## 发布流程（顺序固定，缺一不可）

前置条件：本机已安装并登录 GitHub CLI（`winget install GitHub.cli` + `gh auth login`）。

1. **版本与日志**：在 [CHANGELOG.md](CHANGELOG.md) 顶部写入本版变更（Keep a Changelog 格式），更新 `package.json` 版本号。工作区干净时 `npm version patch|minor` 会自动生成提交与标签；有未提交改动则先提交，或手动改版本号后 `git tag vX.Y.Z`。
2. **推送**：`git push origin main --tags`。发布脚本用 `--verify-tag`，要求标签已先存在于远端——因此代码推送是发布的前置动作，不可跳过。
3. **发布**：`npm run release`。构建 NSIS 安装包与免安装包，上传安装器、blockmap、latest.yml、免安装包与 SHA256SUMS 到 GitHub Releases。产物文件名统一为连字符格式（与 latest.yml 一致），保证自动更新下载 URL 可达。
4. **核验**：确认 Release 为正式版（非 Draft、非 Pre-release，electron-updater 只从正式 Release 发现新版本）；`latest.yml` 的 version 与资产名一致；连字符安装包 URL 返回 HTTP 200。

### 发布红线（历史踩坑，勿重蹈）

- 产物文件名禁止含空格：GitHub 会把空格归一化为点号，与 latest.yml 的连字符 url 不一致导致自动更新 404。命名由 `package.json` 的 `artifactName` 与 `tooling/package-release.ps1` 统一控制。
- gh 的 `file#label` 语法只改资产显示标签，不改下载名，不能用于对齐命名。
- `tooling/publish.mjs` 会校验 `latest.yml` 版本与 `package.json` 一致，报错时先完整重跑 `npm run dist:installer`，不要手工修补元数据。
- 免安装版不含自动更新（打包时剥离 `app-update.yml`，运行时也按该文件存在性门控）；只有安装版走更新链路。
- 本地 `release/archive/` 的历史产物在 GitHub Releases 均有存档，可随时整目录删除释放磁盘。

## 目录说明

- `electron/`：窗口、托盘、通知、加密、SQLite、Pi 助手循环与 IPC。
- `shared/contracts.ts`：共享 Zod 校验和类型。
- `src/`：悬浮面板、编辑、设置与交互状态。
- `tests/`、`tooling/ux-smoke.mjs`：数据与当前真实桌面流程测试。
- `docs/`：视觉来源、设计规范与验证记录。
- `release/portable/`：对外免安装 ZIP（只保留 zip）；`release/installer/`：安装包与更新 blockmap；`release/archive/`：构建新版时自动归档的上一版产物（可随时删除）。
- `CLAUDE.md`：AI 编码助手的项目守则。
