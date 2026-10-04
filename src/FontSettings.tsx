import {useState} from 'react';
import {activeFont,clearFont,importFont,missingGlyphs} from './fonts';
export function FontSettings({text,disabled}:{text:string;disabled:boolean}){
  const [status,setStatus]=useState('');const [busy,setBusy]=useState(false);const [font,setFont]=useState(activeFont);
  const missing=missingGlyphs(text,font);
  return <section aria-label="本地字体" className="font-settings"><h3>本地字体</h3>
    <label>导入 TTF 字体<input aria-label="导入 TTF 字体" type="file" accept=".ttf" disabled={disabled||busy} onChange={async event=>{
      const file=event.target.files?.[0];event.target.value='';if(!file)return;setBusy(true);setStatus('正在加载字体…');
      try{const next=await importFont(file);setFont(next);setStatus('字体已加载');}catch(error){setStatus(error instanceof Error?error.message:String(error));}finally{setBusy(false);}
    }}/></label>
    <p role="status">{status}{font?` · ${font.name}`:''}</p>
    <p>字体仅保留在本次页面；不上传、不随项目包保存。请选择有使用权限的静态 TTF。直接下载原型需要可嵌入且覆盖正文字符的字体。</p>
    {font&&!font.embeddable?<p>字体声明限制嵌入；可用于预览，直接下载原型不可使用。</p>:null}
    {missing.length?<p role="status">此字体缺少 {missing.length} 种字符（源码检查）：{missing.slice(0,30).join('')}；预览会使用后备字体。</p>:null}
    <button type="button" disabled={disabled||busy||!font} onClick={()=>{clearFont();setFont(undefined);setStatus('已恢复系统字体');}}>移除本地字体</button>
  </section>;
}
