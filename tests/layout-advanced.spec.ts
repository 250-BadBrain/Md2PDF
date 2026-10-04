import {test,expect} from '@playwright/test';
import {capturePrintedPdf} from './print';
test('page-bottom notes reserve space, split oversized notes, preserve targets',async({page},testInfo)=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {renderMarkdownToHtml}=await import('/src/markdown.ts');const {paginateHtml}=await import('/src/pagination.ts');
    const note='long-note '.repeat(1000)+'NOTE-END';
    const source=await renderMarkdownToHtml('# Notes\n\nBody[^a].\n\n'+('Another paragraph.\n\n'.repeat(60))+'[^a]: '+note,undefined,{});
    const pages=await paginateHtml(source.html,{footnotes:'page-bottom'});
    const host=document.createElement('div');document.body.append(host);host.innerHTML=pages.map(html=>`<article class="pdf-page">${html}</article>`).join('');
    const notes=[...host.querySelectorAll<HTMLElement>('.pdf-page-notes:not([hidden])')];
    const overlap=notes.some(aside=>{const content=aside.parentElement!.querySelector<HTMLElement>('.pdf-content')!;const last=content.lastElementChild;return last&&last.getBoundingClientRect().bottom>aside.getBoundingClientRect().top+1;});
    const result={count:pages.length,notes:notes.length,overlap,body:host.textContent,noteText:notes.map(node=>node.textContent).join('').replace(/\s+/g,''),ids:host.querySelectorAll('#fn1').length,backlinks:host.querySelectorAll('a.footnote-backref').length};host.remove();return result;
  });
  expect(result.count).toBeGreaterThan(2);expect(result.notes).toBeGreaterThan(1);expect(result.overlap).toBe(false);
  expect(result.noteText).toContain('long-note'.repeat(1000)+'NOTE-END');expect(result.ids).toBe(1);expect(result.backlinks).toBe(1);
  await page.setViewportSize({width:1800,height:1500});
  await page.getByRole('textbox',{name:'Markdown 源代码编辑区'}).fill('---\nfootnotes: page-bottom\npageNumbers: true\n---\n# 页底脚注\n\n正文引用[^1]。\n\n'+('正文段落，需要保留足够的脚注空间。\n\n'.repeat(20))+'[^1]: 这是页底脚注，正文与脚注不应重叠。');
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy','false');
  await page.locator('[data-page="1"]').screenshot({path:testInfo.outputPath('page-bottom.png')});
});
test('wide table mixed sizes and figure references survive PDF printing',async({page},testInfo)=>{
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles([{name:'doc.md',mimeType:'text/markdown',buffer:Buffer.from('# doc')},{name:'picture.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"></svg>')}]);
  const source='---\nwideTables: true\nfigureNumbers: true\n---\n# Portrait\n\n'+
    '![Caption](picture.svg)\n\nSee [@ref](#figure-1).\n\n'+
    '| A | B | C | D | E | F | G | H |\n|---|---|---|---|---|---|---|---|\n|1|2|3|4|5|6|7|8|\n\n# After table';
  await page.getByRole('textbox',{name:'Markdown 源代码编辑区'}).fill(source);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.pdf-page-shell')).toHaveCount(3);
  await expect(page.locator('[data-page="2"] .pdf-content')).toHaveAttribute('data-page-width','297');
  await expect(page.locator('a[href="#figure-1"]')).toHaveText('图 1');
  const pdf=await capturePrintedPdf(page);
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(pdf),useSystemFonts:true});const document=await task.promise;
  expect(document.numPages).toBe(3);
  const first=(await document.getPage(1)).getViewport({scale:1});const second=(await document.getPage(2)).getViewport({scale:1});
  expect(first.height).toBeGreaterThan(first.width);expect(second.width).toBeGreaterThan(second.height);await task.destroy();
  await page.locator('[data-page="2"]').screenshot({path:testInfo.outputPath('landscape.png')});
});
test('paragraph splitting respects the requested two-line minimum',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {paginateHtml}=await import('/src/pagination.ts');const text='A paragraph with words that wrap naturally. '.repeat(500);
    const pages=await paginateHtml(`<p>${text}</p>`,{minParagraphLines:2});
    const host=document.createElement('div');document.body.append(host);host.innerHTML=pages.map(html=>`<article class="pdf-page">${html}</article>`).join('');
    const counts=[...host.querySelectorAll('.pdf-content p')].map(paragraph=>{const range=document.createRange();range.selectNodeContents(paragraph);return new Set([...range.getClientRects()].map(rect=>Math.round(rect.top))).size;});
    const result={counts,text:host.textContent?.replace(/\s/g,'')};host.remove();return result;
  });
  expect(result.counts.length).toBeGreaterThan(2);expect(result.counts.every(count=>count>=2)).toBe(true);
  expect(result.text).toBe(('A paragraph with words that wrap naturally. '.repeat(500)).replace(/\s/g,''));
});
