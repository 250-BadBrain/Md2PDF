# Production Quality Implementation Plan

**Goal:** Verify the Cloudflare deployment and CI, prototype direct searchable PDF download, improve font consistency and local project management, strengthen hostile-input tests and small-screen accessibility.

**Architecture:** Static frontend only. Use an isolated Playwright context for live checks. Direct download is explicitly an experimental image-backed PDF with an embedded, selectable text layer; browser print remains the vector output path. User fonts stay in the browser and must also reach print/export documents.

## Tasks in authorized order

- [ ] Commit and push the previously verified six-phase implementation; inspect the resulting GitHub Actions run and live site, fix evidenced CI failures. Files: `.github/workflows/verify.yml`, `playwright.config.ts`, tests. Read-only public API checks never expose credentials.
- [ ] Implement and test an opt-in direct PDF prototype in `src/searchable-pdf.ts` and `src/export.ts`. Reuse page rendering and annotations, embed a user-supplied TTF, position invisible selectable text from DOM Range geometry, validate Chinese/English text, links and mixed page sizes with PDF.js. Clearly retain raster backgrounds and reject absent/unsupported font rather than silently corrupt text.
- [ ] Add local font import, loading/error state and glyph coverage checks in `src/fonts.ts`, `src/FontSettings.tsx` and layout variables. Support TTF only for the direct prototype; other font formats may be used for layout when valid. Do not persist raw font bytes in localStorage or upload them.
- [ ] Add project search, rename, copy, recoverable deletion and storage usage in `src/projects.ts` and `src/ProjectLibrary.tsx`; keep active project metadata synchronized and verify recovery, history and images. Deletion stays reversible during the session.
- [ ] Add deterministic generated nested Markdown, hostile HTML and malformed ZIP regression cases. Harden archive size/path/manifest checks when failures demonstrate a gap; preserve official compatibility baselines.
- [ ] Add responsive editor/preview tabs, wrapping actions and labels, focus visibility, dialog Escape/return focus and keyboard preview-to-source navigation. Tests exercise 390px and 768px viewports, keyboard behavior and overflow.
- [ ] Run unit, browser, build and live release checks; inspect PDF/screenshot artifacts, record actual CI and deployment status, and push final changes because the user has authorized proceeding with remote verification.

## Checks

`npm test`, `npm run build`, `npm run test:browser`; live smoke uses `MD2PDF_LIVE_URL=https://md2pdf.lab.h2seo4.win`. Test contexts are ephemeral. Avoid claims of PDF accessibility or vector formulas for the experimental layered export. CI failures on unrelated Cloudflare API/account settings are reported without changing account settings.
