import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('nested folded tables keep normal text, ancestor context and surrounding content', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { renderMarkdownToHtml } = await import('/src/markdown.ts');
    const { paginateHtml } = await import('/src/pagination.ts');
    const first = '| Key | Value |\n| --- | --- |\n' + Array.from({ length: 85 }, (_, i) => `| First-${i} | Value-${i} |`).join('\n');
    const second = '| Key | Value |\n| --- | --- |\n' + Array.from({ length: 55 }, (_, i) => `| Second-${i} | Other-${i} |`).join('\n');
    const quote = (value: string) => value.split('\n').map(line => '   > ' + line).join('\n');
    const source = '::: note Outer container\n\n7. List introduction\n\n' + quote('[!note]- Folded tables\nBefore first table\n\n' + first + '\n\nBetween tables\n\n' + second + '\n\nAfter second table') + '\n\n8. Following item\n\n:::';
    const rendered = await renderMarkdownToHtml(source, undefined, {});
    const pages = await paginateHtml(rendered.html, { paper: 'A5' });
    const host = document.createElement('div'); host.innerHTML = pages.map(html => `<article class="pdf-page">${html}</article>`).join(''); document.body.append(host);
    const tables = [...host.querySelectorAll('table')];
    const rows = [...host.querySelectorAll('tbody tr')].map(row => row.cells[0]?.textContent);
    const listItems = [...host.querySelectorAll<HTMLLIElement>('.md-container > ol > li')];
    const result = {
      pages: pages.length, tables: tables.length, headers: host.querySelectorAll('thead').length, rows,
      scaled: host.querySelectorAll('.pagination-scaled').length,
      contexts: tables.every(table => !!table.closest('details.md-alert-foldable') && !!table.closest('li') && !!table.closest('.md-container')),
      summaries: [...host.querySelectorAll('details.md-alert-foldable')].every(details => details.querySelector(':scope > summary')?.textContent === 'Folded tables'),
      open: [...host.querySelectorAll<HTMLDetailsElement>('details.md-alert-foldable')].every(details => details.open),
      fontSizes: [...host.querySelectorAll('tbody td')].map(cell => getComputedStyle(cell).fontSize),
      once: ['List introduction', 'Before first table', 'Between tables', 'After second table', 'Following item'].map(text => (host.textContent?.split(text).length || 1) - 1),
      starts: [...host.querySelectorAll<HTMLOListElement>('.md-container > ol')].map(list => list.start),
      firstMarkers: listItems.filter(item => !item.classList.contains('list-item-continuation')).map(item => item.textContent?.includes('Following item') ? 'following' : 'first'),
      sourceMaps: tables.every(table => !!table.closest('[data-source-line][data-source-end]')),
      idsUnique: new Set([...host.querySelectorAll('[id]')].map(element => element.id)).size === host.querySelectorAll('[id]').length,
      overflow: [...host.querySelectorAll<HTMLElement>('.pdf-content')].some(content => content.scrollHeight > content.clientHeight + 1),
    };
    host.remove(); return result;
  });
  expect(result.pages).toBeGreaterThan(3); expect(result.tables).toBeGreaterThan(2); expect(result.headers).toBe(result.tables);
  expect(result.rows).toEqual([...Array.from({ length: 85 }, (_, i) => `First-${i}`), ...Array.from({ length: 55 }, (_, i) => `Second-${i}`)]);
  expect(result).toMatchObject({ scaled: 0, contexts: true, summaries: true, open: true, sourceMaps: true, idsUnique: true, overflow: false, once: [1, 1, 1, 1, 1] });
  expect(result.fontSizes.every(size => parseFloat(size) >= 11.9)).toBe(true);
  expect(result.starts.every(start => start === 7 || start === 8)).toBe(true);
  expect(result.firstMarkers).toEqual(['first', 'following']);
});

