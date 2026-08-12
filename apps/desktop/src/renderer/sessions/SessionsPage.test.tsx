// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./SessionListPanel", () => ({
  SessionListPanel: () => null,
}));

vi.mock("./SessionDetail", () => ({
  SessionDetail: () => null,
}));

import { SessionsPage } from "./SessionsPage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("SessionsPage", () => {
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

  it("turns the empty archive into a compact actionable landing", () => {
    const onNewConversation = vi.fn();
    act(() => {
      root.render(
        <SessionsPage
          active
          onNewConversation={onNewConversation}
          openChat={vi.fn()}
          refresh={vi.fn()}
          sessions={[]}
        />,
      );
    });

    const landing = container.querySelector(".session-empty-landing");
    expect(landing?.textContent).toContain("No saved conversations");
    const actions = Array.from(landing?.querySelectorAll("button") ?? []);
    expect(actions.map((button) => button.textContent?.trim())).toEqual([
      "New conversation",
      "Import archive",
    ]);
    expect(
      Array.from(container.querySelectorAll("button")).filter(
        (button) => button.textContent?.trim() === "Import archive",
      ),
    ).toHaveLength(1);

    act(() => actions[0]?.click());
    expect(onNewConversation).toHaveBeenCalledTimes(1);

    const archiveInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Choose a Doolittle session archive"]',
    );
    expect(archiveInput).not.toBeNull();
    const clickArchiveInput = vi.spyOn(
      archiveInput as HTMLInputElement,
      "click",
    );
    act(() => actions[1]?.click());
    expect(clickArchiveInput).toHaveBeenCalledTimes(1);
  });
});
