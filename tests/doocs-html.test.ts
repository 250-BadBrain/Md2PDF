import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import { describe, expect, it } from 'vitest';
import { enhanceDoocsHtml, preserveImageDimensions } from '../src/doocs-html';
import type { DocumentMeta } from '../src/markdown';
import katex from 'katex';

function rendered(source: string, breaks = true, dialect: DocumentMeta['dialect'] = 'document') {
  const container = document.createElement('div');
  container.innerHTML = DOMPurify.sanitize(new MarkdownIt({ html: true, breaks }).render(source));
  enhanceDoocsHtml(container, dialect);
  return container;
}

describe('Doocs HTML presentation compatibility', () => {
  it('uses only the first line as the custom alert title with hard-break rendering', () => {
    const container = rendered('> [!IMPORTANT] 上线前必读\n> 正文 **保留格式**和[链接](https://example.com)。\n>\n> 后续段落');
    const block = container.querySelector('.md-alert-important')!;
    expect(block.querySelector(':scope > strong')?.textContent).toBe('上线前必读');
    expect(block.querySelector('p')?.textContent).toBe('正文 保留格式和链接。');
    expect(block.querySelector('p strong')?.textContent).toBe('保留格式');
    expect(block.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(block.querySelectorAll('p')).toHaveLength(2);
  });

  it('handles soft-break text newlines without swallowing the paragraph body', () => {
    const container = rendered('> [!TIP] 自定义提示\n> First **body**\n> Second line', false);
    const block = container.querySelector('.md-alert-tip')!;
    expect(block.querySelector(':scope > strong')?.textContent).toBe('自定义提示');
    expect(block.querySelector('p')?.textContent).toBe('First body\nSecond line');
    expect(block.querySelector('p strong')?.textContent).toBe('body');
  });

  it('preserves the five existing default labels and media body content', () => {
    const source = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']
      .map(type => `> [!${type}]\n> Body`).join('\n\n');
    const container = rendered(source);
    expect(Array.from(container.querySelectorAll('.md-alert > strong'), title => title.textContent)).toEqual(['Note', 'Tip', 'Important', 'Warning', 'Danger']);
    expect(Array.from(container.querySelectorAll('.md-alert p'), body => body.textContent)).toEqual(Array(5).fill('Body'));
    const media = rendered('> [!NOTE]\n> ![image](https://example.com/a.png)');
    expect(media.querySelector('.md-alert p img')).not.toBeNull();
  });

  it('supports generic letter types and escapes custom title content safely', () => {
    const container = rendered('> [!THEOREM] **安全标题** &lt;img src=x onerror=alert(1)&gt;\n> Body\n\n> ordinary blockquote\n\n> `[!TIP]` code');
    const block = container.querySelector('.md-alert-theorem')!;
    expect(block.querySelector(':scope > strong')?.textContent).toBe('安全标题 <img src=x onerror=alert(1)>');
    expect(block.querySelector('img,[onerror]')).toBeNull();
    expect(container.querySelectorAll('.md-alert')).toHaveLength(1);
    expect(container.querySelectorAll('blockquote')).toHaveLength(3);
  });

  it('can enhance nested alerts once without duplicating labels', () => {
    const container = rendered('> [!NOTE] Outer\n> Body\n>\n> > [!TIP] Inner\n> > Nested body');
    enhanceDoocsHtml(container);
    expect(container.querySelectorAll('.md-alert > strong')).toHaveLength(2);
    expect(container.querySelector('.md-alert-tip p')?.textContent).toBe('Nested body');
  });

  it('uses native details with the requested default open state and a safe summary', () => {
    const container = rendered('> [!note]- **默认收起** &lt;img src=x onerror=bad()&gt;\n> 第一段 **加粗**。\n>\n> 第二段\n\n> [!TIP]+ 默认展开\n> 已展开正文', true, 'obsidian');
    const folded = container.querySelector<HTMLDetailsElement>('details.md-alert-note')!;
    const opened = container.querySelector<HTMLDetailsElement>('details.md-alert-tip')!;
    expect(folded.open).toBe(false);
    expect(folded.dataset.calloutFold).toBe('closed');
    expect(folded.querySelector(':scope > summary')?.textContent).toBe('默认收起 <img src=x onerror=bad()>');
    expect(folded.querySelector('summary')?.children).toHaveLength(0);
    expect(folded.querySelector('img,[onerror]')).toBeNull();
    expect(folded.querySelectorAll(':scope > .md-alert-body > p')).toHaveLength(2);
    expect(folded.querySelector('.md-alert-body strong')?.textContent).toBe('加粗');
    expect(opened.open).toBe(true);
    expect(opened.dataset.calloutFold).toBe('open');
    expect(opened.querySelector(':scope > summary')?.textContent).toBe('默认展开');
  });

  it('preserves original formula nodes, source ranges and nested callout content', () => {
    const container = rendered('> [!note]- Outer\n> Body **Markdown**\n>\n> > [!warning]+ Inner\n> > Nested body\n>\n> ```js\n> console.log(1)\n> ```', true, 'obsidian');
    const outer = container.querySelector<HTMLDetailsElement>('details.md-alert-note')!;
    const inner = outer.querySelector<HTMLDetailsElement>('details.md-alert-warning')!;
    expect(outer.open).toBe(false);
    expect(inner.open).toBe(true);
    expect(inner.querySelector('.md-alert-body')?.textContent).toContain('Nested body');
    expect(outer.querySelector('pre code')?.textContent).toBe('console.log(1)\n');
    const mapped = document.createElement('div');
    mapped.innerHTML = DOMPurify.sanitize(`<blockquote class="original" data-source-line="11" data-source-end="18" id="note-anchor"><p>[!note]- Formula<br/>${katex.renderToString('x^2 + y^2', { displayMode: true })}</p></blockquote>`);
    const formula = mapped.querySelector('.katex')!;
    enhanceDoocsHtml(mapped, 'obsidian');
    const details = mapped.querySelector('details')!;
    expect(details.classList.contains('original')).toBe(true);
    expect(details.getAttribute('data-source-line')).toBe('11');
    expect(details.getAttribute('data-source-end')).toBe('18');
    expect(details.id).toBe('note-anchor');
    expect(details.querySelector('.md-alert-body .katex')).toBe(formula);
    expect(details.querySelector('summary')?.textContent).toBe('Formula');
    enhanceDoocsHtml(container, 'obsidian');
    expect(container.querySelectorAll('details.md-alert-foldable')).toHaveLength(2);
    expect(container.querySelectorAll('summary')).toHaveLength(2);
  });

  it('supports title-only folds in extension modes without reinterpreting spaced markers or strict modes', () => {
    const container = rendered('> [!note]-\n\n> [!tip]+ Title only\n\n> [!warning] - Ordinary title');
    expect(container.querySelector<HTMLDetailsElement>('details.md-alert-note')?.open).toBe(false);
    expect(container.querySelector('details.md-alert-note > summary')?.textContent).toBe('Note');
    expect(container.querySelector('details.md-alert-note > .md-alert-body')?.children).toHaveLength(0);
    expect(container.querySelector<HTMLDetailsElement>('details.md-alert-tip')?.open).toBe(true);
    expect(container.querySelector('blockquote.md-alert-warning > strong')?.textContent).toBe('- Ordinary title');
    expect(rendered('> # Heading\n>\n> [!note]- Body marker', true, 'obsidian').querySelector('.md-alert')).toBeNull();
    for (const dialect of ['commonmark', 'gfm'] as const) {
      const strict = rendered('> [!note]- Literal text\n> Body', true, dialect);
      expect(strict.querySelector('.md-alert,details')).toBeNull();
      expect(strict.textContent).toContain('[!note]- Literal text');
    }
  });

  it('restores only bounded image dimensions after unrelated inline styles are removed', () => {
    const container = document.createElement('div');
    container.innerHTML = '<center><img style="width:100px;height:20mm;position:fixed;color:red" src="data:image/png;base64,AA=="></center><div style="width:100px">Text</div>';
    for (const element of container.querySelectorAll<HTMLElement>('[style]')) {
      if (element.tagName === 'IMG') preserveImageDimensions(element);
      else element.removeAttribute('style');
    }
    enhanceDoocsHtml(container);
    const image = container.querySelector('img')!;
    expect(image.style.width).toBe('100px');
    expect(image.style.height).toBe('20mm');
    expect(Array.from(image.style)).toEqual(['width', 'height']);
    expect(image.hasAttribute('data-md-image-width')).toBe(false);
    expect(image.hasAttribute('data-md-image-height')).toBe(false);
    expect(container.querySelector('center')?.classList.contains('md-center')).toBe(true);
    expect(container.querySelector('div')?.hasAttribute('style')).toBe(false);
  });

  it('accepts percentages and centimetres while rejecting excessive or executable dimensions', () => {
    const container = document.createElement('div');
    container.innerHTML = '<img style="width:50%;height:2.5cm"><img style="width:99999px;height:-1px"><img data-md-image-width="url(https://example.com)" data-md-image-height="calc(1px + 1px)"><img style="width:101%;height:0px"><img style="width:1001mm;height:101cm">';
    for (const image of container.querySelectorAll('img')) {
      preserveImageDimensions(image);
    }
    enhanceDoocsHtml(container);
    const images = container.querySelectorAll('img');
    expect(images[0].style.width).toBe('50%');
    expect(images[0].style.height).toBe('2.5cm');
    for (const image of Array.from(images).slice(1)) expect(image.style.length).toBe(0);
  });
});
