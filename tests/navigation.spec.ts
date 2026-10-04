import {test,expect} from '@playwright/test';
test('mapped preview and diagnostics navigate using full YAML source lines',async({page})=>{
  await page.goto('/');
  const source='---\ntitle: Map\n---\n# Header\n\nParagraph **text**\n\n![missing](no.png)';
  const editor=page.getByRole('textbox',{name:'Markdown 源代码编辑区'});await editor.fill(source);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.pdf-content p').first()).toHaveAttribute('data-source-line','6');
  await page.locator('.pdf-content p').first().click();
  expect(await editor.evaluate((area:HTMLTextAreaElement)=>area.value.slice(area.selectionStart,area.selectionEnd))).toContain('Paragraph **text**');
  await page.locator('.document-warnings summary').click();
  await page.getByRole('button',{name:/第 8 行：图片未找到/}).click();
  expect(await editor.evaluate((area:HTMLTextAreaElement)=>area.value.slice(area.selectionStart,area.selectionEnd))).toBe('![missing](no.png)');
});
test('editor source navigation reaches a virtualized distant page',async({page})=>{
  await page.goto('/');
  await page.getByRole('textbox',{name:'Markdown 源代码编辑区'}).fill(Array.from({length:15},(_,i)=>`# Chapter ${i}\n\nText-${i}`).join('\n\n[pagebreak]\n\n'));
  await expect(page.locator('.pdf-page-shell')).toHaveCount(15);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('preview-navigation',{detail:87})));
  await expect(page.locator('[data-page="15"] .pdf-page')).toBeVisible();
});
