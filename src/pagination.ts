import { escapeHtml, type DocumentMeta } from './markdown';
import { layoutVariables } from './settings';
import { attachPageNotes, commitPageNotes, extractPageNotes, reservePageNotes, type NoteContext } from './page-notes';
import { numberDocumentFigures } from './document-structure';

type PageState = { page: HTMLElement; content: HTMLElement; meta: DocumentMeta; host?: HTMLElement; signal?: AbortSignal; notes?: NoteContext };
type TableContext = { wrap: (table: HTMLTableElement) => HTMLElement };
const CONTEXT_ATTRIBUTE = 'data-pagination-context';
let nextContext = 0;

let lastYield = 0;
async function yieldLayout(signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (performance.now() - lastYield < 8) return;
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  lastYield = performance.now();
  signal?.throwIfAborted();
}

function isOverflowing(content: HTMLElement) {
  reservePageNotes(content);
  return content.scrollHeight > content.clientHeight + 1;
}

function expandPageTemplate(template: string, meta: DocumentMeta, page: string, total: string) {
  return template
    .replace(/\{title}/g, () => meta.title ?? '')
    .replace(/\{author}/g, () => meta.author ?? '')
    .replace(/\{date}/g, () => meta.date ?? '')
    .replace(/\{page}/g, page)
    .replace(/\{total}/g, total)
    .replace(/__PAGE__/g, page)
    .replace(/__TOTAL__/g, total);
}

export async function waitForImages(element: HTMLElement, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const images = Array.from(element.querySelectorAll('img'));

  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            image.removeEventListener('load', done);
            image.removeEventListener('error', done);
            signal?.removeEventListener('abort', done);
            if (!image.complete || image.naturalWidth === 0) {
              const placeholder = document.createElement('span');
              placeholder.className = 'missing-image';
              placeholder.textContent = `图片加载失败：${image.alt || image.getAttribute('src') || '未知图片'}`;
              image.replaceWith(placeholder);
            }
            resolve();
          };
          const timer = setTimeout(done, 10000);
          signal?.addEventListener('abort', done, { once: true });
          if (image.complete) {
            done();
            return;
          }
          image.addEventListener('load', done, { once: true });
          image.addEventListener('error', done, { once: true });
        }),
    ),
  );
}

function createPage(meta: DocumentMeta = {}, className = 'pdf-page', host?: HTMLElement, signal?: AbortSignal, notes?: NoteContext) {
  const page = document.createElement('article');
  page.className = className;
  for (const [name, value] of Object.entries(layoutVariables(meta))) page.style.setProperty(name, value);
  if (meta.margin) {
    page.style.setProperty('--pdf-page-margin', meta.margin);
  }

  if (meta.header || meta.title || meta.author || meta.date) {
    const header = document.createElement('div');
    header.className = 'pdf-page-header';
    header.dataset.template = meta.header || [meta.title, meta.author, meta.date].filter(Boolean).join(' · ');
    header.textContent = expandPageTemplate(header.dataset.template, meta, '__PAGE__', '__TOTAL__');
    page.appendChild(header);
  }

  const content = document.createElement('div');
  content.className = 'pdf-content markdown-body';
  content.dataset.pageWidth = String(parseFloat(layoutVariables(meta)['--pdf-page-width']));
  content.dataset.pageHeight = String(parseFloat(layoutVariables(meta)['--pdf-page-height']));
  content.dataset.minParagraphLines = String(meta.minParagraphLines || 1);
  page.appendChild(content);

  if (meta.footer || meta.pageNumbers) {
    const footer = document.createElement('div');
    footer.className = 'pdf-page-footer';
    footer.dataset.template = meta.footer || '';
    {
      const footerTemplate = expandPageTemplate(meta.footer || '', meta, '__PAGE__', '__TOTAL__');
      footer.innerHTML = `${escapeHtml(footerTemplate)}${
        meta.pageNumbers ? '<span class="page-number">__PAGE__ / __TOTAL__</span>' : ''
      }`;
    }
    page.appendChild(footer);
  }

  if (meta.margin) {
    const [top, right = top, bottom = top, left = right] = meta.margin.split(/\s+/);
    Array.from(page.children).forEach((child) => {
      const element = child as HTMLElement;
      element.style.setProperty('--pdf-page-margin', meta.margin!);
      element.style.setProperty('--pdf-page-margin-left', left);
      element.style.setProperty('--pdf-page-margin-right', right);
    });
    if (page.querySelector('.pdf-page-header')) content.style.paddingTop = `max(${top}, 16mm)`;
    if (page.querySelector('.pdf-page-footer')) content.style.paddingBottom = `max(${bottom}, 16mm)`;
  }

  Array.from(page.children).forEach((child) => {
    for (const [name, value] of Object.entries(layoutVariables(meta))) (child as HTMLElement).style.setProperty(name, value);
  });
  host?.appendChild(page);
  if (host) {
    const bounds = page.getBoundingClientRect();
    const header = page.querySelector<HTMLElement>('.pdf-page-header');
    const footer = page.querySelector<HTMLElement>('.pdf-page-footer');
    const padding = getComputedStyle(content);
    if (header) {
      const needed = Math.ceil(header.getBoundingClientRect().bottom - bounds.top + 8);
      if (needed > parseFloat(padding.paddingTop)) content.style.paddingTop = `${needed}px`;
    }
    if (footer) {
      const needed = Math.ceil(bounds.bottom - footer.getBoundingClientRect().top + 8);
      if (needed > parseFloat(padding.paddingBottom)) content.style.paddingBottom = `${needed}px`;
    }
  }
  if (notes && host) attachPageNotes(page,content,notes);
  return { page, content, meta, host, signal, notes };
}

