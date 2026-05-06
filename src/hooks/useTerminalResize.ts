import { useEffect, useRef } from 'react';
import type { FitAddon } from '@xterm/addon-fit';

export function useTerminalResize(
  containerRef: React.RefObject<HTMLDivElement | null>,
  fitAddon: FitAddon | null,
  onResize?: (cols: number, rows: number) => void,
) {
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (!containerRef.current || !fitAddon) return;

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // terminal may not be ready yet
      }
    });

    observer.observe(containerRef.current);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [containerRef, fitAddon, onResize]);
}
