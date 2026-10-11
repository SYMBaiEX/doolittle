import { describe, expect, it, vi } from "vitest";
import { BackendManager, sourceRuntimeTarget } from "./backend";
import { EngineBotBackend } from "./engine-bot-backend";

it("uses the same bundled entry for a source lead and its worker isolates", () => {
  expect(sourceRuntimeTarget(process.cwd()).args).toEqual([
    "dist/index.js",
    "api",
  ]);
});

describe.each(["lead", "named"] as const)("%s emergency control", (kind) => {
  function fixture() {
    const runtimeFetch = vi.fn(async () => Response.json({ stopped: true }));
    const target = { executable: "/not/executed", args: [], repoRoot: "/repo" };
    const backend =
      kind === "lead"
        ? new BackendManager(
            target,
            "/data",
            "/workspace",
            runtimeFetch as typeof fetch,
          )
        : new EngineBotBackend(
            target,
            "/data",
            "/workspace",
            runtimeFetch as typeof fetch,
            {
              expectedBotId: "bot-one",
              expectedAgentId: "agent-one",
              isolatedEnvironment: { PATH: "/bin" },
              workerHostHandler: async () => true,
            },
            () => {
              throw new Error("not used");
            },
          );
    vi.spyOn(backend, "hasLiveRuntime").mockReturnValue(true);
    return { backend, runtimeFetch };
  }

  it("cancels a live degraded runtime when its control endpoint is known", async () => {
    const { backend, runtimeFetch } = fixture();
    vi.spyOn(backend, "getState").mockReturnValue({
      phase: "degraded",
      url: "http://127.0.0.1:43210",
    });
    await backend.stopAllOwnedExecutions();
    expect(runtimeFetch).toHaveBeenCalledOnce();
  });

  it("does not confirm a live degraded runtime stopped without an endpoint", async () => {
    const { backend, runtimeFetch } = fixture();
    vi.spyOn(backend, "getState").mockReturnValue({ phase: "degraded" });
    await expect(backend.stopAllOwnedExecutions()).rejects.toThrow(
      /could not be confirmed/i,
    );
    expect(runtimeFetch).not.toHaveBeenCalled();
  });
});
