import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { capturePrintedPdf } from './print';
import { extractPdfText } from './pdf-text';

test('extended formulas, table cells and callouts survive preview and PDF printing', async ({page}) => {
  await page.goto('/');
  await page.getByRole('textbox', {name:'Markdown 源代码编辑区'}).fill(await fs.readFile('tests/fixtures/extended-markdown.md', 'utf8'));
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.katex-error,.diagram-error')).toHaveCount(0);
  const closed = page.locator('details.md-alert-foldable').filter({has:page.locator('summary').filter({hasText:'注音与公式'})}).first();
  await expect(closed).not.toHaveAttribute('open');
  await expect(page.locator('td[colspan="2"]')).toHaveText('合并两列');
  await expect(page.locator('td[rowspan="2"]')).toHaveText('分组甲');
  await expect(page.locator('caption')).toHaveText('统计表');
  await expect(page.locator('.eqn-num')).toHaveText('(1)');
  await closed.locator(':scope > summary').click();
  await expect(closed).toHaveAttribute('open');
  await expect(closed.getByText('正文在折叠时仍应导出。')).toBeVisible();
  await expect(closed.locator('.katex')).toHaveCount(1);
  await closed.locator(':scope > summary').click();
  await expect(closed).not.toHaveAttribute('open');
  const pdf = await capturePrintedPdf(page);
  const text = await extractPdfText(pdf);
  expect(text).toContain('(1)');
  for (const phrase of ['合并两列','分组甲','第一行','第二行','统计表','正文在折叠时仍应导出','嵌套正文也应导出','已展开正文','结束标记']) expect(text).toContain(phrase);
  await fs.mkdir('tmp',{recursive:true}); await fs.writeFile('tmp/extended-markdown-print.pdf',pdf);
  await page.getByLabel('PDF 导出方式').selectOption('image');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', {name:'下载',exact:true}).click();
  const download = await downloadPromise;
  await download.saveAs('tmp/extended-markdown-image.pdf');
  expect((await fs.stat('tmp/extended-markdown-image.pdf')).size).toBeGreaterThan(10000);
  await expect(page.locator('.eqn-num')).toHaveText('(1)');
});

test('source and anchor navigation reveal folded destinations', async ({page}) => {
  await page.goto('/');
  const source = '[进入折叠内容](#fold-destination)\n\n> [!note]- 外层\n> > [!tip]- 内层\n> > ## 目标 {#fold-destination}\n> > 导航正文';
  await page.getByRole('textbox', {name:'Markdown 源代码编辑区'}).fill(source);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('details.md-alert-foldable[open]')).toHaveCount(0);
  await page.getByRole('link',{name:'进入折叠内容',exact:true}).click();
  await expect(page.locator('details.md-alert-foldable[open]')).toHaveCount(2);
  await expect(page.locator('#fold-destination')).toBeVisible();
  await page.locator('details.md-alert-foldable').first().locator(':scope > summary').click();
  await expect(page.locator('details.md-alert-foldable').first()).not.toHaveAttribute('open');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('preview-navigation', {detail:6})));
  await expect(page.locator('details.md-alert-foldable[open]')).toHaveCount(2);
  await expect(page.getByText('导航正文',{exact:true})).toBeVisible();
});

