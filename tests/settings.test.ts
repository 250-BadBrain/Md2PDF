import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, SETTINGS_KEY, loadSettings, normalizeSettings, pageDimensions, resolveLayout, saveSettings } from '../src/settings';
import { parseFrontMatter } from '../src/markdown';

afterEach(() => localStorage.clear());
describe('Layout preferences', () => {
  it('validates saved values and constrains geometry and typography', () => {
    expect(normalizeSettings({ paper: 'bad', fontFamily: 'url(evil)', fontSize: 900, lineHeight: -1, margin: '0mm' }))
      .toMatchObject({ paper: 'A4', fontFamily: 'sans', fontSize: 24, lineHeight: 1.2, margin: '8mm' });
    expect(normalizeSettings(null)).toEqual(DEFAULT_LAYOUT);
  });
  it('restores settings, handles corrupt storage, and resets defaults', () => {
    expect(saveSettings({ ...DEFAULT_LAYOUT, paper: 'A5', fontSize: 18 })).toBe(true);
    expect(loadSettings()).toMatchObject({ paper: 'A5', fontSize: 18 });
    localStorage.setItem(SETTINGS_KEY, '{invalid');
    expect(loadSettings()).toEqual(DEFAULT_LAYOUT);
  });
  it('saves soft break preferences and ignores invalid YAML values', () => {
    expect(saveSettings({ ...DEFAULT_LAYOUT, softBreaks: 'space' })).toBe(true);
    expect(loadSettings().softBreaks).toBe('space');
    expect(normalizeSettings({ softBreaks: 'invalid' }).softBreaks).toBe('newline');
    expect(parseFrontMatter('---\nsoftBreaks: invalid\n---\ntext').meta.softBreaks).toBeUndefined();
  });
  it('keeps document overrides and applies preferences to unset properties', () => {
    const { meta } = parseFrontMatter('---\npaper: A5\nfontSize: 18\n---\ntext');
    expect(resolveLayout(meta, { ...DEFAULT_LAYOUT, chapterLevel: 4, lineHeight: 2 })).toMatchObject({ paper: 'A5', fontSize: 18, chapterLevel: 4, lineHeight: 2 });
  });
  it('returns accurate page sizes in both orientations', () => {
    expect(pageDimensions({ paper: 'A5', orientation: 'landscape' })).toEqual({ width: 210, height: 148 });
    expect(pageDimensions({ paper: 'Letter' })).toEqual({ width: 215.9, height: 279.4 });
  });
});
