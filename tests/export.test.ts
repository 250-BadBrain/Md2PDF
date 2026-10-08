import { afterEach, describe, expect, it, vi } from 'vitest';

const capture = vi.hoisted(() => ({ options: {} as Record<string, any>, page: undefined as HTMLElement | undefined, snapshot: undefined as HTMLStyleElement | undefined, fail: false }));
vi.mock('../src/pagination', () => ({ waitForImages: async () => {} }));
vi.mock('html2canvas', () => ({ default: async (_page: HTMLElement, options: Record<string, any>) => {
  capture.options = options;
  capture.page = _page;
  capture.snapshot = document.querySelector<HTMLStyleElement>('style[data-pdf-export-styles]')!;
  if (capture.fail) throw new Error('capture failed');
  return { toDataURL: () => 'data:image/jpeg;base64,AA==', width: 10, height: 10 };
} }));
vi.mock('jspdf', () => ({ jsPDF: class {
  setProperties() {} outline = { add: () => ({children:[]}) };
  addImage() {} addPage() {} link() {} output() { return new Blob(['pdf']); }
} }));

import { renderImagePdf } from '../src/export';

afterEach(() => { capture.fail = false; document.head.replaceChildren(); vi.unstubAllGlobals(); });

describe('Image PDF clone isolation', () => {
  it('embeds same-origin styles and deduplicates fonts before cloning without changing live style selection', async () => {
    const original = document.createElement('style');
    original.textContent = '@font-face{font-family:Test;src:url("/fonts/test.woff2") format("woff2")} .pdf-page{color:rgb(10,20,30)} @font-face{font-family:Other;src:url("/fonts/test.woff2") format("woff2")}';
    document.head.append(original);
    // jsdom currently drops the src descriptor from serialized @font-face.
    // Supply the browser CSSOM serialization; actual font loading is covered
    // by the production offline browser test with KaTeX's bundled fonts.
    Object.defineProperty(original.sheet!, 'cssRules', { value: [{ cssText: original.textContent }] });
    const fetchResource = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['font bytes'], { type: 'font/woff2' }) }));
    vi.stubGlobal('fetch', fetchResource);
    await renderImagePdf(['<div class="pdf-content">图表内容</div>']);
    expect(fetchResource).toHaveBeenCalledTimes(1);
    expect(capture.snapshot?.textContent).toContain('data:font/woff2;base64,');
    expect(capture.snapshot?.textContent).not.toContain('/fonts/test.woff2');
    expect(original.sheet?.disabled).not.toBe(true);
    const ignore = capture.options.ignoreElements as (node: Element) => boolean;
    for (const tag of ['script', 'iframe', 'link']) expect(ignore(document.createElement(tag))).toBe(true);
    expect(ignore(original)).toBe(true);
    expect(ignore(capture.snapshot!)).toBe(false);
    expect(ignore(document.createElementNS('http://www.w3.org/2000/svg', 'style'))).toBe(false);
    expect(document.querySelector('[data-pdf-export-styles],.pdf-export-host')).toBeNull();
  });

  it('cleans the disabled stylesheet snapshot and export host when capture fails', async () => {
    capture.fail = true;
    await expect(renderImagePdf(['<div class="pdf-content">内容</div>'])).rejects.toThrow('capture failed');
    expect(document.querySelector('[data-pdf-export-styles],.pdf-export-host')).toBeNull();
  });

  it('restores infographic symbol color inheritance and preserves explicit or unrelated colors', async () => {
    await renderImagePdf(['<div class="pdf-content"><div class="infographic-diagram"><svg><defs><symbol id="icon" stroke="currentColor"><path d="M0 0H24"/><circle r="2" style="stroke:red;fill:blue;color:green"/></symbol></defs><use href="#icon" style="color:white"/><path id="shape" style="fill:orange"/></svg></div><div class="mermaid-diagram"><svg><symbol id="other"><path style="stroke:purple"/></symbol></svg></div></div>']);
    const clone = capture.page!.cloneNode(true) as HTMLElement;
    clone.querySelectorAll<SVGElement>('symbol, symbol *').forEach((node) => { node.style.color = 'black'; node.style.fill = 'black'; node.style.stroke = 'black'; });
    capture.options.onclone(document, clone);
    const symbol = clone.querySelector<SVGElement>('#icon')!;
    expect(symbol.style.color).toBe('');
    expect(symbol.style.stroke).toBe('');
    expect(symbol.getAttribute('stroke')).toBe('currentColor');
    expect(symbol.querySelector<SVGElement>('path')!.style.fill).toBe('');
    const explicit = symbol.querySelector<SVGElement>('circle')!;
    expect([explicit.style.stroke, explicit.style.fill, explicit.style.color]).toEqual(['red', 'blue', 'green']);
    expect(clone.querySelector<SVGElement>('use')!.style.color).toBe('white');
    expect(clone.querySelector<SVGElement>('#shape')!.style.fill).toBe('orange');
    expect(clone.querySelector<SVGElement>('#other path')!.style.stroke).toBe('black');
  });
});
