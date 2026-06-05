declare module 'markdown-it-abbr' {
  import type MarkdownIt from 'markdown-it';

  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module 'markdown-it-container' {
  import type MarkdownIt from 'markdown-it';

  const plugin: MarkdownIt.PluginWithOptions<string>;
  export default plugin;
}

declare module 'markdown-it-deflist' {
  import type MarkdownIt from 'markdown-it';

  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module 'markdown-it-emoji' {
  import type MarkdownIt from 'markdown-it';

  export const bare: MarkdownIt.PluginSimple;
  export const light: MarkdownIt.PluginSimple;
  export const full: MarkdownIt.PluginSimple;
}

declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it';

  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module 'markdown-it-ins' {
  import type MarkdownIt from 'markdown-it';

  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module 'markdown-it-mark' {
  import type MarkdownIt from 'markdown-it';

  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module 'markdown-it-sub' {
  import type MarkdownIt from 'markdown-it';

  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module 'markdown-it-sup' {
  import type MarkdownIt from 'markdown-it';

  const plugin: MarkdownIt.PluginSimple;
  export default plugin;
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';

  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }

  const plugin: MarkdownIt.PluginWithOptions<TaskListsOptions>;
  export default plugin;
}

declare module 'markdown-it-texmath' {
  import type MarkdownIt from 'markdown-it';

  interface TexmathOptions {
    engine: unknown;
    delimiters?: 'dollars' | 'brackets' | 'gitlab' | 'julia' | 'kramdown';
  }

  const plugin: MarkdownIt.PluginWithOptions<TexmathOptions>;
  export default plugin;
}
