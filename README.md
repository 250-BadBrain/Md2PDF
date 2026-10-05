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

“图像 PDF”使用 html2canvas + jsPDF，可直接下载，但正文不可搜索。可选择小体积、均衡、高清三档。批量 ZIP 固定使用图像 PDF，保留目录与重名处理；每卷最多 10 个文件或约 32MiB PDF，超出后自动分卷下载。单个大 PDF 仍可能超过分卷阈值，浏览器可能需要允许多文件下载；取消不会撤回已经下载的分卷。批量可搜索 PDF 需逐个文档打印保存。两种方式均导出完整文档，预览窗口化不影响页数。

“可搜索 PDF（直接下载·实验）”为图像页面添加按行定位的不可见文字层，支持正文搜索、复制、链接和混合纸张尺寸。先在排版设置中导入覆盖正文的静态 TTF 字体；缺字、限制嵌入或 PDF 引擎不支持的字体会报错。公式、SVG 和 Mermaid 保留图像，emoji、扩展区汉字暂不支持文字层；复杂文字塑形及阅读顺序尚未全面验证，也不承诺 PDF 无障碍标签。需要矢量输出时使用默认打印保存。

本地字体同时用于预览和打印，只保留在本次页面，不上传，也不写入项目包或 localStorage。重新加载后需再次导入。支持 Unicode cmap 4/12 的静态 TTF；不支持 TTC、OTF、可变字体，单字体上限 25MiB。字体覆盖提示根据源码检查，最终导出根据可见正文检查。

项目库支持名称搜索、重命名、复制、恢复版本和撤销最近一次删除。撤销记录在本次页面内保留，关闭项目库仍可撤销，刷新后失效。存储统计为浏览器报告的整个站点用量，包含离线缓存。小屏幕使用编辑／预览切换；预览页可通过 Tab 聚焦并按回车定位源码，设置面板按 Escape 关闭并返回触发按钮。

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

GitHub Actions 在推送 `main` 或提交 PR 时执行单元测试、构建和 Linux 三浏览器检查（包含离线专项）；Windows Edge 单独检查已有分页截图。失败时保留 trace、截图和 HTML 报告。配置见 `.github/workflows/verify.yml`；本地写入配置不代表远程 CI 已运行。

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
| 文档扩展 | 脚注、缩写、定义列表、Emoji、高亮 `==文本==`、插入线 `++文本++`、上下标 `H~2~O` / `x^2^`、注音 `[你好]{nǐ hǎo}` / `[小夜時雨]^(さ・よ・しぐれ)`、CJK 波浪线 `~波浪线~` |
| 目录 | 独立行 `[TOC]`、`[[toc]]`、`${toc}`；支持 1–6 级标题、重复标题和显式 ID |
| 属性 | 标题 `## 标题 {#custom-id}`；图片 `![图](a.png){width=240 height=120}`；允许 id/class/width/height |
| 数学 | `$...$`、`$$...$$`、`\(...\)`、`\[...\]`、`math` 代码围栏，由 KaTeX 渲染 |
| 图表 | `mermaid`、`plantuml` / `puml`、`infographic` 代码围栏；全部本地渲染，无效图表保留源代码并显示诊断 |
| HTML | 安全的内嵌 HTML，如 details/summary、kbd、上下标、图片、center 和表格；保留有限的图片宽高，去除脚本、事件属性、危险 URL、其它内联样式和嵌入页面 |
| 提示容器 | `::: 类型 可选标题`，以 `:::` 结束；支持原六种、theorem/definition/proof 及中文自定义类型、嵌套容器；提示块支持 `[!IMPORTANT] 自定义标题` |
| 手动分页 | 独立行 `[pagebreak]`、`{pagebreak}`、`<!-- pagebreak -->`；代码块中的同名文本不会分页 |

默认文档扩展模式保留原项目的语法与换行习惯。“排版 → Markdown 模式”新增 CommonMark、GFM、Obsidian 常用扩展；也可在 YAML 指定 `dialect`。CommonMark/GFM 固定使用标准软换行并关闭数学、Mermaid 和文档扩展。文档/Obsidian 模式可独立设置 `softBreaks: space`。所有模式仍清洗 HTML，不宣称输出与标准或 GitHub 网站完全相同。本项目不执行 MDX/JSX，也不提供 Pandoc 的完整语法或任意 LaTeX 环境。

Obsidian 模式支持当前文档 `[[#标题|别名]]`、段落结尾 `^block-id` 与 `[[#^block-id]]`，以及本地图片 `![[picture.svg|说明]]`。跨文档双链和笔记嵌入会提示目标未找到或不支持，不会自动读取其他笔记。

