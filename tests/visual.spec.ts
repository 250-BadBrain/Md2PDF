import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test.use({ viewport: { width: 1800, height: 1500 } });

test('Markdown dialect pages match reviewed visual baselines', async ({ page }) => {
  await page.goto('/');
  const markdown = await fs.readFile('tests/fixtures/dialects.md', 'utf8');
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill(markdown);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.pdf-page-shell')).toHaveCount(2);
  for (const number of [1, 2]) {
    await expect(page.locator(`[data-page="${number}"]`)).toHaveScreenshot(`dialects-page-${number}.png`, {
      animations: 'disabled', maxDiffPixelRatio: 0.002,
    });
  }
});
