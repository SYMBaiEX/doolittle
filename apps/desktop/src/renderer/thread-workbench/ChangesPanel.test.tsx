// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChangesPanel } from "./ChangesAndTerminalPanels";
import type { WorkbenchController } from "./models";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const resource = (data: unknown = null) => ({
  data,
  error: "",
  loading: false,
  reload: vi.fn(),
});
function controller(isRepository?: boolean) {
  return {
    repositorySummary:
      isRepository === undefined ? undefined : { isRepository },
    summary: resource(),
    branches: resource(),
    changeEntries: [],
    conflicts: resource(),
    remotes: resource(),
    stashes: resource(),
    worktrees: resource(),
    refreshGit: vi.fn(),
    checkpoints: resource({ support: { supported: true }, checkpoints: [] }),
    checkpointBusy: false,
    createCheckpoint: vi.fn(),
    checkpointMessage: "",
    restoreCheckpoint: vi.fn(),
    changes: resource({ changes: [] }),
    currentChange: "",
    patch: resource(),
    setSelectedChange: vi.fn(),
    insert: vi.fn(),
  };
}

describe("Context Changes repository availability", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const render = (value: ReturnType<typeof controller>) =>
    act(() =>
      root.render(
        <ChangesPanel controller={value as unknown as WorkbenchController} />,
      ),
    );

  it("does not offer Git writes or call a non-repository workspace clean, and supports refresh recovery", () => {
    const value = controller(false);
    render(value);
    expect(container.textContent).toContain("No Git repository");
    expect(container.textContent).toContain("workspace selector");
    expect(container.textContent).not.toContain("Working tree is clean");
    expect(container.querySelector('[aria-label="Git controls"]')).toBeNull();
    expect(container.querySelector("[data-git-commit-form]")).toBeNull();
    expect(
      container.querySelector('[data-thread-workbench="checkpoints"]'),
    ).toBeNull();
    const refresh = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Refresh repository",
    );
    act(() => refresh?.click());
    expect(value.refreshGit).toHaveBeenCalledOnce();
  });

  it("does not enable stale Git controls while repository status loads or fails", () => {
    const value = controller(true);
    value.summary.loading = true;
    render(value);
    expect(container.textContent).toContain("Checking Git repository…");
    expect(container.textContent).not.toContain("Working tree is clean");
    expect(container.querySelector('[aria-label="Git controls"]')).toBeNull();
    value.summary.loading = false;
    value.summary.error = "Repository status failed";
    render(value);
    expect(container.textContent).toContain("Repository status failed");
    expect(container.querySelector("[data-git-commit-form]")).toBeNull();
  });

  it("distinguishes absent status from a confirmed non-repository response", () => {
    render(controller());
    expect(container.textContent).toContain("Repository status unavailable");
    expect(container.textContent).not.toContain("No Git repository");
    expect(container.textContent).not.toContain("Working tree is clean");
  });

  it("restores real controls and clean status after a successful repository selection", () => {
    render(controller(false));
    render(controller(true));
    expect(container.textContent).not.toContain("No Git repository");
    expect(container.textContent).toContain("Working tree is clean");
    expect(
      container.querySelector('[aria-label="Git controls"]'),
    ).not.toBeNull();
    expect(container.querySelector("[data-git-commit-form]")).not.toBeNull();
  });
});
