import { describe, it, expect } from 'vitest';
import {
  stripControl,
  stripAllAnsi,
  stripAnsi,
  parseAnsiToSegments,
} from '../ansi';

describe('stripControl', () => {
  it('removes OSC 7701 start/end markers (BEL-terminated)', () => {
    const input = '\x1b]7701;S;abc\x07hello\x1b]7701;E;abc;0\x07';
    expect(stripControl(input)).toBe('hello');
  });

  it('removes OSC sequences terminated by ST (ESC \\)', () => {
    const input = '\x1b]0;title\x1b\\body';
    expect(stripControl(input)).toBe('body');
  });

  it('removes DECSET/DECRST like [?2004h and [?2004l', () => {
    const input = '\x1b[?2004hprompt\x1b[?2004l';
    expect(stripControl(input)).toBe('prompt');
  });

  it('removes cursor positioning CSI (H, K, J, etc.)', () => {
    const input = 'foo\x1b[2K\x1b[1;1Hbar';
    expect(stripControl(input)).toBe('foobar');
  });

  it('preserves SGR (color) sequences', () => {
    const input = '\x1b[32mgreen\x1b[0m';
    expect(stripControl(input)).toBe('\x1b[32mgreen\x1b[0m');
  });

  it('preserves tabs, newlines, carriage returns', () => {
    const input = 'a\tb\nc\rd';
    expect(stripControl(input)).toBe('a\tb\nc\rd');
  });

  it('strips other C0 control characters (BEL, BS, etc.)', () => {
    const input = 'a\x07b\x08c';
    expect(stripControl(input)).toBe('abc');
  });
});

describe('stripAllAnsi / stripAnsi (back-compat alias)', () => {
  it('removes SGR too', () => {
    const input = '\x1b[32mgreen\x1b[0m plain';
    expect(stripAllAnsi(input)).toBe('green plain');
    expect(stripAnsi(input)).toBe('green plain');
  });

  it('removes OSC + CSI + SGR together', () => {
    const input = '\x1b]7701;S;x\x07\x1b[?2004h\x1b[34mhi\x1b[0m\x1b[?2004l\x1b]7701;E;x;0\x07';
    expect(stripAllAnsi(input)).toBe('hi');
  });
});

describe('parseAnsiToSegments', () => {
  it('handles plain text as a single segment', () => {
    const segs = parseAnsiToSegments('hello');
    expect(segs).toEqual([{ text: 'hello' }]);
  });

  it('applies fg from 16-color SGR', () => {
    const segs = parseAnsiToSegments('\x1b[34mdir\x1b[0m');
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('dir');
    expect(segs[0].fg).toBe('#7ea8c7');
  });

  it('resets state on SGR 0', () => {
    const segs = parseAnsiToSegments('\x1b[1;31mred\x1b[0m tail');
    expect(segs[0]).toMatchObject({ text: 'red', fg: '#d4867c', bold: true });
    expect(segs[1]).toMatchObject({ text: ' tail' });
    expect(segs[1].fg).toBeUndefined();
    expect(segs[1].bold).toBeFalsy();
  });

  it('supports 256-color via 38;5;N', () => {
    const segs = parseAnsiToSegments('\x1b[38;5;46mgreenish\x1b[0m');
    expect(segs[0].fg).toBeDefined();
    expect(segs[0].fg).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('supports truecolor via 38;2;R;G;B', () => {
    const segs = parseAnsiToSegments('\x1b[38;2;255;128;0morange\x1b[0m');
    expect(segs[0].fg).toBe('#ff8000');
  });

  it('merges adjacent same-style segments', () => {
    // 两次相同颜色 SGR 之间的文本应合并
    const segs = parseAnsiToSegments('\x1b[32ma\x1b[32mb\x1b[0m');
    expect(segs).toHaveLength(1);
    expect(segs[0].text).toBe('ab');
    expect(segs[0].fg).toBe('#8fba7a');
  });
});
