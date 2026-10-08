import { act, createElement, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePanelFocus } from '../src/panel-focus';

let host: HTMLDivElement;
let root: Root;
let opener: HTMLButtonElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  opener = document.createElement('button'); document.body.append(opener); opener.focus();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); opener.remove(); vi.unstubAllGlobals();
});

it('places initial focus during commit before later input focus can be interrupted', async () => {
  let focusDuringCommit: Element | null = null;
  function Panel() {
    const panel = usePanelFocus(() => {});
    return createElement('aside', { ref: panel }, createElement('button', null, 'Close'), createElement('input'));
  }
  function Harness() {
    useLayoutEffect(() => {
      focusDuringCommit = document.activeElement;
      // A later focus change must remain intact after pending effects finish.
      host.querySelector('input')!.focus();
    }, []);
    return createElement(Panel);
  }
  await act(async () => root.render(createElement(Harness)));
  expect(document.activeElement).toBe(host.querySelector('input'));
  expect(focusDuringCommit).toBe(host.querySelector('button'));
});

it('dismisses on Escape and returns focus to the opener when unmounted', async () => {
  const close = vi.fn();
  function Panel() {
    const panel = usePanelFocus(close);
    return createElement('aside', { ref: panel }, createElement('button', null, 'Close'));
  }
  await act(async () => root.render(createElement(Panel)));
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })));
  expect(close).toHaveBeenCalledOnce();
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(opener);
});

it('keeps a newly focused panel trigger when the old panel is removed', async () => {
  function Panel() {
    const panel = usePanelFocus(() => {});
    return createElement('aside', { ref: panel }, createElement('button', null, 'Close'));
  }
  await act(async () => root.render(createElement(Panel)));
  const nextTrigger = document.createElement('button'); document.body.append(nextTrigger); nextTrigger.focus();
  await act(async () => root.render(null));
  expect(document.activeElement).toBe(nextTrigger);
  nextTrigger.remove();
});
