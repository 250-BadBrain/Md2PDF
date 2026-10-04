import {test,expect} from '@playwright/test';
test('page-bottom notes wait for image dimensions and fit atomic image notes',async({page})=>{
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles([
    {name:'image-notes.md',mimeType:'text/markdown',buffer:Buffer.from('---\nfootnotes: page-bottom\n---\n# Image note\n\nBody[^1]\n\n[^1]: ![Note picture](note.svg)')},
    {name:'note.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><rect width="1000" height="1000" fill="blue"/></svg>')},
  ]);
  await expect(page.locator('.preview-panel')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.pdf-page-notes img')).toHaveCount(1);
  await expect.poll(()=>page.locator('.pdf-page-notes img').evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
  const bounds=await page.locator('.pdf-page-notes').evaluate((notes:HTMLElement)=>{
    const page=notes.parentElement!.getBoundingClientRect();const area=notes.getBoundingClientRect();const last=notes.parentElement!.querySelector('.pdf-content')!.lastElementChild!.getBoundingClientRect();
    const image=notes.querySelector('img')!.getBoundingClientRect();
    return {overlap:last.bottom>area.top+1,outside:area.bottom>page.bottom+1,imageOutside:image.bottom>area.bottom+1};
  });
  expect(bounds).toEqual({overlap:false,outside:false,imageOutside:false});
});
