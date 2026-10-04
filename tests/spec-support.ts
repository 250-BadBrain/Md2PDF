import fs from 'node:fs';

export type SpecExample = { example: number; section: string; markdown: string; html: string };
export const commonmark: SpecExample[] = JSON.parse(fs.readFileSync('tests/fixtures/spec/commonmark-0.31.2.json', 'utf8'));
export function readGfm(): SpecExample[] {
  const lines = fs.readFileSync('tests/fixtures/spec/gfm-0.29-spec.txt', 'utf8').split(/\r?\n/);
  const examples: SpecExample[] = [];
  let section = '';
  for (let index = 0; index < lines.length; index++) {
    if (/^#{1,6} /.test(lines[index])) section = lines[index].replace(/^#+ /, '');
    const marker = lines[index].match(/^(`{32}) example(?: .*)?$/)?.[1];
    if (!marker) continue;
    const source: string[] = [], expected: string[] = [];
    while (++index < lines.length && lines[index] !== '.') source.push(lines[index]);
    if (index === lines.length) throw new Error('GFM example is missing its separator');
    while (++index < lines.length && lines[index] !== marker) expected.push(lines[index]);
    if (index === lines.length) throw new Error('GFM example is missing its closing fence');
    examples.push({ example: examples.length + 1, section, markdown: source.join('\n').replace(/→/g, '\t') + '\n', html: expected.join('\n').replace(/→/g, '\t') + '\n' });
  }
  return examples;
}

// Compare rendered structure, retaining text, links, code, and semantic attributes.
// Exclude only product decoration: heading navigation, highlighter spans, layout classes.
export function canonicalHtml(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('.header-anchor').forEach((node) => {
    const previous = node.previousSibling;
    if (previous?.nodeType === Node.TEXT_NODE) previous.textContent = previous.textContent!.replace(/ $/, '');
    node.remove();
  });
  template.content.querySelectorAll('pre code span').forEach((node) => node.replaceWith(...node.childNodes));
  template.content.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((node) => {
    node.removeAttribute('id'); node.removeAttribute('tabindex');
  });
  template.content.querySelectorAll('figure.image-figure').forEach((figure) => {
    const paragraph = document.createElement('p');
    paragraph.append(...figure.querySelectorAll(':scope > img'));
    figure.replaceWith(paragraph);
  });
  template.content.querySelectorAll('img').forEach((node) => {
    node.removeAttribute('crossorigin');
    const src = node.getAttribute('src') || '';
    if (src.startsWith('blob:spec-')) node.setAttribute('src', decodeURIComponent(src.slice(10)));
  });
  template.content.querySelectorAll('th,td').forEach((node) => {
    const alignment = (node as HTMLElement).style.textAlign;
    if (alignment) node.setAttribute('align', alignment);
  });
  const comments = document.createTreeWalker(template.content, NodeFilter.SHOW_COMMENT);
  const removed: Node[] = [];
  while (comments.nextNode()) removed.push(comments.currentNode);
  removed.forEach((node) => node.parentNode?.removeChild(node));
  template.content.normalize();
  function visit(node: Node, pre = false): unknown {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      return pre ? text : text.replace(/\s+/g, ' ');
    }
    if (!(node instanceof Element)) return null;
    const attrs = [...node.attributes].filter((attribute) => !attribute.name.startsWith('data-source-') && !(attribute.name === 'style' && ['TH', 'TD'].includes(node.tagName)))
      .map((attribute) => attribute.name === 'class'
        ? ['class', attribute.value.split(' ').filter((value) => !['contains-task-list', 'task-list-item', 'task-list-item-checkbox'].includes(value)).join(' ')]
        : [attribute.name, attribute.value])
      .filter(([key, value]) => key !== 'class' || value !== '')
      .sort((a, b) => a[0].localeCompare(b[0]));
    const children = [...node.childNodes].map((child) => visit(child, pre || node.tagName === 'PRE')).filter((child) => child !== null);
    if (['TABLE', 'THEAD', 'TBODY', 'TR', 'UL', 'OL', 'BLOCKQUOTE'].includes(node.tagName)) {
      return [node.tagName, attrs, children.filter((child) => child !== ' ')];
    }
    return [node.tagName === 'S' ? 'DEL' : node.tagName, attrs, children];
  }
  return [...template.content.childNodes].map((node) => visit(node)).filter((node) => node !== null && node !== ' ');
}
