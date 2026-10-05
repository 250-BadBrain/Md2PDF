const MAX_IMAGE_DIMENSION: Record<string, number> = { px: 4096, '%': 100, mm: 1000, cm: 100 };

function imageDimension(value: string) {
  const match = /^(\d+(?:\.\d+)?|\.\d+)(px|%|mm|cm)$/i.exec(value.trim());
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (amount <= 0 || amount > MAX_IMAGE_DIMENSION[unit]) return undefined;
  return `${amount}${unit}`;
}

/** Keep only bounded, static image sizes; never retain unrelated embedded CSS. */
export function preserveImageDimensions(element: HTMLElement): void {
  if (element.tagName !== 'IMG') return;
  const width = imageDimension(element.style.width);
  const height = imageDimension(element.style.height);
  element.removeAttribute('style');
  if (width) element.style.width = width;
  if (height) element.style.height = height;
}

function consumeTitleLine(paragraph: Element) {
  const document = paragraph.ownerDocument;
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let lineBreak: { node: Node; offset?: number; length?: number } | undefined;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'BR') {
      lineBreak = { node };
      break;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const newline = /\r?\n/.exec(node.textContent || '');
      if (newline) { lineBreak = { node, offset: newline.index, length: newline[0].length }; break; }
    }
  }
  const range = document.createRange();
  range.setStart(paragraph, 0);
  if (!lineBreak) range.setEnd(paragraph, paragraph.childNodes.length);
  else if (lineBreak.offset === undefined) range.setEndBefore(lineBreak.node);
  else range.setEnd(lineBreak.node, lineBreak.offset);
  const title = range.cloneContents().textContent?.trim() || '';
  // Consume the separating line break as well, leaving all later inline nodes intact.
  if (lineBreak?.offset !== undefined) range.setEnd(lineBreak.node, lineBreak.offset + lineBreak.length!);
  else if (lineBreak) range.setEndAfter(lineBreak.node);
  range.deleteContents();
  return title;
}

/** Enhance sanitized presentation HTML without accepting arbitrary styles or HTML titles. */
export function enhanceDoocsHtml(container: HTMLElement): void {
  container.querySelectorAll('center').forEach(center => center.classList.add('md-center'));
  container.querySelectorAll('blockquote').forEach(blockquote => {
    const paragraph = blockquote.querySelector(':scope > p');
    const first = paragraph?.firstChild;
    if (!paragraph || first?.nodeType !== Node.TEXT_NODE) return;
    const marker = /^\s*\[!([a-z][a-z\d_-]{0,39})][ \t]*/i.exec(first.textContent || '');
    if (!marker) return;
    const type = marker[1].toLowerCase();
    first.textContent = (first.textContent || '').slice(marker[0].length);
    const title = consumeTitleLine(paragraph);
    const fallback = type === 'caution' ? 'danger' : type;
    const label = container.ownerDocument.createElement('strong');
    label.textContent = title || fallback.charAt(0).toUpperCase() + fallback.slice(1);
    blockquote.classList.add('md-alert', `md-alert-${type}`);
    if (!['note', 'tip', 'important', 'warning', 'caution'].includes(type)) blockquote.classList.add('md-alert-generic');
    blockquote.prepend(label);
    while (paragraph.firstChild?.nodeType === Node.TEXT_NODE && !paragraph.firstChild.textContent?.trim()) paragraph.firstChild.remove();
    if (paragraph.firstChild?.nodeType === Node.TEXT_NODE) paragraph.firstChild.textContent = paragraph.firstChild.textContent!.replace(/^\r?\n/, '');
    if (!paragraph.hasChildNodes()) paragraph.remove();
  });
}
