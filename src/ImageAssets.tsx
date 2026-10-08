import { useRef, useState } from 'react';
import { IMAGE_ACCEPT } from './image-assets';
import { usePanelFocus } from './panel-focus';

export function ImageAssets({ assets, disabled, add, replace, insert, close }: {
  assets: Record<string, string>; disabled: boolean; add: (files: File[]) => Promise<void>;
  replace: (path: string, file: File) => Promise<void>; insert: (path: string) => void; close: () => void;
}) {
  const panel = usePanelFocus(close);
  const upload = useRef<HTMLInputElement>(null);
  const replacement = useRef<HTMLInputElement>(null);
  const replacementPath = useRef<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const run = async (work: () => Promise<void>, success: string) => {
    if (disabled || busy) return;
    setBusy(true); setError(''); setStatus('正在处理图片…');
    try { await work(); setStatus(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus(''); }
    finally { setBusy(false); }
  };
  return <aside ref={panel} className="image-assets" aria-label="图片素材">
    <div className="settings-heading"><h2>图片素材</h2><button type="button" onClick={close}>关闭图片素材</button></div>
    <p>可在编辑器中粘贴或拖入图片。替换图片会保留原引用路径；每个项目最多 200 张图片、总大小 100MiB。</p>
    {error ? <p role="alert">{error}</p> : null}
    {status ? <p role="status">{status}</p> : null}
    <fieldset disabled={disabled || busy}>
      <button type="button" onClick={() => upload.current?.click()}>添加图片</button>
      <input ref={upload} className="file-input" aria-label="添加图片文件" type="file" accept={IMAGE_ACCEPT} multiple onChange={event => {
        const files = Array.from(event.currentTarget.files || []); event.currentTarget.value = '';
        if (files.length) void run(() => add(files), `已添加 ${files.length} 张图片`);
      }} />
      <input ref={replacement} className="file-input" aria-label="替换图片文件" type="file" accept={IMAGE_ACCEPT} onChange={event => {
        const file = event.currentTarget.files?.[0]; const path = replacementPath.current;
        event.currentTarget.value = ''; replacementPath.current = undefined;
        if (file && path !== undefined) void run(() => replace(path, file), '已替换图片，原引用路径保持不变');
      }} />
      <p>{Object.keys(assets).length} 张图片</p>
      {Object.keys(assets).length ? <ul className="image-assets-list">{Object.entries(assets).map(([path, url]) => <li className="image-asset" key={path} data-path={path}>
        <img src={url} alt={`${path} 预览`} loading="lazy" decoding="async" />
        <span>{path}</span>
        <button type="button" onClick={() => insert(path)}>插入引用</button>
        <button type="button" onClick={() => { replacementPath.current = path; replacement.current?.click(); }}>替换图片</button>
      </li>)}</ul> : <p>尚未添加图片。</p>}
    </fieldset>
  </aside>;
}
