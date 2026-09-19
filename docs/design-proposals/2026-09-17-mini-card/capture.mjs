import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const dir = fileURLToPath(new URL('.', import.meta.url));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 740 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('preview.html', import.meta.url).href);
  await page.screenshot({ path: `${dir}/overview.png`, fullPage: true });
  await page.locator('#home').screenshot({ path: `${dir}/home.png`, scale: 'css' });
  async function checkBounds() {
    for (const id of ['home', 'tasks', 'ai', 'confirm']) {
      const result = await page.locator(`#${id}`).evaluate(el => {
        const r = el.getBoundingClientRect();
        const buttons = [...el.querySelectorAll('button')].filter(b => !b.closest('.list'));
        return { height: r.height, overflow: el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth,
          clipped: buttons.some(b => { const q = b.getBoundingClientRect(); return q.bottom > r.bottom || q.right > r.right; }) };
      });
      assert.equal(result.height, 150, id);
      assert.equal(result.overflow, false, `${id}: no container overflow`);
      assert.equal(result.clipped, false, `${id}: controls visible`);
    }
  }
  await checkBounds();
  await page.locator('#home').getByRole('button', { name: '下一件待办', exact: true }).click();
  assert.ok(await page.locator('#home').getByText('整理收件箱', { exact: false }).isVisible());
  await page.locator('#home').getByRole('button', { name: '新增事项', exact: true }).click();
  await page.locator('#home').getByLabel('事项标题').fill('新增演示待办');
  await page.locator('#home').getByRole('button', { name: '添加待办', exact: true }).click();
  assert.ok(await page.locator('#home').getByText('新增演示待办', { exact: true }).isVisible());
  await page.locator('#tasks .check').first().click();
  assert.equal(await page.locator('#tasks .task.done').count(), 1);
  await page.locator('#ai').getByLabel('AI 对话输入').fill('把报告改到三点');
  await page.locator('#ai').getByRole('button', { name: '发送', exact: true }).click();
  await page.locator('#ai').getByRole('button', { name: '确认修改', exact: true }).click();
  assert.ok(await page.locator('#ai').getByText('已把「完成项目报告」改到今天 15:00。').isVisible());
  await page.getByRole('button', { name: '重置体验', exact: true }).click();
  await page.getByRole('button', { name: '窄宽 340 px' }).click();
  await checkBounds();
  await page.screenshot({ path: `${dir}/narrow.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${dir}/mobile.png`, fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('Verified: 150 px fixed height at 440/340 px widths; controls fit; task paging, adding, completion, AI sending/confirmation work; no page errors.');
} finally { await browser.close(); }
