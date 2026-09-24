import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const shots = [
  ['s-expanded-picker', 'expanded-picker.png'],
  ['s-expanded-slash', 'expanded-slash.png'],
  ['s-expanded-ask', 'expanded-ask.png'],
  ['s-expanded-md', 'expanded-md-compare.png'],
  ['s-overlay-context', 'overlay-context.png'],
  ['s-mini-default', 'mini-default.png'],
  ['s-mini-default-linked', 'mini-default-linked.png'],
  ['s-mini-picker', 'mini-picker.png'],
  ['s-mini-ask', 'mini-ask.png'],
  ['s-mini-answer', 'mini-answer.png'],
  ['s-mini-answer-hover', 'mini-answer-hover.png'],
];

const dir = import.meta.dirname;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1560, height: 2300 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.join(dir, 'preview.html')).href);
await page.waitForTimeout(300);
for (const [id, file] of shots) {
  await page.locator(`#${id} .frame`).screenshot({ path: path.join(dir, file) });
  console.log('saved', file);
}
await browser.close();
