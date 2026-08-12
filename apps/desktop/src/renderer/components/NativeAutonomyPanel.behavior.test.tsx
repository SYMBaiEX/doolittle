// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { desktopRequestMock } = vi.hoisted(() => ({
  desktopRequestMock: vi.fn(),
}));

vi.mock("../lib", async () => {
  const actual = await vi.importActual<typeof import("../lib")>("../lib");
  return { ...actual, desktopRequest: desktopRequestMock };
});

import { NativeAutonomyPanel } from "./NativeAutonomyPanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("NativeAutonomyPanel actions", () => {
  let container: HTMLDivElement;
  let root: Root;
  const reload = vi.fn();

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    reload.mockReset();
    desktopRequestMock.mockReset();
    desktopRequestMock.mockResolvedValue({ message: "Autonomy updated." });

    act(() =>
      root.render(
        <NativeAutonomyPanel
          autonomy={{
            data: {
              data: {
                characterName: "Doolittle",
                enabled: false,
                interval: 30_000,
                running: false,
              },
            },
            error: "",
            loading: false,
            reload,
          }}
        />,
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("updates cadence through the official interval route", async () => {
    const cadence = container.querySelector<HTMLSelectElement>(
      '[aria-label="Native autonomy reasoning cadence"]',
    );

    await act(async () => {
      if (!cadence) throw new Error("cadence control missing");
      cadence.value = "60000";
      cadence.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(desktopRequestMock).toHaveBeenCalledWith(
      "/autonomy/interval",
      "POST",
      { interval: 60_000 },
    );
    expect(reload).toHaveBeenCalledOnce();
  });

  it("enables native autonomy and reports completion", async () => {
    const enable = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Enable native autonomy"),
    );

    await act(async () => {
      enable?.click();
      await Promise.resolve();
    });

    expect(desktopRequestMock).toHaveBeenCalledWith(
      "/autonomy/enable",
      "POST",
      {},
    );
    expect(container.textContent).toContain("Autonomy updated.");
    expect(reload).toHaveBeenCalledOnce();
  });
});
