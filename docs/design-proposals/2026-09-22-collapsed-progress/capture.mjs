import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = import.meta.dirname;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 980, height: 860 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.join(dir, 'preview.html')).href);
await page.waitForTimeout(200);
await page.screenshot({ path: path.join(dir, 'collapsed-progress.png'), fullPage: true });
await browser.close();
console.log('saved');
