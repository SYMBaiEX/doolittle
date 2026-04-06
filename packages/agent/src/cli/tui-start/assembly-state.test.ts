import { describe, expect, it } from "bun:test";
import { createTuiStartAssemblyState } from "./assembly-state";

describe("createTuiStartAssemblyState", () => {
  it("starts with safe no-op callbacks and forwards later setters", async () => {
    const state = createTuiStartAssemblyState();

    await expect(state.refreshPanels()).resolves.toBeUndefined();
    expect(() => state.scheduleRefreshPanels(25)).not.toThrow();
    expect(() => state.updateFooterHint()).not.toThrow();
    expect(() => state.queueCommand("/jobs")).not.toThrow();

    let refreshCalls = 0;
    let scheduleDelay = -1;
    let footerCalls = 0;
    const commands: string[] = [];

    state.setRefreshPanels(async () => {
      refreshCalls += 1;
    });
    state.setScheduleRefreshPanels((delayMs = 120) => {
      scheduleDelay = delayMs;
    });
    state.setUpdateFooterHint(() => {
      footerCalls += 1;
    });
    state.setQueueCommand((line) => {
      commands.push(line);
    });

    await state.refreshPanels();
    state.scheduleRefreshPanels(42);
    state.updateFooterHint({ render: false });
    state.queueCommand("/sessions-list");

    expect(refreshCalls).toBe(1);
    expect(scheduleDelay).toBe(42);
    expect(footerCalls).toBe(1);
    expect(commands).toEqual(["/sessions-list"]);
  });
});
