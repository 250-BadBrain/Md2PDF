import type MarkdownIt from 'markdown-it';
export function wikiLinks(md: MarkdownIt) {
  md.inline.ruler.before('link','wiki_link',(state,silent)=>{
    const embed=state.src.startsWith('![[',state.pos);const start=state.pos+(embed?1:0);
    if(!state.src.startsWith('[[',start))return false;
    const end=state.src.indexOf(']]',start+2);if(end<0)return false;
    const value=state.src.slice(start+2,end);if(value.includes('\n'))return false;
    const [target,...aliases]=value.split('|');if(!target.trim())return false;
    if(!silent){const token=state.push(embed?'wiki_embed':'wiki_link','',0);token.content=aliases.join('|')||target;token.meta={target:target.trim()};}
    state.pos=end+2;return true;
  });
  md.renderer.rules.wiki_link=(tokens,index)=>{
    const token=tokens[index];return `<a class="wiki-link" data-wiki-target="${md.utils.escapeHtml(token.meta.target)}" href="#">${md.utils.escapeHtml(token.content)}</a>`;
  };
  md.renderer.rules.wiki_embed=(tokens,index)=>{
    const token=tokens[index];const path=token.meta.target;
    if(!/\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:#.*)?$/i.test(path))return `<span class="unresolved-reference">不支持的笔记嵌入：${md.utils.escapeHtml(path)}</span>`;
    return `<img src="${md.utils.escapeHtml(path)}" alt="${md.utils.escapeHtml(token.content)}">`;
  };
  md.core.ruler.before('anchor','wiki_block_ids',state=>{
    state.tokens.forEach((token,index)=>{
      if(token.type!=='inline'||state.tokens[index-1]?.type!=='paragraph_open')return;
      const last=token.children?.[token.children.length-1];if(last?.type!=='text')return;
      const match=last.content.match(/\s+\^([a-zA-Z0-9-]+)\s*$/);if(!match)return;
      last.content=last.content.slice(0,match.index);state.tokens[index-1].attrSet('id',`block-${match[1]}`);
    });
  });
}
