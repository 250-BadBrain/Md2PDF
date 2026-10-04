export type NoteContext = { definitions: Map<string, HTMLElement>; pending: { id: string; node: HTMLElement }[]; emitted: Set<string> };
type NotePage = { content: HTMLElement; aside: HTMLElement; context: NoteContext; basePadding: number; continuations: {id: string; node: HTMLElement}[]; placed: string[] };
const pages = new WeakMap<HTMLElement, NotePage>();
export function extractPageNotes(source: HTMLElement): NoteContext {
  const definitions = new Map<string, HTMLElement>();
  source.querySelectorAll<HTMLElement>('.footnotes li[id]').forEach((note,index) => { note.setAttribute('value', String(index+1)); definitions.set(note.id,note); });
  source.querySelectorAll('.footnotes,.footnotes-sep').forEach((section)=>section.remove());
  return {definitions,pending:[],emitted:new Set()};
}
export function attachPageNotes(page: HTMLElement, content: HTMLElement, context: NoteContext) {
  const style = getComputedStyle(content); const aside=document.createElement('aside');
  aside.className='pdf-page-notes markdown-body footnotes';
  aside.style.left=style.paddingLeft; aside.style.right=style.paddingRight; aside.style.bottom=style.paddingBottom;
  page.append(aside);
  pages.set(content,{content,aside,context,basePadding:parseFloat(style.paddingBottom),continuations:[],placed:[]});
}
function splitNote(note: HTMLElement, fits: (head: HTMLElement)=>boolean) {
  const positions: {node:Text;offset:number}[]=[];const walker=document.createTreeWalker(note,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()) {const text=walker.currentNode as Text;let offset=0;for(const character of text.data){offset+=character.length;positions.push({node:text,offset});}}
  if(positions.length<2)return undefined;
  const headAt=(index:number)=>{const range=document.createRange();range.setStart(note,0);range.setEnd(positions[index].node,positions[index].offset);const head=note.cloneNode(false) as HTMLElement;head.append(range.cloneContents());return head;};
  let low=0,high=positions.length-2,best=-1;
  while(low<=high){const middle=(low+high)>>1;if(fits(headAt(middle))){best=middle;low=middle+1;}else high=middle-1;}
  if(best<0)return undefined;
  const range=document.createRange();range.setStart(positions[best].node,positions[best].offset);range.setEnd(note,note.childNodes.length);
  const tail=note.cloneNode(false) as HTMLElement;tail.append(range.cloneContents());tail.removeAttribute('id');
  const head=headAt(best);const ids=new Set([...head.querySelectorAll('[id]')].map(el=>el.id));tail.querySelectorAll('[id]').forEach(el=>{if(ids.has(el.id))el.removeAttribute('id');});
  return {head,tail};
}
export function reservePageNotes(content: HTMLElement) {
  const state=pages.get(content);if(!state)return;
  const {aside,context}=state;aside.replaceChildren();state.continuations=[];state.placed=[];
  const entries=[...context.pending];const ids=new Set(entries.map(entry=>entry.id));
  content.querySelectorAll<HTMLAnchorElement>('a.footnote-ref,.footnote-ref a[href]').forEach(ref=>{
    let id='';try{id=decodeURIComponent(ref.hash.slice(1));}catch{return;}
    const node=context.definitions.get(id);if(node&&!context.emitted.has(id)&&!ids.has(id)){entries.push({id,node});ids.add(id);}
  });
  if(!entries.length){aside.hidden=true;content.style.paddingBottom=`${state.basePadding}px`;return;}
  aside.hidden=false;const list=document.createElement('ol');aside.append(list);
  const style=getComputedStyle(content);
  const limit=Math.max(40,(content.clientHeight-parseFloat(style.paddingTop)-state.basePadding)*0.4);
  for(const entry of entries){
    const clone=entry.node.cloneNode(true) as HTMLElement;list.append(clone);
    if(aside.getBoundingClientRect().height<=limit){state.placed.push(entry.id);continue;}
    clone.remove();
    const split=splitNote(clone,head=>{list.append(head);const fits=aside.getBoundingClientRect().height<=limit;head.remove();return fits;});
    if(split){list.append(split.head);state.placed.push(entry.id);state.continuations.push({id:entry.id,node:split.tail});}
    else if(!list.children.length){
      const inner=document.createElement('div');inner.append(...clone.childNodes);clone.append(inner);list.append(clone);
      const height=inner.getBoundingClientRect().height;const scale=Math.min(1,Math.max(1,limit-16)/Math.max(1,height));
      inner.style.transformOrigin='top left';inner.style.transform=`scale(${scale})`;clone.style.height=`${height*scale}px`;
      clone.classList.add('note-scaled','pagination-scaled');state.placed.push(entry.id);
    }
    else state.continuations.push(entry);
  }
  content.style.paddingBottom=`${state.basePadding+aside.getBoundingClientRect().height+10}px`;
}
export function commitPageNotes(content: HTMLElement) {
  const state=pages.get(content);if(!state)return;
  reservePageNotes(content);
  state.placed.forEach(id=>state.context.emitted.add(id));
  state.context.pending=state.continuations;
}
