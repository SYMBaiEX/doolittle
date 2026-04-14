import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { BootstrapWizardContext } from "../bootstrap-context";

describe("bootstrap wizard-screen lifecycle", () => {
  beforeEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  afterEach(() => {
    mock.restore();
    mock.clearAllMocks();
  });

  it("wires wizard-screen aborts back into the bootstrap context", async () => {
    const createWizardScreen = mock((options: { onAbort?: () => void }) => ({
      options,
    }));
    mock.module("./surface", () => ({
      createWizardScreen,
    }));

    const { initializeWizardScreen } = await import(
      `./lifecycle?lifecycle-tests=${Date.now()}-${Math.random()}`
    );

    let currentScreen: unknown = null;
    const abortBootstrap = mock(() => {});
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
    const { suspendWizardScreen } = await import(
      `./lifecycle?lifecycle-suspend-tests=${Date.now()}-${Math.random()}`
    );

    const snapshot = {
      title: "Awakening",
      subtitle: "",
      currentSection: "Mind",
      currentDetail: "",
      logLines: [],
    };
    const destroy = mock(() => {});
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
