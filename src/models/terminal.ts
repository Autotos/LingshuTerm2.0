export interface TerminalConfig {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  scrollback: number;
  cursorBlink: boolean;
  cursorStyle: 'bar' | 'block' | 'underline';
}

export interface PtyOutputPayload {
  session_id: string;
  data: string;
}

export interface SessionCreatedPayload {
  session_id: string;
  shell: string;
  cwd: string;
}

export interface SessionEndedPayload {
  session_id: string;
}

export interface SessionErrorPayload {
  session_id: string;
  error: string;
}
