# Markdown Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 修复 Markdown 到 PDF 的内容丢失问题，完善常用语法并建立自动回归验证。

**Architecture:** 将解析和 DOM 增强提取到 `src/markdown.ts`，将分页提取到 `src/pagination.ts`。预览和导出共享相同结果；使用 token 规则处理分页和图片，避免正则改写源文档。

**Tech Stack:** React、TypeScript、markdown-it、DOMPurify、KaTeX、Mermaid、Vitest、Playwright。

## Global Constraints

- Windows 命令使用 PowerShell 7，文本文件使用 UTF-8。
- 保留现有编辑、上传、批量 ZIP 和 A4 导出流程。
- 直接在当前会话实施并验证用户授权的修复，不创建提交。

---

### Task 1: Parser and syntax regressions

**Files:** Create `src/markdown.ts`, `tests/markdown.test.ts`; modify `src/App.tsx`, `src/markdown-plugins.d.ts`, `package.json`.

**Interfaces:** `renderMarkdownToHtml(source: string, path: string | undefined, assets: Record<string, string>): Promise<RenderedDocument>`; exported `DocumentMeta`, `RenderedDocument`, `escapeHtml`, path helpers.

- [x] 添加失败用例：`expect((await renderMarkdownToHtml('```md\n[pagebreak]\n```', undefined, {})).html).toContain('[pagebreak]')`。
- [x] 执行 `npm test`，确认代码块、引用图片、提示块、公式和 HTML 用例揭示缺陷。
- [x] 图片在 renderer 中解析：`token.attrSet('src', resolveAssetUrl(token.attrGet('src') ?? '', env.path, env.assets))`；分页通过 block rule 生成独立 token。
- [x] 开启并清洗 HTML；支持 attrs 和 dollars/brackets/math fences；目录 href 使用实际 heading token 的 id。
- [x] 执行 `npm test` 与 `npm run build`，确认解析及类型检查通过。

### Task 2: Lossless pagination

**Files:** Create `src/pagination.ts`, `tests/browser.spec.ts`, `playwright.config.ts`; modify `src/App.css`, `src/App.tsx`.

**Interfaces:** `paginateHtml(html: string, meta?: DocumentMeta): Promise<string[]>`; `waitForImages(element: HTMLElement): Promise<void>`。

- [x] 浏览器失败用例：长段落、列表和代码块分页后 `expect(result.text).toBe(source.textContent)` 且每页内容没有溢出。
- [x] 保留 DOM 内联格式，用 Range 和二分查找切分超过页面的块；表格逐行分页并重复表头；无法拆分的单个图形按可用尺寸缩放。
- [x] 页边距写入每页内容、页眉和页脚；只替换页眉页脚模板，正文 `{page}` 原样保留。
- [x] 执行 `npm run test:browser` 验证真实浏览器布局及 PDF 下载。

### Task 3: Upload, export and documentation

**Files:** Modify `src/App.tsx`, `README.md`; create `examples/syntax.md`, `docs/project-review.md`。

**Interfaces:** 上传读取错误展示在界面；ZIP 使用上传相对路径，重名输出增加编号。

- [x] 统一上传处理，错误可见；调整预览防抖和重新挂载后的 ResizeObserver。
- [x] 批量输出使用 `getPdfName(file.path || file.name)`，保留目录并避免覆盖；资源 URL 延迟释放。
- [x] 记录支持语法、修复项目及 PDF 栅格化限制，添加完整示例。
- [x] 执行 `npm test`、`npm run test:browser`、`npm run build` 和 `npm audit`，记录结果。
