import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExecutionApprovalService } from "./execution-approval-service";

describe("ExecutionApprovalService", () => {
  it("reuses pending approvals and consumes approved ones", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-exec-approvals-"));
    const service = new ExecutionApprovalService(root);

    try {
      const requested = service.request({
        platform: "telegram",
        userId: "user-1",
        roomId: "telegram:room-1:user-1:root",
        command: "git push origin main",
        reason: "can rewrite git state or publish changes",
      });

      const pending = service.findPending({
        platform: "telegram",
        userId: "user-1",
        roomId: "telegram:room-1:user-1:root",
        command: "git push origin main",
      });
      expect(pending?.id).toBe(requested.id);

      const approved = service.approve(requested.id);
      expect(approved.status).toBe("approved");

      const consumed = service.useApproved({
        platform: "telegram",
        userId: "user-1",
        roomId: "telegram:room-1:user-1:root",
        command: "git push origin main",
      });
      expect(consumed?.status).toBe("used");
      expect(service.get(requested.id)?.status).toBe("used");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("can approve for immediate use or deny a request", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-exec-approvals-"));
    const service = new ExecutionApprovalService(root);

    try {
      const immediate = service.request({
        platform: "discord",
        userId: "user-2",
        roomId: "discord:room-2:user-2:root",
        command: "rm -rf build",
        reason: "can delete files",
      });
      const used = service.approve(immediate.id, { useImmediately: true });
      expect(used.status).toBe("used");
      expect(used.usedAt).toBeDefined();

      const denied = service.request({
        platform: "discord",
        userId: "user-2",
        roomId: "discord:room-2:user-2:root",
        command: "sudo reboot",
        reason: "uses elevated privileges",
      });
      const result = service.deny(denied.id);
      expect(result.status).toBe("denied");
      expect(result.deniedAt).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
