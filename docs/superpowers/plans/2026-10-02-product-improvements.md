# PDF and Editing Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

> 此计划保留初次实施记录。用户随后要求保持纯前端；服务端方案已移除，当前架构见 `2026-10-02-pure-frontend.md`。

**Goal:** 按顺序交付可搜索 PDF、复杂分页、长文档预览优化、可保存排版设置与视觉回归测试。

**Architecture:** 共用客户端分页与样式，Node/Chromium 输出原生 PDF，静态网站提供浏览器打印。分页继续使用 DOM 测量；设置统一控制页面尺寸和文本样式；预览缓存与窗口化只影响显示，不影响完整导出。

**Tech Stack:** React、TypeScript、Vite、Playwright Chromium、Vitest、PDF 文本提取与视觉快照。

## Global Constraints

- 保留前一轮未提交的修复，直接在当前会话实施；不创建提交或部署。
- Windows 使用 PowerShell 7；文件 UTF-8。
- 纯静态部署继续可用，本地服务默认监听 loopback；不加载提交文档中的脚本或服务端外部资源。

---

### Task 1: Searchable PDF

**Files:** `server/pdf.mjs`, `server/index.mjs`, `src/export.ts`, `vite.config.ts`, `src/App.tsx`, `tests/browser.spec.ts`。
**Interfaces:** `exportPdf(pages: string[], meta: DocumentMeta, native: boolean): Promise<Blob>`；`createPdfMiddleware(): (req,res,next)=>Promise<void>`。

- [x] 将现有图像导出提取为独立模块，保持回归行为。
- [x] 实现原生接口：`await page.pdf({preferCSSPageSize:true, printBackground:true, tagged:true, outline:true})`；上下文禁用脚本并拦截外部请求，输入限制 32MB、最多 1000 页。
- [x] 客户端将资源和字体内联，再 POST `/api/pdf`；静态环境用独立打印 iframe。
- [x] 下载实际 PDF，以 PDF.js 验证中文和英文正文可提取，并检查链接与图像质量。

### Task 2: Complex pagination

**Files:** `src/pagination.ts`, `tests/browser.spec.ts`。
**Interfaces:** `paginateHtml(html, meta, signal?): Promise<string[]>`。

- [x] 回归断言：`expect(actualText).toBe(originalText)`、续页有序列表编号连续、长表格单元格字号保持原值。
- [x] 分页时跟踪嵌套列表原始编号；把超高表格行拆为对应的多个单元格片段，重复表头。
- [x] 支持嵌套手动分页，标题与正文衔接；保留复杂 rowspan 行组，无法拆分的图形仍缩放。
- [x] 执行浏览器测试检查每页无纵向溢出。

### Task 3: Long-document performance

**Files:** `src/preview.ts`, `src/PagePreview.tsx`, `src/App.tsx`, `src/pagination.ts`。
**Interfaces:** 有限 LRU 缓存、AbortSignal、窗口化显示。

- [x] 保留旧预览并显示更新状态；更新期间禁止导出过期文档。
- [x] 分页循环定期让出主线程并检查取消，测量完的页面从 DOM 卸载。
- [x] 每个预览页保留占位尺寸，只挂载视口附近的内容；提供页码跳转并正确滚动到锚点。
- [x] 回归断言长文档 DOM 页数小于总页数，跳转到末页后内容可见。

### Task 4: Layout preferences

**Files:** `src/settings.ts`, `src/LayoutSettings.tsx`, `src/markdown.ts`, `src/App.css`。
**Interfaces:** `LayoutSettings`、`resolveLayout(meta, preferences): DocumentMeta`、`pageDimensions(meta)`。

- [x] 支持 A4/A5/Letter、方向、边距、字体、字号、行距、页眉页脚及页码。
- [x] 保存用户配置到 localStorage，捕获存储不可用错误，提供重置；文档 YAML 设置优先。
- [x] 同一组 CSS 变量用于测量、预览与两个导出模式。
- [x] 测试纸张尺寸、重载后配置恢复、非法值归一化和 YAML 优先级。

### Task 5: Compatibility and visual verification

**Files:** `tests/fixtures`, `tests/visual.spec.ts`, `tests/settings.test.ts`, `README.md`, `docs/product-improvements.md`。

- [x] 固定字体和浏览器，在示例集上生成分页截图基线：`expect(page.locator('.pdf-page').first()).toHaveScreenshot('syntax.png')`。
- [x] 增加原生 PDF 文本提取、打印回退、复杂分页和设置回归。
- [x] 执行 `npm test`、`npm run test:browser`、`npm run build`、`npm audit`；检查导出 PDF 渲染图。
- [x] 更新运行、浏览器安装、部署和静态环境限制说明，记录每阶段结果。