function appendPage(
  pages: string[],
  state: PageState,
) {
  commitPageNotes(state.content);
  pages.push(state.page.innerHTML);
  state.page.remove();
}

function addTocPageNumbers(pages: string[]) {
  const headingPages = new Map<string, number>();

  pages.forEach((page, pageIndex) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = page;
    wrapper
      .querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')
      .forEach((heading) => {
        if (!headingPages.has(heading.id)) {
          headingPages.set(heading.id, pageIndex + 1);
        }
      });
  });

  return pages.map((page) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = page;

    wrapper.querySelectorAll<HTMLAnchorElement>('.table-of-contents a[href^="#"]').forEach((link) => {
      const rawId = link.getAttribute('href')?.slice(1) ?? '';
      let id = rawId;

      try {
        id = decodeURIComponent(rawId);
      } catch {
        id = rawId;
      }

      const pageNumber = headingPages.get(id);
      if (!pageNumber) return;

      const number = link.querySelector('.toc-page-number') ?? document.createElement('span');
      number.className = 'toc-page-number';
      number.textContent = String(pageNumber);
      link.appendChild(number);
    });

    return wrapper.innerHTML;
  });
}

function finalizePages(pages: string[], meta: DocumentMeta) {
  const pagesWithTocNumbers = meta.tocPageNumbers === false ? pages : addTocPageNumbers(pages);
  const ids = new Set<string>();
  const listItems = new Set<string>();

  return pagesWithTocNumbers.map((page, index) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = page;
    wrapper.querySelectorAll<HTMLElement>(`[${CONTEXT_ATTRIBUTE}]`).forEach(element => {
      const key = element.getAttribute(CONTEXT_ATTRIBUTE)!;
      if (element instanceof HTMLOListElement) {
        const first = element.querySelector<HTMLElement>(':scope > li');
        const number = first?.getAttribute(CONTEXT_ATTRIBUTE)?.split(':')[1];
        if (number !== undefined) element.start = Number(number);
      }
      if (element.tagName === 'LI') {
        if (listItems.has(key)) element.classList.add('list-item-continuation');
        listItems.add(key);
      }
      element.removeAttribute(CONTEXT_ATTRIBUTE);
    });
    wrapper.querySelectorAll('[id]').forEach(element => {
      if (ids.has(element.id)) element.removeAttribute('id');
      else ids.add(element.id);
    });
    wrapper.querySelectorAll<HTMLElement>('.pdf-page-header, .pdf-page-footer').forEach((element) => {
      element.textContent = expandPageTemplate(element.dataset.template ?? '', meta, String(index + 1), String(pagesWithTocNumbers.length));
      delete element.dataset.template;
      if (element.classList.contains('pdf-page-footer') && meta.pageNumbers) {
        const number = document.createElement('span');
        number.className = 'page-number';
        number.textContent = `${index + 1} / ${pagesWithTocNumbers.length}`;
        element.appendChild(number);
      }
    });
    return wrapper.innerHTML;
  });
}

function contextTitle(element: HTMLElement) {
  if (element.tagName === 'DETAILS') return element.querySelector<HTMLElement>(':scope > summary');
  if (element.matches('.md-alert, .md-container')) return element.querySelector<HTMLElement>(':scope > strong');
  return null;
}

function listOrdinal(list: HTMLOListElement, item: Element) {
  const children = Array.from(list.children).filter(child => child.tagName === 'LI');
  let number = list.hasAttribute('start') ? list.start : list.reversed ? children.length : 1;
  for (const child of children) {
    if (child.hasAttribute('value')) number = Number(child.getAttribute('value'));
    if (child === item) return number;
    number += list.reversed ? -1 : 1;
  }
  return number;
}

