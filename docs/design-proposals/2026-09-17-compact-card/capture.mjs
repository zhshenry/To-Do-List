import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const dir = fileURLToPath(new URL('.', import.meta.url));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('preview.html', import.meta.url).href);
  await page.screenshot({ path: `${dir}/comparison.png`, fullPage: true });
  await page.getByRole('button', { name: 'AI 对话', exact: true }).click();
  await page.screenshot({ path: `${dir}/conversation.png`, fullPage: true });
  await page.getByRole('button', { name: '待确认操作', exact: true }).click();
  await page.screenshot({ path: `${dir}/confirmation.png`, fullPage: true });
  for (const id of ['a', 'b']) {
    const card = page.locator(`#${id}`);
    const fits = await card.evaluate(el => {
      const box = el.getBoundingClientRect();
      return [...el.querySelectorAll('.decision button')].every(button => {
        const r = button.getBoundingClientRect();
        return r.bottom <= box.bottom && r.top >= box.top && r.right <= box.right;
      });
    });
    assert.ok(fits, `${id}: confirmation buttons stay within card`);
    await card.getByRole('button', { name: '确认修改', exact: true }).click();
    assert.ok(await card.getByText('已把「完成项目报告」改为今天 15:00。').isVisible());
  }
  await page.getByRole('button', { name: '重置预览' }).click();
  await page.locator('#a').getByRole('button', { name: '完成完成项目报告', exact: true }).click();
  assert.equal(await page.locator('#a .row.done').count(), 1);
  await page.locator('#a').getByLabel('新增待办', { exact: true }).fill('预览新增事项');
  await page.locator('#a').getByRole('button', { name: '添加', exact: true }).click();
  assert.ok(await page.locator('#a').getByText('预览新增事项', { exact: true }).isVisible());
  await page.getByRole('button', { name: '重置预览' }).click();
  await page.getByRole('button', { name: '窄宽 340 px' }).click();
  await page.getByRole('button', { name: '待确认操作', exact: true }).click();
  await page.screenshot({ path: `${dir}/narrow.png`, fullPage: true });
  for (const id of ['a', 'b']) {
    assert.ok(await page.locator(`#${id}`).evaluate(el => el.scrollWidth <= el.clientWidth), `${id}: no horizontal overflow`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${dir}/mobile-board.png`, fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('Preview verified: three scenes, task completion/addition, AI confirmation, 340 px cards, mobile comparison board; no page errors.');
} finally { await browser.close(); }
