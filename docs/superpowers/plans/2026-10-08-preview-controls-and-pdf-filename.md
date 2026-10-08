# Preview Controls and PDF Filename Implementation Plan

> **For agentic workers:** Use the available collaboration tools to implement these independent tasks, then review and verify the combined change.

**Goal:** Keep page navigation clear of PDF content and default exported PDF names to the uploaded Markdown filename.

**Architecture:** Render preview controls above a separate scrolling page viewport. Share that viewport with editor synchronization and page virtualization. Pass the existing source-derived PDF filename into the browser printing path.

**Tech Stack:** React, TypeScript, CSS, Vite, Vitest, Playwright.

## Global Constraints

- Preserve pure frontend operation, responsive preview tabs, source navigation, page selection, and virtualized rendering.
- Preserve PDF document properties in image/direct exports; restore the application title after browser printing.
- Do not require new server services or dependencies.

## Task 1: Separate preview controls from document scrolling

- [x] In `src/App.tsx`, track the mounted preview viewport with a state callback and pass it to `Editor`, scale measurement, and `PagePreview`.
- [x] In `src/PagePreview.tsx`, accept `controls`, `panelChanged`, and `busy` props. Render `.preview-controls` followed by `.preview-panel` containing the existing virtualized document.
- [x] In `src/App.css`, make `.preview-pane` a bounded flex column. Keep controls in normal layout and `.preview-panel` as the sole page scroller. Remove sticky positioning from page navigation and preserve desktop/mobile sizing.
- [x] Calculate shell positions relative to the actual viewport for current-page reporting and jumps; align source/anchor navigation inside that viewport.
- [x] Add `tests/preview-layout.spec.ts` to check control/document separation during scrolling, first-page source synchronization, far-page jumps, and narrow-screen tab switches.

## Task 2: Use source filenames when printing PDF

- [x] In `src/export.ts`, extend the interface to `printPages(pages, meta, filename?: string)` and derive a safely escaped print title from the filename without the PDF extension.
- [x] Temporarily set the parent title while printing, restore it on completion/error/timeout, and remove the print iframe.
- [x] In `src/App.tsx`, call `printPages(exportPages, previewMeta, filename)` using the existing `getPdfName(singleFileName)` value.
- [x] Add `tests/pdf-filename.spec.ts` covering imported filenames, printing title cleanup, and actual image PDF download names and metadata.

## Task 3: Verify and deliver

- [x] Run `npm test` and `npm run build`.
- [x] Run Playwright filename/layout, navigation, page export, improvement, and cross-browser checks; inspect desktop and mobile screenshots.
- [x] Run the complete applicable browser suite if viewport restructuring affects shared navigation behavior.
- [ ] Commit and push the verified changes, confirm CI and Cloudflare deployment, and verify the two fixes on the public site.
