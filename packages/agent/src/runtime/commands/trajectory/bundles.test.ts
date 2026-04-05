import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../../chat";
import { renderCompressedBundle, renderReplayBundle } from "./bundles";

function createContext() {
  return {
    services: {
      trajectories: {
        compressLatest: () => ({ latest: true }),
        replayLatest: () => ({ replay: "latest" }),
        listBundles: () => [
          {
            manifestPath: "/tmp/baseline.json",
            label: "baseline",
            createdAt: "2026-03-30T00:00:00.000Z",
            messageCount: 12,
            sessionCount: 3,
          },
        ],
        compressBundle: (manifestPath: string) => ({
          compressed: manifestPath,
        }),
        replayBundle: (manifestPath: string) => ({ replay: manifestPath }),
      },
    },
  } as unknown as AgentExecutionContext;
}

describe("trajectory bundles", () => {
  it("renders latest and named bundle compression/replay", () => {
    const context = createContext();

    expect(renderCompressedBundle(context, "latest")).toContain(
      '"latest": true',
    );
    expect(renderCompressedBundle(context, "baseline")).toContain(
      '"/tmp/baseline.json"',
    );
    expect(renderReplayBundle(context, "latest")).toContain('"latest"');
    expect(renderReplayBundle(context, "baseline")).toContain(
      '"/tmp/baseline.json"',
    );
  });

  it("returns stable missing bundle messages", () => {
    const context = createContext();
    expect(renderCompressedBundle(context, "missing")).toBe(
      "Trajectory bundle not found: missing",
    );
    expect(renderReplayBundle(context, "missing")).toBe(
      "Trajectory bundle not found: missing",
    );
  });
});
