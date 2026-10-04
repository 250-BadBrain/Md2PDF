import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { extractPdfText } from './pdf-text';
import { capturePrintedPdf } from './print';

test.beforeEach(async ({ page }) => { await page.goto('/'); });
const editorName = 'Markdown 源代码编辑区';

test('soft break preferences persist and YAML controls preview and printed output', async ({ page }) => {
  await page.getByRole('textbox', { name: editorName }).fill('first\nsecond\n\nhard  \nbreak');
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.pdf-content br')).toHaveCount(2);
  await page.getByRole('button', { name: '排版', exact: true }).click();
  await page.getByLabel('软换行', { exact: true }).selectOption('space');
  await page.getByRole('button', { name: '关闭设置' }).click();
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.pdf-content br')).toHaveCount(1);
  await capturePrintedPdf(page);
  const printed = await page.evaluate(() => (window as Window & { printedHtml: string }).printedHtml);
  expect(printed).toContain('first\nsecond');
  await page.reload();
  await page.getByRole('button', { name: '排版', exact: true }).click();
  await expect(page.getByLabel('软换行', { exact: true })).toHaveValue('space');
  await page.getByRole('button', { name: '关闭设置' }).click();
  await page.getByRole('textbox', { name: editorName }).fill('---\nsoftBreaks: newline\n---\nfirst\nsecond');
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.pdf-content br')).toHaveCount(1);
});

test('layout preferences persist, YAML overrides them, and printed PDF uses the chosen dimensions', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: '排版', exact: true }).click();
  await page.getByLabel('纸张', { exact: true }).selectOption('A5');
  await page.getByLabel('方向', { exact: true }).selectOption('landscape');
  await page.getByLabel('字号', { exact: true }).fill('18');
  await page.getByLabel('页眉', { exact: true }).fill('Page {page}/{total}');
  await page.getByRole('button', { name: '关闭设置' }).click();
  await page.getByRole('textbox', { name: editorName }).fill('# Searchable document\n\n中文正文可以搜索和复制。');
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  expect(await page.locator('.pdf-content').evaluate((el) => getComputedStyle(el).fontSize)).toBe('18px');
  expect(await page.locator('.pdf-page').evaluate((el) => el.getBoundingClientRect().width / el.getBoundingClientRect().height)).toBeCloseTo(210 / 148, 2);
  const buffer = await capturePrintedPdf(page);
  await fs.writeFile(testInfo.outputPath('searchable.pdf'), buffer);
  expect(buffer.toString('latin1')).toContain('/Font');
  const box = buffer.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/)!;
  expect(Math.abs(Number(box[1]) - 210 / 25.4 * 72)).toBeLessThan(1);
  expect(Math.abs(Number(box[2]) - 148 / 25.4 * 72)).toBeLessThan(1);
  const text = await extractPdfText(buffer);
  expect(text).toContain('Searchable document');
  expect(text).toContain('中文正文可以搜索和复制');
  await page.reload();
  await page.getByRole('button', { name: '排版', exact: true }).click();
  await expect(page.getByLabel('纸张', { exact: true })).toHaveValue('A5');
  await expect(page.getByLabel('字号', { exact: true })).toHaveValue('18');
  await page.getByRole('button', { name: '关闭设置' }).click();
  await page.getByRole('textbox', { name: editorName }).fill('---\npaper: Letter\norientation: portrait\nfontSize: 12\n---\n# Override');
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  expect(await page.locator('.pdf-content').evaluate((el) => getComputedStyle(el).fontSize)).toBe('12px');
});

test('long preview mounts only visible pages, supports jumps and updates after cancelled work', async ({ page }) => {
  const markdown = Array.from({ length: 45 }, (_, index) => `# Page ${index + 1}\n\nBody ${index + 1}`).join('\n\n[pagebreak]\n\n');
  await page.getByRole('textbox', { name: editorName }).fill(markdown);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.pdf-page-shell')).toHaveCount(45);
  expect(await page.locator('.pdf-page').count()).toBeLessThan(10);
  await page.getByLabel('跳转页码').fill('45');
  await page.getByRole('button', { name: '跳转', exact: true }).click();
  await expect(page.locator('[data-page="45"] h1')).toHaveText('Page 45 #');
  expect(await page.locator('.pdf-page').count()).toBeLessThan(10);
  await page.getByRole('textbox', { name: editorName }).fill('very long '.repeat(50000));
  await page.getByRole('textbox', { name: editorName }).fill('# Latest version');
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.pdf-page-shell')).toHaveCount(1);
  await expect(page.locator('.pdf-page h1')).toHaveText('Latest version #');
  await expect(page.locator('.pagination-host')).toHaveCount(0);
});

