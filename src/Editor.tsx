import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { replaceText } from './draft';
import { editorLinePositions, lineOffset, sourceLocation, type SourceLocation } from './source-map';

type Insertion = { start: number; end: number; valid: boolean };

export function Editor({ source, change, disabled, panel, download, clear, draftStatus, images }: {
  source: string; change: (value: string) => void; disabled: boolean; panel: HTMLElement | null;
  download: () => void; clear: () => void; draftStatus: string;
  images: (files: File[]) => Promise<string[]>;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const latest = useRef({ change, disabled, images }); latest.current = { change, disabled, images };
  const currentSource = useRef(source);
  const insertions = useRef(new Set<Insertion>());
  const restoreSelection = useRef<{ source: string; position: number } | undefined>(undefined);
  const mounted = useRef(true);
  const [imageError, setImageError] = useState('');
  const [imageStatus, setImageStatus] = useState('');
  const trackSource = (next: string) => {
    const previous = currentSource.current;
    if (previous === next) return;
    let start = 0;
    while (start < Math.min(previous.length, next.length) && previous[start] === next[start]) start++;
    let oldEnd = previous.length; let newEnd = next.length;
    while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
    for (const insertion of insertions.current) {
      if (oldEnd <= insertion.start) { insertion.start += newEnd - oldEnd; insertion.end += newEnd - oldEnd; }
      else if (start < insertion.end || start < insertion.start) insertion.valid = false;
    }
    currentSource.current = next;
  };
  useLayoutEffect(() => {
    trackSource(source);
    const selection = restoreSelection.current;
    if (selection?.source === source && editor.current) {
      editor.current.focus(); editor.current.setSelectionRange(selection.position, selection.position);
    }
    restoreSelection.current = undefined;
  }, [source]);
  const insert = (text: string, insertion?: Insertion) => {
    const area = editor.current;
    if (!area || latest.current.disabled || !text) return;
    trackSource(area.value);
    const start = Math.min(area.value.length, insertion?.valid ? insertion.start : insertion ? area.selectionEnd : area.selectionStart);
    const end = Math.min(area.value.length, insertion?.valid ? insertion.end : area.selectionEnd);
    const before = area.value.slice(0, start); const after = area.value.slice(end);
    const content = `${before && !before.endsWith('\n') ? '\n\n' : ''}${text}${after && !after.startsWith('\n') ? '\n\n' : ''}`;
    const next = before + content + after;
    trackSource(next);
    restoreSelection.current = { source: next, position: before.length + content.length };
    latest.current.change(next);
  };
  const addImages = async (files: File[]) => {
    const area = editor.current;
    if (!area || latest.current.disabled || !files.length) return;
    const insertion = { start: area.selectionStart, end: area.selectionEnd, valid: true };
    insertions.current.add(insertion); setImageError(''); setImageStatus('正在添加图片…');
    try {
      const references = await latest.current.images(files);
      insertions.current.delete(insertion);
      if (!mounted.current) return;
      insert(references.join('\n\n'), insertion); setImageStatus(`已添加 ${references.length} 张图片`);
    } catch (reason) {
      if (mounted.current) { setImageError(reason instanceof Error ? reason.message : String(reason)); setImageStatus(''); }
    } finally { insertions.current.delete(insertion); }
  };
  useEffect(() => {
    mounted.current = true;
    const insertReference = (event: Event) => {
      const text = (event as CustomEvent<unknown>).detail;
      if (typeof text === 'string') insert(text);
    };
    window.addEventListener('editor-insert', insertReference);
    return () => { mounted.current = false; insertions.current.clear(); window.removeEventListener('editor-insert', insertReference); };
  }, []);
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
    {imageError ? <p className="editor-image-status" role="alert">{imageError}</p> : imageStatus ? <p className="editor-image-status" role="status">{imageStatus}</p> : null}
    <textarea ref={editor} className="editor" value={source} onChange={(event) => { trackSource(event.target.value); change(event.target.value); }} spellCheck={false}
      onPaste={event => {
        const clipboard = event.clipboardData;
        const files = clipboard.files.length ? Array.from(clipboard.files) : Array.from(clipboard.items || []).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter((file): file is File => file !== null);
        const pictures = files.filter(file => file.type.startsWith('image/'));
        if (pictures.length) { event.preventDefault(); void addImages(pictures); }
      }} onDragOver={event => {
        if (Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; }
      }} onDrop={event => {
        const files = Array.from(event.dataTransfer.files);
        if (!files.length) return;
        event.preventDefault();
        if (disabled) return;
        const pictures = files.filter(file => file.type.startsWith('image/'));
        if (pictures.length) void addImages(pictures);
        else setImageError('请拖入图片文件');
      }}
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
