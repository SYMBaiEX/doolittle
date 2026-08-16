import { createHmac } from "node:crypto";
import { request as httpRequest } from "node:http";
import { DOOLITTLE_SHELL_SERVICE } from "@doolittle/contracts";
import type { IAgentRuntime, Route } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { startApiServer, stopApiServer } from "@/server";

const authorization = vi.hoisted(() => ({ check: vi.fn() }));

vi.mock("@elizaos/agent/api/server-helpers-auth", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@elizaos/agent/api/server-helpers-auth")
    >();
  return { ...original, isAuthorized: authorization.check };
});

interface HttpResult {
  body: string;
  connection: string | undefined;
  status: number;
}

function contextWithRoute(
  onDispatch: () => void,
  onTerminalRun = vi.fn(),
): AppContext {
  const routes: Route[] = [
    {
      path: "/ingress-probe",
      type: "POST",
      routeHandler: async () => {
        onDispatch();
        return { body: { ok: true }, status: 200 };
      },
    },
  ];
  return {
    config: { host: "127.0.0.1", port: 0 },
    gateway: { receive: async () => ({ ok: true }) },
    runtime: {
      getService(name: string) {
        if (name !== DOOLITTLE_SHELL_SERVICE) return null;
        return {
          async run(command: string, timeoutMs: number) {
            onTerminalRun(command, timeoutMs);
            return {
              backend: "local",
              command,
              completedAt: "2026-08-14T00:00:00.001Z",
              cwd: "/workspace",
              durationMs: 1,
              exitCode: 0,
              id: "ingress-terminal-run",
              startedAt: "2026-08-14T00:00:00.000Z",
              stderr: "",
              stdout: "ok\n",
              timedOut: false,
              timeoutMs,
            };
          },
        };
      },
      routes,
    } as unknown as IAgentRuntime,
    services: { logger: { error: vi.fn() } },
  } as unknown as AppContext;
}

function send(
  url: string,
  options: {
    body?: string[];
    headers?: Record<string, string>;
    method?: string;
    path?: string;
  },
): Promise<HttpResult> {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        headers: options.headers,
        host: target.hostname,
        method: options.method ?? "POST",
        path: options.path ?? "/ingress-probe",
        port: Number(target.port),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          resolve({
            body: Buffer.concat(chunks).toString("utf8"),
            connection:
              typeof response.headers.connection === "string"
                ? response.headers.connection
                : undefined,
            status: response.statusCode ?? 0,
          });
        });
      },
    );
    request.on("error", reject);
    for (const chunk of options.body ?? []) request.write(chunk);
    request.end();
  });
}

