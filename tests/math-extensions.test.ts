import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { doocsExtensions } from '../src/doocs-extensions';
import { markdownMathExtensions } from '../src/math-extensions';

function parser() {
  const render = (source: string, display: boolean) => `<span class="fake-math" data-display="${display}">${new MarkdownIt().utils.escapeHtml(source)}</span>`;
  return new MarkdownIt({ html: true, breaks: true }).use(doocsExtensions)
    .use(texmath, { delimiters: ['dollars', 'brackets', 'gitlab'], engine: { renderToString: (source: string) => render(source, true) } })
    .use(markdownMathExtensions, { render });
}
function render(source: string) {
  const markdown = parser();
  const container = document.createElement('div');
  container.innerHTML = markdown.render(source);
  return { markdown, container };
}
const formulas = (container: Element) => Array.from(container.querySelectorAll('.fake-math'), element => element.textContent);

describe('Scoped document display math blocks', () => {
  it('interrupts a paragraph for bracket and dollar blocks without an empty line', () => {
    const source = '正文\n\\[\nx^2 + y^2 = z^2\n\\]\nAfter\n$$\n\\frac{1}{2}\n$$\nTail';
    const { markdown, container } = render(source);
    expect(formulas(container)).toEqual(['\nx^2 + y^2 = z^2\n', '\n\\frac{1}{2}\n']);
    expect(Array.from(container.querySelectorAll('p'), paragraph => paragraph.textContent)).toEqual(['正文', 'After', 'Tail']);
    expect(markdown.parse(source, {}).filter(token => token.type === 'document_math_block').map(token => token.map)).toEqual([[1, 4], [5, 8]]);
  });

  it('keeps block-local content inside lists, quotes and document containers', () => {
    const source = '- Item\n  \\[\n  a+b\n  \\]\n- Next\n\n> Quoted\n> $$\n> c+d\n> $$\n\n::: theorem Theorem\nBody\n\\[\ne+f\n\\]\n:::\nOutside';
    const { container } = render(source);
    expect(formulas(container)).toEqual(['\na+b\n', '\nc+d\n', '\ne+f\n']);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('li .fake-math')).not.toBeNull();
    expect(container.querySelector('blockquote .fake-math')).not.toBeNull();
    expect(container.querySelector('.md-container .fake-math')).not.toBeNull();
    expect(container.lastElementChild?.textContent).toBe('Outside');
  });

  it.each(['equation', 'equation*', 'align', 'align*', 'alignat', 'alignat*', 'gather', 'gather*', 'CD'])('renders the independent %s environment with original TeX delimiters', environment => {
    const expression = `\\begin{${environment}}${environment.startsWith('alignat') ? '{2}' : ''}\nx &= y\n\\end{${environment}}`;
    const { container } = render('Intro\n' + expression + '\nAfter');
    expect(formulas(container)).toEqual([expression]);
    expect(container.querySelector('.fake-math')?.getAttribute('data-display')).toBe('true');
    expect(container.lastElementChild?.textContent).toBe('After');
  });

  it('preserves nested split and array environments and ignores closing commands in comments', () => {
    const expression = '\\begin{equation}\n\\begin{split}\nx &= \\begin{array}{cc} a & b \\\\ c & d \\end{array} \\\\\n% \\end{equation}\ny &= z\n\\end{split}\n\\end{equation}';
    const { container } = render(expression);
    expect(formulas(container)).toEqual([expression]);
  });

  it('renders supported environments and nested structures with the real KaTeX engine', () => {
    const expressions = [
      '\\begin{equation}x+y=z\\end{equation}',
      '\\begin{equation*}x+y=z\\end{equation*}',
      '\\begin{align}x&=y\\\\z&=w\\end{align}',
      '\\begin{align*}x&=y\\\\z&=w\\end{align*}',
      '\\begin{alignat}{2}x&=y&z&=w\\end{alignat}',
      '\\begin{alignat*}{2}x&=y&z&=w\\end{alignat*}',
      '\\begin{gather}x=y\\\\z=w\\end{gather}',
      '\\begin{gather*}x=y\\\\z=w\\end{gather*}',
      '\\begin{CD}A @>a>> B\\\\@VVbV @VVcV\\\\C @>d>> D\\end{CD}',
      '\\begin{equation}\\begin{split}x&=\\begin{array}{cc}a&b\\\\c&d\\end{array}\\\\y&=z\\end{split}\\end{equation}',
    ];
    for (const expression of expressions) {
      const markdown = new MarkdownIt().use(texmath, { delimiters: ['dollars', 'brackets', 'gitlab'] })
        .use(markdownMathExtensions, { render: (source: string, display: boolean) => katex.renderToString(source, { displayMode: display, throwOnError: true }) });
      const element = document.createElement('div'); element.innerHTML = markdown.render(expression);
      expect(element.querySelectorAll('.katex')).toHaveLength(1);
      expect(element.querySelector('.katex-mathml annotation')?.textContent).toBe(expression);
      expect(element.querySelector('.katex-html [style]')).not.toBeNull();
    }
  });

  it('preserves existing equation-number suffixes and single-line block expressions', () => {
    const { container } = render('$$x=y$$ (1)\n\\[a=b\\] (eq-A)');
    expect(formulas(container)).toEqual(['x=y', 'a=b']);
    expect(Array.from(container.querySelectorAll('.eqno > span:last-child'), element => element.textContent)).toEqual(['(1)', '(eq-A)']);
  });

  it('keeps trailing punctuation and prose after complete block formulas instead of literalizing or dropping them', () => {
    const source = '$$x^2$$。\n\\[x\\] 后文 **保留**\n$$x=y$$ (1) Caption\n$$\na+b\n$$ 多行后文\n\\begin{equation}x=y\\end{equation} Environment caption';
    const { markdown, container } = render(source);
    expect(formulas(container)).toEqual(['x^2', 'x', 'x=y', '\na+b\n', '\\begin{equation}x=y\\end{equation}']);
    expect(Array.from(container.querySelectorAll('p'), paragraph => paragraph.textContent)).toEqual(['。', '后文 保留', 'Caption', '多行后文', 'Environment caption']);
    expect(container.querySelector('p strong')?.textContent).toBe('保留');
    expect(container.querySelector('.eqno > span:last-child')?.textContent).toBe('(1)');
    expect(markdown.parse(source, {}).filter(token => token.type === 'paragraph_open').map(token => token.map)).toEqual([[0, 1], [1, 2], [2, 3], [5, 6], [6, 7]]);
  });

  it('preserves a later inline expression in the caption and adjacent list or container blocks', () => {
    const source = '$$x$$ caption $y$\n- Next\n\n\\[z\\] caption\n::: note\nBody\n:::';
    const { container } = render(source);
    expect(formulas(container)).toEqual(['x', 'y', 'z']);
    expect(container.querySelector('li')?.textContent).toBe('Next');
    expect(container.querySelector('.md-container')?.textContent).toContain('Body');
    expect(container.querySelectorAll('.math-block')).toHaveLength(2);
  });

  it.each(['$$', '\\['])('does not let an unclosed %s consume the following container, HTML or fenced code', delimiter => {
    const ending = delimiter === '$$' ? '$$' : '\\]';
    const source = `${delimiter}\nx\n::: note\nBody\n:::\n${ending}\n\n${delimiter}\ny\n<div>HTML</div>\n${ending}\n\n${delimiter}\nz\n\`\`\`text\ncode\n\`\`\`\n${ending}`;
    const { container } = render(source);
    expect(container.querySelector('.md-container')?.textContent).toContain('Body');
    expect(container.querySelector('div')?.textContent).toBe('HTML');
    expect(container.querySelector('pre code')?.textContent).toBe('code\n');
    expect(formulas(container)).toEqual([]);
  });

  it('does not match a closer outside a list item, quotation or container range', () => {
    const source = '- Item\n  $$\n  x\n- Next\n$$\n\n> \\[\n> y\n\n\\]\n\n::: note\n$$\nz\n:::\n$$';
    const { container } = render(source);
    expect(formulas(container)).toEqual([]);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('.md-container')?.textContent).toContain('z');
  });

  it('preserves unsupported, mismatched and unclosed environments as text without losing later blocks', () => {
    const source = '\\begin{matrix}\nx\n\\end{matrix}\n\n\\begin{equation}\n\\begin{split}\nx\n\\end{equation}\n\n# Heading\nTail';
    const { container } = render(source);
    expect(formulas(container)).toEqual([]);
    expect(container.querySelector('h1')?.textContent).toBe('Heading');
    expect(container.textContent).toContain('\\begin{matrix}');
    expect(container.textContent).toContain('\\begin{equation}');
    expect(container.textContent).toContain('Tail');
  });

  it('does not process code literals, HTML blocks, encoded delimiters or change inline currency rules', () => {
    const source = '`\\begin{equation}x\\end{equation}`\n\n```latex\n\\[\nx\n\\]\n```\n\n    \\begin{align}\n    x\n    \\end{align}\n\n<div>\n$$\nx\n$$\n</div>\n\n&#36;&#36;x&#36;&#36;\n\n$ a^2 $ and $5 and $10';
    const { container } = render(source);
    expect(formulas(container)).toEqual([]);
    expect(container.querySelectorAll('pre')).toHaveLength(2);
    expect(container.querySelector('div')?.textContent).toContain('$$');
    expect(container.textContent).toContain('$ a^2 $ and $5 and $10');
  });

  it('retains normal Markdown escapes and formatting on unmatched display opener lines', () => {
    const { container } = render('$$unclosed \\$5 **bold** `code`\n\n\\[unclosed \\$10 *emphasis*');
    expect(formulas(container)).toEqual([]);
    expect(container.textContent).toContain('$$unclosed $5 bold code');
    expect(container.textContent).toContain('[unclosed $10 emphasis');
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('emphasis');
    expect(container.querySelector('code')?.textContent).toBe('code');
  });

  it('does not interrupt ordinary paragraphs containing escaped Markdown brackets without a math closer', () => {
    const source = '\\*not emphasized*\n\\<br/> not a tag\n\\[not a link](/foo)\n\\`not code`\n1\\. not a list\n\\* not a list\n\\# not a heading\n\\[foo]: /url "not a reference"\n\\&ouml; not a character entity\n';
    const { container } = render(source);
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(formulas(container)).toEqual([]);
    expect(container.textContent).toContain('[not a link](/foo)');
    expect(container.textContent).toContain('[foo]: /url "not a reference"');
    expect(container.querySelector('a,code')).toBeNull();
  });

  it('handles many escaped bracket lines and code-only closers without crossing block boundaries', () => {
    const lines = '\\[not a link](/foo)\n'.repeat(4_000);
    const markdown = parser();
    const plain = markdown.parse(lines, {});
    expect(plain.filter(token => token.type === 'paragraph_open')).toHaveLength(1);
    const guarded = markdown.parse(lines + '\n```text\n\\]\n```\n\n\\[x\\]', {});
    expect(guarded.filter(token => token.type === 'fence')).toHaveLength(1);
    expect(guarded.filter(token => token.type === 'document_math_block').map(token => token.content)).toEqual(['x']);
  });
});
