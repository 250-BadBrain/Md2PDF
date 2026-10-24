import { useEffect, useMemo, useState } from 'react';
import { readDocumentProperties, updateDocumentProperties } from './document-properties';
import { usePanelFocus } from './panel-focus';

export function DocumentProperties({ source, change, disabled, close }: {
  source: string; change: (source: string) => void; disabled: boolean; close: () => void;
}) {
  const properties = useMemo(() => readDocumentProperties(source), [source]);
  const [values, setValues] = useState(properties.values);
  const [error, setError] = useState(properties.error ?? '');
  const [savedSource, setSavedSource] = useState<string>();
  const panel = usePanelFocus(close);
  useEffect(() => {
    setValues(properties.values); setError(properties.error ?? '');
  }, [properties]);
  return <aside ref={panel} className="layout-settings document-properties" aria-label="文档属性">
    <div className="settings-heading"><h2>文档属性</h2><button type="button" onClick={close}>关闭文档属性</button></div>
    <p>属性保存到 Markdown，随草稿和项目一起保存。下载 PDF 包含属性与标题书签；打印时由浏览器决定。</p>
    {error ? <p role="alert">{error}</p> : null}
    {savedSource === source ? <p role="status">文档属性已保存。</p> : null}
    <form onSubmit={event => {
      event.preventDefault();
      if (disabled || properties.error) return;
      try { const next = updateDocumentProperties(source, values); change(next); setError(''); setSavedSource(next); }
      catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    }}>
      <fieldset disabled={disabled || !!properties.error}>
        <div className="settings-grid">
          {(['title','author','subject'] as const).map((key, index) => <label className="settings-wide" key={key}>
            {['文档标题','文档作者','文档主题'][index]}
            <input aria-label={['文档标题','文档作者','文档主题'][index]} value={values[key]} onChange={event => { setValues({...values,[key]:event.target.value}); setSavedSource(undefined); }}/>
          </label>)}
          <label className="settings-wide">文档关键词<textarea aria-label="文档关键词" rows={3} value={values.keywords} onChange={event => { setValues({...values,keywords:event.target.value}); setSavedSource(undefined); }}/></label>
        </div>
        <p>关键词可每行一个，也可输入逗号分隔的文本。</p>
        <button type="submit">保存文档属性</button>
      </fieldset>
    </form>
  </aside>;
}
