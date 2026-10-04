# Markdown Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 引入完整官方语法用例，明确兼容差异，并提供可保存、可由 YAML 覆盖的软换行设置。
**Architecture:** 用现有产品解析路径测试 CommonMark 0.31.2 与 GFM 0.29 官方例集。DOM 规范化仅去除产品装饰；已知差异保留精确输入/输出与原因，未知或改变的差异使测试失败。解析器按换行模式分别缓存，避免异步任务相互修改。
**Tech Stack:** TypeScript、markdown-it、Vitest、Playwright、离线固定官方用例。

## Global Constraints
- 保持纯前端与当前默认换行习惯，不修改 PDF 导出架构。
- 不宣称完整标准兼容，不以标准输出替换应用安全策略。
- 在当前会话按授权实施，不提交代码或使用子代理。

### Task 1: Soft breaks
**Files:** src/markdown.ts, src/settings.ts, src/LayoutSettings.tsx, src/preview.ts, src/App.tsx, tests/markdown.test.ts, tests/improvements.spec.ts.
**Interface:** DocumentMeta.softBreaks?: 'newline' | 'space'; renderMarkdownToHtml(source, path?, assets?, preferences?).
- [x] 先测试 `a\nb` 默认产生 br、space 模式保留软换行、两空格或反斜杠的硬换行始终有效，YAML 优先。
- [x] 按模式缓存解析器，并将 `breaks: softBreaks === 'newline'` 传入 createMarkdown；界面保存该设置，预览与批量解析传同一 preferences。
- [x] 加入浏览器切换与重载、YAML 覆盖回归。

### Task 2: Official examples
**Files:** tests/fixtures/spec/*, tests/compatibility.test.ts, tests/spec-support.ts, docs/markdown-compatibility.md.
- [x] 固定下载 CommonMark spec.json 与 cmark-gfm 0.29.0.gfm.13 test/spec.txt，记录来源、许可证、哈希和用例数量。
- [x] 逐例调用应用实际 renderer（space 模式）；仅规范化标题导航、代码高亮、HTML 属性排序和表格布局装饰。
- [x] 对全部差异检查输入与输出，修复非预期差异；精确登记主动扩展、安全策略或上游差异，并以 expect(actual).toEqual(baseline) 固定结果。
- [x] 更新支持清单与测试命令，执行单元、构建、浏览器及视觉回归。