import { describe, expect, it } from "vitest";
import { EngineBotBackend } from "./engine-bot-backend";
import type { EngineClient } from "./engine-client";

describe("EngineBotBackend", () => {
  it("starts through the shared engine with a private bot environment and stops only its worker", async () => {
    const calls: string[] = [];
    let environment: Record<string, string> = {};
    const engine = {
      hasBot: () => true,
      startBot: async (_botId: string, env: Record<string, string>) => {
        calls.push("start");
        environment = env;
        return {
          botId: "bot-one",
          agentId: "agent-1",
          name: "Bot One",
          url: "http://127.0.0.1:43210",
        };
      },
      stopBot: async (botId: string) => {
        calls.push(`stop:${botId}`);
      },
    } as unknown as EngineClient;
    const runtimeFetch = async () =>
      new Response(JSON.stringify({ stopped: true }), { status: 200 });
    const backend = new EngineBotBackend(
      { executable: "/not/executed", args: [], repoRoot: "/repo" },
      "/bot-data",
      "/workspace",
      runtimeFetch as typeof fetch,
      {
        isolatedEnvironment: { PATH: "/bin", DOOLITTLE_BOT_RUNTIME: "worker" },
        expectedBotId: "bot-one",
        expectedAgentId: "agent-1",
        workerHostHandler: async () => true,
      },
      () => engine,
    );
    expect((await backend.start()).phase).toBe("ready");
    expect(environment.DOOLITTLE_HOST_BOT_ID).toBe("bot-one");
    expect(environment.DOOLITTLE_DESKTOP_CONTROL_TOKEN).toMatch(
      /^[0-9a-f]{64}$/u,
    );
    expect(environment.PGLITE_DATA_DIR).toBe("/bot-data/pglite");
    await backend.stop();
    expect(calls).toEqual(["start", "stop:bot-one"]);
    expect(backend.getState().phase).toBe("stopped");
  });
});
