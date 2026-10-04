import DOMPurify from 'dompurify';
import { parseWithWorker } from './parser-client';
import { escapeHtml, humanizeContainerType, parseMarkdownSyntax, type DocumentMeta, type RenderedDocument } from './markdown-parser';
export { escapeHtml, parseFrontMatter, parseMarkdownSyntax } from './markdown-parser';
export type { DocumentMeta, RenderedDocument } from './markdown-parser';
type AssetUrls = Record<string, string>;
let mermaidId = 0;
let mermaidPromise: Promise<typeof import('mermaid')['default']> | undefined;
function getMermaid() {
  mermaidPromise ??= import('mermaid').then((module) => {
    module.default.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'default',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
    });
    return module.default;
  });

  return mermaidPromise;
}

export function getPdfName(fileName?: string) {
  if (!fileName) return 'document.pdf';
  const withoutExt = fileName.replace(/\.(md|markdown|txt)$/i, '');
  return `${withoutExt || 'document'}.pdf`;
}

export function normalizePath(path: string) {
  const normalized = path.replace(/\\/g, '/');
  const parts: string[] = [];

  for (const part of normalized.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.join('/');
}

export function getFilePath(file: File) {
  const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return normalizePath(path || file.name);
}

function getDirectoryName(path?: string) {
  if (!path) return '';
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
}

export function isMarkdownFile(file: File) {
  return /\.(md|markdown|txt)$/i.test(file.name);
}

export function isImageFile(file: File) {
  return (
    file.type.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name)
  );
}

function isExternalResource(src: string) {
  return /^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(src);
}

function resolveAssetUrl(src: string, markdownPath: string | undefined, assets: AssetUrls) {
  const cleanSrc = src.trim();

  if (!cleanSrc || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(cleanSrc)) {
    return cleanSrc;
  }

  const pathname = cleanSrc.split(/[?#]/)[0];
  let decodedSrc = pathname;
  try {
    decodedSrc = decodeURIComponent(pathname);
  } catch {
    decodedSrc = pathname;
  }
  const candidates = [
    normalizePath(`${getDirectoryName(markdownPath)}/${decodedSrc}`),
    normalizePath(decodedSrc),
    normalizePath(`${normalizePath(markdownPath ?? '').split('/')[0]}/${decodedSrc}`),
  ];

  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    const url = Object.prototype.hasOwnProperty.call(assets, key) ? assets[key] : undefined;
    if (url) return url;
  }

  return cleanSrc;
}

function cleanupMermaidErrors() {
  document
    .querySelectorAll<HTMLElement>('.mermaid .error-icon, .mermaid .error-text')
    .forEach((element) => element.closest('svg')?.remove());
}

function enhanceAlerts(container: HTMLElement) {
  container.querySelectorAll('blockquote').forEach((blockquote) => {
    const firstParagraph = blockquote.querySelector(':scope > p');
    const firstNode = firstParagraph?.firstChild;
    const text = firstNode?.nodeType === Node.TEXT_NODE ? firstNode.textContent ?? '' : '';
    const match = text.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)]\s*/i);

    if (!match || !firstParagraph) return;

    const type = match[1].toLowerCase();
    const label = humanizeContainerType(type === 'caution' ? 'danger' : type);
    firstNode!.textContent = text.slice(match[0].length);
    while (firstParagraph.firstChild && (
      (firstParagraph.firstChild.nodeType === Node.TEXT_NODE && !firstParagraph.firstChild.textContent?.trim())
      || (firstParagraph.firstChild instanceof HTMLElement && firstParagraph.firstChild.tagName === 'BR')
    )) firstParagraph.firstChild.remove();
    blockquote.classList.add('md-alert', `md-alert-${type}`);
    blockquote.insertAdjacentHTML('afterbegin', `<strong>${label}</strong>`);

    if (!firstParagraph.textContent?.trim()) {
      firstParagraph.remove();
    }
  });
}

function parseImagePresentation(img: HTMLImageElement) {
  const rawAlt = img.alt;
  const [caption, ...markers] = rawAlt.split('|').map((part) => part.trim());
  for (const attribute of ['width', 'height'] as const) {
    const value = img.getAttribute(attribute);
    if (value && /^\d+$/.test(value)) img.style[attribute] = `${value}px`;
  }

  for (const marker of markers) {
    const sizeMatch = marker.match(/^(\d+)(?:x(\d+))?$/);
    const widthMatch = marker.match(/^w(?:idth)?=(\d+(?:px|%|mm|cm)?)$/i);

    if (sizeMatch) {
      img.style.width = `${sizeMatch[1]}px`;
      if (sizeMatch[2]) img.style.height = `${sizeMatch[2]}px`;
    } else if (widthMatch) {
      img.style.width = /^\d+$/.test(widthMatch[1]) ? `${widthMatch[1]}px` : widthMatch[1];
    }
  }

  img.alt = caption || rawAlt;
  return caption;
}

function isMissingLocalImage(img: HTMLImageElement) {
  const rawSrc = img.getAttribute('src') ?? '';
  return rawSrc && !rawSrc.startsWith('blob:') && !isExternalResource(rawSrc);
}

function createMissingImagePlaceholder(src: string) {
  const placeholder = document.createElement('span');
  placeholder.className = 'missing-image';
  placeholder.textContent = `图片未找到：${src}`;
  return placeholder;
}

