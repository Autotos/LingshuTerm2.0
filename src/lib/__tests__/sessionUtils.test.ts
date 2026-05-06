import { describe, it, expect } from 'vitest';
import {
  isConnectionSession,
  getWriteCommand,
  getResizeCommand,
  getProtocolFromSessionId,
} from '@/lib/sessionUtils';

describe('sessionUtils', () => {
  describe('isConnectionSession', () => {
    it('should return true for SSH session IDs', () => {
      expect(isConnectionSession('ssh-1')).toBe(true);
      expect(isConnectionSession('ssh-abc-123')).toBe(true);
    });

    it('should return true for Telnet session IDs', () => {
      expect(isConnectionSession('telnet-42')).toBe(true);
    });

    it('should return true for Serial session IDs', () => {
      expect(isConnectionSession('serial-5')).toBe(true);
    });

    it('should return false for PTY session IDs', () => {
      expect(isConnectionSession('session-1')).toBe(false);
      expect(isConnectionSession('pty-99')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isConnectionSession('')).toBe(false);
    });
  });

  describe('getWriteCommand', () => {
    it('should return write_to_connection for connection sessions', () => {
      expect(getWriteCommand('ssh-1')).toBe('write_to_connection');
      expect(getWriteCommand('telnet-2')).toBe('write_to_connection');
      expect(getWriteCommand('serial-3')).toBe('write_to_connection');
    });

    it('should return write_to_terminal for PTY sessions', () => {
      expect(getWriteCommand('session-1')).toBe('write_to_terminal');
    });
  });

  describe('getResizeCommand', () => {
    it('should return resize_connection for connection sessions', () => {
      expect(getResizeCommand('ssh-1')).toBe('resize_connection');
    });

    it('should return resize_terminal for PTY sessions', () => {
      expect(getResizeCommand('session-1')).toBe('resize_terminal');
    });
  });

  describe('getProtocolFromSessionId', () => {
    it('should extract protocol from session ID', () => {
      expect(getProtocolFromSessionId('ssh-123')).toBe('ssh');
      expect(getProtocolFromSessionId('telnet-456')).toBe('telnet');
      expect(getProtocolFromSessionId('serial-789')).toBe('serial');
      expect(getProtocolFromSessionId('session-1')).toBe('session');
    });

    it('should return pty for IDs without dash', () => {
      expect(getProtocolFromSessionId('nodash')).toBe('pty');
    });
  });
});
