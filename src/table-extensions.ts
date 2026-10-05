import type MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import type { RuleBlock } from 'markdown-it/lib/parser_block.mjs';
import type Ruler from 'markdown-it/lib/ruler.mjs';
import multimdTable from 'markdown-it-multimd-table';

type Row = { cells: string[]; continuation: boolean };
type Caption = { text: string; id?: string };
const MAX_MULTILINE_PADDING = 4_000_000;

function registeredRule<T>(ruler: Ruler<T>, name: string): T | undefined {
  // Ruler exposes no public getter by registration name. Its rule metadata
  // retains string names in production; Function.name does not survive Vite
  // minification. Keep this pinned markdown-it internal access in one place.
  const rules = (ruler as Ruler<T> & { __rules__: { name: string; enabled: boolean; fn: T }[] }).__rules__;
  return rules.find(rule => rule.name === name && rule.enabled)?.fn;
}

function caption(line: string): Caption | undefined {
  const match = /^\[(.+?)\](?:\[([^\[\]]*)\]|\s*\{#([^{}]*)\})?\s*$/.exec(line.trim());
  if (!match) return undefined;
  const id = (match[2] ?? match[3])?.trim();
  const safe = id && /^[\p{L}_][\p{L}\p{N}_.:-]{0,127}$/u.test(id) && !/^(?:__proto__|constructor|prototype)$/i.test(id);
  return { text: match[1], id: safe ? id : undefined };
}

function backslashesBefore(text: string, index: number): number {
  let count = 0;
  while (index > 0 && text[--index] === '\\') count++;
  return count;
}

function codeEnds(text: string): Map<number, number> {
  const runs: { start: number; length: number }[] = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '`') continue;
    let length = 1;
    while (text[index + length] === '`') length++;
    runs.push({ start: index, length }); index += length - 1;
  }
  const next = new Map<number, number>();
  const ends = new Map<number, number>();
  for (let index = runs.length - 1; index >= 0; index--) {
    const run = runs[index];
    const end = next.get(run.length);
    if (end !== undefined) ends.set(run.start, end + run.length);
    next.set(run.length, run.start);
  }
  return ends;
}

// A delimiter inside a matched code span is literal, and an unmatched backtick
// must not hide subsequent columns. Backslash parity also matters for pipes.
function splitRow(raw: string): Row | undefined {
  if (!raw.includes('|')) return undefined;
  let text = raw.trim();
  const slashes = backslashesBefore(text, text.length);
  const continuation = slashes % 2 === 1;
  if (continuation) text = text.slice(0, -1).trimEnd();
  const ticks = codeEnds(text);
  const pipes: number[] = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '`' && backslashesBefore(text, index) % 2 === 0) {
      let count = 1;
      while (text[index + count] === '`') count++;
      const end = ticks.get(index);
      if (end !== undefined) { index = end - 1; continue; }
      index += count - 1;
    } else if (text[index] === '|' && backslashesBefore(text, index) % 2 === 0) pipes.push(index);
  }
  if (!pipes.length) return undefined;
  const cells: string[] = [];
  let start = 0;
  for (const end of pipes) { cells.push(text.slice(start, end)); start = end + 1; }
  cells.push(text.slice(start));
  if (pipes[0] === 0) cells.shift();
  if (pipes[pipes.length - 1] === text.length - 1) cells.pop();
  return { cells, continuation };
}

function extension(row: Row): boolean {
  return row.continuation || row.cells.some((cell, index) => (index > 0 && cell === '') || cell.trim() === '^^');
}

function line(state: StateBlock, index: number): string {
  return state.src.slice(state.bMarks[index] + state.tShift[index], state.eMarks[index]);
}

function protectCell(text: string, marker: string): string {
  let result = '';
  const ticks = codeEnds(text);
  for (let index = 0; index < text.length;) {
    if (text[index] === '`' && backslashesBefore(text, index) % 2 === 0) {
      let count = 1;
      while (text[index + count] === '`') count++;
      const end = ticks.get(index);
      if (end !== undefined) {
        // Preserve GFM's conventional \| in code, and protect all code pipes
        // against the upstream plugin's incomplete multiple-backtick scanner.
        result += text.slice(index, end).replace(/\\\|/g, '|').split('|').join(marker);
        index = end;
        continue;
      }
      if (count === 1) { result += '\\`'; index++; continue; }
    }
    if (text[index] === '\\') {
      let count = 1;
      while (text[index + count] === '\\') count++;
      result += '&#92;'.repeat(Math.floor(count / 2)) + (count % 2 ? '\\' : '');
      index += count;
    } else result += text[index++];
  }
  return result;
}

