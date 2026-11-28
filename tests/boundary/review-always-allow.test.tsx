// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  approveWithPersistentApprovalRule,
  exactApprovalRuleInputFromApproval,
} from "../../apps/desktop/src/renderer/review/approval-rule";
import { ReviewApprovalActions } from "../../apps/desktop/src/renderer/review/ReviewApprovalPanel";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
});

const approval = {
  id: "approval-1",
  command: "  git status --short  ",
  platform: "cli",
  userId: "user-1",
  roomId: "room-1",
  sessionKey: "conversation-1",
  botId: "bot-1",
  sessionId: "ephemeral-session",
  runId: "ephemeral-run",
};

it("derives a stable exact rule without ephemeral execution identities", () => {
  expect(exactApprovalRuleInputFromApproval(approval)).toEqual({
    patternType: "exact",
    pattern: "git status --short",
    platform: "cli",
    userId: "user-1",
    roomId: "room-1",
    sessionKey: "conversation-1",
    botId: "bot-1",
    enabled: true,
  });
  expect(
    exactApprovalRuleInputFromApproval({ ...approval, userId: "" }),
  ).toBeNull();
});

it("saves the rule before approving the current request", async () => {
  const calls: Array<[string, string, unknown]> = [];
  const result = await approveWithPersistentApprovalRule({
    approvalId: "approval/1",
    ruleInput: { patternType: "exact", pattern: "git status" },
    request: async (path, method, body) => {
      calls.push([path, method, body]);
      return {};
    },
  });

  expect(result).toEqual({ status: "approved" });
  expect(calls).toEqual([
    [
      "/execution/approval-rules",
      "POST",
      { patternType: "exact", pattern: "git status" },
    ],
    ["/execution/approvals/approval%2F1/approve", "POST", {}],
  ]);
});

it("fails closed when the persistent rule cannot be confirmed", async () => {
  const calls: string[] = [];
  const result = await approveWithPersistentApprovalRule({
    approvalId: "approval-1",
    ruleInput: { patternType: "exact", pattern: "git status" },
    request: async (path) => {
      calls.push(path);
      throw new Error("backend unavailable");
    },
  });

  expect(result.status).toBe("rule-unconfirmed");
  expect(result).toMatchObject({ error: expect.any(Error) });
  expect(calls).toEqual(["/execution/approval-rules"]);
});

it("reports approval as unconfirmed after the rule write succeeds", async () => {
  const calls: string[] = [];
  const result = await approveWithPersistentApprovalRule({
    approvalId: "approval-1",
    ruleInput: { patternType: "exact", pattern: "git status" },
    request: async (path) => {
      calls.push(path);
      if (path.includes("/approve")) throw new Error("socket closed");
      return {};
    },
  });

  expect(result.status).toBe("approval-unconfirmed");
  expect(calls).toEqual([
    "/execution/approval-rules",
    "/execution/approvals/approval-1/approve",
  ]);
});

it("renders the explicit always-allow action only when wired", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onAlwaysAllow = vi.fn();
  act(() =>
    root.render(
      <ReviewApprovalActions
        busy=""
        onAlwaysAllow={onAlwaysAllow}
        onDecision={vi.fn()}
      />,
    ),
  );
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });

  const action = [...host.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Always allow",
  );
  expect(action).toBeDefined();
  expect(host.textContent).toContain(
    "first saves an exact rule for this command in the approval's stable scope",
  );
  act(() => action?.click());
  expect(onAlwaysAllow).toHaveBeenCalledTimes(1);
});
