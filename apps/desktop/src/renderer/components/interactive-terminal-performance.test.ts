import { describe, expect, it } from "vitest";
import {
  interactiveTerminalPollDelay,
  TERMINAL_ACTIVE_POLL_MS,
  TERMINAL_HIDDEN_POLL_MS,
  TERMINAL_IDLE_POLL_MS,
  terminalOutputRecoveryDelay,
} from "./interactive-terminal-performance";

describe("interactive terminal performance", () => {
  it("uses a near-frame output cadence while data is flowing", () => {
    expect(
      interactiveTerminalPollDelay({ hadOutput: true, visible: true }),
    ).toBe(TERMINAL_ACTIVE_POLL_MS);
    expect(TERMINAL_ACTIVE_POLL_MS).toBeLessThanOrEqual(16);
  });

  it("backs off when idle or hidden", () => {
    expect(
      interactiveTerminalPollDelay({ hadOutput: false, visible: true }),
    ).toBe(TERMINAL_IDLE_POLL_MS);
    expect(
      interactiveTerminalPollDelay({ hadOutput: true, visible: false }),
    ).toBe(TERMINAL_HIDDEN_POLL_MS);
  });

  it("bounds read-only recovery to known transport failures", () => {
    expect(terminalOutputRecoveryDelay(true, 0)).toBe(250);
    expect(terminalOutputRecoveryDelay(true, 1)).toBe(1_000);
    expect(terminalOutputRecoveryDelay(true, 2)).toBe(3_000);
    expect(terminalOutputRecoveryDelay(true, 3)).toBeNull();
    expect(terminalOutputRecoveryDelay(false, 0)).toBeNull();
  });
});
