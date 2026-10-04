# Quality and Document Workflows Implementation Plan

> **For agentic workers:** Implement this plan task-by-task in the current session. The user has authorized implementation in order; no separate execution approval is needed.

**Goal:** Improve reliability, large-document performance, local project recovery, source navigation, professional pagination and selectable Markdown dialects while retaining static hosting.

**Architecture:** Keep parsing in the existing DOM-free module, pagination in the browser, and persistence in a separate IndexedDB repository. Each phase adds a usable feature and regression coverage before the next phase starts.

**Tech Stack:** React, TypeScript, Markdown-it, browser IndexedDB/Workers, jsPDF, JSZip, Vitest, Playwright, GitHub Actions.

## Global Constraints

- Production remains purely frontend; build and CI tooling do not add a runtime server.
- Existing document mode, PDF printing, security filtering and official compatibility baselines remain intact.
- Never claim a local Firefox launch failure or an unrun remote workflow passed.
- Project archives validate paths, schema, resource size and total expansion before loading.
- Preserve content, links, note IDs and source mappings across pagination.

### Task 1: Continuous verification
Files: `.github/workflows/verify.yml`, `playwright.config.ts`, `.gitattributes`, `tests/cross-browser.spec.ts`.
- [x] Add Node 24 install/test/build and three-engine browser verification on Linux; retain Windows visual baselines in a Windows job using Edge.
- [x] Upload failed traces/reports; keep CI permissions read-only and fixture bytes stable with LF checkout.
- [x] Run configuration listing and local cross-engine checks; document local versus remote verification.
Commands: `npm test`, `npm run build`, `npx playwright test tests/cross-browser.spec.ts`.

### Task 2: Performance and bounded exports
Files: `src/pagination.ts`, `src/export.ts`, `src/export-settings.ts`, `src/App.tsx`, `tests/performance.spec.ts`, `tests/export-settings.test.ts`.
Interface: `normalizeExportSettings(value): ExportSettings`, `renderImagePdf(pages, meta, {quality, signal, progress})`.
- [x] Add fast/balanced/high quality presets and persist export choice, with existing high quality as default.
- [x] Replace unconditional per-block yields with time-budgeted scheduling and remove quadratic table indexing.
- [x] Bound each batch archive by output bytes and file count; download parts and release previous archive state, show part progress.
- [x] Benchmark long text, images and tables; assert content preservation, cleanup and responsive cancellation; record actual timings.
Commands: `npm test`, `npx playwright test tests/performance.spec.ts --project chromium`.

### Task 3: Local projects and history
Files: `src/projects.ts`, `src/ProjectLibrary.tsx`, `src/App.tsx`, `tests/projects.spec.ts`.
Interface: `saveProject(project)`, `listProjects()`, `loadProject(id)`, `deleteProject(id)`, `exportProject(project): Promise<Blob>`, `importProject(blob): Promise<Project>`.
- [x] Store source, path, preferences and image blobs atomically in IndexedDB, keeping five distinct revision snapshots per project.
- [x] Provide named projects, explicit save/open/delete/history restore and ZIP project import/export; reject unsafe or oversized archives.
- [x] Restore active-project resources after reload and preserve old localStorage text drafts as fallback.
- [x] Verify image restoration, revisions, ZIP round trips, invalid paths and database failures.
Commands: `npx playwright test tests/projects.spec.ts --project chromium`.

### Task 4: Source mapping
Files: `src/markdown-parser.ts`, `src/source-map.ts`, `src/Editor.tsx`, `src/PagePreview.tsx`, `src/diagnostics.ts`, `tests/navigation.spec.ts`.
Interface: renderer emits `data-source-line` and `data-source-end` using full document line numbers; `SourceLocation={line,end}`.
- [x] Attach parser block token ranges after plugins, including front matter offset and fenced renderers; retain markers through sanitize and DOM enhancement.
- [x] Use mapped blocks for bidirectional scrolling and preview click-to-source, including virtual page jumps.
- [x] Add clickable line-specific diagnostics; retain proportional fallback for unmapped content.
- [x] Verify YAML offsets, nested blocks, wrapped editor lines and offscreen preview navigation.
Commands: `npx playwright test tests/navigation.spec.ts --project chromium`, `npm run test:compatibility`.

### Task 5: Professional layout
Files: `src/pagination.ts`, `src/document-structure.ts`, `src/settings.ts`, `src/LayoutSettings.tsx`, `src/export.ts`, `src/App.css`, `tests/layout-advanced.spec.ts`.
- [x] Add configurable minimum paragraph lines on each side of a split, with safe fallback when a whole block cannot fit.
- [x] Reserve a separate page-bottom footnote area using measured heights and repaginate body until note placement stabilizes; split oversized notes without losing text or backlinks.
- [x] Number image/diagram captions, resolve explicit fragment cross-references and expose unresolved targets as diagnostics.
- [x] Auto-detect wide tables and isolate them on landscape pages; record page dimensions per page and use them in preview/print/image exports.
- [x] Verify text completeness, no body-note overlap, mixed PDF dimensions and link targets.
Commands: `npx playwright test tests/layout-advanced.spec.ts --project chromium`, `npm run test:browser`.

### Task 6: Selectable dialects
Files: `src/markdown-parser.ts`, `src/markdown.ts`, `src/settings.ts`, `src/LayoutSettings.tsx`, `tests/dialects.test.ts`, `docs/markdown-compatibility.md`.
- [x] Add `document` (default), `commonmark`, `gfm`, `obsidian` parser modes; cache by mode and soft-break policy.
- [x] Restrict extensions by selected mode; keep safety filtering in every mode. Standard modes use standard soft breaks.
- [x] Add Obsidian document-local heading/block wiki links and local image embeds; show unavailable cross-document targets rather than executing code or fetching notes.
- [x] Verify isolation, escaping, filenames/anchors, math and code boundaries; rerun existing official baselines unchanged.
Commands: `npm test`, `npm run build`, `npm run test:browser`, `npm run test:firefox`.

### Delivery
- [x] Update README and feature/limitation documentation with measured performance and actual verification results.
- [x] Review diff and leave changes reviewable in the workspace; pushing again is a separate explicit user request.

## Verification outcome

All six phases implemented in order. 29 unit tests, 42 Chromium/WebKit browser tests and production build passed; official difference baselines and existing visual snapshots are unchanged. Firefox launch still fails locally with spawn UNKNOWN, and the remote workflow has not run. Those checks are explicitly unverified. Page-bottom and mixed-orientation screenshots were manually inspected.
