import { waitForImages } from './pagination';
import type { DocumentMeta } from './markdown';
import { pageDimensions } from './settings';
import { QUALITY, type ExportQuality } from './export-settings';
import { pageSize } from './page-size';
import {fontFaceCss} from './fonts';
import {addTextLayer} from './searchable-pdf';
import {addPdfOutline} from './pdf-outline';

function createPdfDocument(pages: string[], meta: DocumentMeta) {
  const host = document.createElement('div');
  host.className = 'pdf-export-host';

  const documentElement = document.createElement('section');
  documentElement.className = 'pdf-document pdf-document-export';
  documentElement.style.height = `${pages.reduce((total,html)=>total+pageSize(html,meta).height,0)}mm`;
  documentElement.style.width = `${Math.max(...pages.map(html=>pageSize(html,meta).width))}mm`;

  for (const pageHtml of pages) {
    const {width,height}=pageSize(pageHtml,meta);
    const page = document.createElement('article');
    page.className = 'pdf-page pdf-page-export';
    page.style.width = `${width}mm`;
    page.style.height = `${height}mm`;
    page.innerHTML = pageHtml;
    documentElement.appendChild(page);
  }

  host.appendChild(documentElement);
  document.body.appendChild(host);
  return documentElement;
}

export async function renderImagePdf(pages: string[], meta: DocumentMeta = {}, options: { searchable?:boolean; quality?: ExportQuality; originalPages?: string[]; originalPageIndices?: number[]; signal?: AbortSignal; progress?: (completed: number, total: number) => void } = {}) {
  let element: HTMLElement | undefined;
  let styleSnapshot: HTMLStyleElement | undefined;

  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'), import('jspdf'),
    ]);
    await document.fonts?.ready;
    options.signal?.throwIfAborted();
    styleSnapshot = document.createElement('style');
    styleSnapshot.dataset.pdfExportStyles = '';
    styleSnapshot.textContent = `${fontFaceCss()}\n${(await embeddedStyles()).join('\n')}`;
    document.head.appendChild(styleSnapshot);
    // Keep the live document's FontFace selection and styles unchanged. The
    // html2canvas style clone has a fresh, enabled sheet (disabled is CSSOM
    // state, not an HTML attribute), with all font/image URLs already embedded.
    if (styleSnapshot.sheet) styleSnapshot.sheet.disabled = true;
    const exportStyles = styleSnapshot;

    const firstSize=pageSize(pages[0] || '',meta);
    const pdf = new jsPDF({
      unit: 'mm',
      format: [firstSize.width, firstSize.height],
      orientation: firstSize.width > firstSize.height ? 'landscape' : 'portrait',
      compress: true,
    });
    pdf.setProperties({title: meta.title || '', author: meta.author || '', subject: meta.subject || '', keywords: meta.keywords || '', creator: 'Md2PDF'});
    const destinations = new Map<string, { pageNumber: number; top: number; magFactor: 'FitH' }>();
    // Measure one page at a time; retain only lightweight link metadata.
    for (const [index, html] of pages.entries()) {
      options.signal?.throwIfAborted();
      element = createPdfDocument([html], meta);
      const page = element.querySelector<HTMLElement>('.pdf-page')!;
      await waitForImages(page, options.signal);
      const bounds = page.getBoundingClientRect();
      const height = pageSize(html,meta).height;
      page.querySelectorAll<HTMLElement>('[id]').forEach((target) => {
        if (!destinations.has(target.id)) destinations.set(target.id, {
          pageNumber: index + 1,
          // jsPDF's XYZ destinations use the final page's height when written.
          // FitH accepts a PDF point coordinate directly, so convert using the
          // destination page's own height and preserve the actual anchor top.
          top: (height - (target.getBoundingClientRect().top - bounds.top) * height / bounds.height) * 72 / 25.4,
          magFactor: 'FitH',
        });
      });
      element.parentElement?.remove(); element = undefined;
    }

    for (const [index, html] of pages.entries()) {
      options.signal?.throwIfAborted();
      element = createPdfDocument([html], meta);
      const pageElement = element.querySelector<HTMLElement>('.pdf-page')!;
      await waitForImages(pageElement, options.signal);
      const canvas = await html2canvas(pageElement, {
        scale: QUALITY[options.quality || 'high'].scale,
        useCORS: true,
        backgroundColor: '#ffffff',
        // Filtering must happen before the about:blank clone is inserted;
        // removing these nodes in onclone would already trigger requests.
        ignoreElements: (node) => {
          const tag = node.tagName.toLowerCase();
          if (tag === 'script' || tag === 'iframe' || tag === 'link') return true;
          return tag === 'style' && node.namespaceURI !== 'http://www.w3.org/2000/svg' && node !== exportStyles;
        },
        onclone: (_document, clonedPage) => {
          // html2canvas freezes computed styles onto SVG definitions. A symbol
          // uses the <use> element's currentColor when instantiated; copying
          // the definition's own computed black color breaks that inheritance.
          const selector = '.infographic-diagram symbol, .infographic-diagram symbol *';
          const originals = pageElement.querySelectorAll<SVGElement>(selector);
          const clones = clonedPage.querySelectorAll<SVGElement>(selector);
          originals.forEach((original, index) => {
            const clone = clones[index];
            if (!clone) return;
            for (const property of ['color', 'fill', 'stroke']) {
              const inline = original.style.getPropertyValue(property);
              if (inline) clone.style.setProperty(property, inline);
              else clone.style.removeProperty(property);
            }
          });
        },
      });
      const imageData = canvas.toDataURL('image/jpeg', QUALITY[options.quality || 'high'].jpeg);
      canvas.width = 0; canvas.height = 0;
      options.signal?.throwIfAborted();

      const { width, height } = pageSize(html,meta);
      if (index > 0) {
        pdf.addPage([width,height], width>height?'landscape':'portrait');
      }

      pdf.addImage(imageData, 'JPEG', 0, 0, width, height);
      if(options.searchable)addTextLayer(pdf,pageElement,width,height);
      const bounds = pageElement.getBoundingClientRect();
      pageElement.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
        if (link.classList.contains('header-anchor')) return;
        const href = link.getAttribute('href') ?? '';
        let options: { url: string } | { pageNumber: number; top: number; magFactor: 'FitH' } | undefined;
        if (href.startsWith('#')) {
          try { options = destinations.get(decodeURIComponent(href.slice(1))); } catch { return; }
        } else if (/^(https?:|mailto:|tel:)/i.test(href)) {
          options = { url: href };
        }
        if (!options) return;
        for (const rect of Array.from(link.getClientRects())) {
          pdf.link((rect.left - bounds.left) * width / bounds.width, (rect.top - bounds.top) * height / bounds.height,
            rect.width * width / bounds.width, rect.height * height / bounds.height, options);
        }
      });
      element.parentElement?.remove(); element = undefined;
      options.progress?.(index + 1, pages.length);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    options.signal?.throwIfAborted();
    addPdfOutline(pdf, pages, options.originalPages ?? pages, options.originalPageIndices);
    return pdf.output('blob');
  } finally {
    element?.parentElement?.remove();
    styleSnapshot?.remove();
  }
}

