import { describe, it, expect } from 'vitest';
import {
  detectOutputKind,
  detectCodeLang,
  detectFileListEntries,
} from '../outputDispatch';

describe('detectOutputKind', () => {
  it('recognizes ls/dir output as fileList', () => {
    const text = 'arms_cache  deer-flow  github\nclaude_prj  ebook-reader  miniconda3';
    expect(detectOutputKind('ls', text)).toBe('fileList');
    expect(detectOutputKind('dir', text)).toBe('fileList');
    expect(detectOutputKind('tree .', text)).toBe('fileList');
  });

  it('does NOT misclassify single-word ls output (too short)', () => {
    // 单 token, totalTokens < 2 → 非 fileList
    expect(detectOutputKind('ls', 'README.md')).toBe('plain');
  });

  it('recognizes valid JSON content as json', () => {
    expect(detectOutputKind('some', '{"a":1,"b":2}')).toBe('json');
    expect(detectOutputKind('other', '[\n  1,\n  2\n]')).toBe('json');
  });

  it('recognizes `cat file.json` as code via extension', () => {
    // 假设输出不是标准 JSON 开头 —— 依然应走 code（按扩展名）
    expect(detectOutputKind('cat package.json', 'non-json-looking')).toBe('code');
    expect(detectOutputKind('cat main.py', 'print("hi")')).toBe('code');
  });

  it('recognizes markdown headers', () => {
    expect(detectOutputKind('any', '# Title\ncontent')).toBe('markdown');
    expect(detectOutputKind('any', '## Section\n- item\n- item2')).toBe('markdown');
  });

  it('recognizes markdown fenced code', () => {
    expect(detectOutputKind('any', '```js\nconsole.log(1)\n```')).toBe('markdown');
  });

  it('recognizes markdown bullet list (>=2 items)', () => {
    expect(detectOutputKind('any', '- a\n- b\n- c')).toBe('markdown');
  });

  it('falls back to plain for arbitrary output', () => {
    expect(detectOutputKind('echo', 'hello world')).toBe('plain');
    expect(detectOutputKind('pwd', '/home/user')).toBe('plain');
  });

  it('does not misclassify "[info] ..." log lines as JSON', () => {
    // `[` 开头但不以 `]` 结尾 → 不走 code
    expect(detectOutputKind('run', '[info] server started')).toBe('plain');
  });
});

describe('detectCodeLang', () => {
  it('picks lang from command extension', () => {
    expect(detectCodeLang('cat file.json', '')).toBe('json');
    expect(detectCodeLang('cat main.py', '')).toBe('python');
    expect(detectCodeLang('cat lib.rs', '')).toBe('rust');
    expect(detectCodeLang('cat app.ts', '')).toBe('typescript');
    expect(detectCodeLang('cat cfg.yaml', '')).toBe('yaml');
  });

  it('falls back to JSON heuristic', () => {
    expect(detectCodeLang('run', '{"k":1}')).toBe('json');
  });

  it('detects python by def/class heuristic', () => {
    expect(detectCodeLang('run', 'def hello():\n    pass')).toBe('python');
  });

  it('detects rust by fn/struct heuristic', () => {
    expect(detectCodeLang('run', 'fn main() {}')).toBe('rust');
  });

  it('returns text for unknown', () => {
    expect(detectCodeLang('run', 'random plain text')).toBe('text');
  });
});

describe('detectFileListEntries', () => {
  it('classifies by SGR colors when present', () => {
    // 34 = dir, 32 = exe, 36 = link, 默认 = file
    const raw =
      '\x1b[34msrc\x1b[0m  ' +
      '\x1b[32mrun.sh\x1b[0m  ' +
      '\x1b[36mlink.txt\x1b[0m  ' +
      'README.md';
    const entries = detectFileListEntries(raw);
    expect(entries).toEqual(
      expect.arrayContaining([
        { name: 'src', kind: 'dir' },
        { name: 'run.sh', kind: 'exe' },
        { name: 'link.txt', kind: 'link' },
        { name: 'README.md', kind: 'file' },
      ]),
    );
  });

  it('classifies by ls -F suffix when no SGR', () => {
    const raw = 'src/  run.sh*  link@  README.md';
    const entries = detectFileListEntries(raw);
    expect(entries).toEqual([
      { name: 'src', kind: 'dir' },
      { name: 'run.sh', kind: 'exe' },
      { name: 'link', kind: 'link' },
      { name: 'README.md', kind: 'file' },
    ]);
  });

  it('falls back to file kind for plain ls output without color/suffix', () => {
    const raw = 'a  b  c';
    const entries = detectFileListEntries(raw);
    expect(entries).toEqual([
      { name: 'a', kind: 'file' },
      { name: 'b', kind: 'file' },
      { name: 'c', kind: 'file' },
    ]);
  });

  it('dedupes repeated entries', () => {
    const raw = 'a  a  b';
    const entries = detectFileListEntries(raw);
    expect(entries).toHaveLength(2);
  });
});
