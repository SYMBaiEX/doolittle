import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../../chat";
import { handleTrajectoryCompareCommands } from "./compare";

function createContext(options?: { native?: boolean }) {
  const context = {
    runtime: {
      getService: (service: string) =>
        service === "trajectory_logger" && options?.native
          ? {
              compareLatest: () => ({
                source: "native",
                compared: true,
              }),
            }
          : undefined,
    },
    services: {
      trajectories: {
        compareLatest: () => ({ source: "service", compared: true }),
        compareBundles: (left: string, right: string) => ({
          left,
          right,
          compared: true,
        }),
        listBundles: () => [
          {
            manifestPath: "/tmp/baseline.json",
            label: "baseline",
            createdAt: "2026-04-01T00:00:00.000Z",
            messageCount: 1,
            sessionCount: 1,
          },
          {
            manifestPath: "/tmp/target.json",
            label: "target",
            createdAt: "2026-04-01T01:00:00.000Z",
            messageCount: 2,
            sessionCount: 2,
          },
        ],
      },
    },
  } as unknown as AgentExecutionContext;

  return { context };
}

describe("trajectory compare commands", () => {
  it("uses native compare latest when available", async () => {
    const { context } = createContext({ native: true });
    const compared = await handleTrajectoryCompareCommands(
      "/trajectories compare latest",
      context,
    );
    expect(compared).toContain('"source": "native"');
  });

  it("falls back to service compare for explicit pair manifests", async () => {
    const { context } = createContext();
    const compared = await handleTrajectoryCompareCommands(
      "/trajectories compare baseline :: target",
      context,
    );

    expect(compared).toContain('"/tmp/baseline.json"');
    expect(compared).toContain('"/tmp/target.json"');
  });

  it("validates compare usage", async () => {
    const { context } = createContext();
    const usage = await handleTrajectoryCompareCommands(
      "/trajectories compare baseline",
      context,
    );
    expect(usage).toBe(
      "Usage: /trajectories compare <left-manifest|label> :: <right-manifest|label>",
    );
  });
});
