import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApiTransportService } from "./api-transport-service";

describe("ApiTransportService", () => {
  it("persists responses and reuses room ids via previous response id", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-api-transport-"));
    const service = new ApiTransportService(root);

    try {
      const first = service.create({
        input: "hello",
        outputText: "world",
        userId: "user-1",
      });
      const second = service.create({
        input: "follow up",
        outputText: "done",
        userId: "user-1",
        previousResponseId: first.id,
      });

      expect(second.roomId).toBe(first.roomId);
      expect(service.get(first.id)?.outputText).toBe("world");
      expect(service.resolveRoomId(first.id, "user-1")).toBe(first.roomId);
      expect(service.list(2)).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("emits update events when a response is created", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-api-transport-"));
    const service = new ApiTransportService(root);
    const seen: string[] = [];

    try {
      const unsubscribe = service.onUpdate((event) => {
        seen.push(`${event.type}:${event.record.id}`);
      });
      const record = service.create({
        input: "hello",
        outputText: "world",
        userId: "user-2",
      });
      unsubscribe();

      expect(seen).toEqual([`create:${record.id}`]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
