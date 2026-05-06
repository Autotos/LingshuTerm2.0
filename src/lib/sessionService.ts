import { invoke } from '@tauri-apps/api/core';
import type { ConnectionConfig, LocalShellOption } from '@/models/connection';

/**
 * Unified session creation entry point.
 *
 * Invokes the Rust `create_session` command which internally dispatches:
 *  - `{ protocol: 'local', shell, cwd? }`   → `PtyManager::create_session`
 *  - `{ protocol: 'ssh' | 'telnet' | 'serial', ... }` → `ConnectionManager::connect`
 *
 * Returns the backend-assigned session id (`session-N` / `ssh-N` / `telnet-N` / `serial-N`).
 * The id prefix is what `sessionUtils.getWriteCommand` uses to route subsequent I/O.
 */
export async function createSession(config: ConnectionConfig): Promise<string> {
  return invoke<string>('create_session', { config });
}

/**
 * Enumerate local shell options for the current OS.
 * Used by the Local panel of SessionTypeModal to populate its dropdown.
 */
export async function listLocalShells(): Promise<LocalShellOption[]> {
  return invoke<LocalShellOption[]>('list_local_shells');
}
