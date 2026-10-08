import { Document, isMap, isNode, isScalar, parseDocument, visit } from 'yaml';

export type DocumentPropertyValues = { title: string; author: string; subject: string; keywords: string };
const keys = ['title', 'author', 'subject', 'keywords'] as const;
const emptyValues = (): DocumentPropertyValues => ({ title: '', author: '', subject: '', keywords: '' });

function propertyText(value: unknown, keyword = false): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(String).join(keyword ? '\n' : ' · ');
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function frontMatter(source: string) {
  const bom = source.startsWith('\uFEFF') ? '\uFEFF' : '';
  const content = source.slice(bom.length);
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  if (!/^---(?:\r?\n|$)/.test(content)) return { bom, newline, body: content, document: new Document({}), existed: false };
  const match = content.match(/^(---\r?\n)([\s\S]*?)^(---|\.\.\.)[ \t]*(\r?\n|$)/m);
  if (!match) throw new Error('YAML 文档属性缺少结束分隔符，请先在源代码中修正。');
  const document = parseDocument(match[2]);
  if (document.errors.length) throw new Error('YAML 文档属性格式无效，请先在源代码中修正。');
  if (document.contents !== null && !isMap(document.contents)) throw new Error('YAML 文档属性必须使用键值设置，请先在源代码中修正。');
  return { bom, newline, body: content.slice(match[0].length), document, existed: true, opening: match[1], closing: `${match[3]}${match[4]}` };
}

function valuesFromDocument(document: Document): DocumentPropertyValues {
  const values = emptyValues();
  const parsed = (document.toJS() ?? {}) as Record<string, unknown>;
  for (const key of keys) values[key] = propertyText(parsed[key], key === 'keywords');
  return values;
}

export function readDocumentProperties(source: string): { values: DocumentPropertyValues; error?: string } {
  try { return { values: valuesFromDocument(frontMatter(source).document) }; }
  catch (error) { return { values: emptyValues(), error: error instanceof Error ? error.message : String(error) }; }
}

export function updateDocumentProperties(source: string, values: DocumentPropertyValues): string {
  const matter = frontMatter(source);
  const previous = valuesFromDocument(matter.document);
  if (keys.every(key => previous[key] === values[key])) return source;
  // A property may define an anchor also used by unrelated layout settings.
  // Preserve those existing values before changing or removing the definition.
  const changingAnchors = new Set<string>();
  const collectAnchors = (node: unknown) => {
    if (isNode(node)) visit(node, { Node: (_key, child) => {
      if ('anchor' in child && typeof child.anchor === 'string') changingAnchors.add(child.anchor);
    } });
  };
  for (const key of keys) {
    if (previous[key] === values[key]) continue;
    collectAnchors(matter.document.get(key, true));
    // Clearing a property removes its whole pair, including an anchored key.
    // Aliases may refer to that key's text from unrelated layout settings.
    if (!values[key].trim() && isMap(matter.document.contents)) {
      const pair = matter.document.contents.items.find(item => isScalar(item.key) && item.key.value === key);
      collectAnchors(pair?.key);
    }
  }
  if (changingAnchors.size) visit(matter.document, { Alias: (_key, alias) => {
    if (!changingAnchors.has(alias.source)) return;
    const replacement = matter.document.createNode(alias.toJS(matter.document));
    replacement.comment = alias.comment; replacement.commentBefore = alias.commentBefore;
    replacement.spaceBefore = alias.spaceBefore;
    return replacement;
  } });
  for (const key of keys) {
    if (previous[key] === values[key]) continue;
    if (!values[key].trim()) { matter.document.delete(key); continue; }
    const value = key === 'keywords' && /\r?\n/.test(values[key])
      ? values[key].split(/\r?\n/).map(item => item.trim()).filter(Boolean) : values[key];
    const existing = matter.document.get(key, true);
    if (isScalar(existing) && typeof value === 'string') existing.value = value;
    else {
      const replacement = matter.document.createNode(value);
      if (isNode(existing)) {
        replacement.comment = existing.comment; replacement.commentBefore = existing.commentBefore;
        replacement.spaceBefore = existing.spaceBefore;
      }
      matter.document.set(key, replacement);
    }
  }
  const yaml = matter.document.toString({ lineWidth: 0 }).replace(/\n/g, matter.newline);
  const opening = matter.opening ?? `---${matter.newline}`;
  const closing = matter.closing ?? `---${matter.newline}`;
  return `${matter.bom}${opening}${yaml}${closing}${matter.body}`;
}
