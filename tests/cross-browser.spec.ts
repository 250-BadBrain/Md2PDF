import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { extractPdfText } from './pdf-text';

test('local fonts produce searchable Chinese text across browser engines', async ({page})=>{
  await page.goto('/'); const bytes=[...await fs.readFile('tests/fixtures/fonts/test.ttf')];
  const result=await page.evaluate(async bytes=>{
    const {importFont,activeFont,fontFaceCss}=await import('/src/fonts.ts');
    await importFont(new File([new Uint8Array(bytes)],'test.ttf'));
    let rejected=false;try{await importFont(new File(['bad'],'broken.ttf'));}catch{rejected=true;}
    const {paginateHtml}=await import('/src/pagination.ts');const {renderImagePdf}=await import('/src/export.ts');
    const pages=await paginateHtml('<p>中文测试 English</p>');const pdf=await renderImagePdf(pages,{}, {searchable:true,quality:'small'});
    return {rejected,name:activeFont()?.name,css:fontFaceCss().startsWith('@font-face'),bytes:[...new Uint8Array(await pdf.arrayBuffer())]};
  },bytes);
  expect(result.rejected).toBe(true);expect(result.name).toBe('test.ttf');expect(result.css).toBe(true);
  const text=await extractPdfText(new Uint8Array(result.bytes));expect(text).toContain('中文测试');expect(text).toContain('English');
});

test('renders and prepares a sandboxed print document across browser engines', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill('# 中文\n\n$x^2$\n\n| A | B |\n|---|---|\n|1|2|\n\n[pagebreak]\n\nSecond');
  await expect(page.locator('.pdf-page-shell')).toHaveCount(2);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')!;
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { get() {
      const win = descriptor.get!.call(this);
      if (win) win.print = () => { document.body.dataset.printed = 'true'; };
      return win;
    } });
  });
  await page.getByRole('button', { name: '打印／保存 PDF' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-printed', 'true');
  await expect(page.getByText('打印对话框已打开：请选择另存为 PDF，关闭浏览器页眉页脚。')).toBeVisible();
  expect(await page.locator('iframe').getAttribute('sandbox')).toBe('allow-same-origin allow-modals');
});

test('dialect switching, local image projects and page-bottom notes across engines',async({page})=>{
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles([{name:'engine.md',mimeType:'text/markdown',buffer:Buffer.from('# Engine')},{name:'engine.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="green"/></svg>')}]);
  const editor=page.getByRole('textbox',{name:'Markdown 源代码编辑区'});
  await editor.fill('---\ndialect: gfm\n---\n~~strike~~ ==literal== $literal$\n\n- [x] task');
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.pdf-content s')).toHaveCount(1);await expect(page.locator('.pdf-content mark')).toHaveCount(0);
  const notes='---\nfootnotes: page-bottom\n---\nBody[^1]\n\n![Engine](engine.svg)\n\n[^1]: Bottom note';
  await editor.fill(notes);
  await expect(page.locator('.pdf-page-notes')).toContainText('Bottom note');
  await page.getByRole('button',{name:'项目库',exact:true}).click();await page.getByLabel('项目名称').fill('Engine project');
  await page.getByRole('button',{name:'保存当前项目',exact:true}).click();
  await expect(page.getByRole('button',{name:'打开 Engine project',exact:true})).toBeVisible();
  await page.reload();await expect(editor).toHaveValue(notes);
  await expect(page.locator('.image-figure img')).toHaveAttribute('src',/^blob:/);
  await expect.poll(()=>page.locator('.image-figure img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  await expect(page.locator('.pdf-page-notes')).toContainText('Bottom note');
});
