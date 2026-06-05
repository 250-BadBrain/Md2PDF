import {
  ChangeEvent,
  CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import MarkdownIt from 'markdown-it';
import markdownItAbbr from 'markdown-it-abbr';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItContainer from 'markdown-it-container';
import markdownItDeflist from 'markdown-it-deflist';
import { full as markdownItEmoji } from 'markdown-it-emoji';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItIns from 'markdown-it-ins';
import markdownItMark from 'markdown-it-mark';
import markdownItSub from 'markdown-it-sub';
import markdownItSup from 'markdown-it-sup';
import markdownItTaskLists from 'markdown-it-task-lists';
import markdownItTocDoneRight from 'markdown-it-toc-done-right';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdownLanguage from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import JSZip from 'jszip';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { parse as parseYaml } from 'yaml';

type UploadedMarkdownFile = {
  name: string;
  content: string;
  path?: string;
};

type Mode = 'single' | 'batch';
type AssetUrls = Record<string, string>;
type PageState = {
  page: HTMLElement;
  content: HTMLElement;
  meta: DocumentMeta;
};
type DocumentMeta = {
  title?: string;
  author?: string;
  date?: string;
  header?: string;
  footer?: string;
  pageNumbers?: boolean;
  tocPageNumbers?: boolean;
  chapterNewPage?: boolean;
  chapterLevel?: number;
  margin?: string;
};
type RenderedDocument = {
  html: string;
  meta: DocumentMeta;
};

const A4_WIDTH_PX = (210 / 25.4) * 96;
const A4_HEIGHT_PX = (297 / 25.4) * 96;
const MARKDOWN_IMAGE_PATTERN = /(!\[[^\]]*]\()(\s*<?)([^)\s>]+)(>?\s*(?:["'][^"']*["'])?\))/g;
const PAGE_BREAK_PATTERN = /^\s*(?:<!--\s*pagebreak\s*-->|\[pagebreak]|\{pagebreak}|\f)\s*$/gim;
const PAGE_BREAK_MARKER = 'MD2PDF_PAGE_BREAK_MARKER_7f5b9b2e';
const CONTAINER_TYPES = ['note', 'tip', 'info', 'warning', 'danger', 'success'];
let mermaidId = 0;
let baseMarkdown: MarkdownIt | undefined;
let mathMarkdownPromise: Promise<MarkdownIt> | undefined;
let mermaidPromise: Promise<typeof import('mermaid')['default']> | undefined;

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('css', css);
hljs.registerLanguage('go', go);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdownLanguage);
hljs.registerLanguage('md', markdownLanguage);
hljs.registerLanguage('php', php);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function stringifyMetaValue(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(String).join(' · ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function toBooleanMetaValue(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return !/^(false|0|no|off)$/i.test(String(value).trim());
}

function toNumberMetaValue(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parseFrontMatter(markdownSource: string): { body: string; meta: DocumentMeta } {
  if (!markdownSource.startsWith('---')) {
    return { body: markdownSource, meta: {} };
  }

  const match = markdownSource.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { body: markdownSource, meta: {} };
  }

  let parsed: Record<string, unknown> = {};

  try {
    const yaml = parseYaml(match[1]);
    parsed = yaml && typeof yaml === 'object' && !Array.isArray(yaml) ? yaml : {};
  } catch (error) {
    console.warn('Front matter parse failed', error);
  }

  const meta: DocumentMeta = {
    title: stringifyMetaValue(parsed.title),
    author: stringifyMetaValue(parsed.author),
    date: stringifyMetaValue(parsed.date),
    header: stringifyMetaValue(parsed.header),
    footer: stringifyMetaValue(parsed.footer),
    margin: stringifyMetaValue(parsed.margin),
    pageNumbers: toBooleanMetaValue(parsed.pageNumbers),
    tocPageNumbers: toBooleanMetaValue(parsed.tocPageNumbers),
    chapterNewPage: toBooleanMetaValue(parsed.chapterNewPage),
    chapterLevel: toNumberMetaValue(parsed.chapterLevel),
  };

  return {
    body: markdownSource.slice(match[0].length),
    meta,
  };
}

function humanizeContainerType(type: string) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

const sampleMarkdown = `# Md2PDF 示例

这是一段可以直接编辑的 Markdown 内容，右侧会实时显示分页后的 PDF 预览效果。

## 基础格式

- 支持中文内容
- 支持标题、列表、代码块
- 支持表格

| 项目 | 状态 |
| --- | --- |
| Markdown 编辑 | 可用 |
| PDF 预览 | 实时 |
| 下载导出 | 可用 |

\`\`\`ts
const title = 'Md2PDF';
console.log(title);
\`\`\`
`;

const defaultMarkdown = `# Md2PDF 示例

这是一段可以直接编辑的 Markdown 内容，右侧会实时显示分页后的 PDF 预览效果。

## 基础格式

- 支持中文内容
- 支持标题、列表、代码块
- 支持表格、图片和分页

| 项目 | 状态 |
| --- | --- |
| Markdown 编辑 | 可用 |
| PDF 预览 | 实时 |
| 下载导出 | 可用 |

\`\`\`ts
const title = 'Md2PDF';
console.log(title);
\`\`\`
`;

const cleanDefaultMarkdown = `# Md2PDF 示例

这是一段可以直接编辑的 Markdown 内容，右侧会实时显示分页后的 PDF 预览效果。

## 基础格式

- 支持中文内容
- 支持标题、列表、代码块
- 支持表格、图片和分页

| 项目 | 状态 |
| --- | --- |
| Markdown 编辑 | 可用 |
| PDF 预览 | 实时 |
| 下载导出 | 可用 |

\`\`\`ts
const title = 'Md2PDF';
console.log(title);
\`\`\`
`;

function createMarkdown() {
  const instance = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    typographer: true,
    highlight(code, language): string {
      const normalizedLanguage = language?.trim().toLowerCase();

      if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
        return hljs.highlight(code, {
          language: normalizedLanguage,
          ignoreIllegals: true,
        }).value;
      }

      return escapeHtml(code);
    },
  })
    .use(markdownItAbbr)
    .use(markdownItDeflist)
    .use(markdownItEmoji)
    .use(markdownItIns)
    .use(markdownItMark)
    .use(markdownItSub)
    .use(markdownItSup)
    .use(markdownItContainer, 'note')
    .use(markdownItContainer, 'tip')
    .use(markdownItContainer, 'info')
    .use(markdownItContainer, 'warning')
    .use(markdownItContainer, 'danger')
    .use(markdownItContainer, 'success')
    .use(markdownItTaskLists, {
      enabled: false,
      label: true,
      labelAfter: true,
    })
    .use(markdownItAnchor, {
      slugify,
      permalink: markdownItAnchor.permalink.linkInsideHeader({
        class: 'header-anchor',
        symbol: '#',
        placement: 'after',
        ariaHidden: true,
      }),
    })
    .use(markdownItTocDoneRight, {
      slugify,
      listType: 'ul',
      level: [2, 3],
    })
    .use(markdownItFootnote);
  for (const type of CONTAINER_TYPES) {
    const marker = `container_${type}`;
    instance.renderer.rules[`${marker}_open`] = (tokens, index) => {
      const title = tokens[index].info.trim().slice(type.length).trim() || humanizeContainerType(type);
      return `<section class="md-container md-container-${type}"><strong>${escapeHtml(
        title,
      )}</strong>\n`;
    };
    instance.renderer.rules[`${marker}_close`] = () => '</section>\n';
  }
  const defaultFenceRule = instance.renderer.rules.fence;

  instance.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const language = token.info.trim().split(/\s+/)[0]?.toLowerCase();

    if (language === 'mermaid') {
      return `<div class="mermaid-diagram" data-mermaid="${encodeURIComponent(
        token.content,
      )}"></div>`;
    }

    return defaultFenceRule
      ? defaultFenceRule(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };

  return instance;
}

