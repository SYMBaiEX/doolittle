// @vitest-environment jsdom

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ReviewCommentsPanel,
  type ReviewCommentsPanelProps,
} from "./ReviewCommentsPanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function props(
  overrides: Partial<ReviewCommentsPanelProps> = {},
): ReviewCommentsPanelProps {
  return {
    activeCommentTarget: null,
    commentDraft: "",
    commentEditorRef: createRef<HTMLTextAreaElement>(),
    comments: [],
    editingCommentId: "",
    onCancel: vi.fn(),
    onDelete: vi.fn(),
    onDraftChange: vi.fn(),
    onSave: vi.fn(),
    onSendFeedback: vi.fn(),
    onStartComment: vi.fn(),
    onToggleResolved: vi.fn(),
    openCommentCount: 0,
    path: "src/example.ts",
    platform: "darwin",
    ...overrides,
  };
}

describe("ReviewCommentsPanel", () => {
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

  it("collapses an empty notes surface and keeps note creation available", async () => {
    const onStartComment = vi.fn();
    act(() =>
      root.render(<ReviewCommentsPanel {...props({ onStartComment })} />),
    );

    const disclosure = container.querySelector("details");
    const summary = container.querySelector("summary");
    expect(disclosure?.open).toBe(false);
    expect(disclosure?.getAttribute("aria-label")).toBe(
      "Review comments for src/example.ts",
    );
    expect(container.querySelector(".review-feedback__body")).toBeNull();

    await act(async () => {
      summary?.click();
      if (disclosure) {
        disclosure.open = true;
        disclosure.dispatchEvent(new Event("toggle", { bubbles: true }));
      }
    });
    expect(disclosure?.open).toBe(true);
    const fileNote = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "+ File note",
    );
    act(() => fileNote?.click());
    expect(onStartComment).toHaveBeenCalledWith("src/example.ts");
  });

  it("opens automatically when a diff-line note starts", () => {
    act(() => root.render(<ReviewCommentsPanel {...props()} />));
    expect(container.querySelector("details")?.open).toBe(false);

    act(() =>
      root.render(
        <ReviewCommentsPanel
          {...props({
            activeCommentTarget: {
              anchor: { line: 12, side: "new", preview: "const ready = true" },
              path: "src/example.ts",
            },
          })}
        />,
      ),
    );

    expect(container.querySelector("details")?.open).toBe(true);
    expect(container.querySelector("textarea")).not.toBeNull();
    expect(container.textContent).toContain("Comment on + line 12");
  });
});
