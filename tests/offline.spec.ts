import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import {capturePrintedPdf} from './print';
import {extractPdfText} from './pdf-text';
let server: ChildProcess;
test.beforeAll(async () => {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'tests/fixtures/offline.config.mjs', '--host', '127.0.0.1', '--port', '4174', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Production preview did not start')), 15000);
    server.stdout!.on('data', (chunk) => { if (String(chunk).includes('4174')) { clearTimeout(timeout); resolve(); } });
    server.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Preview exited ${code}`)); });
  });
});
test.afterAll(() => { server?.kill(); });
test('production app caches all modules and renders and exports offline', async ({ page, context }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('requestfailed', (request) => failures.push(`${request.url()} ${request.failure()?.errorText}`));
  await page.goto('http://127.0.0.1:4174');
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 60000 }).toBe(true);
  await context.setOffline(true); await page.reload();
  try { await expect(page.getByRole('textbox', { name: 'Markdown 源代码编辑区' })).toBeVisible(); }
  catch (error) { console.log(failures); throw error; }
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill('# Offline\n\n$x^2$\n\n```mermaid\nflowchart LR\nA --> B\n```\n\n```plantuml\n@startuml\nAlice -> Bob : Offline\n@enduml\n```\n\n```infographic\ninfographic list-row-horizontal-icon-arrow\ndata\n  items\n    - label Offline\n      icon mdi/rocket-launch\n```');
  await expect(page.locator('.mermaid-diagram svg')).toHaveCount(1);
  await expect(page.locator('.katex')).toHaveCount(1);
  await expect(page.locator('.plantuml-diagram svg')).toHaveCount(1);
  await expect(page.locator('.infographic-diagram svg')).toHaveCount(1);
  await expect(page.locator('.diagram-error')).toHaveCount(0);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('PDF 导出方式').selectOption('image');
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: '下载', exact: true }).click();
  expect((await downloading).suggestedFilename()).toMatch(/\.pdf$/);
  expect(failures).toEqual([]);
  await context.setOffline(false);
});

test('minified production extensions preserve table spans and complete folded PDFs offline', async ({page,context}) => {
  const errors: string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4174');
  await page.getByRole('textbox',{name:'Markdown 源代码编辑区'}).fill(await fs.readFile('tests/fixtures/extended-markdown.md','utf8'));
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('td[colspan="2"]')).toHaveText('合并两列');
  await expect(page.locator('td[rowspan="2"]')).toHaveText('分组甲');
  await expect(page.locator('caption')).toHaveText('统计表');
  await expect(page.locator('.katex')).toHaveCount(5);
  await expect(page.locator('.eqn-num')).toHaveText('(1)');
  await expect(page.locator('details.md-alert-foldable[data-callout-fold="closed"]')).not.toHaveAttribute('open');
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),{timeout:60000}).toBe(true);
  await context.setOffline(true);await page.reload();
  await expect(page.locator('td[colspan="2"]')).toHaveText('合并两列');
  await expect(page.locator('td[rowspan="2"]')).toHaveText('分组甲');
  await expect(page.locator('.katex')).toHaveCount(5);
  const text=await extractPdfText(await capturePrintedPdf(page));
  for(const phrase of ['统计表','第一行','第二行','正文在折叠时仍应导出','嵌套正文也应导出','结束标记','(1)'])expect(text).toContain(phrase);
  await page.getByLabel('PDF 导出方式').selectOption('image');
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'下载',exact:true}).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.pdf$/);
  expect(errors).toEqual([]);await context.setOffline(false);
});

test('minified image projects, nested tables and selected PDF bookmarks work offline', async ({ page, context }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4174');
  const editor = page.getByRole('textbox', { name: 'Markdown 源代码编辑区' });
  const table = '| Key | Value |\n| --- | --- |\n' + Array.from({ length: 70 }, (_, i) => `| Row-${i} | Value-${i} |`).join('\n');
  const source = '---\npaper: A5\ntitle: Offline workflows\nauthor: Local\nsubject: Pure frontend\nkeywords: [images, outlines]\n---\n# First chapter\n\n> [!note]- Long local table\n> Before rows\n>\n' + table.split('\n').map(line => '> ' + line).join('\n') + '\n>\n> After rows\n\n[pagebreak]\n\n# Last chapter\n\nLocal image\n\n';
  await editor.fill(source);
  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.setSelectionRange(element.value.length, element.value.length);
    const clipboard = new DataTransfer();
    clipboard.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="teal"/></svg>'], 'local.svg', { type: 'image/svg+xml' }));
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }));
  });
  await expect(editor).toHaveValue(/images\/local\.svg/);
  await expect(page.getByText('项目与图片已保存在此浏览器', { exact: true })).toBeVisible();
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  const total = await page.locator('.pdf-page-shell').count(); expect(total).toBeGreaterThan(3);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 60000 }).toBe(true);
  await context.setOffline(true); await page.reload();
  await expect(editor).toHaveValue(/images\/local\.svg/);
  await expect(page.locator('.pdf-page-shell')).toHaveCount(total);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.locator('.page-selection summary').click();
  await page.getByLabel('导出范围', { exact: true }).selectOption('range'); await page.getByLabel('导出页码').fill(`1,${total}`);
  const text = await extractPdfText(await capturePrintedPdf(page));
  expect(text).toContain('Row-0'); expect(text).not.toContain('Row-69'); expect(text).toContain('Last chapter');
  await page.getByLabel('PDF 导出方式').selectOption('image'); await page.getByLabel('图像 PDF 清晰度').selectOption('small');
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: '下载', exact: true }).click();
  const download = await downloaded;
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({ data: Uint8Array.from(await fs.readFile((await download.path())!)) });
  try {
    const pdf = await loading.promise;
    expect(pdf.numPages).toBe(2); expect((await pdf.getOutline())?.map(heading => heading.title)).toEqual(['First chapter', 'Last chapter']);
    expect((await pdf.getMetadata()).info).toMatchObject({ Title: 'Offline workflows', Subject: 'Pure frontend', Keywords: 'images, outlines' });
  } finally { await loading.destroy(); }
  expect(errors).toEqual([]); await context.setOffline(false);
});
