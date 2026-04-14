import { describe, expect, it } from "bun:test";
import type { EnvConfig } from "@/types/runtime";
import { MatrixPlatformAdapter } from "./matrix-adapter";
import { createDeliveryRoot, installFetchMock } from "./test-helpers";

describe("MatrixPlatformAdapter", () => {
  it("encodes room id and sends a matrix text message", async () => {
    const { delivery, cleanup } = createDeliveryRoot("matrix");
    const restoreFetch = installFetchMock(async (url, init) => {
      expect(url).toContain(
        "/_matrix/client/v3/rooms/room%201/send/m.room.message/",
      );
      expect(init?.method).toBe("PUT");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer matrix-token",
        "content-type": "application/json",
      });
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        msgtype?: string;
        body?: string;
        "m.relates_to"?: { "m.in_reply_to"?: { event_id?: string } };
      };
      expect(body.msgtype).toBe("m.text");
      expect(body.body).toBe("hello matrix");
      expect(body["m.relates_to"]?.["m.in_reply_to"]?.event_id).toBe("reply-1");

      return new Response(JSON.stringify({ event_id: "event-id" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const adapter = new MatrixPlatformAdapter(
      "matrix",
      {
        matrixHomeserver: "https://matrix.example",
        matrixAccessToken: "matrix-token",
      } as EnvConfig,
      delivery,
    );

    try {
      await adapter.start();
      const record = await adapter.send({
        roomId: "room 1",
        userId: "user-1",
        text: "hello matrix",
        replyToId: "reply-1",
      });
      const health = await adapter.health();

      expect(record.metadata).toBeUndefined();
      expect(health.ready).toBe(true);
      expect(health.sendCount).toBe(1);
      expect(health.lastDeliveryId).toBe(record.id);
    } finally {
      restoreFetch();
      cleanup();
    }
  });

  it("throws when matrix credentials are missing", async () => {
    const { delivery, cleanup } = createDeliveryRoot("matrix-no-config");
    const adapter = new MatrixPlatformAdapter(
      "matrix",
      { matrixHomeserver: "https://matrix.example" } as EnvConfig,
      delivery,
    );

    try {
      await expect(
        adapter.send({
          roomId: "room-1",
          userId: "user-1",
          text: "blocked",
        }),
      ).rejects.toThrow(
        "MATRIX_HOMESERVER and MATRIX_ACCESS_TOKEN are required.",
      );
    } finally {
      cleanup();
    }
  });
});
