import { describe, expect, it } from "bun:test";
import { installTuiPanels } from "@/cli/tui-panels";
import { createNoopLogger } from "@/logging/logger";

function createPanel() {
  let content = "";
  return {
    hidden: false,
    setContent(next: string) {
      content = next;
    },
    readContent() {
      return content;
    },
  };
}

async function waitForTimers(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 5));
  await new Promise((resolve) => setTimeout(resolve, 5));
}

describe("installTuiPanels", () => {
  it("refreshes all panels and footer content", async () => {
    const sidebar = createPanel();
    const transportBox = createPanel();
    const executionBox = createPanel();
    const assistBox = createPanel();
    const footer = createPanel();
    let renderControlDeckCount = 0;
    let renderCount = 0;

    const panels = installTuiPanels({
      logger: createNoopLogger(),
      screen: {
        width: 120,
        height: 40,
        renders: 0,
        render() {
          renderCount += 1;
        },
      } as never,
      sidebar,
      transportBox,
      executionBox,
      assistBox,
      footer,
      renderStatusRail: () => "status rail",
      renderTransportPanel: async () => "transport panel",
      renderExecutionPanel: async () => "execution panel",
      renderControlDeck: async () => {
        renderControlDeckCount += 1;
        assistBox.setContent("control deck");
      },
      renderFooterContent: () => "footer state",
      appendActivity: () => {},
    });

    await panels.refreshPanels();

    expect(sidebar.readContent()).toBe("status rail");
    expect(transportBox.readContent()).toBe("transport panel");
    expect(executionBox.readContent()).toBe("execution panel");
    expect(assistBox.readContent()).toBe("control deck");
    expect(footer.readContent()).toBe("footer state");
    expect(renderControlDeckCount).toBe(1);
    expect(renderCount).toBe(1);
  });

  it("coalesces scheduled refreshes and dedupes repeated panel failures", async () => {
    const sidebar = createPanel();
    const transportBox = createPanel();
    const executionBox = createPanel();
    const assistBox = createPanel();
    const footer = createPanel();
    const activities: string[] = [];
    let statusRenders = 0;

    const panels = installTuiPanels({
      logger: createNoopLogger(),
      screen: {
        width: 120,
        height: 40,
        renders: 0,
        render() {},
      } as never,
      sidebar,
      transportBox,
      executionBox,
      assistBox,
      footer,
      renderStatusRail: () => {
        statusRenders += 1;
        throw new Error("status unavailable");
      },
      renderTransportPanel: async () => "transport panel",
      renderExecutionPanel: async () => "execution panel",
      renderControlDeck: async () => {},
      renderFooterContent: () => "footer state",
      appendActivity: (_kind, message) => {
        activities.push(message);
      },
    });

    panels.scheduleRefreshPanels(0);
    panels.scheduleRefreshPanels(0);
    await waitForTimers();
    await panels.refreshPanels();

    expect(statusRenders).toBe(2);
    expect(activities).toHaveLength(1);
    expect(sidebar.readContent()).toContain("temporarily unavailable");
  });
});