test('connected rowspan groups nested in lists stay together and reserve page-bottom notes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { paginateHtml } = await import('/src/pagination.ts');
    const groups = Array.from({ length: 30 }, (_, i) => `<tr><td rowspan="2">Group-${i}</td><td>Start-${i}</td><td>Value</td></tr><tr><td rowspan="2">Bridge-${i}</td><td>Middle-${i}<sup><a class="footnote-ref" href="#fn${i}">${i + 1}</a></sup></td></tr><tr><td>End-${i}</td><td>Tail-${i}</td></tr>`).join('');
    const notes = '<section class="footnotes"><ol>' + Array.from({ length: 30 }, (_, i) => `<li id="fn${i}"><p>Note-${i} for this table group.</p></li>`).join('') + '</ol></section>';
    const html = `<section class="md-container md-container-note" data-source-line="1" data-source-end="100"><strong>Context</strong><ol start="12"><li><p>Before groups</p><blockquote><table id="nested-groups"><thead><tr><th>Group</th><th>Stage</th><th>Value</th></tr></thead><tbody>${groups}</tbody></table></blockquote><p>After groups</p></li><li>Next item</li></ol></section>${notes}`;
    const pages = await paginateHtml(html, { paper: 'A5', footnotes: 'page-bottom' });
    const host = document.createElement('div'); host.innerHTML = pages.map(html => `<article class="pdf-page">${html}</article>`).join(''); document.body.append(host);
    const tables = [...host.querySelectorAll('table')];
    const groupsTogether = tables.every(table => {
      const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')];
      return rows.every((row, index) => {
        const label = row.cells[0]?.textContent?.match(/^Group-(\d+)$/)?.[1];
        return label === undefined || (rows[index + 1]?.textContent?.includes(`Middle-${label}`) && rows[index + 2]?.textContent?.includes(`End-${label}`));
      });
    });
    const notesClear = [...host.querySelectorAll<HTMLElement>('.pdf-page')].every(page => {
      const notes = page.querySelector<HTMLElement>('.pdf-page-notes:not([hidden])');
      if (!notes) return true;
      return [...page.querySelectorAll('tbody tr')].every(row => row.getBoundingClientRect().bottom <= notes.getBoundingClientRect().top + 1);
    });
    const result = {
      pages: pages.length, tables: tables.length, headers: host.querySelectorAll('thead').length, rows: host.querySelectorAll('tbody tr').length,
      groupLabels: [...host.querySelectorAll('tbody td[rowspan="2"]')].map(cell => cell.textContent), groupsTogether, notesClear,
      notes: [...host.querySelectorAll('.pdf-page-notes li[id]')].map(note => note.id),
      scaled: host.querySelectorAll('.pagination-scaled').length,
      context: tables.every(table => !!table.closest('blockquote') && !!table.closest('li') && !!table.closest('.md-container')),
      before: (host.textContent?.split('Before groups').length || 1) - 1, after: (host.textContent?.split('After groups').length || 1) - 1,
      overflow: [...host.querySelectorAll<HTMLElement>('.pdf-content')].some(content => content.scrollHeight > content.clientHeight + 1),
    };
    host.remove(); return result;
  });
  expect(result.pages).toBeGreaterThan(3); expect(result.tables).toBeGreaterThan(1); expect(result.headers).toBe(result.tables);
  expect(result).toMatchObject({ rows: 90, groupsTogether: true, notesClear: true, scaled: 0, context: true, before: 1, after: 1, overflow: false });
  expect(result.groupLabels).toEqual(Array.from({ length: 30 }, (_, i) => [`Group-${i}`, `Bridge-${i}`]).flat());
  expect(new Set(result.notes)).toEqual(new Set(Array.from({ length: 30 }, (_, i) => `fn${i}`)));
});

test('only an oversized connected group scales and later nested rows use normal size', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { paginateHtml } = await import('/src/pagination.ts');
    const oversized = `<tr><td rowspan="2">Oversized</td><td>${'Tall group text '.repeat(1400)}</td></tr><tr><td>Oversized end</td></tr>`;
    const normal = Array.from({ length: 45 }, (_, i) => `<tr><td>Normal-${i}</td><td>Value-${i}</td></tr>`).join('');
    const html = `<details open class="md-alert md-alert-note md-alert-foldable" data-callout-key="0" data-callout-fold="closed"><summary>Large group</summary><div class="md-alert-body"><p>Before oversized</p><table><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>${oversized}${normal}</tbody></table><p>After oversized</p></div></details>`;
    const pages = await paginateHtml(html, { paper: 'A5' });
    const host = document.createElement('div'); host.innerHTML = pages.map(html => `<article class="pdf-page">${html}</article>`).join(''); document.body.append(host);
    const result = {
      scaled: host.querySelectorAll('.pagination-scaled').length,
      normal: [...host.querySelectorAll('tbody tr')].filter(row => row.cells[0]?.textContent?.startsWith('Normal-')).map(row => ({ label: row.cells[0]?.textContent, scaled: !!row.closest('.pagination-scaled'), size: getComputedStyle(row.cells[0]).fontSize })),
      words: (host.textContent?.match(/Tall group text/g) || []).length,
      rows: host.querySelectorAll('tbody tr').length,
      summaries: [...host.querySelectorAll('details')].every(details => details.querySelector(':scope > summary')?.textContent === 'Large group'),
      before: (host.textContent?.split('Before oversized').length || 1) - 1, after: (host.textContent?.split('After oversized').length || 1) - 1,
      overflow: [...host.querySelectorAll<HTMLElement>('.pdf-content')].some(content => content.scrollHeight > content.clientHeight + 1),
    };
    host.remove(); return result;
  });
  expect(result).toMatchObject({ scaled: 1, words: 1400, rows: 47, summaries: true, before: 1, after: 1, overflow: false });
  expect(result.normal.map(({ label, scaled }) => ({ label, scaled }))).toEqual(Array.from({ length: 45 }, (_, i) => ({ label: `Normal-${i}`, scaled: false })));
  expect(result.normal.every(row => parseFloat(row.size) >= 11.9)).toBe(true);
});

