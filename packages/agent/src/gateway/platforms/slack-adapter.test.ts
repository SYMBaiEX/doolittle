import { describe, expect, it } from "vitest";
import type { EnvConfig } from "@/types/runtime";
import { SlackPlatformAdapter } from "./slack-adapter";
import { createDeliveryRoot, installFetchMock } from "./test-helpers";

describe("SlackPlatformAdapter", () => {
  it("sends messages to the configured webhook and records delivery state", async () => {
    const { delivery, cleanup } = createDeliveryRoot("slack");
    const restoreFetch = installFetchMock(async (url, init) => {
      expect(url).toBe("https://hooks.slack.test/service/webhook");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "content-type": "application/json",
      });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        text?: string;
        thread_ts?: string;
      };
      expect(body.text).toBe("hello from slack");
      expect(body.thread_ts).toBe("reply-2");

      return new Response("{}", {
        status: 200,
      });
    });
    const adapter = new SlackPlatformAdapter(
      "slack",
      {
        slackWebhookUrl: "https://hooks.slack.test/service/webhook",
        slackSigningSecret: "secret",
      } as EnvConfig,
      delivery,
    );

    try {
      await adapter.start();
      const record = await adapter.send({
        roomId: "room-1",
        userId: "user-1",
        text: "hello from slack",
        threadId: "thread-1",
        replyToId: "reply-2",
        metadata: { source: "test" },
      });
      const health = await adapter.health();

      expect(record.metadata).toEqual({ source: "test" });
      expect(health.ready).toBe(true);
      expect(health.sendCount).toBe(1);
      expect(health.lastDeliveryId).toBe(record.id);
      expect(health.lastOutboundMetadataKeys).toEqual(["source"]);
    } finally {
      restoreFetch();
      cleanup();
    }
  });

  it("caps upstream Slack error diagnostics", async () => {
    const { delivery, cleanup } = createDeliveryRoot("slack-error-body");
    const restoreFetch = installFetchMock(
      async () => new Response("x".repeat(20_000), { status: 500 }),
    );
    const adapter = new SlackPlatformAdapter(
      "slack",
      {
        slackWebhookUrl: "https://hooks.slack.test/service/webhook",
      } as EnvConfig,
      delivery,
    );

    try {
      await expect(
        adapter.send({ roomId: "room-1", userId: "user-1", text: "blocked" }),
      ).rejects.toThrow("[response body truncated]");
    } finally {
      restoreFetch();
      cleanup();
    }
  });

  it("throws with a clear message when Slack webhook is not configured", async () => {
    const { delivery, cleanup } = createDeliveryRoot("slack-no-config");
    const adapter = new SlackPlatformAdapter(
      "slack",
      {
        slackSigningSecret: "secret",
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
      ).rejects.toThrow("SLACK_WEBHOOK_URL is not configured.");
    } finally {
      cleanup();
    }
  });
});
