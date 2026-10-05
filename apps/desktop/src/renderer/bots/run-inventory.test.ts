import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());
vi.mock("../lib", () => ({ desktopRequest: request }));

import { loadOwnedRunInventory } from "./run-inventory";

beforeEach(() => {
  request.mockReset();
});
describe("immutable run inventory", () => {
  it("keeps another bot's runs when one worker crashes", async () => {
    request.mockImplementation(
      async (_path, _method, _body, _signal, _timeout, botId) => {
        if (botId === "broken") throw new Error("Unavailable");
        return {
          runs: [{ botId, runId: "live", sessionId: "one", source: "desktop" }],
        };
      },
    );
    const result = await loadOwnedRunInventory(["working", "broken"]);
    expect(result.runs).toHaveLength(1);
    expect(result.warnings).toEqual([expect.stringContaining("broken")]);
  });
  it("rejects invented or conflicting owners instead of retargeting them", async () => {
    request.mockResolvedValue({
      runs: [{ botId: "other", runId: "live", sessionId: "one" }],
    });
    await expect(loadOwnedRunInventory(["working"])).rejects.toThrow(
      /unavailable/u,
    );
    request.mockResolvedValue({ runs: [{ runId: "live", sessionId: "one" }] });
    await expect(loadOwnedRunInventory(["working"])).rejects.toThrow(
      /unavailable/u,
    );
  });
  it("adopts specialist runs only with exact broker attribution", async () => {
    const run = {
      botId: "specialist",
      runId: "consult:one",
      sessionId: "child",
      source: "desktop-consultation",
    };
    request.mockImplementation(async (path) =>
      path.startsWith("/bots/")
        ? {
            consultations: [
              {
                target: {
                  botId: run.botId,
                  sessionId: run.sessionId,
                  runId: run.runId,
                },
              },
            ],
          }
        : { runs: [run] },
    );
    expect((await loadOwnedRunInventory(["specialist"])).runs).toEqual([run]);
    request.mockImplementation(async (path) =>
      path.startsWith("/bots/")
        ? { consultations: [{ target: { ...run, botId: "another" } }] }
        : { runs: [run] },
    );
    const rejected = await loadOwnedRunInventory(["specialist"]);
    expect(rejected.runs).toEqual([]);
    expect(rejected.warnings).toHaveLength(1);
  });
  it("rejects a durable run identity duplicated across workers", async () => {
    request.mockImplementation(
      async (_path, _method, _body, _signal, _timeout, botId) => ({
        runs: [{ botId, runId: "same", sessionId: "one" }],
      }),
    );
    await expect(loadOwnedRunInventory(["one", "two"])).rejects.toThrow(
      /Conflicting/u,
    );
  });
});
