import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const target = path.join(import.meta.dirname, 'preview.html');
const output = path.join(import.meta.dirname, 'title-font-a-b.png');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(target).href);
await page.waitForTimeout(300);
await page.screenshot({ path: output, fullPage: true });
await browser.close();
console.log(`saved ${output}`);
