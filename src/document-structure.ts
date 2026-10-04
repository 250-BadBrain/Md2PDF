export function numberDocumentFigures(source: HTMLElement) {
  let image=0,diagram=0;
  const used=new Set([...source.querySelectorAll('[id]')].map(element=>element.id));
  for(const figure of source.querySelectorAll<HTMLElement>('figure.image-figure,.mermaid-diagram:not(.mermaid-error)')) {
    const isDiagram=figure.classList.contains('mermaid-diagram');const number=isDiagram?++diagram:++image;
    const label=`${isDiagram?'图表':'图'} ${number}`;
    if(!figure.id){
      const img=figure.querySelector('img[id]');
      if(img){figure.id=img.id;img.removeAttribute('id');}
      else {const base=`${isDiagram?'diagram':'figure'}-${number}`;let id=base;let suffix=2;while(used.has(id))id=`${base}-${suffix++}`;figure.id=id;used.add(id);}
    }
    const caption=figure.querySelector('figcaption')||document.createElement('figcaption');
    caption.textContent=`${label}${caption.textContent?'：'+caption.textContent:''}`;figure.append(caption);
    figure.dataset.referenceLabel=label;
  }
  source.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach(link=>{
    if(link.textContent?.trim()!=='@ref')return;
    let id='';try{id=decodeURIComponent(link.hash.slice(1));}catch{return;}
    const target=source.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
    if(target)link.textContent=target.dataset.referenceLabel||target.textContent?.replace(/\s*#$/,'')||id;
    else {link.classList.add('unresolved-reference');link.textContent=`引用目标未找到：${id}`;}
  });
}
