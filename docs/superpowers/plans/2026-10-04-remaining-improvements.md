# Remaining Frontend Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 按顺序完成导出反馈、排版、编辑恢复、性能和离线能力，保持纯前端。
**Architecture:** 复用客户端分页与导出；增加独立的编辑、草稿、诊断和 Worker 模块。生产构建生成版本化静态资源缓存，所有用户数据只存浏览器。
**Tech Stack:** React、TypeScript、Vite、Web Worker、Service Worker、Playwright。

## Global Constraints
- 保留当前默认行为与全部兼容性用例，不提交或部署。
- 浏览器打印不报告保存成功；跨浏览器验证使用实际浏览器引擎，不宣称运行了 Safari 本体。
- 草稿仅保存文本和文件名；图片需要重新上传。离线包不缓存用户文档、blob 图片或外部请求。

### Task 1: Export feedback
**Files:** src/diagnostics.ts, src/export.ts, src/App.tsx, tests/cross-browser.spec.ts, playwright.config.ts.
- [x] 展示公式、图表、缺图与缩放警告；打印保存说明、实际逐页进度及可取消图像导出。
- [x] 加入 Chromium、Firefox、WebKit 的渲染／打印 iframe 冒烟测试。

### Task 2: Document layout
**Files:** src/pagination.ts, src/settings.ts, src/LayoutSettings.tsx, src/App.css.
- [x] 合并表格按 rowspan 相连行组分页，只缩放超高行组；保持表头与单元格关系。
- [x] 增加可选封面、主题和靠近首次引用的脚注配置，图片与说明保持原子分页。
- [x] 验证文本完整、行组不拆坏、脚注 ID 与目录页码。

### Task 3: Editing and recovery
**Files:** src/draft.ts, src/Editor.tsx, src/App.tsx, tests/editing.test.ts.
- [x] 自动保存草稿并在重载时恢复，处理容量限制、存储失败，提供清除和 Markdown 下载。
- [x] 文字查找／替换、定位与可选比例同步滚动，处理编辑中选择与输入。

### Task 4: Performance and offline
**Files:** src/parser.worker.ts, src/parser-client.ts, src/markdown.ts, src/main.tsx, vite.config.ts, public/manifest.webmanifest, public/icon.svg.
- [x] 大文本解析放到独立 Worker，DOM 清洗／测量仍在主线程；取消时终止 Worker，失败回退。
- [x] 图像导出逐页创建测量 DOM 与释放 canvas，取消整个 ZIP 导出。
- [x] 生产构建静态预缓存应用／字体／动态模块，版本化更新，不拦截用户数据；增加离线状态与安装清单。
- [x] 执行完整单元、构建、浏览器、视觉、生产离线测试并记录限制。
验证限制：Firefox 安装后仍返回 spawn UNKNOWN，独立测试未运行；Chromium 与 WebKit 通过，详见 docs/frontend-improvements.md。
