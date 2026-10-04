import { expect, type Page } from '@playwright/test';

// Capture the real frontend print iframe; PDF generation below runs only in tests.
export async function capturePrintedPdf(page: Page) {
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')!;
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { configurable: true, get() {
      const frameWindow = descriptor.get!.call(this);
      if (frameWindow) frameWindow.print = () => {
        (window as Window & { printedHtml?: string }).printedHtml = (this as HTMLIFrameElement).srcdoc;
      };
      return frameWindow;
    } });
  });
  await page.getByRole('button', { name: '打印／保存 PDF' }).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { printedHtml?: string }).printedHtml))).toBe(true);
  const html = await page.evaluate(() => (window as Window & { printedHtml?: string }).printedHtml!);
  const printing = await page.context().newPage();
  try {
    await printing.setContent(html);
    await printing.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
    });
    return await printing.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
  } finally { await printing.close(); }
}
