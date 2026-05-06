export interface EditorConfig {
  language: string;
  readOnly: boolean;
  minimap: boolean;
  fontSize: number;
  wordWrap: 'on' | 'off' | 'wordWrapColumn';
}

export interface EditorTab {
  id: string;
  title: string;
  language: string;
  content: string;
  dirty: boolean;
}
