// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationRunHistory } from "./AutomationRunHistory";
import { AutomationWorkspace } from "./AutomationWorkspace";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("automation context actions", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  async function choose(target: Element, label: string) {
    await act(async () =>
      target.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    const item = Array.from(
      document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((entry) => entry.textContent === label);
    if (!item) throw new Error(`Missing action: ${label}`);
    await act(async () => item.click());
  }
  it("binds run/pause to the chosen definition and keeps deletion confirmed", async () => {
    const onAction = vi.fn(async () => true);
    await act(async () =>
      root.render(
        <AutomationWorkspace
          builderOpen={false}
          busy=""
          jobs={[{ id: "job-a", name: "Morning brief", status: "active" }]}
          jobsError=""
          jobsLoading={false}
          onAction={onAction}
          onCreate={vi.fn()}
          onFeedback={vi.fn()}
          onReloadJobs={vi.fn()}
          onReloadRuns={vi.fn()}
          onRunsOpenChange={vi.fn()}
          onSelectRun={vi.fn()}
          runs={[]}
          runsError=""
          runsLoading={false}
          runsOpen={false}
        />,
      ),
    );
    const card = container.querySelector("article");
    if (!card) throw new Error("Missing automation");
    await choose(card, "Run now");
    expect(onAction).toHaveBeenCalledExactlyOnceWith("job-a", "trigger");
    await choose(card, "Pause");
    expect(onAction).toHaveBeenLastCalledWith("job-a", "pause");
    await choose(card, "Delete…");
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Delete Morning brief?");
    const confirm = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Confirm delete");
    await act(async () => confirm?.click());
    expect(onAction).toHaveBeenLastCalledWith("job-a", "delete");
  });
  it("opens only the selected durable receipt through its existing selection handler", async () => {
    const onSelectRun = vi.fn();
    await act(async () =>
      root.render(
        <AutomationRunHistory
          onOpenChange={vi.fn()}
          onReload={vi.fn()}
          onSelectRun={onSelectRun}
          open
          runs={[{ id: "receipt-a", jobName: "Brief", status: "completed" }]}
          runsError=""
          runsLoading={false}
        />,
      ),
    );
    const row = container.querySelector("li button");
    if (!row) throw new Error("Missing receipt");
    await choose(row, "Inspect receipt");
    expect(onSelectRun).toHaveBeenCalledExactlyOnceWith("receipt-a");
  });
});
