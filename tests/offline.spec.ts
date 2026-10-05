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
