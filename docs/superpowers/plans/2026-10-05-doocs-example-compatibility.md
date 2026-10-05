# Doocs Example Compatibility Implementation Plan

**Goal:** Reproduce and fix gaps exposed by the live Chinese default example at https://md.doocs.org/, preserving a static, pure frontend app.

**Reference:** `doocs/md` commit `a7c17fc4cda92e3c13aa7e24f06615cfa4219b31`, `apps/web/src/assets/example/markdown.zh-CN.md`; WTFPL license. Store unchanged fixture, license and source/hash attribution. The live preview was inspected in an isolated browser context on 2026-10-05.

**Architecture:** Extend only document/obsidian modes, preserving official CommonMark/GFM baselines. Separate inline/block extensions and diagram adapters into small modules. Render diagrams as SVG entirely inside the browser. The official PlantUML JavaScript engine runs in an opaque sandbox with network/externals disabled and explicit unsupported-input diagnostics. AntV infographic renders locally with system fonts and local icons; no remote icon fetches or document uploads. Preserve only bounded safe HTML presentation attributes, not arbitrary user CSS.

## Tasks

- [x] Reproduce the complete sample in the current app; record unsupported blocks, formula failures, source mapping, loaded images and pagination overflow.
- [x] Implement Ruby `[text]{reading}` / `[text]^(reading)`, safe Unicode grouping and delimiter behavior; preserve code/link/attribute semantics. Extend titled alerts and generic/academic containers. Retain existing subscript semantics and document the overlapping single-tilde wave syntax explicitly instead of breaking it globally.
- [x] Add official local PlantUML and browser Infographic rendering. Cover the supplied examples, failures, source preservation, malicious directives, no network execution and offline operation.
- [x] Correct demonstrated formula/HTML/image presentation gaps using narrow validation; verify safe styles, centered image width, dimensions and failure diagnostics.
- [x] Add complete-sample browser/pagination/print/PDF regression and isolated focused unit tests. Check official corpora and existing visual baselines without automatic changes.
- [x] Update compatibility docs, run build/unit/browser checks, review rendered PDF and screenshots, prepare a reviewed commit. Follow deployment with CI/Cloudflare and isolated-browser verification, as already authorized in this project.

## Verification

`npm test`, `npm run build`, Chromium/WebKit browser tests; remote CI checks Firefox. The full reference's escaped integral formula already renders successfully, so no math normalization is needed. Network-bound images are exercised with stable local fixtures in CI and checked live separately. No new backend, external diagram-rendering endpoint or global compatibility-baseline changes.
