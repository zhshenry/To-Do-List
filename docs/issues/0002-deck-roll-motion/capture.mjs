import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const target = path.join(import.meta.dirname, 'preview.html');
const output = path.join(import.meta.dirname, 'deck-roll-demo.png');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(target).href);
await page.waitForTimeout(300);

// 触发一次「下一项」滚动，等待动画完成后的落位状态
await page.locator('.pager-next').first().click();
await page.waitForTimeout(500);
const card = page.locator('.stage .mini-window');
await card.screenshot({ path: output });
await browser.close();
console.log(`saved ${output}`);
