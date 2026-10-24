import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseWithWorker } from '../src/parser-client';

const request = { source: 'text '.repeat(12000), assets: {}, preferences: {} };
const rendered = { html: '<p>Parsed</p>', meta: {} };

class FakeWorker {
  static instances: FakeWorker[] = [];
  static sendError: unknown;
  onmessage?: (event: { data: typeof rendered }) => void;
  onerror?: () => void;
  postMessage = vi.fn(() => { if (FakeWorker.sendError) throw FakeWorker.sendError; });
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
}

beforeEach(() => {
  FakeWorker.instances = []; FakeWorker.sendError = undefined;
  vi.useFakeTimers(); vi.stubGlobal('Worker', FakeWorker);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

function watchAbort(controller: AbortController) {
  const add = vi.spyOn(controller.signal, 'addEventListener');
  const remove = vi.spyOn(controller.signal, 'removeEventListener');
  return () => {
    expect(add).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  };
}

describe('parser worker lifecycle', () => {
  it('releases the worker before falling back when posting the request throws', async () => {
    FakeWorker.sendError = new DOMException('Uncloneable request', 'DataCloneError');
    const controller = new AbortController(); const checkCleanup = watchAbort(controller);
    const fallback = vi.fn(async () => {
      checkCleanup(); return rendered;
    });
    await expect(parseWithWorker(request, fallback, controller.signal)).resolves.toBe(rendered);
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('releases resources after a successful response without falling back', async () => {
    const controller = new AbortController(); const checkCleanup = watchAbort(controller);
    const fallback = vi.fn(async () => rendered);
    const pending = parseWithWorker(request, fallback, controller.signal);
    FakeWorker.instances[0].onmessage?.({ data: rendered });
    await expect(pending).resolves.toBe(rendered);
    checkCleanup(); expect(fallback).not.toHaveBeenCalled();
  });

  it('preserves cancellation and never starts the fallback parser', async () => {
    const controller = new AbortController(); const checkCleanup = watchAbort(controller);
    const fallback = vi.fn(async () => rendered);
    const pending = parseWithWorker(request, fallback, controller.signal);
    const reason = new DOMException('Cancelled parsing', 'AbortError');
    const rejected = expect(pending).rejects.toBe(reason);
    controller.abort(reason); await rejected;
    checkCleanup(); expect(fallback).not.toHaveBeenCalled();
  });

  it('releases the timed-out worker before using the fallback parser', async () => {
    const controller = new AbortController(); const checkCleanup = watchAbort(controller);
    const fallback = vi.fn(async () => {
      checkCleanup(); return rendered;
    });
    const pending = parseWithWorker(request, fallback, controller.signal);
    await vi.advanceTimersByTimeAsync(30000);
    await expect(pending).resolves.toBe(rendered);
    expect(fallback).toHaveBeenCalledOnce();
  });
});
