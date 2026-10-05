import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPlantuml, sanitizePlantumlSvg, validatePlantumlSource } from '../src/plantuml';

describe('local PlantUML boundary', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  it('accepts the eight Doocs participant types, Unicode and ordinary native diagrams', () => {
    const types = ['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue'];
    const source = ['@startuml', ...types.map((type, i) => `${type} "角色 ${i} 😀" as Foo${i}`), ...types.slice(1).map((_, i) => `Foo0 -> Foo${i + 1} : 中文消息`), '@enduml'].join('\n');
    expect(validatePlantumlSource(source)).toHaveLength(17);
    expect(validatePlantumlSource('@startuml\r\nclass "中文" as Foo\r\nFoo --> Bar\r\n@enduml')).toHaveLength(4);
    expect(validatePlantumlSource('@startmindmap\n* 本地\n** 图形\n@endmindmap')).toHaveLength(4);
  });

  it('accepts named diagrams, Creole emphasis and exclamation marks in message text', () => {
    expect(validatePlantumlSource('@startuml sample.puml\nAlice -> Bob : //italic//\nBob -> Alice : Hello!Thanks\n@enduml')).toHaveLength(4);
    expect(validatePlantumlSource('@startuml 中文名称\nAlice -> Bob : **粗体**\n@enduml')).toHaveLength(3);
  });

  it('rejects external resources, preprocessing and generated network calls', () => {
    const forbidden = ['!include https://example.com/leak', '!include <C4/C4_Context>', '  !include //example.com/a.puml', '!theme bluegray', '!define A B', '%load_json("remote.json")', '%chr(33)', 'Alice -> Bob : https://example.com', 'Alice -> Bob : [[https://example.com]]', 'Alice -> Bob : <img:photo.png>', 'Alice -> Bob : <:smile:>', 'Alice -> Bob : <#red:smile:>', 'Alice -> Bob : <$foo>', 'sprite $foo [1x1]'];
    for (const statement of forbidden) expect(() => validatePlantumlSource(`@startuml\n${statement}\n@enduml`), statement).toThrow(/不支持/);
  });

  it('requires one complete bounded diagram and accepts no hidden controls', () => {
    for (const source of ['Alice -> Bob', '@startuml\nAlice -> Bob\n@endjson', '@startuml\n@enduml\n@startuml\n@enduml']) expect(() => validatePlantumlSource(source)).toThrow(/标记|一张图/);
    expect(() => validatePlantumlSource('@startuml\n' + 'a'.repeat(40_000) + '\n@enduml')).toThrow(/字符限制/);
    expect(() => validatePlantumlSource('@startuml\n' + '\n'.repeat(1_001) + '@enduml')).toThrow(/行/);
    expect(() => validatePlantumlSource('@startuml\n' + 'a'.repeat(2_001) + '\n@enduml')).toThrow(/单行/);
    expect(() => validatePlantumlSource('@startuml\nAlice\u0000Bob\n@enduml')).toThrow(/控制字符/);
  });

  it('removes active content and external references while preserving SVG text', () => {
    const svg = sanitizePlantumlSvg('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><script>alert(1)</script><foreignObject>bad</foreignObject><style>@import "https://example.com";</style><image href="https://example.com"/><text onclick="alert(1)" style="fill:url(https://example.com)">中文</text><a href="javascript:alert(1)"><text>链接文字</text></a><path fill="url(#gradient)" d="M0 0"/></svg>');
    expect(svg).toContain('中文');
    expect(svg).toContain('链接文字');
    expect(svg).toContain('url(#gradient)');
    expect(svg).not.toMatch(/script|foreignObject|<style|<image|href|onclick|https:|javascript:/i);
    expect(() => sanitizePlantumlSvg('<svg xmlns="http://www.w3.org/2000/svg" width="9000" height="10"/>')).toThrow(/尺寸/);
    expect(() => sanitizePlantumlSvg('not SVG')).toThrow(/有效 SVG/);
    expect(() => sanitizePlantumlSvg('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><text>PlantUML version 1.2026.8</text><text>[From textarea (line 2) ]</text><text> Syntax Error? </text></svg>')).toThrow(/语法错误.*line 2/);
  });

  it('rejects an already aborted render before loading any engine', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(renderPlantuml('@startuml\nAlice -> Bob\n@enduml', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('cancels a queued render immediately and aborts active local asset requests', async () => {
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const first = new AbortController();
    const second = new AbortController();
    const active = renderPlantuml('@startuml\nAlice -> Bob\n@enduml', first.signal);
    const activeCheck = expect(active).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const queued = renderPlantuml('@startuml\nBob -> Alice\n@enduml', second.signal);
    second.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    first.abort();
    await activeCheck;
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('bounds loading time as well as render time', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', (_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    const result = renderPlantuml('@startuml\nAlice -> Bob\n@enduml');
    const checked = expect(result).rejects.toThrow(/超时/);
    await vi.advanceTimersByTimeAsync(20_000);
    await checked;
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('ignores forged messages from another frame or an incorrect token', async () => {
    vi.stubGlobal('fetch', async () => new Response('/* trusted local fixture */'));
    const controller = new AbortController();
    const rendered = renderPlantuml('@startuml\nAlice -> Bob\n@enduml', controller.signal);
    const checked = expect(rendered).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
    const frame = document.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.srcdoc).toContain("connect-src 'none'");
    expect(frame.srcdoc).not.toContain('Alice -> Bob');
    const token = frame.srcdoc.match(/const token = "([\w-]+)"/)![1];
    const posted = vi.spyOn(frame.contentWindow!, 'postMessage');
    dispatchEvent(new MessageEvent('message', { source: window, data: { token, type: 'ready' } }));
    dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { token: 'wrong', type: 'ready' } }));
    await Promise.resolve();
    expect(posted).not.toHaveBeenCalled();
    dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { token, type: 'ready' } }));
    await vi.waitFor(() => expect(posted).toHaveBeenCalledTimes(1));
    const request = posted.mock.calls[0][0];
    dispatchEvent(new MessageEvent('message', { source: window, data: { token, type: 'svg', id: request.id, value: '<svg/>' } }));
    dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { token: 'wrong', type: 'svg', id: request.id, value: '<svg/>' } }));
    controller.abort();
    await checked;
    expect(document.querySelector('iframe')).toBeNull();
  });
});