test('wide nested tables retain callout context on landscape pages and resume portrait text', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { renderMarkdownToHtml } = await import('/src/markdown.ts');
    const { paginateHtml } = await import('/src/pagination.ts');
    const table = '| ' + Array.from({ length: 8 }, (_, i) => `Column-${i}`).join(' | ') + ' |\n| ' + Array(8).fill('---').join(' | ') + ' |\n' + Array.from({ length: 45 }, (_, row) => '| ' + Array.from({ length: 8 }, (_, col) => `Cell-${row}-${col}`).join(' | ') + ' |').join('\n');
    const source = '> [!note]- Wide nested\n> Before wide\n>\n' + table.split('\n').map(line => '> ' + line).join('\n') + '\n>\n> After wide';
    const rendered = await renderMarkdownToHtml(source, undefined, {});
    const pages = await paginateHtml(rendered.html, { paper: 'A5', wideTables: true });
    const host = document.createElement('div'); host.innerHTML = pages.map(html => `<article class="pdf-page">${html}</article>`).join(''); document.body.append(host);
    const contents = [...host.querySelectorAll<HTMLElement>('.pdf-content')];
    const result = {
      sizes: contents.map(content => [Number(content.dataset.pageWidth), Number(content.dataset.pageHeight)]),
      tableSizes: contents.filter(content => content.querySelector('table')).map(content => [Number(content.dataset.pageWidth), Number(content.dataset.pageHeight)]),
      tables: host.querySelectorAll('table').length, headers: host.querySelectorAll('thead').length, rows: host.querySelectorAll('tbody tr').length,
      contexts: [...host.querySelectorAll('table')].every(table => table.closest('details')?.querySelector(':scope > summary')?.textContent === 'Wide nested'),
      closed: host.querySelectorAll('details:not([open])').length, scaled: host.querySelectorAll('.pagination-scaled').length,
      before: (host.textContent?.split('Before wide').length || 1) - 1, after: (host.textContent?.split('After wide').length || 1) - 1,
      overflow: contents.some(content => content.scrollHeight > content.clientHeight + 1),
    };
    host.remove(); return result;
  });
  expect(result.sizes[0]).toEqual([148, 210]); expect(result.sizes.at(-1)).toEqual([148, 210]);
  expect(result.tableSizes.length).toBeGreaterThan(1); expect(result.tableSizes.every(size => size[0] === 210 && size[1] === 148)).toBe(true);
  expect(result.headers).toBe(result.tables); expect(result).toMatchObject({ rows: 45, contexts: true, closed: 0, scaled: 0, before: 1, after: 1, overflow: false });
});

test('ordinary percentage-width tables stay portrait when wide tables are enabled', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { renderMarkdownToHtml } = await import('/src/markdown.ts');
    const { paginateHtml } = await import('/src/pagination.ts');
    const source = '| Key | Value |\n| --- | --- |\n| Outside | First |\n\n> [!note]- Normal nested\n> | Key | Value |\n> | --- | --- |\n> | Inside | Second |';
    const rendered = await renderMarkdownToHtml(source, undefined, {});
    const pages = await paginateHtml(rendered.html, { paper: 'A5', wideTables: true });
    const doc = new DOMParser().parseFromString(pages.join(''), 'text/html');
    return { pages: pages.length, sizes: [...doc.querySelectorAll<HTMLElement>('.pdf-content')].map(content => [Number(content.dataset.pageWidth), Number(content.dataset.pageHeight)]), rows: doc.querySelectorAll('tbody tr').length };
  });
  expect(result).toEqual({ pages: 1, sizes: [[148, 210]], rows: 2 });
});

