import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeliveryService } from "./delivery-service";

describe("DeliveryService", () => {
  it("persists reply metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-delivery-test-"));
    const service = new DeliveryService(root);

    try {
      const record = service.deliver(
        {
          platform: "discord",
          channelId: "123",
          userId: "456",
          mode: "explicit",
        },
        "hello",
        {
          threadId: "t-1",
          replyToId: "m-1",
          metadata: { source: "test" },
        },
      );

      expect(record.threadId).toBe("t-1");
      expect(record.replyToId).toBe("m-1");
      expect(record.metadata?.source).toBe("test");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("updates an existing delivery record in place", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-delivery-test-"));
    const service = new DeliveryService(root);

    try {
      const record = service.deliver(
        {
          platform: "telegram",
          channelId: "room-1",
          userId: "user-1",
          mode: "explicit",
        },
        "draft message",
        {
          metadata: { phase: "draft" },
        },
      );

      const updated = service.update(record.id, "final message", {
        metadata: { phase: "final" },
      });

      expect(updated.id).toBe(record.id);
      expect(updated.text).toBe("final message");
      expect(updated.metadata?.phase).toBe("final");
      expect(updated.updatedAt).toBeDefined();
      expect(updated.editOfId).toBe(record.id);
      expect(updated.editCount).toBe(1);
      expect(service.recent(1)[0]?.text).toBe("final message");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
