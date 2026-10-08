import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { extractPdfText } from './pdf-text';

test('pasted images restore locally and selected downloads retain Unicode properties and bookmarks', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Markdown 源代码编辑区' });
  await editor.fill('# 第一章\n\n开头\n\n[pagebreak]\n\n## 第二章\n\n图片在下面\n\n');
  await editor.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(element.value.length, element.value.length));
  // Valid 1×1 RGBA PNG: Firefox checks chunk CRCs more strictly than Chromium.
  const png = [...Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNQTIr9DwADaAHgWDU+fQAAAABJRU5ErkJggg==', 'base64')];
  const pastedFiles = await editor.evaluate((element, bytes) => {
    const clipboard = new DataTransfer(); clipboard.items.add(new File([new Uint8Array(bytes)], '粘贴.png', { type: 'image/png' }));
    const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard });
    // Firefox ignores clipboardData in synthetic event construction (Mozilla
    // bug 2027025). Supply the intended payload; native user paste is unaffected.
    if (!paste.clipboardData?.files.length) Object.defineProperty(paste, 'clipboardData', { value: clipboard });
    const count = paste.clipboardData!.files.length;
    element.dispatchEvent(paste);
    return count;
  }, png);
  expect(pastedFiles).toBe(1);
  await expect(editor).toHaveValue(/images\/.*\.png/);
  await expect(page.getByText('项目与图片已保存在此浏览器', { exact: true })).toBeVisible();
  await page.reload();
  await expect(editor).toHaveValue(/images\/.*\.png/);
  await expect(page.locator('.pdf-content img')).toHaveCount(1);
  await expect.poll(() => page.locator('.pdf-content img').evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1);
  await page.getByRole('button', { name: '文档属性', exact: true }).click();
  await page.getByLabel('文档标题').fill('纯前端文档'); await page.getByLabel('文档作者').fill('作者');
  await page.getByLabel('文档主题').fill('选择页面'); await page.getByLabel('文档关键词').fill('图片\n书签');
  await page.getByRole('button', { name: '保存文档属性' }).click();
  await page.getByRole('button', { name: '关闭文档属性' }).click();
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.locator('.page-selection summary').click();
  await page.getByLabel('导出范围', { exact: true }).selectOption('range'); await page.getByLabel('导出页码').fill('2');
  await page.getByLabel('PDF 导出方式').selectOption('image'); await page.getByLabel('图像 PDF 清晰度').selectOption('small');
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: '下载', exact: true }).click();
  const download = await downloaded;
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({ data: Uint8Array.from(await fs.readFile((await download.path())!)) });
  try {
    const pdf = await loading.promise;
    expect(pdf.numPages).toBe(1); expect((await pdf.getOutline())?.map(heading => heading.title)).toEqual(['第二章']);
    expect((await pdf.getMetadata()).info).toMatchObject({ Title: '纯前端文档', Author: '作者', Subject: '选择页面', Keywords: '图片, 书签' });
  } finally { await loading.destroy(); }
});

test('extended math, table spans and folded callouts retain bodies in print across engines', async ({page}) => {
  await page.goto('/');
  await page.getByRole('textbox', {name:'Markdown 源代码编辑区'}).fill(await fs.readFile('tests/fixtures/extended-markdown.md', 'utf8'));
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.katex-error,.diagram-error')).toHaveCount(0);
  await expect(page.locator('.katex')).toHaveCount(5);
  await expect(page.locator('td[colspan="2"]')).toHaveText('合并两列');
  await expect(page.locator('td[rowspan="2"]')).toHaveText('分组甲');
  const folded = page.locator('details.md-alert-foldable[data-callout-fold="closed"]').first();
  await expect(folded).not.toHaveAttribute('open');
  const summary = folded.locator(':scope > summary');
  await expect(summary).toHaveCSS('display', 'list-item');
  await summary.focus(); await page.keyboard.press('Enter');
  await expect(folded.getByText('正文在折叠时仍应导出。')).toBeVisible();
  await summary.click(); await expect(folded).not.toHaveAttribute('open');
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')!;
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {get() {
      const win = descriptor.get!.call(this);
      if (win) win.print = () => { document.body.dataset.printed = 'true'; };
      return win;
    }});
  });
  await page.getByRole('button', {name:'打印／保存 PDF'}).click();
  await expect(page.locator('body')).toHaveAttribute('data-printed','true');
  const printed = await page.locator('iframe').getAttribute('srcdoc');
  expect(printed).toContain('正文在折叠时仍应导出');
  expect(printed).toContain('嵌套正文也应导出');
  const closedCount = await page.evaluate(html => {
    const doc = new DOMParser().parseFromString(html!, 'text/html');
    return doc.querySelectorAll('details.md-alert-foldable:not([open])').length;
  }, printed);
  expect(closedCount).toBe(0);
});

