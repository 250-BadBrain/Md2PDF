export type ExportScope = { mode: 'all' | 'current' | 'chapter' | 'range'; range: string; chapter: string };
export type PageChapter = { id: string; title: string; level: number; start: number; end: number };

/** Convert 1-based inclusive ranges into ordered, unique page indices. */
export function parsePageRange(value: string, total: number): number[] {
  if (!Number.isInteger(total) || total < 1) throw new Error('文档还没有可导出的页面。');
  if (!value.trim()) throw new Error('请输入页码，例如 1-3,5,8-10。');
  const selected = new Set<number>();
  for (const part of value.split(/[,，]/)) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('页码格式无效，请使用 1-3,5,8-10 这样的格式。');
    const first = Number(match[1]), last = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last > total || first > total) {
      throw new Error(`页码必须在 1-${total} 之间。`);
    }
    if (first > last) throw new Error('起始页不能大于结束页。');
    for (let page = first; page <= last; page++) selected.add(page - 1);
  }
  return [...selected].sort((a, b) => a - b);
}

export function pageChapters(pages: string[], chapterLevel = 2): PageChapter[] {
  const headings: (Omit<PageChapter, 'end'> & { startsPage: boolean })[] = [];
  const seen = new Set<string>();
  pages.forEach((html, start) => {
    const template = document.createElement('template'); template.innerHTML = html;
    for (const heading of template.content.querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')) {
      if (seen.has(heading.id) || heading.closest('.document-cover,nav.table-of-contents,.table-of-contents')) continue;
      seen.add(heading.id);
      const label = heading.cloneNode(true) as HTMLElement;
      label.querySelectorAll('.header-anchor,rt,.katex-html').forEach(element => element.remove());
      const title = label.textContent?.replace(/\s+/g, ' ').trim();
      if (!title) continue;
      const content = heading.closest('.pdf-content') ?? template.content;
      const prefix = document.createRange(); prefix.selectNodeContents(content); prefix.setEndBefore(heading);
      const before = prefix.cloneContents();
      before.querySelectorAll('.md-alert-title,summary,.container-title').forEach(element => element.remove());
      const startsPage = !before.textContent?.trim() && !before.querySelector('img,svg,table,pre');
      headings.push({ id: heading.id, title, level: Number(heading.tagName.slice(1)), start, startsPage });
    }
  });
  const limit = Math.max(1, Math.min(6, chapterLevel));
  const minimum = Math.min(...headings.map(heading => heading.level));
  return headings.filter(heading => heading.level <= Math.max(limit, minimum)).map(heading => {
    const index = headings.indexOf(heading);
    const next = headings.slice(index + 1).find(candidate => candidate.level <= heading.level);
    // A chapter can end partway through a page shared with the following one.
    const end = next ? Math.max(heading.start, next.start - (next.startsPage ? 1 : 0)) : pages.length - 1;
    return { id: heading.id, title: heading.title, level: heading.level, start: heading.start, end };
  });
}

export function selectPageIndices(scope: ExportScope, total: number, currentPage: number, chapters: PageChapter[]): number[] {
  if (total < 1) return [];
  if (scope.mode === 'range') return parsePageRange(scope.range, total);
  if (scope.mode === 'current') return [Math.max(0, Math.min(total - 1, currentPage - 1))];
  if (scope.mode === 'chapter') {
    const chapter = chapters.find(item => item.id === scope.chapter);
    if (!chapter) throw new Error('请选择要导出的章节。');
    return Array.from({ length: chapter.end - chapter.start + 1 }, (_, index) => chapter.start + index);
  }
  return Array.from({ length: total }, (_, index) => index);
}
