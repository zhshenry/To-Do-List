// 真机验证：展开态 AI 助手面板 + 流光边。worktree 根目录运行：
// `node tooling/capture-glow.mjs <输出目录>`
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const outputDir = path.resolve(process.argv[2]);
await mkdir(outputDir, { recursive: true });
const output = path.join(outputDir, 'verify-assistant-glow.png');
await mkdir('test-results', { recursive: true });
const dataDir = await mkdtemp(path.join(path.resolve('test-results'), 'capture-'));
const env = { ...process.env, TODO_TEST: '1', TODO_TEST_DATA: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
delete env.VITE_DEV_SERVER_URL;

const app = await electron.launch({ args: [process.cwd()], env, timeout: 30000 });
const page = await app.firstWindow();
page.setDefaultTimeout(12000);
await page.locator('.today-board').waitFor();

await page.getByLabel('打开 AI 助手').click();
await page.locator('.assistant-overlay').waitFor();
const glow = await page.evaluate(() => {
  const style = getComputedStyle(document.querySelector('.assistant-overlay'), '::before');
  return { animationName: style.animationName, content: style.content };
});
if (glow.animationName !== 'assistant-border-glow') throw new Error(`glow animation missing: ${JSON.stringify(glow)}`);
await page.evaluate(() => { for (const animation of document.getAnimations()) { try { animation.finish(); } catch {} } });
await page.waitForTimeout(400);
await page.screenshot({ path: output, timeout: 3000 });
await app.close();
console.log(`glow verified (${glow.animationName}); saved ${output}`);
