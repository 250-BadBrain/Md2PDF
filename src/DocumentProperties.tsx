import { useEffect, useState } from 'react';
import { readDocumentProperties, updateDocumentProperties } from './document-properties';
import { usePanelFocus } from './panel-focus';

export function DocumentProperties({ source, change, disabled, close }: {
  source: string; change: (source: string) => void; disabled: boolean; close: () => void;
}) {
  const initial = readDocumentProperties(source);
  const [values, setValues] = useState(initial.values);
  const [error, setError] = useState(initial.error ?? '');
  const [saved, setSaved] = useState(false);
  const panel = usePanelFocus(close);
  useEffect(() => {
    const result = readDocumentProperties(source);
    setValues(result.values); setError(result.error ?? '');
  }, [source]);
  return <aside ref={panel} className="layout-settings document-properties" aria-label="文档属性">
    <div className="settings-heading"><h2>文档属性</h2><button type="button" onClick={close}>关闭文档属性</button></div>
    <p>属性保存到 Markdown，随草稿和项目一起保存。下载 PDF 包含属性与标题书签；打印时由浏览器决定。</p>
    {error ? <p role="alert">{error}</p> : null}
    {saved ? <p role="status">文档属性已保存。</p> : null}
    <form onSubmit={event => {
      event.preventDefault();
      if (disabled || initial.error) return;
      try { change(updateDocumentProperties(source, values)); setError(''); setSaved(true); }
      catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    }}>
      <fieldset disabled={disabled || !!initial.error}>
        <div className="settings-grid">
          {(['title','author','subject'] as const).map((key, index) => <label className="settings-wide" key={key}>
            {['文档标题','文档作者','文档主题'][index]}
            <input aria-label={['文档标题','文档作者','文档主题'][index]} value={values[key]} onChange={event => { setValues({...values,[key]:event.target.value}); setSaved(false); }}/>
          </label>)}
          <label className="settings-wide">文档关键词<textarea aria-label="文档关键词" rows={3} value={values.keywords} onChange={event => { setValues({...values,keywords:event.target.value}); setSaved(false); }}/></label>
        </div>
        <p>关键词可每行一个，也可输入逗号分隔的文本。</p>
        <button type="submit">保存文档属性</button>
      </fieldset>
    </form>
  </aside>;
}
