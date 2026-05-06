import { invoke } from '@tauri-apps/api/core';
import type { PortInfo } from '@/models/connection';

// Note: `connect` has been removed. Use `createSession` from `sessionService.ts`
// — the unified entry point that handles SSH/Telnet/Serial/Local in one shot.

/** Close a connection session. */
export async function disconnect(sessionId: string): Promise<void> {
  return invoke('disconnect', { sessionId });
}

/** Write data to a connection session. */
export async function writeToConnection(sessionId: string, data: string): Promise<void> {
  return invoke('write_to_connection', { sessionId, data });
}

/** Resize a connection session terminal. */
export async function resizeConnection(sessionId: string, cols: number, rows: number): Promise<void> {
  return invoke('resize_connection', { sessionId, cols, rows });
}

/** List available serial (COM) ports. */
export async function listSerialPorts(): Promise<PortInfo[]> {
  return invoke<PortInfo[]>('list_serial_ports');
}
