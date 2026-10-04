import { afterEach, expect, it, vi } from 'vitest';
import { clearDraft, DRAFT_KEY, readDraft, replaceText, saveDraft } from '../src/draft';
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
it('recovers exact Markdown including empty drafts and tolerates corrupt storage', () => {
  const draft = { source: '# 中文\n\n', name: 'note.md', savedAt: 10 };
  expect(saveDraft(draft)).toBe(true); expect(readDraft()).toEqual(draft);
  expect(saveDraft({ source: '', savedAt: 11 })).toBe(true); expect(readDraft()?.source).toBe('');
  localStorage.setItem(DRAFT_KEY, '{bad'); expect(readDraft()).toBeUndefined();
  expect(clearDraft()).toBe(true);
});
it('reports capacity and storage failures without modifying the old draft', () => {
  saveDraft({ source: 'old', savedAt: 10 });
  expect(saveDraft({ source: 'a'.repeat(2 * 1024 * 1024 + 1), savedAt: 11 })).toBe(false);
  expect(readDraft()?.source).toBe('old');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(saveDraft({ source: 'new', savedAt: 12 })).toBe(false);
});
it('replaces literal text including regex characters and preserves empty searches', () => {
  expect(replaceText('a.* a.*', 'a.*', '$1')).toBe('$1 $1');
  expect(replaceText('abc', '', 'x')).toBe('abc');
});
