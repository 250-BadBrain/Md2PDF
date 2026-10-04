import { test, expect } from '@playwright/test';
test('large document benchmark preserves text, yields and releases DOM', async ({ page }, testInfo) => {
  test.setTimeout(120000); await page.goto('/');
  const result = await page.evaluate(async () => {
    const { paginateHtml } = await import('/src/pagination.ts');
    let ticks = 0; const interval = setInterval(() => ticks++, 10);
    const start = performance.now();
    const html = Array.from({length: 350}, (_, i) => `<p>Paragraph-${i} ${'内容和分页 '.repeat(15)}</p>`).join('')
      + `<table><thead><tr><th>Index</th><th>Text</th></tr></thead><tbody>${Array.from({length: 300}, (_, i) => `<tr><td>${i}</td><td>Row-${i}</td></tr>`).join('')}</tbody></table>`
      + Array.from({length: 12}, (_, i) => `<figure><img alt="Image-${i}" width="160" height="80" src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="blue"/></svg>')}"></figure>`).join('');
    const pages = await paginateHtml(html);
    clearInterval(interval);
    const host = document.createElement('div'); host.innerHTML = pages.join('');
    return { milliseconds: performance.now()-start, pages: pages.length, ticks, text: host.textContent, images: host.querySelectorAll('img').length, hosts: document.querySelectorAll('.pagination-host').length };
  });
  expect(result.text).toContain('Paragraph-349'); expect(result.text).toContain('Row-299');
  expect(result.images).toBe(12); expect(result.hosts).toBe(0); expect(result.ticks).toBeGreaterThan(0);
  expect(result.pages).toBeGreaterThan(10);
  await testInfo.attach('benchmark', {body: JSON.stringify({...result, text: undefined}, null, 2), contentType:'application/json'});
  console.log('Pagination benchmark', {...result, text: undefined});
});
