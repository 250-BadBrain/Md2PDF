# Extended Markdown Round Two Implementation Plan

> **For agentic workers:** Implement the tasks through the current collaboration agents, then review and verify the integrated result in the parent thread. The user already requested continued implementation.

**Goal:** Add missing standalone mathematical environments, extended table cells and foldable Obsidian callouts without changing the standard dialects or introducing a backend.

**Architecture:** Keep the new math/table rules in separate Markdown-it plugins, enabled only in document/Obsidian modes. Foldable callouts use native details/summary after sanitization; the PDF paginator opens them before measuring so exported content is complete. Retain all existing sanitization, source mapping, cancellation and offline guarantees.

**Tech Stack:** TypeScript, Markdown-it, KaTeX, React, DOMPurify, Vitest, Playwright, browser print, html2canvas and jsPDF.

## Global Constraints

- 本项目保持纯前端；不上传 Markdown，不使用远程解析／图表／PDF 服务。
- CommonMark/GFM modes keep their current explicit isolation from document extensions.
- Preserve the 1,324-case official corpora and their reviewed differences; do not update baselines to suppress failures.
- Do not evaluate fenced code, arbitrary HTML/CSS or LaTeX external-resource commands.
- Keep code examples literal, correct source line maps and complete content across pagination/export.

### Task 1: Mathematical block boundaries and environments

**Files:** Create `src/math-extensions.ts`, `tests/math-extensions.test.ts`; modify `src/markdown-parser.ts`.

**Interface:** `markdownMathExtensions(md: MarkdownIt, options: { render: (source: string, display: boolean) => string }): void`.

- [x] Reproduce `正文\n\\[\nx^2\n\\]` as a failing regression. Verify it both at document root and in lists, blockquotes and containers.
- [x] Register dedicated block rules ahead of the existing math blocks, with paragraph interruption. Recognize only complete bounded standalone delimiters and the supported equation/align/alignat/gather/CD environments, including starred forms and nested inner environments.
- [x] Wire the lazy KaTeX path without broadening currency or escaped-dollar behavior:

```ts
return createMarkdown(softBreaks, source => render(source, { displayMode: true }), dialect)
  .use(texmathModule.default, {
    engine: { renderToString: render },
    delimiters: ['dollars', 'brackets', 'gitlab'],
    katexOptions: { trust: false, strict: 'ignore', throwOnError: false },
  })
  .use(markdownMathExtensions, {
    render: (source, display) => render(source, { displayMode: display }),
  });
```

- [x] Extend `containsMathSyntax()` to detect supported `\\begin{...}` starts; test without any dollar delimiter. Preserve code/HTML boundaries and unclosed source. Run `npx vitest run tests/math-extensions.test.ts tests/markdown.test.ts tests/compatibility.test.ts`.

### Task 2: Extended table cells

**Files:** Create `src/table-extensions.ts`, `tests/table-extensions.test.ts` and a package declaration only if necessary; modify `package.json`, `package-lock.json`, `src/markdown-parser.ts`.

**Interface:** `tableExtensions(md: MarkdownIt): void`.

- [x] Audit the official MultiMarkdown table plugin and select its exact package release. Parent owns dependency changes; agent owns the leaf adapter and tests.
- [x] Add failing cases for adjacent empty `||` column continuation, `^^` row continuation, row-ending backslash continuation and caption. Ordinary spaced empty cells and escaped/backtick pipes must retain standard meanings.
- [x] Guard the extension to tables that actually contain extension syntax if the upstream plugin changes ordinary tables. Keep Markdown-it inline processing, formula tokens and block source maps. Use sanitized/escaped captions and valid rowspan/colspan HTML.
- [x] Add `.use(tableExtensions)` after the document-mode plugin registration, before returning the renderer. Do not touch the early commonmark/gfm returns.
- [x] Run leaf regressions and a real multi-page table through the existing merged-row pagination path; verify every cell, header and formula survives.

### Task 3: Foldable callouts and complete exports

**Files:** Modify `src/doocs-html.ts`, `tests/doocs-html.test.ts`, `src/markdown.ts`, `src/App.css`, `src/pagination.ts`; add browser cases in `tests/cross-browser.spec.ts` and `tests/extended-markdown.spec.ts`.

**Interface:** Keep `enhanceDoocsHtml(container: HTMLElement, dialect?: DocumentMeta['dialect']): void`, preserving normal callout output.

- [x] Add failing assertions for `[!note]-` (closed) and `[!note]+` (open), plain/rich titles, nested callouts, formula bodies and source maps. Produce static details/summary markup with no script and text-only titles.
- [x] Before pagination, open only generated foldable callouts:

```ts
source.querySelectorAll<HTMLDetailsElement>('details.md-alert-foldable').forEach(callout => {
  callout.open = true;
});
```

- [x] Style summary and retain the existing alert colors. Verify nested folds remain interactive in the original rendered HTML and all exported PDF pages include every body regardless of collapsed source state.
- [x] Capture the actual printed PDF and image PDF; inspect formulas, spans, table pagination and callout contents visually, rather than checking only element counts.

### Task 4: Integration and deployment

- [x] Run `npm test`, `npm run build`, relevant Chromium/WebKit cases and unchanged visual baselines. Run full browser checks when pagination changes warrant it.
- [x] Document exact supported notations and remaining limits in README/compatibility docs. Do not claim universal Markdown or LaTeX compatibility.
- Review and deployment sequence: review the diff, commit/push in the existing authorized workflow, inspect CI (including Firefox) and Cloudflare, and verify the deployed sample in an isolated context. Deployment results are reported after the pushed commit.

Sources: [KaTeX supported environments](https://katex.org/docs/supported.html#environments), [Obsidian callouts](https://help.obsidian.md/callouts), [MultiMarkdown table plugin](https://github.com/RedBug312/markdown-it-multimd-table).
