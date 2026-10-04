export function documentWarnings(pages: string[]) {
  const host = document.createElement('template'); host.innerHTML = pages.join('');
  const warnings = new Set<string>();
  for (const element of host.content.querySelectorAll('.missing-image,.mermaid-error,.katex-error,.pagination-scaled')) {
    if (element.matches('.missing-image')) warnings.add(element.textContent || '图片无法加载');
    else if (element.matches('.mermaid-error')) warnings.add('Mermaid 图表解析失败，已保留源代码。');
    else if (element.matches('.katex-error')) warnings.add(`公式解析失败：${element.getAttribute('title') || element.textContent}`);
    else warnings.add('部分不可拆内容已缩小，请检查预览中的字号。');
  }
  return [...warnings];
}

export function locatedWarnings(pages: string[]) {
  const host = document.createElement('template'); host.innerHTML = pages.join('');
  return Array.from(host.content.querySelectorAll<HTMLElement>('.missing-image,.mermaid-error,.katex-error,.pagination-scaled,.unresolved-reference'), (element) => {
    const parent = element.closest<HTMLElement>('[data-source-line]');
    return { message: element.matches('.katex-error') ? `公式解析失败：${element.title || element.textContent}` : element.matches('.mermaid-error') ? 'Mermaid 图表解析失败，已保留源代码。' : element.matches('.pagination-scaled') ? '部分不可拆内容已缩小，请检查预览中的字号。' : element.textContent || '引用目标未找到',
      line: Number(parent?.dataset.sourceLine) || undefined, end: Number(parent?.dataset.sourceEnd) || undefined };
  });
}
