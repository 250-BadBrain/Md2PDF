import { describe, expect, it } from 'vitest';
import { renderMarkdownToHtml, parseFrontMatter } from '../src/markdown';

const render = async (source: string, assets: Record<string, string> = {}) => {
  const result = await renderMarkdownToHtml(source, 'book/docs/chapter.md', assets);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = result.html;
  return wrapper;
};

describe('Markdown syntax and regressions', () => {
  it('keeps missing inline images inside paragraphs and image links', async () => {
    const doc = await render('Before [![missing](missing.png)](/target) after');
    expect(doc.querySelectorAll('p')).toHaveLength(1);
    expect(doc.querySelector('p a .missing-image')).not.toBeNull();
    expect(doc.querySelector('p')?.textContent).toBe('Before 图片未找到：missing.png after');
  });
  it('handles GFM literal links without nesting links or interpreting code', async () => {
    const doc = await render('www.example.com/search?q=(business))+ok\n\nwww.example.com/search?q=commonmark&hl;\n\nfoo@bar.baz a.b-c_d@a.b-\n\n`foo@bar.baz` [www.example.com](https://target.example) <a href="/existing">foo@bar.baz</a>');
    const links = [...doc.querySelectorAll('a')];
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'http://www.example.com/search?q=(business))+ok',
      'http://www.example.com/search?q=commonmark',
      'mailto:foo@bar.baz', 'https://target.example', '/existing',
    ]);
    expect(doc.querySelector('a a')).toBeNull();
    expect(doc.querySelector('code')?.textContent).toBe('foo@bar.baz');
  });
  it('configures soft breaks without changing hard breaks, and YAML overrides preferences', async () => {
    const source = 'soft\nline\n\nhard  \nline\n\nslash\\\nline';
    const normal = await renderMarkdownToHtml(source, undefined, {}, { softBreaks: 'newline' });
    const strict = await renderMarkdownToHtml(source, undefined, {}, { softBreaks: 'space' });
    expect((normal.html.match(/<br>/g) || [])).toHaveLength(3);
    expect((strict.html.match(/<br>/g) || [])).toHaveLength(2);
    expect(strict.html).toContain('soft\nline');
    const override = await renderMarkdownToHtml('---\nsoftBreaks: space\n---\nsoft\nline', undefined, {}, { softBreaks: 'newline' });
    expect(override.html).not.toContain('<br>');
    expect(override.meta.softBreaks).toBe('space');
    const [left, right] = await Promise.all([
      renderMarkdownToHtml('$x$\na', undefined, {}, { softBreaks: 'space' }),
      renderMarkdownToHtml('$x$\na', undefined, {}, { softBreaks: 'newline' }),
    ]);
    expect(left.html).not.toContain('<br>');
    expect(right.html).toContain('<br>');
  });
  it('renders CommonMark blocks, nested lists, references, escapes and GFM', async () => {
    const doc = await render('Title\n=====\n\n**bold** *italic* ~~deleted~~ `code` \\*literal\\* [link][ref]\n\n[ref]: https://example.com\n\n1. one\n   - nested\n\n- [x] done\n- [ ] open\n\n| left | right |\n| :--- | ---: |\n| a | b |');
    for (const tag of ['h1', 'strong', 'em', 's', 'code', 'ol ul', 'table']) expect(doc.querySelector(tag)).not.toBeNull();
    expect(doc.querySelector('a[href="https://example.com"]')).not.toBeNull();
    expect(doc.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(doc.querySelector('th:last-child')?.getAttribute('style')).toContain('right');
  });

  it('resolves reference images, spaces, parentheses, encoded and HTML image paths', async () => {
    const assets = { 'book/images/a b(1).png': 'blob:asset-one' };
    const doc = await render('![caption][img]\n\n[img]: <../images/a b(1).png>\n\n![next](../images/a%20b(1).png)\n\n<img src="../images/a%20b(1).png" width="80">', assets);
    expect(doc.querySelectorAll('img')).toHaveLength(3);
    for (const image of doc.querySelectorAll('img')) expect(image.getAttribute('src')).toBe('blob:asset-one');
  });

  it('recognizes page breaks without altering fenced or indented code', async () => {
    const doc = await render('before\n[pagebreak]\nafter\n\n```md\n[pagebreak]\n<!-- pagebreak -->\n```\n\n    {pagebreak}\n\n<!-- pagebreak -->\n\n{pagebreak}');
    expect(doc.querySelectorAll('.page-break')).toHaveLength(3);
    expect(doc.querySelector('pre')?.textContent).toBe('[pagebreak]\n<!-- pagebreak -->\n');
    expect(doc.querySelectorAll('pre')[1].textContent).toContain('{pagebreak}');
  });

  it('preserves inline formatting in GitHub alerts', async () => {
    const doc = await render('> [!NOTE]\n> **bold** and [link](https://example.com)\n>\n> second paragraph');
    expect(doc.querySelector('.md-alert strong')?.textContent).toBe('Note');
    expect(doc.querySelector('.md-alert p strong')?.textContent).toBe('bold');
    expect(doc.querySelector('.md-alert a')?.textContent).toBe('link');
  });

  it('supports containers, definitions, abbreviation, footnotes and inline extensions', async () => {
    const doc = await render('::: warning Custom title\n==marked== ++inserted++ H~2~O x^2^ :smile:\n:::\n\nTerm\n: Definition\n\nHTML\n\n*[HTML]: Hypertext\n\nText[^1]\n\n[^1]: footnote');
    for (const selector of ['.md-container-warning', 'mark', 'ins', 'sub', 'sup', 'dl', 'abbr', '.footnotes']) expect(doc.querySelector(selector)).not.toBeNull();
    expect(doc.textContent).toContain('😄');
  });

  it('keeps every TOC link synchronized with explicit and duplicate heading IDs', async () => {
    const doc = await render('[TOC]\n\n# Same\n\n## Same\n\n### 中文 {#custom}\n\n###### Deep\n\n## Same\n\n## 🚀');
    const ids = Array.from(doc.querySelectorAll('h1,h2,h3,h4,h5,h6'), (el) => el.id);
    const targets = Array.from(doc.querySelectorAll('.table-of-contents a'), (el) => decodeURIComponent(el.getAttribute('href')!.slice(1)));
    expect(targets).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('custom');
  });

  it('supports dollar, bracket and fenced math, preserving KaTeX styles', async () => {
    const doc = await render('中文$x^2$\n\n\\(a+b\\)\n\n$$\n\\frac{1}{2}\n$$\n\n\\[c+d\\]\n\n```math\ne=f\n```');
    expect(doc.querySelectorAll('.katex')).toHaveLength(5);
    expect(doc.querySelector('.katex [style]')).not.toBeNull();
  });

  it('deduplicates explicit IDs and reserves them ahead of automatic heading IDs', async () => {
    const doc = await render('[TOC]\n\n# custom\n\n## A {#custom}\n\n## B {#custom}');
    const ids = Array.from(doc.querySelectorAll('h1,h2'), (element) => element.id);
    expect(ids).toEqual(['custom-1', 'custom', 'custom-2']);
    const targets = Array.from(doc.querySelectorAll('.table-of-contents a'), (element) => decodeURIComponent(element.getAttribute('href')!.slice(1)));
    expect(targets).toEqual(ids);
  });

  it('does not interpret escaped dollars or code as formulas', async () => {
    const doc = await render('\\$5 and \\$10; `$x$`\n\n```txt\n$x$\n```');
    expect(doc.querySelector('.katex')).toBeNull();
  });

  it('supports embedded HTML and removes executable content and hostile styles', async () => {
    const doc = await render('<details open><summary>More</summary><kbd>Ctrl</kbd></details>\n\n<script>alert(1)</script><img src="https://example.com/a.png" onerror="alert(1)"><a href="javascript:alert(1)">bad</a><div style="position:fixed">text</div>');
    expect(doc.querySelector('details summary')?.textContent).toBe('More');
    expect(doc.querySelector('script,[onerror],[style],a[href^="javascript:"]')).toBeNull();
  });

  it('supports tilde math fences and image attributes', async () => {
    const doc = await render('~~~math\nx=y\n~~~\n\n![caption](https://example.com/a.png){width=100 height=50}');
    expect(doc.querySelector('.katex-display')).not.toBeNull();
    expect(doc.querySelector('img')?.getAttribute('width')).toBe('100');
    expect(doc.querySelector('img')?.getAttribute('height')).toBe('50');
  });

  it('resolves root-relative local assets and ignores query strings', async () => {
    const doc = await render('![asset](/images/chart.png?raw=1#view)', { 'book/images/chart.png': 'blob:chart' });
    expect(doc.querySelector('img')?.getAttribute('src')).toBe('blob:chart');
  });

  it('parses BOM/CRLF front matter and preserves invalid YAML', () => {
    expect(parseFrontMatter('\uFEFF---\r\ntitle: Test\r\nmargin: 20mm\r\n...\r\nBody')).toMatchObject({ body: 'Body', meta: { title: 'Test', margin: '20mm' } });
    const invalid = '---\ntitle: [bad\n---\nBody';
    expect(parseFrontMatter(invalid).body).toBe(invalid);
    expect(parseFrontMatter('---\nmargin: 200mm\n---\nBody').meta.margin).toBeUndefined();
  });
});
