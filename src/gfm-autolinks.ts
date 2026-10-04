import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

// GFM 0.29 §6.9: domain validation, terminal punctuation and literal emails.
function trimPath(value: string) {
  let previous: string;
  do {
    previous = value;
    value = value.replace(/[?!.,:*_~]+$/, '').replace(/&[a-z\d]+;$/i, '');
    if (value.endsWith(')')) {
      let excess = (value.match(/\)/g) || []).length - (value.match(/\(/g) || []).length;
      while (excess-- > 0 && value.endsWith(')')) value = value.slice(0, -1);
    }
  } while (value !== previous);
  return value;
}
function validDomain(value: string) {
  const domain = value.replace(/^(?:https?:\/\/|ftp:\/\/)/i, '').split(/[/?#:]/)[0];
  const segments = domain.split('.');
  return segments.length >= 2 && segments.every((segment) => /^[a-z\d_-]+$/i.test(segment))
    && segments.slice(-2).every((segment) => !segment.includes('_'));
}

export function gfmAutolinks(md: MarkdownIt) {
  md.core.ruler.after('inline', 'gfm_autolink_literals', (state) => {
    for (const block of state.tokens) {
      if (block.type !== 'inline' || !block.children) continue;
      const output: Token[] = [];
      let linkDepth = 0;
      for (const token of block.children) {
        if (token.type === 'link_open' || (token.type === 'html_inline' && /^<a(?:\s|>)/i.test(token.content))) linkDepth++;
        if (token.type === 'link_close' || (token.type === 'html_inline' && /^<\/a\s*>/i.test(token.content))) linkDepth = Math.max(0, linkDepth - 1);
        if (token.type !== 'text' || linkDepth) { output.push(token); continue; }
        const pattern = /(?:https?:\/\/|ftp:\/\/|www\.)[^\s<]+|(?<![a-z\d._+-])[a-z\d._+-]+@[a-z\d_-]+(?:\.[a-z\d_-]+)+\.?/gi;
        let cursor = 0;
        for (const match of token.content.matchAll(pattern)) {
          const start = match.index!;
          const email = !/^(?:https?:\/\/|ftp:\/\/|www\.)/i.test(match[0]);
          const label = email ? match[0].replace(/\.+$/, '') : trimPath(match[0]);
          if (email ? /[-_]$/.test(label) : (start > 0 && !/[\s*_~(]/.test(token.content[start - 1])) || !validDomain(label)) continue;
          const href = md.normalizeLink(email ? `mailto:${label}` : /^www\./i.test(label) ? `http://${label}` : label);
          if (!md.validateLink(href)) continue;
          if (cursor < start) { const text = new state.Token('text', '', 0); text.content = token.content.slice(cursor, start); output.push(text); }
          const open = new state.Token('link_open', 'a', 1); open.attrs = [['href', href]]; open.markup = 'autolink'; open.info = 'auto';
          const text = new state.Token('text', '', 0); text.content = label;
          const close = new state.Token('link_close', 'a', -1);
          output.push(open, text, close); cursor = start + label.length;
        }
        if (cursor < token.content.length) { const text = new state.Token('text', '', 0); text.content = token.content.slice(cursor); output.push(text); }
      }
      block.children = output;
    }
  });
}