function containsMathSyntax(markdownSource: string) {
  return /(^|\s)\$\$[\s\S]+?\$\$|(^|[^\\$])\$[^$\n]+\$/m.test(markdownSource);
}

async function getMarkdown(markdownSource: string) {
  if (!containsMathSyntax(markdownSource)) {
    baseMarkdown ??= createMarkdown();
    return baseMarkdown;
  }

  mathMarkdownPromise ??= Promise.all([
    import('markdown-it-texmath'),
    import('katex'),
    import('katex/dist/katex.min.css'),
  ]).then(([texmathModule, katexModule]) =>
    createMarkdown().use(texmathModule.default, {
      engine: katexModule.default,
      delimiters: 'dollars',
    }),
  );

  return mathMarkdownPromise;
}

function getMermaid() {
  mermaidPromise ??= import('mermaid').then((module) => {
    module.default.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'default',
    });
    return module.default;
  });

  return mermaidPromise;
}

function getPdfName(fileName?: string) {
  if (!fileName) return 'document.pdf';
  const withoutExt = fileName.replace(/\.(md|markdown|txt)$/i, '');
  return `${withoutExt || 'document'}.pdf`;
}

function normalizePath(path: string) {
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

function getFilePath(file: File) {
  const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return normalizePath(path || file.name);
}

function getDirectoryName(path?: string) {
  if (!path) return '';
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(0, index) : '';
}

function isMarkdownFile(file: File) {
  return /\.(md|markdown|txt)$/i.test(file.name);
}

function isImageFile(file: File) {
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

  if (!cleanSrc || isExternalResource(cleanSrc)) {
    return cleanSrc;
  }

  let decodedSrc = cleanSrc;
  try {
    decodedSrc = decodeURIComponent(cleanSrc);
  } catch {
    decodedSrc = cleanSrc;
  }
  const candidates = [
    normalizePath(`${getDirectoryName(markdownPath)}/${decodedSrc}`),
    normalizePath(decodedSrc),
  ];

  for (const candidate of candidates) {
    const url = assets[candidate.toLowerCase()];
    if (url) return url;
  }

  return cleanSrc;
}

function resolveMarkdownAssets(
  markdownSource: string,
  markdownPath: string | undefined,
  assets: AssetUrls,
) {
  return markdownSource.replace(
    MARKDOWN_IMAGE_PATTERN,
    (_match, start: string, prefix: string, src: string, suffix: string) =>
      `${start}${prefix}${resolveAssetUrl(src, markdownPath, assets)}${suffix}`,
  );
}

function markPageBreaks(markdownSource: string) {
  return markdownSource.replace(PAGE_BREAK_PATTERN, `\n\n${PAGE_BREAK_MARKER}\n\n`);
}

function cleanupMermaidErrors() {
  document
    .querySelectorAll<HTMLElement>('.mermaid .error-icon, .mermaid .error-text')
    .forEach((element) => element.closest('svg')?.remove());
}

function enhanceAlerts(container: HTMLElement) {
  container.querySelectorAll('blockquote').forEach((blockquote) => {
    const firstParagraph = blockquote.querySelector('p');
    const text = firstParagraph?.textContent?.trim() ?? '';
    const match = text.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)]\s*/i);

    if (!match || !firstParagraph) return;

    const type = match[1].toLowerCase();
    const label = humanizeContainerType(type === 'caution' ? 'danger' : type);
    const firstText = firstParagraph.textContent ?? '';
    firstParagraph.textContent = firstText.replace(match[0], '').trim();
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
  const placeholder = document.createElement('div');
  placeholder.className = 'missing-image';
  placeholder.textContent = `图片未找到：${src}`;
  return placeholder;
}