async function dataUrl(url: string) {
  if (url.startsWith('data:')) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`资源读取失败：${url}`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('资源读取失败。'));
    reader.readAsDataURL(blob);
  });
}

async function embeddedStyles() {
  const resources = new Map<string, Promise<string>>();
  return Promise.all(Array.from(document.styleSheets, async (sheet) => {
    if (sheet.ownerNode instanceof HTMLElement && sheet.ownerNode.hasAttribute('data-pdf-export-styles')) return '';
    let css = '';
    try { css = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n'); }
    catch { throw new Error('无法读取页面样式，请使用同源样式表。'); }
    const matches = [...css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)];
    const urls = new Map<string, string>();
    for (const match of matches) {
      if (/^(data:|#)/.test(match[1])) continue;
      const url = new URL(match[1], sheet.href || location.href);
      if (url.origin !== location.origin) throw new Error('字体资源需要来自当前网站。');
      urls.set(match[0], url.href);
      if (!resources.has(url.href)) resources.set(url.href, dataUrl(url.href));
    }
    for (const [token, url] of urls) css = css.split(token).join(`url("${await resources.get(url)!}")`);
    return css;
  }));
}

async function printHtml(pages: string[], meta: DocumentMeta, title: string) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = pages.map((html,index) => {
    const {width,height}=pageSize(html,meta);
    return `<article class="pdf-page" style="page:sheet${index};width:${width}mm;height:${height}mm">${html}</article>`;
  }).join('');
  const destinations = new Set([...wrapper.querySelectorAll('[id]')].map(target => target.id));
  for (const link of wrapper.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
    let id: string;
    try { id = decodeURIComponent(link.getAttribute('href')!.slice(1)); }
    catch { link.removeAttribute('href'); continue; }
    if (!destinations.has(id)) link.removeAttribute('href');
  }
  await Promise.all(Array.from(wrapper.querySelectorAll('img'), async (img) => {
    try { img.src = await dataUrl(img.src); }
    catch { throw new Error(`图片无法导出：${img.alt || img.src}，请使用本地图片或允许跨域的地址。`); }
    img.removeAttribute('crossorigin');
  }));
  const styles = await embeddedStyles();
  const { width, height } = pageDimensions(meta);
  const namedPages=pages.map((html,index)=>{const size=pageSize(html,meta);return `@page sheet${index}{size:${size.width}mm ${size.height}mm;margin:0}`;}).join('');
  const printStyle = `@page {size:${width}mm ${height}mm;margin:0} ${namedPages} html,body{margin:0;padding:0;height:auto;background:white} *{-webkit-print-color-adjust:exact;print-color-adjust:exact} .pdf-page{display:block;width:${width}mm;height:${height}mm;margin:0;box-shadow:none;transform:none;break-after:page;break-inside:avoid}.pdf-page:last-child{break-after:auto}.header-anchor{visibility:hidden}.pdf-content{overflow:hidden}`;
  const titleElement = document.createElement('title');
  titleElement.textContent = title;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">${titleElement.outerHTML}<style>${fontFaceCss()}\n${styles.join('\n').replace(/<\/style/gi, '<\\/style')}\n${printStyle}</style></head><body>${wrapper.innerHTML}</body></html>`;
}

let activePrintCleanup: (() => void) | undefined;

export async function printPages(pages: string[], meta: DocumentMeta, filename?: string) {
  // Browsers append .pdf to this title when suggesting a save filename.
  const title = filename?.replace(/\.pdf$/i, '') || meta.title || 'Md2PDF';
  const html = await printHtml(pages, meta, title);
  const frame = document.createElement('iframe');
  frame.title = 'PDF 打印文档';
  frame.style.cssText = 'position:fixed;left:-10000px;width:800px;height:1100px;border:0';
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  document.body.appendChild(frame);
  let cleanup = () => frame.remove();
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('打印文档准备超时，请重试。')), 15000);
      frame.onload = () => { clearTimeout(timer); resolve(); }; frame.srcdoc = html;
    });
    await frame.contentDocument!.fonts.ready;
    await waitForImages(frame.contentDocument!.body);
    activePrintCleanup?.();
    const originalTitle = document.title;
    const printWindow = frame.contentWindow!;
    let timer: number;
    cleanup = () => {
      window.clearTimeout(timer);
      printWindow.removeEventListener('afterprint', cleanup);
      window.removeEventListener('afterprint', cleanup);
      if (document.title === title) document.title = originalTitle;
      frame.remove();
      if (activePrintCleanup === cleanup) activePrintCleanup = undefined;
    };
    activePrintCleanup = cleanup;
    printWindow.addEventListener('afterprint', cleanup, { once: true });
    window.addEventListener('afterprint', cleanup, { once: true });
    timer = window.setTimeout(cleanup, 300000);
    // Chromium derives the print job name from the top-level tab title even
    // when window.print() is called by a same-origin iframe.
    document.title = title;
    printWindow.focus();
    printWindow.print();
  } catch (error) { cleanup(); throw error; }
}
