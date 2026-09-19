import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const tag = `v${version}`;

function fail(message) { console.error(message); process.exit(1); }

if (spawnSync('gh.exe', ['--version'], { stdio: 'ignore' }).status !== 0) {
  fail('未检测到 GitHub CLI。请先安装并登录：winget install GitHub.cli，然后运行 gh auth login。');
}

// Artifact names are hyphenated by design (package.json artifactName + the portable zip
// naming in package-release.ps1) so local files, latest.yml urls and gh asset names are
// identical — spaces would mangle into dots on GitHub and break auto-update downloads.
const files = [
  `release/installer/To-Do-List-Setup-${version}-x64.exe`,
  `release/installer/To-Do-List-Setup-${version}-x64.exe.blockmap`,
  'release/metadata/latest.yml',
  `release/portable/To-Do-List-${version}-Windows-x64-Portable.zip`,
  'release/SHA256SUMS.txt',
].map(file => path.join(root, file));
const missing = files.filter(file => !existsSync(file));
if (missing.length) fail(`缺少发布产物（当前版本 ${version}），请先完整运行 npm run dist:installer：\n${missing.join('\n')}`);

// A stale latest.yml (e.g. left from an earlier version) would silently poison auto-update metadata.
const metadata = readFileSync(path.join(root, 'release/metadata/latest.yml'), 'utf8');
const metadataVersion = /^version:\s*(\S+)/m.exec(metadata)?.[1];
if (metadataVersion !== version) {
  fail(`release/metadata/latest.yml 的版本是 ${metadataVersion ?? '无法解析'}，与 package.json 的 ${version} 不一致；请先完整运行 npm run dist:installer 重新生成产物。`);
}

const notes = [
  `Windows x64，版本 ${version}。`,
  '- 安装版（Setup）内置自动更新，之后的新版本会在应用内自动下载安装；',
  '- 免安装版（Portable）需手动下载解压替换，事项数据保存在 %APPDATA%/To-Do-List。',
].join('\n');
const result = spawnSync('gh.exe', ['release', 'create', tag, '--verify-tag', ...files, '--title', `To Do List ${version}`, '--notes', notes], { stdio: 'inherit' });
if ((result.status ?? 1) === 0) {
  console.log(`已发布 ${tag}。所有历史版本均已存档在 GitHub Releases，本地 release/archive 可安全删除以释放磁盘。`);
}
process.exit(result.status ?? 1);
