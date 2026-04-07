import { describe, expect, it } from "bun:test";
import type { ExecutionApprovalStoreData } from "./types";
import {
  createPendingApprovalRecord,
  expirePendingApprovals,
  markApprovalApproved,
  markApprovalDenied,
  markApprovalUsed,
  matchesApprovalRequest,
  pruneApprovalStore,
} from "./updates";

describe("execution approval updates", () => {
  it("matches approval requests using trimmed commands and session scope", () => {
    const record = createPendingApprovalRecord({
      platform: "telegram",
      userId: "user-1",
      roomId: "telegram:room-1:user-1:root",
      sessionKey: "telegram:room-1:user-1:root",
      command: "git push origin main",
      reason: "can rewrite git state or publish changes",
      ttlMinutes: 15,
    });

    expect(
      matchesApprovalRequest(record, {
        platform: "telegram",
        userId: "user-1",
        roomId: "telegram:room-1:user-1:root",
        sessionKey: "telegram:room-1:user-1:root",
        command: "  git push origin main  ",
      }),
    ).toBe(true);
  });

  it("applies approval, denial, and use transitions consistently", () => {
    const record = createPendingApprovalRecord({
      platform: "discord",
      userId: "user-2",
      roomId: "discord:room-2:user-2:root",
      command: "echo hello",
      reason: "can run commands remotely",
      ttlMinutes: 15,
    });

    markApprovalApproved(record, { useImmediately: true });
    expect(record.status).toBe("used");
    expect(record.approvedAt).toBeDefined();
    expect(record.usedAt).toBeDefined();

    const denied = createPendingApprovalRecord({
      platform: "discord",
      userId: "user-2",
      roomId: "discord:room-2:user-2:root",
      command: "sudo reboot",
      reason: "uses elevated privileges",
      ttlMinutes: 15,
    });
    markApprovalDenied(denied);
    expect(denied.status).toBe("denied");
    expect(denied.deniedAt).toBeDefined();

    const approved = createPendingApprovalRecord({
      platform: "discord",
      userId: "user-2",
      roomId: "discord:room-2:user-2:root",
      command: "git push origin main",
      reason: "can rewrite git state or publish changes",
      ttlMinutes: 15,
    });
    markApprovalApproved(approved);
    markApprovalUsed(approved);
    expect(approved.status).toBe("used");
    expect(approved.usedAt).toBeDefined();
  });

  it("expires stale pending approvals and caps retained history", () => {
    const store: ExecutionApprovalStoreData = {
      approvals: Array.from({ length: 205 }, (_, index) =>
        createPendingApprovalRecord({
          platform: "telegram",
          userId: `user-${index}`,
          roomId: `telegram:room-${index}:user-${index}:root`,
          command: `echo ${index}`,
          reason: "can run commands remotely",
          ttlMinutes: -1,
        }),
      ),
    };

    expect(expirePendingApprovals(store)).toBe(true);
    expect(store.approvals.every((record) => record.status === "expired")).toBe(
      true,
    );

    pruneApprovalStore(store);
    expect(store.approvals).toHaveLength(200);
  });
});
