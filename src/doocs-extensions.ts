import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';

// Ruby notation and grouping follow Doocs MD's WTFPL-licensed example and extension:
// https://github.com/doocs/md/blob/a7c17fc4cda92e3c13aa7e24f06615cfa4219b31/packages/core/src/extensions/ruby.ts
// Use Unicode code points here so supplementary-plane characters stay intact.
function rubyGroups(text: string, reading: string): [string, string][] {
  if (!/[・．。-]/u.test(reading)) return [[text, reading]];
  const readings = reading.split(/[・．。-]/u).map(value => value.trim()).filter(Boolean);
  if (readings.length === 0) return [[text, reading]];
  const characters = Array.from(text);
  return readings.slice(0, characters.length).map((part, index) => [
    index === readings.length - 1 ? characters.slice(index).join('') : characters[index], part,
  ]);
}

function containerOpening(line: string) {
  const match = /^(:{3,})[ \t]*([^\s:]+)(?:[ \t]+(.*))?$/.exec(line);
  return match ? { markers: match[1].length, type: match[2], title: match[3]?.trim() } : undefined;
}

function lineText(state: StateBlock, line: number) {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}

export function doocsExtensions(md: MarkdownIt): void {
  md.inline.ruler.before('link', 'doocs_ruby', (state, silent) => {
    if (state.src[state.pos] !== '[' || state.src[state.pos - 1] === '!') return false;
    const match = /^\[([^\[\]\n]+)\](?:\{([^{}\n]+)\}|\^\(([^()\n]+)\))/.exec(state.src.slice(state.pos, state.posMax));
    if (!match) return false;
    const text = match[1].trim();
    const reading = (match[2] ?? match[3]).trim();
    // Preserve markdown-it-attrs notation rather than reinterpreting IDs/classes as readings.
    if (!text || !reading || (match[2] !== undefined && /(?:^|\s)[#.\w:-]+\s*=|^[#.]/u.test(reading))) return false;
    if (!silent) {
      const token = state.push('doocs_ruby', 'ruby', 0);
      token.content = text;
      token.meta = { reading };
    }
    state.pos += match[0].length;
    return true;
  });
  md.renderer.rules.doocs_ruby = (tokens, index) => rubyGroups(tokens[index].content, tokens[index].meta.reading)
    .map(([text, reading]) => `<ruby>${md.utils.escapeHtml(text)}<rp>(</rp><rt>${md.utils.escapeHtml(reading)}</rt><rp>)</rp></ruby>`).join('');

  md.inline.ruler.before('emphasis', 'doocs_wavy', (state, silent) => {
    const start = state.pos;
    if (state.src[start] !== '~' || state.src[start - 1] === '~' || state.src[start + 1] === '~') return false;
    let end = start + 1;
    while (end < state.posMax) {
      if (state.src[end] === '\\') end += 2;
      else if (state.src[end] === '~' || state.src[end] === '\n') break;
      else end++;
    }
    if (state.src[end] !== '~' || state.src[end + 1] === '~') return false;
    const content = state.src.slice(start + 1, end);
    // Single tildes conflict with chemical/mathematical subscript. Keep the existing
    // ASCII subscript semantics, and recognize only CJK word annotations as wavy text.
    if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(content)
      || !/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Punctuation}\s]+$/u.test(content)) return false;
    if (!silent) {
      const token = state.push('doocs_wavy', 'span', 0);
      token.content = content;
    }
    state.pos = end + 1;
    return true;
  });
  md.renderer.rules.doocs_wavy = (tokens, index) => `<span class="md-wavy">${md.utils.escapeHtml(tokens[index].content)}</span>`;

  md.block.ruler.before('fence', 'doocs_container', (state, start, end, silent) => {
    if (state.sCount[start] - state.blkIndent >= 4) return false;
    const opening = containerOpening(lineText(state, start));
    if (!opening) return false;
    if (silent) return true;
    const markers = [opening.markers];
    let closingLine = start + 1;
    let closed = false;
    let fence: { character: string; length: number } | undefined;
    for (; closingLine < end; closingLine++) {
      const line = lineText(state, closingLine);
      if (line.trim() && state.sCount[closingLine] < state.blkIndent) break;
      if (state.sCount[closingLine] - state.blkIndent >= 4) continue;
      if (fence) {
        const close = /^(`{3,}|~{3,})[ \t]*$/.exec(line);
        if (close && close[1][0] === fence.character && close[1].length >= fence.length) fence = undefined;
        continue;
      }
      const codeFence = /^(`{3,}|~{3,})(.*)$/.exec(line);
      if (codeFence && (codeFence[1][0] !== '`' || !codeFence[2].includes('`'))) {
        fence = { character: codeFence[1][0], length: codeFence[1].length };
        continue;
      }
      const nested = containerOpening(line);
      if (nested) { markers.push(nested.markers); continue; }
      const close = /^(:{3,})[ \t]*$/.exec(line);
      if (!close || close[1].length < markers[markers.length - 1]) continue;
      markers.pop();
      if (markers.length === 0) { closed = true; break; }
    }
    const token = state.push('doocs_container_open', 'section', 1);
    token.block = true;
    token.info = lineText(state, start);
    token.map = [start, closingLine + (closed ? 1 : 0)];
    const normalizedType = opening.type.toLowerCase();
    const classType = /^[a-z][a-z\d_-]*$/i.test(normalizedType) ? normalizedType : 'custom';
    token.attrSet('class', `md-container md-container-${classType}`);
    token.attrSet('data-container-type', opening.type);
    token.meta = { title: opening.title || (/^[a-z]/i.test(opening.type)
      ? opening.type.charAt(0).toUpperCase() + opening.type.slice(1) : opening.type) };
    const oldLineMax = state.lineMax;
    state.lineMax = closingLine;
    try { state.md.block.tokenize(state, start + 1, closingLine); }
    finally { state.lineMax = oldLineMax; }
    const ending = state.push('doocs_container_close', 'section', -1);
    ending.block = true;
    state.line = closingLine + (closed ? 1 : 0);
    return true;
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.renderer.rules.doocs_container_open = (tokens, index, _options, _env, self) =>
    `<section${self.renderAttrs(tokens[index])}><strong>${md.utils.escapeHtml(tokens[index].meta.title)}</strong>\n`;
  md.renderer.rules.doocs_container_close = () => '</section>\n';
}