test('fold state survives preview virtualization and synchronizes page fragments', async ({page}) => {
  await page.goto('/');
  const source = '---\npaper: A5\nfontSize: 24\nlineHeight: 2\n---\n> [!note]- Long preview\n> ' + Array.from({length:1200},(_,i)=>`Word-${i}`).join(' ') + '\n>\n> Last destination';
  await page.getByRole('textbox', {name:'Markdown 源代码编辑区'}).fill(source);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy','false');
  expect(await page.locator('.pdf-page-shell').count()).toBeGreaterThan(6);
  await page.locator('.preview-panel').evaluate(node => { node.scrollTop=5; });
  await expect.poll(() => page.locator('details.md-alert-foldable[open]').count()).toBe(0);
  await page.locator('details.md-alert-foldable').first().locator(':scope > summary').click();
  await expect.poll(() => page.locator('details.md-alert-foldable:not([open])').count()).toBe(0);
  await page.locator('.preview-panel').evaluate(node => { node.scrollTop=node.scrollHeight; });
  await expect(page.locator('.pdf-page-shell[data-page="1"] .page-placeholder')).toBeVisible();
  await expect.poll(() => page.locator('details.md-alert-foldable:not([open])').count()).toBe(0);
  await page.locator('details.md-alert-foldable').last().locator(':scope > summary').click();
  await expect.poll(() => page.locator('details.md-alert-foldable[open]').count()).toBe(0);
  await page.locator('.preview-panel').evaluate(node => { node.scrollTop=0; });
  await expect(page.locator('.pdf-page-shell[data-page="1"] details')).not.toHaveAttribute('open');
  await page.evaluate(line => window.dispatchEvent(new CustomEvent('preview-navigation', {detail:line})), source.split('\n').length);
  await expect(page.getByText('Last destination',{exact:true})).toBeVisible();
  await expect.poll(() => page.locator('details.md-alert-foldable:not([open])').count()).toBe(0);
});

test('long folded callouts retain complete content, summaries and page bounds', async ({page}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const {renderMarkdownToHtml} = await import('/src/markdown.ts');
    const {paginateHtml} = await import('/src/pagination.ts');
    const source = '> [!note]- Long callout\n> ' + Array.from({length:800},(_,i)=>`Body-${i}`).join(' ');
    const rendered = await renderMarkdownToHtml(source, undefined, {});
    const pages = await paginateHtml(rendered.html, {paper:'A5'});
    const host = document.createElement('div'); host.innerHTML = pages.map(html=>`<article class="pdf-page">${html}</article>`).join(''); document.body.append(host);
    const details = [...host.querySelectorAll('details.md-alert-foldable')];
    const result = {pages:pages.length,fragments:details.length,closed:details.filter(node=>!node.hasAttribute('open')).length,
      missing:details.filter(node=>node.querySelector(':scope > summary')?.textContent !== 'Long callout').length,
      words:(host.textContent?.match(/Body-\d+/g)||[]).length,ending:host.textContent?.includes('Body-799'),
      overflow:[...host.querySelectorAll<HTMLElement>('.pdf-content')].filter(node=>node.scrollHeight>node.clientHeight+1).length};
    host.remove();return result;
  });
  expect(result.pages).toBeGreaterThan(1); expect(result.fragments).toBe(result.pages);
  expect(result.closed).toBe(0);expect(result.missing).toBe(0);expect(result.words).toBe(800);expect(result.ending).toBe(true);expect(result.overflow).toBe(0);
});

test('manual page breaks retain nested fold summaries and complete bodies', async ({page}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const {renderMarkdownToHtml} = await import('/src/markdown.ts');
    const {paginateHtml} = await import('/src/pagination.ts');
    const source = '> [!note]- Outer\n> > [!tip]- Inner\n> > Before\n> >\n> > [pagebreak]\n> >\n> > After';
    const rendered = await renderMarkdownToHtml(source,undefined,{});
    const pages = await paginateHtml(rendered.html);
    const doc = new DOMParser().parseFromString(pages.join(''), 'text/html');
    return {pages:pages.length,titles:[...doc.querySelectorAll('details.md-alert-foldable')].map(node=>node.querySelector(':scope > summary')?.textContent),
      text:doc.body.textContent,closed:doc.querySelectorAll('details.md-alert-foldable:not([open])').length};
  });
  expect(result.pages).toBe(2);expect(result.titles).toEqual(['Outer','Inner','Outer','Inner']);
  expect(result.text).toContain('Before');expect(result.text).toContain('After');expect(result.closed).toBe(0);
});

