# Md2PDF

基于 React、TypeScript 和 Vite 的 Markdown 转 PDF 工具。支持编辑、分页预览、可搜索 PDF、文件夹图片及批量 ZIP。

## 运行与验证

需要 Node.js 22.13+（或 24+）和 npm。

```bash
npm ci
npm run dev
npm test
npm run build
```

打开终端提示的本地地址即可使用。

本项目为纯前端应用。Markdown 解析、分页、预览、图片处理和 ZIP 导出均在浏览器中完成，不提供 PDF 后端，不发送文档内容到导出服务。Node.js 仅用于开发、构建和测试；部署时只需将 `dist` 上传到静态托管。

默认“可搜索 PDF（打印保存）”打开浏览器打印对话框。选择“另存为 PDF”，关闭浏览器自带页眉页脚，使用文档纸张尺寸；正文可复制和搜索，图表保持矢量输出。最终结果由当前浏览器的打印引擎决定，建议使用 Chrome 或 Edge。

“图像 PDF”使用 html2canvas + jsPDF，可直接下载，但正文不可搜索。批量 ZIP 固定使用图像 PDF，保留目录与重名处理；批量可搜索 PDF 需逐个文档打印保存。两种方式均导出完整文档，预览窗口化不影响页数。

本地检查构建后的静态页面：

```sh
npm run build
npm run preview
```
浏览器回归测试首次运行前安装 Chromium：

```bash
npx playwright install chromium webkit
npm run test:browser
```

浏览器测试覆盖 Chromium 和 WebKit；Firefox 可用 `npm run test:firefox` 单独验证，本机目前存在启动限制。离线测试需先执行 `npm run build`。测试捕获前端实际生成的打印文档，在测试浏览器中生成 PDF，并用 PDF.js 验证中文、英文及纸张尺寸；同时覆盖零 API 请求、复杂分页、设置持久化、图像下载与批量 ZIP。Playwright 浏览器仅用于自动化测试，不是应用运行依赖。视觉基线保存在 `tests/visual.spec.ts-snapshots`，当前基线为 Windows 字体环境。变更排版后需人工检查截图，再运行：

```sh
npm run test:visual -- --update-snapshots
```

首次迁移到其他操作系统也应生成并检查相应平台的基线。

Windows 已安装 Edge 时，也可在 PowerShell 中运行：

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:browser
```

## 支持的语法

| 类别 | 支持内容 |
| --- | --- |
| 基础 Markdown | ATX/Setext 标题、段落、水平线、粗体、斜体、转义、代码、嵌套列表和引用、行内及引用式链接／图片、自动链接 |
| GFM 常用扩展 | 表格及列对齐、删除线、任务列表、NOTE/TIP/IMPORTANT/WARNING/CAUTION 提示块 |
| 文档扩展 | 脚注、缩写、定义列表、Emoji、高亮 `==文本==`、插入线 `++文本++`、上下标 `H~2~O` / `x^2^` |
| 目录 | 独立行 `[TOC]`、`[[toc]]`、`${toc}`；支持 1–6 级标题、重复标题和显式 ID |
| 属性 | 标题 `## 标题 {#custom-id}`；图片 `![图](a.png){width=240 height=120}`；允许 id/class/width/height |
| 数学 | `$...$`、`$$...$$`、`\(...\)`、`\[...\]`、`math` 代码围栏，由 KaTeX 渲染 |
| 图表 | `mermaid` 代码围栏；无效图表回退为源代码 |
| HTML | 安全的内嵌 HTML，如 details/summary、kbd、上下标、图片和表格；去除脚本、事件属性、危险 URL、任意内联样式和嵌入页面 |
| 提示容器 | `::: note/tip/info/warning/danger/success 可选标题`，以 `:::` 结束 |
| 手动分页 | 独立行 `[pagebreak]`、`{pagebreak}`、`<!-- pagebreak -->`；代码块中的同名文本不会分页 |

默认普通单行换行会显示为换行，保留原项目的编辑习惯；可在“排版 → 软换行”选择标准软换行，或在 YAML 指定 `softBreaks: space`。此选项只改变换行，不代表完整 CommonMark 模式。Markdown 方言不完全一致，本项目不执行 MDX/JSX，也不提供 Pandoc 的完整语法或任意 LaTeX 环境。

完整官方例集已纳入离线测试，共检查 1,324 个例子；已知差异逐例登记，不宣称全量兼容。支持清单、差异原因和验证方法见 [Markdown 兼容性说明](docs/markdown-compatibility.md)，可运行 `npm run test:compatibility`。

## 图片和上传

“上传”可以同时选择 Markdown、TXT 和图片；“上传文件夹”保留相对目录。图片支持引用式路径、中文、空格、括号、URL 编码及 `../` 路径。批量 ZIP 保留上传目录，重名输出自动加编号。

图片还可以使用 `![说明|240x120](a.png)` 或 `![说明|width=50%](a.png)`。单独一行的图片会展示说明文字。找不到本地资源或图片加载失败时显示提示；远程图片需要其服务器允许跨域访问才能正常导出。

本地草稿自动保存正文和文件名，刷新后恢复；图片需要重新上传。编辑工具提供查找替换、Markdown 下载和可选同步滚动。清除草稿保留当前编辑内容。

上传 `examples` 文件夹可查看 [完整语法示例](examples/syntax.md) 和本地图片。

## 文档设置

点击“排版”即可调整 A4/A5/Letter、横纵方向、边距、无衬线／衬线／等宽字体、正文字号、行距、页眉页脚、页码和章节分页。配置自动保存在当前浏览器，不保存 Markdown 正文；“恢复默认设置”可重置。YAML 中明确指定的设置优先于界面配置。

可在文件开头添加 YAML front matter：

```yaml
---
title: 文档标题
author: 作者
date: 2026-10-01
header: "{title} · {page}/{total}"
footer: "{author}"
pageNumbers: true
tocPageNumbers: true
chapterNewPage: true
chapterLevel: 2
margin: 20mm
paper: A4
orientation: portrait
fontFamily: sans
fontSize: 14
lineHeight: 1.72
softBreaks: space
---
```

页眉页脚支持 `{title}`、`{author}`、`{date}`、`{page}`、`{total}`；正文中的同名文本保留。`margin` 接受 1–4 个 CSS 页边距值，每个值使用 mm/cm/in/px，范围为 8–50mm；带页眉或页脚时，上下保留至少 16mm。正文字号限制为 10–24px，行距为 1.2–2.4。无效 YAML 保留为正文，无效配置沿用界面设置。

长段落、代码和列表保留内联格式跨页拆分，嵌套有序列表编号连续；提示块内的手动分页也生效。表格按行分页并重复表头，超长普通表格行拆分单元格内容，避免整体缩小字号。含 rowspan 的表格按相连行组分页；超高行组及无法拆分的图形保持结构，必要时缩小；宽公式也会缩小适应页面。

“排版”还可选择主题、封面与靠近首次引用的脚注。生产版支持离线缓存，首次需联网等待缓存完成；只缓存静态应用资源。更多说明及限制见 [后续纯前端改进](docs/frontend-improvements.md)。

预览会显示更新状态，只挂载当前视口附近的页面，并支持跳转页码和目录锚点。相同文档及设置的结果通过有限缓存复用，修改文档时取消过期分页。选择“图像 PDF”仍使用 html2canvas + jsPDF，该兼容模式的正文不能选中或搜索。检查记录见 [第一轮修复](docs/project-review.md) 和 [五项改进记录](docs/product-improvements.md)。
