import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { BootstrapWizardContext } from "../bootstrap-context";

describe("bootstrap provider shell helper", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("suspends and restores the wizard screen around interactive commands", async () => {
    const snapshot = { title: "Awakening" };
    const spawnSync = mock(() => ({ status: 0 }));
    const suspendWizardScreen = mock(() => snapshot);
    const restoreWizardScreen = mock(() => {});

    mock.module("node:child_process", () => ({
      spawnSync,
    }));
    mock.module("../wizard-screen/lifecycle", () => ({
      suspendWizardScreen,
      restoreWizardScreen,
    }));

    const { runInteractiveCommand } = await import(
      `./shell?shell-tests=${Date.now()}-${Math.random()}`
    );

    const context = {
      section: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
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
