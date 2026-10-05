import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';

type MathOptions = { render: (source: string, display: boolean) => string };
type MathBlock = { source: string; end: number; number?: string; trailing?: string };
const ENVIRONMENT = /^\\begin\{(equation\*?|align\*?|alignat\*?|gather\*?|CD)\}/;
const lastClosers = new WeakMap<StateBlock, Map<string, number>>();
const emptyRanges = new WeakMap<StateBlock, Map<string, { from: number; to: number }>>();

function hasLaterCloser(state: StateBlock, marker: string, position: number) {
  let cached = lastClosers.get(state);
  if (!cached) { cached = new Map(); lastClosers.set(state, cached); }
  let last = cached.get(marker);
  if (last === undefined) { last = state.src.lastIndexOf(marker); cached.set(marker, last); }
  return last >= position;
}

function lineText(state: StateBlock, line: number) {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}

function isEscaped(source: string, index: number) {
  let backslashes = 0;
  while (index > 0 && source[--index] === '\\') backslashes++;
  return backslashes % 2 === 1;
}

function withoutComment(source: string) {
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '%' && !isEscaped(source, index)) return source.slice(0, index);
  }
  return source;
}

function endingSuffix(source: string) {
  const numbered = /^[ \t]*\(([^()\r\n]+)\)/.exec(source);
  return numbered
    ? { number: numbered[1], trailing: source.slice(numbered[0].length).trim() }
    : { number: undefined, trailing: source.trim() };
}

function crossesBlock(state: StateBlock, line: number) {
  const source = withoutComment(lineText(state, line));
  if (!source.trim()) return false;
  // Negative indentation marks a lazy quote continuation. A math block must
  // never borrow its closer from outside that quote or its current list item.
  if (state.sCount[line] < state.blkIndent) return true;
  return /^(?:`{3,}|~{3,}|:{3,}(?:\s|$)|#{1,6}(?:\s|$)|>|(?:[-+*]|\d+[.)])[ \t]|-{3,}[ \t]*$|<\/?[a-z]|<!--|<\?|<!)/i.test(source);
}

function delimitedBlock(state: StateBlock, start: number, end: number, opening: '$$' | '\\['): MathBlock | undefined {
  const closing = opening === '$$' ? '$$' : '\\]';
  // Silent paragraph checks visit every line. Remember a scoped range with no
  // usable closer so repeated escaped brackets before one boundary stay linear.
  const key = `${opening}:${end}:${state.lineMax}:${state.blkIndent}:${state.parentType}`;
  let cached = emptyRanges.get(state);
  if (!cached) { cached = new Map(); emptyRanges.set(state, cached); }
  const empty = cached.get(key);
  if (empty && start >= empty.from && start < empty.to) return undefined;
  const rememberEmpty = (to: number) => { cached!.set(key, { from: start, to }); };
  const parts: string[] = [];
  for (let line = start; line < end; line++) {
    if (line !== start && crossesBlock(state, line)) { rememberEmpty(line); return undefined; }
    const source = lineText(state, line).slice(line === start ? opening.length : 0);
    const active = withoutComment(source);
    let offset = active.indexOf(closing);
    while (offset >= 0 && isEscaped(active, offset)) offset = active.indexOf(closing, offset + closing.length);
    if (offset >= 0) {
      const suffix = endingSuffix(active.slice(offset + closing.length));
      parts.push(source.slice(0, offset));
      const formula = parts.join('\n');
      return formula.trim() ? { source: formula, end: line + 1, ...suffix } : undefined;
    }
    parts.push(source);
  }
  rememberEmpty(end);
  return undefined;
}

function environmentBlock(state: StateBlock, start: number, end: number): MathBlock | undefined {
  const stack: string[] = [];
  const parts: string[] = [];
  for (let line = start; line < end; line++) {
    if (line !== start && crossesBlock(state, line)) return undefined;
    const source = lineText(state, line);
    const active = withoutComment(source);
    for (const command of active.matchAll(/\\(begin|end)\{([a-z]+\*?)\}/gi)) {
      if (isEscaped(active, command.index!)) continue;
      if (command[1] === 'begin') stack.push(command[2]);
      else {
        if (stack.pop() !== command[2]) return undefined;
        if (stack.length === 0) {
          const closingEnd = command.index! + command[0].length;
          const suffix = endingSuffix(active.slice(closingEnd));
          parts.push(source.slice(0, closingEnd));
          return { source: parts.join('\n'), end: line + 1, ...suffix };
        }
      }
    }
    parts.push(source);
  }
  return undefined;
}

function appendParagraph(state: StateBlock, content: string, map: [number, number]) {
  const paragraph = state.push('paragraph_open', 'p', 1);
  paragraph.map = map;
  const inline = state.push('inline', '', 0);
  inline.content = content;
  inline.map = map;
  inline.children = [];
  state.push('paragraph_close', 'p', -1);
}

/** Install after texmath; use distinct tokens so its repeated math rule names remain intact. */
export function markdownMathExtensions(md: MarkdownIt, options: MathOptions): void {
  md.block.ruler.before('math_block_eqno', 'document_math_block', (state, start, end, silent) => {
    if (state.sCount[start] < state.blkIndent || state.sCount[start] - state.blkIndent >= 4) return false;
    const openingLine = lineText(state, start);
    const opening = openingLine.startsWith('$$') && !openingLine.startsWith('$$$') ? '$$'
      : openingLine.startsWith('\\[') ? '\\[' : undefined;
    const environment = ENVIRONMENT.test(openingLine);
    if (!opening && !environment) return false;
    const position = state.bMarks[start] + state.tShift[start] + (opening?.length ?? 0);
    const unsafeCloser = !!opening && hasLaterCloser(state, opening === '$$' ? '$$' : '\\]', position);
    if (opening && !unsafeCloser) return false;
    if (environment) {
      const matched = ENVIRONMENT.exec(openingLine)!;
      if (!hasLaterCloser(state, `\\end{${matched[1]}}`, position + matched[0].length)) return false;
    }
    const boundary = Math.min(end, state.lineMax);
    const block = opening ? delimitedBlock(state, start, boundary, opening) : environmentBlock(state, start, boundary);
    // An ordinary escaped Markdown bracket (e.g. \[label](/target)) is not a
    // display opener unless a closer exists. In that case paragraph parsing
    // must retain its original shape. Only claim an unmatched delimiter when
    // texmath's whole-source fallback could borrow a closer across a boundary.
    if (!block && !unsafeCloser) return false;
    if (silent) return true;
    // texmath scans the entire state.src rather than respecting nested block ranges.
    // Claim an unmatched opener as a one-line paragraph so its block fallback
    // cannot consume a closer from another quote/list/container or beyond code.
    // The normal core inline pass still handles escapes, links and formatting.
    if (!block) {
      state.line = start + 1;
      appendParagraph(state, openingLine, [start, state.line]);
      return true;
    }
    const token = state.push('document_math_block', 'section', 0);
    token.block = true;
    token.content = block.source;
    token.meta = { number: block.number };
    state.line = block.end;
    token.map = [start, state.line];
    if (block.trailing) {
      // Keep text after a completed formula as ordinary Markdown, with its own
      // source range; texmath's original block rules discard this same-line tail.
      appendParagraph(state, block.trailing, [block.end - 1, block.end]);
    }
    return true;
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.renderer.rules.document_math_block = (tokens, index) => {
    const token = tokens[index];
    const number = token.meta.number as string | undefined;
    return `<section class="math-block${number ? ' eqno' : ''}">${options.render(token.content, true)}${number ? `<span>(${md.utils.escapeHtml(number)})</span>` : ''}</section>\n`;
  };
}
