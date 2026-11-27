// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewItem } from "../../apps/desktop/src/renderer/review/models";
import { ReviewDetail } from "../../apps/desktop/src/renderer/review/ReviewDetail";

function approval(status: string): ReviewItem {
  return {
    id: `approval-${status}`,
    kind: "approvals",
    title: "git push origin audit-fixture",
    description: "The automation wants to publish the fixture branch.",
    status,
    timestamp: "2025-11-25T18:58:00Z",
    raw: {
      command: "git push origin audit-fixture",
      reason: "The automation wants to publish the fixture branch.",
      platform: "api",
      sessionKey: "local session",
      createdAt: "2025-11-25T18:58:00Z",
      expiresAt: "2025-11-25T19:58:00Z",
    },
  };
}

function renderDetail(selected: ReviewItem | undefined) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <ReviewDetail
        activeCommentTarget={null}
        busy=""
        commentDraft=""
        commentEditorRef={{ current: null }}
        commentSaveInFlight={false}
        editingCommentId=""
        onAskDoolittle={vi.fn()}
        onCancelComment={vi.fn()}
        onDecision={vi.fn()}
        onDelete={vi.fn()}
        onDraftChange={vi.fn()}
        onOpenWorkspace={vi.fn()}
        onSaveComment={vi.fn()}
        onSendFeedback={vi.fn()}
        onStartComment={vi.fn()}
        onToggleResolved={vi.fn()}
        openCommentCount={0}
        patch={{
          data: null,
          error: "",
          loading: false,
          reload: vi.fn(),
        }}
        platform="darwin"
        selected={selected}
        selectedPathComments={[]}
      />,
    ),
  );
  return { host, root };
}

describe("review detail approval dock", () => {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = environment.IS_REACT_ACT_ENVIRONMENT;

  beforeEach(() => {
    environment.IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    environment.IS_REACT_ACT_ENVIRONMENT = previousAct;
    document.body.innerHTML = "";
  });

  it("docks pending decision controls outside the scrolling content", () => {
    const { host, root } = renderDetail(approval("pending"));
    const dock = host.querySelector<HTMLElement>("[data-review-actions-dock]");
    if (!dock) throw new Error("Missing approval actions dock.");
    const detail = host.querySelector<HTMLElement>("[data-review='detail']");
    expect(dock.parentElement).toBe(detail);
    expect(dock.textContent).toContain("Approve");
    expect(dock.textContent).toContain("Deny");
    const scroll = host.querySelector<HTMLElement>(".review-detail-scroll");
    expect(scroll?.querySelector("[data-review-actions-dock]")).toBeNull();
    expect(scroll?.textContent).not.toContain("Approve");
    expect(scroll?.textContent).toContain("Requested command");
    act(() => root.unmount());
    host.remove();
  });

  it("keeps exactly one copy of the decision controls", () => {
    const { host, root } = renderDetail(approval("pending"));
    const approveButtons = [
      ...host.querySelectorAll<HTMLButtonElement>("button"),
    ].filter((button) => button.textContent?.trim() === "Approve");
    expect(approveButtons).toHaveLength(1);
    act(() => root.unmount());
    host.remove();
  });

  it("omits the dock when the approval is already decided", () => {
    const { host, root } = renderDetail(approval("approved"));
    expect(host.querySelector("[data-review-actions-dock]")).toBeNull();
    act(() => root.unmount());
    host.remove();
  });

  it("omits the dock for non-approval review items", () => {
    const { host, root } = renderDetail({
      ...approval("pending"),
      id: "change-1",
      kind: "changes",
      path: "apps/desktop/src/renderer/review/ReviewDetail.tsx",
    });
    expect(host.querySelector("[data-review-actions-dock]")).toBeNull();
    act(() => root.unmount());
    host.remove();
  });
});
