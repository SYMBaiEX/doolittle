import { describe, expect, it } from "bun:test";
import type { EnvConfig } from "@/types/runtime";
import { MattermostPlatformAdapter } from "./mattermost-adapter";
import { createDeliveryRoot, installFetchMock } from "./test-helpers";

describe("MattermostPlatformAdapter", () => {
  it("posts to the Mattermost API and captures delivery metadata", async () => {
    const { delivery, cleanup } = createDeliveryRoot("mattermost");
    const restoreFetch = installFetchMock(async (url, init) => {
      expect(url).toBe("https://mattermost.example/api/v4/posts");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer bot-token",
        "content-type": "application/json",
      });
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        channel_id?: string;
        message?: string;
        root_id?: string;
        props?: { source?: string };
      };
      expect(body.channel_id).toBe("room-1");
      expect(body.message).toBe("hello mattermost");
      expect(body.root_id).toBe("thread-1");
      expect(body.props).toEqual({ source: "test" });

      return new Response(JSON.stringify({ id: "mm-11", update_at: 123 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const adapter = new MattermostPlatformAdapter(
      "mattermost",
      {
        mattermostUrl: "https://mattermost.example",
        mattermostToken: "bot-token",
      } as EnvConfig,
      delivery,
    );

    try {
      await adapter.start();
      const record = await adapter.send({
        roomId: "room-1",
        userId: "user-1",
        threadId: "thread-1",
        text: "hello mattermost",
        metadata: {
          source: "test",
        },
      });
      const health = await adapter.health();

      expect(record.text).toBe("hello mattermost");
      expect(health.ready).toBe(true);
      expect(health.sendCount).toBe(1);
      expect(health.lastDeliveryId).toBe(record.id);
      expect(health.lastError).toBeUndefined();
    } finally {
      restoreFetch();
      cleanup();
    }
  });

  it("throws when Mattermost credentials are incomplete", async () => {
    const { delivery, cleanup } = createDeliveryRoot("mattermost-no-config");
    const adapter = new MattermostPlatformAdapter(
      "mattermost",
      {
        mattermostUrl: "https://mattermost.example",
      } as EnvConfig,
      delivery,
    );

    try {
      await expect(
        adapter.send({
          roomId: "room-1",
          userId: "user-1",
          text: "blocked",
        }),
      ).rejects.toThrow("MATTERMOST_URL and MATTERMOST_TOKEN are required.");
    } finally {
      cleanup();
    }
  });
});
