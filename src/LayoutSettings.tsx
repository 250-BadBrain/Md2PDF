import { DEFAULT_LAYOUT, normalizeSettings, type LayoutSettings as Preferences } from './settings';
import { usePanelFocus } from './panel-focus';

export function LayoutSettings({ value, change, close, saved }: { value: Preferences; change: (value: Preferences) => void; close: () => void; saved: boolean }) {
  const panel = usePanelFocus(close);
  const update = (key: keyof Preferences, next: string | number | boolean) => change(normalizeSettings({ ...value, [key]: next }));
  return <aside ref={panel} className="layout-settings" aria-label="排版设置">
    <div className="settings-heading"><h2>排版设置</h2><button onClick={close} type="button">关闭设置</button></div>
    <p>配置自动保存；文档中的 YAML 设置优先。</p>
    {!saved ? <p role="status">浏览器无法保存配置，本次设置仍然有效。</p> : null}
    <div className="settings-grid">
      <label>Markdown 模式<select aria-label="Markdown 模式" value={value.dialect} onChange={e=>update('dialect',e.target.value)}><option value="document">文档扩展（默认）</option><option value="commonmark">CommonMark</option><option value="gfm">GFM</option><option value="obsidian">Obsidian 常用扩展</option></select></label>
      {value.dialect==='commonmark'||value.dialect==='gfm'?<p>此模式使用标准软换行；不解析数学、Mermaid 或文档扩展。HTML 仍经过安全过滤。</p>:null}
      <label>主题<select aria-label="主题" value={value.theme} onChange={(e) => update('theme', e.target.value)}><option value="classic">经典</option><option value="book">书籍</option><option value="compact">紧凑</option></select></label>
      <label>脚注<select aria-label="脚注位置" value={value.footnotes} onChange={(e) => update('footnotes', e.target.value)}><option value="end">文末</option><option value="near-reference">靠近首次引用</option><option value="page-bottom">页底（长注续页）</option></select></label>
      <label>段落分页最少行数<input aria-label="段落分页最少行数" type="number" min={1} max={4} value={value.minParagraphLines} onChange={e=>update('minParagraphLines',Number(e.target.value))}/></label>
      <label><input type="checkbox" checked={value.figureNumbers} onChange={e=>update('figureNumbers',e.target.checked)}/>图与图表编号</label>
      <label><input type="checkbox" checked={value.wideTables} onChange={e=>update('wideTables',e.target.checked)}/>宽表格使用横向页面</label>
      <label><input type="checkbox" checked={value.cover} onChange={(e) => update('cover', e.target.checked)} />添加封面</label>
      <label className="settings-wide">软换行<select aria-label="软换行" value={value.softBreaks} onChange={(e) => update('softBreaks', e.target.value)}>
        <option value="newline">普通换行：单次回车显示为换行</option>
        <option value="space">标准软换行：单次回车不强制换行</option></select></label>
      <label>纸张<select aria-label="纸张" value={value.paper} onChange={(e) => update('paper', e.target.value)}>
        <option>A4</option><option>A5</option><option>Letter</option></select></label>
      <label>方向<select aria-label="方向" value={value.orientation} onChange={(e) => update('orientation', e.target.value)}>
        <option value="portrait">纵向</option><option value="landscape">横向</option></select></label>
      <label>边距（mm）<input aria-label="边距" type="number" min={8} max={50} value={parseFloat(value.margin)} onChange={(e) => update('margin', `${Number(e.target.value)}mm`)} /></label>
      <label>字体<select aria-label="字体" value={value.fontFamily} onChange={(e) => update('fontFamily', e.target.value)}>
        <option value="sans">无衬线</option><option value="serif">衬线</option><option value="mono">等宽</option></select></label>
      <label>字号（px）<input aria-label="字号" type="number" min={10} max={24} value={value.fontSize} onChange={(e) => update('fontSize', Number(e.target.value))} /></label>
      <label>行距<input aria-label="行距" type="number" min={1.2} max={2.4} step={0.1} value={value.lineHeight} onChange={(e) => update('lineHeight', Number(e.target.value))} /></label>
      <label className="settings-wide">页眉<input aria-label="页眉" value={value.header} onChange={(e) => update('header', e.target.value)} placeholder="{title} · {page}/{total}" /></label>
      <label className="settings-wide">页脚<input aria-label="页脚" value={value.footer} onChange={(e) => update('footer', e.target.value)} placeholder="{author}" /></label>
      <label><input type="checkbox" checked={value.pageNumbers} onChange={(e) => update('pageNumbers', e.target.checked)} />显示页码</label>
      <label><input type="checkbox" checked={value.tocPageNumbers} onChange={(e) => update('tocPageNumbers', e.target.checked)} />目录页码</label>
      <label><input type="checkbox" checked={value.chapterNewPage} onChange={(e) => update('chapterNewPage', e.target.checked)} />章节另起一页</label>
      <label>章节级别<input aria-label="章节级别" type="number" min={1} max={6} value={value.chapterLevel} onChange={(e) => update('chapterLevel', Number(e.target.value))} /></label>
    </div>
    <button type="button" onClick={() => change({ ...DEFAULT_LAYOUT })}>恢复默认设置</button>
  </aside>;
}