// Adjacent pieces of one source block share their wrappers on the same page.
// Record moves so a failed fit can restore the incoming fragment before splitting.
function mountFragment(fragment: HTMLElement, content: HTMLElement) {
  const previous = content.lastElementChild as HTMLElement | null;
  const key = fragment.getAttribute(CONTEXT_ATTRIBUTE);
  if (!key || previous?.getAttribute(CONTEXT_ATTRIBUTE) !== key) {
    content.appendChild(fragment);
    return { root: fragment, remove: () => fragment.remove() };
  }
  const moves: { node: Node; parent: Node; next: Node | null }[] = [];
  const merge = (target: HTMLElement, incoming: HTMLElement) => {
    const title = contextTitle(incoming);
    for (const child of Array.from(incoming.childNodes)) {
      if (child === title && contextTitle(target)) continue;
      const last = target.lastElementChild as HTMLElement | null;
      const childKey = child instanceof HTMLElement ? child.getAttribute(CONTEXT_ATTRIBUTE) : null;
      if (childKey && last?.getAttribute(CONTEXT_ATTRIBUTE) === childKey) merge(last, child as HTMLElement);
      else {
        moves.push({ node: child, parent: incoming, next: child.nextSibling });
        target.appendChild(child);
      }
    }
  };
  merge(previous, fragment);
  return { root: previous, remove: () => {
    for (const move of moves.reverse()) move.parent.insertBefore(move.node, move.next?.parentNode === move.parent ? move.next : null);
  } };
}

async function appendNodeToPages(
  node: Element,
  pages: string[],
  state: PageState,
) {
  if (node instanceof HTMLElement && node.querySelector('table')) return appendNestedTables(node, pages, state);
  let clone = node.cloneNode(true) as HTMLElement;
  let mounted = mountFragment(clone, state.content);
  fitWideMath(mounted.root);

  if (!isOverflowing(state.content)) {
    return state;
  }

  mounted.remove();
  const last = state.content.lastElementChild;
  const orphanHeading = last && /^H[1-6]$/.test(last.tagName) ? last : null;
  orphanHeading?.remove();
  state = startNewPageIfNeeded(pages, state);
  if (orphanHeading) state.content.appendChild(orphanHeading);
  mounted = mountFragment(clone, state.content);
  while (isOverflowing(state.content)) {
    await yieldLayout(state.signal);
    mounted.remove();
    const split = splitToFit(clone, state.content);
    if (!split) {
      fitAtomicNode(clone, state.content);
      return state;
    }
    mountFragment(split.head, state.content);
    state = startNewPageIfNeeded(pages, state);
    clone = split.tail;
    mounted = mountFragment(clone, state.content);
  }
  return state;
}

