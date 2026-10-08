import { validProjectPath } from './projects';

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml,image/avif,image/x-icon,image/vnd.microsoft.icon';
const extensions: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/bmp': 'bmp', 'image/svg+xml': 'svg', 'image/avif': 'avif',
  'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico',
};
const MAX_IMAGES = 200;
const MAX_BYTES = 100 * 1048576;

function directory(path?: string): string[] {
  if (!path) return [];
  if (!validProjectPath(path)) throw new Error('Markdown 文档路径无效');
  return path.split('/').slice(0, -1);
}

function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** A reference to a project-root asset, relative to the current document. */
export function imageMarkdown(path: string, documentPath?: string): string {
  if (!validProjectPath(path)) throw new Error('图片路径无效');
  const from = directory(documentPath);
  const to = path.split('/');
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common].toLowerCase() === to[common].toLowerCase()) common++;
  const relative = [...Array(from.length - common).fill('..'), ...to.slice(common)].map(encodeSegment).join('/');
  const alt = to[to.length - 1].replace(/\.[^.]+$/, '').replace(/[\u0000-\u001f\u007f|]/g, ' ')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\\[\]`*_]/g, '\\$&');
  return `![${alt || '图片'}](${relative})`;
}

function filename(file: File): string {
  const extension = extensions[file.type.toLowerCase()];
  if (!extension) throw new Error(`不支持的图片类型：${file.name || '未命名文件'}。请选择 PNG、JPEG、GIF、WebP、BMP、SVG、AVIF 或 ICO。`);
  if (file.size === 0) throw new Error(`图片为空：${file.name || '未命名文件'}`);
  const original = file.name.replace(/\\/g, '/').split('/').pop() || '图片';
  const stem = original.replace(/\.[^.]*$/, '').normalize('NFC').replace(/[^\p{L}\p{N}\p{M} _().\-]/gu, '-').trim().replace(/^\.+|\.+$/g, '').slice(0, 120).trim() || '图片';
  const suffix = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.exec(original)?.[1].toLowerCase();
  // Keep the familiar JPEG extension, but do not trust arbitrary file suffixes.
  return `${stem}.${extension === 'jpg' && suffix === 'jpeg' ? 'jpeg' : extension}`;
}

/** Validate the whole operation before changing any caller-owned asset state. */
export function prepareImageAssets(existing: Record<string, Blob>, files: File[], documentPath?: string, replacePath?: string): {
  assets: Record<string, Blob>; paths: string[]; markdown: string[];
} {
  const assets: Record<string, Blob> = Object.assign(Object.create(null), existing);
  const used = new Set(Object.keys(assets).map(path => path.toLowerCase()));
  const paths: string[] = [];
  const prefix = [...directory(documentPath), 'images'].join('/');
  let target: string | undefined;
  if (replacePath !== undefined) {
    target = Object.keys(assets).find(path => path.toLowerCase() === replacePath.toLowerCase());
    if (!target || !validProjectPath(target)) throw new Error('要替换的图片已不存在');
    if (files.length !== 1) throw new Error('替换图片时请选择一个文件');
  }
  if (Object.keys(assets).length + (target ? 0 : files.length) > MAX_IMAGES) throw new Error('项目最多支持 200 张图片，请减少图片');
  for (const file of files) {
    const name = filename(file);
    let path = target ?? `${prefix}/${name}`;
    if (!target) {
      const dot = name.lastIndexOf('.');
      for (let suffix = 2; used.has(path.toLowerCase()); suffix++) path = `${prefix}/${name.slice(0, dot)}-${suffix}${name.slice(dot)}`;
    }
    if (!validProjectPath(path)) throw new Error('图片路径过长或无效');
    assets[path] = file; used.add(path.toLowerCase()); paths.push(path);
  }
  if (Object.values(assets).reduce((bytes, blob) => bytes + blob.size, 0) > MAX_BYTES) throw new Error('图片总大小超过 100MiB，请减少图片');
  return { assets, paths, markdown: paths.map(path => imageMarkdown(path, documentPath)) };
}
