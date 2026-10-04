import type { DocumentMeta, RenderedDocument } from './markdown';
export type ParseRequest = { source: string; path?: string; assets: Record<string, string>; preferences: DocumentMeta };
export async function parseWithWorker(request: ParseRequest, fallback: () => Promise<RenderedDocument>, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (request.source.length < 60000 || typeof Worker === 'undefined') return fallback();
  try {
    return await new Promise<RenderedDocument>((resolve, reject) => {
      const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' });
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate(); };
      const abort = () => { cleanup(); reject(signal!.reason); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Worker 解析超时')); }, 30000);
      worker.onmessage = ({ data }) => { cleanup(); data.error ? reject(new Error(data.error)) : resolve(data); };
      worker.onerror = () => { cleanup(); reject(new Error('Worker 不可用')); };
      signal?.addEventListener('abort', abort, { once: true });
      worker.postMessage(request);
    });
  } catch (error) {
    signal?.throwIfAborted();
    console.warn('Worker parsing failed; using local parser', error);
    return fallback();
  }
}
