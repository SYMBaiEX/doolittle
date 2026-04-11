import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExecutionApprovalService } from "./execution-approval/service";

describe("ExecutionApprovalService", () => {
  it("reuses pending approvals and consumes approved ones", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-exec-approvals-"));
    const service = new ExecutionApprovalService(root);

    try {
      const requested = await service.request({
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

      const approved = await service.approve(requested.id);
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

  it("can approve for immediate use or deny a request", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-exec-approvals-"));
    const service = new ExecutionApprovalService(root);

    try {
      const immediate = await service.request({
        platform: "discord",
        userId: "user-2",
        roomId: "discord:room-2:user-2:root",
        command: "rm -rf build",
        reason: "can delete files",
      });
      const used = await service.approve(immediate.id, {
        useImmediately: true,
      });
      expect(used.status).toBe("used");
      expect(used.usedAt).toBeDefined();

      const denied = await service.request({
        platform: "discord",
        userId: "user-2",
        roomId: "discord:room-2:user-2:root",
        command: "sudo reboot",
        reason: "uses elevated privileges",
      });
      const result = await service.deny(denied.id);
      expect(result.status).toBe("denied");
      expect(result.deniedAt).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("expires stale approvals and returns the latest pending approval per session", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-exec-approvals-"));
    const service = new ExecutionApprovalService(root);

    try {
      await service.request({
        platform: "telegram",
        userId: "user-3",
        roomId: "telegram:room-3:user-3:root",
        sessionKey: "telegram:room-3:user-3:root",
        command: "echo first",
        reason: "can run commands remotely",
      });
      const latest = await service.request({
        platform: "telegram",
        userId: "user-3",
        roomId: "telegram:room-3:user-3:root",
        sessionKey: "telegram:room-3:user-3:root",
        command: "echo second",
        reason: "can run commands remotely",
      });
      const expired = await service.request({
        platform: "telegram",
        userId: "user-3",
        roomId: "telegram:room-3:user-3:root",
        sessionKey: "telegram:room-3:user-3:root",
        command: "echo stale",
        reason: "can run commands remotely",
        ttlMinutes: -1,
      });

      expect(
        service.latestPendingForSession("telegram:room-3:user-3:root")?.id,
      ).toBe(latest.id);
      expect(
        service.findPending({
          platform: "telegram",
          userId: "user-3",
          roomId: "telegram:room-3:user-3:root",
          sessionKey: "telegram:room-3:user-3:root",
          command: "echo stale",
        }),
      ).toBeUndefined();
      expect(service.get(expired.id)?.status).toBe("expired");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
