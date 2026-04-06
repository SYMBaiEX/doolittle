import { describe, expect, it } from "bun:test";
import { installTuiScreenEvents } from "@/cli/tui-screen-events";

function createEmitter() {
  const handlers = new Map<string, () => void>();
  return {
    on(event: "focus" | "click", handler: () => void) {
      handlers.set(event, handler);
    },
    emit(event: "focus" | "click") {
      handlers.get(event)?.();
    },
  };
}

function createScreen(width = 120, height = 40) {
  const handlers = new Map<string, (value?: unknown) => void>();
  let renderCount = 0;
  return {
    width,
    height,
    on(event: "resize" | "warning", handler: (value?: unknown) => void) {
      handlers.set(event, handler);
    },
    render() {
      renderCount += 1;
    },
    emit(event: "resize" | "warning", value?: unknown) {
      handlers.get(event)?.(value);
    },
    get renderCount() {
      return renderCount;
    },
  };
}

describe("installTuiScreenEvents", () => {
  it("handles resize and warning events", async () => {
    const screen = createScreen(70, 20);
    const activities: string[] = [];
    const refreshCalls: string[] = [];

    installTuiScreenEvents({
      screen,
      minCols: 80,
      minRows: 24,
      appendActivity: (_kind, message) => {
        activities.push(message);
      },
      syncLayout: () => {
        refreshCalls.push("layout");
      },
      scheduleRefreshPanels: (delayMs = 120) => {
        refreshCalls.push(`schedule:${delayMs}`);
      },
      noteWarningFooterHint: () => {
        refreshCalls.push("footer");
      },
      refreshPanels: async () => {
        refreshCalls.push("refresh");
      },
      focusTrackedElements: [],
      textEntryElements: [],
      noteTextEntryActivity: () => {},
      updateFooterHint: () => {},
    });

    screen.emit("resize");
    screen.emit("warning", "careful");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(activities[0]).toContain("Terminal too small");
    expect(activities[1]).toBe("careful");
    expect(screen.renderCount).toBe(1);
    expect(refreshCalls).toContain("footer");
    expect(refreshCalls).toContain("refresh");
  });

  it("tracks focus and click updates for text-entry elements", () => {
    const screen = createScreen();
    const inputBox = createEmitter();
    const response = createEmitter();
    let noteCount = 0;
    let footerCount = 0;

    installTuiScreenEvents({
      screen,
      minCols: 80,
      minRows: 24,
      appendActivity: () => {},
      syncLayout: () => {},
      scheduleRefreshPanels: () => {},
      noteWarningFooterHint: () => {},
      refreshPanels: async () => {},
      focusTrackedElements: [inputBox, response],
      textEntryElements: [inputBox],
      noteTextEntryActivity: () => {
        noteCount += 1;
      },
      updateFooterHint: () => {
        footerCount += 1;
      },
    });

    inputBox.emit("focus");
    response.emit("click");

    expect(noteCount).toBe(1);
    expect(footerCount).toBe(2);
  });
});