function canonicalRow(row: Row, width: number, marker: string): string {
  const cells = row.cells.slice(0, width);
  while (cells.length < width) cells.push(' ');
  if (cells[0] === '') cells[0] = ' '; // no predecessor exists for a first-cell colspan
  return `|${cells.map(cell => protectCell(cell, marker)).join('|')}|${row.continuation ? '\\' : ''}`;
}

function normalizeRowspans(rows: Row[], width: number): void {
  type Anchor = { start: number; width: number };
  let previous: (Anchor | undefined)[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const current: (Anchor | undefined)[] = [];
    for (let index = 0; index < Math.min(row.cells.length, width);) {
      const anchor = previous[index];
      if (row.cells[index].trim() === '^^' && anchor && anchor.start === index) {
        const end = index + anchor.width;
        if (end <= width && row.cells.slice(index, end).length === anchor.width
          && row.cells.slice(index + 1, end).every(cell => cell === '' || cell.trim() === '^^')) {
          for (let column = index; column < end; column++) { current[column] = anchor; if (column > index) row.cells[column] = ''; }
          index = end;
          continue;
        }
        // A partial merge into a wider cell would overlap real content.
        row.cells[index] = row.cells[index].replace('^^', '\\^\\^');
      } else if (row.cells[index].trim() === '^^' && anchor && anchor.start !== index) row.cells[index] = row.cells[index].replace('^^', '\\^\\^');
      let end = index + 1;
      while (end < Math.min(row.cells.length, width) && row.cells[end] === '') end++;
      const next = { start: index, width: end - index };
      for (let column = index; column < end; column++) current[column] = next;
      index = end;
    }
    previous = current;
    // Physical continuation lines belong to the same row and must not replace
    // the anchor map with text from the continuation's individual cells.
    while (rows[rowIndex]?.continuation && rowIndex + 1 < rows.length) rowIndex++;
  }
}

function guardedTable(ordinary: RuleBlock, extended: RuleBlock): RuleBlock {
  return (state, start, end, silent) => {
    if (start + 2 > end || state.sCount[start] - state.blkIndent >= 4) return ordinary(state, start, end, silent);
    const firstCaption = caption(line(state, start));
    const headerLine = start + (firstCaption ? 1 : 0);
    if (headerLine + 1 >= end) return ordinary(state, start, end, silent);
    const header = splitRow(line(state, headerLine));
    const separator = splitRow(line(state, headerLine + 1));
    if (!header || !separator || header.continuation || !header.cells.length || header.cells.length !== separator.cells.length
      || !separator.cells.every(cell => /^:?-+:?$/.test(cell.trim())) || header.cells.length > 256) return ordinary(state, start, end, silent);
    const width = header.cells.length;
    const rows: Row[] = [];
    let next = headerLine + 2;
    let lastCaption: Caption | undefined;
    let usesExtension = !!firstCaption || extension(header);
    let multilineStart: number | undefined;
    let multilinePadding = 0;
    const terminators = state.md.block.ruler.getRules('blockquote');
    for (; next < end; next++) {
      if (state.sCount[next] < state.blkIndent || state.sCount[next] - state.blkIndent >= 4 || state.isEmpty(next)) break;
      lastCaption = caption(line(state, next));
      if (lastCaption) { next++; usesExtension = true; break; }
      if (terminators.some(rule => rule(state, next, end, true))) break;
      const row = splitRow(line(state, next));
      if (!row) break;
      rows.push(row);
      usesExtension ||= extension(row);
      if (rows.length * width > 65536) return ordinary(state, start, end, silent);
      if (multilineStart === undefined && row.continuation) multilineStart = next - start;
      else if (multilineStart !== undefined && !row.continuation) {
        // Upstream pads each multiline cell with all preceding table lines.
        // Repeated multiline rows can otherwise allocate quadratically even
        // well below the cell limit. Bound that cumulative padding work.
        multilinePadding += multilineStart * width;
        if (multilinePadding > MAX_MULTILINE_PADDING) return ordinary(state, start, end, silent);
        multilineStart = undefined;
      }
    }
    if (!usesExtension) return ordinary(state, start, end, silent);
    normalizeRowspans(rows, width);
    // An isolated block state lets us repair upstream scanner edge cases while
    // leaving source offsets, nested list/container state and ordinary tables
    // untouched. Source line counts remain identical to the original document.
    let marker = '\uE000table-pipe\uE001';
    const source = state.src.slice(state.bMarks[start], state.eMarks[next - 1]);
    while (source.includes(marker)) marker += '\uE001';
    const content = [
      ...(firstCaption ? [`[${firstCaption.text}]`] : []),
      canonicalRow(header, width, marker), canonicalRow(separator, width, marker),
      ...rows.map(row => canonicalRow(row, width, marker)),
      ...(lastCaption ? [`[${lastCaption.text}]`] : []),
    ].join('\n');
    const work = new state.md.block.State(content, state.md, state.env, []);
    work.level = state.level;
    const accepted = extended(work, 0, work.lineMax, silent);
    if (!accepted) return ordinary(state, start, end, silent);
    if (silent) return true;
    const mapped = new Set<NonNullable<(typeof work.tokens)[number]['map']>>();
    for (const token of work.tokens) {
      if (token.map && !mapped.has(token.map)) { mapped.add(token.map); token.map[0] += start; token.map[1] += start; }
      token.content = token.content.split(marker).join('|');
      if (token.type === 'table_open') token.meta = { ...token.meta, md2pdfExtendedTable: true };
      if (token.type === 'caption_open') {
        token.attrs = (token.attrs || []).filter(([name]) => name !== 'id' && name !== 'style');
        const chosen = firstCaption ?? lastCaption;
        if (chosen?.id) token.attrSet('id', chosen.id);
      }
    }
    state.tokens.push(...work.tokens);
    state.line = start + work.line;
    return true;
  };
}

