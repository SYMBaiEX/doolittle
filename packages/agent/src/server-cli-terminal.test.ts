import { request as httpRequest } from "node:http";
import { DOOLITTLE_SHELL_SERVICE } from "@doolittle/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acquireCliTerminalEndpoint } from "@/entrypoint/cli-terminal-endpoint";
import type { AppContext } from "@/runtime/bootstrap";
import { createApiServer, type OwnedApiServer } from "@/server";
import { TerminalCancellationUnavailableError } from "@/services/terminal/command/orchestrator";

const keys = [
  "ELIZA_API_BIND",
  "ELIZA_API_PORT",
  "ELIZA_PORT",
  "ELIZA_UI_PORT",
  "ELIZA_TERMINAL_RUN_TOKEN",
  "ELIZA_API_TOKEN",
] as const;
const baseline = new Map(keys.map((key) => [key, process.env[key]]));
let owned: OwnedApiServer | undefined;
afterEach(async () => {
  await owned?.close();
  owned = undefined;
  for (const key of keys) {
    const value = baseline.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
function context(run: (...args: unknown[]) => Promise<unknown>): AppContext {
  return {
    config: { host: "127.0.0.1", port: 0 },
    runtime: {
      getService: (name: string) =>
        name === DOOLITTLE_SHELL_SERVICE ? { run } : null,
      routes: [
        {
          path: "/api/terminal/run",
          type: "POST",
          routeHandler: () => {
            throw new Error("Plugin must not intercept");
          },
        },
      ],
    },
    services: { logger: { error: vi.fn(), captureError: vi.fn() } },
    ensureDeferredHydration: () => {
      throw new Error("No API hydration");
    },
    gateway: {
      startIngress: () => {
        throw new Error("No ingress");
      },
    },
  } as unknown as AppContext;
}
const result = {
  command: "probe",
  stdout: "ok\n",
  stderr: "",
  exitCode: 0,
  timedOut: false,
  durationMs: 1,
};
function send(
  token?: string,
  options: {
    path?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
) {
  if (!owned) throw new Error("Missing owned listener");
  return fetch(`${owned.address.url}${options.path ?? "/api/terminal/run"}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-eliza-terminal-token": token } : {}),
      ...options.headers,
    },
    body:
      options.body ?? JSON.stringify({ command: "probe", captureOutput: true }),
  });
}
describe("production private terminal HTTP profile", () => {
  it("reports unsupported cancellation capability without relaxing its policy", async () => {
    const run = vi.fn(async (...args: unknown[]) => {
      expect(args[3]).toEqual({ requireCancellation: true });
      throw new TerminalCancellationUnavailableError();
    });
    owned = await acquireCliTerminalEndpoint(context(run));
    const response = await send(process.env.ELIZA_TERMINAL_RUN_TOKEN);
    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("execution policy was not changed"),
    });
  });
  it("requires only its fresh SDK capability, never inherited API bearer or plugin routes", async () => {
    process.env.ELIZA_API_TOKEN = "unrelated-inherited-test-bearer";
    const run = vi.fn(async () => result);
    owned = await acquireCliTerminalEndpoint(context(run));
    const token = process.env.ELIZA_TERMINAL_RUN_TOKEN;
    expect((await send()).status).toBe(401);
    expect((await send("wrong-test-token")).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
    const response = await send(token);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      stdout: "ok\n",
      exitCode: 0,
    });
    expect(run).toHaveBeenCalledOnce();
    expect(process.env.ELIZA_API_TOKEN).toBe("unrelated-inherited-test-bearer");
    expect((await send(token, { path: "/runtime" })).status).toBe(404);
    expect(
      (
        await send(token, {
          body: JSON.stringify({ command: "probe", captureOutput: false }),
        })
      ).status,
    ).toBe(400);
    expect(run).toHaveBeenCalledOnce();
  });
  it("retains SDK host/origin and bounded body rejection before execution", async () => {
    process.env.ELIZA_TERMINAL_RUN_TOKEN = "test-capability";
    const run = vi.fn(async () => result);
    owned = await createApiServer(context(run), {
      terminalOnly: true,
      maxRequestBodyBytes: 80,
    });
    const hostStatus = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        `${owned?.address.url}/api/terminal/run`,
        {
          method: "POST",
          headers: {
            host: "foreign.example",
            "x-eliza-terminal-token": "test-capability",
          },
        },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode ?? 0));
        },
      );
      request.on("error", reject);
      request.end();
    });
    expect(hostStatus).toBe(403);
    expect(
      (
        await send("test-capability", {
          headers: { origin: "https://foreign.example" },
        })
      ).status,
    ).toBe(403);
    expect(
      (await send("test-capability", { body: "x".repeat(81) })).status,
    ).toBe(413);
    expect(run).not.toHaveBeenCalled();
  });
  it("aborts and drains a captured native request before closing", async () => {
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let aborted = false;
    let drained = false;
    const run = async (...args: unknown[]) => {
      const signal = args[2] as AbortSignal;
      expect(signal).toBeInstanceOf(AbortSignal);
      started();
      await new Promise<void>((resolve) =>
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            resolve();
          },
          { once: true },
        ),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      drained = true;
      return { ...result, exitCode: 130 };
    };
    owned = await acquireCliTerminalEndpoint(context(run));
    const pending = send(process.env.ELIZA_TERMINAL_RUN_TOKEN).catch(
      () => undefined,
    );
    await ready;
    await owned.close();
    await pending;
    expect(aborted).toBe(true);
    expect(drained).toBe(true);
    await expect(send(process.env.ELIZA_TERMINAL_RUN_TOKEN)).rejects.toThrow();
  });
  it("rejects non-owned listener configurations", async () => {
    process.env.ELIZA_TERMINAL_RUN_TOKEN = "test-capability";
    const app = context(async () => result);
    await expect(
      createApiServer(
        { ...app, config: { ...app.config, host: "0.0.0.0" } },
        { terminalOnly: true },
      ),
    ).rejects.toThrow("owned loopback");
    await expect(
      createApiServer(
        { ...app, config: { ...app.config, port: 3000 } },
        { terminalOnly: true },
      ),
    ).rejects.toThrow("owned loopback");
  });
  it("reports unconfirmed captured work termination instead of claiming successful cleanup", async () => {
    process.env.ELIZA_TERMINAL_RUN_TOKEN = "test-capability";
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    let release!: () => void;
    const work = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = async () => {
      markStarted();
      await work;
      return result;
    };
    const listener = await createApiServer(context(run), {
      terminalOnly: true,
      shutdownTimeoutMs: 20,
    });
    owned = listener;
    const pending = send("test-capability").catch(() => undefined);
    await started;
    try {
      await expect(listener.close()).rejects.toThrow(
        "cleanup could not be confirmed",
      );
    } finally {
      release();
      await pending;
      // close already stopped/destroyed the listener; the noncooperative fixture
      // is now released, but its cached unconfirmed close remains a rejection.
      owned = undefined;
    }
  });
  it("fails closed when its captured capability is removed or replaced", async () => {
    delete process.env.ELIZA_API_TOKEN;
    const run = vi.fn(async () => result);
    owned = await acquireCliTerminalEndpoint(context(run));
    const originalToken = process.env.ELIZA_TERMINAL_RUN_TOKEN;
    delete process.env.ELIZA_TERMINAL_RUN_TOKEN;
    expect((await send()).status).toBe(401);
    expect((await send(originalToken)).status).toBe(401);
    process.env.ELIZA_TERMINAL_RUN_TOKEN = "later-test-capability";
    expect((await send("later-test-capability")).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
});
