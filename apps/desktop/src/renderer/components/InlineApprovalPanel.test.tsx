// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineApprovalPanel } from "./InlineApprovalPanel";

const { request, reload, poll, resource, scenario } = vi.hoisted(() => ({
  request: vi.fn(),
  reload: vi.fn(),
  poll: vi.fn(),
  resource: vi.fn(),
  scenario: {
    approvals: [] as Record<string, unknown>[],
    error: "",
    loading: false,
  },
}));

vi.mock("@elizaos/ui/hooks/useDocumentVisibility", () => ({
  useIntervalWhenDocumentVisible: poll,
}));
vi.mock("../lib", async () => ({
  ...(await vi.importActual<typeof import("../lib")>("../lib")),
  desktopRequest: request,
  useApiResource: (path: string | null, dependencies: unknown[]) => {
    resource(path, dependencies);
    return {
      data: { approvals: scenario.approvals },
      error: scenario.error,
      loading: scenario.loading,
      reload,
    };
  },
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function approval(roomId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `approval:${roomId}`,
    roomId,
    sessionKey: roomId,
    status: "pending",
    command: `protected-command-${roomId}`,
    reason: `reason-${roomId}`,
    expiresAt: "2026-10-04T12:00:00.000Z",
    ...overrides,
  };
}

describe("InlineApprovalPanel session attribution and decisions", () => {
  let container: HTMLDivElement;
  let root: Root;
  const render = (roomId = "A", active = true, compact = false) =>
    act(() =>
      root.render(
        <InlineApprovalPanel
          active={active}
          compact={compact}
          roomId={roomId}
        />,
      ),
    );
  const button = (label: string) => {
    const result = [...document.querySelectorAll("button")].find(
      (node) =>
        node.textContent === label || node.getAttribute("aria-label") === label,
    );
    if (!result) throw new Error(`Missing button ${label}`);
    return result;
  };
  const click = (label: string) => act(() => button(label).click());
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    scenario.approvals = [approval("A"), approval("B")];
    scenario.error = "";
    scenario.loading = false;
    request.mockReset().mockResolvedValue({});
    reload.mockReset();
    poll.mockReset();
    resource.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("uses a 44px scoped disclosure when the pane cannot fit approvals and restores focus after Escape", async () => {
    render("A", true, true);
    const trigger = button("Review session approvals");
    Object.defineProperty(trigger, "getClientRects", {
      value: () => [{ width: 44, height: 44 }],
    });
    expect(trigger.className).toContain("!min-h-11");
    expect(container.querySelectorAll("article")).toHaveLength(0);
    expect(container.textContent).toContain("1 pending");
    trigger.focus();
    await act(async () => trigger.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("protected-command-A");
    expect(dialog?.textContent).not.toContain("protected-command-B");
    expect(
      dialog?.querySelector('[aria-label="Session approval requests"]'),
    ).not.toBeNull();
    expect(button("Approve").className).toContain("!min-h-11");
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    "route inactive",
    "panel closed",
    "surface replaced",
    "inspector replaces conversation",
    "room changed",
  ])(
    "closes a scoped modal and ignores pending feedback when %s",
    async (transition) => {
      let resolve: (() => void) | undefined;
      request.mockImplementationOnce(
        () =>
          new Promise<void>((done) => {
            resolve = done;
          }),
      );
      render("A", true, true);
      await act(async () => button("Review session approvals").click());
      click("Approve");
      render(
        transition === "room changed" ? "B" : "A",
        transition === "room changed",
        true,
      );
      await act(async () => resolve?.());
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.body.textContent).not.toContain("Approved.");
      expect(reload).not.toHaveBeenCalled();
      expect(document.activeElement?.getAttribute("aria-label")).not.toBe(
        "Review session approvals",
      );
    },
  );
  it("keeps full text and actual decisions in compact review without cancelling when closed", async () => {
    const command = "Long protected command ".repeat(60);
    const reason = "Long approval reason ".repeat(40);
    scenario.approvals = [approval("A", { command, reason })];
    render("A", true, true);
    await act(async () => button("Review session approvals").click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain(command);
    expect(dialog?.textContent).toContain(reason);
    await act(async () => button("Deny").click());
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "/execution/approvals/approval%3AA/deny",
      "POST",
      {},
    );
    expect(dialog?.textContent).toContain("Denied this request.");
    await act(async () => button("Close approvals").click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(request).toHaveBeenCalledOnce();
  });

  it("isolates A/B panels and leaves unattributed or conflicting requests in Review", () => {
    scenario.approvals.push(
      approval("", { id: "global", command: "GLOBAL" }),
      approval("A", { id: "conflict", sessionKey: "B", command: "CONFLICT" }),
      approval("B", { id: "key-only", sessionKey: "A", command: "KEYONLY" }),
      { id: "missing-room", status: "pending", command: "UNKNOWN" },
    );
    act(() =>
      root.render(
        <>
          <InlineApprovalPanel active roomId="A" />
          <InlineApprovalPanel active roomId="B" />
        </>,
      ),
    );
    const panels = container.querySelectorAll(
      '[aria-label="Pending approvals for this session"]',
    );
    expect(panels).toHaveLength(2);
    expect(panels[0].textContent).toContain("protected-command-A");
    expect(panels[0].textContent).not.toContain("protected-command-B");
    expect(panels[1].textContent).toContain("protected-command-B");
    expect(panels[1].textContent).not.toContain("protected-command-A");
    for (const text of ["GLOBAL", "CONFLICT", "KEYONLY", "UNKNOWN"])
      expect(container.textContent).not.toContain(text);
    expect(container.textContent).toContain("Other requests remain in Review");
  });
  it("accepts an exact original room label without optional sessionKey, not hashes or normalized lookalikes", () => {
    scenario.approvals = [
      approval("A", { sessionKey: undefined }),
      approval(" A", { command: "WHITESPACE" }),
      approval("a", { command: "CASE" }),
      approval("native-room-uuid", { sessionKey: "A", command: "HASH" }),
      approval("A", { sessionKey: null, command: "UNKNOWNKEY" }),
    ];
    render();
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.textContent).toContain("protected-command-A");
    for (const text of ["WHITESPACE", "CASE", "HASH", "UNKNOWNKEY"])
      expect(container.textContent).not.toContain(text);
  });
  it("requires pending status and IDs accepted by the real decision route", () => {
    scenario.approvals = [
      ...["approved", "denied", "used", "expired", undefined].map((status) =>
        approval("A", { status }),
      ),
      ...["", " ", "bad/id", "x".repeat(257), 42].map((id) =>
        approval("A", { id }),
      ),
    ];
    render();
    expect(container.innerHTML).toBe("");
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    ["A", false],
    ["", true],
  ])(
    "disables requests and rendering when room=%s active=%s",
    (roomId, active) => {
      scenario.loading = true;
      scenario.error = "offline";
      render(String(roomId), Boolean(active));
      expect(container.innerHTML).toBe("");
      expect(resource).toHaveBeenLastCalledWith(null, [false]);
      expect(poll).toHaveBeenLastCalledWith(reload, 5_000, false);
    },
  );
  it("announces loading and disables stale pending decisions", () => {
    scenario.loading = true;
    render();
    expect(container.querySelector("section")?.getAttribute("aria-busy")).toBe(
      "true",
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Checking approvals for this session",
    );
    expect(button("Approve").disabled).toBe(true);
    click("Approve");
    expect(request).not.toHaveBeenCalled();
  });
  it("shows a load error with a reachable retry, then restores matching decisions", () => {
    scenario.error = "offline";
    render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not load session approvals: offline",
    );
    expect(button("Approve").disabled).toBe(true);
    click("Retry approvals");
    expect(reload).toHaveBeenCalledOnce();
    scenario.error = "";
    render();
    expect(button("Approve").disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it.each([
    ["Approve", "approve", "Approved. The matching command can continue."],
    ["Deny", "deny", "Denied this request."],
  ])(
    "posts the actual attributable ID for %s and announces feedback",
    async (label, decision, feedback) => {
      render();
      await act(async () => button(label).click());
      expect(request).toHaveBeenCalledExactlyOnceWith(
        `/execution/approvals/approval%3AA/${decision}`,
        "POST",
        {},
      );
      expect(container.querySelector('[role="status"]')?.textContent).toBe(
        feedback,
      );
      expect(reload).toHaveBeenCalledOnce();
      scenario.approvals = [approval("B")];
      render();
      expect(container.textContent).toContain(feedback);
      expect(container.querySelectorAll("article")).toHaveLength(0);
    },
  );
  it("keeps real decision failures visible and permits retry without recording success", async () => {
    request.mockRejectedValueOnce(new Error("Approval expired"));
    render();
    await act(async () => button("Approve").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Approval expired",
    );
    expect(reload).not.toHaveBeenCalled();
    expect(button("Approve").disabled).toBe(false);
    await act(async () => button("Approve").click());
    expect(request).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it("ignores delayed A completion after switching to B and does not clear B's busy decision", async () => {
    let resolveA: (() => void) | undefined;
    let resolveB: (() => void) | undefined;
    request
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveA = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveB = resolve;
          }),
      );
    render();
    click("Approve");
    render("B");
    expect(button("Approve").disabled).toBe(false);
    click("Deny");
    await act(async () => resolveA?.());
    expect(container.textContent).not.toContain("Approved.");
    expect(button("Deny").disabled).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    await act(async () => resolveB?.());
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      "Denied this request.",
    );
    expect(reload).toHaveBeenCalledOnce();
  });
  it("does not resubmit an in-flight ID after A to B to A or revive its stale feedback", async () => {
    let resolve: (() => void) | undefined;
    request.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    render();
    click("Approve");
    render("B");
    render("A");
    expect(button("Approve").disabled).toBe(true);
    click("Approve");
    expect(request).toHaveBeenCalledOnce();
    await act(async () => resolve?.());
    expect(container.textContent).not.toContain("Approved.");
    expect(button("Approve").disabled).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
  it.each(["removed", "inactive", "changed-key"])(
    "ignores delayed failure after pending scope becomes %s",
    async (change) => {
      let reject: ((error: Error) => void) | undefined;
      request.mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, fail) => {
            reject = fail;
          }),
      );
      render();
      click("Approve");
      if (change === "removed") scenario.approvals = [approval("B")];
      if (change === "changed-key")
        scenario.approvals = [approval("A", { sessionKey: "B" })];
      render("A", change !== "inactive");
      await act(async () => reject?.(new Error("OLD FAILURE")));
      expect(container.textContent).not.toContain("OLD FAILURE");
      expect(reload).not.toHaveBeenCalled();
      expect(container.innerHTML).toBe("");
    },
  );
  it("bounds the surface and caps after filtering with readable wrapping and 44px shared controls", () => {
    scenario.approvals = [
      ...Array.from({ length: 5 }, (_, index) =>
        approval("B", { id: `b${index}` }),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        approval("A", { id: `a${index}` }),
      ),
    ];
    render();
    const panel = container.querySelector("section");
    expect(panel?.getAttribute("aria-label")).toBe(
      "Pending approvals for this session",
    );
    expect(panel?.className).toContain("w-full");
    expect(panel?.className).toContain(
      "max-h-[min(35dvh,var(--session-approval-max-height,280px))]",
    );
    const requests = container.querySelector(
      '[aria-label="Session approval requests"]',
    );
    expect(requests?.className).toContain("overflow-y-auto");
    expect(requests?.getAttribute("tabindex")).toBe("0");
    expect(requests?.querySelectorAll("button")).toHaveLength(6);
    expect(container.querySelectorAll("article")).toHaveLength(3);
    expect(container.textContent).toContain("Showing 3 of 4");
    expect(container.querySelector("code")?.className).toContain(
      "whitespace-pre-wrap",
    );
    expect(container.querySelector("code")?.className).toContain(
      "[overflow-wrap:anywhere]",
    );
    expect(button("Approve").className).toContain("!min-h-11");
    expect(button("Approve").className).toContain("focus-visible:outline");
    expect(button("Approve").className).toContain(
      "motion-reduce:transition-none",
    );
    expect(container.innerHTML).not.toMatch(
      /gradient|w-\[calc|text-\[10px\]|h-\[26px\]/,
    );
  });
});
