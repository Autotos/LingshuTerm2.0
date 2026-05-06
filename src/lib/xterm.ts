import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import type { ITerminalOptions } from '@xterm/xterm';

export interface XTermInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  dispose: () => void;
}

const defaultOptions: ITerminalOptions = {
  allowProposedApi: true,
  cursorBlink: true,
  cursorStyle: 'bar',
  fontFamily: 'Berkeley Mono, JetBrains Mono, SF Mono, Monaco, Menlo, Consolas, monospace',
  fontSize: 13,
  lineHeight: 1.4,
  theme: {
    background: '#0e0e0d',
    foreground: '#faf9f6',
    cursor: '#a0917e',
    cursorAccent: '#0e0e0d',
    selectionBackground: 'rgba(160, 145, 126, 0.25)',
    black: '#1c1c1b',
    red: '#d4867c',
    green: '#8fba7a',
    yellow: '#c9b87a',
    blue: '#7ea8c7',
    magenta: '#b08dba',
    cyan: '#8fb8b8',
    white: '#afaeac',
    brightBlack: '#666469',
    brightRed: '#e09a90',
    brightGreen: '#a3c990',
    brightYellow: '#d9ca8e',
    brightBlue: '#95bad4',
    brightMagenta: '#c4a4cc',
    brightCyan: '#a6c9c9',
    brightWhite: '#faf9f6',
  },
  scrollback: 10000,
  convertEol: true,
};

export function createXTerm(
  container: HTMLElement,
  onData: (data: string) => void,
  onResize: (cols: number, rows: number) => void,
  options?: Partial<ITerminalOptions>,
): XTermInstance {
  const terminal = new Terminal({
    ...defaultOptions,
    ...options,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  // 必须先 open，再加载 WebglAddon（否则 RenderService 未初始化会报错）
  terminal.open(container);

  try {
    const webglAddon = new WebglAddon();
    terminal.loadAddon(webglAddon);
  } catch (e) {
    console.warn('WebGL not available, falling back to canvas rendering', e);
  }

  requestAnimationFrame(() => {
    try {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        fitAddon.fit();
      }
    } catch (e) {
      console.warn('fitAddon.fit() failed:', e);
    }
  });

  terminal.onData(onData);
  terminal.onResize(({ cols, rows }) => {
    onResize(cols, rows);
  });

  return {
    terminal,
    fitAddon,
    dispose: () => {
      terminal.dispose();
    },
  };
}
