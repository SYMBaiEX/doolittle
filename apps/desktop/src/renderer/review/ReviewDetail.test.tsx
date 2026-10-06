// @vitest-environment jsdom

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewDetail, type ReviewDetailProps } from "./ReviewDetail";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function props(overrides: Partial<ReviewDetailProps> = {}): ReviewDetailProps {
  return {
    selected: {
      id: "approvals:one",
      kind: "approvals",
      title: "Verify",
      description: "Run tests",
      status: "pending",
      raw: { id: "one" },
    },
    patch: { data: null, loading: false, error: "", reload: vi.fn() },
    selectedPathComments: [],
    activeCommentTarget: null,
    commentDraft: "",
    editingCommentId: "",
    commentEditorRef: createRef(),
    openCommentCount: 0,
    busy: "",
    platform: "darwin",
    onDecision: vi.fn(),
    onOpenWorkspace: vi.fn(),
    onAskDoolittle: vi.fn(),
    onStartComment: vi.fn(),
    onToggleResolved: vi.fn(),
    onDelete: vi.fn(),
    onDraftChange: vi.fn(),
    onCancelComment: vi.fn(),
    onSaveComment: vi.fn(),
    onSendFeedback: vi.fn(),
    ...overrides,
  };
}

describe("Review detail context actions", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  async function openMenu(value: ReviewDetailProps) {
    await act(async () => root.render(<ReviewDetail {...value} />));
    await act(async () =>
      container.querySelector("h2")?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
        }),
      ),
    );
    return [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ];
  }
  it("routes pending decisions through the host and blocks them while busy", async () => {
    const value = props();
    let items = await openMenu(value);
    await act(async () =>
      items.find((item) => item.textContent === "Approve request")?.click(),
    );
    expect(value.onDecision).toHaveBeenCalledExactlyOnceWith("approve");
    items = await openMenu({ ...value, busy: "approve" });
    expect(
      items
        .find((item) => item.textContent === "Deny request")
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    await act(async () =>
      items.find((item) => item.textContent === "Deny request")?.click(),
    );
    expect(value.onDecision).toHaveBeenCalledOnce();
  });
  it("closes a pending decision menu when the selected target changes", async () => {
    const value = props();
    await openMenu(value);
    if (!value.selected) throw new Error("Missing test selection");
    const selected = value.selected;
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    await act(async () =>
      root.render(
        <ReviewDetail
          {...value}
          selected={{
            ...selected,
            id: "approvals:two",
            title: "Other target",
          }}
        />,
      ),
    );
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(value.onDecision).not.toHaveBeenCalled();
  });
  it("never offers decisions for already completed requests", async () => {
    const value = props();
    if (!value.selected) throw new Error("Missing test selection");
    const items = await openMenu({
      ...value,
      selected: { ...value.selected, status: "approved" },
    });
    expect(
      items.some((item) => /approve|deny/i.test(item.textContent ?? "")),
    ).toBe(false);
  });

  it.each(["other-workspace", "other-revision", "other-owner"])(
    "closes same-id menus when review context changes to %s",
    async (nextScope) => {
      const value = props({
        contextScope: "original-workspace/revision/owner",
      });
      await openMenu(value);
      expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
      await act(async () =>
        root.render(<ReviewDetail {...value} contextScope={nextScope} />),
      );
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
      expect(value.onDecision).not.toHaveBeenCalled();
    },
  );
});