test('checkbox-only task items around a nested long table keep their checked states', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { renderMarkdownToHtml } = await import('/src/markdown.ts');
    const { paginateHtml } = await import('/src/pagination.ts');
    const table = '  | Key | Value |\n  | --- | --- |\n' + Array.from({ length: 80 }, (_, i) => `  | Task-row-${i} | Value-${i} |`).join('\n');
    const source = 'Before task list\n\n- [x] <!-- completed -->\n\n' + table + '\n\n- [ ] <!-- pending -->\n\nAfter task list';
    const rendered = await renderMarkdownToHtml(source, undefined, {});
    const pages = await paginateHtml(rendered.html, { paper: 'A5' });
    const doc = new DOMParser().parseFromString(pages.join(''), 'text/html');
    return {
      pages: pages.length,
      checked: [...doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map(input => input.checked),
      disabled: [...doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every(input => input.disabled),
      rows: [...doc.querySelectorAll<HTMLTableRowElement>('tbody tr')].map(row => row.cells[0].textContent),
      before: (doc.body.textContent?.split('Before task list').length || 1) - 1,
      after: (doc.body.textContent?.split('After task list').length || 1) - 1,
    };
  });
  expect(result.pages).toBeGreaterThan(1);
  expect(result.checked).toEqual([true, false]);
  expect(result).toMatchObject({ disabled: true, before: 1, after: 1 });
  expect(result.rows).toEqual(Array.from({ length: 80 }, (_, i) => `Task-row-${i}`));
});

test('long text around nested tables preserves every word and explicit list ordinals', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { paginateHtml } = await import('/src/pagination.ts');
    const before = Array.from({ length: 700 }, (_, i) => `Before-${i}`).join(' ');
    const after = Array.from({ length: 700 }, (_, i) => `After-${i}`).join(' ');
    const following = Array.from({ length: 300 }, (_, i) => `Following-${i}`).join(' ');
    const table = '<table id="long-context-table"><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>' + Array.from({ length: 35 }, (_, i) => `<tr><td>Row-${i}</td><td>Value-${i}</td></tr>`).join('') + '</tbody></table>';
    const html = `<section class="md-container md-container-note" id="long-context"><strong>Long context</strong><ol start="4"><li value="9"><p id="before">${before}</p><blockquote>${table}<p id="after">${after}</p></blockquote></li><li><p>${following}</p></li></ol></section>`;
    const pages = await paginateHtml(html, { paper: 'A5' });
    const host = document.createElement('div'); host.innerHTML = pages.map(html => `<article class="pdf-page">${html}</article>`).join(''); document.body.append(host);
    const contents = [...host.querySelectorAll<HTMLElement>('.pdf-content')];
    const result = {
      words: (host.textContent?.match(/(?:Before|After|Following)-\d+/g) || []),
      rows: [...host.querySelectorAll<HTMLTableRowElement>('tbody tr')].map(row => row.cells[0].textContent),
      starts: [...host.querySelectorAll<HTMLOListElement>('.md-container > ol')].map(list => ({ start: list.start, following: list.firstElementChild?.textContent?.includes('Following-') })),
      markers: [...host.querySelectorAll<HTMLLIElement>('.md-container > ol > li:not(.list-item-continuation)')].map(item => item.hasAttribute('value') ? item.value : (item.parentElement as HTMLOListElement).start + Array.from(item.parentElement!.children).indexOf(item)),
      scaled: host.querySelectorAll('.pagination-scaled').length,
      uniqueIds: new Set([...host.querySelectorAll('[id]')].map(node => node.id)).size === host.querySelectorAll('[id]').length,
      internal: host.querySelectorAll('[data-pagination-context]').length,
      overflow: contents.some(content => content.scrollHeight > content.clientHeight + 1),
    };
    host.remove(); return result;
  });
  expect(result.words).toEqual([...Array.from({ length: 700 }, (_, i) => `Before-${i}`), ...Array.from({ length: 700 }, (_, i) => `After-${i}`), ...Array.from({ length: 300 }, (_, i) => `Following-${i}`)]);
  expect(result.rows).toEqual(Array.from({ length: 35 }, (_, i) => `Row-${i}`));
  expect(result.starts.every(({ start, following }) => start === (following ? 10 : 9))).toBe(true);
  expect(result.markers).toEqual([9, 10]);
  expect(result).toMatchObject({ scaled: 0, uniqueIds: true, internal: 0, overflow: false });
});
