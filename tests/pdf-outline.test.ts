import { describe, expect, it } from 'vitest';
import { collectPdfHeadings, pdfHeadingTree } from '../src/pdf-outline';

describe('Exported PDF heading outlines', () => {
  it('uses selected page order and avoids generated covers, TOCs and repeated fragments', () => {
    const pages=[
      '<div class="pdf-content"><section class="document-cover"><h1>Cover</h1></section><nav class="table-of-contents"><h2>TOC</h2></nav><h2 id="child" data-source-line="20">中文 <em>标题</em>😀<a class="header-anchor">#</a></h2><h4 id="deep">Deep</h4></div>',
      '<div class="pdf-content"><h2 id="child" data-source-line="20">continued</h2><h1 id="next">Next</h1><h3 id="repeated" data-source-line="90">Same</h3><h3 id="repeated-2" data-source-line="95">Same</h3></div>',
    ];
    const headings=collectPdfHeadings(pages);
    expect(headings.map(h=>[h.title,h.pageNumber])).toEqual([['中文 标题😀',1],['Deep',1],['Next',2],['Same',2],['Same',2]]);
    const tree=pdfHeadingTree(headings);
    expect(tree.map(h=>h.title)).toEqual(['中文 标题😀','Next']);
    expect(tree[0].children.map(h=>h.title)).toEqual(['Deep']);
    expect(tree[1].children.map(h=>h.title)).toEqual(['Same','Same']);
  });

  it('deduplicates ID-less split fragments by their original source line', () => {
    const headings=collectPdfHeadings(['<h3 data-source-line="8">Heading</h3>','<h3 data-source-line="8">fragment</h3><h3 data-source-line="10">Heading</h3>']);
    expect(headings.map(h=>h.title)).toEqual(['Heading','Heading']);
  });

  it('retains the original ancestor chain when non-contiguous chapters are selected', () => {
    const original=[
      '<h1 id="a">Chapter A</h1><h2 id="a-child">Child A</h2>',
      '<h1 id="b">Chapter B</h1><h2 id="b-child">Child B</h2>',
      '<h3 id="b-deep">Grandchild B</h3>',
      '<h1 id="c">Chapter C</h1>',
      '<h2 id="c-child">Child C</h2><h4 id="c-deep">Grandchild C</h4>',
    ];
    const selected=[original[0],original[2],original[4]];
    const headings=collectPdfHeadings(selected,original);
    const roots=pdfHeadingTree(headings,collectPdfHeadings(original));
    expect(roots.map(h=>h.title)).toEqual(['Chapter A','Grandchild B','Child C']);
    expect(roots[0].children.map(h=>h.title)).toEqual(['Child A']);
    expect(roots[1].children).toHaveLength(0);
    expect(roots[2].children.map(h=>h.title)).toEqual(['Grandchild C']);
    expect(roots.map(h=>h.pageNumber)).toEqual([1,2,3]);
  });

  it('matches retained continuation fragments whose IDs were removed during pagination', () => {
    const original=['<h1 id="root" data-source-line="2">Root</h1><h2 id="child" data-source-line="4">Child</h2>',
      '<h2 data-source-line="4">continued Child</h2><h3 data-source-line="5">Deep</h3>'];
    const selected=collectPdfHeadings([original[1]],original);
    const roots=pdfHeadingTree(selected,collectPdfHeadings(original));
    expect(roots.map(heading=>heading.title)).toEqual(['continued Child']);
    expect(roots[0].children.map(heading=>heading.title)).toEqual(['Deep']);
  });

  it('uses explicit original page indices for identical pages with anonymous headings', () => {
    const original=['<h1 id="a">Chapter A</h1>','<h2>Section</h2>',
      '<h1 id="b">Chapter B</h1>','<h2>Section</h2>'];
    const selected=collectPdfHeadings([original[0],original[3]],original,[0,3]);
    const roots=pdfHeadingTree(selected,collectPdfHeadings(original));
    expect(selected[1].key).toBe('anonymous:3:0');
    expect(roots.map(heading=>heading.title)).toEqual(['Chapter A','Section']);
    expect(roots[0].children).toHaveLength(0);
    expect(roots.map(heading=>heading.pageNumber)).toEqual([1,2]);
  });

  it('keeps titles readable without Ruby readings, image anchors or duplicate KaTeX MathML', () => {
    const headings=collectPdfHeadings(['<h1 id="a"><ruby>汉字<rp>(</rp><rt>hàn zì</rt><rp>)</rp></ruby> <img alt="图片"><span class="katex"><span class="katex-mathml"><math>x squared</math></span><span class="katex-html">x²</span></span><a class="header-anchor">#</a></h1>']);
    expect(headings[0].title).toBe('汉字 图片x²');
  });
});
