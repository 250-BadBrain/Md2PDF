import { afterEach, describe, expect, it, vi } from 'vitest';

const engine = vi.hoisted(() => ({
  options: {} as Record<string, any>,
  mode: 'success',
  destroyed: 0,
  fonts: [] as Record<string, any>[],
  loader: undefined as undefined | ((config: { data: string }) => Promise<SVGSymbolElement | null>),
}));

vi.mock('@antv/infographic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@antv/infographic')>();
  class Infographic {
    handlers = new Map<string, (...args: unknown[]) => void>();
    constructor(options: Record<string, unknown>) { engine.options = options; }
    on(name: string, callback: (...args: unknown[]) => void) { this.handlers.set(name, callback); }
    render() {
      if (engine.mode === 'error') this.handlers.get('error')?.(new Error('render failed'));
      else if (engine.mode !== 'timeout') queueMicrotask(() => this.handlers.get('loaded')?.());
    }
    async toDataURL() {
      if (engine.mode === 'export-timeout') return new Promise<string>(() => {});
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 360"><foreignObject x="10" y="10" width="300" height="50"><span xmlns="http://www.w3.org/1999/xhtml" style="font-size:24px;display:flex">客户增长引擎</span></foreignObject><script>alert(1)</script><image href="https://example.com/a.svg"/><path d="M0 0H24" onclick="bad()" fill="url(https://example.com/a.svg)"/></svg>');
    }
    destroy() { engine.destroyed++; this.handlers.clear(); }
  }
  return {
    ...actual,
    Infographic,
    registerFont: (font: Record<string, unknown>) => engine.fonts.push(font),
    registerResourceLoader: (loader: typeof engine.loader) => { engine.loader = loader; },
  };
});

// Initialize the partial mock and real parser during collection so each test
// measures rendering and cleanup after the engine dependency is available.
import '@antv/infographic';
import { renderInfographic } from '../src/infographic';

const source = `infographic list-row-horizontal-icon-arrow
data
  title 客户增长引擎
  desc 多渠道触达与复购提升
  items
    - label 线索获取
      value 18.6
      desc 渠道投放与内容获客
      icon rocket-launch
    - label 转化提效
      value 12.4
      desc 线索评分与自动跟进
      icon progress-check
    - label 复购提升
      value 9.8
      desc 会员体系与权益运营
      icon account-sync
    - label 口碑传播
      value 6.2
      desc 社群激励与推荐裂变
      icon account-group`;

afterEach(() => { engine.mode = 'success'; vi.useRealTimers(); });

describe('Offline infographic rendering', () => {
  it('passes the complete Doocs example to the engine with local icons and no web fonts', async () => {
    const svg = await renderInfographic(source);
    expect(engine.options.data.title).toBe('客户增长引擎');
    expect(engine.options.data.desc).toBe('多渠道触达与复购提升');
    expect(engine.options.data.items.map((item: Record<string, unknown>) => item.label)).toEqual(['线索获取', '转化提效', '复购提升', '口碑传播']);
    expect(engine.options.data.items.map((item: Record<string, unknown>) => item.icon)).toEqual(['ref:local:rocket-launch', 'ref:local:progress-check', 'ref:local:account-sync', 'ref:local:account-group']);
    expect(engine.options.editable).toBe(false);
    expect(engine.fonts.length).toBeGreaterThan(0);
    expect(engine.fonts.every((font) => Object.keys(font.fontWeight).length === 0)).toBe(true);
    expect(engine.fonts.every((font) => !/^["']/.test(font.fontFamily))).toBe(true);
    expect(document.querySelector('[data-infographic-host]')).toBeNull();
    expect(svg).toContain('foreignObject');
    expect(svg).toContain('font-size:24px');
    expect(svg).not.toMatch(/<script|<image|onclick|https:\/\//);
  });

  it('rewrites remote, inline and unknown icons to a local fallback before rendering', async () => {
    for (const resource of ['ref:remote:https://example.com/a.svg', 'data:image/svg+xml,%3Csvg%3E', '<svg onload="bad()"/>', 'unknown-icon']) {
      await renderInfographic(source.replace('rocket-launch', resource));
      expect(engine.options.data.items[0].icon).toBe('ref:local:fallback');
      const fallback = await engine.loader!({ data: resource });
      expect(fallback?.localName).toBe('symbol');
      expect(fallback?.outerHTML).not.toMatch(/http(?!:\/\/www.w3.org)|onload|<image/);
    }
  });

  it('preserves comparison values and resource-looking text as ordinary data', async () => {
    for (const value of ['<5', 'https://example.com', '<img src="https://example.com" onerror="bad()">']) {
      await renderInfographic(`infographic list-grid-badge-card\ndata\n  items\n    - label 数量\n      value ${value}\n      attributes\n        value\n          onload bad()\n          style background-image:url(https://example.com)`);
      expect(engine.options.data.items[0].value).toBe(value);
      expect(engine.options.data.items[0].attributes).toBeUndefined();
    }
  });

  it('does not forward raw SVG attributes or user web font styling', async () => {
    await renderInfographic(source + '\n      attributes\n        icon\n          href https://example.com/icon.svg\n        label\n          style background-image:url(https://example.com/a)\ntheme\n  base\n    text\n      font-family Source Han Sans');
    expect(engine.options.data.items[3].attributes).toBeUndefined();
    expect(engine.options.themeConfig.base.text['font-family']).toContain('Microsoft YaHei');
    expect(JSON.stringify(engine.options.data)).not.toContain('https');
  });

  it('rejects unsupported templates, excessive dimensions and data before creating a host', async () => {
    await expect(renderInfographic('infographic missing-template\ndata\n  items\n    - label A')).rejects.toThrow('未找到信息图模板');
    await expect(renderInfographic(source + '\nwidth 1000000')).rejects.toThrow('宽度');
    await expect(renderInfographic('infographic list-row-horizontal-icon-arrow\ndata\n  items\n' + Array.from({ length: 201 }, (_, index) => `    - label ${index}`).join('\n'))).rejects.toThrow('超过 200 项');
    await expect(renderInfographic('x'.repeat(30001))).rejects.toThrow('源码超过');
    expect(document.querySelector('[data-infographic-host]')).toBeNull();
  });

  it('destroys render failures and bounds rendering as well as export time', async () => {
    const initialDestroyed = engine.destroyed;
    engine.mode = 'error';
    await expect(renderInfographic(source)).rejects.toThrow('render failed');
    expect(engine.destroyed).toBe(initialDestroyed + 1);
    vi.useFakeTimers();
    for (const mode of ['timeout', 'export-timeout']) {
      engine.mode = mode;
      const result = expect(renderInfographic(source)).rejects.toThrow('渲染超时');
      await vi.advanceTimersByTimeAsync(5001);
      await result;
      expect(document.querySelector('[data-infographic-host]')).toBeNull();
    }
    expect(engine.destroyed).toBe(initialDestroyed + 3);
  });
});
