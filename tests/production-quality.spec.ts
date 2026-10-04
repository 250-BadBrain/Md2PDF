import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import { extractPdfText } from './pdf-text';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
test.beforeEach(async () => { await fs.mkdir('tmp', { recursive: true }); });

test('local font enables searchable direct Chinese PDF and links', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill('# 中文测试\n\nEnglish [链接](https://example.com)\n\n<!-- pagebreak -->\n\n第二页');
  await page.getByLabel('PDF 导出方式').selectOption('direct');
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: '下载', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('TTF');
  await page.getByRole('button', { name: '排版', exact: true }).click();
  await page.getByLabel('导入 TTF 字体').setInputFiles('tests/fixtures/fonts/test.ttf');
  await expect(page.getByRole('region', { name: '本地字体' })).toContainText('字体已加载');
  await page.getByRole('button', { name: '关闭设置' }).click();
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载', exact: true }).click();
  const buffer = await fs.readFile((await (await downloading).path())!);
  const extracted = await extractPdfText(buffer);
  expect(extracted).toContain('English');
  expect(extracted).toContain('中文测试');
  const text = extracted.replace(/\s/g, '');
  expect(text).toContain('中文测试'); expect(text).toContain('English链接'); expect(text).toContain('第二页');
  const loading = getDocument({ data: Uint8Array.from(buffer) }); const pdf = await loading.promise;
  expect(pdf.numPages).toBe(2);
  expect((await (await pdf.getPage(1)).getAnnotations()).some(annotation => annotation.url === 'https://example.com/')).toBe(true);
  await loading.destroy();
  await fs.writeFile('tmp/direct-test.pdf', buffer);
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill('龍');
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: '下载', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('字体缺字');
});

