import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// 配置 Monaco Worker（Vite 使用 ?worker 后缀）
// 当前仅需通用 editor worker（plaintext 场景够用）；
// 若后续需要 TS/JSON/HTML/CSS 等语言服务，再额外配置对应 worker 即可
if (typeof self !== 'undefined' && !(self as any).MonacoEnvironment) {
  (self as any).MonacoEnvironment = {
    getWorker(_: string, _label: string) {
      return new EditorWorker();
    },
  };
}

export interface MonacoInstance {
  editor: monaco.editor.IStandaloneCodeEditor;
  dispose: () => void;
}

let themeRegistered = false;

function registerLingshuTheme() {
  if (themeRegistered) return;
  monaco.editor.defineTheme('lingshu-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'faf9f6', background: '0e0e0d' },
      { token: 'comment', foreground: '868584', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'b08dba' },
      { token: 'string', foreground: '8fba7a' },
      { token: 'number', foreground: 'c9b87a' },
      { token: 'type', foreground: '7ea8c7' },
      { token: 'variable', foreground: 'afaeac' },
    ],
    colors: {
      'editor.background': '#0e0e0d',
      'editor.foreground': '#faf9f6',
      'editorCursor.foreground': '#a0917e',
      'editor.lineHighlightBackground': '#1c1c1b',
      'editor.selectionBackground': '#a0917e40',
      'editorLineNumber.foreground': '#666469',
      'editorLineNumber.activeForeground': '#868584',
      'editorGutter.background': '#0e0e0d',
      'editorWidget.background': '#161615',
      'editorWidget.border': '#2a2a29',
      'input.background': '#1c1c1b',
      'input.border': '#2a2a29',
      'scrollbarSlider.background': '#e2e2e233',
      'scrollbarSlider.hoverBackground': '#666469',
    },
  });
  themeRegistered = true;
}

export function createMonacoEditor(
  container: HTMLElement,
  options?: Partial<monaco.editor.IStandaloneEditorConstructionOptions>,
): MonacoInstance {
  registerLingshuTheme();

  const editor = monaco.editor.create(container, {
    value: '',
    language: 'plaintext',
    theme: 'lingshu-dark',
    fontFamily: 'Berkeley Mono, JetBrains Mono, SF Mono, Monaco, Menlo, Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.4 * 13,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    renderLineHighlight: 'line',
    padding: { top: 8, bottom: 8 },
    automaticLayout: true,
    ...options,
  });

  return {
    editor,
    dispose: () => {
      editor.dispose();
    },
  };
}