describe("HTTP ingress security boundary", () => {
  const originalBind = process.env.ELIZA_API_BIND;

  beforeEach(async () => {
    await stopApiServer();
    authorization.check.mockImplementation((request) => {
      if (request.headers["x-test-require-auth"] !== "true") return true;
      return request.headers.authorization === "Bearer operator-secret";
    });
  });

  afterEach(async () => {
    await stopApiServer();
    if (originalBind === undefined) delete process.env.ELIZA_API_BIND;
    else process.env.ELIZA_API_BIND = originalBind;
  });

  it("rejects declared and chunked overflow before route dispatch", async () => {
    const onDispatch = vi.fn();
    const server = await startApiServer(contextWithRoute(onDispatch), {
      maxRequestBodyBytes: 4,
    });

    const declared = await send(server.url, {
      headers: { "content-length": "5" },
    });
    const chunked = await send(server.url, {
      body: ["ab", "cde"],
      headers: { "transfer-encoding": "chunked" },
    });

    expect(declared).toMatchObject({ connection: "close", status: 413 });
    expect(chunked).toMatchObject({ connection: "close", status: 413 });
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it("dispatches a request exactly at the configured limit", async () => {
    const onDispatch = vi.fn();
    const server = await startApiServer(contextWithRoute(onDispatch), {
      maxRequestBodyBytes: 2,
    });

    const result = await send(server.url, {
      body: ["{}"],
      headers: {
        "content-length": "2",
        "content-type": "application/json",
      },
    });

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ ok: true });
    expect(onDispatch).toHaveBeenCalledOnce();
  });

  it.each(["GET", "HEAD", "OPTIONS"])(
    "rejects a body-framed %s request and closes the connection",
    async (method) => {
      const onDispatch = vi.fn();
      const server = await startApiServer(contextWithRoute(onDispatch), {
        maxRequestBodyBytes: 4,
      });

      const result = await send(server.url, {
        body: ["x"],
        headers: { "content-length": "1" },
        method,
      });

      expect(result).toMatchObject({ connection: "close", status: 400 });
      expect(onDispatch).not.toHaveBeenCalled();
    },
  );

  it("requires API and terminal credentials together at the HTTP boundary", async () => {
    const previousTerminalToken = process.env.ELIZA_TERMINAL_RUN_TOKEN;
    process.env.ELIZA_TERMINAL_RUN_TOKEN = "terminal-secret";
    const onTerminalRun = vi.fn();
    try {
      const server = await startApiServer(
        contextWithRoute(vi.fn(), onTerminalRun),
      );
      const body = JSON.stringify({
        captureOutput: true,
        clientId: "release-security-test",
        command: "pwd",
      });
      const common = {
        body: [body],
        headers: {
          "content-length": String(Buffer.byteLength(body)),
          "content-type": "application/json",
          "x-test-require-auth": "true",
        },
        path: "/api/terminal/run",
      };

      const terminalOnly = await send(server.url, {
        ...common,
        headers: {
          ...common.headers,
          "x-eliza-terminal-token": "terminal-secret",
        },
      });
      const apiOnly = await send(server.url, {
        ...common,
        headers: {
          ...common.headers,
          authorization: "Bearer operator-secret",
        },
      });
      const both = await send(server.url, {
        ...common,
        headers: {
          ...common.headers,
          authorization: "Bearer operator-secret",
          "x-eliza-terminal-token": "terminal-secret",
        },
      });

      expect(terminalOnly.status).toBe(401);
      expect(apiOnly.status).toBe(401);
      expect(both.status).toBe(200);
      expect(onTerminalRun).toHaveBeenCalledOnce();
    } finally {
      if (previousTerminalToken === undefined) {
        delete process.env.ELIZA_TERMINAL_RUN_TOKEN;
      } else {
        process.env.ELIZA_TERMINAL_RUN_TOKEN = previousTerminalToken;
      }
    }
  });

  it("admits only valid WhatsApp subscription verification without API auth", async () => {
    const context = contextWithRoute(vi.fn());
    (context.config as { whatsappVerifyToken?: string }).whatsappVerifyToken =
      "verify-me";
    const server = await startApiServer(context);
    const path =
      "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=ready";

    const valid = await send(server.url, {
      headers: { "x-test-require-auth": "true" },
      method: "GET",
      path,
    });
    const invalid = await send(server.url, {
      headers: { "x-test-require-auth": "true" },
      method: "GET",
      path: path.replace("verify-me", "wrong-token"),
    });

    expect(valid).toMatchObject({ body: "ready", status: 200 });
    expect(invalid.status).toBe(403);
  });

  it("uses Slack's signature verifier rather than API auth or plugin routes", async () => {
    const pluginRoute = vi.fn();
    const context = contextWithRoute(vi.fn());
    (context.config as { slackSigningSecret?: string }).slackSigningSecret =
      "slack-secret";
    (context.runtime as unknown as { routes: Route[] }).routes.push({
      path: "/webhooks/slack",
      type: "POST",
      routeHandler: async () => {
        pluginRoute();
        return { body: { intercepted: true }, status: 200 };
      },
    });
    const server = await startApiServer(context);
    const body = JSON.stringify({ challenge: "slack-ready" });
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const signature = `v0=${createHmac("sha256", "slack-secret")
      .update(`v0:${timestamp}:${body}`)
      .digest("hex")}`;
    const headers = {
      "content-length": String(Buffer.byteLength(body)),
      "content-type": "application/json",
      "x-slack-request-timestamp": timestamp,
      "x-test-require-auth": "true",
    };

    const valid = await send(server.url, {
      body: [body],
      headers: { ...headers, "x-slack-signature": signature },
      path: "/webhooks/slack",
    });
    const invalid = await send(server.url, {
      body: [body],
      headers: { ...headers, "x-slack-signature": "v0=invalid" },
      path: "/webhooks/slack",
    });

    expect(valid.status).toBe(200);
    expect(JSON.parse(valid.body)).toEqual({ challenge: "slack-ready" });
    expect(invalid.status).toBe(403);
    expect(pluginRoute).not.toHaveBeenCalled();
  });

  it("uses WhatsApp's payload signature verifier without API auth", async () => {
    const context = contextWithRoute(vi.fn());
    (context.config as { whatsappAppSecret?: string }).whatsappAppSecret =
      "whatsapp-secret";
    const server = await startApiServer(context);
    const body = JSON.stringify({ entry: [] });
    const signature = `sha256=${createHmac("sha256", "whatsapp-secret")
      .update(body)
      .digest("hex")}`;
    const headers = {
      "content-length": String(Buffer.byteLength(body)),
      "content-type": "application/json",
      "x-test-require-auth": "true",
    };

    const valid = await send(server.url, {
      body: [body],
      headers: { ...headers, "x-hub-signature-256": signature },
      path: "/webhooks/whatsapp",
    });
    const invalid = await send(server.url, {
      body: [body],
      headers: { ...headers, "x-hub-signature-256": "sha256=invalid" },
      path: "/webhooks/whatsapp",
    });

    expect(valid.status).toBe(200);
    expect(JSON.parse(valid.body)).toEqual({ ignored: true, ok: true });
    expect(invalid.status).toBe(403);
  });

  it("keeps WhatsApp's missing signature configuration fail-closed", async () => {
    const context = contextWithRoute(vi.fn());
    Object.assign(context.config, {
      whatsappAccessToken: "access-token",
      whatsappPhoneNumberId: "phone-number",
      whatsappVerifyToken: "verify-token",
    });
    const server = await startApiServer(context);
    const body = JSON.stringify({ entry: [] });

    const response = await send(server.url, {
      body: [body],
      headers: {
        "content-length": String(Buffer.byteLength(body)),
        "content-type": "application/json",
        "x-test-require-auth": "true",
      },
      path: "/webhooks/whatsapp",
    });

    expect(response.status).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      error: "WhatsApp signature verification is not configured.",
    });
  });

  it("keeps all other webhook and API routes behind API authorization", async () => {
    const server = await startApiServer(contextWithRoute(vi.fn()));
    const headers = {
      "content-length": "2",
      "content-type": "application/json",
      "x-test-require-auth": "true",
    };

    const telegram = await send(server.url, {
      body: ["{}"],
      headers,
      path: "/webhooks/telegram",
    });
    const api = await send(server.url, { body: ["{}"], headers });

    expect(telegram.status).toBe(401);
    expect(api.status).toBe(401);
  });

  it("closes a request that stalls before its declared body is received", async () => {
    const server = await startApiServer(contextWithRoute(vi.fn()), {
      headersTimeoutMs: 50,
      requestTimeoutMs: 50,
    });
    const target = new URL(server.url);

    const status = await new Promise<number>((resolve, reject) => {
      const request = httpRequest({
        headers: { "content-length": "2" },
        host: target.hostname,
        method: "POST",
        path: "/ingress-probe",
        port: Number(target.port),
      });
      const timeout = setTimeout(
        () => reject(new Error("Timed out waiting for ingress timeout.")),
        2_000,
      );
      request.on("response", (response) => {
        response.resume();
        response.on("end", () => {
          clearTimeout(timeout);
          resolve(response.statusCode ?? 0);
        });
      });
      request.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      request.flushHeaders();
      request.write("{");
    });

    expect(status).toBe(408);
  });
});
