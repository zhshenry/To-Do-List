import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const dir = import.meta.dirname;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 680, height: 900 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.join(dir, 'options.html')).href);
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(dir, 'assistant-options.png'), fullPage: true });
await browser.close();
console.log('saved');
