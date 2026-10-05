// Small original line drawings. No Iconify, font or illustration service is used.
const drawings: Record<string, string> = {
  'rocket-launch': '<path d="M9 15c-1-4 3-10 10-10 0 7-6 11-10 10Z"/><path d="m9 9-4 1-2 5 6-1m6 1-1 6-5 2-1-6m-2 1-3 3m3 0-2 2"/><circle cx="15" cy="9" r="2"/>',
  'progress-check': '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7M12 3v3M3 12h3M12 18v3M18 12h3"/>',
  'account-sync': '<circle cx="12" cy="7" r="3"/><path d="M7 17v-2a5 5 0 0 1 10 0v2M3 14a9 9 0 0 0 16 6m-3 0h3v-3M21 10A9 9 0 0 0 5 4m3 0H5v3"/>',
  'account-group': '<circle cx="12" cy="7" r="3"/><circle cx="4" cy="9" r="2"/><circle cx="20" cy="9" r="2"/><path d="M7 21v-4a5 5 0 0 1 10 0v4M1 19v-3a3 3 0 0 1 4-3m18 6v-3a3 3 0 0 0-4-3"/>',
  fallback: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01"/>',
};

export function localIconName(value: unknown): string {
  if (typeof value !== 'string') return 'fallback';
  const name = value.replace(/^(?:mdi:|ref:local:)/, '');
  return Object.prototype.hasOwnProperty.call(drawings, name) ? name : 'fallback';
}

export function localIconSvg(name: string): string {
  const drawing = drawings[localIconName(name)];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${drawing}</svg>`;
}
