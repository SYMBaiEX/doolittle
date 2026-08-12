// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../../shared/contracts";
import { MobileConversationsDialog } from "./MobileConversationsDialog";

const sessions: SessionSummary[] = [
  {
    sessionId: "one",
    title: "First conversation",
    messageCount: 2,
    participants: ["user"],
    preview: [],
  },
  {
    sessionId: "two",
    title: "Second conversation",
    projectId: "project-1",
    messageCount: 4,
    participants: ["user", "assistant"],
    preview: [],
  },
];

describe("MobileConversationsDialog", () => {
  let root: Root;
  let container: HTMLDivElement;
  const onClose = vi.fn();
  const onNewConversation = vi.fn();
  const onSearchChange = vi.fn();
  const onSelect = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
    onNewConversation.mockReset();
    onSearchChange.mockReset();
    onSelect.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <MobileConversationsDialog
          activeProjectName="Doolittle"
          dialogRef={{ current: null }}
          onClose={onClose}
          onNewConversation={onNewConversation}
          onSearchChange={onSearchChange}
          onSelect={onSelect}
          projectLabels={{ "project-1": "Doolittle" }}
          search=""
          selectedId="one"
          sessions={sessions}
        />,
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders sessions, selection state, project labels, and search", () => {
    expect(container.textContent).toContain("First conversation");
    expect(container.textContent).toContain("Doolittle");
    expect(
      container.querySelector('[aria-current="page"]')?.textContent,
    ).toContain("First conversation");
    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search conversations"]',
    );
    act(() => {
      if (!search) return;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(search, "first");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onSearchChange).toHaveBeenCalledWith("first");
  });

  it("forwards selection and close/new-conversation actions", () => {
    const second = Array.from(
      container.querySelectorAll("[data-mobile-conversation]"),
    )[1];
    act(() => (second as HTMLButtonElement).click());
    expect(onSelect).toHaveBeenCalledWith("two");
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() =>
      container.querySelector<HTMLButtonElement>(".new-chat-button")?.click(),
    );
    expect(onNewConversation).toHaveBeenCalledTimes(1);
  });
});