async function appendNestedTables(node: HTMLElement, pages: string[], state: PageState) {
  const tables = Array.from(node.querySelectorAll<HTMLTableElement>('table')).filter(table => !table.parentElement?.closest('table'));
  if (!tables.length) return state;
  const originals = new Map<string, HTMLElement>();
  const identify = (element: HTMLElement) => {
    if (element.hasAttribute(CONTEXT_ATTRIBUTE)) return;
    const list = element.tagName === 'LI' && element.parentElement instanceof HTMLOListElement ? element.parentElement : null;
    const key = String(nextContext++) + (list ? `:${listOrdinal(list, element)}` : '');
    element.setAttribute(CONTEXT_ATTRIBUTE, key); originals.set(key, element);
  };
  identify(node);
  node.querySelectorAll<HTMLElement>('ol, li').forEach(identify);
  for (const table of tables) {
    for (let ancestor = table.parentElement; ancestor; ancestor = ancestor.parentElement) {
      identify(ancestor); if (ancestor === node) break;
    }
  }
  const restoreContext = (fragment: HTMLElement) => {
    for (const element of [fragment, ...fragment.querySelectorAll<HTMLElement>(`[${CONTEXT_ATTRIBUTE}]`)]) {
      const original = originals.get(element.getAttribute(CONTEXT_ATTRIBUTE) || '');
      if (!original) continue;
      const title = contextTitle(original);
      if (title && !contextTitle(element)) element.prepend(title.cloneNode(true));
      if (element instanceof HTMLOListElement) {
        const first = element.querySelector<HTMLElement>(':scope > li');
        const source = first && originals.get(first.getAttribute(CONTEXT_ATTRIBUTE) || '');
        if (source) element.start = listOrdinal(original as HTMLOListElement, source);
      }
    }
    restoreCalloutSummaries(node, fragment);
  };
  const hasBody = (fragment: HTMLElement) => {
    if (fragment.querySelector('img,svg,table,hr,pre,input[type="checkbox"]')) return true;
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent?.trim()) continue;
      const parent = walker.currentNode.parentElement;
      if (parent?.closest('summary')) continue;
      const strong = parent?.closest<HTMLElement>('.md-alert > strong, .md-container > strong');
      if (strong && strong === contextTitle(strong.parentElement!)) continue;
      return true;
    }
    return false;
  };
  let previous: HTMLTableElement | undefined;
  const appendPart = async (end?: HTMLTableElement) => {
    const range = document.createRange();
    if (previous) range.setStartAfter(previous); else range.setStart(node, 0);
    if (end) range.setEndBefore(end); else range.setEnd(node, node.childNodes.length);
    const part = node.cloneNode(false) as HTMLElement; part.append(range.cloneContents());
    restoreContext(part);
    if (hasBody(part)) state = await appendNodeToPages(part, pages, state);
  };
  for (const table of tables) {
    await yieldLayout(state.signal);
    await appendPart(table);
    const ancestors: HTMLElement[] = [];
    for (let ancestor = table.parentElement; ancestor; ancestor = ancestor.parentElement) {
      ancestors.push(ancestor); if (ancestor === node) break;
    }
    const context: TableContext = { wrap: shell => {
      let fragment: HTMLElement = shell;
      for (const ancestor of ancestors) {
        const parent = ancestor.cloneNode(false) as HTMLElement; parent.append(fragment); fragment = parent;
      }
      restoreContext(fragment);
      return fragment;
    } };
    if (shouldUseWideTable(table, state, context)) {
      const meta = state.meta;
      state = startNewPageIfNeeded(pages, state); state.page.remove();
      state = createPage({ ...meta, orientation: 'landscape' }, 'pdf-page pdf-page-measure', state.host, state.signal, state.notes);
      state = await appendTableToPages(table, pages, state, context); appendPage(pages, state);
      state = createPage(meta, 'pdf-page pdf-page-measure', state.host, state.signal, state.notes);
    } else state = await appendTableToPages(table, pages, state, context);
    previous = table;
  }
  await appendPart();
  return state;
}

function fitWideMath(node: HTMLElement) {
  node.querySelectorAll<HTMLElement>('.katex-display').forEach((display) => {
    const formula = display.querySelector<HTMLElement>('.katex-html');
    if (!formula) return;
    const width = formula.getBoundingClientRect().width;
    if (width > display.clientWidth && display.clientWidth > 0) {
      display.style.fontSize = `${parseFloat(getComputedStyle(display).fontSize) * display.clientWidth / width * 0.98}px`;
    }
  });
}

