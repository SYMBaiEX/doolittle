import { expect, it } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { handleTrajectoryRoutes } from "../../packages/agent/src/server/routes/trajectories";

it("replays the exact bundle label before a manifest path suffix", async () => {
  const context = {
    services: {
      trajectoryEvaluation: {
        listBundles: () => [
          { label: "other", manifestPath: "/bundles/other-manifest.json" },
          { label: "manifest.json", manifestPath: "/bundles/exact.json" },
        ],
        replayBundle: (path: string) => ({ manifestPath: path }),
      },
    },
  } as unknown as AppContext;
  const url = new URL(
    "http://127.0.0.1/trajectories/replay?label=manifest.json",
  );
  const response = await handleTrajectoryRoutes(context, new Request(url), url);
  expect(await response?.json()).toEqual({
    replay: { manifestPath: "/bundles/exact.json" },
  });
});
