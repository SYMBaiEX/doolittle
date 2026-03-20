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
});
