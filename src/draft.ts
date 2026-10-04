export const DRAFT_KEY = 'md2pdf:draft:v1';
export type Draft = { source: string; name?: string; path?: string; savedAt: number };
export function readDraft(): Draft | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (value && typeof value.source === 'string' && typeof value.savedAt === 'number') return {
      source: value.source, savedAt: value.savedAt,
      name: typeof value.name === 'string' ? value.name : undefined,
      path: typeof value.path === 'string' ? value.path : undefined,
    };
  } catch { /* Corrupt or unavailable storage must not block editing. */ }
}
export function saveDraft(draft: Draft) {
  try {
    if (draft.source.length > 2 * 1024 * 1024) return false;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); return true;
  } catch { return false; }
}
export function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); return true; } catch { return false; }
}

export function replaceText(source: string, find: string, replacement: string) {
  return find ? source.split(find).join(replacement) : source;
}
