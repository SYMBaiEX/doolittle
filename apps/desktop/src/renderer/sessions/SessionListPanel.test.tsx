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

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const sessions = Array.from({ length: 55 }, (_, index) => ({
  endedAt: `2026-08-12T10:${String(index).padStart(2, "0")}:00Z`,
  messageCount: index + 1,
  participants: [],
  preview: [`Preview ${index}`],
  sessionId: `session-${index}`,
  title: `Session ${index}`,
}));

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
    expect(
      container.querySelectorAll('[data-session-row="true"]'),
    ).toHaveLength(1);
  });

  it("progressively reveals a large local session archive", () => {
    useApiResourceMock.mockReturnValue({
      data: null,
      error: "",
      loading: false,
      reload: vi.fn(),
    });

    act(() => {
      root.render(
        <SessionListPanel
          active
          onSelect={vi.fn()}
          selectedId="session-0"
          sessions={sessions}
        />,
      );
    });

    expect(
      container.querySelectorAll('[data-session-row="true"]'),
    ).toHaveLength(20);
    expect(container.textContent).toContain("Showing 20 of 55");

    let showMore = container.querySelector<HTMLButtonElement>(
      '[data-session-list-footer="true"] button',
    );
    act(() => showMore?.click());
    expect(
      container.querySelectorAll('[data-session-row="true"]'),
    ).toHaveLength(40);
    expect(container.textContent).toContain("Showing 40 of 55");

    showMore = container.querySelector<HTMLButtonElement>(
      '[data-session-list-footer="true"] button',
    );
    expect(showMore?.textContent).toContain("Show 15 more");
    act(() => showMore?.click());
    expect(
      container.querySelectorAll('[data-session-row="true"]'),
    ).toHaveLength(55);
    expect(container.textContent).not.toContain("Showing 40 of 55");
  });

  it("keeps a selected session outside the first page available", () => {
    useApiResourceMock.mockReturnValue({
      data: null,
      error: "",
      loading: false,
      reload: vi.fn(),
    });

    act(() => {
      root.render(
        <SessionListPanel
          active
          onSelect={vi.fn()}
          selectedId="session-42"
          sessions={sessions}
        />,
      );
    });

    expect(
      container.querySelectorAll('[data-session-row="true"]'),
    ).toHaveLength(43);
    expect(container.textContent).toContain("Session 42");
    expect(container.textContent).toContain("Showing 43 of 55");
  });

  it("keeps local paths out of session list summaries", () => {
    useApiResourceMock.mockReturnValue({
      data: null,
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
          sessions={[
            {
              messageCount: 1,
              participants: ["user"],
              preview: ["Read /Users/symbiex/dev/test/src/app/page.tsx"],
              sessionId: "resource-session",
              title: "",
            },
          ]}
        />,
      );
    });
    const row = container.querySelector('[data-session-row="true"]');
    expect(row?.textContent).toContain("page.tsx");
    expect(row?.textContent).not.toContain("/Users/");
  });
});