// Split DOM ranges rather than plain strings so emphasis, links and highlighted code survive.
function splitToFit(node: HTMLElement, content: HTMLElement, testFit?: (head: HTMLElement) => boolean) {
  if (node.matches('svg, figure, .mermaid-diagram, .diagram-block, .katex-display, table, h1, h2, h3, h4, h5, h6')) return null;
  // Keep one segment per text node instead of one JS object per character.
  const segments: { node: Text; start: number; count: number; offsets?: Uint32Array; atomic?: HTMLElement }[] = [];
  const atomics = new Set<HTMLElement>();
  let positionCount = 0;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let textNode: Node | null;
  while ((textNode = walker.nextNode())) {
    // Nested tables do not pass through the top-level row paginator. Keep their
    // spans and headers intact rather than cutting through arbitrary cell text.
    const table = textNode.parentElement?.closest<HTMLElement>('table');
    if (table) {
      if (!atomics.has(table)) {
        atomics.add(table);
        segments.push({ node: textNode as Text, start: positionCount++, count: 1, atomic: table });
      }
      continue;
    }
    if (textNode.parentElement?.closest('svg, .katex, .mermaid-diagram, .diagram-block')) continue;
    if (textNode.parentElement?.closest('details.md-alert-foldable > summary')) continue;
    const ruby = textNode.parentElement?.closest<HTMLElement>('ruby');
    if (ruby) {
      if (!atomics.has(ruby)) {
        atomics.add(ruby);
        segments.push({ node: textNode as Text, start: positionCount++, count: 1, atomic: ruby });
      }
      continue;
    }
    const text = textNode as Text;
    let count = text.length; let offsets: Uint32Array | undefined;
    if (/[\uD800-\uDFFF]/.test(text.data)) {
      offsets = new Uint32Array(text.length); count = 0; let offset = 0;
      for (const character of text.data) { offset += character.length; offsets[count++] = offset; }
    }
    if (count) { segments.push({ node: text, start: positionCount, count, offsets }); positionCount += count; }
  }
  if (positionCount < 2) return null;
  const positionAt = (index: number) => {
    let low = 0, high = segments.length - 1;
    while (low < high) { const middle = (low + high) >> 1; if (segments[middle].start + segments[middle].count <= index) low = middle + 1; else high = middle; }
    const segment = segments[low]; const local = index - segment.start;
    if (segment.atomic) return { node: segment.atomic.parentNode!, offset: Array.from(segment.atomic.parentNode!.childNodes).indexOf(segment.atomic) + 1 };
    return { node: segment.node, offset: segment.offsets ? segment.offsets[local] : local + 1 };
  };
  const makeHead = (index: number) => {
    const range = document.createRange();
    range.setStart(node, 0);
    const position = positionAt(index); range.setEnd(position.node, position.offset);
    const head = node.cloneNode(false) as HTMLElement;
    head.appendChild(range.cloneContents());
    return head;
  };
  const minLines = node.tagName === 'P' && !testFit ? Number(content.dataset.minParagraphLines || 1) : 1;
  const lines = (element: HTMLElement) => {
    const range = document.createRange(); range.selectNodeContents(element);
    return new Set(Array.from(range.getClientRects(),rect=>Math.round(rect.top))).size;
  };
  const tailAt = (index: number) => {
    const position=positionAt(index);const range=document.createRange();range.setStart(position.node,position.offset);range.setEnd(node,node.childNodes.length);
    const tail=node.cloneNode(false) as HTMLElement;tail.append(range.cloneContents());return tail;
  };
  let low = 0;
  let high = positionCount - 2;
  let best = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const head = makeHead(middle);
    let fits: boolean;
    if (testFit) fits = testFit(head);
    else {
      content.appendChild(head);
      fits = !isOverflowing(content);
      head.remove();
      if (fits && minLines > 1) { const tail=tailAt(middle);content.append(tail);fits=lines(tail)>=minLines;tail.remove(); }
    }
    if (fits) { best = middle; low = middle + 1; }
    else high = middle - 1;
  }
  if (best < 0) return null;
  // Prefer a nearby line or word boundary without leaving a nearly empty page.
  const minimum = Math.max(0, best - 120);
  for (let index = best; index >= minimum; index--) {
    const { node: text, offset } = positionAt(index);
    if (text.nodeType === Node.TEXT_NODE && /\s/.test((text as Text).data[offset - 1])) { best = index; break; }
  }
  const head = makeHead(best);
  if(minLines>1){content.append(head);const enough=lines(head)>=minLines;head.remove();if(!enough)return null;}
  const range = document.createRange();
  const position = positionAt(best); range.setStart(position.node, position.offset);
  range.setEnd(node, node.childNodes.length);
  const tail = node.cloneNode(false) as HTMLElement;
  tail.appendChild(range.cloneContents());
  tail.removeAttribute('id');
  const usedIds = new Set(Array.from(head.querySelectorAll('[id]'), (element) => element.id));
  tail.querySelectorAll('[id]').forEach((element) => {
    if (usedIds.has(element.id)) element.removeAttribute('id');
  });
  const path: HTMLElement[] = [];
  let ancestor = position.node.nodeType === Node.TEXT_NODE ? position.node.parentElement : position.node as HTMLElement;
  while (ancestor) {
    path.unshift(ancestor);
    if (ancestor === node) break;
    ancestor = ancestor.parentElement;
  }
  let continuation: HTMLElement | null = tail;
  for (let index = 0; index < path.length && continuation; index++) {
    const original = path[index];
    if (original.tagName === 'OL') {
      const itemIndex = path[index + 1] ? Array.from(original.children).indexOf(path[index + 1]) : 0;
      const items = Array.from(original.children).filter((item) => item.tagName === 'LI');
      const item = items[Math.max(0, itemIndex)];
      const ordinal = item?.getAttribute('value') ?? String(Number(original.getAttribute('start') || 1) + Math.max(0, itemIndex));
      continuation.setAttribute('start', ordinal);
    }
    if (original.tagName === 'LI') continuation.classList.add('list-item-continuation');
    continuation = continuation.firstElementChild as HTMLElement | null;
  }
  restoreCalloutSummaries(node, tail);
  return { head, tail };
}

