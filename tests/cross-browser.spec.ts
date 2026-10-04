import { test, expect } from '@playwright/test';

test('renders and prepares a sandboxed print document across browser engines', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill('# 中文\n\n$x^2$\n\n| A | B |\n|---|---|\n|1|2|\n\n[pagebreak]\n\nSecond');
  await expect(page.locator('.pdf-page-shell')).toHaveCount(2);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')!;
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { get() {
      const win = descriptor.get!.call(this);
      if (win) win.print = () => { document.body.dataset.printed = 'true'; };
      return win;
    } });
  });
  await page.getByRole('button', { name: '打印／保存 PDF' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-printed', 'true');
  await expect(page.getByText('打印对话框已打开：请选择另存为 PDF，关闭浏览器页眉页脚。')).toBeVisible();
  expect(await page.locator('iframe').getAttribute('sandbox')).toBe('allow-same-origin allow-modals');
});
