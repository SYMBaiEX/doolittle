import type { IAgentRuntime, Memory } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppServices } from "@/services";
import type { AppServerSnapshot } from "@/services/terminal/app-server";
import { createAppServerAction } from "./app-server-action";

function fixture() {
  const snapshot: AppServerSnapshot = {
    session: {
      id: "terminal-1",
      processId: 42,
      cwd: "/workspace/blog",
      command: "bun run dev",
    } as never,
    status: "starting",
    output: "Booting",
  };
  const appServers = {
    start: vi.fn(async () => snapshot),
    status: vi.fn(async () => snapshot),
    stop: vi.fn(() => ({ ...snapshot, status: "stopped" })),
  };
  const services = {
    terminal: { appServers },
    settings: { get: () => ({ execution: { backend: "local" } }) },
  } as unknown as AppServices;
  const runtime = {
    getSetting: (key: string) =>
      key === "ELIZA_RUNTIME_MODE" ? "local-yolo" : undefined,
  } as unknown as IAgentRuntime;
  const message = {
    roomId: "chat-a",
    content: { text: "Start the app", source: "desktop" },
  } as unknown as Memory;
  return {
    appServers,
    action: createAppServerAction(services),
    runtime,
    message,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("managed app native action", () => {
  it("continues while starting and exposes session/PID without claiming readiness", async () => {
    const { action, appServers, runtime, message } = fixture();
    const result = await action.handler(runtime, message, undefined, {
      parameters: {
        operation: "start",
        command: "bun run dev",
        cwd: "/workspace/blog",
      },
    });
    expect(result).toMatchObject({ success: true, continueChain: true });
    expect(result?.text).toContain("No HTTP-ready URL has been verified");
    expect(result?.text).toContain("process: 42");
    expect(appServers.start).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "chat-a",
        cwd: "/workspace/blog",
        command: "bun run dev",
      }),
    );
  });

  it("surfaces a previously ready process that now fails its health check", async () => {
    const { action, appServers, runtime, message } = fixture();
    appServers.status.mockResolvedValue({
      session: {
        id: "terminal-1",
        processId: 42,
        cwd: "/workspace/blog",
        command: "bun run dev",
      } as never,
      status: "unhealthy",
      url: "http://localhost:3001/",
      output: "ENOENT: missing .next manifest",
    });
    const result = await action.handler(runtime, message, undefined, {
      parameters: { operation: "status", sessionId: "terminal-1" },
    });

    expect(result).toMatchObject({
      success: false,
      error: "APP_SERVER_UNHEALTHY",
      text: expect.stringContaining("failed the HTTP health check"),
    });
    expect(result?.text).toContain("Stop it before a production build");
    expect(result?.text).toContain("http://localhost:3001/");
  });

  it("honors runtime local-safe even if the process environment says local-yolo", async () => {
    vi.stubEnv("ELIZA_RUNTIME_MODE", "local-yolo");
    const { action, appServers, message } = fixture();
    const runtime = {
      getSetting: (key: string) =>
        key === "ELIZA_RUNTIME_MODE" ? "local-safe" : undefined,
    } as unknown as IAgentRuntime;
    const result = await action.handler(runtime, message, undefined, {
      parameters: {
        operation: "start",
        command: "bun run dev",
        cwd: "/workspace/blog",
      },
    });
    expect(result).toMatchObject({
      success: false,
      error: "APP_SERVER_FAILED",
    });
    expect(result?.text).toContain("sandbox policy was preserved");
    expect(appServers.start).not.toHaveBeenCalled();
  });

  it("allows stopping an owned app after policy changes and never starts a replacement", async () => {
    const { action, appServers, message } = fixture();
    const runtime = {
      getSetting: () => "local-safe",
    } as unknown as IAgentRuntime;
    const result = await action.handler(runtime, message, undefined, {
      parameters: { operation: "stop", sessionId: "terminal-1" },
    });
    expect(result?.success).toBe(true);
    expect(appServers.stop).toHaveBeenCalledWith("chat-a", "terminal-1");
    expect(appServers.start).not.toHaveBeenCalled();
  });

  it("does not grant persistent host execution to a remote channel", async () => {
    const { action, appServers, runtime, message } = fixture();
    const remote = {
      ...message,
      content: { text: "Start the app", source: "discord" },
    } as Memory;
    const result = await action.handler(runtime, remote, undefined, {
      parameters: {
        operation: "start",
        command: "bun run dev",
        cwd: "/workspace/blog",
      },
    });
    expect(result?.success).toBe(false);
    expect(appServers.start).not.toHaveBeenCalled();
  });
});
