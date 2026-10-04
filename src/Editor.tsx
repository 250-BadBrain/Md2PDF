import { useEffect, useRef, useState } from 'react';
import { replaceText } from './draft';

export function Editor({ source, change, disabled, panel, download, clear, draftStatus }: {
  source: string; change: (value: string) => void; disabled: boolean; panel: HTMLElement | null;
  download: () => void; clear: () => void; draftStatus: string;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const [find, setFind] = useState(''); const [replacement, setReplacement] = useState('');
  const [sync, setSync] = useState(false); const [showFind, setShowFind] = useState(false);
  const syncing = useRef(false);
  useEffect(() => {
    if (!panel || !sync) return;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const area = editor.current; if (!area || syncing.current) return;
      syncing.current = true;
      area.scrollTop = panel.scrollTop / Math.max(1, panel.scrollHeight - panel.clientHeight) * (area.scrollHeight - area.clientHeight);
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
          syncing.current = true;
          panel.scrollTop = area.scrollTop / Math.max(1, area.scrollHeight - area.clientHeight) * (panel.scrollHeight - panel.clientHeight);
          setTimeout(() => { syncing.current = false; }, 50);
        }
      }} />
  </section>;
}
