import { describe, expect, it } from "bun:test";
import { createTrajectoryLoggerPlugin } from ".";

describe("createTrajectoryLoggerPlugin", () => {
  it("creates a plugin descriptor", () => {
    const plugin = createTrajectoryLoggerPlugin({
      trajectories: {
        exportLatest: () => ({ ok: true }),
        listBundles: () => [],
        compareLatest: () => ({ score: 1 }),
      },
    });

    expect(plugin.name).toBe("trajectory-logger");
    expect(plugin.services).toHaveLength(1);
  });
});
