import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import { extractPdfText } from './pdf-text';
import { capturePrintedPdf } from './print';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('long paragraphs, highlighted code and nested lists preserve all text across pages', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // Import through Vite to exercise the production parser and paginator in an actual layout engine.
    const { renderMarkdownToHtml } = await import('/src/markdown.ts');
    const { paginateHtml } = await import('/src/pagination.ts');
    const long = '中文😀 **formatted text** [link](https://example.com) '.repeat(500);
    const code = Array.from({ length: 180 }, (_, index) => `const value${index} = '${'wide'.repeat(20)}';`).join('\n');
    const list = Array.from({ length: 100 }, (_, index) => `${index + 1}. item-${index}\n   - nested-${index}`).join('\n');
    const source = await renderMarkdownToHtml(`${long}\n\n\`\`\`js\n${code}\n\`\`\`\n\n${list}`, undefined, {});
    const original = document.createElement('div'); original.innerHTML = source.html;
    const pages = await paginateHtml(source.html);
    const host = document.createElement('div'); document.body.appendChild(host);
    host.innerHTML = pages.map((html) => `<article class="pdf-page">${html}</article>`).join('');
    const contents = [...host.querySelectorAll<HTMLElement>('.pdf-content')];
    const result = {
      original: original.textContent?.replace(/\s+/g, ''),
      actual: contents.map((node) => node.textContent).join('').replace(/\s+/g, ''),
      count: pages.length,
      overflow: contents.filter((node) => node.scrollHeight > node.clientHeight + 1).length,
      codeEnd: host.textContent?.includes('value179'),
      links: host.querySelectorAll('a[href="https://example.com"]').length,
    };
    host.remove(); return result;
  });
  expect(result.actual).toBe(result.original);
  expect(result.count).toBeGreaterThan(4);
  expect(result.overflow).toBe(0);
  expect(result.codeEnd).toBe(true);
  expect(result.links).toBeGreaterThan(0);
});

test('table headers repeat and all rows fit; oversized rows remain visible', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { renderMarkdownToHtml } = await import('/src/markdown.ts');
    const { paginateHtml } = await import('/src/pagination.ts');
    const rows = Array.from({ length: 120 }, (_, index) => `| row-${index} | value-${index} |`).join('\n');
    const source = await renderMarkdownToHtml(`| Key | Value |\n| --- | --- |\n${rows}\n| tall | ${'long text '.repeat(2500)} |\n| final | last |`, undefined, {});
    const pages = await paginateHtml(source.html);
    const host = document.createElement('div'); document.body.appendChild(host);
    host.innerHTML = pages.map((html) => `<article class="pdf-page">${html}</article>`).join('');
    const result = {
      rows: host.querySelectorAll('tbody tr').length,
      tables: host.querySelectorAll('table').length,
      headers: host.querySelectorAll('thead').length,
      overflow: [...host.querySelectorAll<HTMLElement>('.pdf-content')].filter((node) => node.scrollHeight > node.clientHeight + 1).length,
      final: host.textContent?.includes('last'),
      words: (host.textContent?.match(/long text/g) || []).length,
      scaled: host.querySelectorAll('table[style*="scale"]').length,
    };
    host.remove(); return result;
  });
  expect(result.rows).toBeGreaterThan(122);
  expect(result.tables).toBeGreaterThan(1);
  expect(result.headers).toBe(result.tables);
  expect(result.overflow).toBe(0);
  expect(result.final).toBe(true);
  expect(result.words).toBe(2500);
  expect(result.scaled).toBe(0);
});

test('footnote IDs survive splitting and wide display formulas fit the content width', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { renderMarkdownToHtml } = await import('/src/markdown.ts');
    const { paginateHtml } = await import('/src/pagination.ts');
    const refs = Array.from({ length: 90 }, (_, index) => `[^${index}]`).join(' ');
    const notes = Array.from({ length: 90 }, (_, index) => `[^${index}]: Footnote ${index} ${'details '.repeat(20)}`).join('\n');
    const source = await renderMarkdownToHtml(`${refs}\n\n${notes}\n\n$$${'x+'.repeat(100)}y$$`, undefined, {});
    const pages = await paginateHtml(source.html);
    const host = document.createElement('div'); document.body.appendChild(host);
    host.innerHTML = pages.map((html) => `<article class="pdf-page">${html}</article>`).join('');
    const formula = host.querySelector<HTMLElement>('.katex-html');
    const result = {
      notes: host.querySelectorAll('li[id^="fn"]').length,
      targets: [...host.querySelectorAll<HTMLAnchorElement>('a.footnote-ref,.footnote-ref a[href]')].length === 90 && [...host.querySelectorAll<HTMLAnchorElement>('a.footnote-ref,.footnote-ref a[href]')].every((link) =>
        [...host.querySelectorAll('[id]')].some((element) => element.id === decodeURIComponent(link.getAttribute('href')!.slice(1)))),
      formulaWidth: formula?.getBoundingClientRect().width ?? 0,
      availableWidth: formula?.closest('.katex-display')?.clientWidth ?? 0,
    };
    host.remove(); return result;
  });
  expect(result.notes).toBe(90);
  expect(result.targets).toBe(true);
  expect(result.formulaWidth).toBeLessThanOrEqual(result.availableWidth);
});

