import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeliveryService } from "@/services/delivery-service";
import { MockPlatformAdapter } from "./mock-adapter";

describe("MockPlatformAdapter", () => {
  it("records lifecycle events and returns delivery traces", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-mock-adapter-"));
    const delivery = new DeliveryService(join(root, "delivery"));
    const adapter = new MockPlatformAdapter("api", delivery);

    try {
      await adapter.start();
      const record = await adapter.send({
        roomId: "room-1",
        userId: "user-1",
        text: "hello",
        threadId: "thread-1",
        replyToId: "reply-1",
        metadata: { source: "test" },
      });
      const edited = await adapter.edit?.(record, {
        roomId: "room-1",
        userId: "user-1",
        text: "hello again",
        threadId: "thread-1",
        replyToId: "reply-1",
        metadata: { source: "edit" },
      });
      const health = await adapter.health();

      expect(record.threadId).toBe("thread-1");
      expect(record.replyToId).toBe("reply-1");
      expect(record.metadata?.source).toBe("test");
      expect(edited?.text).toBe("hello again");
      expect(edited?.metadata?.source).toBe("edit");
      expect(edited?.editCount).toBe(1);
      expect(health.lastDeliveryId).toBe(record.id);
      expect(health.lastDeliveryAt).toBeDefined();
      expect(health.lastOutboundRoomId).toBe("room-1");
      expect(health.lastOutboundThreadId).toBe("thread-1");
      expect(health.lastOutboundReplyToId).toBe("reply-1");
      expect(health.lastOutboundMetadataKeys).toEqual(["source"]);
      expect(health.events.some((event) => event.kind === "start")).toBe(true);
      expect(health.events.some((event) => event.kind === "deliver")).toBe(
        true,
      );
      expect(health.events.some((event) => event.kind === "edit")).toBe(true);
      expect(health.events.some((event) => event.kind === "health")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
