import { describe, expect, it } from "bun:test";
import type { EnvConfig } from "@/types/runtime";
import { DingtalkPlatformAdapter } from "./dingtalk-adapter";
import { createDeliveryRoot, installFetchMock } from "./test-helpers";

describe("DingtalkPlatformAdapter", () => {
  it("appends access token when needed and posts the message", async () => {
    const { delivery, cleanup } = createDeliveryRoot("dingtalk");
    const restoreFetch = installFetchMock(async (url, init) => {
      expect(url).toBe(
        "https://oapi.dingtalk.com/robot/send?access_token=token-123",
      );
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        msgtype?: string;
        text?: { content?: string };
      };
      expect(body.msgtype).toBe("text");
      expect(body.text?.content).toBe("hello dingtalk");

      return new Response("{}", {
        status: 200,
      });
    });
    const adapter = new DingtalkPlatformAdapter(
      "dingtalk",
      {
        dingtalkWebhookUrl: "https://oapi.dingtalk.com/robot/send",
        dingtalkAccessToken: "token-123",
      } as EnvConfig,
      delivery,
    );

    try {
      await adapter.start();
      const record = await adapter.send({
        roomId: "room-1",
        userId: "user-1",
        text: "hello dingtalk",
      });
      const health = await adapter.health();

      expect(record.text).toBe("hello dingtalk");
      expect(health.ready).toBe(true);
      expect(health.sendCount).toBe(1);
      expect(health.lastDeliveryId).toBe(record.id);
    } finally {
      restoreFetch();
      cleanup();
    }
  });

  it("throws when webhook URL is missing", async () => {
    const { delivery, cleanup } = createDeliveryRoot("dingtalk-no-config");
    const adapter = new DingtalkPlatformAdapter(
      "dingtalk",
      {
        dingtalkAccessToken: "token-123",
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
      ).rejects.toThrow("DINGTALK_WEBHOOK_URL is required for outbound sends.");
    } finally {
      cleanup();
    }
  });
});