// Repeat only the safe title on automatic and explicit page continuations.
function restoreCalloutSummaries(node: HTMLElement, continuation: HTMLElement) {
  const callouts = [node, ...node.querySelectorAll<HTMLElement>('details.md-alert-foldable')]
    .filter(element => element.matches('details.md-alert-foldable'));
  for (const fragment of [continuation, ...continuation.querySelectorAll<HTMLElement>('details.md-alert-foldable')]) {
    if (!fragment.matches('details.md-alert-foldable') || fragment.querySelector(':scope > summary')) continue;
    const original = callouts.find(callout => callout.dataset.calloutKey === fragment.dataset.calloutKey);
    const title = original?.querySelector(':scope > summary')?.cloneNode(true) as HTMLElement | undefined;
    if (title) {
      title.removeAttribute('id'); title.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
      fragment.prepend(title);
    }
  }
}

function fitAtomicNode(node: HTMLElement, content: HTMLElement) {
  const wrapper = document.createElement('div');
  wrapper.className = 'pagination-scaled';
  content.appendChild(wrapper);
  wrapper.appendChild(node);
  node.style.width = '100%';
  node.style.margin = '0';
  const height = node.getBoundingClientRect().height;
  const styles = getComputedStyle(content);
  const available = Math.max(1, content.getBoundingClientRect().bottom - parseFloat(styles.paddingBottom) - wrapper.getBoundingClientRect().top - 4);
  const scale = Math.min(1, available / Math.max(1, height));
  wrapper.style.height = `${height * scale}px`;
  node.style.transformOrigin = 'top left';
  node.style.transform = `scale(${scale})`;
}

function startNewPageIfNeeded(pages: string[], state: PageState) {
  if (state.content.children.length === 0) return state;

  appendPage(pages, state);
  const nextState = createPage(state.meta, 'pdf-page pdf-page-measure', state.host, state.signal, state.notes);
  return nextState;
}

function shouldStartChapterOnNewPage(node: Element, state: PageState) {
  if (!state.meta.chapterNewPage || state.content.children.length === 0) return false;

  const level = Number(node.tagName.slice(1));
  const maxLevel = state.meta.chapterLevel ?? 2;
  return /^H[1-6]$/.test(node.tagName) && level <= maxLevel;
}

function shouldUseWideTable(table: HTMLTableElement, state: PageState, context?: TableContext) {
  if (!state.meta.wideTables || state.meta.orientation === 'landscape') return false;
  if (table.querySelectorAll(':scope > thead > tr:first-child > th').length >= 8) return true;
  // Percentage widths must be measured inside the page's padding and ancestor
  // wrappers. Their wider source-host width does not make a table intrinsically wide.
  const clone = table.cloneNode(true) as HTMLTableElement;
  const fragment = context?.wrap(clone) ?? clone;
  state.content.append(fragment);
  const style = getComputedStyle(state.content);
  const width = state.content.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const wide = clone.scrollWidth > clone.clientWidth + 1 || clone.getBoundingClientRect().width > width + 1;
  fragment.remove();
  return wide;
}

function createTableShell(table: HTMLTableElement, context?: TableContext) {
  const tableClone = table.cloneNode(false) as HTMLTableElement;
  table.querySelectorAll(':scope > caption, :scope > colgroup, :scope > thead').forEach((child) => tableClone.appendChild(child.cloneNode(true)));

  const tbody = document.createElement('tbody');
  tableClone.appendChild(tbody);

  return { table: tableClone, tbody, root: context?.wrap(tableClone) ?? tableClone };
}

async function appendTableToPages(
  table: HTMLTableElement,
  pages: string[],
  state: PageState,
  context?: TableContext,
) {
  const groups: HTMLTableRowElement[][] = [];
  for (const body of table.querySelectorAll(':scope > tbody, :scope > tfoot')) {
    const rows = Array.from(body.querySelectorAll(':scope > tr')) as HTMLTableRowElement[];
    for (let start = 0; start < rows.length;) {
      let end = start;
      for (let index = start; index <= end; index++) {
        for (const cell of rows[index].cells) {
          const span = cell.rowSpan === 0 ? rows.length - index : cell.rowSpan;
          end = Math.max(end, Math.min(rows.length - 1, index + span - 1));
        }
      }
      groups.push(rows.slice(start, end + 1)); start = end + 1;
    }
  }
  if (!groups.length) {
    const clone = table.cloneNode(true) as HTMLTableElement;
    const fragment = context?.wrap(clone) ?? clone;
    const mounted = mountFragment(fragment, state.content);
    if (isOverflowing(state.content)) {
      mounted.remove(); state = startNewPageIfNeeded(pages, state);
      mountFragment(fragment, state.content);
      if (isOverflowing(state.content)) { fragment.remove(); fitAtomicNode(fragment, state.content); }
    }
    return state;
  }
  let shell = createTableShell(table, context);
  let mounted = mountFragment(shell.root, state.content);
  let restart = false;
  for (const group of groups) {
    await yieldLayout(state.signal);
    if (restart) {
      state = startNewPageIfNeeded(pages, state);
      shell = createTableShell(table, context); mounted = mountFragment(shell.root, state.content); restart = false;
    }
    let clones = group.map((row) => row.cloneNode(true) as HTMLElement);
    clones.forEach((row) => shell.tbody.appendChild(row));
    if (!isOverflowing(state.content)) continue;
    clones.forEach((row) => row.remove());
    if (!shell.tbody.children.length) mounted.remove();
    state = startNewPageIfNeeded(pages, state);
    shell = createTableShell(table, context); mounted = mountFragment(shell.root, state.content);
    clones = group.map((row) => row.cloneNode(true) as HTMLElement);
    clones.forEach((row) => shell.tbody.appendChild(row));
    if (isOverflowing(state.content)) {
      mounted.remove();
      if (group.length === 1 && Array.from(group[0].cells).every(cell => cell.rowSpan === 1)) {
        state = await appendTallRow(group[0], table, pages, state, context);
      } else fitAtomicNode(shell.root, state.content);
      restart = true;
    }
  }
  return state;
}

