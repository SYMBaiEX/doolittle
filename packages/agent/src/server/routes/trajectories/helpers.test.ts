import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import {
  buildPackageRequest,
  buildTrajectoryRequest,
  findBundle,
} from "./helpers";

function createContext(): AppContext {
  return {
    runtime: {},
    gateway: {
      history: async () => ({
        traces: [],
        inbox: [],
        outbox: [],
      }),
    },
    services: {
      delegation: {
        create: () => ({ id: "task-1" }),
      },
      trajectories: {
        listBundles: (_limit: number) => [
          {
            manifestPath: "/tmp/alpha.manifest.json",
            label: "alpha",
            limit: 25,
            purpose: "analysis",
            mode: "dataset",
            tags: ["ops"],
            notes: "bundle notes",
            filters: {
              sessionId: "session-1",
              role: "assistant",
            },
          },
        ],
      },
    },
  } as unknown as AppContext;
}

describe("trajectory route helpers", () => {
  it("builds dataset requests with default limits", () => {
    expect(buildTrajectoryRequest({ label: "demo" })).toEqual({
      limit: 200,
      sessionId: undefined,
      role: undefined,
      label: "demo",
      purpose: undefined,
      tags: undefined,
      mode: undefined,
      notes: undefined,
    });
  });

  it("builds package requests from bundle metadata", () => {
    expect(
      buildPackageRequest({
        manifestPath: "/tmp/alpha.manifest.json",
        label: "alpha",
        limit: 25,
        purpose: "analysis",
        mode: "dataset",
        tags: ["ops"],
        notes: "bundle notes",
        filters: {
          sessionId: "session-1",
          role: "assistant",
        },
      }),
    ).toEqual({
      limit: 25,
      sessionId: "session-1",
      role: "assistant",
      label: "alpha",
      purpose: "analysis",
      mode: "dataset",
      tags: ["ops"],
      notes: "bundle notes",
    });
  });

  it("finds bundles by label or manifest suffix", () => {
    const context = createContext();
    expect(findBundle(context, "alpha")).toEqual(
      expect.objectContaining({
        manifestPath: "/tmp/alpha.manifest.json",
      }),
    );
    expect(findBundle(context, "alpha.manifest.json")).toEqual(
      expect.objectContaining({
        manifestPath: "/tmp/alpha.manifest.json",
      }),
    );
    expect(findBundle(context, "missing")).toBeUndefined();
  });
});