function enhancePageBreaks(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('p').forEach((paragraph) => {
    if (paragraph.textContent?.trim() !== PAGE_BREAK_MARKER) return;

    const pageBreak = document.createElement('div');
    pageBreak.className = 'page-break';
    paragraph.replaceWith(pageBreak);
  });
}

function enhanceImages(container: HTMLElement) {
  container.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    const rawSrc = img.getAttribute('src') ?? '';
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
    parent.replaceWith(figure);
    figure.appendChild(img);

    if (caption) {
      const figcaption = document.createElement('figcaption');
      figcaption.textContent = caption;
      figure.appendChild(figcaption);
    }
  });
}

async function enhanceRenderedHtml(html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  enhancePageBreaks(container);
  enhanceAlerts(container);
  enhanceImages(container);
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

async function renderMarkdownToHtml(
  markdownSource: string,
  markdownPath: string | undefined,
  assets: AssetUrls,
) : Promise<RenderedDocument> {
  const { body, meta } = parseFrontMatter(markdownSource);
  const markdownWithAssets = resolveMarkdownAssets(body, markdownPath, assets);
  const markdownWithPageBreaks = markPageBreaks(markdownWithAssets);
  const renderer = await getMarkdown(markdownWithPageBreaks);
  const html = await enhanceRenderedHtml(renderer.render(markdownWithPageBreaks));

  return { html, meta };
}

function isOverflowing(content: HTMLElement) {
  return content.scrollHeight > content.clientHeight + 1;
}

function expandPageTemplate(template: string, meta: DocumentMeta, page: string, total: string) {
  return template
    .replace(/\{title}/g, meta.title ?? '')
    .replace(/\{author}/g, meta.author ?? '')
    .replace(/\{date}/g, meta.date ?? '')
    .replace(/\{page}/g, page)
    .replace(/\{total}/g, total)
    .replace(/__PAGE__/g, page)
    .replace(/__TOTAL__/g, total);
}

async function waitForImages(element: HTMLElement) {
  const images = Array.from(element.querySelectorAll('img'));

  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }

          image.onload = () => resolve();
          image.onerror = () => resolve();
        }),
    ),
  );
}

