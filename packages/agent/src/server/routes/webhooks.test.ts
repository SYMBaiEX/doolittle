import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleWebhookRoutes } from "@/server/routes/webhooks";

function createContext(overrides?: {
  slackSigningSecret?: string;
  whatsappVerifyToken?: string;
}) {
  const pairing = {
    listPending: (platform?: string) => [{ platform: platform ?? "telegram" }],
    approve: (platform: string, code: string) => ({ platform, code, ok: true }),
    deny: (platform: string, code: string) => ({ platform, code, ok: true }),
  };
  const hooks = {
    list: () => [{ id: "hook-1", name: "test-hook" }],
    recentInvocations: () => [{ id: "invoke-1" }],
    add: (hook: {
      event: string;
      name: string;
      enabled: boolean;
      template: string;
    }) => ({ id: "hook-2", ...hook }),
    remove: (_id: string) => {},
  };

  return {
    config: {
      slackSigningSecret: overrides?.slackSigningSecret,
      whatsappVerifyToken: overrides?.whatsappVerifyToken,
    },
    gateway: {
      receive: async () => ({ ok: true }),
    },
    services: {
      pairing,
      hooks,
    },
  } as unknown as AppContext;
}

describe("handleWebhookRoutes", () => {
  it("returns pending pairing requests", async () => {
    const response = await handleWebhookRoutes(
      createContext(),
      new Request("http://localhost/pairing/pending?platform=telegram"),
      new URL("http://localhost/pairing/pending?platform=telegram"),
    );

    expect(response).not.toBeNull();
    const body = await response?.json();
    expect(body).toEqual({
      requests: [{ platform: "telegram" }],
    });
  });

  it("rejects invalid slack signatures", async () => {
    const response = await handleWebhookRoutes(
      createContext({ slackSigningSecret: "secret" }),
      new Request("http://localhost/webhooks/slack", {
        method: "POST",
        headers: {
          "x-slack-request-timestamp": "123",
          "x-slack-signature": "v0=bad",
        },
        body: JSON.stringify({ event: {} }),
      }),
      new URL("http://localhost/webhooks/slack"),
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: "Invalid Slack signature.",
    });
  });

  it("verifies whatsapp subscriptions", async () => {
    const response = await handleWebhookRoutes(
      createContext({ whatsappVerifyToken: "verify-me" }),
      new Request(
        "http://localhost/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=ready",
      ),
      new URL(
        "http://localhost/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=ready",
      ),
    );

    expect(response?.status).toBe(200);
    await expect(response?.text()).resolves.toBe("ready");
  });

  it("returns null for non-webhook routes", async () => {
    const response = await handleWebhookRoutes(
      createContext(),
      new Request("http://localhost/not-webhooks"),
      new URL("http://localhost/not-webhooks"),
    );

    expect(response).toBeNull();
  });
});