test('page metadata stays scoped, margins survive, and trailing breaks add no blank page', async ({ page }) => {
  const editor = page.getByRole('textbox');
  await editor.fill('---\ntitle: "<img src=x onerror=alert(1)>"\nheader: "{title} {page}/{total}"\nfooter: "Footer {page}"\npageNumbers: true\nmargin: 25mm\n---\n[TOC]\n\n# Heading\n\nLiteral {page} {title} `__PAGE__`\n\n[pagebreak]\n\n## Next\n\nEnd\n\n[pagebreak]');
  await expect(page.locator('.pdf-page-shell')).toHaveCount(2);
  expect(await page.locator('.pdf-content').first().evaluate((el) => parseFloat(getComputedStyle(el).paddingTop))).toBeCloseTo(94.488, 1);
  await expect(page.locator('.pdf-content').first()).toContainText('Literal {page} {title} __PAGE__');
  await expect(page.locator('.pdf-page-header').first()).toHaveText('<img src=x onerror=alert(1)> 1/2');
  await expect(page.locator('.pdf-page-header img')).toHaveCount(0);
  await expect(page.locator('.toc-page-number')).toHaveText(['1', '2']);
});

test('Mermaid diagrams and all math forms render in the preview', async ({ page }) => {
  await page.getByRole('textbox').fill('# Diagrams\n\n```mermaid\nflowchart LR\nA[开始] --> B[完成]\n```\n\nInline $x^2$ and \\(a+b\\)\n\n\\[c+d\\]\n\n```math\ne=f\n```');
  await expect(page.locator('.pdf-page-shell .mermaid-diagram svg')).toHaveCount(1, { timeout: 30000 });
  await expect(page.locator('.pdf-page-shell .katex')).toHaveCount(4);
});

test('prints a searchable PDF and shows upload/export failures in the UI', async ({ page }, testInfo) => {
  await page.getByRole('textbox').fill('---\ntitle: PDF 验证\nheader: "{title} · {page}/{total}"\npageNumbers: true\nmargin: 20mm\n---\n# PDF 验证\n\n[TOC]\n\n> [!TIP]\n> **提示**和[链接](https://example.com)\n\n$x^2$，以及 \\(\\frac{1}{2}\\)\n\n| 左侧 | 右侧 |\n| :--- | ---: |\n| 中文 | **格式** |\n\n```mermaid\nflowchart LR\nA[开始] --> B[完成]\n```\n\n[pagebreak]\n\n## 第二页\n\n- [x] 完成');
  await expect(page.locator('.pdf-page-shell')).toHaveCount(2);
  const buffer = await capturePrintedPdf(page);
  await fs.writeFile(testInfo.outputPath('export.pdf'), buffer);
  expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  expect(buffer.length).toBeGreaterThan(10000);
  expect(buffer.toString('latin1')).toContain('/Count 2');
  expect(buffer.toString('latin1')).toContain('/Subtype /Link');
  expect(buffer.toString('latin1')).toContain('https://example.com');
  expect(buffer.toString('latin1')).toContain('/Dest');
  const text = await extractPdfText(buffer);
  expect(text.replace(/\s+/g, ' ')).toContain('PDF 验证');
  expect(text).toContain('第二页');
  expect(text).toContain('开始');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'invalid.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await expect(page.getByRole('alert')).toContainText('没有 Markdown');
});

test('folder upload resolves reference images and preserves same-name files in nested ZIP paths', async ({ page }, testInfo) => {
  const root = testInfo.outputPath('book');
  await fs.mkdir(`${root}/one`, { recursive: true });
  await fs.mkdir(`${root}/two`, { recursive: true });
  await fs.mkdir(`${root}/images`, { recursive: true });
  await fs.writeFile(`${root}/one/same.md`, '# One\n\n![local][image]\n\n[image]: <../images/a b.svg>');
  await fs.writeFile(`${root}/two/same.md`, '# Two');
  await fs.writeFile(`${root}/images/a b.svg`, '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="green"/></svg>');
  await page.locator('input[webkitdirectory]').setInputFiles(root);
  await expect(page.locator('.batch-message')).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载', exact: true }).click();
  const download = await downloading;
  const zip = await JSZip.loadAsync(await fs.readFile((await download.path())!));
  expect(zip.file('book/one/same.pdf')).not.toBeNull();
  expect(zip.file('book/two/same.pdf')).not.toBeNull();
  expect(Object.keys(zip.files).filter((name) => name.endsWith('.pdf'))).toHaveLength(2);
});

test('batch ZIP preserves directories and does not overwrite same-name PDFs', async ({ page }) => {
  await page.locator('input[type=file]').first().setInputFiles([
    { name: 'same.md', mimeType: 'text/markdown', buffer: Buffer.from('# first') },
    { name: 'same.markdown', mimeType: 'text/markdown', buffer: Buffer.from('# second') },
  ]);
  await expect(page.locator('.batch-message')).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载', exact: true }).click();
  const download = await downloading;
  const zip = await JSZip.loadAsync(await fs.readFile((await download.path())!));
  expect(Object.keys(zip.files)).toEqual(['same.pdf', 'same (2).pdf']);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.getByRole('textbox')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue('# first');
  await expect(page.locator('.pdf-page-shell')).toHaveCount(1);
});
