export type ExportQuality = 'small' | 'balanced' | 'high';
export const QUALITY = {
  small: { scale: 1, jpeg: 0.72 },
  balanced: { scale: 1.5, jpeg: 0.85 },
  high: { scale: 2, jpeg: 0.98 },
} as const;
export type ExportSettings = { quality: ExportQuality; batchBytes: number; batchFiles: number };
export function normalizeExportSettings(value: unknown): ExportSettings {
  const input = value && typeof value === 'object' ? value as Partial<ExportSettings> : {};
  return { quality: input.quality && Object.prototype.hasOwnProperty.call(QUALITY,input.quality) ? input.quality : 'high',
    batchBytes: Math.min(128, Math.max(8, Number(input.batchBytes) / 1048576 || 32)) * 1048576,
    batchFiles: Math.min(50, Math.max(1, Math.round(Number(input.batchFiles) || 10))) };
}
export function loadExportSettings() {
  try { return normalizeExportSettings(JSON.parse(localStorage.getItem('md2pdf:export:v1') || 'null')); }
  catch { return normalizeExportSettings(null); }
}
export function saveExportSettings(value: ExportSettings) {
  try { localStorage.setItem('md2pdf:export:v1', JSON.stringify(normalizeExportSettings(value))); } catch { /* Choice still works for this session. */ }
}
export function shouldFlushBatch(bytes: number, files: number, nextBytes: number, settings: ExportSettings) {
  return files > 0 && (files >= settings.batchFiles || bytes + nextBytes > settings.batchBytes);
}
