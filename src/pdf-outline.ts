import type { jsPDF, OutlineItem } from 'jspdf';

export type PdfHeading = { key: string; id: string; level: number; title: string; pageNumber: number };
export type PdfHeadingNode = PdfHeading & { children: PdfHeadingNode[] };

function titleText(heading: HTMLElement) {
  const clone = heading.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.header-anchor,.toc-page-number,rp,rt,.katex-mathml,script,style').forEach(node => node.remove());
  clone.querySelectorAll('img').forEach(image => image.replaceWith(document.createTextNode(image.alt)));
  return clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

export function collectPdfHeadings(pages: string[], originalPages: string[] = pages, originalPageIndices?: number[]): PdfHeading[] {
  const headings: PdfHeading[] = [];
  const ids = new Set<string>(); const sourceLines = new Set<string>();
  let originalCursor = 0;
  for (const [index, html] of pages.entries()) {
    const explicitIndex = originalPageIndices?.[index];
    const originalIndex = explicitIndex !== undefined && Number.isInteger(explicitIndex) && explicitIndex >= 0 && explicitIndex < originalPages.length
      ? explicitIndex : originalPages.indexOf(html, originalCursor);
    if (originalIndex >= 0) originalCursor = originalIndex + 1;
    const sourcePage = originalIndex < 0 ? index : originalIndex;
    const wrapper = document.createElement('div'); wrapper.innerHTML = html;
    for (const [headingIndex, heading] of [...wrapper.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')].entries()) {
      if (heading.closest('.document-cover,.table-of-contents,.pdf-page-header,.pdf-page-footer,.pdf-page-notes,svg')) continue;
      const level = Number(heading.tagName.slice(1));
      const sourceLine = heading.dataset.sourceLine;
      const sourceKey = sourceLine ? `${level}:${sourceLine}` : '';
      if ((heading.id && ids.has(heading.id)) || (sourceKey && sourceLines.has(sourceKey))) continue;
      const title = titleText(heading);
      if (!title) continue;
      if (heading.id) ids.add(heading.id);
      if (sourceKey) sourceLines.add(sourceKey);
      headings.push({key: sourceKey ? `source:${sourceKey}` : heading.id ? `id:${heading.id}` : `anonymous:${sourcePage}:${headingIndex}`,
        id: heading.id, level, title, pageNumber: index + 1});
    }
  }
  return headings;
}

export function pdfHeadingTree(headings: PdfHeading[], originalHeadings: PdfHeading[] = headings): PdfHeadingNode[] {
  const parents = new Map<string, string | undefined>();
  const stack: PdfHeading[] = [];
  for (const heading of originalHeadings) {
    while (stack.length && stack[stack.length - 1].level >= heading.level) stack.pop();
    parents.set(heading.key, stack[stack.length - 1]?.key);
    stack.push(heading);
  }
  const nodes = new Map(headings.map(heading => [heading.key, {...heading, children: []} as PdfHeadingNode]));
  const roots: PdfHeadingNode[] = [];
  for (const heading of headings) {
    const node = nodes.get(heading.key)!;
    let parent = parents.get(heading.key);
    while (parent && !nodes.has(parent)) parent = parents.get(parent);
    if (parent) nodes.get(parent)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function addPdfOutline(pdf: jsPDF, pages: string[], originalPages: string[] = pages, originalPageIndices?: number[]) {
  const headings = collectPdfHeadings(pages, originalPages, originalPageIndices);
  const roots = pdfHeadingTree(headings, originalPages === pages ? headings : collectPdfHeadings(originalPages));
  const append = (nodes: PdfHeadingNode[], parent: OutlineItem | null) => {
    for (const node of nodes) {
      const item = pdf.outline.add(parent, node.title, {pageNumber: node.pageNumber});
      append(node.children, item);
    }
  };
  append(roots, null);
  if (roots.length) {
    // jsPDF 4.2.1's outline plugin writes every XYZ destination using the
    // current page's height, which can point halfway down a mixed-size page.
    // Fit the actual destination page; keep this adjustment on this instance
    // and retain the plugin's object references, hierarchy and Unicode titles.
    const outline = pdf.outline as typeof pdf.outline & { render: () => string };
    const render = outline.render.bind(outline);
    outline.render = () => render().replace(/^\/Dest \[(\d+ 0 R) \/XYZ 0 -?\d+(?:\.\d+)? 0\]$/gm, '/Dest [$1 /Fit]');
  }
}
