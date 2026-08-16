// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SandboxControlPanel } from "./SandboxControlPanel";

const { desktopRequestMock } = vi.hoisted(() => ({
  desktopRequestMock: vi.fn(),
}));

vi.mock("../eliza-client", () => ({ desktopRequest: desktopRequestMock }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const snapshot = {
  control: {
    available: true,
    activeSandboxId: "sandbox-python-1",
    supportsExecution: true,
    detail: "",
  },
  sandboxes: [
    {
      id: "sandbox-python-1",
      template: "python",
      path: "/tmp/sandbox-python-1",
      createdAt: "2026-08-15",
    },
  ],
};

describe("SandboxControlPanel kill confirmation", () => {
  let container: HTMLDivElement;
  let root: Root;

  const button = (label: string) =>
    [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent === label,
    ) as HTMLButtonElement | undefined;

  const killRequests = () =>
    desktopRequestMock.mock.calls.filter(([path]) => path === "/e2b/kill");

  beforeEach(async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    desktopRequestMock.mockReset();
    desktopRequestMock.mockResolvedValue(snapshot);
    await act(async () => {
      root.render(<SandboxControlPanel active />);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("cancels without sending a destructive request", async () => {
    await act(async () => {
      button("Kill selected")?.click();
    });

    expect(container.textContent).toContain("Kill sandbox sandbox-python-1?");
    expect(container.textContent).toContain(
      "stops and removes the local environment for sandbox sandbox-python-1",
    );
    expect(document.activeElement).toBe(button("Cancel"));

    await act(async () => {
      button("Cancel")?.click();
    });

    expect(killRequests()).toHaveLength(0);
    expect(container.textContent).not.toContain("Confirm kill");
  });

  it("sends one kill request after confirmation and refreshes the inventory", async () => {
    await act(async () => {
      button("Kill selected")?.click();
    });
    await act(async () => {
      button("Confirm kill")?.click();
    });

    expect(killRequests()).toEqual([
      ["/e2b/kill", "POST", { id: "sandbox-python-1" }],
    ]);
    expect(
      desktopRequestMock.mock.calls.filter(
        ([path]) => path === "/e2b/sandboxes",
      ),
    ).toHaveLength(2);
  });

  it("prevents duplicate confirmation while the kill request is pending", async () => {
    let resolveKill: (() => void) | undefined;
    desktopRequestMock.mockImplementation((path: string) => {
      if (path === "/e2b/kill") {
        return new Promise<void>((resolve) => {
          resolveKill = resolve;
        });
      }
      return Promise.resolve(snapshot);
    });

    await act(async () => {
      button("Kill selected")?.click();
    });
    await act(async () => {
      button("Confirm kill")?.click();
      button("Confirm kill")?.click();
      await Promise.resolve();
    });

    expect(killRequests()).toHaveLength(1);

    await act(async () => {
      resolveKill?.();
    });

    expect(
      desktopRequestMock.mock.calls.filter(
        ([path]) => path === "/e2b/sandboxes",
      ),
    ).toHaveLength(2);
  });

  it("dismisses an unconfirmed kill when the panel becomes inactive", async () => {
    await act(async () => {
      button("Kill selected")?.click();
      root.render(<SandboxControlPanel active={false} />);
    });

    expect(container.textContent).not.toContain("Confirm kill");
    expect(killRequests()).toHaveLength(0);
  });
});
