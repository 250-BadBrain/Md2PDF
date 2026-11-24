import { test, expect, type Page } from '@playwright/test';

const source = Array.from({ length: 20 }, (_, index) =>
  `# Page ${index + 1}\n\n${index === 0 ? '[Last page](#page-20)\n\n' : ''}Body ${index + 1}`,
).join('\n\n[pagebreak]\n\n');

test('desktop panes fit below a wrapped toolbar and visible status messages', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  await page.evaluate(() => window.dispatchEvent(new Event('offline-ready')));
  await expect(page.getByText('应用已可离线使用')).toBeVisible();
  const layout = await page.locator('.workspace').evaluate(workspace => ({
    editorBottom: workspace.querySelector('.editor-pane')!.getBoundingClientRect().bottom,
    previewBottom: workspace.querySelector('.preview-pane')!.getBoundingClientRect().bottom,
    height: innerHeight,
  }));
  expect(layout.editorBottom).toBeLessThanOrEqual(layout.height + 1);
  expect(layout.previewBottom).toBeLessThanOrEqual(layout.height + 1);
});

test('page jumps require a whole number and can be submitted with Enter', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill(source);
  await expect(page.locator('.pdf-page-shell')).toHaveCount(20);
  const jump = page.getByLabel('跳转页码');
  await jump.fill('1.5');
  await expect(page.getByRole('button', { name: '跳转', exact: true })).toBeDisabled();
  await jump.fill('12');
  await jump.press('Enter');
  await expect(page.locator('[data-page="12"] h1')).toBeInViewport();
});

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

test('replacing a long document clamps the jump target and keeps navigation usable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill(source);
  await expect(page.locator('.pdf-page-shell')).toHaveCount(20);
  const target = page.getByLabel('跳转页码');
  await target.fill('20');
  await page.getByRole('button', { name: '跳转', exact: true }).click();
  await expect(page.locator('[data-page="20"] h1')).toBeInViewport();

  await page.locator('input[type=file]').first().setInputFiles({
    name: 'short.md', mimeType: 'text/markdown',
    buffer: Buffer.from('# First page\n\nBody\n\n[pagebreak]\n\n# Second page\n\nBody'),
  });
  await expect(page.locator('.pdf-page-shell')).toHaveCount(2);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(target).toHaveValue('2');
  await page.locator('.preview-panel').evaluate(element => { element.scrollTop = 0; });
  await expect(page.locator('[data-page="1"] h1')).toBeInViewport();
  await page.getByRole('button', { name: '跳转', exact: true }).click();
  await expect(page.locator('[data-page="2"] h1')).toBeInViewport();
});
