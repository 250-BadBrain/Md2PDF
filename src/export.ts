import { waitForImages } from './pagination';
import type { DocumentMeta } from './markdown';
import { pageDimensions } from './settings';
import { QUALITY, type ExportQuality } from './export-settings';
import { pageSize } from './page-size';

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

export async function renderImagePdf(pages: string[], meta: DocumentMeta = {}, options: { quality?: ExportQuality; signal?: AbortSignal; progress?: (completed: number, total: number) => void } = {}) {
  let element: HTMLElement | undefined;

  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'), import('jspdf'),
    ]);
    await document.fonts?.ready;

    const firstSize=pageSize(pages[0] || '',meta);
    const pdf = new jsPDF({
      unit: 'mm',
      format: [firstSize.width, firstSize.height],
      orientation: firstSize.width > firstSize.height ? 'landscape' : 'portrait',
      compress: true,
    });
    const destinations = new Map<string, { pageNumber: number; top: number }>();
    // Measure one page at a time; retain only lightweight link metadata.
    for (const [index, html] of pages.entries()) {
      options.signal?.throwIfAborted();
      element = createPdfDocument([html], meta);
      const page = element.querySelector<HTMLElement>('.pdf-page')!;
      await waitForImages(page, options.signal);
      const bounds = page.getBoundingClientRect();
      page.querySelectorAll<HTMLElement>('[id]').forEach((target) => {
        if (!destinations.has(target.id)) destinations.set(target.id, {
          pageNumber: index + 1,
          top: (target.getBoundingClientRect().top - bounds.top) * pageSize(html,meta).height / bounds.height,
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
      });
      const imageData = canvas.toDataURL('image/jpeg', QUALITY[options.quality || 'high'].jpeg);
      canvas.width = 0; canvas.height = 0;
      options.signal?.throwIfAborted();

      const { width, height } = pageSize(html,meta);
      if (index > 0) {
        pdf.addPage([width,height], width>height?'landscape':'portrait');
      }

      pdf.addImage(imageData, 'JPEG', 0, 0, width, height);
      const bounds = pageElement.getBoundingClientRect();
      pageElement.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
        const href = link.getAttribute('href') ?? '';
        let options: { url: string } | { pageNumber: number; top: number } | undefined;
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

    return pdf.output('blob');
  } finally {
    element?.parentElement?.remove();
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

async function printHtml(pages: string[], meta: DocumentMeta) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = pages.map((html,index) => {
    const {width,height}=pageSize(html,meta);
    return `<article class="pdf-page" style="page:sheet${index};width:${width}mm;height:${height}mm">${html}</article>`;
  }).join('');
  await Promise.all(Array.from(wrapper.querySelectorAll('img'), async (img) => {
    try { img.src = await dataUrl(img.src); }
    catch { throw new Error(`图片无法导出：${img.alt || img.src}，请使用本地图片或允许跨域的地址。`); }
    img.removeAttribute('crossorigin');
  }));
  const styles = await Promise.all(Array.from(document.styleSheets, async (sheet) => {
    let css = '';
    try { css = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n'); }
    catch { throw new Error('无法读取页面样式，请使用同源样式表。'); }
    const matches = [...css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)];
    for (const match of matches) {
      if (/^(data:|#)/.test(match[1])) continue;
      const url = new URL(match[1], sheet.href || location.href);
      if (url.origin !== location.origin) throw new Error('字体资源需要来自当前网站。');
      css = css.split(match[0]).join(`url("${await dataUrl(url.href)}")`);
    }
    return css;
  }));
  const { width, height } = pageDimensions(meta);
  const namedPages=pages.map((html,index)=>{const size=pageSize(html,meta);return `@page sheet${index}{size:${size.width}mm ${size.height}mm;margin:0}`;}).join('');
  const printStyle = `@page {size:${width}mm ${height}mm;margin:0} ${namedPages} html,body{margin:0;padding:0;height:auto;background:white} *{-webkit-print-color-adjust:exact;print-color-adjust:exact} .pdf-page{display:block;width:${width}mm;height:${height}mm;margin:0;box-shadow:none;transform:none;break-after:page;break-inside:avoid}.pdf-page:last-child{break-after:auto}.header-anchor{visibility:hidden}.pdf-content{overflow:hidden}`;
  const title = (meta.title || 'Md2PDF').replace(/[<>&"]/g, '');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title><style>${styles.join('\n').replace(/<\/style/gi, '<\\/style')}\n${printStyle}</style></head><body>${wrapper.innerHTML}</body></html>`;
}

export async function printPages(pages: string[], meta: DocumentMeta) {
  const html = await printHtml(pages, meta);
  const frame = document.createElement('iframe');
  frame.title = 'PDF 打印文档';
  frame.style.cssText = 'position:fixed;left:-10000px;width:800px;height:1100px;border:0';
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('打印文档准备超时，请重试。')), 15000);
      frame.onload = () => { clearTimeout(timer); resolve(); }; frame.srcdoc = html;
    });
    await frame.contentDocument!.fonts.ready;
    await waitForImages(frame.contentDocument!.body);
    frame.contentWindow!.addEventListener('afterprint', () => frame.remove(), { once: true });
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    window.setTimeout(() => frame.remove(), 300000);
  } catch (error) { frame.remove(); throw error; }
}
