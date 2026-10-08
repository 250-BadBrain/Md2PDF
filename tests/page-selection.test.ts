import { describe, expect, it } from 'vitest';
import { pageChapters, parsePageRange, selectPageIndices } from '../src/page-selection';

describe('export page selection', () => {
  it('sorts and deduplicates inclusive ranges without expanding past document bounds', () => {
    expect(parsePageRange('8-10, 1-3，5,2-5', 10)).toEqual([0,1,2,3,4,7,8,9]);
    expect(parsePageRange('01 - 02', 2)).toEqual([0,1]);
    for (const value of ['', '0', '4', '2-1', '1-', '-2', '1,,2', '1.5', '1e2', '1-9999999999999999999']) {
      expect(() => parsePageRange(value, 3), value).toThrow();
    }
  });
  it('finds chapter boundaries with shared pages and excludes repeated/cover headings', () => {
    const pages = [
      '<section class="document-cover"><h1 id="cover">Cover</h1></section>',
      '<div class="pdf-content"><h1 id="book">Book</h1><h2 id="one">First<a class="header-anchor">#</a></h2><p>Content</p></div>',
      '<div class="pdf-content"><p>First continuation</p><h2 id="two">Second</h2><p>Second content</p></div>',
      '<div class="pdf-content"><h2 id="two">Repeated</h2><h3 id="child">Child</h3><p>More</p></div>',
      '<div class="pdf-content"><h1 id="end">End</h1></div>',
    ];
    const chapters = pageChapters(pages);
    expect(chapters).toEqual([
      { id:'book',title:'Book',level:1,start:1,end:3 },
      { id:'one',title:'First',level:2,start:1,end:2 },
      { id:'two',title:'Second',level:2,start:2,end:3 },
      { id:'end',title:'End',level:1,start:4,end:4 },
    ]);
    expect(selectPageIndices({mode:'chapter',chapter:'two',range:''},5,1,chapters)).toEqual([2,3]);
    expect(selectPageIndices({mode:'current',chapter:'',range:''},5,9,chapters)).toEqual([4]);
    expect(() => selectPageIndices({mode:'chapter',chapter:'missing',range:''},5,1,chapters)).toThrow('请选择');
  });
  it('uses the shallowest heading level for documents that start at h3', () => {
    expect(pageChapters(['<h3 id="part">部分</h3><h4 id="section">小节</h4>']).map(chapter => chapter.id)).toEqual(['part']);
  });
});
