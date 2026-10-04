import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
test('image quality reduces output bytes and exports mixed page dimensions',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {paginateHtml}=await import('/src/pagination.ts');const {renderImagePdf}=await import('/src/export.ts');
    const portrait=await paginateHtml('<h1>Portrait</h1><p>Some printed text.</p>');
    const landscape=await paginateHtml('<h1>Landscape</h1><p>Second page.</p>',{orientation:'landscape'});
    const small=await renderImagePdf([...portrait,...landscape],{}, {quality:'small'});
    const high=await renderImagePdf([...portrait,...landscape],{}, {quality:'high'});
    return {small:small.size,high:high.size,bytes:Array.from(new Uint8Array(await small.arrayBuffer()))};
  });
  expect(result.small).toBeLessThan(result.high);
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(result.bytes)});const document=await task.promise;
  const first=(await document.getPage(1)).getViewport({scale:1});const second=(await document.getPage(2)).getViewport({scale:1});
  expect(first.height).toBeGreaterThan(first.width);expect(second.width).toBeGreaterThan(second.height);await task.destroy();
});
test('batch output divides eleven files into bounded archives',async({page})=>{
  test.setTimeout(120000);await page.goto('/');
  const downloads:import('@playwright/test').Download[]=[];page.on('download',download=>downloads.push(download));
  await page.locator('input[type=file]').first().setInputFiles(Array.from({length:11},(_,index)=>({name:`file-${index}.md`,mimeType:'text/markdown',buffer:Buffer.from(`# File ${index}`)})));
  await page.getByLabel('图像 PDF 清晰度').selectOption('small');
  await page.getByRole('button',{name:'下载',exact:true}).click();
  await expect.poll(()=>downloads.length,{timeout:90000}).toBe(2);
  const {default:JSZip}=await import('jszip');
  const counts=await Promise.all(downloads.map(async download=>Object.values((await JSZip.loadAsync(await fs.readFile((await download.path())!))).files).filter(file=>!file.dir).length));
  expect(counts).toEqual([10,1]);
  expect(downloads.map(download=>download.suggestedFilename())).toEqual(['md2pdf-batch-part-1.zip','md2pdf-batch-part-2.zip']);
});