function createPage(meta: DocumentMeta = {}, className = 'pdf-page') {
  const page = document.createElement('article');
  page.className = className;
  if (meta.margin) {
    page.style.setProperty('--pdf-page-margin', meta.margin);
  }

  if (meta.header || meta.title || meta.author || meta.date) {
    const header = document.createElement('div');
    header.className = 'pdf-page-header';
    header.textContent = meta.header || [meta.title, meta.author, meta.date].filter(Boolean).join(' · ');
    {
      const headerTemplate = meta.header || [meta.title, meta.author, meta.date].filter(Boolean).join(' · ');
      header.textContent = expandPageTemplate(headerTemplate, meta, '__PAGE__', '__TOTAL__');
    }
    page.appendChild(header);
  }

  const content = document.createElement('div');
  content.className = 'pdf-content markdown-body';
  page.appendChild(content);

  if (meta.footer || meta.pageNumbers) {
    const footer = document.createElement('div');
    footer.className = 'pdf-page-footer';
    footer.innerHTML = `${escapeHtml(meta.footer || '')}${
      meta.pageNumbers ? '<span class="page-number">__PAGE__ / __TOTAL__</span>' : ''
    }`;
    {
      const footerTemplate = expandPageTemplate(meta.footer || '', meta, '__PAGE__', '__TOTAL__');
      footer.innerHTML = `${escapeHtml(footerTemplate)}${
        meta.pageNumbers ? '<span class="page-number">__PAGE__ / __TOTAL__</span>' : ''
      }`;
    }
    page.appendChild(footer);
  }

  return { page, content, meta };
}

function appendPage(
  pages: string[],
  state: PageState,
) {
  pages.push(state.page.innerHTML);
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
      if (!pageNumber || link.querySelector('.toc-page-number')) return;

      const number = document.createElement('span');
      number.className = 'toc-page-number';
      number.textContent = String(pageNumber);
      link.appendChild(number);
    });

    return wrapper.innerHTML;
  });
}

function finalizePages(pages: string[], meta: DocumentMeta) {
  const pagesWithTocNumbers = meta.tocPageNumbers === false ? pages : addTocPageNumbers(pages);

  return pagesWithTocNumbers.map((page, index) =>
    expandPageTemplate(page, meta, String(index + 1), String(pagesWithTocNumbers.length)),
  );
}

function appendNodeToPages(
  node: Element,
  pages: string[],
  state: PageState,
) {
  const clone = node.cloneNode(true) as HTMLElement;
  state.content.appendChild(clone);

  if (!isOverflowing(state.content) || state.content.children.length === 1) {
    return state;
  }

  clone.remove();
  appendPage(pages, state);
  const nextState = createPage(state.meta, 'pdf-page pdf-page-measure');
  state.page.parentElement?.appendChild(nextState.page);
  nextState.content.appendChild(clone);
  return nextState;
}

function startNewPageIfNeeded(pages: string[], state: PageState) {
  if (state.content.children.length === 0) return state;

  appendPage(pages, state);
  const nextState = createPage(state.meta, 'pdf-page pdf-page-measure');
  state.page.parentElement?.appendChild(nextState.page);
  return nextState;
}

function shouldStartChapterOnNewPage(node: Element, state: PageState) {
  if (!state.meta.chapterNewPage || state.content.children.length === 0) return false;

  const level = Number(node.tagName.slice(1));
  const maxLevel = state.meta.chapterLevel ?? 2;
  return /^H[1-6]$/.test(node.tagName) && level <= maxLevel;
}

function createTableShell(table: HTMLTableElement) {
  const tableClone = table.cloneNode(false) as HTMLTableElement;
  const thead = table.querySelector('thead');

  if (thead) {
    tableClone.appendChild(thead.cloneNode(true));
  }

  const tbody = document.createElement('tbody');
  tableClone.appendChild(tbody);

  return { table: tableClone, tbody };
}

