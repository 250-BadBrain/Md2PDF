import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import { imageMarkdown, prepareImageAssets } from '../src/image-assets';
import { renderMarkdownToHtml } from '../src/markdown';

const picture = (name = 'picture.png', type = 'image/png') => new File(['image bytes'], name, { type });
function sized(bytes: number) {
  const blob = new Blob(['image bytes'], { type: 'image/png' });
  Object.defineProperty(blob, 'size', { value: bytes }); return blob;
}

describe('Local image assets', () => {
  it('adds unique case-insensitive paths beside a nested document without mutating existing images', () => {
    const original = picture('Photo.PNG');
    const existing = { 'book/docs/images/Photo.PNG': original };
    const result = prepareImageAssets(existing, [picture('photo.png'), picture('Photo.png')], 'book/docs/report.md');
    expect(result.paths).toEqual(['book/docs/images/photo-2.png', 'book/docs/images/Photo-3.png']);
    expect(result.markdown).toEqual(['![photo-2](images/photo-2.png)', '![Photo-3](images/Photo-3.png)']);
    expect(Object.keys(existing)).toEqual(['book/docs/images/Photo.PNG']);
    expect(result.assets['book/docs/images/Photo.PNG']).toBe(original);
  });

  it('resolves encoded relative references through the production image resolver', async () => {
    const result = prepareImageAssets({}, [picture('图 (第一张).png')], 'book/chapters/report.md');
    const rendered = await renderMarkdownToHtml(result.markdown[0], 'book/chapters/report.md', { [result.paths[0].toLowerCase()]: 'blob:local-picture' });
    const doc = document.createElement('div'); doc.innerHTML = rendered.html;
    expect(doc.querySelector('img')?.getAttribute('src')).toBe('blob:local-picture');
    expect(result.markdown[0]).toContain('%20%28');
    expect(imageMarkdown('book/pictures/a.png', 'book/chapters/deep/report.md')).toBe('![a](../../pictures/a.png)');
  });

  it('escapes Markdown, HTML and URL punctuation without creating executable markup', () => {
    const path = 'pictures/a[evil](*_`<svg onload="bad()">&name).png';
    const markdown = imageMarkdown(path);
    const doc = document.createElement('div'); doc.innerHTML = new MarkdownIt({ html: true }).render(markdown);
    expect(doc.querySelectorAll('img')).toHaveLength(1);
    expect(doc.querySelector('svg,script,[onload],[onerror]')).toBeNull();
    expect(doc.querySelector('img')?.alt).toContain('onload="bad()"');
    expect(doc.querySelector('img')?.getAttribute('src')).toContain('%28');
    expect(() => imageMarkdown('../outside.png')).toThrow('图片路径无效');
  });

  it('replaces existing bytes at the exact original path, including at the image-count limit', () => {
    const existing = Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`images/${index}.png`, picture()]));
    existing['images/0.png'] = sized(90 * 1048576) as File;
    const replacement = picture('different.svg', 'image/svg+xml');
    const result = prepareImageAssets(existing, [replacement], undefined, 'IMAGES/0.PNG');
    expect(result.paths).toEqual(['images/0.png']);
    expect(Object.keys(result.assets)).toHaveLength(200);
    expect(result.assets['images/0.png']).toBe(replacement);
    expect(result.markdown[0]).toBe('![0](images/0.png)');
    expect(existing['images/0.png']).not.toBe(replacement);
  });

  it('rejects invalid MIME, empty files, missing replacements and over-limit additions atomically', () => {
    const existing = { 'images/a.png': picture('a.png') };
    expect(() => prepareImageAssets(existing, [picture('valid.png'), picture('pretend.png', 'text/plain')])).toThrow('不支持的图片类型');
    expect(Object.keys(existing)).toEqual(['images/a.png']);
    expect(() => prepareImageAssets({}, [new File([], 'empty.png', { type: 'image/png' })])).toThrow('图片为空');
    expect(() => prepareImageAssets(existing, [picture()], undefined, 'missing.png')).toThrow('已不存在');
    expect(() => prepareImageAssets(existing, [picture(), picture()], undefined, 'images/a.png')).toThrow('一个文件');
    const full = Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`images/${index}.png`, picture()]));
    expect(() => prepareImageAssets(full, [picture()])).toThrow('200');
    expect(() => prepareImageAssets({ 'large.png': sized(100 * 1048576) }, [picture()])).toThrow('100MiB');
  });

  it('sanitizes names and uses MIME extensions rather than unsafe or misleading filenames', () => {
    const result = prepareImageAssets({}, [picture('../../bad:<img>.svg', 'image/jpeg'), picture('__proto__.png')]);
    expect(result.paths).toEqual(['images/bad--img-.jpg', 'images/__proto__.png']);
    expect(Object.getPrototypeOf(result.assets)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(result.assets, 'images/__proto__.png')).toBe(true);
  });
});
