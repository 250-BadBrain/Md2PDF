import type { DocumentMeta } from './markdown';

export type LayoutSettings = Required<Pick<DocumentMeta, 'cover' | 'theme' | 'footnotes' | 'softBreaks' | 'paper' | 'orientation' | 'margin' | 'fontFamily' | 'fontSize' | 'lineHeight' | 'header' | 'footer' | 'pageNumbers' | 'tocPageNumbers' | 'chapterNewPage' | 'chapterLevel'>>;
export const DEFAULT_LAYOUT: LayoutSettings = {
  cover: false, theme: 'classic', footnotes: 'end',
  softBreaks: 'newline', paper: 'A4', orientation: 'portrait', margin: '16mm', fontFamily: 'sans', fontSize: 14, lineHeight: 1.72,
  header: '', footer: '', pageNumbers: false, tocPageNumbers: true, chapterNewPage: false, chapterLevel: 2,
};
export const SETTINGS_KEY = 'md2pdf:layout:v1';
const clamp = (value: unknown, fallback: number, minimum: number, maximum: number) => {
  const number = typeof value === 'number' ? value : Number(value);
  return value === null || value === '' || !Number.isFinite(number) ? fallback : Math.min(maximum, Math.max(minimum, number));
};
export function normalizeSettings(value: unknown): LayoutSettings {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result = { ...DEFAULT_LAYOUT };
  if (input.cover === true) result.cover = true;
  if (input.theme === 'book' || input.theme === 'compact') result.theme = input.theme;
  if (input.footnotes === 'near-reference') result.footnotes = input.footnotes;
  if (input.softBreaks === 'space') result.softBreaks = 'space';
  if (['A4', 'A5', 'Letter'].includes(String(input.paper))) result.paper = input.paper as LayoutSettings['paper'];
  if (input.orientation === 'landscape') result.orientation = 'landscape';
  if (['sans', 'serif', 'mono'].includes(String(input.fontFamily))) result.fontFamily = input.fontFamily as LayoutSettings['fontFamily'];
  result.fontSize = clamp(input.fontSize, 14, 10, 24);
  result.lineHeight = clamp(input.lineHeight, 1.72, 1.2, 2.4);
  result.chapterLevel = Math.round(clamp(input.chapterLevel, 2, 1, 6));
  if (typeof input.margin === 'string' && /^\d+(?:\.\d+)?mm$/.test(input.margin)) result.margin = `${clamp(parseFloat(input.margin), 16, 8, 50)}mm`;
  for (const key of ['header', 'footer'] as const) if (typeof input[key] === 'string') result[key] = input[key].slice(0, 1000);
  for (const key of ['pageNumbers', 'tocPageNumbers', 'chapterNewPage'] as const) if (typeof input[key] === 'boolean') result[key] = input[key];
  return result;
}
export function loadSettings() {
  try { return normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')); }
  catch { return { ...DEFAULT_LAYOUT }; }
}
export function saveSettings(value: LayoutSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(value))); return true; }
  catch { return false; }
}
export function resolveLayout(meta: DocumentMeta, preferences: DocumentMeta): DocumentMeta {
  return { ...preferences, ...Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined)) };
}
export function layoutVariables(meta: DocumentMeta) {
  const { width, height } = pageDimensions(meta);
  const fonts = {
    sans: '"Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif',
    serif: '"SimSun", "Noto Serif CJK SC", Georgia, serif',
    mono: 'Consolas, "Microsoft YaHei", monospace',
  };
  return {
    '--pdf-heading-font': meta.theme === 'book' ? fonts.serif : 'inherit',
    '--pdf-block-gap': meta.theme === 'compact' ? '0.5em' : '1em',
    '--pdf-page-width': `${width}mm`, '--pdf-page-height': `${height}mm`,
    '--pdf-font-family': fonts[meta.fontFamily || 'sans'],
    '--pdf-font-size': `${meta.fontSize || 14}px`, '--pdf-line-height': String(meta.lineHeight || 1.72),
  };
}

export function pageDimensions(meta: DocumentMeta = {}) {
  const paper = meta.paper || 'A4';
  const [width, height] = paper === 'A5' ? [148, 210] : paper === 'Letter' ? [215.9, 279.4] : [210, 297];
  return meta.orientation === 'landscape' ? { width: height, height: width } : { width, height };
}
