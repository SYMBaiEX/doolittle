import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapWizardContext } from "../bootstrap-context";

describe("bootstrap provider shell helper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("suspends and restores the wizard screen around interactive commands", async () => {
    const snapshot = { title: "Awakening" };
    const spawnSync = vi.fn(() => ({ status: 0 }));
    const suspendWizardScreen = vi.fn(() => snapshot);
    const restoreWizardScreen = vi.fn(() => {});

    vi.doMock("node:child_process", () => ({
      spawnSync,
    }));
    vi.doMock("../wizard-screen/lifecycle", () => ({
      suspendWizardScreen,
      restoreWizardScreen,
    }));

    const { runInteractiveCommand } = await import("./shell");

    const context = {
      section: vi.fn(() => {}),
      info: vi.fn(() => {}),
      warn: vi.fn(() => {}),
    } as unknown as BootstrapWizardContext;

    const result = runInteractiveCommand(
      context,
      "codex",
      ["login"],
      "Codex login",
    );

    expect(result).toBe(true);
    expect(suspendWizardScreen).toHaveBeenCalledWith(context);
    expect(restoreWizardScreen).toHaveBeenCalledWith(context, snapshot);
    expect(spawnSync).toHaveBeenCalledWith("codex", ["login"], {
      env: process.env,
      stdio: "inherit",
    });
  });
});
