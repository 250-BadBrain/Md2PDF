import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '../src/Editor';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

async function mount(source: string, images: (files: File[]) => Promise<string[]>, disabled = false) {
  function Harness() {
    const [value, change] = useState(source);
    return createElement(Editor, { source: value, change, images, disabled, panel: null, download() {}, clear() {}, draftStatus: '' });
  }
  await act(async () => root.render(createElement(Harness)));
  return host.querySelector('textarea')!;
}
function paste(area: HTMLTextAreaElement, files: File[]) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files, items: [] } });
  area.dispatchEvent(event); return event;
}
function edit(area: HTMLTextAreaElement, value: string, position = value.length) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, value);
  area.dispatchEvent(new Event('input', { bubbles: true })); area.setSelectionRange(position, position);
}
const picture = () => new File(['image bytes'], 'clipboard.png', { type: 'image/png' });

describe('Editor image insertion', () => {
  it('preserves normal text paste and inserts image references at the saved selection', async () => {
    const images = vi.fn(async () => ['![clipboard](images/clipboard.png)']);
    const area = await mount('before SELECT after', images);
    area.setSelectionRange(7, 13);
    let ordinary!: Event;
    await act(async () => { ordinary = paste(area, []); });
    expect(ordinary.defaultPrevented).toBe(false); expect(images).not.toHaveBeenCalled();
    await act(async () => { paste(area, [picture()]); });
    expect(images).toHaveBeenCalledOnce();
    expect(area.value).toBe('before \n\n![clipboard](images/clipboard.png)\n\n after');
    expect(area.selectionStart).toBe(area.value.indexOf(' after'));
  });

  it('rebases an asynchronous selection when text is inserted before it', async () => {
    let resolve!: (refs: string[]) => void;
    const area = await mount('before SELECT after', () => new Promise(done => { resolve = done; }));
    area.setSelectionRange(7, 13);
    await act(async () => { paste(area, [picture()]); });
    await act(async () => { edit(area, 'new before SELECT after', 4); });
    await act(async () => { resolve(['![saved](images/saved.png)']); });
    expect(area.value).toBe('new before \n\n![saved](images/saved.png)\n\n after');
  });

  it('keeps overlapping edits and inserts at the current cursor instead of deleting new text', async () => {
    let resolve!: (refs: string[]) => void;
    const area = await mount('before SELECT after', () => new Promise(done => { resolve = done; }));
    area.setSelectionRange(7, 13);
    await act(async () => { paste(area, [picture()]); });
    await act(async () => { edit(area, 'before NEW after', 10); });
    await act(async () => { resolve(['![saved](images/saved.png)']); });
    expect(area.value).toBe('before NEW\n\n![saved](images/saved.png)\n\n after');
  });

  it('handles drop and existing-asset insertion, and displays errors without changing source', async () => {
    const images = vi.fn(async () => { throw new Error('图片太大'); });
    const area = await mount('keep', images); area.setSelectionRange(4, 4);
    await act(async () => {
      const event = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { files: [picture()] } }); area.dispatchEvent(event);
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('图片太大'); expect(area.value).toBe('keep');
    await act(async () => { window.dispatchEvent(new CustomEvent('editor-insert', { detail: '![existing](images/existing.png)' })); });
    expect(area.value).toBe('keep\n\n![existing](images/existing.png)');
  });

  it('respects disabled state for image paste and external insertion events', async () => {
    const images = vi.fn(async () => ['![x](images/x.png)']);
    const area = await mount('keep', images, true);
    await act(async () => { paste(area, [picture()]); window.dispatchEvent(new CustomEvent('editor-insert', { detail: '![x](images/x.png)' })); });
    expect(images).not.toHaveBeenCalled(); expect(area.value).toBe('keep');
  });
});
