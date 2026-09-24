import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const shots = [
  ['s-local', 'insight-local.png'],
  ['s-ai', 'insight-ai.png'],
  ['s-ai-open', 'insight-ai-open.png'],
  ['s-off', 'insight-off.png'],
];

const dir = import.meta.dirname;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.join(dir, 'preview.html')).href);
await page.waitForTimeout(300);
for (const [id, file] of shots) {
  await page.locator(`#${id} .frame`).screenshot({ path: path.join(dir, file) });
  console.log('saved', file);
}
await browser.close();
