import { describe, it, expect } from 'vitest';
import { detectInputType } from '@/lib/aiDetect';

describe('detectInputType', () => {
  // ── /ai prefix ──────────────────────────────────────────
  describe('/ai prefix', () => {
    it('should detect /ai prefix as AI type', () => {
      const result = detectInputType('/ai 帮我查看磁盘空间');
      expect(result.type).toBe('ai');
      expect(result.text).toBe('帮我查看磁盘空间');
    });

    it('should be case-insensitive for /ai prefix', () => {
      const result = detectInputType('/AI show disk usage');
      expect(result.type).toBe('ai');
      expect(result.text).toBe('show disk usage');
    });

    it('should strip extra whitespace after /ai', () => {
      const result = detectInputType('/ai   hello world');
      expect(result.type).toBe('ai');
      expect(result.text).toBe('hello world');
    });
  });

  // ── Shell commands ──────────────────────────────────────
  describe('shell commands', () => {
    it('should detect common shell commands', () => {
      expect(detectInputType('ls -la').type).toBe('shell');
      expect(detectInputType('git status').type).toBe('shell');
      expect(detectInputType('docker ps').type).toBe('shell');
      expect(detectInputType('npm install').type).toBe('shell');
      expect(detectInputType('cargo build').type).toBe('shell');
    });

    it('should detect path-like inputs as shell', () => {
      expect(detectInputType('./run.sh').type).toBe('shell');
      expect(detectInputType('/usr/bin/env').type).toBe('shell');
      expect(detectInputType('~/scripts/deploy.sh').type).toBe('shell');
    });

    it('should detect pipe/redirect syntax as shell', () => {
      expect(detectInputType('cat file | grep error').type).toBe('shell');
      expect(detectInputType('echo hello > output.txt').type).toBe('shell');
    });

    it('should detect variable-like inputs as shell', () => {
      expect(detectInputType('$HOME/bin').type).toBe('shell');
    });

    it('should detect Windows/PowerShell commands', () => {
      expect(detectInputType('dir /w').type).toBe('shell');
      expect(detectInputType('ipconfig /all').type).toBe('shell');
    });
  });

  // ── Chinese natural language ────────────────────────────
  describe('Chinese natural language', () => {
    it('should detect Chinese sentences as AI', () => {
      expect(detectInputType('帮我查看磁盘空间').type).toBe('ai');
      expect(detectInputType('如何安装 Node.js').type).toBe('ai');
      expect(detectInputType('创建一个新的项目').type).toBe('ai');
    });

    it('should detect Chinese with punctuation as AI', () => {
      expect(detectInputType('查看当前目录有什么？').type).toBe('ai');
    });

    it('should detect plain Chinese text as AI', () => {
      expect(detectInputType('系统信息').type).toBe('ai');
    });
  });

  // ── English natural language ────────────────────────────
  describe('English natural language', () => {
    it('should detect English questions as AI', () => {
      expect(detectInputType('how to install docker').type).toBe('ai');
      expect(detectInputType('what is the disk usage').type).toBe('ai');
      expect(detectInputType('please list all running containers').type).toBe('ai');
    });

    it('should detect help requests as AI', () => {
      expect(detectInputType('help me find large files').type).toBe('ai');
      expect(detectInputType('show me the logs').type).toBe('ai');
    });
  });

  // ── Edge cases ──────────────────────────────────────────
  describe('edge cases', () => {
    it('should treat empty input as shell', () => {
      expect(detectInputType('').type).toBe('shell');
      expect(detectInputType('   ').type).toBe('shell');
    });

    it('should default unknown inputs to shell', () => {
      expect(detectInputType('foobar').type).toBe('shell');
    });
  });
});
