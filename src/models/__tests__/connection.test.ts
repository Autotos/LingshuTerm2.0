import { describe, it, expect } from 'vitest';
import {
  connectionLabel,
  defaultSshConfig,
  defaultTelnetConfig,
  defaultSerialConfig,
  generateConnectionId,
} from '@/models/connection';
import type { SshConfig, TelnetConfig, SerialConfig } from '@/models/connection';

describe('connection model helpers', () => {
  describe('connectionLabel', () => {
    it('should format SSH label as user@host:port', () => {
      const config: SshConfig = { protocol: 'ssh', host: '1.2.3.4', port: 22, username: 'admin', password: '' };
      expect(connectionLabel(config)).toBe('admin@1.2.3.4:22');
    });

    it('should format Telnet label as host:port', () => {
      const config: TelnetConfig = { protocol: 'telnet', host: '10.0.0.1', port: 23 };
      expect(connectionLabel(config)).toBe('10.0.0.1:23');
    });

    it('should format Serial label as port @ baud', () => {
      const config: SerialConfig = { protocol: 'serial', portName: 'COM3', baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' };
      expect(connectionLabel(config)).toBe('COM3 @ 115200');
    });
  });

  describe('default configs', () => {
    it('should return valid SSH defaults', () => {
      const d = defaultSshConfig();
      expect(d.protocol).toBe('ssh');
      expect(d.port).toBe(22);
      expect(d.username).toBe('root');
    });

    it('should return valid Telnet defaults', () => {
      const d = defaultTelnetConfig();
      expect(d.protocol).toBe('telnet');
      expect(d.port).toBe(23);
    });

    it('should return valid Serial defaults', () => {
      const d = defaultSerialConfig();
      expect(d.protocol).toBe('serial');
      expect(d.baudRate).toBe(115200);
      expect(d.dataBits).toBe(8);
      expect(d.stopBits).toBe(1);
      expect(d.parity).toBe('none');
    });
  });

  describe('generateConnectionId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateConnectionId();
      const id2 = generateConnectionId();
      expect(id1).not.toBe(id2);
    });

    it('should start with "conn-"', () => {
      expect(generateConnectionId()).toMatch(/^conn-/);
    });
  });
});