function appendTableToPages(
  table: HTMLTableElement,
  pages: string[],
  state: PageState,
) {
  const headerRows = new Set(
    Array.from(table.querySelectorAll('thead tr')) as HTMLTableRowElement[],
  );
  const rows = (Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[])
    .filter((row) => !headerRows.has(row));

  if (rows.length === 0) {
    return appendNodeToPages(table, pages, state);
  }

  let tableState = createTableShell(table);
  state.content.appendChild(tableState.table);

  for (const row of rows) {
    const rowClone = row.cloneNode(true) as HTMLTableRowElement;
    tableState.tbody.appendChild(rowClone);

    if (
      isOverflowing(state.content) &&
      tableState.tbody.children.length === 1 &&
      state.content.children.length > 1
    ) {
      tableState.table.remove();
      appendPage(pages, state);

      state = createPage(state.meta, 'pdf-page pdf-page-measure');
      table.parentElement?.parentElement?.appendChild(state.page);
      tableState = createTableShell(table);
      state.content.appendChild(tableState.table);
      tableState.tbody.appendChild(row.cloneNode(true));
      continue;
    }

    if (!isOverflowing(state.content) || tableState.tbody.children.length === 1) {
      continue;
    }

    rowClone.remove();
    appendPage(pages, state);

    state = createPage(state.meta, 'pdf-page pdf-page-measure');
    table.parentElement?.parentElement?.appendChild(state.page);
    tableState = createTableShell(table);
    state.content.appendChild(tableState.table);
    tableState.tbody.appendChild(row.cloneNode(true));
  }

  return state;
}

async function paginateHtml(html: string, meta: DocumentMeta = {}) {
  await document.fonts?.ready;

  const host = document.createElement('div');
  host.className = 'pagination-host';

  const source = document.createElement('div');
  source.className = 'markdown-body';
  source.innerHTML = html;

  host.appendChild(source);
  document.body.appendChild(host);

  try {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await waitForImages(source);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const pages: string[] = [];
    let state: PageState = createPage(meta, 'pdf-page pdf-page-measure');
    host.appendChild(state.page);

    for (const node of Array.from(source.children)) {
      if (node instanceof HTMLElement && node.classList.contains('page-break')) {
        state = startNewPageIfNeeded(pages, state);
      } else if (shouldStartChapterOnNewPage(node, state)) {
        state = startNewPageIfNeeded(pages, state);
        state = appendNodeToPages(node, pages, state);
      } else if (node instanceof HTMLTableElement) {
        state = appendTableToPages(node, pages, state);
      } else {
        state = appendNodeToPages(node, pages, state);
      }
    }

    appendPage(pages, state);
    const nextPages = pages.length > 0 ? pages : [createPage(meta).page.innerHTML];
    return finalizePages(nextPages, meta);
  } finally {
    host.remove();
  }
}

function createPdfDocument(pages: string[]) {
  const host = document.createElement('div');
  host.className = 'pdf-export-host';

  const documentElement = document.createElement('section');
  documentElement.className = 'pdf-document pdf-document-export';
  documentElement.style.height = `${pages.length * 297}mm`;

  for (const pageHtml of pages) {
    const page = document.createElement('article');
    page.className = 'pdf-page pdf-page-export';
    page.innerHTML = pageHtml;
    documentElement.appendChild(page);
  }

  host.appendChild(documentElement);
  document.body.appendChild(host);
  return documentElement;
}

