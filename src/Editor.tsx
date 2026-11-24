import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { replaceText } from './draft';
import { isImageFile, isMarkdownFile } from './markdown';
import { editorLinePositions, editorTopAt, isSyncedScroll, lineOffset, setSyncedScroll, sourceLineAt, sourceLocation, type PreviewScroll, type SourceLocation } from './source-map';

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
      else if (start < insertion.end) insertion.valid = false;
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
        area.focus({ preventScroll: true }); area.setSelectionRange(lineOffset(source,line), lineOffset(source,end + 1));
        setSyncedScroll(area, Math.max(0, (positions.current[line - 1] || 0) - area.clientHeight / 3));
      });
    };
    window.addEventListener('source-navigation',navigate);
    return () => { clearTimeout(timer); cancelAnimationFrame(navigationFrame); observer.disconnect(); window.removeEventListener('source-navigation',navigate); };
  },[source,sync]);
  useEffect(() => {
    const area = editor.current;
    if (!panel || !area || !sync) return;
    let frame = 0;
    const schedule = (from: HTMLElement, update: () => void) => {
      if (isSyncedScroll(from)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!area.clientHeight || !panel.clientHeight || panel.getAttribute('aria-busy') === 'true' || isSyncedScroll(from)) return;
        ensurePositions.current();
        update();
      });
    };
    const fromEditor = () => schedule(area, () => {
      const top = area.scrollTop;
      const max = area.scrollHeight - area.clientHeight;
      const detail: PreviewScroll = {
        line: sourceLineAt(positions.current, top),
        edge: top <= 0 ? 'start' : top >= max - 1 ? 'end' : undefined,
      };
      window.dispatchEvent(new CustomEvent('preview-navigation', { detail }));
    });
    const fromPreview = () => schedule(panel, () => {
      const max = panel.scrollHeight - panel.clientHeight;
      if (panel.scrollTop <= 0 || panel.scrollTop >= max - 1) {
        setSyncedScroll(area, panel.scrollTop <= 0 ? 0 : area.scrollHeight);
        return;
      }
      const top = panel.getBoundingClientRect().top;
      const readingTop = top + 20;
      let nearest = Infinity;
      let line = 0;
      for (const block of panel.querySelectorAll<HTMLElement>('.pdf-page [data-source-line]')) {
        const rect = block.getBoundingClientRect();
        if (!rect.height || rect.bottom <= top || rect.top >= top + panel.clientHeight) continue;
        const distance = Math.abs(rect.top - readingTop);
        if (distance >= nearest) continue;
        const location = sourceLocation(block);
        if (!location) continue;
        nearest = distance;
        const progress = Math.max(0, Math.min(1, (readingTop - rect.top) / rect.height));
        line = location.line + progress * (location.end - location.line);
      }
      if (line) setSyncedScroll(area, editorTopAt(positions.current, line));
    });
    area.addEventListener('scroll', fromEditor, { passive: true });
    panel.addEventListener('scroll', fromPreview, { passive: true });
    return () => {
      area.removeEventListener('scroll', fromEditor);
      panel.removeEventListener('scroll', fromPreview);
      cancelAnimationFrame(frame);
    };
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
      }} onDrop={event => {
        const files = Array.from(event.dataTransfer.files);
        if (!files.length || files.some(isMarkdownFile)) return;
        const pictures = files.filter(isImageFile);
        if (!pictures.length) return;
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) void addImages(pictures);
      }}
      disabled={disabled} aria-label="Markdown 源代码编辑区" onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'f') { event.preventDefault(); setShowFind(true); }
      }} />
  </section>;
}
