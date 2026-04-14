import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  ensureCliRuntimeInitialized,
  resetCliRuntimeInitializationForTests,
} from "./init";

describe("ensureCliRuntimeInitialized", () => {
  beforeEach(() => {
    resetCliRuntimeInitializationForTests();
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
    resetCliRuntimeInitializationForTests();
  });

  it("installs the blessed textbox guard once", async () => {
    const importBlessed = mock(async () => ({
      default: { screen: true } as never,
    }));
    const installBlessedTextboxGuard = mock(() => {});

    await ensureCliRuntimeInitialized({
      importBlessed,
      installBlessedTextboxGuard,
    });
    await ensureCliRuntimeInitialized({
      importBlessed,
      installBlessedTextboxGuard,
    });

    expect(importBlessed).toHaveBeenCalledTimes(1);
    expect(installBlessedTextboxGuard).toHaveBeenCalledTimes(1);
    expect(installBlessedTextboxGuard).toHaveBeenCalledWith({
      screen: true,
    });
  });
});
