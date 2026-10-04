import MarkdownIt from 'markdown-it';
import { gfmAutolinks } from './gfm-autolinks';


import markdownItAttrs from 'markdown-it-attrs';
import markdownItAbbr from 'markdown-it-abbr';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItContainer from 'markdown-it-container';
import markdownItDeflist from 'markdown-it-deflist';
import { full as markdownItEmoji } from 'markdown-it-emoji';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItIns from 'markdown-it-ins';
import markdownItMark from 'markdown-it-mark';
import markdownItSub from 'markdown-it-sub';
import markdownItSup from 'markdown-it-sup';
import markdownItTaskLists from 'markdown-it-task-lists';
import markdownItTocDoneRight from 'markdown-it-toc-done-right';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdownLanguage from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { parse as parseYaml } from 'yaml';

export type DocumentMeta = {
  cover?: boolean;
  theme?: 'classic' | 'book' | 'compact';
  footnotes?: 'end' | 'near-reference';
  softBreaks?: 'newline' | 'space';
  paper?: 'A4' | 'A5' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  fontFamily?: 'sans' | 'serif' | 'mono';
  fontSize?: number;
  lineHeight?: number;
  title?: string;
  author?: string;
  date?: string;
  header?: string;
  footer?: string;
  pageNumbers?: boolean;
  tocPageNumbers?: boolean;
  chapterNewPage?: boolean;
  chapterLevel?: number;
  margin?: string;
};
export type RenderedDocument = {
  html: string;
  meta: DocumentMeta;
};
type AssetUrls = Record<string, string>;

const CONTAINER_TYPES = ['note', 'tip', 'info', 'warning', 'danger', 'success'];
const baseMarkdown = new Map<string, MarkdownIt>();
const mathMarkdownPromises = new Map<string, Promise<MarkdownIt>>();

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('css', css);
hljs.registerLanguage('go', go);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('java', java);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdownLanguage);
hljs.registerLanguage('md', markdownLanguage);
hljs.registerLanguage('php', php);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

