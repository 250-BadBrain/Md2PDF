import { test, expect, type Page } from '@playwright/test';

const source = Array.from({ length: 20 }, (_, index) =>
  `# Page ${index + 1}\n\n${index === 0 ? '[Last page](#page-20)\n\n' : ''}Body ${index + 1}`,
).join('\n\n[pagebreak]\n\n');

async function expectSeparateControls(page: Page) {
  const geometry = await page.locator('.preview-pane').evaluate(element => {
    const controls = element.querySelector('.preview-controls')!.getBoundingClientRect();
    const viewport = element.querySelector('.preview-panel')!.getBoundingClientRect();
    const navigation = element.querySelector('.page-navigation')!.getBoundingClientRect();
    return { controlsBottom: controls.bottom, viewportTop: viewport.top, viewportHeight: viewport.height, navigationTop: navigation.top };
  });
  expect(geometry.controlsBottom).toBeLessThanOrEqual(geometry.viewportTop);
  expect(geometry.viewportHeight).toBeGreaterThan(150);
  return geometry;
}

test('page controls stay above document when jumping and syncing the editor back to the top', async ({ page }, testInfo) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Markdown 源代码编辑区' });
  await editor.fill(source);
  await expect(page.locator('.pdf-page-shell')).toHaveCount(20);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('同步滚动').check();
  await page.locator('.page-selection summary').click();
  await page.getByLabel('导出范围', { exact: true }).selectOption('current');
  const initial = await expectSeparateControls(page);
  await page.getByLabel('跳转页码').fill('20');
  await page.getByRole('button', { name: '跳转', exact: true }).click();
  await expect(page.locator('[data-page="20"] h1')).toBeInViewport();
  await expect(page.locator('.page-selection summary')).toContainText('当前第 20 页');
  await expect.poll(() => editor.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect((await expectSeparateControls(page)).navigationTop).toBe(initial.navigationTop);
  // Allow the preview-to-editor synchronization guard to finish before scrolling back.
  await page.waitForTimeout(100);
  await editor.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')); });
  const heading = page.locator('[data-page="1"] h1');
  await expect(heading).toBeInViewport();
  await expect(page.locator('.page-selection summary')).toContainText('当前第 1 页');
  await expectSeparateControls(page);
  expect(await heading.evaluate(element => element.getBoundingClientRect().top - element.closest('.preview-panel')!.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('preview-top.png') });
  await page.getByRole('link', { name: 'Last page', exact: true }).click();
  await expect(page.locator('[data-page="20"] h1')).toBeInViewport();
  expect((await expectSeparateControls(page)).navigationTop).toBe(initial.navigationTop);
  expect(await page.locator('.pdf-page').count()).toBeLessThan(10);
});

test('mobile preview controls remain separate after tab switching and expanding export options', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill(source);
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(page.locator('.pdf-page-shell')).toHaveCount(20);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.locator('.page-selection summary').click();
  await page.getByLabel('导出范围', { exact: true }).selectOption('current');
  await expectSeparateControls(page);
  await page.getByLabel('跳转页码').fill('20');
  await page.getByRole('button', { name: '跳转', exact: true }).click();
  await expect(page.locator('.page-selection summary')).toContainText('当前第 20 页');
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.locator('.preview-panel')).toBeHidden();
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(page.locator('[data-page="20"] h1')).toBeInViewport();
  await expectSeparateControls(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('preview-mobile.png') });
});
