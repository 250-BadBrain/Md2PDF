import {test,expect} from '@playwright/test';
test('mapped preview and diagnostics navigate using full YAML source lines',async({page})=>{
  await page.goto('/');
  const source='---\ntitle: Map\n---\n# Header\n\nParagraph **text**\n\n![missing](no.png)';
  const editor=page.getByRole('textbox',{name:'Markdown 源代码编辑区'});await editor.fill(source);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.pdf-content p').first()).toHaveAttribute('data-source-line','6');
  await page.locator('.pdf-content p').first().click();
  await expect.poll(() => editor.evaluate((area:HTMLTextAreaElement)=>area.value.slice(area.selectionStart,area.selectionEnd))).toContain('Paragraph **text**');
  await page.locator('.document-warnings summary').click();
  await page.getByRole('button',{name:/第 8 行：图片未找到/}).click();
  await expect.poll(() => editor.evaluate((area:HTMLTextAreaElement)=>area.value.slice(area.selectionStart,area.selectionEnd))).toBe('![missing](no.png)');
});
test('editor source navigation reaches a virtualized distant page',async({page})=>{
  await page.goto('/');
  await page.getByRole('textbox',{name:'Markdown 源代码编辑区'}).fill(Array.from({length:15},(_,i)=>`# Chapter ${i}\n\nText-${i}`).join('\n\n[pagebreak]\n\n'));
  await expect(page.locator('.pdf-page-shell')).toHaveCount(15);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('preview-navigation',{detail:87})));
  await expect(page.locator('[data-page="15"] .pdf-page')).toBeVisible();
});

test('continuous scroll sync advances both panes without moving the input pane back', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Markdown 源代码编辑区' });
  await editor.fill(Array.from({ length: 18 }, (_, index) =>
    `# Page ${index + 1}\n\n${Array.from({ length: 12 }, (_, paragraph) => `Paragraph ${index + 1}.${paragraph} with some content.`).join('\n\n')}`,
  ).join('\n\n[pagebreak]\n\n'));
  await expect(page.locator('.pdf-page-shell')).toHaveCount(18);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('同步滚动').check();
  const result = await editor.evaluate(async area => {
    const preview = document.querySelector<HTMLElement>('.preview-panel')!;
    const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const run = async (input: HTMLElement, output: HTMLElement, start: number, end: number) => {
      const movement: number[] = [];
      const inputs: number[] = [];
      const changes: number[] = [];
      const capture = () => changes.push(output.scrollTop);
      output.addEventListener('scroll', capture);
      for (let step = 0; step <= 20; step++) {
        input.scrollTop = start + (end - start) * step / 20;
        const requested = input.scrollTop;
        // Allow native scroll events, React's commit and the next paint.
        for (let count = 0; count < 4; count++) await frame();
        movement.push(output.scrollTop);
        inputs.push(Math.abs(input.scrollTop - requested));
      }
      const settled = output.scrollTop;
      await new Promise(resolve => setTimeout(resolve, 180));
      output.removeEventListener('scroll', capture);
      return { movement, inputs, changes, settled, final: output.scrollTop };
    };
    const forward = await run(area, preview, 0, (area.scrollHeight - area.clientHeight) * 0.92);
    const reverse = await run(preview, area, preview.scrollTop, 0);
    return { forward, reverse, editorMax: area.scrollHeight - area.clientHeight, previewMax: preview.scrollHeight - preview.clientHeight };
  });
  for (const direction of [result.forward, result.reverse]) {
    expect(Math.max(...direction.inputs)).toBeLessThanOrEqual(1);
    expect(direction.final).toBe(direction.settled);
    expect(new Set(direction.movement).size).toBeGreaterThan(12);
  }
  expect(result.forward.final).toBeGreaterThan(result.previewMax * 0.65);
  expect(result.reverse.final).toBe(0);
  expect(result.reverse.movement[0]).toBeGreaterThan(result.editorMax * 0.65);
  expect(result.forward.changes.every((top, index, changes) => index === 0 || top >= changes[index - 1] - 1)).toBe(true);
  expect(result.reverse.changes.every((top, index, changes) => index === 0 || top <= changes[index - 1] + 1)).toBe(true);
  await expect(page.locator('[data-page="1"] h1')).toBeInViewport();
});
