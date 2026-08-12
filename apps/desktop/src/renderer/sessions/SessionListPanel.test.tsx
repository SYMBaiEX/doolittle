// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useApiResourceMock } = vi.hoisted(() => ({
  useApiResourceMock: vi.fn(),
}));

vi.mock("../lib", async () => {
  const actual = await vi.importActual<typeof import("../lib")>("../lib");
  return {
    ...actual,
    useApiResource: useApiResourceMock,
    useDebouncedValue: (value: string) => value,
  };
});

import { SessionListPanel } from "./SessionListPanel";

describe("SessionListPanel", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    useApiResourceMock.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("selects a persisted full-text hit that is outside the loaded summary list", () => {
    useApiResourceMock.mockReturnValue({
      data: {
        hits: [
          {
            createdAt: "2026-08-12T10:00:00Z",
            sessionId: "persisted-session",
            text: "A result from the durable transcript",
          },
        ],
      },
      error: "",
      loading: false,
      reload: vi.fn(),
    });
    const onQueryChange = vi.fn();
    const onSelect = vi.fn();

    act(() => {
      root.render(
        <SessionListPanel
          active
          onQueryChange={onQueryChange}
          onSelect={onSelect}
          projectId="project-1"
          selectedId=""
          sessions={[]}
        />,
      );
    });
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    act(() => {
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "durable");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onQueryChange).toHaveBeenCalledWith("durable");
    const result = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("durable transcript"),
    );
    expect(result).toBeDefined();
    act(() => result?.click());
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "persisted-session" }),
    );
  });

  it("deduplicates multiple transcript hits from the same session", () => {
    useApiResourceMock.mockReturnValue({
      data: {
        hits: [
          {
            createdAt: "2026-08-12T10:00:00Z",
            sessionId: "same",
            text: "First",
          },
          {
            createdAt: "2026-08-12T10:01:00Z",
            sessionId: "same",
            text: "Second",
          },
        ],
      },
      error: "",
      loading: false,
      reload: vi.fn(),
    });

    act(() => {
      root.render(
        <SessionListPanel
          active
          onSelect={vi.fn()}
          selectedId=""
          sessions={[]}
        />,
      );
    });
    const input = container.querySelector("input");
    act(() => {
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "first");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll(".row-card")).toHaveLength(1);
  });
});
