import { renderMarkdownToHtml, type DocumentMeta } from './markdown';
import { paginateHtml } from './pagination';
import { resolveLayout } from './settings';

type Preview = { pages: string[]; meta: DocumentMeta };
const cache = new Map<string, Preview>();
let bytes = 0;
const LIMIT = 8 * 1024 * 1024;

export function clearPreviewCache() { cache.clear(); bytes = 0; }

export async function buildPreview(source: string, path: string | undefined, assets: Record<string, string>, preferences: DocumentMeta, signal?: AbortSignal) {
  const key = JSON.stringify([source, path, assets, preferences]);
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key); cache.set(key, existing);
    signal?.throwIfAborted();
    return existing;
  }
  const rendered = await renderMarkdownToHtml(source, path, assets, preferences, signal);
  signal?.throwIfAborted();
  const meta = resolveLayout(rendered.meta, preferences);
  const pages = await paginateHtml(rendered.html, meta, signal);
  signal?.throwIfAborted();
  const result = { pages, meta };
  const size = (key.length + pages.join('').length) * 2;
  if (size <= LIMIT) {
    cache.set(key, result); bytes += size;
    while (cache.size > 4 || bytes > LIMIT) {
      const oldest = cache.keys().next().value!;
      const value = cache.get(oldest)!;
      bytes -= (oldest.length + value.pages.join('').length) * 2;
      cache.delete(oldest);
    }
  }
  return result;
}
