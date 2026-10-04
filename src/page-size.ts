import type {DocumentMeta} from './markdown-parser';
import {pageDimensions} from './settings';
export function pageSize(html:string,meta:DocumentMeta={}) {
  const width=Number(html.match(/data-page-width="([\d.]+)"/)?.[1]);const height=Number(html.match(/data-page-height="([\d.]+)"/)?.[1]);
  return width>0&&height>0?{width,height}:pageDimensions(meta);
}