/** Opt-in document table extensions; unchanged rows retain the native GFM rule. */
export function tableExtensions(md: MarkdownIt): void {
  const ordinary = registeredRule(md.block.ruler, 'table');
  if (!ordinary) return;
  md.use(multimdTable, { multiline: true, rowspan: true, headerless: false, multibody: false, autolabel: false });
  const extended = registeredRule(md.block.ruler, 'table');
  if (!extended) throw new Error('Extended table rule was not registered');
  md.block.ruler.at('table', guardedTable(ordinary, extended), { alt: ['paragraph', 'reference'] });
  const attributes = registeredRule(md.core.ruler, 'curly_attributes');
  if (attributes) md.core.ruler.at('curly_attributes', state => {
    // markdown-it-attrs calculates spans by hiding native placeholder cells.
    // MultiMarkdown has already removed those cells; calculating twice loses
    // content. Skip just that attrs pattern for our completed table bodies,
    // while retaining inline classes and every ordinary-table attrs behavior.
    const tables: boolean[] = [];
    const closes: typeof state.tokens = [];
    for (const token of state.tokens) {
      if (token.type === 'table_open') tables.push(!!token.meta?.md2pdfExtendedTable);
      else if (token.type === 'table_close') tables.pop();
      else if (token.type === 'tbody_close' && tables[tables.length - 1] && !token.hidden) { token.hidden = true; closes.push(token); }
    }
    try { attributes(state); }
    finally { for (const token of closes) token.hidden = false; }
  });
  const process = md.core.process;
  md.core.process = function (state) {
    process.call(this, state);
    // Heading/attribute plugins may be registered after this adapter. Resolve
    // collisions only once their final IDs exist, without changing headings
    // or their permalinks and TOC entries.
    const used = new Set(state.tokens.filter(token => token.type !== 'caption_open').map(token => token.attrGet('id')).filter(Boolean));
    const nextSuffix = new Map<string, number>();
    for (const token of state.tokens) {
      if (token.type !== 'caption_open') continue;
      const original = token.attrGet('id');
      if (!original) continue;
      let id = original;
      if (used.has(id)) {
        let suffix = nextSuffix.get(original) ?? 2;
        do { id = `${original}-${suffix++}`; } while (used.has(id));
        nextSuffix.set(original, suffix);
      }
      token.attrSet('id', id); used.add(id);
    }
  };
}