test('extended table groups preserve spans, cells, captions and formulas across pages', async ({page}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const {renderMarkdownToHtml} = await import('/src/markdown.ts');
    const {paginateHtml} = await import('/src/pagination.ts');
    const body = Array.from({length:60},(_,i)=>`| Group-${i} | Span-${i} ||\n| ^^ | Formula-${i} | $x_${i}^2$ |`).join('\n');
    const rendered = await renderMarkdownToHtml(`| Group | Value | Math |\n| --- | --- | --- |\n${body}\n[Complete table]`,undefined,{});
    const pages = await paginateHtml(rendered.html, {paper:'A5'});
    const host = document.createElement('div'); host.innerHTML = pages.map(html=>`<article class="pdf-page">${html}</article>`).join(''); document.body.append(host);
    const result = {pages:pages.length,rowspan:host.querySelectorAll('td[rowspan="2"]').length,colspan:host.querySelectorAll('td[colspan="2"]').length,
      math:host.querySelectorAll('.katex').length, errors:host.querySelectorAll('.katex-error').length,
      captions:host.querySelectorAll('caption').length,tables:host.querySelectorAll('table').length,
      groups:[...host.querySelectorAll('table')].every(table=>{
        const rows=[...table.querySelectorAll('tbody tr')];
        return rows.every((row,index)=> !row.querySelector('[rowspan="2"]') || rows[index+1]?.textContent?.includes('Formula-'));
      }),ending:host.textContent?.includes('Formula-59'),overflow:[...host.querySelectorAll<HTMLElement>('.pdf-content')].filter(node=>node.scrollHeight>node.clientHeight+1).length};
    host.remove();return result;
  });
  expect(result.pages).toBeGreaterThan(1);expect(result.rowspan).toBe(60);expect(result.colspan).toBe(60);expect(result.math).toBe(60);expect(result.errors).toBe(0);
  expect(result.captions).toBe(result.tables);expect(result.groups).toBe(true);expect(result.ending).toBe(true);expect(result.overflow).toBe(0);
});

test('oversized tables inside callouts preserve headers, spans and cell contents', async ({page}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const {renderMarkdownToHtml} = await import('/src/markdown.ts');
    const {paginateHtml} = await import('/src/pagination.ts');
    const table = '| Group | Value | Math |\n| --- | --- | --- |\n' + Array.from({length:30},(_,i)=>`| Group-${i} | Span-${i} ||\n| ^^ | Formula-${i} | $x_${i}^2$ |`).join('\n') + '\n[Callout table]';
    const source = '> [!note]- Nested table\n> Before\n>\n' + table.split('\n').map(line=>'> '+line).join('\n') + '\n>\n> After';
    const rendered = await renderMarkdownToHtml(source,undefined,{});
    const pages = await paginateHtml(rendered.html,{paper:'A5'});
    const host = document.createElement('div'); host.innerHTML=pages.map(html=>`<article class="pdf-page">${html}</article>`).join('');document.body.append(host);
    const result = {tables:host.querySelectorAll('table').length,headers:host.querySelectorAll('thead').length,
      rows:host.querySelectorAll('tbody tr').length,spans:host.querySelectorAll('td[rowspan="2"][data-source-line]').length,
      math:host.querySelectorAll('.katex').length,words:[...host.querySelectorAll('tbody td')].map(node=>node.textContent),
      text:host.textContent,overflow:[...host.querySelectorAll<HTMLElement>('.pdf-content')].some(node=>node.scrollHeight>node.clientHeight+1)};
    host.remove();return result;
  });
  expect(result).toMatchObject({tables:1,headers:1,rows:60,spans:30,math:30,overflow:false});
  for(let i=0;i<30;i++){ expect(result.words).toContain(`Group-${i}`);expect(result.words).toContain(`Span-${i}`);expect(result.words).toContain(`Formula-${i}`); }
  expect(result.text).toContain('Before');expect(result.text).toContain('After');
});
