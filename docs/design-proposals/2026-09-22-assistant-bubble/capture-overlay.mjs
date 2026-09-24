import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = import.meta.dirname;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 480, height: 980 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.join(dir, 'overlay.html')).href);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(dir, 'assistant-overlay.png'), fullPage: true });
await browser.close();
console.log('saved');
