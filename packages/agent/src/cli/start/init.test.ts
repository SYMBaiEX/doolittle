import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureCliRuntimeInitialized,
  resetCliRuntimeInitializationForTests,
} from "./init";

describe("ensureCliRuntimeInitialized", () => {
  beforeEach(() => {
    resetCliRuntimeInitializationForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
    resetCliRuntimeInitializationForTests();
  });

  it("installs the blessed textbox guard once", async () => {
    const importBlessed = vi.fn(async () => ({
      default: { screen: true } as never,
    }));
    const installBlessedTextboxGuard = vi.fn(() => {});

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
