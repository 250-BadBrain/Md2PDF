import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function extractPdfText(buffer: Uint8Array) {
  const loading = getDocument({ data: Uint8Array.from(buffer), useSystemFonts: true });
  const document = await loading.promise;
  try {
    const pages: string[] = [];
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '));
    }
    return pages.join('\n');
  } finally { await loading.destroy(); }
}