async function appendTallRow(row: HTMLTableRowElement, table: HTMLTableElement, pages: string[], state: PageState, context?: TableContext) {
  let remaining = row.cloneNode(true) as HTMLTableRowElement;
  for (;;) {
    await yieldLayout(state.signal);
    const shell = createTableShell(table, context);
    const head = remaining.cloneNode(false) as HTMLTableRowElement;
    const tail = remaining.cloneNode(false) as HTMLTableRowElement;
    const cells = Array.from(remaining.cells);
    cells.forEach((cell) => head.appendChild(cell.cloneNode(false)));
    shell.tbody.appendChild(head);
    const mounted = mountFragment(shell.root, state.content);
    let progressed = false;
    let more = false;
    for (const [index, cell] of cells.entries()) {
      const full = cell.cloneNode(true) as HTMLElement;
      head.children[index].replaceWith(full);
      if (!isOverflowing(state.content)) {
        tail.appendChild(cell.cloneNode(false));
        progressed ||= !!cell.textContent?.trim() || cell.children.length > 0;
        continue;
      }
      full.replaceWith(cell.cloneNode(false));
      const split = splitToFit(cell, state.content, (candidate) => {
        const previous = head.children[index];
        previous.replaceWith(candidate);
        const fits = !isOverflowing(state.content);
        candidate.replaceWith(previous);
        return fits;
      });
      if (!split) {
        tail.appendChild(cell.cloneNode(true));
        more = true;
        continue;
      }
      head.children[index].replaceWith(split.head);
      tail.appendChild(split.tail);
      progressed = true;
      more ||= !!split.tail.textContent?.trim() || split.tail.children.length > 0;
    }
    if (!progressed) {
      mounted.remove();
      const fallback = createTableShell(table, context);
      fallback.tbody.appendChild(remaining);
      fitAtomicNode(fallback.root, state.content);
      return state;
    }
    if (!more) return state;
    state = startNewPageIfNeeded(pages, state);
    remaining = tail;
    remaining.classList.add('table-row-continuation');
  }
}

