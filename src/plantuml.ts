import DOMPurify from 'dompurify';
import engineUrl from '@plantuml/core/plantuml.js?url';
import graphvizUrl from '@plantuml/core/viz-global.js?url';

const MAX_SOURCE = 40_000;
const MAX_LINES = 1_000;
const MAX_SVG = 4_000_000;
const TIMEOUT = 20_000;
type EngineFrame = { frame: HTMLIFrameElement; token: string };
let engineFrame: EngineFrame | undefined;
let queue: Promise<unknown> = Promise.resolve();

/** The browser build deliberately has no remote includes, external assets or preprocessor. */
export function validatePlantumlSource(source: string): string[] {
  if (source.length > MAX_SOURCE) throw new Error('PlantUML 源码超过 40,000 字符限制。');
  const lines = source.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  if (lines.length > MAX_LINES || lines.some((line) => line.length > 2_000)) {
    throw new Error('PlantUML 超过 1,000 行或单行 2,000 字符限制。');
  }
  if (/\u0000|[\u0001-\u0008\u000b\u000c\u000e-\u001f]/u.test(source)) {
    throw new Error('PlantUML 包含不支持的控制字符。');
  }
  // Directives start a source line; ordinary message text may contain '!'.
  // Inline %functions can generate content or load resources, so reject them.
  if (/^\s*!/m.test(source) || /%[a-z_]\w*\s*\(/i.test(source)) {
    throw new Error('纯前端 PlantUML 不支持预处理指令、宏、include 和 theme；请使用图形语法直接定义内容。');
  }
  // Bare // is PlantUML's native Creole italic markup, not a resource URL.
  if (/(?:https?|ftp|file|jar|javascript|data):|\[\[/i.test(source)) {
    throw new Error('纯前端 PlantUML 不支持 URL、外部链接或联网资源。');
  }
  if (/<\s*(?:img|image|svg|script|iframe|object|embed)\b|<(?:#[\w]+)?:|<&|<\$|^\s*(?:sprite|fontpath|set_sprites)\b/im.test(source)) {
    throw new Error('纯前端 PlantUML 不支持外部图片、图标库、字体和嵌入内容。');
  }
  const statements = lines.filter((line) => line.trim() && !line.trimStart().startsWith("'"));
  const start = statements[0]?.trim().match(/^@start([a-z]+)(?:[ \t]+[^\r\n]+)?$/i);
  if (!start || statements[statements.length - 1]?.trim().toLowerCase() !== `@end${start[1].toLowerCase()}`) {
    throw new Error('PlantUML 必须包含匹配的 @start… 和 @end… 标记，且每个代码块只能定义一张图。');
  }
  if (statements.slice(1, -1).some((line) => /^\s*@(?:start|end)/i.test(line))) {
    throw new Error('每个 PlantUML 代码块只能定义一张图。');
  }
  return lines;
}

/** Returned SVG remains local and cannot carry active content or fetchable references. */
export function sanitizePlantumlSvg(svg: string): string {
  if (svg.length > MAX_SVG) throw new Error('PlantUML SVG 超过 4 MB 限制。');
  const cleaned = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject', 'style', 'image', 'a', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['href', 'xlink:href', 'src'],
  });
  const parsed = new DOMParser().parseFromString(cleaned, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.localName !== 'svg' || parsed.querySelector('parsererror')) throw new Error('PlantUML 未生成有效 SVG。');
  const texts = Array.from(root.querySelectorAll('text')).map((element) => element.textContent?.trim() ?? '');
  const errorLocation = texts.find((text) => /^\[From textarea \(line \d+\)/.test(text));
  if (texts[0]?.startsWith('PlantUML version ') && errorLocation) {
    throw new Error(`PlantUML 语法错误：${texts[texts.length - 1]} ${errorLocation}`);
  }
  [root, ...Array.from(root.querySelectorAll('*'))].forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const value = attribute.value;
      if (/url\s*\(/i.test(value) && !/^url\(#[\w.-]+\)$/.test(value.trim()) || /@import|expression\s*\(/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  const width = Number(root.getAttribute('width'));
  const height = Number(root.getAttribute('height'));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 8_192 || height > 8_192) {
    throw new Error('PlantUML 图形尺寸无效或超过 8,192 像素限制。');
  }
  return new XMLSerializer().serializeToString(root);
}

function abortError() { return new DOMException('PlantUML 渲染已取消。', 'AbortError'); }
function destroyEngine() {
  engineFrame?.frame.remove();
  engineFrame = undefined;
}

// Only trusted installed engine code is included in srcdoc; diagram source uses postMessage.
function engineDocument(token: string, engine: string, graphviz: string) {
  const literal = (value: string) => JSON.stringify(value).replace(/</g, '\\u003c');
  const nonce = token.replace(/-/g, '');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' blob: 'wasm-unsafe-eval'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"></head><body><script nonce="${nonce}">${graphviz.replace(/<\/script/gi, '<\\/script')}</script><script type="module" nonce="${nonce}">
const token = ${literal(token)};
const send = (type, id, value) => parent.postMessage({ token, type, id, value }, '*');
globalThis.PLANTUML_STDLIB_LOADER = (_name, _ok, fail) => { fail('离线渲染不支持加载外部库。'); return true; };
globalThis.PLANTUML_THEMES = {};
const url = URL.createObjectURL(new Blob([${literal(engine)}], {type: 'application/javascript'}));
try {
  const engine = await import(url);
  URL.revokeObjectURL(url);
  addEventListener('message', (event) => {
    const message = event.data;
    if (event.source !== parent || !message || message.token !== token || message.type !== 'render' || !Array.isArray(message.lines)) return;
    try { engine.renderToString(message.lines, svg => send('svg', message.id, svg), error => send('error', message.id, String(error)), {maxSvgSize: 8192}); }
    catch (error) { send('error', message.id, String(error)); }
  });
  send('ready', '', '');
} catch (error) { send('error', '', String(error)); }
</script></body></html>`;
}

async function createEngine(signal: AbortSignal): Promise<EngineFrame> {
  if (signal.aborted) throw abortError();
  const resources = await Promise.all([engineUrl, graphvizUrl].map(async (url) => {
    const response = await fetch(url, { signal, credentials: 'same-origin' });
    if (!response.ok) throw new Error('无法加载本地 PlantUML 引擎，请刷新页面后重试。');
    return response.text();
  }));
  if (signal.aborted) throw abortError();
  const frame = document.createElement('iframe');
  const token = crypto.randomUUID();
  const instance = { frame, token };
  frame.hidden = true;
  frame.title = 'PlantUML 本地隔离渲染器';
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('sandbox', 'allow-scripts');
  engineFrame = instance;
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); removeEventListener('message', onMessage); signal.removeEventListener('abort', onAbort); };
    const fail = (error: unknown) => { cleanup(); destroyEngine(); reject(error); };
    const onAbort = () => fail(abortError());
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow || event.data?.token !== token) return;
      if (event.data.type === 'ready') { cleanup(); resolve(instance); }
      else if (event.data.type === 'error') fail(new Error(`PlantUML 引擎加载失败：${String(event.data.value)}`));
    };
    const timer = setTimeout(() => fail(new Error('PlantUML 引擎加载超时，请缩小图形后重试。')), TIMEOUT);
    signal.addEventListener('abort', onAbort, { once: true });
    addEventListener('message', onMessage);
    frame.srcdoc = engineDocument(token, resources[0], resources[1]);
    document.body.appendChild(frame);
  });
}

async function runRender(lines: string[], signal: AbortSignal): Promise<string> {
  const instance = engineFrame ?? await createEngine(signal);
  if (signal.aborted) throw abortError();
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); removeEventListener('message', onMessage); signal.removeEventListener('abort', onAbort); };
    const fail = (error: unknown) => { cleanup(); destroyEngine(); reject(error); };
    const onAbort = () => fail(abortError());
    const onMessage = (event: MessageEvent) => {
      if (event.source !== instance.frame.contentWindow || event.data?.token !== instance.token || event.data.id !== id) return;
      if (event.data.type === 'error') fail(new Error(`PlantUML 渲染失败：${String(event.data.value)}`));
      else if (event.data.type === 'svg' && typeof event.data.value === 'string') {
        try { const svg = sanitizePlantumlSvg(event.data.value); cleanup(); resolve(svg); }
        catch (error) { fail(error); }
      }
    };
    const timer = setTimeout(() => fail(new Error('PlantUML 渲染超时，请缩小图形后重试。')), TIMEOUT);
    signal.addEventListener('abort', onAbort, { once: true });
    addEventListener('message', onMessage);
    instance.frame.contentWindow?.postMessage({ token: instance.token, type: 'render', id, lines }, '*');
  });
}

/** Serialize renders because the official engine shares an internal request queue. */
export async function renderPlantuml(source: string, signal?: AbortSignal): Promise<string> {
  const lines = validatePlantumlSource(source);
  if (signal?.aborted) throw abortError();
  const controller = new AbortController();
  return new Promise<string>((resolve, reject) => {
    const onAbort = () => { controller.abort(); reject(abortError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
    const operation = queue.then(async () => {
      if (controller.signal.aborted) throw abortError();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT);
      try { return await runRender(lines, controller.signal); }
      catch (error) { if (timedOut) throw new Error('PlantUML 加载或渲染超时，请缩小图形后重试。'); throw error; }
      finally { clearTimeout(timer); }
    });
    queue = operation.catch(() => undefined);
    operation.then(resolve, reject).finally(() => signal?.removeEventListener('abort', onAbort));
  });
}
