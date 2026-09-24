import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = import.meta.dirname;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.join(dir, 'preview.html')).href);
await page.waitForTimeout(300);
await page.locator('.shot').first().screenshot({ path: path.join(dir, '23-horizontal-proposal.png') });
await page.locator('.shot').nth(1).screenshot({ path: path.join(dir, '23-current-compare.png') });
console.log('saved 23-horizontal-proposal.png / 23-current-compare.png');
await browser.close();