完整官方例集已纳入离线测试，共检查 1,324 个例子；已知差异逐例登记，不宣称全量兼容。支持清单、差异原因和验证方法见 [Markdown 兼容性说明](docs/markdown-compatibility.md)，可运行 `npm run test:compatibility`。

[Doocs 默认中文示例](tests/fixtures/doocs/README.md)已加入完整文档回归。单波浪与下标语法冲突，因此只把纯 CJK 文字标为波浪线，ASCII 内容继续用作下标；需要跨语言的波浪线可用 `<span class="md-wavy">text</span>`。Ruby 的 `・`、`．`、`。`、`-` 分隔读音按 Unicode 字符分组。

PlantUML 使用官方 JavaScript 引擎与 Viz 在隔离 iframe 中生成 SVG，不调用在线服务器。首次使用按需加载约 5.4MB 原始引擎资源；静态部署和离线缓存包含这些文件。支持引擎内置图形语法，禁用预处理、include/theme、URL、外部图片、字体和图标库；复杂内容受源码、尺寸和 20 秒限制。Infographic 使用 AntV 模板在本地渲染，使用系统字体；示例中的四种图标已内置，其它图标/插画显示本地通用替代。不会联网下载图标或字体；自定义 SVG/CSS、外部资源不透传，源码与数据规模有限制。上述边界不等于完整复制 Doocs 的所有扩展。

## 图片和上传

“上传”可以同时选择 Markdown、TXT 和图片；“上传文件夹”保留相对目录。图片支持引用式路径、中文、空格、括号、URL 编码及 `../` 路径。批量 ZIP 保留上传目录，重名输出自动加编号。

图片还可以使用 `![说明|240x120](a.png)` 或 `![说明|width=50%](a.png)`。单独一行的图片会展示说明文字。找不到本地资源或图片加载失败时显示提示；远程图片需要其服务器允许跨域访问才能正常导出。

本地文本草稿自动保存正文和文件名。“项目库”可保存多个包含本地图片与排版设置的项目；保存项目后，编辑自动更新该项目，刷新时恢复图片。每个项目保留最近五个不同版本，支持还原历史、删除、导入/导出 ZIP 项目包。正文上限 2Mi 字符，项目上限 100MiB、200 张图片，实际可保存容量受浏览器配额限制。仅文本草稿仍不保存图片；清除草稿不删除项目库中的项目。

编辑工具提供查找替换、Markdown 下载和可选同步滚动。同步滚动依据源码块的行号定位，并考虑编辑区自动折行；点击预览正文可选中对应源码块，诊断提示可跳转到源代码。超长块跨页仍映射到原始块范围；原始 HTML 与包含 HTML 原始文本标签的文档可能没有映射。

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
dialect: document
footnotes: page-bottom
minParagraphLines: 2
figureNumbers: true
wideTables: true
---
```

页眉页脚支持 `{title}`、`{author}`、`{date}`、`{page}`、`{total}`；正文中的同名文本保留。`margin` 接受 1–4 个 CSS 页边距值，每个值使用 mm/cm/in/px，范围为 8–50mm；带页眉或页脚时，上下保留至少 16mm。正文字号限制为 10–24px，行距为 1.2–2.4。无效 YAML 保留为正文，无效配置沿用界面设置。

长段落、代码和列表保留内联格式跨页拆分，嵌套有序列表编号连续；提示块内的手动分页也生效。表格按行分页并重复表头，超长普通表格行拆分单元格内容，避免整体缩小字号。含 rowspan 的表格按相连行组分页；超高行组及无法拆分的图形保持结构，必要时缩小；宽公式也会缩小适应页面。

“排版”还可选择主题、封面与脚注位置。页底脚注会预留正文空间，长注续页；极大不可拆内容仍可能缩小。段落分页最少行数可设为 1–4，默认 1 保留原行为；不足以分割的不可拆块仍使用安全回退。开启图与图表编号后可使用 `[@ref](#figure-1)`、`[@ref](#diagram-1)` 或显式图片 ID 交叉引用。宽表格可独占横向页面，并在预览与两种 PDF 输出中保留混合尺寸。生产版支持离线缓存，首次需联网等待缓存完成；只缓存静态应用资源。更多说明及限制见 [后续纯前端改进](docs/frontend-improvements.md) 和 [本轮六项改进](docs/quality-and-document-workflows.md)。

预览会显示更新状态，只挂载当前视口附近的页面，并支持跳转页码和目录锚点。相同文档及设置的结果通过有限缓存复用，修改文档时取消过期分页。选择“图像 PDF”仍使用 html2canvas + jsPDF，该兼容模式的正文不能选中或搜索。检查记录见 [第一轮修复](docs/project-review.md) 和 [五项改进记录](docs/product-improvements.md)。