test('Doocs extensions and local diagram engines render without external requests', async ({page}) => {
  const external: string[] = [];
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4173')) external.push(request.url());
  });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const {renderMarkdownToHtml} = await import('/src/markdown.ts');
    const source = '[你好]{nǐ hǎo} ~波浪线~\n\n::: theorem 勾股定理\n$a^2+b^2=c^2$\n:::\n\n> [!IMPORTANT] 上线前必读\n> 正文\n\n```plantuml\n@startuml\nactor 读者\n读者 -> 工具 : 导出\n@enduml\n```\n\n```infographic\ninfographic list-row-horizontal-icon-arrow\ndata\n  title 客户增长引擎\n  items\n    - label 口碑传播\n      icon mdi/rocket-launch\n    - label 团队合作\n      icon mdi/account-group\n```';
    const output = await renderMarkdownToHtml(source, undefined, {});
    const host = document.createElement('div'); host.innerHTML = output.html;
    return {
      ruby: host.querySelector('ruby rt')?.textContent,
      wave: host.querySelector('.md-wavy')?.textContent,
      title: host.querySelector('.md-alert-important > strong')?.textContent,
      plantuml: host.querySelector('.plantuml-diagram svg')?.textContent,
      infographic: host.querySelector('.infographic-diagram svg')?.textContent,
      errors: host.querySelectorAll('.diagram-error,.katex-error').length,
      hosts: document.querySelectorAll('[data-infographic-host]').length,
    };
  });
  expect(result).toMatchObject({ruby:'nǐ hǎo',wave:'波浪线',title:'上线前必读',errors:0,hosts:0});
  expect(result.plantuml).toContain('导出'); expect(result.infographic).toContain('客户增长引擎');
  expect(result.infographic).toContain('口碑传播'); expect(external).toEqual([]);
});

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

test('dialect switching, local image projects and page-bottom notes across engines',async({page,browserName})=>{
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles([{name:'engine.md',mimeType:'text/markdown',buffer:Buffer.from('# Engine')},{name:'engine.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="green"/></svg>')}]);
  const editor=page.getByRole('textbox',{name:'Markdown 源代码编辑区'});
  await editor.fill('---\ndialect: gfm\n---\n~~strike~~ ==literal== $literal$\n\n- [x] task');
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.pdf-content s')).toHaveCount(1);await expect(page.locator('.pdf-content mark')).toHaveCount(0);
  const notes='---\nfootnotes: page-bottom\n---\nBody[^1]\n\n![Engine](engine.svg)\n\n[^1]: Bottom note';
  await editor.fill(notes);
  await expect(page.locator('.pdf-page-notes')).toContainText('Bottom note');
  await page.getByRole('button',{name:'项目库',exact:true}).click();
  const projectName = page.getByLabel('项目名称');
  // Cover native keyboard entry in WebKit and bulk input in the other engines.
  if (browserName === 'webkit') {
    await projectName.press('ControlOrMeta+A'); await projectName.pressSequentially('Engine project');
  } else await projectName.fill('Engine project');
  await expect(projectName).toHaveValue('Engine project');
  await page.getByRole('button',{name:'保存当前项目',exact:true}).click();
  await expect(page.getByRole('button',{name:'打开 Engine project',exact:true})).toBeVisible();
  await page.reload();await expect(editor).toHaveValue(notes);
  await expect(page.locator('.image-figure img')).toHaveAttribute('src',/^blob:/);
  await expect.poll(()=>page.locator('.image-figure img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  await expect(page.locator('.pdf-page-notes')).toContainText('Bottom note');
});
