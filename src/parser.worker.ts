import { parseMarkdownSyntax } from './markdown-parser';
import type { ParseRequest } from './parser-client';
const scope = self as unknown as { onmessage: (event: MessageEvent<ParseRequest>) => void; postMessage: (data: unknown) => void };
scope.onmessage = ({ data }) => {
  void parseMarkdownSyntax(data.source, data.path, data.assets, data.preferences)
    .then((result) => scope.postMessage(result))
    .catch((error) => scope.postMessage({ error: error instanceof Error ? error.message : String(error) }));
};