test('projects search, rename, copy and undo deletion preserve the current project', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Markdown 源代码编辑区' }).fill('# Original');
  await page.getByRole('button', { name: '项目库', exact: true }).click();
  await page.getByLabel('项目名称').fill('Original');
  await page.getByRole('button', { name: '保存当前项目', exact: true }).click();
  await page.getByRole('button', { name: '重命名 Original', exact: true }).click();
  await page.getByLabel('新项目名称').fill('Renamed');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await page.getByRole('button', { name: '复制 Renamed', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开 Renamed 副本', exact: true })).toBeVisible();
  await page.getByLabel('搜索项目').fill('副本');
  await expect(page.getByRole('button', { name: '打开 Renamed', exact: true })).toBeHidden();
  await page.getByLabel('搜索项目').fill('');
  await page.getByRole('button', { name: '删除 Renamed', exact: true }).click();
  await page.getByRole('button', { name: '关闭项目库', exact: true }).click();
  await page.getByRole('button', { name: '项目库', exact: true }).click();
  await page.getByRole('button', { name: '撤销删除 Renamed', exact: true }).click();
  await page.getByRole('button', { name: '打开 Renamed', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown 源代码编辑区' })).toHaveValue('# Original');
  await page.reload();
  await page.getByRole('button', { name: '项目库', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开 Renamed', exact: true })).toBeVisible();
});

test('hostile HTML and malformed project archives are rejected without losing source text', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { renderMarkdownToHtml } = await import('/src/markdown.ts');
    const input = '<script>window.pwned=1</script><img src="x" onerror="window.pwned=1"><a href="javascript:alert(1)">bad</a><iframe srcdoc="evil"></iframe>\n\n' + Array.from({ length: 60 }, (_, i) => `${'> '.repeat(i % 6 + 1)}- **nested-${i}** 中文😀`).join('\n\n') + '\n\nTAIL';
    const rendered = await renderMarkdownToHtml(input, undefined, {});
    const node = document.createElement('div'); node.innerHTML = rendered.html;
    return { scripts: node.querySelectorAll('script,iframe,[onerror],a[href^="javascript:"]').length, tail: node.textContent?.includes('TAIL'), final: node.textContent?.includes('nested-59') };
  });
  expect(result).toEqual({ scripts: 0, tail: true, final: true });
  for (const manifest of [null, {version:1,name:'Bad',source:'x',assets:[null]}]) {
    const zip = new JSZip(); zip.file('project.json', JSON.stringify(manifest));
    const bytes = [...await zip.generateAsync({ type:'uint8array' })];
    const error = await page.evaluate(async bytes => { const {importProject}=await import('/src/projects.ts'); try { await importProject(new Blob([new Uint8Array(bytes)])); return ''; } catch(error) { return String(error); } }, bytes);
    expect(error).toContain('清单'); expect(error).not.toContain('TypeError');
  }
  const zip = new JSZip(); zip.file('project.json', '{}');
  const original = await zip.generateAsync({type:'uint8array'});
  const oversized = Uint8Array.from(original); const view = new DataView(oversized.buffer);
  for(let i=0;i<oversized.length-46;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,101*1048576,true);break;}
  for(const bytes of [oversized, original.slice(0,20)]) {
    const error=await page.evaluate(async bytes=>{const {importProject}=await import('/src/projects.ts');try{await importProject(new Blob([new Uint8Array(bytes)]));return '';}catch(error){return String(error);}},[...bytes]);
    expect(error).toMatch(/100MiB|ZIP/);
  }
  const wrongSize = new JSZip(); wrongSize.file('project.json', JSON.stringify({version:1,name:'Wrong',source:'x',assets:[{path:'x.png',file:'assets/0.bin',type:'image/png',size:1}]})); wrongSize.file('assets/0.bin','expanded'.repeat(10000));
  const badBytes=[...await wrongSize.generateAsync({type:'uint8array',compression:'DEFLATE'})];
  const inflationError=await page.evaluate(async bytes=>{const {importProject}=await import('/src/projects.ts');try{await importProject(new Blob([new Uint8Array(bytes)]));return '';}catch(error){return String(error);}},badBytes);
  expect(inflationError).toContain('展开大小');
});

test('copied and recovered project images and history survive mixed searchable export', async ({page})=>{
  await page.goto('/');
  const font=[...await fs.readFile('tests/fixtures/fonts/test.ttf')];
  const result=await page.evaluate(async font=>{
    const repo=await import('/src/projects.ts'); const {DEFAULT_LAYOUT}=await import('/src/settings.ts');
    const value={id:'restore-history',name:'Images',source:'v1',preferences:DEFAULT_LAYOUT,assets:{'p.svg':new Blob(['original'],{type:'image/svg+xml'})},savedAt:1};
    await repo.saveProject(value);await repo.saveProject({...value,source:'v2',savedAt:2});
    const record=(await repo.loadProject(value.id))!; const copy=await repo.copyProject(value.id);
    await repo.deleteProject(value.id);await repo.restoreDeletedProject(record);const restored=(await repo.loadProject(value.id))!;
    const {importFont}=await import('/src/fonts.ts');await importFont(new File([new Uint8Array(font)],'test.ttf'));
    const {paginateHtml}=await import('/src/pagination.ts');const {renderImagePdf}=await import('/src/export.ts');
    const first=await paginateHtml('<p>中文测试</p>');const second=await paginateHtml('<p>English</p>',{orientation:'landscape'});
    const pdf=await renderImagePdf([...first,...second],{}, {searchable:true,quality:'small'});
    return {copyImage:await copy.assets['p.svg'].text(),restoredImage:await restored.assets['p.svg'].text(),history:restored.history.map(p=>p.source),bytes:[...new Uint8Array(await pdf.arrayBuffer())]};
  },font);
  expect(result.copyImage).toBe('original');expect(result.restoredImage).toBe('original');expect(result.history).toEqual(['v1']);
  const loading=getDocument({data:new Uint8Array(result.bytes)});const pdf=await loading.promise;
  const first=(await pdf.getPage(1)).getViewport({scale:1}),second=(await pdf.getPage(2)).getViewport({scale:1});
  expect(first.height).toBeGreaterThan(first.width);expect(second.width).toBeGreaterThan(second.height);
  await loading.destroy();expect(await extractPdfText(new Uint8Array(result.bytes))).toContain('中文测试');
});

test('small screens provide editor and preview tabs, keyboard source navigation and Escape focus return', async ({ page }) => {
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 }); await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '排版', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '排版', exact: true })).toBeFocused();
    if (width === 390) {
      await page.getByRole('button', { name: '预览', exact: true }).click();
      await expect(page.locator('.editor-pane')).toBeHidden();
    }
    const article = page.locator('.pdf-page').first(); await article.focus(); await page.keyboard.press('Enter');
    if (width === 390) await expect(page.getByRole('button', { name: '编辑', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('textbox', { name:'Markdown 源代码编辑区' })).toBeVisible();
    await page.screenshot({path:`tmp/mobile-${width}.png`});
  }
});
