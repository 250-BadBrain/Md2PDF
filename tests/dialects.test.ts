import {expect,it} from 'vitest';
import {renderMarkdownToHtml} from '../src/markdown';
it('dialects isolate extensions and standard modes retain standard soft breaks',async()=>{
  const source='a\nb\n\n~~strike~~ ==mark== $x$\n\n| A |\n|---|\n| B |\n\n- [x] task\n\n```mermaid\nflowchart LR\nA --> B\n```';
  const commonmark=await renderMarkdownToHtml(source,undefined,{}, {dialect:'commonmark',softBreaks:'newline'});
  expect(commonmark.html).not.toContain('<table');expect(commonmark.html).not.toContain('<s>');expect(commonmark.html).not.toContain('<br');expect(commonmark.html).not.toContain('katex');expect(commonmark.html).not.toContain('mermaid-diagram');
  const gfm=await renderMarkdownToHtml(source,undefined,{}, {dialect:'gfm'});
  expect(gfm.html).toContain('<table');expect(gfm.html).toContain('<s>');expect(gfm.html).toContain('checkbox');expect(gfm.html).not.toContain('<mark>');expect(gfm.html).not.toContain('katex');
  const document=await renderMarkdownToHtml('==mark== $x$',undefined,{}, {dialect:'document'});
  expect(document.html).toContain('<mark>');expect(document.html).toContain('katex');
});
it('Obsidian wiki links resolve local headings and blocks, preserve code and escape labels',async()=>{
  const source='# 中文标题\n\nParagraph ^block\n\n[[#中文标题|<unsafe>]] [[#^block|Block]] [[Other#Heading]] `[[#code]]`\n\n![[image.svg|Picture]]';
  const document=await renderMarkdownToHtml(source,'Notes.md',{'image.svg':'blob:test'},{dialect:'obsidian'});
  expect(document.html).toContain('href="#%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98"');expect(document.html).toContain('&lt;unsafe&gt;');
  expect(document.html).toContain('href="#block-block"');expect(document.html).toContain('引用目标未找到：Other#Heading');expect(document.html).toContain('<code>[[#code]]</code>');expect(document.html).toContain('src="blob:test"');
  const plain=await renderMarkdownToHtml('[[#Heading]]',undefined,{}, {dialect:'document'});expect(plain.html).not.toContain('wiki-link');
});
