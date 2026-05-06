import { describe, it, expect, beforeEach } from 'vitest';
import { useConnectionStore } from '@/stores/connectionStore';
import type { SshConfig, TelnetConfig, SerialConfig } from '@/models/connection';

// Reset store between tests
beforeEach(() => {
  useConnectionStore.setState({ savedConnections: [] });
});

describe('connectionStore', () => {
  it('should start with empty saved connections', () => {
    expect(useConnectionStore.getState().savedConnections).toHaveLength(0);
  });

  it('should add a SSH connection', () => {
    const config: SshConfig = {
      protocol: 'ssh',
      host: '192.168.1.1',
      port: 22,
      username: 'root',
      password: 'secret',
    };

    const id = useConnectionStore.getState().addConnection('My Server', config);
    expect(id).toBeTruthy();

    const saved = useConnectionStore.getState().savedConnections;
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('My Server');
    expect(saved[0].config).toEqual(config);
    expect(saved[0].createdAt).toBeTruthy();
  });

  it('should add a Telnet connection', () => {
    const config: TelnetConfig = {
      protocol: 'telnet',
      host: '10.0.0.1',
      port: 23,
    };

    useConnectionStore.getState().addConnection('Telnet Device', config);
    const saved = useConnectionStore.getState().savedConnections;
    expect(saved).toHaveLength(1);
    expect(saved[0].config.protocol).toBe('telnet');
  });

  it('should add a Serial connection', () => {
    const config: SerialConfig = {
      protocol: 'serial',
      portName: 'COM3',
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
    };

    useConnectionStore.getState().addConnection('Serial Debug', config);
    const saved = useConnectionStore.getState().savedConnections;
    expect(saved).toHaveLength(1);
    expect(saved[0].config.protocol).toBe('serial');
  });

  it('should remove a connection by id', () => {
    const config: SshConfig = {
      protocol: 'ssh',
      host: 'a.com',
      port: 22,
      username: 'user',
      password: 'pass',
    };

    const id = useConnectionStore.getState().addConnection('ToRemove', config);
    expect(useConnectionStore.getState().savedConnections).toHaveLength(1);

    useConnectionStore.getState().removeConnection(id);
    expect(useConnectionStore.getState().savedConnections).toHaveLength(0);
  });

  it('should update a connection', () => {
    const config: SshConfig = {
      protocol: 'ssh',
      host: 'old.com',
      port: 22,
      username: 'user',
      password: 'old',
    };

    const id = useConnectionStore.getState().addConnection('Old Name', config);

    const newConfig: SshConfig = { ...config, host: 'new.com', password: 'new' };
    useConnectionStore.getState().updateConnection(id, 'New Name', newConfig);

    const saved = useConnectionStore.getState().savedConnections;
    expect(saved[0].name).toBe('New Name');
    expect((saved[0].config as SshConfig).host).toBe('new.com');
  });

  it('should handle multiple connections', () => {
    const ssh: SshConfig = { protocol: 'ssh', host: 'a.com', port: 22, username: 'u', password: 'p' };
    const telnet: TelnetConfig = { protocol: 'telnet', host: 'b.com', port: 23 };

    useConnectionStore.getState().addConnection('SSH', ssh);
    useConnectionStore.getState().addConnection('Telnet', telnet);

    expect(useConnectionStore.getState().savedConnections).toHaveLength(2);
  });

  it('should generate unique IDs for each connection', () => {
    const config: SshConfig = { protocol: 'ssh', host: 'a.com', port: 22, username: 'u', password: 'p' };

    const id1 = useConnectionStore.getState().addConnection('A', config);
    const id2 = useConnectionStore.getState().addConnection('B', config);
    expect(id1).not.toBe(id2);
  });
});
