export const TERMINAL_ACTIVE_POLL_MS = 16;
export const TERMINAL_IDLE_POLL_MS = 56;
export const TERMINAL_HIDDEN_POLL_MS = 500;
export const TERMINAL_PERSIST_DEBOUNCE_MS = 420;
export const TERMINAL_RECOVERY_DELAYS_MS = [250, 1_000, 3_000] as const;

/** Only read-only output polling may be retried, and only for transport failures. */
export function terminalOutputRecoveryDelay(
  retryable: boolean,
  previousFailures: number,
): number | null {
  if (!retryable) return null;
  return TERMINAL_RECOVERY_DELAYS_MS[previousFailures] ?? null;
}

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
