import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApiTransportService } from "./api-transport-service";

describe("ApiTransportService", () => {
  it("persists responses and reuses room ids via previous response id", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-api-transport-"));
    const service = new ApiTransportService(root);

    try {
      const first = service.create({
        id: "resp_stable",
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
      expect(first.id).toBe("resp_stable");
      expect(service.get(first.id)?.outputText).toBe("world");
      expect(service.resolveContinuation(first.id, "user-1")).toEqual({
        ok: true,
        roomId: first.roomId,
      });
      expect(service.list(2)).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects missing and cross-user response continuations", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-api-transport-"));
    const service = new ApiTransportService(root);

    try {
      const record = service.create({
        input: "hello",
        outputText: "world",
        userId: "user-1",
      });

      expect(service.resolveContinuation("resp_missing", "user-1")).toEqual({
        ok: false,
        code: "response_not_found",
        status: 404,
        error: "previous_response_id was not found",
      });
      expect(service.resolveContinuation(record.id, "user-2")).toEqual({
        ok: false,
        code: "response_user_mismatch",
        status: 403,
        error: "previous_response_id belongs to another user",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("emits update events when a response is created", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-api-transport-"));
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