test('nested manual breaks and merged HTML cells preserve content', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { renderMarkdownToHtml } = await import('/src/markdown.ts');
    const { paginateHtml } = await import('/src/pagination.ts');
    const document = await renderMarkdownToHtml('::: note\nBefore **bold**\n\n[pagebreak]\n\nAfter [link](https://example.com)\n:::\n\n<table><tr><td rowspan="2">Merged</td><td>A</td></tr><tr><td>B</td></tr></table>', undefined, {});
    const pages = await paginateHtml(document.html);
    return { pages, text: pages.join('') };
  });
  expect(result.pages).toHaveLength(2);
  expect(result.pages[0]).toContain('Before');
  expect(result.pages[1]).toContain('After');
  expect(result.text).toContain('rowspan="2"');
});

test('static deployment falls back to browser print without changing to image PDF', async ({ page }) => {

  await page.reload();
  await expect(page.getByRole('button', { name: '打印／保存 PDF' })).toBeEnabled();
  await page.evaluate(() => {
    (window as Window & { printed?: boolean }).printed = false;
    const native = HTMLIFrameElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(native, 'contentWindow')!;
    Object.defineProperty(native, 'contentWindow', { get() {
      const frameWindow = descriptor.get!.call(this);
      if (frameWindow) frameWindow.print = () => { (window as Window & { printed?: boolean }).printed = true; };
      return frameWindow;
    } });
  });
  await page.getByRole('button', { name: '打印／保存 PDF' }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { printed?: boolean }).printed)).toBe(true);
});

test('startup, printing and batch selection never contact an API', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
  await page.reload();
  await capturePrintedPdf(page);
  await page.locator('input[type=file]').first().setInputFiles([
    { name: 'one.md', mimeType: 'text/markdown', buffer: Buffer.from('# One') },
    { name: 'two.md', mimeType: 'text/markdown', buffer: Buffer.from('# Two') },
  ]);
  await expect(page.getByLabel('PDF 导出方式')).toHaveValue('image');
  await expect(page.getByLabel('PDF 导出方式')).toBeDisabled();
  expect(apiRequests).toEqual([]);
});

test('nested ordered list numbers continue correctly across pages', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { renderMarkdownToHtml } = await import('/src/markdown.ts');
    const { paginateHtml } = await import('/src/pagination.ts');
    const nested = Array.from({ length: 65 }, (_, index) => `   ${index + 11}. nested-${index + 11} ${'details '.repeat(30)}`).join('\n');
    const rendered = await renderMarkdownToHtml(`7. Outer\n${nested}\n8. Final`, undefined, {});
    const pages = await paginateHtml(rendered.html);
    const host = document.createElement('div'); host.innerHTML = pages.join('');
    const errors: string[] = [];
    for (const item of host.querySelectorAll('li')) {
      const label = item.textContent?.trim().match(/^nested-(\d+)/);
      if (!label) continue;
      const list = item.parentElement!;
      const ordinal = Number(list.getAttribute('start') || 1) + [...list.children].indexOf(item);
      if (ordinal !== Number(label[1])) errors.push(`${label[1]}: ${ordinal}`);
    }
    return { count: pages.length, errors };
  });
  expect(result.count).toBeGreaterThan(2);
  expect(result.errors).toEqual([]);
});

test('image PDF remains an explicit compatibility option', async ({ page }) => {
  await page.getByRole('combobox', { name: 'PDF 导出方式' }).selectOption('image');
  await expect(page.getByRole('button', { name: '下载', exact: true })).toBeEnabled();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载', exact: true }).click();
  const download = await downloading;
  const bytes = await fs.readFile((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.toString('latin1')).toContain('/Subtype /Image');
});

test('multiline page headers reserve space for body content', async ({ page }) => {
  await page.getByRole('textbox', { name: editorName }).fill(`---\nheader: "${'Long header '.repeat(60)}"\n---\n# Body heading\n\nBody content`);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  const spacing = await page.locator('.pdf-page').first().evaluate((element) => {
    const header = element.querySelector('.pdf-page-header')!;
    const heading = element.querySelector('h1')!;
    return heading.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
  });
  expect(spacing).toBeGreaterThanOrEqual(0);
});
