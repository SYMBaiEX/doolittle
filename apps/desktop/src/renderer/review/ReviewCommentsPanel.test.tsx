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
  let backgroundButton: HTMLButtonElement;
  let root: Root;

  beforeEach(() => {
    backgroundButton = document.createElement("button");
    backgroundButton.textContent = "Outside review panel";
    document.body.append(backgroundButton);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    backgroundButton.remove();
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

  it("confirms deletion and restores focus when cancelled", async () => {
    const onDelete = vi.fn();
    const note = {
      id: "note-1",
      path: "src/example.ts",
      body: "Please keep this guard.",
      status: "open" as const,
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    };
    act(() =>
      root.render(
        <ReviewCommentsPanel {...props({ comments: [note], onDelete })} />,
      ),
    );
    const deleteButton = container.querySelector(
      'button[aria-label="Delete review note for src/example.ts"]',
    ) as HTMLButtonElement;
    act(() => deleteButton.click());
    expect(
      container.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain("Please keep this guard.");
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    const cancel = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Cancel",
    ) as HTMLButtonElement;
    const confirm = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete note",
    ) as HTMLButtonElement;
    expect(document.activeElement).toBe(cancel);
    expect(backgroundButton.inert).toBe(true);
    expect(backgroundButton.getAttribute("aria-hidden")).toBe("true");
    act(() => confirm.focus());
    act(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" })),
    );
    expect(document.activeElement).toBe(cancel);
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }),
      ),
    );
    expect(document.activeElement).toBe(confirm);
    await act(async () => {
      cancel.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(onDelete).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(deleteButton);
    expect(Boolean(backgroundButton.inert)).toBe(false);
    expect(backgroundButton.hasAttribute("aria-hidden")).toBe(false);
    act(() => deleteButton.click());
    act(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    act(() => deleteButton.click());
    const finalConfirm = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Delete note",
    ) as HTMLButtonElement;
    act(() => finalConfirm.click());
    expect(onDelete).toHaveBeenCalledWith("note-1");
  });

  it("keeps long destructive confirmations reachable on a mobile viewport", () => {
    const note = {
      id: "note-long",
      path: `src/${"nested/".repeat(24)}example.ts`,
      body: "Long review feedback. ".repeat(80),
      status: "open" as const,
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    };
    act(() =>
      root.render(<ReviewCommentsPanel {...props({ comments: [note] })} />),
    );

    const deleteButton = container.querySelector(
      `button[aria-label="Delete review note for ${note.path}"]`,
    ) as HTMLButtonElement;
    act(() => deleteButton.click());

    const dialog = container.querySelector('[role="alertdialog"]');
    const backdrop = dialog?.parentElement;
    expect(backdrop?.className).toContain("overflow-y-auto");
    expect(dialog?.className).toContain("max-h-[calc(100svh-32px)]");
    expect(dialog?.className).toContain("max-[480px]:[&>div]:flex-col-reverse");
    expect(dialog?.className).toContain("max-[480px]:[&_button]:w-full");
  });
});
