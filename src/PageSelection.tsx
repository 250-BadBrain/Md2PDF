import type { ExportScope, PageChapter } from './page-selection';

export function PageSelection({ value, change, chapters, total, currentPage, count, error, disabled }: {
  value: ExportScope; change: (value: ExportScope) => void; chapters: PageChapter[]; total: number;
  currentPage: number; count: number; error: string; disabled: boolean;
}) {
  const label = value.mode === 'all' ? '全部页面' : value.mode === 'current' ? `当前第 ${currentPage} 页` : value.mode === 'chapter' ? '章节所在页面' : '指定页码';
  return <details className="page-selection">
    <summary>导出范围：{label}（{count} / {total} 页）</summary>
    <div className="page-selection-fields">
      <label>导出范围<select aria-label="导出范围" disabled={disabled} value={value.mode} onChange={event => {
        const mode = event.target.value as ExportScope['mode'];
        change({ ...value, mode, chapter: value.chapter || chapters[0]?.id || '' });
      }}><option value="all">全部页面</option><option value="current">当前预览页</option><option value="chapter" disabled={!chapters.length}>章节所在页面</option><option value="range">指定页码</option></select></label>
      {value.mode === 'range' ? <label>页码<input aria-label="导出页码" value={value.range} disabled={disabled} placeholder="1-3,5,8-10" onChange={event => change({ ...value, range: event.target.value })} /></label> : null}
      {value.mode === 'chapter' ? <label>章节<select aria-label="导出章节" disabled={disabled} value={value.chapter} onChange={event => change({ ...value, chapter: event.target.value })}>
        {chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}（{chapter.start + 1}-{chapter.end + 1} 页）</option>)}
      </select></label> : null}
      {value.mode === 'current' ? <span>导出当前预览第 {currentPage} 页</span> : null}
    </div>
    <p>按原文顺序导出，保留原文页码。章节按整页选择，交界页可能包含相邻章节；指向未选页面的内部 PDF 链接不导出。</p>
    {error ? <p role="alert">{error}</p> : null}
  </details>;
}