async function renderPdfBlobFromPages(pages: string[]) {
  const element = createPdfDocument(pages);

  try {
    await document.fonts?.ready;
    await waitForImages(element);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const pdf = new jsPDF({
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait',
      compress: true,
    });
    const pageElements = Array.from(
      element.querySelectorAll<HTMLElement>('.pdf-page'),
    );

    for (const [index, pageElement] of pageElements.entries()) {
      const canvas = await html2canvas(pageElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const imageData = canvas.toDataURL('image/jpeg', 0.98);

      if (index > 0) {
        pdf.addPage('a4', 'portrait');
      }

      pdf.addImage(imageData, 'JPEG', 0, 0, 210, 297);
    }

    return pdf.output('blob');
  } finally {
    element.parentElement?.remove();
  }
}

async function renderPdfBlob(document: RenderedDocument) {
  const pages = await paginateHtml(document.html, document.meta);
  return renderPdfBlobFromPages(pages);
}

async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function App() {
  const [mode, setMode] = useState<Mode>('single');
  const [source, setSource] = useState(cleanDefaultMarkdown || defaultMarkdown || sampleMarkdown);
  const [singleFileName, setSingleFileName] = useState<string>();
  const [singleFilePath, setSingleFilePath] = useState<string>();
  const [batchFiles, setBatchFiles] = useState<UploadedMarkdownFile[]>([]);
  const [assetUrls, setAssetUrls] = useState<AssetUrls>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [batchErrorMessage, setBatchErrorMessage] = useState('');
  const [previewErrorMessage, setPreviewErrorMessage] = useState('');
  const [pages, setPages] = useState<string[]>([]);
  const [previewScale, setPreviewScale] = useState(0.7);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const assetUrlsRef = useRef<AssetUrls>({});
  const previewPanelRef = useRef<HTMLElement>(null);

  const canDownload =
    !isDownloading &&
    ((mode === 'single' && source.trim().length > 0 && pages.length > 0) ||
      (mode === 'batch' && batchFiles.length > 0));

  useLayoutEffect(() => {
    if (mode !== 'single' || source.trim().length === 0) {
      setPages([]);
      setPreviewErrorMessage('');
      return;
    }

    let cancelled = false;
    setPreviewErrorMessage('');
    setPages([]);

    void renderMarkdownToHtml(source, singleFilePath, assetUrls)
      .then(async (document) => {
        const nextPages = await paginateHtml(document.html, document.meta);

        if (!cancelled) {
          setPages(nextPages);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPages([]);
          setPreviewErrorMessage('Markdown 渲染失败，请检查语法或控制台错误。');
        }
        console.error('Preview render failed', error);
      });

    return () => {
      cancelled = true;
    };
  }, [assetUrls, mode, singleFilePath, source]);

  useLayoutEffect(() => {
    const panel = previewPanelRef.current;
    if (!panel) return;

    const updateScale = () => {
      const availableWidth = panel.clientWidth - 40;
      setPreviewScale(Math.min(1, Math.max(0.35, availableWidth / A4_WIDTH_PX)));
    };
    const observer = new ResizeObserver(updateScale);

    updateScale();
    observer.observe(panel);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      Object.values(assetUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function replaceAssetUrls(nextAssetUrls: AssetUrls) {
    Object.values(assetUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    assetUrlsRef.current = nextAssetUrls;
    setAssetUrls(nextAssetUrls);
  }

  function createAssetUrls(files: File[]) {
    return files.reduce<AssetUrls>((urls, file) => {
      if (!isImageFile(file)) return urls;
      urls[getFilePath(file).toLowerCase()] = URL.createObjectURL(file);
      return urls;
    }, {});
  }

  async function readMarkdownFiles(files: File[]) {
    const markdownFiles = files.filter(isMarkdownFile);

    return Promise.all(
      markdownFiles.map(async (file) => ({
        name: file.name,
        path: getFilePath(file),
        content: await file.text(),
      })),
    );
  }

  function applyLoadedMarkdownFiles(
    loadedFiles: UploadedMarkdownFile[],
    nextAssetUrls: AssetUrls,
  ) {
    setBatchErrorMessage('');
    replaceAssetUrls(nextAssetUrls);

    if (loadedFiles.length === 1) {
      setMode('single');
      setBatchFiles([]);
      setSingleFileName(loadedFiles[0].name);
      setSingleFilePath(loadedFiles[0].path);
      setSource(loadedFiles[0].content);
      return;
    }

    setMode('batch');
    setBatchFiles(loadedFiles);
    setSingleFilePath(undefined);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const selectedFiles = Array.from(files);
    const loadedFiles = await readMarkdownFiles(selectedFiles);
    event.target.value = '';

    if (loadedFiles.length === 0) return;

    applyLoadedMarkdownFiles(loadedFiles, createAssetUrls(selectedFiles));
  }

  async function handleFolderUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const selectedFiles = Array.from(files);
    const loadedFiles = await readMarkdownFiles(selectedFiles);
    event.target.value = '';

    if (loadedFiles.length === 0) return;

    applyLoadedMarkdownFiles(loadedFiles, createAssetUrls(selectedFiles));
  }

  function handleSourceChange(value: string) {
    setBatchErrorMessage('');
    setMode('single');
    setBatchFiles([]);
    setSource(value);
  }

  function handleBackToEditor() {
    setBatchErrorMessage('');
    setMode('single');
    setBatchFiles([]);
  }

  async function downloadSinglePdf() {
    setDownloadProgress(35);
    const filename = getPdfName(singleFileName);
    const blob = await renderPdfBlobFromPages(pages);
    setDownloadProgress(90);
    await downloadBlob(blob, filename);
  }

  async function downloadBatchZip() {
    const zip = new JSZip();
    const failedFiles: string[] = [];

    setBatchErrorMessage('');

    for (const [index, file] of batchFiles.entries()) {
      try {
        const document = await renderMarkdownToHtml(file.content, file.path, assetUrls);
        const pdfName = getPdfName(file.name);
        const blob = await renderPdfBlob(document);
        zip.file(pdfName, blob);
      } catch (error) {
        failedFiles.push(file.name);
        console.error(`Batch export failed: ${file.name}`, error);
      } finally {
        setDownloadProgress(Math.round(((index + 1) / batchFiles.length) * 85));
      }
    }

    if (failedFiles.length === batchFiles.length) {
      throw new Error('所有 Markdown 文件都导出失败，请检查文件内容后重试。');
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    setDownloadProgress(95);
    await downloadBlob(zipBlob, 'md2pdf-batch.zip');

    if (failedFiles.length > 0) {
      setBatchErrorMessage(`以下文件导出失败：${failedFiles.join('、')}`);
    }
  }

  async function handleDownload() {
    if (!canDownload) return;
    setIsDownloading(true);
    setDownloadProgress(8);

    try {
      if (mode === 'batch') {
        await downloadBatchZip();
      } else {
        await downloadSinglePdf();
      }
      setDownloadProgress(100);
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出失败，请稍后重试。';
      if (mode === 'batch') {
        setBatchErrorMessage(message);
      }
      console.error('Download failed', error);
    } finally {
      window.setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);
      }, 180);
    }
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <h1>Md2PDF</h1>
        <div className="actions">
          <button type="button" onClick={() => inputRef.current?.click()}>
            上传
          </button>
          <button type="button" onClick={() => folderInputRef.current?.click()}>
            上传文件夹
          </button>
          <button
            type="button"
            className={`download-button${isDownloading ? ' is-loading' : ''}`}
            onClick={handleDownload}
            disabled={!canDownload}
            aria-label={isDownloading ? '正在导出 PDF' : '下载'}
            title={isDownloading ? `正在导出 ${downloadProgress}%` : undefined}
            style={{ '--download-progress': `${downloadProgress}%` } as CSSProperties}
          >
            {isDownloading ? <span className="download-spinner" /> : '下载'}
          </button>
          <input
            ref={inputRef}
            className="file-input"
            type="file"
            multiple
            accept=".md,.markdown,text/markdown,text/plain"
            onChange={handleUpload}
          />
          <input
            ref={folderInputRef}
            className="file-input"
            type="file"
            multiple
            onChange={handleFolderUpload}
            {...{ webkitdirectory: '', directory: '' }}
          />
        </div>
      </header>

      {mode === 'batch' ? (
        <section className="batch-message">
          <p>已上传多个 Markdown 文件，可点击下载批量导出 PDF</p>
          {batchErrorMessage ? <p className="batch-error">{batchErrorMessage}</p> : null}
          <button type="button" onClick={handleBackToEditor}>
            返回
          </button>
        </section>
      ) : (
        <section className="workspace">
          <textarea
            className="editor"
            value={source}
            onChange={(event) => handleSourceChange(event.target.value)}
            spellCheck={false}
            aria-label="Markdown 源代码编辑区"
          />
          <section
            className="preview-panel"
            aria-label="PDF 预览区"
            ref={previewPanelRef}
          >
            {previewErrorMessage ? (
              <div className="preview-error">{previewErrorMessage}</div>
            ) : null}
            <div className="pdf-document pdf-document-preview">
              {pages.map((pageHtml, index) => (
                <div
                  className="pdf-page-shell"
                  key={`${index}-${pageHtml.length}`}
                  style={{
                    height: A4_HEIGHT_PX * previewScale,
                    width: A4_WIDTH_PX * previewScale,
                  }}
                >
                  <article
                    className="pdf-page"
                    style={{ transform: `scale(${previewScale})` }}
                    dangerouslySetInnerHTML={{ __html: pageHtml }}
                  />
                </div>
              ))}
            </div>
          </section>
        </section>
      )}
    </main>
  );
}

export default App;
