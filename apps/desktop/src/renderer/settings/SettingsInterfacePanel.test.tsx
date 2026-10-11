// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UiInterfaceState } from "../../shared/ui-interface";
import { SettingsInterfacePanel } from "./SettingsInterfacePanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const installed: UiInterfaceState = {
  mode: "default",
  safeMode: false,
  installed: [
    {
      identity: {
        pluginId: "example",
        pluginVersion: "1.0.0",
        digest: "verified-digest",
      },
      name: "Example",
      trustTier: "community-static",
      requestedCapabilities: ["conversation.read", "message.send"],
      contributions: { workspaces: [], panels: [] },
    },
  ],
};

describe("SettingsInterfacePanel access and recovery", () => {
  let container: HTMLDivElement;
  let root: Root;
  let listener: ((state: UiInterfaceState) => void) | undefined;
  const bridge = {
    getState: vi.fn(),
    getSnapshot: vi.fn(),
    onState: vi.fn((next: (state: UiInterfaceState) => void) => {
      listener = next;
      return () => undefined;
    }),
    activate: vi.fn(),
    restore: vi.fn(),
    install: vi.fn(),
    revoke: vi.fn(),
  };

  const button = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (entry) => entry.textContent === label,
    );

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    vi.clearAllMocks();
    listener = undefined;
    bridge.getState.mockResolvedValue(installed);
    bridge.getSnapshot.mockResolvedValue({
      conversations: [
        { botId: "lead", sessionId: "session", title: "My conversation" },
      ],
    });
    bridge.activate.mockResolvedValue(installed);
    bridge.install.mockResolvedValue(installed);
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: { ui: bridge },
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("recovers a failed initial native read without pretending no interfaces are installed", async () => {
    bridge.getState.mockRejectedValueOnce(new Error("offline"));
    await act(async () => root.render(<SettingsInterfacePanel />));
    expect(container.textContent).toContain(
      "Interface settings could not be loaded",
    );
    expect(container.textContent).not.toContain(
      "No optional interfaces installed",
    );
    await act(async () => button("Retry interface settings")?.click());
    expect(container.textContent).toContain("Example");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("ignores a stale initial read failure after authoritative host state arrives", async () => {
    let reject: ((error: Error) => void) | undefined;
    bridge.getState.mockImplementationOnce(
      () =>
        new Promise<UiInterfaceState>((_, fail) => {
          reject = fail;
        }),
    );
    await act(async () => root.render(<SettingsInterfacePanel />));
    await act(async () => listener?.(installed));
    await act(async () => reject?.(new Error("Old read failed")));
    expect(container.textContent).toContain("Example");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain(
      "Interface settings could not be loaded",
    );
  });

  it("clears only the initial-read error when the host subscription recovers", async () => {
    bridge.getState.mockRejectedValueOnce(new Error("Read unavailable"));
    await act(async () => root.render(<SettingsInterfacePanel />));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => listener?.(installed));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Example");
  });

  it("preserves the permission explanation and blocks approval after ownership loading fails", async () => {
    bridge.getSnapshot.mockRejectedValueOnce(new Error("no ownership"));
    await act(async () => root.render(<SettingsInterfacePanel />));
    await act(async () => button("Use interface")?.click());
    expect(document.activeElement).toBe(container.querySelector("form h3"));
    expect(container.textContent).toContain(
      "Conversations could not be loaded",
    );
    expect(container.textContent).not.toContain("Create a conversation first");
    expect(button("Review native approval")?.disabled).toBe(true);
    expect(
      container.querySelector("form")?.getAttribute("aria-describedby"),
    ).toBeTruthy();
    await act(async () => button("Retry conversation access")?.click());
    expect(container.textContent).toContain("My conversation");
    act(() => {
      for (const input of container.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]',
      ))
        input.click();
    });
    await act(async () => button("Review native approval")?.click());
    expect(bridge.activate).toHaveBeenCalledWith({
      identity: installed.installed[0]?.identity,
      capabilities: ["conversation.read", "message.send"],
      targets: [{ botId: "lead", sessionId: "session" }],
    });
    expect(container.querySelector("form")).toBeNull();
    expect(document.activeElement).toBe(button("Use interface"));
  });

  it("invalidates an open permission proposal when safe mode begins during the snapshot read", async () => {
    let resolve: ((value: unknown) => void) | undefined;
    bridge.getSnapshot.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await act(async () => root.render(<SettingsInterfacePanel />));
    await act(async () => button("Use interface")?.click());
    expect(container.textContent).toContain("Loading owned conversations");
    await act(async () => listener?.({ ...installed, safeMode: true }));
    await act(async () =>
      resolve?.({
        conversations: [
          { botId: "lead", sessionId: "session", title: "Stale conversation" },
        ],
      }),
    );
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).not.toContain("Stale conversation");
    expect(button("Use interface")?.disabled).toBe(true);
    expect(bridge.activate).not.toHaveBeenCalled();
  });

  it("admits only one native install operation for rapid double activation", async () => {
    let resolve: ((value: UiInterfaceState) => void) | undefined;
    bridge.install.mockImplementationOnce(
      () =>
        new Promise<UiInterfaceState>((done) => {
          resolve = done;
        }),
    );
    await act(async () => root.render(<SettingsInterfacePanel />));
    await act(async () => {
      button("Install local interface")?.click();
      button("Install local interface")?.click();
    });
    expect(bridge.install).toHaveBeenCalledOnce();
    await act(async () => resolve?.(installed));
    expect(button("Install local interface")?.disabled).toBe(false);
  });
});
