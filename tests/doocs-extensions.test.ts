import MarkdownIt from 'markdown-it';
import attrs from 'markdown-it-attrs';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import { describe, expect, it } from 'vitest';
import { doocsExtensions } from '../src/doocs-extensions';

const parser = () => new MarkdownIt({ html: true, breaks: true })
  .use(attrs, { allowedAttributes: ['id', 'class', 'width', 'height'] })
  .use(sub).use(sup).use(doocsExtensions);
const render = (source: string) => {
  const element = document.createElement('div');
  element.innerHTML = parser().render(source);
  return element;
};
const annotations = (element: Element) => Array.from(element.querySelectorAll('ruby'), (ruby) => [
  ruby.firstChild?.textContent, ruby.querySelector('rt')?.textContent,
]);

describe('Doocs compatible document extensions', () => {
  it('renders both Ruby notations before attributes can swallow annotations', () => {
    const element = render('[你好]{nǐ hǎo} [世界]{shì jiè}\n\n[小夜時雨]^(さ・よ・しぐれ)');
    expect(annotations(element)).toEqual([['你好', 'nǐ hǎo'], ['世界', 'shì jiè'], ['小', 'さ'], ['夜', 'よ'], ['時雨', 'しぐれ']]);
    expect(element.querySelector('sup')).toBeNull();
    expect(element.querySelectorAll('rp')).toHaveLength(10);
  });

  it('matches Doocs separator grouping and mismatched readings using Unicode characters', () => {
    const element = render('[你好世界]{nǐ・hǎo・shì・jiè}\n\n[小夜時雨]{さ．よ}\n\n[小夜]{さ。よ。しぐれ}\n\n[小夜時雨]{さ-よ-しぐれ-extra}\n\n[𠮷野]{よし・の}');
    expect(annotations(element)).toEqual([
      ['你', 'nǐ'], ['好', 'hǎo'], ['世', 'shì'], ['界', 'jiè'],
      ['小', 'さ'], ['夜時雨', 'よ'], ['小', 'さ'], ['夜', 'よ'],
      ['小', 'さ'], ['夜', 'よ'], ['時', 'しぐれ'], ['雨', 'extra'],
      ['𠮷', 'よし'], ['野', 'の'],
    ]);
  });

  it('preserves links, image attributes, escapes, code literals and attribute notation', () => {
    const source = '[普通文字]{#anchor}\n\n[访问](https://example.com){.link}\n\n![图片](image.png){width=100 height=50}\n\n`[你好]{nǐ hǎo}`\n\n\\[你好]{注音}\n\n```md\n[你好]{nǐ hǎo}\n::: theorem\n~波浪线~\n```';
    const element = render(source);
    expect(element.querySelector('ruby')).toBeNull();
    expect(element.querySelector('#anchor')?.textContent).toBe('[普通文字]');
    expect(element.querySelector('a.link')?.getAttribute('href')).toBe('https://example.com');
    expect(element.querySelector('img')?.getAttribute('width')).toBe('100');
    expect(element.querySelector('img')?.getAttribute('height')).toBe('50');
    expect(element.querySelector('pre code')?.textContent).toBe('[你好]{nǐ hǎo}\n::: theorem\n~波浪线~\n');
  });

  it('escapes untrusted Ruby text and readings instead of inserting HTML', () => {
    const element = render('[<img src=x onerror=alert(1)>]{<b>注音</b>}');
    expect(element.querySelector('img,b,[onerror]')).toBeNull();
    expect(annotations(element)).toEqual([['<img src=x onerror=alert(1)>', '<b>注音</b>']]);
  });

  it('renders academic and arbitrary containers with their existing style structure and source maps', () => {
    const markdown = parser();
    const source = '::: theorem 勾股定理\n**正文**\n:::\n\n::: definition\nDefinition\n:::\n\n::: proof\nProof\n:::\n\n::: 推论\n中文正文\n:::';
    const element = document.createElement('div'); element.innerHTML = markdown.render(source);
    expect(Array.from(element.querySelectorAll('.md-container > strong'), (title) => title.textContent)).toEqual(['勾股定理', 'Definition', 'Proof', '推论']);
    expect(element.querySelector('.md-container-theorem p strong')?.textContent).toBe('正文');
    expect(element.querySelectorAll('.md-container')).toHaveLength(4);
    expect(markdown.parse(source, {}).filter(token => token.type === 'doocs_container_open').map(token => token.map)).toEqual([[0, 3], [4, 7], [8, 11], [12, 15]]);
  });

  it('balances nested containers and ignores container markers inside fenced code', () => {
    const element = render('::: note Outer\nBefore\n\n::: tip Inner\nInside\n:::\n\n```text\n::: danger Literal\n::: \n```\n\nAfter\n:::');
    expect(element.querySelectorAll('.md-container')).toHaveLength(2);
    expect(element.querySelector('.md-container-note .md-container-tip')?.textContent).toContain('Inside');
    expect(element.querySelector('.md-container-note')?.lastElementChild?.textContent).toBe('After');
    expect(element.querySelector('pre code')?.textContent).toBe('::: danger Literal\n::: \n');
  });

  it('escapes container names and titles while preserving indented code', () => {
    const element = render('::: note <img src=x onerror=alert(1)>\nSafe\n:::\n\n::: 中文\nText\n:::\n\n    ::: theorem\n    Literal\n    :::');
    expect(element.querySelector('img,[onerror]')).toBeNull();
    expect(element.querySelector('.md-container > strong')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(element.querySelectorAll('.md-container')).toHaveLength(2);
    expect(element.querySelector('pre code')?.textContent).toContain('::: theorem');
  });

  it('keeps compact existing container markers and longer outer fences compatible', () => {
    const element = render('::::note Outer\n:::tip Inner\nNested\n:::\n\nAfter\n::::\n\n:::warning\nUnclosed but retained');
    expect(element.querySelectorAll('.md-container')).toHaveLength(3);
    expect(element.querySelector('.md-container-note .md-container-tip')?.textContent).toContain('Nested');
    expect(element.querySelector('.md-container-note')?.lastElementChild?.textContent).toBe('After');
    expect(element.querySelector('.md-container-warning')?.textContent).toContain('Unclosed but retained');
  });

  it('uses a wavy underline for CJK words and preserves existing ASCII subscript and strikethrough', () => {
    const element = render('~波浪线~ ~日本語~ H~2~O x^2^ ~~删除线~~ `~波浪线~`');
    expect(Array.from(element.querySelectorAll('.md-wavy'), (span) => span.textContent)).toEqual(['波浪线', '日本語']);
    expect(element.querySelector('sub')?.textContent).toBe('2');
    expect(element.querySelector('sup')?.textContent).toBe('2');
    expect(element.querySelector('s')?.textContent).toBe('删除线');
    expect(element.querySelector('code')?.textContent).toBe('~波浪线~');
  });
});
