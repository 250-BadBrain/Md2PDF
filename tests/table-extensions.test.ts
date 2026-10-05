import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import { tableExtensions } from '../src/table-extensions';
import { parseMarkdownSyntax } from '../src/markdown-parser';
import { renderMarkdownToHtml } from '../src/markdown';

function render(source: string) {
  const md = new MarkdownIt({ html: false }).use(tableExtensions);
  const doc = document.createElement('div'); doc.innerHTML = md.render(source);
  return { md, doc };
}

describe('Document table extensions', () => {
  it('keeps ordinary GFM tables byte-for-byte including spaced empty cells, alignments and ragged rows', () => {
    const source = '| A | B | C |\n|:---|:---:|---:|\n| one | | three |\n| short |\n| a | b | c | ignored |\n\nAfter';
    expect(new MarkdownIt().use(tableExtensions).render(source)).toBe(new MarkdownIt().render(source));
  });

  it('merges adjacent empty columns and repeated row markers without merging spaced empty columns', () => {
    const { doc } = render('| A | B | C |\n|---|---|---|\n| Group | wide ||\n| ^^ | | three |\n| ^^ | tail ||');
    expect(doc.querySelector('tbody tr:first-child td')?.getAttribute('rowspan')).toBe('3');
    expect(doc.querySelector('tbody tr:first-child td:nth-child(2)')?.getAttribute('colspan')).toBe('2');
    expect(doc.querySelector('tbody tr:nth-child(2) td')?.textContent).toBe('');
    expect(doc.querySelector('tbody tr:last-child td')?.getAttribute('colspan')).toBe('2');
  });

  it('preserves escaped pipes, single/multiple code delimiters and unmatched backticks in extended tables', () => {
    const { doc } = render('| A | B | C |\n|---|---|---|\n| a\\|b | `c|d` | `` e|`f `` |\n| literal ` tick | slash\\\\ | end |\n| joined || end |');
    const rows = doc.querySelectorAll('tbody tr');
    expect(rows[0].children).toHaveLength(3);
    expect(rows[0].children[0].textContent).toBe('a|b');
    expect(rows[0].children[1].querySelector('code')?.textContent).toBe('c|d');
    expect(rows[0].children[2].querySelector('code')?.textContent).toBe('e|`f');
    expect(rows[1].children[0].textContent).toBe('literal ` tick');
    expect(rows[1].children[1].textContent).toBe('slash\\');
  });

  it('joins multiline rows with inline formatting and preserves source lines', () => {
    const source = 'Before\n\n| A | B |\n|---|---|\n| **first** | one |\\\n| second | two |\n\nAfter';
    const { md, doc } = render(source);
    expect(doc.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(doc.querySelector('td strong')?.textContent).toBe('first');
    expect(doc.querySelector('td')?.textContent).toContain('second');
    const tokens = md.parse(source, {});
    expect(tokens.find(token => token.type === 'table_open')?.map).toEqual([2, 6]);
    expect(tokens.find(token => token.type === 'td_open')?.map).toEqual([4, 6]);
  });

  it('renders inline mathematics in both spanning and multiline cells', async () => {
    const result = await parseMarkdownSyntax('| A | B |\n|---|---|\n| $x^2$ ||\n| first $a$ | $b$ |\\\n| second | tail |', undefined, {});
    const doc = document.createElement('div'); doc.innerHTML = result.html;
    expect(doc.querySelectorAll('.katex')).toHaveLength(3);
    expect(doc.querySelector('td[colspan="2"] .katex')).not.toBeNull();
    expect(doc.querySelector('table')?.dataset.sourceLine).toBe('1');
    expect(doc.querySelector('tbody tr:last-child')?.getAttribute('data-source-line')).toBe('4');
  });

  it('supports captions before or after tables with safe optional Unicode IDs and duplicates', () => {
    const { doc } = render('[**说明**][表-1]\n| A | B |\n|---|---|\n| a | b |\n\n| A | B |\n|---|---|\n| c | d |\n[第二说明]{#表-1}\n\n| A | B |\n|---|---|\n| e | f |\n[<img src=x onerror=bad()>][bad" onclick="oops]');
    expect(doc.querySelectorAll('caption')).toHaveLength(3);
    expect(doc.querySelector('caption strong')?.textContent).toBe('说明');
    expect(Array.from(doc.querySelectorAll('caption'), node => node.id)).toEqual(['表-1', '表-1-2', '']);
    expect(doc.querySelector('caption img,[onclick],[onerror]')).toBeNull();
  });

  it('works inside document containers and preserves standard modes', async () => {
    const source = '::: tip Tables\n| A | B |\n|---|---|\n| $x$ ||\n[内容]\n:::';
    const rendered = await parseMarkdownSyntax(source, undefined, {});
    const doc = document.createElement('div'); doc.innerHTML = rendered.html;
    expect(doc.querySelector('.md-container-tip table td[colspan="2"]')).not.toBeNull();
    expect(doc.querySelector('caption')?.textContent).toBe('内容');
    for (const dialect of ['gfm', 'commonmark'] as const) {
      const result = await parseMarkdownSyntax('| A | B |\n|---|---|\n| x ||', undefined, {}, { dialect });
      expect(result.html).not.toContain('colspan');
    }
  });

  it('handles empty leading cells, missing fields and orphan rowspan markers without throwing', () => {
    const { doc } = render('| A | B | C |\n|---|---|---|\n|| x | z |\n| ^^ | y |\n| a || c |\n| ^^ | ^^ | ^^ |');
    expect(doc.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(doc.querySelector('tbody tr:first-child td')?.textContent).toBe('');
    expect(doc.querySelector('tbody tr:nth-child(2) td:last-child')?.textContent).toBe('');
    const orphan = render('| A | B |\n|---|---|\n| ^^ | x |');
    expect(orphan.doc.querySelector('tbody td')?.textContent).toBe('^^');
  });

  it('combines row and column spans without overlapping neighboring content', () => {
    const { doc } = render('| A | B | C |\n|---|---|---|\n| wide || third |\n| ^^ | ^^ | next |\n| ^^ | conflict | final |');
    const wide = doc.querySelector('tbody td')!;
    expect(wide.getAttribute('colspan')).toBe('2');
    expect(wide.getAttribute('rowspan')).toBe('2');
    expect(doc.querySelector('tbody tr:nth-child(2)')?.textContent?.trim()).toBe('next');
    expect(Array.from(doc.querySelectorAll('tbody tr:last-child td'), node => node.textContent)).toEqual(['^^', 'conflict', 'final']);
  });

  it('keeps caption IDs unique against explicit and subsequently generated heading IDs', async () => {
    const source = '[TOC]\n\n[自动标题冲突][same]\n| A | B |\n|---|---|\n| x | y |\n\n# Same\n\n[显式标题冲突][custom]\n| A | B |\n|---|---|\n| a | b |\n\n## 标题 {#custom}';
    const result = await parseMarkdownSyntax(source, undefined, {});
    const doc = document.createElement('div'); doc.innerHTML = result.html;
    const ids = Array.from(doc.querySelectorAll('[id]'), node => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Array.from(doc.querySelectorAll('h1,h2'), node => node.id)).toEqual(['same', 'custom']);
    expect(Array.from(doc.querySelectorAll('caption'), node => node.id)).toEqual(['same-2', 'custom-2']);
    expect(Array.from(doc.querySelectorAll('.table-of-contents a'), node => node.getAttribute('href'))).toEqual(['#same', '#custom']);
  });

  it('reserves final IDs from later core rules and handles many duplicate captions', () => {
    const md = new MarkdownIt().use(tableExtensions);
    md.core.ruler.push('late_heading_ids', state => {
      const heading = state.tokens.find(token => token.type === 'heading_open');
      heading?.attrSet('id', 'caption-2');
    });
    const table = '[说明][caption]\n| A | B |\n|---|---|\n| x | y |';
    const tokens = md.parse('# Reserved\n\n' + Array(200).fill(table).join('\n\n'), {});
    const captions = tokens.filter(token => token.type === 'caption_open').map(token => token.attrGet('id'));
    expect(captions.slice(0, 3)).toEqual(['caption', 'caption-3', 'caption-4']);
    expect(captions.at(-1)).toBe('caption-201');
    expect(new Set(captions).size).toBe(200);
  });

  it('falls back to native tables before excessive cumulative multiline padding', () => {
    const source = '| A | B | C | D |\n|---|---|---|---|\n'
      + Array(1100).fill('| first | a | b | c |\\\n| second | d | e | f |').join('\n');
    const md = new MarkdownIt().use(tableExtensions);
    const tokens = md.parse(source, {});
    expect(tokens.find(token => token.type === 'table_open')?.meta?.md2pdfExtendedTable).toBeUndefined();
    expect(tokens.filter(token => token.type === 'tr_open')).toHaveLength(2201);
    expect(md.render(source)).toBe(new MarkdownIt().render(source));
  });

  it('cleans hostile raw HTML in captions through the production document renderer', async () => {
    const result = await renderMarkdownToHtml('[<img src="x" onerror="alert(1)"><a href="javascript:alert(1)">说明</a><svg onload="alert(1)"></svg>][bad" onclick="x]\n| A | B |\n|---|---|\n| x | y |', undefined, {});
    const doc = document.createElement('div'); doc.innerHTML = result.html;
    expect(doc.querySelector('caption')).not.toBeNull();
    expect(doc.querySelector('caption')?.id).toBe('');
    expect(doc.querySelector('[onerror],[onload],[onclick],a[href^="javascript:"]')).toBeNull();
    expect(doc.querySelector('caption')?.textContent).toContain('说明');
  });
});
