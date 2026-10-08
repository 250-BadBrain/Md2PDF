# Practical Document Workflows Implementation Plan

**Goal:** Add image paste/drop and asset replacement, selected-page export, PDF bookmarks and document properties, then readable pagination for nested long tables.

**Architecture:** Keep all processing, images, font loading, project persistence and PDF generation in the browser. App coordinates state; small helpers/components handle image assets, page selection and PDF outline data. Extend existing pagination rather than add another renderer.

**Tech Stack:** React 19, TypeScript, Markdown-it, jsPDF, html2canvas, IndexedDB, Vitest and Playwright.

## Global Constraints

- Preserve pure frontend operation and existing offline caching, sanitization and dialect boundaries.
- Do not change official compatibility or visual baselines to hide regressions.
- Preserve mixed page sizes, source mappings, repeated table headers, rowspan groups, page-bottom notes and complete folded callout exports.
- Images remain local and are persisted in existing project storage with the existing 200-image / 100MiB limits. Asset replacement keeps its Markdown path.
- Page ranges select already paginated pages, retaining printed source page numbers; exported link destinations and bookmarks must use PDF page positions.
- Browser print metadata/bookmarks remain browser-dependent. Direct downloads receive explicit metadata and outlines.
- Execute with the available collaboration agents. Root owns App integration, page selection, shared styling and final verification; leaf work has disjoint files.

## Task 1: Image workflows

- [x] Add src/image-assets.ts helpers for safe unique paths, Markdown relative URLs, validation and replacement at an existing path.
- [x] Extend src/Editor.tsx with an images(files) callback, image ClipboardEvent/drop handling and an editor insertion event for asset-panel insertion. Preserve ordinary text paste, disabled state, selection and source changes.
- [x] Add src/ImageAssets.tsx with previews, independent upload, insert reference and replace controls. App owns blobs, URLs, limits, errors and project autosave.
- [x] Add meaningful helper unit tests and browser tests proving paste/drop insertion, collisions, replacement without changing references and project reload with bytes restored.
- [x] Verify npm test and targeted browser workflow before continuing integration.

## Task 2: Page selection

- [x] Add src/page-selection.ts with strict 1-based inclusive range parsing, sorted deduplication, current-page bounds and heading-derived chapter spans.
- [x] Add src/PageSelection.tsx for all/current/chapter/custom export scope with clear range errors and selected-page count.
- [x] Extend PagePreview with currentPageChanged(page) callback driven by the viewport and navigation.
- [x] Integrate App selection for print and downloaded PDF, retaining preview pages and printed original numbering. Invalid selections block export with a visible reason. Batch export remains whole-document.
- [x] Test invalid/overlapping/out-of-range ranges, chapter boundaries, current-page changes, selected print pages and downloaded page count/orientation/internal links.

## Task 3: PDF outline and properties

- [x] Extend DocumentMeta/front matter with subject and keywords (including YAML list input).
- [x] Add a document properties panel that edits title/author/subject/keywords in source front matter with the YAML parser, keeping other fields and body intact. This makes metadata follow draft/project persistence naturally.
- [x] Set jsPDF title/author/subject/keywords/creator and add hierarchical heading outlines from selected pages, avoiding repeated fragments and cover/TOC headings. Skip missing destinations and attach children to nearest exported parent.
- [x] Check installed jsPDF outline API and official source, then test actual PDF.js getMetadata/getOutline destinations and Unicode titles.
- [x] Verify partial exports include only selected headings and point to their exported pages.

## Task 4: Nested long tables

- [x] Extend src/pagination.ts to paginate tables inside callouts, lists and document containers by rows/connected rowspan groups with reconstructed ancestor context.
- [x] Repeat table headers and appropriate callout summaries; preserve outer source mappings, continuation content and list numbering without duplicated preceding paragraphs.
- [x] Reserve page-bottom notes and handle oversized connected groups using existing scaling fallback.
- [x] Add browser fixtures with long nested tables, rowspans, multiple nesting levels and content before/after. Check row completeness, normal font size, headers/context, overflow and folded export behavior.

## Final Verification and Delivery

- [x] npm test (142 tests across 20 files, including 1,324 official corpus cases), npm run build.
- [x] PLAYWRIGHT_CHANNEL=msedge: all 84 local Chromium/WebKit browser tests passed, including unchanged visual checks and build-backed offline workflows for newly added features.
- [x] Generate selected and nested-table PDFs, inspect PDF.js text/outlines/properties and render representative pages via Poppler for visual QA.
- [x] Review diff, commit and push to existing remote main as authorized in this conversation.
- [ ] Observe GitHub CI (including Firefox and Windows visual) and Cloudflare Pages, verify deployed build/assets and fresh browser workflow on https://md2pdf.lab.h2seo4.win/.
