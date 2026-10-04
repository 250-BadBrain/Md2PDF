import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { renderMarkdownToHtml } from '../src/markdown';
import { canonicalHtml, commonmark, readGfm } from './spec-support';

describe('Official examples through the application renderer', () => {
  for (const [suite, examples] of [['commonmark', commonmark], ['gfm', readGfm()]] as const) {
    it(`${suite}: every example is checked, with exact known differences`, async () => {
      expect(examples.length).toBe(suite === 'commonmark' ? 652 : 672);
      const file = suite === 'commonmark' ? 'commonmark-0.31.2.json' : 'gfm-0.29-spec.txt';
      const hash = createHash('sha256').update(fs.readFileSync(`tests/fixtures/spec/${file}`)).digest('hex');
      expect(hash).toBe(suite === 'commonmark' ? 'd431b29d97b6f73e69d547109cf5081578fac931e72afe95639ebe766c1b2a20' : '7d8e5814befec287ac116786d81ff14e0adc9b13295b4494649e995408fd871c');
      const differences = [];
      for (const example of examples) {
        // Official examples describe syntax, not uploaded assets. Supply their local
        // image paths unchanged; missing-upload behavior has separate product tests.
        const expectedDocument = document.createElement('template'); expectedDocument.innerHTML = example.html;
        const assets = Object.fromEntries([...expectedDocument.content.querySelectorAll('img[src]')]
          .map((image) => [image.getAttribute('src')!, `blob:spec-${encodeURIComponent(image.getAttribute('src')!)}`]));
        const rendered = await renderMarkdownToHtml(example.markdown, undefined, assets, { softBreaks: 'space' });
        const actual = canonicalHtml(rendered.html);
        const expected = canonicalHtml(example.html);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) differences.push({
          example: example.example, section: example.section, markdown: example.markdown, expected, actual,
        });
      }
      // Diagnostic output is opt-in; reviewed baselines must be committed separately.
      if (process.env.SPEC_DIAGNOSTICS === '1') fs.writeFileSync(`tmp/${suite}-differences.json`, JSON.stringify(differences, null, 2));
      const known = JSON.parse(fs.readFileSync(`tests/fixtures/spec/${suite}-differences.json`, 'utf8'));
      for (const entry of known) expect(entry.reason).toEqual(expect.any(String));
      expect(differences).toEqual(known.map(({ reason: _reason, ...entry }: { reason: string }) => entry));
    }, 60000);
  }
});
