# Code Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. This session uses the available collaboration tools for the independent tasks below.

**Goal:** Remove proven dead code and duplicated work, and fix reproduced navigation, rendering, and asynchronous cleanup errors.

**Architecture:** Keep the existing React components and rendering pipeline. Consolidate heading text extraction, cache preview geometry, and ensure worker and IndexedDB operations release resources at every completion path.

**Tech Stack:** React, TypeScript, CSS, Vite, Vitest, Playwright, browser IndexedDB and Workers.

## Global Constraints

- Preserve pure frontend execution and existing Markdown, local image, project, preview, and PDF export features.
- Keep `saveProject(project: Project, signal?: AbortSignal)` and `parseWithWorker(request, fallback, signal?)` callers compatible.
- Delete functions only after repository-wide references confirm they are unused; retain intentional test interfaces and syntax fixtures.
- Add no runtime dependencies or server services. Avoid broad formatting changes and architectural rewrites.

---

### Task 1: Preview and form cleanup

**Files:** `src/PagePreview.tsx`, `src/App.tsx`, `src/App.css`, `src/Editor.tsx`, `src/DocumentProperties.tsx`, `tests/preview-layout.spec.ts`, `tests/document-properties.spec.ts`.

- [x] Clamp the jump target when page count shrinks: `setTarget(value => Math.min(value, Math.max(1, pages.length)))`. Verify jumping remains possible after replacing a long document with two pages.
- [x] Memoize `sizes`, `heights`, and `offsets` using `[pages, meta, scale]` so scroll updates reuse page geometry.
- [x] Delete the superseded 720px top-bar query and textarea height declarations; merge duplicate project-list rules while preserving responsive overrides.
- [x] Remove the redundant `if (!cancelled)` after `if (cancelled) return`, and reduce the insertion overlap condition to `start < insertion.end`.
- [x] Cache `readDocumentProperties(source)` with `useMemo`. Track the exact saved source so external source changes invalidate the success message while submitting valid properties still confirms saving.
- [x] Run `node node_modules/@playwright/test/cli.js test tests/preview-layout.spec.ts tests/document-properties.spec.ts tests/image-workflows.spec.ts --project chromium`. Expect all existing checks plus the new shrinking-document and stale-save regressions to pass.

### Task 2: Rendering and unused helper cleanup

**Files:** `src/markdown.ts`, `src/markdown-parser.ts`, `src/pagination.ts`, `src/page-selection.ts`, `src/pdf-outline.ts`, `src/heading-text.ts`, relevant heading unit tests and browser rendering specs.

**Shared interface:** `headingText(heading: HTMLElement): string` in `src/heading-text.ts` clones the heading, strips anchor/reading/duplicate math metadata, substitutes image alt text, and normalizes whitespace.

- [x] Delete the unreferenced `humanizeContainerType` function.
- [x] Replace duplicate chapter/bookmark label extraction with `headingText`, preserving visual KaTeX text and base ruby text while removing `.katex-mathml`, `rt`, and `rp`.
- [x] Guard `decodeURIComponent(reference.hash.slice(1))` in near-reference footnotes; malformed fragments must leave document content and valid footnotes intact.
- [x] Set Mermaid `suppressErrorRendering: true` and delete the obsolete error-selector cleanup. Verify repeated invalid diagrams retain source diagnostics without leaving temporary body containers.
- [x] Run heading unit tests and focused rendering browser tests; confirm existing chapter selection, outlines, valid math, and Mermaid output are unchanged.

### Task 3: Asynchronous operation cleanup

**Files:** `src/parser-client.ts`, `src/projects.ts`, `tests/parser-client.test.ts`, `tests/projects.spec.ts`.

- [x] Wrap `worker.postMessage(request)` in `try/catch`, calling the existing cleanup before rejecting so fallback cannot leave a Worker or timeout alive.
- [x] Add fake-Worker regressions for synchronous postMessage failure, success, cancellation, and timeout; assert termination and timer/listener cleanup.
- [x] Extend the private `transaction` helper with `signal?: AbortSignal`; listen for cancellation until transaction completion, call `tx.abort()`, remove the listener and close the database on settlement, and reject cancellation with `signal.reason`.
- [x] Pass the signal from `saveProject` into the transaction helper. Remove duplicated checks rendered unnecessary by the centralized transaction lifecycle.
- [x] Use real IndexedDB in `tests/projects.spec.ts` to abort after `store.get` starts and verify original source/history survive with an AbortError rejection.

### Task 4: Remaining dead code and verification

**Files:** `src/diagnostics.ts`, `vite.config.ts`.

- [x] Delete unused `documentWarnings`; retain the production `locatedWarnings` implementation.
- [x] Ignore generated `tmp`, `test-results`, and `playwright-report` directories in Vite's development watcher so trace HTML cannot reload the application during tests.
- [x] Verify the watcher with a temporary HTML output file while ensuring source changes still trigger reload.
- [x] Run `npm test`, `npm run build`, and the complete Chromium/WebKit browser suite with `PLAYWRIGHT_CHANNEL=msedge`; use CI for Linux three-browser validation.
Delivery procedure: commit and push the verified cleanup, then check deployment and exercise the corrected navigation and rendering on the live site.

## Verification on 2026-10-25

147 unit tests and 97 Chromium/WebKit browser checks passed. Production build and TypeScript checks passed. The development watcher ignored generated HTML while continuing to detect source changes. The focused end-to-end check verified page-target clamping, malformed footnotes, Mermaid cleanup, saved-property status, PDF filename, metadata, and chapter outlines.
