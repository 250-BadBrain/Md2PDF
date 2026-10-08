import { useLayoutEffect, useRef } from 'react';

export function usePanelFocus(close: () => void) {
  const panel = useRef<HTMLElement>(null);
  const dismiss = useRef(close); dismiss.current = close;
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const mountedPanel = panel.current;
    mountedPanel?.querySelector<HTMLElement>('button,input,select')?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); dismiss.current(); } };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      if (mountedPanel?.contains(document.activeElement) && previous?.isConnected) previous.focus();
    };
  }, []);
  return panel;
}
