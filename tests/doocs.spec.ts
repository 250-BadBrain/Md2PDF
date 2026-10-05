import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {capturePrintedPdf} from './print';
import {extractPdfText} from './pdf-text';

test('ruby units remain complete across page boundaries', async ({page}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const {renderMarkdownToHtml} = await import('/src/markdown.ts');
    const {paginateHtml} = await import('/src/pagination.ts');
    const rendered = await renderMarkdownToHtml('[你好世界]{nǐhǎoshìjiè}'.repeat(400), undefined, {});
    const pages = await paginateHtml(rendered.html, {paper:'A5'});
    const host = document.createElement('div'); host.innerHTML = pages.join('');
    return {pages:pages.length, count:host.querySelectorAll('ruby').length,
      broken:[...host.querySelectorAll('ruby')].filter(ruby => ruby.querySelector('rt')?.textContent !== 'nǐhǎoshìjiè' || ruby.firstChild?.textContent !== '你好世界').length,
      scaled:host.querySelectorAll('.pagination-scaled').length};
  });
  expect(result.pages).toBeGreaterThan(1);expect(result.count).toBe(400);expect(result.broken).toBe(0);expect(result.scaled).toBe(0);
});

test('complete Doocs example renders extensions, diagrams and images and survives PDF printing',async({page})=>{
  test.setTimeout(120000);
  const external:string[]=[];
  page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:4173')&&!request.url().startsWith('data:')&&!request.url().startsWith('blob:'))external.push(request.url());});
  await page.route('https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/**',route=>route.fulfill({contentType:'image/svg+xml',headers:{'Access-Control-Allow-Origin':'*'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#528795"/></svg>'}));
  await page.goto('/');const source=await fs.readFile('tests/fixtures/doocs/example.md','utf8');
  await page.getByRole('textbox',{name:'Markdown 源代码编辑区'}).fill(source);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy','false');
  const result=await page.evaluate(async source=>{
    const {renderMarkdownToHtml}=await import('/src/markdown.ts');const {paginateHtml}=await import('/src/pagination.ts');
    const document=await renderMarkdownToHtml(source,undefined,{});const pages=await paginateHtml(document.html);
    const host=window.document.createElement('div');host.className='pdf-document';host.innerHTML=pages.map(html=>`<article class="pdf-page">${html}</article>`).join('');window.document.body.append(host);
    const errors=[...host.querySelectorAll('.katex-error,.mermaid-error,.diagram-error,.missing-image')].map(node=>node.textContent);
    const summary={pages:pages.length,math:host.querySelectorAll('.katex').length,mermaid:host.querySelectorAll('.mermaid-diagram svg').length,plantuml:host.querySelectorAll('.plantuml-diagram svg').length,infographic:host.querySelectorAll('.infographic-diagram svg').length,ruby:host.querySelectorAll('ruby').length,containers:host.querySelectorAll('.md-container').length,errors,overflow:[...host.querySelectorAll<HTMLElement>('.pdf-content')].filter(node=>node.scrollHeight>node.clientHeight+1).length,title:host.querySelector('.md-alert-important > strong')?.textContent,qrWidth:host.querySelector<HTMLImageElement>('img[alt="qr code"]')?.getBoundingClientRect().width,ending:host.textContent?.includes('推荐阅读')};
    host.remove();return summary;
  },source);
  console.log('Doocs compatibility:',result);
  expect(result.errors).toEqual([]);expect(result.math).toBe(14);expect(result.mermaid).toBe(4);
  expect(result.plantuml).toBe(1);expect(result.infographic).toBe(1);expect(result.ruby).toBeGreaterThanOrEqual(8);
  expect(result.containers).toBe(5);expect(result.title).toBe('上线前必读');expect(result.qrWidth).toBeCloseTo(100,0);expect(result.overflow).toBe(0);expect(result.ending).toBe(true);
  expect(external.filter(url=>!url.startsWith('https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/'))).toEqual([]);
  const pdf=await capturePrintedPdf(page,async()=>{await page.getByRole('button',{name:'打印／保存 PDF',exact:true}).click();});
  const text=await extractPdfText(pdf);expect(text).toContain('客户增长引擎');expect(text).toContain('口碑传播');expect(text).toContain('勾股定理');expect(text).toContain('nǐ');expect(text).toContain('To queue');
  await fs.mkdir('tmp',{recursive:true});await fs.writeFile('tmp/doocs-print.pdf',pdf);
});
