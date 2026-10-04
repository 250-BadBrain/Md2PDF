import type {jsPDF} from 'jspdf';
import {activeFont,missingGlyphs} from './fonts';
const excluded='svg,.katex,.mermaid-diagram,.header-anchor,[aria-hidden="true"]';
export function textNodes(page:HTMLElement){
  const walker=document.createTreeWalker(page,NodeFilter.SHOW_TEXT);const nodes:Text[]=[];
  while(walker.nextNode()){const node=walker.currentNode as Text;if(!node.parentElement?.closest(excluded))nodes.push(node);}
  return nodes;
}
export function addTextLayer(pdf:jsPDF,page:HTMLElement,width:number,height:number){
  const font=activeFont();if(!font||!font.embeddable)throw new Error('直接下载原型需要导入允许嵌入的静态 TTF 字体。');
  const nodes=textNodes(page);const text=nodes.map(node=>node.data).join('');
  // jsPDF's TTF text encoder uses UTF-16 code units, so surrogate pairs are unsafe.
  if([...text].some(character=>character.length>1))throw new Error('直接下载原型暂不支持 emoji 和扩展区汉字，请使用打印保存。');
  const missing=missingGlyphs(text,font);if(missing.length)throw new Error(`字体缺字，无法生成可靠文字层：${missing.slice(0,20).join('')}。请换用覆盖正文的字体或打印保存。`);
  if(text.length>100000)throw new Error('单页文字超过原型上限，请使用打印保存。');
  if(!pdf.existsFileInVFS('local.ttf')){
    const bytes=new Uint8Array(font.bytes);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    pdf.addFileToVFS('local.ttf',btoa(binary));pdf.addFont('local.ttf','Md2PDFLocal','normal');
  }
  pdf.setFont('Md2PDFLocal','normal');const bounds=page.getBoundingClientRect();
  const metadata=pdf.getFont().metadata as {characterToGlyph?:(code:number)=>number};
  if(!metadata.characterToGlyph||[...new Set(text)].some(character=>character.trim()&&!metadata.characterToGlyph!(character.charCodeAt(0))))throw new Error('PDF 引擎无法嵌入此字体的正文字符，请换用其他 TTF 或打印保存。');
  for(const node of nodes){let offset=0;const range=document.createRange();
    let run='';let first:DOMRect|undefined;let last:DOMRect|undefined;
    const flush=()=>{
      if(!run.trim()||!first||!last){run='';first=last=undefined;return;}
      const fontSize=parseFloat(getComputedStyle(node.parentElement!).fontSize);
      pdf.setFontSize(fontSize*72/96);
      const measured=(Math.max(first.right,last.right)-Math.min(first.left,last.left))*width/bounds.width;
      const natural=pdf.getTextWidth(run);
      pdf.text(run,(Math.min(first.left,last.left)-bounds.left)*width/bounds.width,(first.bottom-bounds.top)*height/bounds.height,{baseline:'bottom',renderingMode:'invisible',horizontalScale:natural>0?measured/natural:1});
      run='';first=last=undefined;
    };
    for(const character of node.data){range.setStart(node,offset);offset+=character.length;range.setEnd(node,offset);const rect=range.getBoundingClientRect();
      if(!rect.width||!rect.height)continue;
      if(first&&Math.abs(rect.top-first.top)>1)flush();
      if(!first)first=rect;last=rect;run+=character;
    }
    flush();
  }
}
