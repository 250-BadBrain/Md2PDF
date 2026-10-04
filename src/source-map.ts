export type SourceLocation = { line: number; end: number };
export function sourceLocation(element: Element | null): SourceLocation | undefined {
  const block = element?.closest<HTMLElement>('[data-source-line]');
  const line = Number(block?.dataset.sourceLine); const end = Number(block?.dataset.sourceEnd);
  return Number.isInteger(line) && line > 0 ? { line, end: Math.max(line, end || line) } : undefined;
}
export function navigateToSource(location: SourceLocation) { window.dispatchEvent(new CustomEvent('source-navigation', { detail: location })); }
export function lineOffset(source: string, line: number) {
  let offset = 0;
  for (let index = 1; index < line; index++) { const next = source.indexOf('\n', offset); if (next < 0) return source.length; offset = next + 1; }
  return offset;
}
// Measure real textarea wrapping with an offscreen mirror, including font and padding.
export function editorLinePositions(area: HTMLTextAreaElement, source: string) {
  const mirror = document.createElement('div'); const style = getComputedStyle(area);
  for (const property of ['font-family','font-size','line-height','letter-spacing','padding','box-sizing','word-break','overflow-wrap','tab-size']) mirror.style.setProperty(property, style.getPropertyValue(property));
  mirror.style.cssText += `;position:fixed;left:-100000px;top:0;width:${area.clientWidth}px;white-space:pre-wrap;overflow-wrap:break-word;visibility:hidden;`;
  const lines = source.split('\n');
  lines.forEach((line, index) => { const marker = document.createElement('span'); marker.dataset.line = String(index + 1); marker.textContent = line || '\u200b'; mirror.append(marker); if (index < lines.length - 1) mirror.append('\n'); });
  document.body.append(mirror); const top = mirror.getBoundingClientRect().top;
  const positions = Array.from(mirror.children, (line) => line.getBoundingClientRect().top - top);
  mirror.remove(); return positions;
}
