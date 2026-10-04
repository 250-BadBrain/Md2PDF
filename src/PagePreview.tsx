import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentMeta } from './markdown';
import { pageSize } from './page-size';
import { navigateToSource, sourceLocation } from './source-map';

export function PagePreview({ pages, meta, scale, panel }: {
  pages: string[]; meta: DocumentMeta; scale: number; panel: HTMLElement | null;
}) {
  const sizes=pages.map(html=>pageSize(html,meta));
  const offsets:number[]=[];let total=0;
  const heights=sizes.map(size=>size.height/25.4*96*scale);
  heights.forEach(height=>{offsets.push(total);total+=height+20;});
  const [scroll, setScroll] = useState(0);
  const [viewport, setViewport] = useState(800);
  const [target, setTarget] = useState(1);
  const host = useRef<HTMLDivElement>(null);
  const mappings=useMemo(()=>pages.flatMap((html,index)=>{
    const template=document.createElement('template');template.innerHTML=html;
    return Array.from(template.content.querySelectorAll<HTMLElement>('[data-source-line]'),element=>({index,line:Number(element.dataset.sourceLine),end:Number(element.dataset.sourceEnd)}));
  }),[pages]);
  useEffect(() => {
    if (!panel) return;
    const update = () => { setScroll(panel.scrollTop); setViewport(panel.clientHeight); };
    panel.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update); observer.observe(panel); update();
    return () => { panel.removeEventListener('scroll', update); observer.disconnect(); };
  }, [panel]);
  useEffect(() => {
    const locate = (event: Event) => {
      const line = (event as CustomEvent<number>).detail;
      const index=mappings.find(block=>block.line<=line&&block.end>=line)?.index ?? mappings.find(block=>block.line>=line)?.index ?? mappings[mappings.length-1]?.index ?? -1;
      if (index < 0 || !panel) return;
      jump(index);
      window.setTimeout(() => {
        const blocks = Array.from(host.current?.children[index]?.querySelectorAll<HTMLElement>('[data-source-line]') || []);
        const block = blocks.filter((element) => Number(element.dataset.sourceLine) <= line && Number(element.dataset.sourceEnd) >= line).sort((a,b) => Number(b.dataset.sourceLine) - Number(a.dataset.sourceLine))[0];
        if (block) panel.scrollTop += block.getBoundingClientRect().top - panel.getBoundingClientRect().top - 40;
      }, 30);
    };
    window.addEventListener('preview-navigation', locate); return () => window.removeEventListener('preview-navigation', locate);
  }, [mappings, panel, scale]);
  const first=offsets.findIndex((top,index)=>top+heights[index]>=scroll);
  const last=offsets.findIndex(top=>top>scroll+viewport);
  const start=Math.max(0,(first<0?pages.length-1:first)-2);
  const end=Math.min(pages.length,(last<0?pages.length:last)+2);
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
      if (!link) { const location = sourceLocation(event.target as Element); if (location) navigateToSource(location); return; }
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
        style={{ height: heights[index], width: sizes[index].width / 25.4 * 96 * scale }}>
        {index >= start && index < end ? <article className="pdf-page" style={{ width: `${sizes[index].width}mm`, height: `${sizes[index].height}mm`, transform: `scale(${scale})` }}
          dangerouslySetInnerHTML={{ __html: html }} /> : <div className="page-placeholder">第 {index + 1} 页</div>}
      </div>)}
    </div>
  </>;
}
