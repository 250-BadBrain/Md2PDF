import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DocumentMeta } from './markdown';
import { pageSize } from './page-size';
import { navigateToSource, setSyncedScroll, sourceLocation, type PreviewScroll } from './source-map';

type Navigation = { index: number; pages: string[]; id?: string; line?: number; sync?: boolean; edge?: PreviewScroll['edge'] };

export function PagePreview({ pages, meta, scale, panel, panelChanged, busy, controls, currentPageChanged }: {
  pages: string[]; meta: DocumentMeta; scale: number; panel: HTMLElement | null;
  panelChanged: (element: HTMLDivElement | null) => void; busy: boolean; controls?: ReactNode;
  currentPageChanged?: (page: number) => void;
}) {
  const { sizes, heights, offsets } = useMemo(() => {
    const sizes = pages.map(html => pageSize(html, meta));
    const heights = sizes.map(size => size.height / 25.4 * 96 * scale);
    const offsets: number[] = [];
    let total = 0;
    heights.forEach(height => { offsets.push(total); total += height + 20; });
    return { sizes, heights, offsets };
  }, [pages, meta, scale]);
  const [scroll, setScroll] = useState(0);
  const [viewport, setViewport] = useState(800);
  const [target, setTarget] = useState('1');
  const [navigation, setNavigation] = useState<Navigation | null>(null);
  useEffect(() => {
    setTarget(value => {
      const number = Number(value);
      return Number.isInteger(number) && number > pages.length ? String(Math.max(1, pages.length)) : value;
    });
  }, [pages.length]);
  const targetPage = Number(target);
  const canJump = Number.isInteger(targetPage) && targetPage >= 1 && targetPage <= pages.length;
  const host = useRef<HTMLDivElement>(null);
  const calloutStates = useRef(new Map<string, boolean>());
  const pageMarkup = useMemo(() => pages.map(html => ({ __html: html })), [pages]);
  useLayoutEffect(() => { calloutStates.current.clear(); }, [pages]);
  const revealCallouts = (element: HTMLElement) => {
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      if (!ancestor.matches('details.md-alert-foldable[data-callout-key]')) continue;
      const key = ancestor.dataset.calloutKey!;
      calloutStates.current.set(key, true);
      host.current?.querySelectorAll<HTMLDetailsElement>('details.md-alert-foldable[data-callout-key]').forEach(fragment => {
        if (fragment.dataset.calloutKey === key) fragment.open = true;
      });
    }
  };
  const mappings=useMemo(()=>pages.flatMap((html,index)=>{
    const template=document.createElement('template');template.innerHTML=html;
    return Array.from(template.content.querySelectorAll<HTMLElement>('[data-source-line]'),element=>({index,line:Number(element.dataset.sourceLine),end:Number(element.dataset.sourceEnd)}));
  }),[pages]);
  useEffect(() => {
    if (!panel) return;
    const update = () => {
      if (!panel.clientHeight || !panel.getClientRects().length) return;
      setScroll(panel.scrollTop); setViewport(panel.clientHeight);
    };
    panel.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update); observer.observe(panel); update();
    return () => { panel.removeEventListener('scroll', update); observer.disconnect(); };
  }, [panel]);
  useEffect(() => {
    if (!panel) return;
    const locate = (event: Event) => {
      const detail = (event as CustomEvent<number | PreviewScroll>).detail;
      const sync = typeof detail !== 'number';
      const edge = sync ? detail.edge : undefined;
      if (!panel.clientHeight || (sync && busy) || !pages.length) return;
      if (edge) {
        setNavigation({ index: edge === 'start' ? 0 : pages.length - 1, pages, edge, sync });
        return;
      }
      const line = sync ? detail.line : detail;
      const wholeLine = Math.floor(line);
      let match: typeof mappings[number] | undefined;
      for (const block of mappings) {
        if (block.line <= wholeLine && block.end >= wholeLine && (!match || block.end - block.line < match.end - match.line)) match = block;
      }
      const fallback = match ?? mappings.find(block => block.line >= wholeLine) ?? mappings[mappings.length - 1];
      if (fallback) setNavigation({ index: fallback.index, pages, line: match ? line : fallback.line, sync });
    };
    window.addEventListener('preview-navigation', locate); return () => window.removeEventListener('preview-navigation', locate);
  }, [busy, mappings, pages, panel]);
  const hostTop = host.current && panel ? host.current.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop : 0;
  const first=offsets.findIndex((top,index)=>hostTop+top+heights[index]>=scroll);
  const last=offsets.findIndex(top=>hostTop+top>scroll+viewport);
  const start=Math.max(0,(first<0?pages.length-1:first)-2);
  const end=Math.min(pages.length,(last<0?pages.length:last)+2);
  useLayoutEffect(() => {
    if (!panel || !host.current || !pages.length || !panel.clientHeight || !panel.getClientRects().length) return;
    let largest = -1, page = 1;
    for (let index = start; index < end; index++) {
      const top = hostTop + offsets[index];
      const visible = Math.max(0, Math.min(top + heights[index], scroll + viewport) - Math.max(top, scroll));
      if (visible > largest) { largest = visible; page = index + 1; }
    }
    currentPageChanged?.(page);
  }, [scroll, viewport, hostTop, start, end, offsets, heights, panel, currentPageChanged]);
  const destinationIndex = navigation?.pages === pages ? navigation.index : -1;
  const extraPage = destinationIndex >= start && destinationIndex < end ? -1 : destinationIndex;
  useLayoutEffect(() => {
    const callouts = Array.from(host.current?.querySelectorAll<HTMLDetailsElement>('details.md-alert-foldable[data-callout-key]') || []);
    const listeners: [HTMLDetailsElement, () => void][] = [];
    for (const callout of callouts) {
      const key = callout.dataset.calloutKey!;
      const open = calloutStates.current.get(key) ?? callout.dataset.calloutFold === 'open';
      calloutStates.current.set(key, open);
      callout.open = open;
      const toggle = () => {
        if (calloutStates.current.get(key) === callout.open) return;
        calloutStates.current.set(key, callout.open);
        for (const fragment of callouts) {
          if (fragment !== callout && fragment.dataset.calloutKey === key && fragment.open !== callout.open) fragment.open = callout.open;
        }
      };
      callout.addEventListener('toggle', toggle);
      listeners.push([callout, toggle]);
    }
    return () => { listeners.forEach(([callout, toggle]) => callout.removeEventListener('toggle', toggle)); };
  }, [pages, start, end, extraPage]);
  useLayoutEffect(() => {
    if (!navigation) return;
    setNavigation(null);
    if (!panel?.clientHeight || destinationIndex < 0 || (busy && navigation.sync)) return;
    const shell = host.current?.children[destinationIndex];
    if (!shell) return;
    let top = 0;
    if (navigation.edge === 'end') top = panel.scrollHeight;
    else if (!navigation.edge) {
      let destination: HTMLElement | null = null;
      let span = Infinity;
      if (navigation.id !== undefined) destination = shell.querySelector(`[id="${CSS.escape(navigation.id)}"]`);
      else if (navigation.line !== undefined) {
        const line = Math.floor(navigation.line);
        for (const block of shell.querySelectorAll<HTMLElement>('[data-source-line]')) {
          const location = sourceLocation(block);
          if (location && location.line <= line && location.end >= line && location.end - location.line < span) {
            destination = block;
            span = location.end - location.line;
          }
        }
      }
      let progress = 0;
      if (destination) {
        if (navigation.sync) {
          // Scroll to the visible summary without changing the user's fold state.
          for (let parent = destination.parentElement; parent && parent !== shell; parent = parent.parentElement) {
            if (parent.matches('details:not([open])')) destination = parent.querySelector(':scope > summary') ?? parent;
          }
          const location = sourceLocation(destination);
          if (location && navigation.line !== undefined && location.end > location.line) {
            progress = Math.max(0, Math.min(1, (navigation.line - location.line) / (location.end - location.line + 1)));
          }
        } else revealCallouts(destination);
      }
      const rect = (destination ?? shell).getBoundingClientRect();
      top = panel.scrollTop + rect.top + rect.height * progress - panel.getBoundingClientRect().top - 20;
    }
    if (navigation.sync) setSyncedScroll(panel, top);
    else panel.scrollTop = top;
    setScroll(panel.scrollTop);
  }, [navigation, destinationIndex, panel, busy]);
  const jump = (index: number) => {
    const shell = host.current?.children[index] as HTMLElement | undefined;
    if (panel && shell) panel.scrollTop += shell.getBoundingClientRect().top - panel.getBoundingClientRect().top - 20;
  };
  return <>
    <div className="preview-controls" aria-label="PDF 预览工具">
    {controls}
    {pages.length > 1 ? <form className="page-navigation" onSubmit={event => {
      event.preventDefault();
      if (canJump) jump(targetPage - 1);
    }}>
      <span>共 {pages.length} 页</span>
      <label>跳至 <input aria-label="跳转页码" type="number" min={1} max={pages.length} required value={target}
        onChange={event => setTarget(event.target.value)} /></label>
      <button type="submit" disabled={!canJump}>跳转</button>
    </form> : null}
    </div>
    <div className="preview-panel" ref={panelChanged} aria-busy={busy} aria-label="PDF 页面">
    <div ref={host} className="pdf-document pdf-document-preview" onClick={(event) => {
      if ((event.target as Element).closest('details.md-alert-foldable > summary')) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!link) { const location = sourceLocation(event.target as Element); if (location) navigateToSource(location); return; }
      let id: string;
      try { id = decodeURIComponent(link.getAttribute('href')!.slice(1)); } catch { return; }
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const index = pages.findIndex((html) => new RegExp(`id=["']${escaped}["']`).test(html));
      if (index >= 0) {
        event.preventDefault();
        setNavigation({ index, pages, id });
      }
    }}>
      {pages.map((_, index) => <div className="pdf-page-shell" key={index} data-page={index + 1}
        style={{ height: heights[index], width: sizes[index].width / 25.4 * 96 * scale }}>
        {(index >= start && index < end) || index === extraPage ? <article className="pdf-page" tabIndex={0} aria-label={`第 ${index + 1} 页预览，回车定位源码`} onKeyDown={event => {
          if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
          const block = event.currentTarget.querySelector('[data-source-line]');
          if (block) { const location = sourceLocation(block); if (location) navigateToSource(location); }
        }} style={{ width: `${sizes[index].width}mm`, height: `${sizes[index].height}mm`, transform: `scale(${scale})` }}
          dangerouslySetInnerHTML={pageMarkup[index]} /> : <div className="page-placeholder">第 {index + 1} 页</div>}
      </div>)}
    </div>
    </div>
  </>;
}
