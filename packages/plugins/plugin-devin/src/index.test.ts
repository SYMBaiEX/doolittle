import { describe, expect, it } from "vitest";
import { createDevinPlugin } from "./index";

describe("createDevinPlugin", () => {
  it("exposes linked Devin runtime credentials", async () => {
    const plugin = createDevinPlugin({
      enabled: true,
      command: "devin",
      model: "swe-1-6-fast",
      getStatus: () => ({
        provider: "devin",
        available: true,
        reusable: true,
        nativeReady: true,
        authMode: "devin",
        source: "devin auth status",
        accountLabel: "Operator",
        detail: "Devin CLI reports an active login.",
      }),
    });

    expect(plugin.name).toBe("@elizaos/plugin-devin");
    expect(plugin.models).toBeDefined();
    const serviceCtor = plugin.services?.[0];
    expect(serviceCtor).toBeDefined();
    const service = await (
      serviceCtor as unknown as {
        start(runtime?: unknown): Promise<{ runtimeCredentials(): unknown }>;
      }
    ).start(undefined);
    expect(service.runtimeCredentials()).toEqual(
      expect.objectContaining({
        provider: "devin",
        upstreamProvider: "devin-cli",
        reusable: true,
        model: "swe-1-6-fast",
        command: "devin",
      }),
    );
  });

  it("calls Devin print mode when enabled", async () => {
    const plugin = createDevinPlugin({
      enabled: true,
      command: "devin",
      model: "swe-1-6-fast",
      getStatus: () => ({
        provider: "devin",
        available: true,
        reusable: true,
        nativeReady: true,
        detail: "ready",
      }),
      invokeCliPrint: async ({ prompt, model, command, permissionMode }) => {
        expect(prompt).toBe("hello");
        expect(model).toBe("swe-1-6-fast");
        expect(command).toBe("devin");
        expect(permissionMode).toBe("auto");
        return "devin says hello";
      },
    });
    const handler = plugin.models?.TEXT_LARGE;
    expect(handler).toBeDefined();
    const result = await handler?.(
      {
        getSetting: (key: string) =>
          key === "runtimeSettings"
            ? JSON.stringify({
                model: {
                  provider: "devin",
                  model: "swe-1-6-fast",
                  baseUrl: "",
                },
              })
            : null,
      } as never,
      {
        prompt: "hello",
      } as never,
    );
    expect(result).toBe("devin says hello");
  });

  it("uses the current workspace for every Devin invocation", async () => {
    let cwd = "/workspace/first";
    const seenCwds: Array<string | undefined> = [];
    const plugin = createDevinPlugin({
      enabled: true,
      getCwd: () => cwd,
      getStatus: () => ({
        provider: "devin",
        available: true,
        reusable: true,
        nativeReady: true,
        detail: "ready",
      }),
      invokeCliPrint: async (params) => {
        seenCwds.push(params.cwd);
        return "ok";
      },
    });
    const handler = plugin.models?.TEXT_LARGE;
    const runtime = {
      getSetting: () =>
        JSON.stringify({
          model: {
            provider: "devin",
          },
        }),
    } as never;

    await handler?.(runtime, { prompt: "first" } as never);
    cwd = "/workspace/second";
    await handler?.(runtime, { prompt: "second" } as never);

    expect(seenCwds).toEqual(["/workspace/first", "/workspace/second"]);
  });

  it("rejects non-Devin runtime provider mismatches", async () => {
    const plugin = createDevinPlugin({
      enabled: true,
      getStatus: () => ({
        provider: "devin",
        available: true,
        reusable: true,
        nativeReady: true,
        detail: "ready",
      }),
    });
    const handler = plugin.models?.TEXT_LARGE;
    await expect(
      handler?.(
        {
          getSetting: () =>
            JSON.stringify({
              model: {
                provider: "ollama",
              },
            }),
        } as never,
        { prompt: "hello" } as never,
      ),
    ).rejects.toThrow("runtime provider is ollama");
  });

  it("requires an active Devin CLI login", async () => {
    const plugin = createDevinPlugin({
      enabled: true,
      getStatus: () => ({
        provider: "devin",
        available: true,
        reusable: false,
        nativeReady: false,
        detail: "not ready",
      }),
    });
    const handler = plugin.models?.TEXT_LARGE;
    await expect(
      handler?.(
        {
          getSetting: () =>
            JSON.stringify({
              model: {
                provider: "devin",
              },
            }),
        } as never,
        { prompt: "hello" } as never,
      ),
    ).rejects.toThrow("No reusable linked Devin CLI session");
  });
});
