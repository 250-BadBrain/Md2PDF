import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
test.beforeEach(async ({ page }) => { await page.goto('/'); });
const editor = 'Markdown 源代码编辑区';

test('draft recovery, literal replacement, Markdown download and clearing', async ({ page }) => {
  await page.getByRole('textbox', { name: editor }).fill('# Local\n\na.* a.*');
  await expect(page.getByText('草稿已保存在此浏览器')).toBeVisible();
  await page.reload(); await expect(page.getByRole('textbox', { name: editor })).toHaveValue('# Local\n\na.* a.*');
  await page.getByRole('button', { name: '查找替换' }).click();
  await page.getByLabel('查找文本').fill('a.*'); await page.getByLabel('替换文本').fill('中文');
  await page.getByRole('button', { name: '全部替换' }).click();
  await expect(page.getByRole('textbox', { name: editor })).toHaveValue('# Local\n\n中文 中文');
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: '下载 Markdown' }).click();
  expect(await fs.readFile((await (await downloading).path())!, 'utf8')).toBe('# Local\n\n中文 中文');
  await expect(page.getByText('草稿已保存在此浏览器')).toBeVisible();
  await page.getByRole('button', { name: '清除已保存草稿' }).click();
  await page.reload(); await expect(page.getByRole('textbox', { name: editor })).not.toHaveValue('# Local\n\n中文 中文');
});

test('merged tables paginate complete connected row groups at normal font size', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { paginateHtml } = await import('/src/pagination.ts');
    const rows = Array.from({ length: 60 }, (_, i) => `<tr><td rowspan="2">group-${i}</td><td>first-${i}</td></tr><tr><td>second-${i}</td></tr>`).join('');
    const pages = await paginateHtml(`<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>${rows}</tbody></table>`);
    const host = document.createElement('div'); host.innerHTML = pages.join('');
    const broken = [...host.querySelectorAll('[rowspan]')].some((cell) => !cell.parentElement?.nextElementSibling);
    return { count: pages.length, broken, groups: host.querySelectorAll('[rowspan]').length, text: host.textContent, scaled: host.querySelectorAll('.pagination-scaled').length };
  });
  expect(result.count).toBeGreaterThan(1); expect(result.broken).toBe(false); expect(result.groups).toBe(60);
  expect(result.scaled).toBe(0); expect(result.text).toContain('second-59');
});

test('cover and nearby notes preserve note targets and appear before the next chapter', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1800, height: 1600 });
  await page.getByRole('textbox', { name: editor }).fill('---\ntitle: Book\ncover: true\ntheme: book\nfootnotes: near-reference\n---\n# Intro\n\nReference[^1]\n\n[pagebreak]\n\n# Later\n\n[^1]: Nearby note');
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.pdf-page-shell')).toHaveCount(3);
  await expect(page.locator('[data-page="1"] .document-cover')).toContainText('Book');
  await expect(page.locator('[data-page="2"] .footnotes')).toContainText('Nearby note');
  await expect(page.locator('[data-page="2"] [id="fn1"]')).toHaveCount(1);
  await page.locator('[data-page="1"]').screenshot({ path: testInfo.outputPath('cover.png') });
  await page.locator('[data-page="2"]').screenshot({ path: testInfo.outputPath('nearby-notes.png') });
});

test('large parsing uses a real worker and retains formulas', async ({ page }) => {
  let workerRequested = false;
  page.on('request', (request) => { if (request.url().includes('parser.worker')) workerRequested = true; });
  const errors: string[] = []; page.on('console', (message) => { if (message.text().includes('Worker parsing failed')) errors.push(message.text()); });
  const rendered = await page.evaluate(async () => {
    const { renderMarkdownToHtml } = await import('/src/markdown.ts');
    const result = await renderMarkdownToHtml('# Worker\n\n' + 'text '.repeat(13000) + '\n\n$x^2$', undefined, {});
    return result.html;
  });
  expect(workerRequested).toBe(true); expect(errors).toEqual([]); expect(rendered).toContain('katex'); expect(rendered).toContain('Worker');
});

test('image export can be cancelled without leaving measurement pages', async ({ page }) => {
  await page.getByRole('textbox', { name: editor }).fill(Array.from({ length: 12 }, (_, i) => `# Page ${i}`).join('\n\n[pagebreak]\n\n'));
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('PDF 导出方式').selectOption('image');
  await page.getByRole('button', { name: '下载', exact: true }).click();
  await page.getByRole('button', { name: '取消导出' }).click();
  await expect(page.getByRole('alert')).toContainText('导出已取消');
  await expect(page.locator('.pdf-export-host')).toHaveCount(0);
});

test('specific diagnostics are visible for missing images and invalid formulas', async ({ page }) => {
  await page.getByRole('textbox', { name: editor }).fill('# Problems\n\n![missing](not-uploaded.png)\n\n$\\notARealCommand$');
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.locator('.document-warnings summary').click();
  await expect(page.locator('.document-warnings')).toContainText('图片未找到');
  await expect(page.locator('.document-warnings')).toContainText('公式解析失败');
});