function stringifyMetaValue(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(String).join(' · ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function toBooleanMetaValue(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return !/^(false|0|no|off)$/i.test(String(value).trim());
}

function toNumberMetaValue(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function parseFrontMatter(markdownSource: string): { body: string; meta: DocumentMeta } {
  markdownSource = markdownSource.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!markdownSource.startsWith('---')) {
    return { body: markdownSource, meta: {} };
  }

  const match = markdownSource.match(/^---\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/);
  if (!match) {
    return { body: markdownSource, meta: {} };
  }

  let parsed: Record<string, unknown> = {};

  try {
    const yaml = parseYaml(match[1]);
    if (!yaml || typeof yaml !== 'object' || Array.isArray(yaml)) {
      return { body: markdownSource, meta: {} };
    }
    parsed = yaml;
  } catch (error) {
    console.warn('Front matter parse failed', error);
    return { body: markdownSource, meta: {} };
  }

  const meta: DocumentMeta = {
    cover: toBooleanMetaValue(parsed.cover),
    theme: ['classic', 'book', 'compact'].includes(String(parsed.theme)) ? parsed.theme as DocumentMeta['theme'] : undefined,
    footnotes: ['end', 'near-reference'].includes(String(parsed.footnotes)) ? parsed.footnotes as DocumentMeta['footnotes'] : undefined,
    softBreaks: ['newline', 'space'].includes(String(parsed.softBreaks)) ? parsed.softBreaks as DocumentMeta['softBreaks'] : undefined,
    paper: ['A4', 'A5', 'Letter'].includes(String(parsed.paper)) ? parsed.paper as DocumentMeta['paper'] : undefined,
    orientation: ['portrait', 'landscape'].includes(String(parsed.orientation)) ? parsed.orientation as DocumentMeta['orientation'] : undefined,
    fontFamily: ['sans', 'serif', 'mono'].includes(String(parsed.fontFamily)) ? parsed.fontFamily as DocumentMeta['fontFamily'] : undefined,
    fontSize: toNumberMetaValue(parsed.fontSize) === undefined ? undefined : Math.min(24, Math.max(10, Number(parsed.fontSize))),
    lineHeight: toNumberMetaValue(parsed.lineHeight) === undefined ? undefined : Math.min(2.4, Math.max(1.2, Number(parsed.lineHeight))),
    title: stringifyMetaValue(parsed.title),
    author: stringifyMetaValue(parsed.author),
    date: stringifyMetaValue(parsed.date),
    header: stringifyMetaValue(parsed.header),
    footer: stringifyMetaValue(parsed.footer),
    margin: normalizeMargin(parsed.margin),
    pageNumbers: toBooleanMetaValue(parsed.pageNumbers),
    tocPageNumbers: toBooleanMetaValue(parsed.tocPageNumbers),
    chapterNewPage: toBooleanMetaValue(parsed.chapterNewPage),
    chapterLevel: toNumberMetaValue(parsed.chapterLevel) === undefined ? undefined : Math.min(6, Math.max(1, Math.trunc(Number(parsed.chapterLevel)))),
  };

  return {
    body: markdownSource.slice(match[0].length),
    meta,
  };
}

function normalizeMargin(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const parts = value.trim().split(/\s+/);
  if (parts.length < 1 || parts.length > 4) return undefined;
  const units: Record<string, number> = { mm: 1, cm: 10, in: 25.4, px: 25.4 / 96 };
  if (!parts.every((part) => {
    const match = part.match(/^(\d+(?:\.\d+)?)(mm|cm|in|px)$/);
    if (!match) return false;
    const mm = Number(match[1]) * units[match[2]];
    return mm >= 8 && mm <= 50;
  })) return undefined;
  return parts.join(' ');
}

export function humanizeContainerType(type: string) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function headingText(children: { type: string; content: string }[]) {
  return children.filter((child) =>
    ['text', 'code_inline', 'image', 'emoji', 'math_inline'].includes(child.type),
  ).map((child) => child.content).join('').trim();
}

function createMarkdown(softBreaks: 'newline' | 'space', renderMath?: (source: string) => string) {
  const instance = new MarkdownIt({
    html: true,
    linkify: false,
    breaks: softBreaks === 'newline',
    typographer: false,
    highlight(code, language): string {
      const normalizedLanguage = language?.trim().toLowerCase();

      if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
        return hljs.highlight(code, {
          language: normalizedLanguage,
          ignoreIllegals: true,
        }).value;
      }

      return escapeHtml(code);
    },
  })
    .use(gfmAutolinks)
    .use(markdownItAttrs, { allowedAttributes: ['id', 'class', 'width', 'height'] })
    .use(markdownItAbbr)
    .use(markdownItDeflist)
    .use(markdownItEmoji)
    .use(markdownItIns)
    .use(markdownItMark)
    .use(markdownItSub)
    .use(markdownItSup)
    .use(markdownItContainer, 'note')
    .use(markdownItContainer, 'tip')
    .use(markdownItContainer, 'info')
    .use(markdownItContainer, 'warning')
    .use(markdownItContainer, 'danger')
    .use(markdownItContainer, 'success')
    .use(markdownItTaskLists, {
      enabled: false,
      label: false,
    })
    .use(markdownItAnchor, {
      slugify,
      uniqueSlugStartIndex: 1,
      permalink: markdownItAnchor.permalink.linkInsideHeader({
        class: 'header-anchor',
        symbol: '#',
        placement: 'after',
        ariaHidden: true,
      }),
    })
    .use(markdownItTocDoneRight, {
      slugify,
      listType: 'ul',
      level: [1, 2, 3, 4, 5, 6],
    })
    .use(markdownItFootnote);
  instance.core.ruler.before('anchor', 'unique_heading_ids', (state) => {
    const used = new Set<string>();
    const reserved = new Set(state.tokens.filter((token) => token.type === 'heading_open')
      .map((token) => token.attrGet('id')).filter((id): id is string => id !== null));
    state.tokens.forEach((token, index) => {
      if (token.type !== 'heading_open') return;
      const explicit = token.attrGet('id');
      const base = explicit ?? slugify(headingText(state.tokens[index + 1].children ?? []));
      let id = base;
      let suffix = 1;
      while (used.has(id) || (explicit === null && reserved.has(id))) id = `${base}-${suffix++}`;
      used.add(id);
      token.attrSet('id', id);
    });
  });
  // Use the anchor plugin's actual IDs, including explicit IDs and duplicate headings.
  instance.core.ruler.push('collect_heading_ids', (state) => {
    state.env.headings = state.tokens.flatMap((token, index) => {
      if (token.type !== 'heading_open') return [];
      const inline = state.tokens[index + 1];
      const title = headingText(inline.children ?? []);
      return [{ level: Number(token.tag.slice(1)), title, id: token.attrGet('id') ?? '' }];
    });
  });
  instance.renderer.rules.tocBody = (_tokens, _index, _options, env) => {
    type Heading = { level: number; title: string; id: string; children: Heading[] };
    const root: Heading = { level: 0, title: '', id: '', children: [] };
    const stack = [root];
    for (const heading of env.headings ?? []) {
      while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) stack.pop();
      const item: Heading = { ...heading, children: [] };
      stack[stack.length - 1].children.push(item);
      stack.push(item);
    }
    const render = (items: Heading[]): string => items.length === 0 ? '' :
      `<ul>${items.map((item) => `<li><a href="#${encodeURIComponent(item.id)}">${escapeHtml(item.title)}</a>${render(item.children)}</li>`).join('')}</ul>`;
    return render(root.children);
  };
  instance.block.ruler.before('html_block', 'page_break', (state, start, _end, silent) => {
    if (state.sCount[start] - state.blkIndent >= 4) return false;
    const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
    if (!/^(?:<!--\s*pagebreak\s*-->|\[pagebreak\]|\{pagebreak\}|\f)\s*$/i.test(line)) return false;
    if (silent) return true;
    const token = state.push('page_break', 'div', 0);
    token.block = true;
    token.map = [start, start + 1];
    state.line = start + 1;
    return true;
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  instance.renderer.rules.page_break = () => '<div class="page-break"></div>\n';
  for (const type of CONTAINER_TYPES) {
    const marker = `container_${type}`;
    instance.renderer.rules[`${marker}_open`] = (tokens, index) => {
      const title = tokens[index].info.trim().slice(type.length).trim() || humanizeContainerType(type);
      return `<section class="md-container md-container-${type}"><strong>${escapeHtml(
        title,
      )}</strong>\n`;
    };
    instance.renderer.rules[`${marker}_close`] = () => '</section>\n';
  }
  const defaultFenceRule = instance.renderer.rules.fence;

  instance.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const language = token.info.trim().split(/\s+/)[0]?.toLowerCase();

    if (language === 'mermaid') {
      return `<div class="mermaid-diagram" data-mermaid="${encodeURIComponent(
        token.content,
      )}"></div>`;
    }
    if (language === 'math' && renderMath) {
      return `<div class="math-block">${renderMath(token.content)}</div>`;
    }

    return defaultFenceRule
      ? defaultFenceRule(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };

  return instance;
}

export function containsMathSyntax(markdownSource: string) {
  return /\$|\\\(|\\\[|(?:`{3,}|~{3,})\s*math\b/.test(markdownSource);
}

async function getMarkdown(markdownSource: string, softBreaks: 'newline' | 'space') {
  if (!containsMathSyntax(markdownSource)) {
    if (!baseMarkdown.has(softBreaks)) baseMarkdown.set(softBreaks, createMarkdown(softBreaks));
    return baseMarkdown.get(softBreaks)!;
  }
  if (!mathMarkdownPromises.has(softBreaks)) mathMarkdownPromises.set(softBreaks, Promise.all([
    import('markdown-it-texmath'), import('katex'),
  ]).then(([texmathModule, katexModule]) => {
    const render = (source: string, options: Record<string, unknown> = {}) => {
      try { return katexModule.default.renderToString(source, { ...options, trust: false, strict: 'ignore', throwOnError: true }); }
      catch (error) { return `<span class="katex-error" title="${escapeHtml(error instanceof Error ? error.message : String(error))}">${escapeHtml(source)}</span>`; }
    };
    return createMarkdown(softBreaks, (source) => render(source, { displayMode: true })).use(texmathModule.default, {
      engine: { renderToString: render },
      delimiters: ['dollars', 'brackets', 'gitlab'],
      katexOptions: { trust: false, strict: 'ignore', throwOnError: false },
    });
  }));
  return mathMarkdownPromises.get(softBreaks)!;
}
export async function parseMarkdownSyntax(
  markdownSource: string,
  markdownPath: string | undefined,
  assets: AssetUrls,
  preferences: DocumentMeta = {},
) : Promise<RenderedDocument> {
  const { body, meta } = parseFrontMatter(markdownSource);
  const renderer = await getMarkdown(body, meta.softBreaks ?? preferences.softBreaks ?? 'newline');
  const html = renderer.render(body, { path: markdownPath, assets });

  return { html, meta };
}
