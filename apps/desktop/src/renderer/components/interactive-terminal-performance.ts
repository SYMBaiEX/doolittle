export const TERMINAL_ACTIVE_POLL_MS = 32;
export const TERMINAL_IDLE_POLL_MS = 96;
export const TERMINAL_HIDDEN_POLL_MS = 500;
export const TERMINAL_PERSIST_DEBOUNCE_MS = 420;

export function interactiveTerminalPollDelay({
  hadOutput,
  visible,
}: {
  hadOutput: boolean;
  visible: boolean;
}): number {
  if (!visible) return TERMINAL_HIDDEN_POLL_MS;
  return hadOutput ? TERMINAL_ACTIVE_POLL_MS : TERMINAL_IDLE_POLL_MS;
}
