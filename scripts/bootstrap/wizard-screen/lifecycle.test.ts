import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapWizardContext } from "../bootstrap-context";

describe("bootstrap wizard-screen lifecycle", () => {
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

  it("wires wizard-screen aborts back into the bootstrap context", async () => {
    const createWizardScreen = vi.fn((options: { onAbort?: () => void }) => ({
      options,
    }));
    vi.doMock("./surface", () => ({
      createWizardScreen,
    }));

    const { initializeWizardScreen } = await import("./lifecycle");

    let currentScreen: unknown = null;
    const abortBootstrap = vi.fn(() => {});
    const context = {
      formatKeyLabel: (label: string) => label,
      abortBootstrap,
      getWizardScreen: () => currentScreen as never,
      setWizardScreen: (screen: unknown) => {
        currentScreen = screen;
      },
    } as unknown as BootstrapWizardContext;

    initializeWizardScreen(context);

    expect(createWizardScreen).toHaveBeenCalledTimes(1);
    const [[{ onAbort }]] = createWizardScreen.mock.calls;
    onAbort?.();
    expect(abortBootstrap).toHaveBeenCalledTimes(1);
  });

  it("suspends the active screen and clears it from context", async () => {
    const { suspendWizardScreen } = await import("./lifecycle");

    const snapshot = {
      title: "Awakening",
      subtitle: "",
      currentSection: "Mind",
      currentDetail: "",
      logLines: [],
    };
    const destroy = vi.fn(() => {});
    let currentScreen: unknown = {
      snapshot: () => snapshot,
      destroy,
    };
    const context = {
      getWizardScreen: () => currentScreen as never,
      setWizardScreen: (screen: unknown) => {
        currentScreen = screen;
      },
    } as unknown as BootstrapWizardContext;

    const result = suspendWizardScreen(context);

    expect(result).toEqual(snapshot);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(currentScreen).toBeNull();
  });
});
