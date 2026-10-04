import { useEffect, useRef, useState } from 'react';
import type { DocumentMeta } from './markdown';
import { pageDimensions } from './settings';

export function PagePreview({ pages, meta, scale, panel }: {
  pages: string[]; meta: DocumentMeta; scale: number; panel: HTMLElement | null;
}) {
  const { width, height } = pageDimensions(meta);
  const pageHeight = height / 25.4 * 96 * scale;
  const [scroll, setScroll] = useState(0);
  const [viewport, setViewport] = useState(800);
  const [target, setTarget] = useState(1);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!panel) return;
    const update = () => { setScroll(panel.scrollTop); setViewport(panel.clientHeight); };
    panel.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update); observer.observe(panel); update();
    return () => { panel.removeEventListener('scroll', update); observer.disconnect(); };
  }, [panel]);
  const start = Math.max(0, Math.floor(scroll / (pageHeight + 20)) - 2);
  const end = Math.min(pages.length, Math.ceil((scroll + viewport) / (pageHeight + 20)) + 2);
  const jump = (index: number) => {
    const shell = host.current?.children[index] as HTMLElement | undefined;
    if (panel && shell) panel.scrollTop = shell.offsetTop - panel.offsetTop - 20;
  };
  return <>
    {pages.length > 1 ? <div className="page-navigation">
      <span>共 {pages.length} 页</span>
      <label>跳至 <input aria-label="跳转页码" type="number" min={1} max={pages.length} value={target}
        onChange={(event) => setTarget(Math.max(1, Math.min(pages.length, Number(event.target.value) || 1)))} /></label>
      <button type="button" onClick={() => jump(target - 1)}>跳转</button>
    </div> : null}
    <div ref={host} className="pdf-document pdf-document-preview" onClick={(event) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!link) return;
      let id: string;
      try { id = decodeURIComponent(link.getAttribute('href')!.slice(1)); } catch { return; }
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const index = pages.findIndex((html) => new RegExp(`id=["']${escaped}["']`).test(html));
      if (index >= 0) {
        event.preventDefault(); jump(index);
        window.setTimeout(() => {
          const destination = host.current?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
          destination?.scrollIntoView({ block: 'start' });
        }, 60);
      }
    }}>
      {pages.map((html, index) => <div className="pdf-page-shell" key={index} data-page={index + 1}
        style={{ height: pageHeight, width: width / 25.4 * 96 * scale }}>
        {index >= start && index < end ? <article className="pdf-page" style={{ width: `${width}mm`, height: `${height}mm`, transform: `scale(${scale})` }}
          dangerouslySetInnerHTML={{ __html: html }} /> : <div className="page-placeholder">第 {index + 1} 页</div>}
      </div>)}
    </div>
  </>;
}
