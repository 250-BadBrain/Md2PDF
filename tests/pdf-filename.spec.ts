import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const filename = '作业三：数据选型 (2026).MARKDOWN';
const basename = '作业三：数据选型 (2026)';
const source = '---\ntitle: 文档属性标题\nauthor: 本地作者\nheader: Report\n---\n# Report\n\nContent with an independent filename and document title.';

test('printing an uploaded Markdown suggests its original filename and restores the tab after closing print', async ({ page }) => {
  await page.goto('/');
  await page.locator('header input[type=file]').first().setInputFiles({ name: filename, mimeType: 'text/markdown', buffer: Buffer.from(source) });
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  const originalTitle = await page.title();
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')!;
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { configurable: true, get() {
      const printWindow = descriptor.get!.call(this);
      if (printWindow) printWindow.print = () => {
        (window as Window & { printTitles?: string[] }).printTitles = [document.title, printWindow.document.title];
      };
      return printWindow;
    } });
  });
  await page.getByRole('button', { name: '打印／保存 PDF' }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { printTitles?: string[] }).printTitles)).toEqual([basename, basename]);
  await expect(page).toHaveTitle(basename);
  await page.evaluate(() => document.querySelector('iframe')!.contentWindow!.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page).toHaveTitle(originalTitle);
  await expect(page.getByRole('textbox', { name: 'Markdown 源代码编辑区' })).toHaveValue(source);
});

for (const mode of ['image', 'direct']) {
  test(`${mode} PDF downloads keep the Markdown filename independently of document properties`, async ({ page }) => {
    await page.goto('/');
    await page.locator('header input[type=file]').first().setInputFiles({ name: filename, mimeType: 'text/markdown', buffer: Buffer.from(source) });
    await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
    if (mode === 'direct') {
      await page.getByRole('button', { name: '排版', exact: true }).click();
      await page.getByLabel('导入 TTF 字体').setInputFiles('tests/fixtures/fonts/test.ttf');
      await expect(page.getByRole('status').filter({ hasText: 'test.ttf' })).toBeVisible();
      await page.getByRole('button', { name: '关闭设置', exact: true }).click();
      await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
    }
    await page.getByLabel('PDF 导出方式').selectOption(mode);
    await page.getByLabel('图像 PDF 清晰度').selectOption('small');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载', exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`${basename}.pdf`);
    const loading = getDocument({ data: Uint8Array.from(await fs.readFile((await download.path())!)) });
    try {
      const pdf = await loading.promise;
      expect((await pdf.getMetadata()).info).toMatchObject({ Title: '文档属性标题', Author: '本地作者' });
    } finally { await loading.destroy(); }
    await expect(page).toHaveTitle('Md2PDF');
  });
}

test('print filenames are escaped and every print completion path restores the tab title', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')!;
    let fail = false;
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { configurable: true, get() {
      const printWindow = descriptor.get!.call(this);
      if (printWindow) printWindow.print = () => { if (fail) throw new Error('Print unavailable'); };
      return printWindow;
    } });
    const { printPages } = await import('/src/export.ts');
    const original = document.title;
    const filename = '中文 & <选型> </title><img src=x>.pdf';
    await printPages(['<div class="pdf-content">内容</div>'], { title: 'Metadata' }, filename);
    const frame = document.querySelector('iframe')!;
    const escaped = { tab: document.title, frame: frame.contentDocument!.title, images: frame.contentDocument!.images.length };
    window.dispatchEvent(new Event('afterprint'));
    const parentEvent = { title: document.title, frames: document.querySelectorAll('iframe').length };
    fail = true;
    let error = '';
    try { await printPages(['<div class="pdf-content">内容</div>'], {}, '失败.pdf'); }
    catch (failure) { error = (failure as Error).message; }
    const failed = { title: document.title, frames: document.querySelectorAll('iframe').length, error };
    fail = false;
    const schedule = window.setTimeout;
    let finish: (() => void) | undefined;
    window.setTimeout = ((callback: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === 300000) { finish = callback as () => void; return 0; }
      return schedule(callback, delay, ...args);
    }) as typeof window.setTimeout;
    try {
      await printPages(['<div class="pdf-content">内容</div>'], {}, '超时清理.pdf');
      finish!();
    } finally { window.setTimeout = schedule; }
    return { original, escaped, parentEvent, failed, timeout: { title: document.title, frames: document.querySelectorAll('iframe').length } };
  });
  expect(result.escaped).toEqual({ tab: '中文 & <选型> </title><img src=x>', frame: '中文 & <选型> </title><img src=x>', images: 0 });
  expect(result.parentEvent).toEqual({ title: result.original, frames: 0 });
  expect(result.failed).toEqual({ title: result.original, frames: 0, error: 'Print unavailable' });
  expect(result.timeout).toEqual({ title: result.original, frames: 0 });
});
