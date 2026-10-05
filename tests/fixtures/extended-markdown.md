---
dialect: obsidian
title: 扩展 Markdown 示例
---
# 扩展 Markdown 示例

正文后无需空行。
\[
x = \frac{a+b}{2}
\]

\begin{align*}
a &= b+c \\
d &= e+f
\end{align*}

\begin{equation}
\begin{split}
E &= mc^2 \\
  &= \frac{1}{2}mv^2
\end{split}
\end{equation}

## 跨行跨列表格

| 部门 | 项目 | 数值 |
| --- | --- | --- |
| 分组甲 | 合并两列 ||
| ^^ | 公式 | $x^2$ |
| 分组乙 | 第一行 | 42 |\
|        | 第二行 |    |
[统计表]

## 可折叠提示块

> [!note]- 注音与公式
> [你好]{nǐ hǎo}
>
> 正文在折叠时仍应导出。
> \[
> y = \frac{1}{2}
> \]
>
> > [!tip]+ 内层
> > 嵌套正文也应导出。

> [!warning]+ 默认展开
> 已展开正文。

结束标记。
