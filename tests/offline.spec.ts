import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
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
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill('# Offline\n\n$x^2$\n\n```mermaid\nflowchart LR\nA --> B\n```');
  await expect(page.locator('.mermaid-diagram svg')).toHaveCount(1);
  await expect(page.locator('.katex')).toHaveCount(1);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('PDF 导出方式').selectOption('image');
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: '下载', exact: true }).click();
  expect((await downloading).suggestedFilename()).toMatch(/\.pdf$/);
  await context.setOffline(false);
});
