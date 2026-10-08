import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { parseFrontMatter } from '../src/markdown-parser';
import { readDocumentProperties, updateDocumentProperties } from '../src/document-properties';

describe('Document properties in Markdown front matter', () => {
  it('reads subjects and keyword lists for PDF metadata', () => {
    const source = '---\ntitle: 中文😀\nauthor: 读者\nsubject: 导出说明\nkeywords:\n  - 公式\n  - Markdown\n---\n# 正文';
    expect(parseFrontMatter(source).meta).toMatchObject({title:'中文😀',author:'读者',subject:'导出说明',keywords:'公式, Markdown'});
    expect(readDocumentProperties(source)).toMatchObject({values:{title:'中文😀',author:'读者',subject:'导出说明',keywords:'公式\nMarkdown'}});
  });

  it('edits only properties while retaining settings, comments, aliases and CRLF body bytes', () => {
    const source = '\uFEFF---\r\n# layout comment\r\npaper: A5 # keep paper\r\nextra: &custom\r\n  value: 7\r\ncopy: *custom\r\ntitle: Old # title comment\r\nkeywords: [old, words]\r\n...\r\n正文\r\n\r\n```yaml\r\ntitle: literal\r\n```\r\n';
    const next = updateDocumentProperties(source, {title:'新标题: 😀',author:'作者',subject:'主题',keywords:'公式\n文档'});
    expect(next.startsWith('\uFEFF---\r\n')).toBe(true);
    expect(next.slice(next.indexOf('...\r\n')+5)).toBe(source.slice(source.indexOf('...\r\n')+5));
    expect(next).toContain('# layout comment'); expect(next).toContain('# keep paper'); expect(next).toContain('# title comment');
    expect(next).toContain('&custom'); expect(next).toContain('*custom');
    expect(parseFrontMatter(next).meta).toMatchObject({title:'新标题: 😀',author:'作者',subject:'主题',keywords:'公式, 文档',paper:'A5'});
    expect(next.replace(/\r\n/g,'')).not.toContain('\n');
  });

  it('adds safe scalar properties to ordinary Markdown without changing the body', () => {
    const source = '# 正文\n\n---\n\n末尾';
    const next = updateDocumentProperties(source, {title:'---\nsubject: injected',author:'',subject:'normal',keywords:'PDF, 文档'});
    expect(parseFrontMatter(next).body).toBe(source);
    expect(parseFrontMatter(next).meta).toMatchObject({title:'---\nsubject: injected',subject:'normal',keywords:'PDF, 文档'});
    expect(readDocumentProperties(next).values.author).toBe('');
  });

  it('does not rewrite the source when values have not changed', () => {
    const source='---\n# comment\ntitle: \'Name\'\nkeywords: [one, two]\n---\nBody';
    expect(updateDocumentProperties(source,readDocumentProperties(source).values)).toBe(source);
    expect(updateDocumentProperties('# Body',{title:'',author:'',subject:'',keywords:''})).toBe('# Body');
  });

  it('rejects malformed or non-mapping front matter without consuming Markdown', () => {
    for(const source of ['---\ntitle: [bad\n---\nBody','---\ntitle: no closing\nBody','---\n- list\n---\nBody','---\ntitle: one\ntitle: duplicate\n---\nBody']) {
      expect(readDocumentProperties(source).error).toBeTruthy();
      expect(()=>updateDocumentProperties(source,{title:'New',author:'',subject:'',keywords:''})).toThrow(/YAML/);
    }
  });

  it('removes cleared fields while keeping unrelated front matter', () => {
    const next=updateDocumentProperties('---\npaper: Letter\ntitle: Old\nauthor: Old\nsubject: Old\nkeywords: Old\n---\nBody',{title:'',author:'',subject:'',keywords:''});
    expect(parseFrontMatter(next).meta).toMatchObject({paper:'Letter'});
    expect(next).not.toMatch(/(?:title|author|subject|keywords):/);
    expect(parseFrontMatter(next).body).toBe('Body');
  });

  it('edits an anchored property without changing alias-derived properties or layout settings', () => {
    const source='---\ntitle: &name Old\nauthor: *name # keep author\nheader: *name\nkeywords: &words [old, PDF]\ncustomWords: *words\n---\nBody';
    const next=updateDocumentProperties(source,{...readDocumentProperties(source).values,title:'New',keywords:'new\nPDF'});
    expect(parseFrontMatter(next).meta).toMatchObject({title:'New',author:'Old',header:'Old',keywords:'new, PDF'});
    expect(next).toContain('# keep author');expect(parseYaml(next.split('---\n')[1]).customWords).toEqual(['old','PDF']);
  });

  it('supports empty front matter with comments while retaining its body', () => {
    const source='---\n# empty properties\n---\nBody';
    const next=updateDocumentProperties(source,{title:'New',author:'',subject:'',keywords:''});
    expect(next).toContain('# empty properties');expect(parseFrontMatter(next).meta.title).toBe('New');
    expect(parseFrontMatter(next).body).toBe('Body');
  });

  it('clears properties with anchored keys without breaking unrelated aliases', () => {
    const source='---\n&field title: Old\nheader: *field # preserve header\ncustom: *field\n---\nBody\n';
    const next=updateDocumentProperties(source,{title:'',author:'',subject:'',keywords:''});
    expect(readDocumentProperties(next).error).toBeUndefined();
    expect(parseFrontMatter(next).meta).toMatchObject({header:'title'});
    expect(parseYaml(next.split('---\n')[1]).custom).toBe('title');
    expect(next).toContain('# preserve header');
    expect(next.endsWith('Body\n')).toBe(true);
    expect(readDocumentProperties(next).values.title).toBe('');
  });
});
