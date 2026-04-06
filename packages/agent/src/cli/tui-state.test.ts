import { describe, expect, it } from "bun:test";
import { createTuiState } from "@/cli/tui-state";

describe("createTuiState", () => {
  it("initializes the shared tui state with stable defaults", () => {
    const { state } = createTuiState({ initialFocusIndex: 4 });

    expect(state.screenDestroyed).toBe(false);
    expect(state.busy).toBe(false);
    expect(state.queueDepth).toBe(0);
    expect(state.opsCollapsed).toBe(true);
    expect(state.controlDeckMode).toBe("assist");
    expect(state.focusIndex).toBe(4);
    expect(state.paletteOpen).toBe(false);
    expect(state.composerOpen).toBe(false);
    expect(state.forceExitTimer).toBeNull();
    expect(state.deferredForeignRefreshTimer).toBeNull();
  });

  it("keeps lifecycle and queue adapters coherent through the shared store", () => {
    const { state, lifecycleState, queueState } = createTuiState({
      initialFocusIndex: 1,
    });
    const controller = new AbortController();

    lifecycleState.busy = true;
    lifecycleState.activeTurnAbortController = controller;
    lifecycleState.screenDestroyed = true;
    queueState.queueDepth = 3;
    queueState.requestedExitCode = 7;
    queueState.exitAfterTurnCancellation = true;

    expect(state.busy).toBe(true);
    expect(queueState.busy).toBe(true);
    expect(state.activeTurnAbortController).toBe(controller);
    expect(queueState.activeTurnAbortController).toBe(controller);
    expect(state.queueDepth).toBe(3);
    expect(lifecycleState.screenDestroyed).toBe(true);
    expect(state.requestedExitCode).toBe(7);
    expect(lifecycleState.requestedExitCode).toBe(7);
    expect(state.exitAfterTurnCancellation).toBe(true);
  });

  it("keeps overlay adapter mutations aligned with the shared store", () => {
    const { state, overlayState } = createTuiState({ initialFocusIndex: 0 });

    overlayState.paletteOpen = true;
    overlayState.composerOpen = true;
    overlayState.paletteSelectionIndex = 6;

    expect(state.paletteOpen).toBe(true);
    expect(state.composerOpen).toBe(true);
    expect(state.paletteSelectionIndex).toBe(6);
  });
});
