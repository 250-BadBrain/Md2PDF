export type LocalFont={name:string; bytes:ArrayBuffer; face:FontFace; supports:(character:string)=>boolean; embeddable:boolean};
let current:LocalFont|undefined;
export function activeFont(){return current;}
export function clearFont(){if(current)document.fonts.delete(current.face);current=undefined;window.dispatchEvent(new Event('local-font-change'));}
export function inspectTtf(bytes:ArrayBuffer){
  const view=new DataView(bytes);
  if(bytes.byteLength<12||view.getUint32(0)!==0x00010000)throw new Error('仅支持静态 TrueType TTF 字体，不支持 TTC、OTF 或可变字体。');
  const tables=new Map<string,{offset:number;size:number}>();const count=view.getUint16(4);
  if(count>256||12+count*16>bytes.byteLength)throw new Error('字体目录无效');
  for(let i=0;i<count;i++){const pos=12+i*16;const name=String.fromCharCode(...new Uint8Array(bytes,pos,4));const offset=view.getUint32(pos+8),size=view.getUint32(pos+12);if(offset+size>bytes.byteLength)throw new Error('字体表越界');tables.set(name,{offset,size});}
  if(tables.has('fvar')||!tables.has('glyf')||!tables.has('cmap'))throw new Error('字体需要静态 TrueType 轮廓与 Unicode cmap');
  const cmap=tables.get('cmap')!;const subtables:number[]=[];
  const invalid = () => { throw new Error('字体 cmap 损坏'); };
  if(cmap.size<4)invalid();
  const records=view.getUint16(cmap.offset+2);
  if(4+records*8>cmap.size)invalid();
  for(let i=0;i<records;i++){const p=cmap.offset+4+i*8;const platform=view.getUint16(p),encoding=view.getUint16(p+2);if(platform===0||(platform===3&&(encoding===1||encoding===10)))subtables.push(cmap.offset+view.getUint32(p+4));}
  const supported=subtables.filter(offset=>{
    const limit=cmap.offset+cmap.size;
    if(offset<cmap.offset||offset+2>limit)invalid();
    const format=view.getUint16(offset);if(format!==4&&format!==12)return false;
    if(offset+16>limit)invalid();
    const length=format===4?view.getUint16(offset+2):view.getUint32(offset+4);
    if(length<16||offset+length>limit)invalid();
    if(format===12){if(16+view.getUint32(offset+12)*12>length)invalid();}
    else {const segments=view.getUint16(offset+6);if(!segments||segments%2||16+segments*4>length)invalid();}
    return true;
  });
  if(!supported.length)throw new Error('字体缺少支持的 Unicode cmap');
  const glyph=(code:number)=>supported.some(offset=>{
    const format=view.getUint16(offset);
    if(format===12){const groups=view.getUint32(offset+12);for(let i=0;i<groups;i++){const p=offset+16+i*12;const start=view.getUint32(p),end=view.getUint32(p+4);if(code>=start&&code<=end)return view.getUint32(p+8)+code-start!==0;}return false;}
    if(code>65535)return false;const n=view.getUint16(offset+6)/2;const ends=offset+14,starts=ends+2*n+2,deltas=starts+2*n,ranges=deltas+2*n;
    for(let i=0;i<n;i++){const end=view.getUint16(ends+2*i),start=view.getUint16(starts+2*i);if(code<start||code>end)continue;const delta=view.getInt16(deltas+2*i),range=view.getUint16(ranges+2*i);if(!range)return ((code+delta)&65535)!==0;const address=ranges+2*i+range+2*(code-start);if(address+2>offset+view.getUint16(offset+2))return false;const id=view.getUint16(address);return id!==0&&((id+delta)&65535)!==0;}return false;
  });
  const os=tables.get('OS/2');const flags=os&&os.size>=10?view.getUint16(os.offset+8):0;
  const cache = new Map<number, boolean>();
  return {supports:(character:string)=>{ const code = character.codePointAt(0); if(code === undefined)return false; if(!cache.has(code))cache.set(code,glyph(code)); return cache.get(code)!; },embeddable:!(flags&0x0302)};
}
export async function importFont(file:File){
  if(file.size>25*1048576)throw new Error('字体超过 25MiB');
  const bytes=await file.arrayBuffer();let info:ReturnType<typeof inspectTtf>;
  try{info=inspectTtf(bytes);}catch(error){throw new Error(error instanceof RangeError?'字体表损坏':String(error instanceof Error?error.message:error));}
  const face=new FontFace('Md2PDFLocal',bytes);await face.load();clearFont();document.fonts.add(face);
  current={name:file.name,bytes,face,...info};window.dispatchEvent(new Event('local-font-change'));return current;
}
export function missingGlyphs(text:string,font=activeFont()){
  return font?[...new Set([...text])].filter(character=>!/\s/.test(character)&&!font.supports(character)):[];
}
export function fontFaceCss(){
  if(!current)return '';
  const bytes=new Uint8Array(current.bytes);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return `@font-face{font-family:Md2PDFLocal;src:url(data:font/ttf;base64,${btoa(binary)}) format('truetype')}`;
}
