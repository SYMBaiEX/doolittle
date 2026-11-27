// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock(
  "../../apps/desktop/src/renderer/eliza-client",
  async (importActual) => ({
    ...(await importActual<Record<string, unknown>>()),
    desktopRequest: vi.fn(),
  }),
);

const { AnalyticsPage } = await import(
  "../../apps/desktop/src/renderer/analytics/AnalyticsPage"
);
const { desktopRequest } = await import(
  "../../apps/desktop/src/renderer/eliza-client"
);
const { desktopQueryClient } = await import(
  "../../apps/desktop/src/renderer/lib"
);

const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let previousActEnvironment: boolean | undefined;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  previousActEnvironment = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  desktopQueryClient.clear();
  vi.mocked(desktopRequest).mockReset();
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

it("offers conversation creation from the canonical empty analytics hero", async () => {
  vi.mocked(desktopRequest).mockResolvedValue({
    totals: {},
    recentSessions: [],
    dailyActivity: [],
  });
  const onNewConversation = vi.fn();
  await act(async () => {
    root.render(<AnalyticsPage active onNewConversation={onNewConversation} />);
  });
  // The query resolves asynchronously after the first render flush.
  await vi.waitFor(() =>
    expect(container.querySelector("[data-analytics-empty]")).not.toBeNull(),
  );

  const landing = container.querySelector<HTMLElement>(
    "[data-analytics-empty]",
  );
  const surface = landing?.querySelector(".dl-state-surface");
  expect(surface?.getAttribute("data-kind")).toBe("empty");
  expect(surface?.getAttribute("data-variant")).toBe("hero");
  expect(surface?.querySelector(".dl-state-title")?.textContent).toBe(
    "No local activity yet",
  );
  const action = surface?.querySelector<HTMLButtonElement>(
    ".dl-state-action button",
  );
  expect(action?.textContent).toContain("Start conversation");
  act(() => action?.click());
  expect(onNewConversation).toHaveBeenCalledOnce();
});