function enhanceImages(container: HTMLElement, path: string | undefined, assets: AssetUrls) {
  container.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    const rawSrc = resolveAssetUrl(img.getAttribute('src') ?? '', path, assets);
    img.setAttribute('src', rawSrc);
    img.crossOrigin = 'anonymous';
    img.removeAttribute('loading');
    img.removeAttribute('srcset');
    const caption = parseImagePresentation(img);
    const parent = img.parentElement;

    if (isMissingLocalImage(img)) {
      const placeholder = createMissingImagePlaceholder(rawSrc);
      img.replaceWith(placeholder);
      return;
    }

    if (!parent || parent.tagName !== 'P') return;
    if (parent.textContent?.trim()) return;
    if (parent.children.length !== 1) return;

    const figure = document.createElement('figure');
    figure.className = 'image-figure';
    for (const key of ['sourceLine', 'sourceEnd'] as const) if (parent.dataset[key]) figure.dataset[key] = parent.dataset[key];
    parent.replaceWith(figure);
    figure.appendChild(img);

    if (caption) {
      const figcaption = document.createElement('figcaption');
      figcaption.textContent = caption;
      figure.appendChild(figcaption);
    }
  });
}

async function enhanceRenderedHtml(html: string, path: string | undefined, assets: AssetUrls, dialect: DocumentMeta['dialect']) {
  const container = document.createElement('div');
  container.innerHTML = DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['srcset', 'autofocus'],
    ADD_TAGS: ['eq', 'eqn'],
    ADD_ATTR: ['data-mermaid'],
  });
  // Preserve KaTeX layout while excluding arbitrary CSS from embedded HTML.
  container.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    if (!element.closest('.katex')) {
      const alignment = element.style.textAlign;
      element.removeAttribute('style');
      if (/^(TH|TD)$/.test(element.tagName) && /^(left|center|right)$/.test(alignment)) {
        element.style.textAlign = alignment;
      }
      return;
    }
    const styles = Array.from(element.style).map((name) => [name, element.style.getPropertyValue(name)]);
    element.removeAttribute('style');
    for (const [name, value] of styles) {
      if (/^(?:height|width|min-width|top|left|margin(?:-(?:left|right|top|bottom))?|padding(?:-(?:left|right|top|bottom))?|vertical-align|font-size|border-(?:bottom|top|right)-width|position)$/.test(name)
        && /^(?:-?\d*\.?\d+(?:em|ex|px|%)|relative|0)(?:\s+-?\d*\.?\d+(?:em|ex|px|%)){0,3}$/.test(value.trim())) {
        element.style.setProperty(name, value);
      }
    }
  });
  if(dialect!=='commonmark'&&dialect!=='gfm')enhanceAlerts(container);
  container.querySelectorAll<HTMLAnchorElement>('.wiki-link[data-wiki-target]').forEach(link=>{
    const target=link.dataset.wikiTarget || '';const [note,...parts]=target.split('#');const fragment=parts.join('#');
    const current=(path||'').split('/').pop()?.replace(/\.(md|markdown)$/i,'').toLowerCase();
    let destination:HTMLElement|null=null;
    if(!note||note.replace(/\.(md|markdown)$/i,'').toLowerCase()===current){
      if(!fragment)destination=container.querySelector<HTMLElement>('[id]');
      else if(fragment.startsWith('^'))destination=Array.from(container.querySelectorAll<HTMLElement>('[id]')).find(element=>element.id==='block-'+fragment.slice(1))||null;
      else destination=Array.from(container.querySelectorAll<HTMLElement>('[id]')).find(element=>element.id===fragment)||Array.from(container.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')).find(heading=>heading.textContent?.replace(/\s*#$/,'').trim()===fragment)||null;
    }
    if(destination){link.href=`#${encodeURIComponent(destination.id)}`;}
    else {link.removeAttribute('href');link.classList.add('unresolved-reference');link.textContent=`引用目标未找到：${target}`;}
    delete link.dataset.wikiTarget;
  });
  enhanceImages(container, path, assets);
  const diagrams = Array.from(container.querySelectorAll<HTMLElement>('.mermaid-diagram'));

  for (const diagram of diagrams) {
    let source = '';

    try {
      source = decodeURIComponent(diagram.dataset.mermaid ?? '').trim();
    } catch {
      source = '';
    }

    if (!source) {
      diagram.remove();
      continue;
    }

    try {
      const id = `mermaid-${Date.now()}-${mermaidId++}`;
      const mermaid = await getMermaid();
      const { svg } = await mermaid.render(id, source);
      diagram.innerHTML = svg;
    } catch (error) {
      cleanupMermaidErrors();
      diagram.innerHTML = `<pre><code>${escapeHtml(source)}</code></pre>`;
      diagram.classList.add('mermaid-error');
      console.error('Mermaid render failed', error);
    }
  }

  return container.innerHTML;
}

export async function renderMarkdownToHtml(markdownSource: string, markdownPath: string | undefined, assets: AssetUrls,
  preferences: DocumentMeta = {}, signal?: AbortSignal): Promise<RenderedDocument> {
  const parsed = await parseWithWorker({ source: markdownSource, path: markdownPath, assets, preferences },
    () => parseMarkdownSyntax(markdownSource, markdownPath, assets, preferences), signal);
  signal?.throwIfAborted();
  if (/<span class="katex(?: |")/.test(parsed.html)) await import('katex/dist/katex.min.css');
  return { meta: parsed.meta, html: await enhanceRenderedHtml(parsed.html, markdownPath, assets, parsed.meta.dialect || preferences.dialect) };
}
