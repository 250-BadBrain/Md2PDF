import { expect, test, type Locator, type Page } from '@playwright/test';

const svg = (width: number, color: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="60"><rect width="${width}" height="60" fill="${color}"/></svg>`;
async function putImage(editor: Locator, kind: 'paste' | 'drop', name: string, content: string) {
  await editor.evaluate((area: HTMLTextAreaElement, data) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([data.content], data.name, { type: 'image/svg+xml' }));
    const event = new Event(data.kind, { bubbles: true, cancelable: true });
    Object.defineProperty(event, data.kind === 'paste' ? 'clipboardData' : 'dataTransfer', { value: transfer });
    area.dispatchEvent(event);
  }, { kind, name, content });
}
async function persisted(page: Page) {
  return page.evaluate(() => new Promise<{ source: string; images: string[] } | undefined>((resolve, reject) => {
    const id = localStorage.getItem('md2pdf:active-project'); if (!id) { resolve(undefined); return; }
    const open = indexedDB.open('md2pdf-projects', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result; const read = db.transaction('projects').objectStore('projects').get(id);
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = () => {
        db.close(); const project = read.result;
        resolve(project ? { source: project.source, images: Object.values(project.assets).map(asset => new TextDecoder().decode((asset as { bytes: ArrayBuffer }).bytes)) } : undefined);
      };
    };
  }));
}

test('pasted and dropped images autosave, survive reload, and replacement history preserves image bytes', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Markdown 源代码编辑区' });
  const source = '# Images\n\nBefore SELECT After';
  await editor.fill(source);
  await editor.evaluate((area: HTMLTextAreaElement) => { const start = area.value.indexOf('SELECT'); area.setSelectionRange(start, start + 6); });
  await putImage(editor, 'paste', 'diagram.svg', svg(120, 'red'));
  await expect(editor).toHaveValue('# Images\n\nBefore \n\n![diagram](images/diagram.svg)\n\n After');
  await expect(page.getByText('项目与图片已保存在此浏览器', { exact: true })).toBeVisible();
  await editor.evaluate((area: HTMLTextAreaElement) => area.setSelectionRange(area.value.length, area.value.length));
  await putImage(editor, 'drop', 'diagram.svg', svg(150, 'green'));
  await expect.poll(() => editor.inputValue()).toContain('![diagram-2](images/diagram-2.svg)');
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.preview-panel img')).toHaveCount(2);
  await expect(page.getByText('项目与图片已保存在此浏览器', { exact: true })).toBeVisible();
  const saved = await editor.inputValue();
  await expect.poll(() => persisted(page)).toEqual({ source: saved, images: [svg(120, 'red'), svg(150, 'green')] });
  // No explicit "save project" action: the first image creates an autosaved project.
  await page.reload();
  await expect(editor).toHaveValue(saved);
  await expect(page.locator('.preview-panel img')).toHaveCount(2);
  await expect.poll(() => page.locator('.preview-panel img').evaluateAll(images => images.map(image => (image as HTMLImageElement).naturalWidth))).toEqual([120, 150]);
  await page.getByRole('button', { name: '图片', exact: true }).click();
  await expect(page.locator('.image-asset')).toHaveCount(2);
  const first = page.locator('.image-asset').filter({ has: page.locator('span', { hasText: /^images\/diagram\.svg$/ }) });
  await first.getByRole('button', { name: '替换图片', exact: true }).click();
  await page.getByLabel('替换图片文件').setInputFiles({ name: 'replacement.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg(180, 'blue')) });
  await expect(page.getByText('已替换图片，原引用路径保持不变', { exact: true })).toBeVisible();
  await expect(editor).toHaveValue(saved);
  await expect.poll(() => page.locator('.preview-panel img').evaluateAll(images => images.map(image => (image as HTMLImageElement).naturalWidth))).toEqual([180, 150]);
  await expect.poll(() => persisted(page)).toEqual({ source: saved, images: [svg(180, 'blue'), svg(150, 'green')] });
  await expect(page.getByText('项目与图片已保存在此浏览器', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭图片素材', exact: true }).click();
  await page.getByRole('button', { name: '项目库', exact: true }).click();
  await page.getByRole('button', { name: '打开 我的文档', exact: true }).click();
  await page.getByRole('button', { name: /^恢复版本 1（/ }).click();
  await expect(editor).toHaveValue(saved);
  await expect.poll(() => page.locator('.preview-panel img').evaluateAll(images => images.map(image => (image as HTMLImageElement).naturalWidth))).toEqual([120, 150]);
});

test('asset uploads validate files, insertion uses the cursor, and ordinary text paste remains native', async ({ page, context, browserName }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Markdown 源代码编辑区' });
  await editor.fill('Text');
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => navigator.clipboard.writeText(' plain paste'));
    await editor.press('End'); await editor.press('Control+V');
    await expect(editor).toHaveValue('Text plain paste');
  }
  const before = await editor.inputValue();
  await page.getByRole('button', { name: '图片', exact: true }).click();
  await page.getByLabel('添加图片文件').setInputFiles({ name: 'wrong.png', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await expect(page.locator('.image-assets [role="alert"]')).toContainText('不支持的图片类型');
  await expect(page.locator('.image-asset')).toHaveCount(0);
  await expect(editor).toHaveValue(before);
  await page.getByLabel('添加图片文件').setInputFiles([
    { name: 'picture.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg(100, 'purple')) },
    { name: 'picture.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg(130, 'orange')) },
  ]);
  await expect(page.locator('.image-asset')).toHaveCount(2);
  await expect(editor).toHaveValue(before);
  await editor.evaluate((area: HTMLTextAreaElement) => area.setSelectionRange(0, 0));
  await page.locator('.image-asset').first().getByRole('button', { name: '插入引用', exact: true }).click();
  await expect(editor).toHaveValue('![picture](images/picture.svg)\n\n' + before);
  await expect(page.locator('.preview-panel img')).toHaveCount(1);
  await expect.poll(() => page.locator('.preview-panel img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(100);
});
