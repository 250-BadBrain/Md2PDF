/** Read visible heading text without modifying the rendered document. */
export function headingText(heading: HTMLElement): string {
  const clone = heading.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.header-anchor,.toc-page-number,rp,rt,.katex-mathml,script,style').forEach(node => node.remove());
  clone.querySelectorAll('img').forEach(image => image.replaceWith(heading.ownerDocument.createTextNode(image.alt)));
  return clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}
