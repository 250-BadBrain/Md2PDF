# Production Quality Implementation Plan

**Goal:** Verify the Cloudflare deployment and CI, prototype direct searchable PDF download, improve font consistency and local project management, strengthen hostile-input tests and small-screen accessibility.

**Architecture:** Static frontend only. Use an isolated Playwright context for live checks. Direct download is explicitly an experimental image-backed PDF with an embedded, selectable text layer; browser print remains the vector output path. User fonts stay in the browser and must also reach print/export documents.

## Tasks in authorized order

- [x] Commit and push the previously verified six-phase implementation; inspect the resulting GitHub Actions run and live site, fix evidenced CI failures. Files: `.github/workflows/verify.yml`, `playwright.config.ts`, tests. Read-only API checks never expose credentials.
- [x] Implement and test an opt-in direct PDF prototype in `src/searchable-pdf.ts` and `src/export.ts`. Reuse page rendering and annotations, embed a user-supplied TTF, position invisible selectable text lines from DOM Range geometry, validate Chinese/English text, links and mixed page sizes with PDF.js. Clearly retain raster backgrounds and reject absent/unsupported font rather than silently corrupt text.
- [x] Add local font import, loading/error state and glyph coverage checks in `src/fonts.ts`, `src/FontSettings.tsx` and layout variables. Support static TTF for layout and the direct prototype. Do not persist raw font bytes in localStorage or upload them.
- [x] Add project search, rename, copy, recoverable deletion and storage usage in `src/projects.ts` and `src/ProjectLibrary.tsx`; keep active project metadata synchronized and verify recovery, history and images. Deletion stays reversible during the page session, including panel closure.
- [x] Add deterministic generated nested Markdown, hostile HTML and malformed ZIP regression cases. Harden archive size/path/manifest checks and limit actual streamed inflation; preserve official compatibility baselines.
- [x] Add responsive editor/preview tabs, wrapping actions and labels, focus visibility, panel Escape/return focus and keyboard preview-to-source navigation. Tests exercise 390px and 768px viewports, keyboard behavior and overflow.
- [ ] Run unit, browser, build and live release checks; inspect PDF/screenshot artifacts, record actual CI and deployment status, and push final changes because the user has authorized proceeding with remote verification.

## Checks

`npm test`, `npm run build`, `npm run test:browser`; live smoke uses `MD2PDF_LIVE_URL=https://md2pdf.lab.h2seo4.win`. Test contexts are ephemeral. Avoid claims of PDF accessibility or vector formulas for the experimental layered export. CI failures on unrelated Cloudflare API/account settings are reported without changing account settings.

2026-10-04 verification: previous release `f4850da` was deployed successfully by Cloudflare. Its Windows visual job and Firefox/WebKit checks passed; Linux Chromium's PDF assertion failed only on extra extracted whitespace and now normalizes whitespace. Local unit tests: 32 passed (including unchanged 1,324 official corpus cases). Full Chromium/WebKit suite: 47 passed before the added cross-engine font case; subsequent six cross-engine tests and nine project/export/input tests passed. Production build and existing Windows visual baselines passed. Reviewed mobile screenshot and actual live PDF rendering. Final remote CI and new-release live verification follow the push.
