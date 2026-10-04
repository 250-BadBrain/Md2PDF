import { useEffect, useRef, useState } from 'react';
import { replaceText } from './draft';
import { editorLinePositions, lineOffset, sourceLocation, type SourceLocation } from './source-map';

export function Editor({ source, change, disabled, panel, download, clear, draftStatus }: {
  source: string; change: (value: string) => void; disabled: boolean; panel: HTMLElement | null;
  download: () => void; clear: () => void; draftStatus: string;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const [find, setFind] = useState(''); const [replacement, setReplacement] = useState('');
  const [sync, setSync] = useState(false); const [showFind, setShowFind] = useState(false);
  const syncing = useRef(false);
  const positions = useRef<number[]>([]);
  const ensurePositions=useRef<()=>void>(()=>{});
  useEffect(() => {
    const area = editor.current; if (!area) return;
    let dirty=true;
    const update=()=>{if(dirty){positions.current=editorLinePositions(area,source);dirty=false;}};
    ensurePositions.current=update;
    const observer = new ResizeObserver(()=>{dirty=true;}); observer.observe(area);
    const timer=sync?setTimeout(update,250):undefined;
    let navigationFrame = 0;
    const navigate = (event: Event) => {
      const {line,end} = (event as CustomEvent<SourceLocation>).detail;
      cancelAnimationFrame(navigationFrame);
      // Allow the mobile editor pane to become visible before measuring and focusing.
      navigationFrame = requestAnimationFrame(() => {
        dirty = true; update();
        area.focus(); area.setSelectionRange(lineOffset(source,line), lineOffset(source,end + 1));
        area.scrollTop = Math.max(0,(positions.current[line - 1] || 0) - area.clientHeight / 3);
      });
    };
    window.addEventListener('source-navigation',navigate);
    return () => { clearTimeout(timer); cancelAnimationFrame(navigationFrame); observer.disconnect(); window.removeEventListener('source-navigation',navigate); };
  },[source,sync]);
  useEffect(() => {
    if (!panel || !sync) return;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const area = editor.current; if (!area || syncing.current) return;
      ensurePositions.current();
      syncing.current = true;
      const top = panel.getBoundingClientRect().top;
      const blocks = Array.from(panel.querySelectorAll<HTMLElement>('[data-source-line]'));
      const visible = blocks.filter((block) => block.getBoundingClientRect().bottom > top && block.getBoundingClientRect().top < top + panel.clientHeight)
        .sort((a,b) => Math.abs(a.getBoundingClientRect().top-top) - Math.abs(b.getBoundingClientRect().top-top))[0];
      const location = sourceLocation(visible);
      area.scrollTop = location ? Math.max(0,(positions.current[location.line-1] || 0)-20) : panel.scrollTop / Math.max(1, panel.scrollHeight-panel.clientHeight) * (area.scrollHeight-area.clientHeight);
      timer = setTimeout(() => { syncing.current = false; }, 50);
    };
    panel.addEventListener('scroll', update);
    return () => { panel.removeEventListener('scroll', update); clearTimeout(timer); syncing.current = false; };
  }, [panel, sync]);
  const count = find ? source.split(find).length - 1 : 0;
  const next = () => {
    const area = editor.current; if (!area || !find) return;
    const start = source.indexOf(find, area.selectionEnd);
    const index = start >= 0 ? start : source.indexOf(find);
    if (index >= 0) { area.focus(); area.setSelectionRange(index, index + find.length); }
  };
  return <section className="editor-pane">
    <div className="editor-toolbar">
      <button disabled={disabled} onClick={() => setShowFind(!showFind)}>查找替换</button>
      <button disabled={disabled} onClick={download}>下载 Markdown</button>
      <button disabled={disabled} onClick={clear}>清除已保存草稿</button>
      <label><input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} />同步滚动</label>
      <span role="status">{draftStatus}</span>
    </div>
    {showFind ? <div className="find-toolbar">
      <input aria-label="查找文本" value={find} onChange={(e) => setFind(e.target.value)} />
      <input aria-label="替换文本" value={replacement} onChange={(e) => setReplacement(e.target.value)} />
      <span>{count} 处</span><button disabled={disabled || !count} onClick={next}>下一个</button>
      <button disabled={disabled || !count} onClick={() => { const area = editor.current!; if (source.slice(area.selectionStart, area.selectionEnd) !== find) next(); else change(source.slice(0, area.selectionStart) + replacement + source.slice(area.selectionEnd)); }}>替换当前</button>
      <button disabled={disabled || !count} onClick={() => change(replaceText(source, find, replacement))}>全部替换</button>
    </div> : null}
    <textarea ref={editor} className="editor" value={source} onChange={(e) => change(e.target.value)} spellCheck={false}
      disabled={disabled} aria-label="Markdown 源代码编辑区" onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'f') { event.preventDefault(); setShowFind(true); }
      }} onScroll={() => {
        const area = editor.current;
        if (sync && area && panel && !syncing.current) {
          ensurePositions.current();
          syncing.current = true;
          let line = positions.current.findIndex((top) => top >= area.scrollTop);
          if (line < 0) line = positions.current.length - 1;
          window.dispatchEvent(new CustomEvent('preview-navigation',{detail: Math.max(1,line+1)}));
          setTimeout(() => { syncing.current = false; }, 100);
        }
      }} />
  </section>;
}
