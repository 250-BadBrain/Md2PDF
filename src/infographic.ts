import { localIconName, localIconSvg } from './infographic-icons';
import type { InfographicOptions, ThemeConfig } from '@antv/infographic';

const MAX_SOURCE_LENGTH = 30_000;
const MAX_ITEMS = 200;
const MAX_DIMENSION = 4096;
const MAX_RENDER_MS = 5000;
const SYSTEM_FONT = 'Arial, "Microsoft YaHei", "PingFang SC", sans-serif';
let libraryPromise: Promise<typeof import('@antv/infographic')> | undefined;

function getLibrary() {
  libraryPromise ??= import('@antv/infographic').then((library) => {
    // Renderer loads every registered font, even unused fonts. Disable its
    // built-in CSS URLs as well as its default web font before any rendering.
    for (const font of library.getFonts()) {
      // getFonts returns encoded CSS family names; registerFont indexes by the
      // unquoted family, so re-registering the quoted name would leave old URLs.
      const fontFamily = font.fontFamily.replace(/^(['"])(.*)\1$/, '$2');
      library.registerFont({ ...font, fontFamily, baseUrl: '', fontWeight: {} });
    }
    library.setDefaultFont(SYSTEM_FONT);
    library.registerResourceLoader(async (config) => library.loadSVGResource(localIconSvg(localIconName(config.data))));
    return library;
  }).catch((error: unknown) => { libraryPromise = undefined; throw error; });
  return libraryPromise;
}

function color(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return /^(?:#[\da-f]{3,8}|[a-z]{1,30}|(?:rgb|rgba|hsl|hsla)\([\d.,%\s+-]+\))$/i.test(value) ? value : undefined;
}

function safeTheme(theme: ThemeConfig | undefined): ThemeConfig {
  const result: ThemeConfig = { base: { text: { 'font-family': SYSTEM_FONT } } };
  if (!theme) return result;
  result.colorBg = color(theme.colorBg);
  result.colorPrimary = color(theme.colorPrimary);
  if (typeof theme.palette === 'string' && /^[\w-]{1,60}$/.test(theme.palette)) result.palette = theme.palette;
  else if (Array.isArray(theme.palette)) {
    const colors = theme.palette.map(color).filter((item): item is string => !!item).slice(0, 32);
    if (colors.length) result.palette = colors;
  }
  return result;
}

/** Keep data and design values, but never forward raw SVG/HTML/CSS attributes. */
function safeOptions(options: Partial<InfographicOptions>): Partial<InfographicOptions> {
  let itemCount = 0;
  const visit = (value: unknown, depth: number, key = ''): unknown => {
    if (depth > 32) throw new Error('信息图层级超过 32 层');
    if (key === 'attributes' || key === 'style' || /^on/i.test(key) || key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
    if (key === 'icon') return `ref:local:${localIconName(value)}`;
    if (key === 'illus') {
      // The root illustration dictionary is also rewritten, not just items.
      if (value && typeof value === 'object' && !Array.isArray(value) && !('source' in value) && !('data' in value)) {
        return Object.fromEntries(Object.keys(value).map((id) => [id, 'ref:local:fallback']));
      }
      return 'ref:local:fallback';
    }
    if (Array.isArray(value)) {
      itemCount += value.length;
      if (itemCount > MAX_ITEMS) throw new Error(`信息图数据超过 ${MAX_ITEMS} 项`);
      return value.map((entry) => visit(entry, depth + 1));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).flatMap(([name, child]) => {
        const clean = visit(child, depth + 1, name);
        return clean === undefined ? [] : [[name, clean]];
      }));
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('信息图含有无效数值');
      if (!(depth === 1 && /^(?:width|height)$/.test(key)) && /(?:width|height|size|radius|gap|padding|margin|spacing|length|^x$|^y$)$/i.test(key) && Math.abs(value) > MAX_DIMENSION) throw new Error('信息图布局数值过大');
      return value;
    }
    if (typeof value === 'string') {
      if (value.length > 4000) throw new Error('信息图单项文字超过 4000 字符');
      // Labels, descriptions and values are plain text; unknown properties are
      // not allowed to smuggle attributes, URLs or inline SVG into a design.
      if (!/^(?:label|desc|title|value|id|from|to|group|category)$/.test(key) && /(?:url\s*\(|[<>]|(?:https?|data|javascript|blob|file):|\/\/)/i.test(value)) return undefined;
      return value;
    }
    return value;
  };
  const clean = visit(options, 0) as Partial<InfographicOptions>;
  clean.themeConfig = safeTheme(options.themeConfig);
  for (const key of ['width', 'height'] as const) {
    const value = options[key];
    if (value === undefined) continue;
    const parsed = typeof value === 'number' ? value : /^\d+(?:\.\d+)?(?:px)?$/.test(value) ? parseFloat(value) : NaN;
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_DIMENSION) throw new Error(`信息图${key === 'width' ? '宽' : '高'}度须为 1–${MAX_DIMENSION} 像素`);
    clean[key] = parsed;
  }
  return clean;
}

function finishSvg(source: string, label: string): string {
  if (source.length > 2_000_000) throw new Error('信息图渲染结果过大');
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = doc.documentElement;
  if (doc.querySelector('parsererror') || svg.localName !== 'svg') throw new Error('信息图未生成有效 SVG');
  if (svg.querySelectorAll('*').length > 12000) throw new Error('信息图渲染节点过多');
  const box = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (box.length !== 4 || box.some((part) => !Number.isFinite(part)) || box[2] <= 0 || box[3] <= 0 || box[2] > 16000 || box[3] > 16000) throw new Error('信息图尺寸无效或过大');
  // All resource input was replaced before the library saw it. Check its final
  // output as defense in depth while retaining its measured static text spans.
  svg.querySelectorAll('script,iframe,object,embed,image,a,style,animate,animateTransform,set').forEach((node) => node.remove());
  for (const node of [svg, ...svg.querySelectorAll('*')]) {
    for (const attr of Array.from(node.attributes)) {
      if (/^on/i.test(attr.name) || (/^(?:href|xlink:href|src)$/i.test(attr.name) && !/^#[\w-]+$/.test(attr.value)) || /url\s*\((?!\s*['"]?#[\w-]+['"]?\s*\))/i.test(attr.value)) node.removeAttribute(attr.name);
    }
  }
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(box[2]));
  svg.setAttribute('height', String(box[3]));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const background = color(svg.style.backgroundColor);
  if (background) {
    // SVG CSS background does not consistently survive image/PDF conversion.
    const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    for (const [key, value] of Object.entries({ x: box[0], y: box[1], width: box[2], height: box[3], fill: background })) rect.setAttribute(key, String(value));
    svg.prepend(rect);
  }
  svg.removeAttribute('style');
  return new XMLSerializer().serializeToString(svg);
}

/** Browser-only static SVG rendering; no document content leaves the device. */
export async function renderInfographic(source: string): Promise<string> {
  if (!source.trim()) throw new Error('信息图内容为空');
  if (source.length > MAX_SOURCE_LENGTH || source.split('\n').length > 1000) throw new Error('信息图源码超过 30000 字符或 1000 行');
  const library = await getLibrary();
  const parsed = library.parseSyntax(source);
  if (parsed.errors.length) throw new Error(`信息图语法错误：${parsed.errors[0].message}`);
  if (parsed.options.template && !library.getTemplate(parsed.options.template)) throw new Error(`未找到信息图模板：${parsed.options.template}`);
  const options = safeOptions(parsed.options);
  const host = document.createElement('div');
  host.dataset.infographicHost = '';
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('inert', '');
  Object.assign(host.style, { position: 'fixed', left: '-20000px', top: '0', width: '960px', visibility: 'hidden', pointerEvents: 'none', contain: 'layout style' });
  document.body.appendChild(host);
  let infographic: InstanceType<typeof library.Infographic> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    infographic = new library.Infographic({ ...options, container: host, editable: false, plugins: [], interactions: [] });
    const instance = infographic;
    const loaded = new Promise<void>((resolve, reject) => {
      instance.on('error', (error: unknown) => reject(error instanceof Error ? error : new Error('信息图渲染失败')));
      instance.on('loaded', () => resolve());
      instance.render();
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('信息图渲染超时')), MAX_RENDER_MS);
    });
    return await Promise.race([timeout, (async () => {
      await loaded;
      const dataUrl = await instance.toDataURL({ type: 'svg', embedResources: false });
      const prefix = 'data:image/svg+xml;charset=utf-8,';
      if (!dataUrl.startsWith(prefix)) throw new Error('信息图导出格式无效');
      return finishSvg(decodeURIComponent(dataUrl.slice(prefix.length)), options.data?.title || '信息图');
    })()]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    try { infographic?.destroy(); }
    finally { host.remove(); }
  }
}
