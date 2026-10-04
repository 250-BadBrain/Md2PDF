import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
test('project saves images, reloads and restores previous text and archive', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles([
    {name:'notes.md', mimeType:'text/markdown', buffer:Buffer.from('# Project\n\n![picture](picture.svg)')},
    {name:'picture.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="red"/></svg>')},
  ]);
  await page.getByRole('button', {name:'项目库',exact:true}).click();
  await page.getByLabel('项目名称').fill('Restorable');
  await page.getByRole('button',{name:'保存当前项目',exact:true}).click();
  await expect(page.getByRole('button',{name:'打开 Restorable',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox',{name:'Markdown 源代码编辑区'})).toHaveValue('# Project\n\n![picture](picture.svg)');
  await expect(page.locator('.image-figure img')).toHaveAttribute('src',/^blob:/);
  await page.getByRole('textbox',{name:'Markdown 源代码编辑区'}).fill('# Edited');
  await expect.poll(() => page.evaluate(async () => { const {listProjects,loadProject}=await import('/src/projects.ts'); const list=await listProjects(); return (await loadProject(list[0].id))?.source; })).toBe('# Edited');
  await page.getByRole('button',{name:'项目库',exact:true}).click();
  await page.getByRole('button',{name:'打开 Restorable',exact:true}).click();
  await page.getByRole('button',{name:/恢复版本 1/}).click();
  await expect(page.getByRole('textbox',{name:'Markdown 源代码编辑区'})).toHaveValue('# Project\n\n![picture](picture.svg)');
  const downloading=page.waitForEvent('download'); await page.getByRole('button',{name:'导出项目包',exact:true}).click();
  const archive=await fs.readFile((await (await downloading).path())!);
  await page.locator('.project-library input[type=file]').setInputFiles({name:'project.zip',mimeType:'application/zip',buffer:archive});
  await expect(page.getByRole('textbox',{name:'Markdown 源代码编辑区'})).toHaveValue('# Project\n\n![picture](picture.svg)');
  await expect(page.locator('.image-figure img')).toHaveAttribute('src',/^blob:/);
});

test('same-size image revisions are distinct and rejected saves retain the prior project',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {saveProject,loadProject}=await import('/src/projects.ts');const {DEFAULT_LAYOUT}=await import('/src/settings.ts');
    const project={id:'images',name:'Images',source:'text',assets:{'image.svg':new Blob(['A'],{type:'image/svg+xml'})},preferences:DEFAULT_LAYOUT,savedAt:1};
    await saveProject(project);await saveProject({...project,assets:{'image.svg':new Blob(['B'],{type:'image/svg+xml'})},savedAt:2});
    let rejected=false;try{await saveProject({...project,path:'../bad.md'});}catch{rejected=true;}
    const value=await loadProject(project.id);return {rejected,current:await value?.assets['image.svg'].text(),old:await value?.history[0].assets['image.svg'].text()};
  });
  expect(result).toEqual({rejected:true,current:'B',old:'A'});
});

test('newer drafts from another project never replace the active project',async({page})=>{
  await page.goto('/');
  await page.evaluate(async()=>{const {saveProject}=await import('/src/projects.ts');const {DEFAULT_LAYOUT}=await import('/src/settings.ts');await saveProject({id:'active',name:'Active',source:'# Correct project',assets:{},preferences:DEFAULT_LAYOUT,savedAt:1});});
  await page.addInitScript(()=>{
    localStorage.setItem('md2pdf:active-project','active');
    localStorage.setItem('md2pdf:draft:v1',JSON.stringify({source:'# Wrong project',projectId:'different',savedAt:Date.now()}));
  });
  await page.reload();await expect(page.getByRole('textbox',{name:'Markdown 源代码编辑区'})).toHaveValue('# Correct project');
});
test('project repository rejects unsafe archive paths and preserves five revisions', async ({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const repo=await import('/src/projects.ts'); const {DEFAULT_LAYOUT}=await import('/src/settings.ts');
    const project={id:'test-history',name:'History',source:'v0',preferences:DEFAULT_LAYOUT,assets:{},savedAt:0};
    for(let i=0;i<8;i++) await repo.saveProject({...project,source:`v${i}`,savedAt:i});
    const record=await repo.loadProject(project.id);
    const {default:JSZip}=await import('/node_modules/.vite/deps/jszip.js'); const zip=new JSZip(); zip.file('../unsafe.txt','bad');
    let error=''; try {await repo.importProject(await zip.generateAsync({type:'blob'}));}catch(e){error=String(e);}
    return {history:record?.history.map(p=>p.source),error};
  });
  expect(result.history).toEqual(['v6','v5','v4','v3','v2']);expect(result.error).toContain('不安全路径');
});
