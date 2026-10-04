# Pure Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 保持纯前端，移除新增 PDF 后端，保留浏览器打印、图像 PDF 和批量 ZIP。
**Architecture:** Vite 仅构建静态资源。单文档默认调用 printPages；批量仅调用 renderImagePdf，文档不发送到 API。
**Tech Stack:** React、TypeScript、Vite、html2canvas、jsPDF、Playwright（仅测试）。

## Global Constraints
- 保留既有 Markdown、分页、性能与设置改进；不提交或部署。
- 按用户授权在当前会话执行，不启用子代理。

### Task 1: Remove runtime backend
**Files:** vite.config.ts, package.json, server/*, src/App.tsx, src/export.ts.
**Interfaces:** printPages(pages, meta): Promise<void>; renderImagePdf(pages, meta): Promise<Blob>.
- [x] 将 Vite 插件恢复为 `plugins: [react()]`，移除 server 文件与 start 脚本、运行时 playwright 依赖。
- [x] 删除 API 状态检测和 exportPdf；单文档使用 printPages 或 renderImagePdf，批量固定 renderImagePdf，提示打印保存限制。

### Task 2: Verify static workflows
**Files:** tests/print.ts, tests/browser.spec.ts, tests/improvements.spec.ts, tests/server.spec.ts, README.md, docs/product-improvements.md.
- [x] 用测试辅助函数拦截 iframe.print 并提取 srcdoc，在测试 Chromium 中 `page.pdf({preferCSSPageSize:true})` 验证可搜索文本和尺寸；此生成仅存在于测试。
- [x] 删除服务专用测试，新增启动过程零 API 请求及批量图像 ZIP 回归。
- [x] 运行 `npm test`、`npm run build`、`npm run test:browser`、`npm audit`，预期全部通过，更新文档为纯静态部署方式。