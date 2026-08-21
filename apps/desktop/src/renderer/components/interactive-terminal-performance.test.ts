import { describe, expect, it } from "vitest";
import {
  interactiveTerminalPollDelay,
  TERMINAL_ACTIVE_POLL_MS,
  TERMINAL_HIDDEN_POLL_MS,
  TERMINAL_IDLE_POLL_MS,
} from "./interactive-terminal-performance";

describe("interactive terminal performance", () => {
  it("uses a 30 Hz output cadence while data is flowing", () => {
    expect(
      interactiveTerminalPollDelay({ hadOutput: true, visible: true }),
    ).toBe(TERMINAL_ACTIVE_POLL_MS);
    expect(TERMINAL_ACTIVE_POLL_MS).toBeLessThanOrEqual(34);
  });

  it("backs off when idle or hidden", () => {
    expect(
      interactiveTerminalPollDelay({ hadOutput: false, visible: true }),
    ).toBe(TERMINAL_IDLE_POLL_MS);
    expect(
      interactiveTerminalPollDelay({ hadOutput: true, visible: false }),
    ).toBe(TERMINAL_HIDDEN_POLL_MS);
  });
});
