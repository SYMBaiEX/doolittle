import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleWebhookRoutes } from "@/server/routes/webhooks";

function createContext(overrides?: {
  slackSigningSecret?: string;
  whatsappVerifyToken?: string;
}) {
  const pairing = {
    listPending: (platform?: string) => [{ platform: platform ?? "telegram" }],
    listApproved: (platform?: string) => [
      { platform: platform ?? "telegram", userId: "approved-user" },
    ],
    approve: (platform: string, code: string) => ({ platform, code, ok: true }),
    deny: (platform: string, code: string) => ({ platform, code, ok: true }),
    revoke: (platform: string, userId: string) => ({
      platform,
      userId,
      ok: true,
    }),
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
      truncated: false,
    });
  });

  it("returns approved senders from the official pairing allowlist", async () => {
    const response = await handleWebhookRoutes(
      createContext(),
      new Request("http://localhost/pairing/approved?platform=telegram"),
      new URL("http://localhost/pairing/approved?platform=telegram"),
    );

    expect(response).not.toBeNull();
    await expect(response?.json()).resolves.toEqual({
      approved: [{ platform: "telegram", userId: "approved-user" }],
      truncated: false,
    });
  });

  it("validates pairing queries and mutation bodies before using the service", async () => {
    const context = createContext();
    const invalidQuery = await handleWebhookRoutes(
      context,
      new Request("http://localhost/pairing/pending?platform=api"),
      new URL("http://localhost/pairing/pending?platform=api"),
    );
    expect(invalidQuery?.status).toBe(400);
    await expect(invalidQuery?.json()).resolves.toEqual({
      error: "Unsupported pairing platform.",
    });

    const invalidLimit = await handleWebhookRoutes(
      context,
      new Request("http://localhost/pairing/approved?limit=501"),
      new URL("http://localhost/pairing/approved?limit=501"),
    );
    expect(invalidLimit?.status).toBe(400);

    const malformed = await handleWebhookRoutes(
      context,
      new Request("http://localhost/pairing/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform: "telegram", code: "invalid" }),
      }),
      new URL("http://localhost/pairing/approve"),
    );
    expect(malformed?.status).toBe(400);
    await expect(malformed?.json()).resolves.toEqual({
      error: "Invalid pairing approval.",
    });
  });

  it("bounds pairing list responses and reports truncation", async () => {
    const context = createContext();
    context.services.pairing.listApproved = async () => [
      {
        id: "approved-newest",
        platform: "telegram",
        userId: "newest",
        status: "approved",
        approvedAt: "2026-08-09T12:00:00.000Z",
      },
      {
        id: "approved-older",
        platform: "telegram",
        userId: "older",
        status: "approved",
        approvedAt: "2026-08-09T11:00:00.000Z",
      },
    ];
    const response = await handleWebhookRoutes(
      context,
      new Request("http://localhost/pairing/approved?limit=1"),
      new URL("http://localhost/pairing/approved?limit=1"),
    );

    await expect(response?.json()).resolves.toEqual({
      approved: [
        expect.objectContaining({ platform: "telegram", userId: "newest" }),
      ],
      truncated: true,
    });
  });

  it("uses the public pairing revoke operation for approved senders", async () => {
    const response = await handleWebhookRoutes(
      createContext(),
      new Request("http://localhost/pairing/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform: "telegram", userId: "alice" }),
      }),
      new URL("http://localhost/pairing/revoke"),
    );

    await expect(response?.json()).resolves.toEqual({
      revoked: { platform: "telegram", userId: "alice", ok: true },
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

  it("returns a client error for unsupported managed hook events", async () => {
    const context = createContext();
    context.services.hooks.add = () => {
      throw new Error('Unsupported hook event "made:up".');
    };
    const request = new Request("http://localhost/hooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "made:up",
        name: "invalid",
        template: "{{value}}",
      }),
    });

    const response = await handleWebhookRoutes(
      context,
      request,
      new URL(request.url),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: 'Unsupported hook event "made:up".',
    });
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