export async function paginateHtml(html: string, meta: DocumentMeta = {}, signal?: AbortSignal) {
  signal?.throwIfAborted();
  await document.fonts?.ready;

  const host = document.createElement('div');
  host.className = 'pagination-host';

  const source = document.createElement('div');
  source.className = 'markdown-body';
  for (const [name, value] of Object.entries(layoutVariables(meta))) source.style.setProperty(name, value);
  host.style.width = layoutVariables(meta)['--pdf-page-width'];
  source.innerHTML = html;
  source.querySelectorAll(`[${CONTEXT_ATTRIBUTE}]`).forEach(element => element.removeAttribute(CONTEXT_ATTRIBUTE));
  // Measure and export complete callout bodies, including initially folded ones.
  // The preview restores the source's fold state without altering these pages.
  source.querySelectorAll<HTMLDetailsElement>('details.md-alert-foldable').forEach(callout => { callout.open = true; });
  if (meta.figureNumbers) numberDocumentFigures(source);
  let notes: NoteContext | undefined;
  if (meta.footnotes === 'near-reference') {
    const definitions = new Map(Array.from(source.querySelectorAll<HTMLElement>('.footnotes li[id]'), (note, index) => [note.id, { note, index }]));
    for (const block of Array.from(source.children)) {
      if (block.matches('.footnotes')) continue;
      const moved: { note: HTMLElement; index: number }[] = [];
      for (const reference of block.querySelectorAll<HTMLAnchorElement>('a.footnote-ref,.footnote-ref a[href]')) {
        const id = decodeURIComponent(reference.hash.slice(1)); const definition = definitions.get(id);
        if (definition) { moved.push(definition); definitions.delete(id); }
      }
      if (moved.length) {
        const section = document.createElement('section'); section.className = 'footnotes';
        const list = document.createElement('ol');
        moved.forEach(({ note, index }) => { note.setAttribute('value', String(index + 1)); list.appendChild(note); });
        section.appendChild(list); block.after(section);
      }
    }
    source.querySelectorAll('.footnotes').forEach((section) => { if (!section.querySelector('li')) section.remove(); });
    source.querySelectorAll('.footnotes-sep').forEach((separator) => separator.remove());
  }
  if (meta.cover) {
    const cover = document.createElement('section'); cover.className = 'document-cover';
    const title = document.createElement('h1'); title.textContent = meta.title || source.querySelector('h1')?.textContent?.replace(/\s*#$/, '') || '文档';
    const detail = document.createElement('p'); detail.textContent = [meta.author, meta.date].filter(Boolean).join(' · ');
    cover.append(title, detail);
    const marker = document.createElement('div'); marker.className = 'page-break'; source.prepend(cover, marker);
  }
  for (const node of Array.from(source.children)) {
    const breaks = Array.from(node.querySelectorAll('.page-break'));
    if (breaks.length === 0) continue;
    let previous: Element | null = null;
    const emitted = new Set<string>();
    const appendPart = (end?: Element) => {
      const range = document.createRange();
      if (previous) range.setStartAfter(previous); else range.setStart(node, 0);
      if (end) range.setEndBefore(end); else range.setEnd(node, node.childNodes.length);
      const part = node.cloneNode(false) as HTMLElement;
      part.appendChild(range.cloneContents());
      if (!part.textContent?.trim() && !part.querySelector('img,svg,table,hr')) return;
      for (const element of [part, ...Array.from(part.querySelectorAll('[id]'))]) {
        if (emitted.has(element.id)) element.removeAttribute('id');
        else if (element.id) emitted.add(element.id);
      }
      restoreCalloutSummaries(node as HTMLElement, part);
      node.before(part);
    };
    for (const marker of breaks) {
      appendPart(marker);
      node.before(marker.cloneNode(true));
      previous = marker;
    }
    appendPart(); node.remove();
  }
  if (meta.tocPageNumbers !== false) {
    source.querySelectorAll('.table-of-contents a').forEach((link) => {
      const number = document.createElement('span');
      number.className = 'toc-page-number';
      number.textContent = ' ';
      link.appendChild(number);
    });
  }
  // Raw HTML can produce top-level text nodes; keep these in the pagination input.
  Array.from(source.childNodes).forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return;
    const paragraph = document.createElement('p');
    node.replaceWith(paragraph);
    paragraph.appendChild(node);
  });

  host.appendChild(source);
  document.body.appendChild(host);

  try {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await waitForImages(source, signal);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (meta.footnotes === 'page-bottom') notes = extractPageNotes(source);

    const pages: string[] = [];
    let state: PageState = createPage(meta, 'pdf-page pdf-page-measure', host, signal, notes);
    host.appendChild(state.page);

    for (const node of Array.from(source.children)) {
      await yieldLayout(signal);
      if (node instanceof HTMLElement && node.classList.contains('page-break')) {
        state = startNewPageIfNeeded(pages, state);
      } else if (shouldStartChapterOnNewPage(node, state)) {
        state = startNewPageIfNeeded(pages, state);
        state = await appendNodeToPages(node, pages, state);
      } else if (node instanceof HTMLTableElement) {
        if(shouldUseWideTable(node, state)) {
          state=startNewPageIfNeeded(pages,state);
          state.page.remove();
          state=createPage({...meta,orientation:'landscape'},'pdf-page pdf-page-measure',host,signal,notes);
          state=await appendTableToPages(node,pages,state);appendPage(pages,state);
          state=createPage(meta,'pdf-page pdf-page-measure',host,signal,notes);
        } else state = await appendTableToPages(node, pages, state);
      } else {
        state = await appendNodeToPages(node, pages, state);
      }
    }

    if (state.content.children.length > 0 || pages.length === 0 || notes?.pending.length) appendPage(pages, state);
    while(notes?.pending.length){await yieldLayout(signal);state=createPage(meta,'pdf-page pdf-page-measure',host,signal,notes);appendPage(pages,state);}
    const nextPages = pages.length > 0 ? pages : [createPage(meta).page.innerHTML];
    return finalizePages(nextPages, meta);
  } finally {
    host.remove();
  }
}
