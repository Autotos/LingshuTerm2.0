/** Determine the correct Tauri invoke command based on session ID prefix. */

const CONNECTION_PREFIXES = ['ssh-', 'telnet-', 'serial-'];

export function isConnectionSession(sessionId: string): boolean {
  return CONNECTION_PREFIXES.some((p) => sessionId.startsWith(p));
}

export function getWriteCommand(sessionId: string): string {
  return isConnectionSession(sessionId) ? 'write_to_connection' : 'write_to_terminal';
}

export function getResizeCommand(sessionId: string): string {
  return isConnectionSession(sessionId) ? 'resize_connection' : 'resize_terminal';
}

export function getProtocolFromSessionId(sessionId: string): string {
  const dash = sessionId.indexOf('-');
  return dash > 0 ? sessionId.substring(0, dash) : 'pty';
}
