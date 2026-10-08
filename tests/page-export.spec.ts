import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { capturePrintedPdf } from './print';
import { extractPdfText } from './pdf-text';

const source = `---
title: Selected pages
author: Local author
subject: Page selection
keywords: [Markdown, PDF]
pageNumbers: true
---
# First

Alpha content

[pagebreak]

# Second

Bravo content [selected link](#third)

[pagebreak]

# Third

Charlie content [omitted link](#first)
`;

test('page ranges validate before exporting selected PDF pages with remapped destinations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill(source);
  await expect(page.locator('.pdf-page-shell')).toHaveCount(3);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.locator('.page-selection summary').click();
  await page.getByLabel('导出范围', { exact: true }).selectOption('range');
  await page.getByLabel('导出页码').fill('0,4');
  await expect(page.locator('.page-selection [role=alert]')).toContainText('1-3');
  await expect(page.getByRole('button', { name: '打印／保存 PDF' })).toBeDisabled();
  await page.getByLabel('导出页码').fill('3,2-3');
  await expect(page.locator('.page-selection summary')).toContainText('2 / 3 页');
  await page.getByLabel('PDF 导出方式').selectOption('image');
  await page.getByLabel('图像 PDF 清晰度').selectOption('small');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载', exact: true }).click();
  const file = await downloaded;
  const bytes = await fs.readFile((await file.path())!);
  const loading = getDocument({ data: Uint8Array.from(bytes) });
  const pdf = await loading.promise;
  try {
    expect(pdf.numPages).toBe(2);
    expect((await pdf.getOutline())?.map(item => item.title)).toEqual(['Second', 'Third']);
    const metadata = await pdf.getMetadata();
    expect(metadata.info).toMatchObject({ Title: 'Selected pages', Author: 'Local author', Subject: 'Page selection', Keywords: 'Markdown, PDF' });
    const links = await (await pdf.getPage(1)).getAnnotations();
    const chosen = links.find(annotation => annotation.subtype === 'Link');
    expect(chosen?.dest).toBeTruthy();
    const destination = chosen!.dest as unknown[];
    expect(await pdf.getPageIndex(destination[0] as { num: number; gen: number })).toBe(1);
    expect((await (await pdf.getPage(2)).getAnnotations()).filter(annotation => annotation.subtype === 'Link')).toHaveLength(0);
    await fs.mkdir('tmp', { recursive: true }); await fs.writeFile('tmp/selected-pages-image.pdf', bytes);
  } finally { await loading.destroy(); }
  await expect(page.locator('.pdf-page-shell')).toHaveCount(3);
});

test('current page follows preview navigation and selected print keeps original numbering', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill(source);
  await expect(page.locator('.pdf-page-shell')).toHaveCount(3);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.locator('.page-selection summary').click();
  await page.getByLabel('导出范围', { exact: true }).selectOption('current');
  await page.getByLabel('跳转页码').fill('3'); await page.getByRole('button', { name: '跳转', exact: true }).click();
  await expect(page.locator('.page-selection summary')).toContainText('当前第 3 页');
  const bytes = await capturePrintedPdf(page);
  const text = await extractPdfText(bytes);
  expect(text).toContain('Charlie content'); expect(text).not.toContain('Alpha content'); expect(text).not.toContain('Bravo content');
  expect(text).toMatch(/3\s*\/\s*3/);
  const loading = getDocument({ data: Uint8Array.from(bytes) });
  try { expect((await loading.promise).numPages).toBe(1); } finally { await loading.destroy(); }
  await fs.mkdir('tmp', { recursive: true }); await fs.writeFile('tmp/selected-current-print.pdf', bytes);
});

test('chapter export selects a chapter and its descendants without changing the preview', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill('# Book\n\n## Introduction\n\nStart\n\n[pagebreak]\n\n## Chapter\n\nMiddle\n\n[pagebreak]\n\n### Child\n\nChild content\n\n[pagebreak]\n\n## Next\n\nEnding');
  await expect(page.locator('.pdf-page-shell')).toHaveCount(4);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.locator('.page-selection summary').click();
  await page.getByLabel('导出范围', { exact: true }).selectOption('chapter');
  await page.getByLabel('导出章节').selectOption('chapter');
  await expect(page.locator('.page-selection summary')).toContainText('2 / 4 页');
  const bytes = await capturePrintedPdf(page);
  const text = await extractPdfText(bytes);
  expect(text).toContain('Middle'); expect(text).toContain('Child content'); expect(text).not.toContain('Start'); expect(text).not.toContain('Ending');
  await expect(page.locator('.pdf-page-shell')).toHaveCount(4);
});

test('mobile editor and preview switching preserves the current export page and page scale', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill(Array.from({ length: 5 }, (_, index) => `# Chapter ${index + 1}\n\nContent ${index + 1}`).join('\n\n[pagebreak]\n\n'));
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(page.locator('.pdf-page-shell')).toHaveCount(5);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.locator('.page-selection summary').click(); await page.getByLabel('导出范围', { exact: true }).selectOption('current');
  await page.getByLabel('跳转页码').fill('4'); await page.getByRole('button', { name: '跳转', exact: true }).click();
  await expect(page.locator('.page-selection summary')).toContainText('当前第 4 页');
  const scale = await page.locator('[data-page="4"] .pdf-page').evaluate(element => (element as HTMLElement).style.transform);
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.locator('.preview-panel')).toBeHidden();
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await expect(page.locator('.page-selection summary')).toContainText('当前第 4 页');
  expect(await page.locator('[data-page="4"] .pdf-page').evaluate(element => (element as HTMLElement).style.transform)).toBe(scale);
  const text = await extractPdfText(await capturePrintedPdf(page));
  expect(text).toContain('Content 4'); expect(text).not.toContain('Content 1'); expect(text).not.toContain('Content 5');
});
