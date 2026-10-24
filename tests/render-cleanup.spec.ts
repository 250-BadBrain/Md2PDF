import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('invalid nearby footnote fragments preserve the document and valid footnotes', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill('---\nfootnotes: near-reference\n---\n# Notes\n\n<a class="footnote-ref" href="#%">Malformed percent</a> <a class="footnote-ref" href="#%E0%A4">Malformed UTF-8</a> and valid[^1].\n\n[pagebreak]\n\n# Later\n\n[^1]: Valid nearby note');
  await expect(page.locator('.pdf-page-shell')).toHaveCount(2);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('[data-page="1"] .pdf-content')).toContainText('Malformed percent');
  await expect(page.locator('[data-page="1"] .pdf-content')).toContainText('Malformed UTF-8');
  await expect(page.locator('[data-page="1"] .footnotes')).toContainText('Valid nearby note');
  await expect(page.locator('[data-page="1"] #fn1')).toHaveCount(1);
  await expect(page.locator('[data-page="2"]')).toContainText('Later');
});

test('repeated invalid Mermaid renders leave source diagnostics without temporary body nodes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { renderMarkdownToHtml } = await import('/src/markdown.ts');
    const { locatedWarnings } = await import('/src/diagnostics.ts');
    const sources = ['not a diagram', 'flowchart TD\nA[', 'not a diagram'];
    const failed = [];
    for (const source of sources) {
      const rendered = await renderMarkdownToHtml(`\`\`\`mermaid\n${source}\n\`\`\``, undefined, {});
      const wrapper = document.createElement('div'); wrapper.innerHTML = rendered.html;
      failed.push({ source: wrapper.querySelector('.mermaid-error code')?.textContent, warnings: locatedWarnings([rendered.html]).map(warning => warning.message) });
    }
    const valid = await renderMarkdownToHtml('```mermaid\nflowchart LR\nA[Start] --> B[End]\n```', undefined, {});
    const wrapper = document.createElement('div'); wrapper.innerHTML = valid.html;
    return { failed, valid: !!wrapper.querySelector('.mermaid-diagram svg'), temporary: document.querySelectorAll('body > div[id^="dmermaid-"],body > iframe[id^="imermaid-"]').length };
  });
  expect(result.failed.map(render => render.source)).toEqual(['not a diagram', 'flowchart TD\nA[', 'not a diagram']);
  for (const render of result.failed) expect(render.warnings).toEqual(['Mermaid 图表解析失败，已保留源代码。']);
  expect(result.valid).toBe(true);
  expect(result.temporary).toBe(0);
});
