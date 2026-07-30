import type { AppServices, EnvConfig } from "@doolittle/agent/plugin-api";
import type { RouteHandlerContext } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { createDoolittleRuntimeRoutes } from "./routes";

describe("createDoolittleRuntimeRoutes", () => {
  it("publishes health from live plugin dependencies", async () => {
    let workspaceDir = "/workspace/one";
    const routes = createDoolittleRuntimeRoutes({
      services: {
        workspace: {
          root: () => workspaceDir,
        },
      } as AppServices,
      config: {
        agentName: "Doolittle Test",
        mode: "api",
      } as EnvConfig,
    });
    const health = routes.find((route) => route.path === "/health");

    expect(health).toMatchObject({
      type: "GET",
      rawPath: true,
      name: "doolittle-health",
    });
    workspaceDir = "/workspace/two";
    const result = await health?.routeHandler?.({
      runtime: {},
    } as unknown as RouteHandlerContext);
    expect(result).toEqual({
      status: 200,
      body: {
        status: "ok",
        name: "Doolittle Test",
        mode: "api",
        processId: process.pid,
        workspaceDir: "/workspace/two",
      },
    });
  });

  it("publishes the feature map from the canonical Eliza character settings", async () => {
    const routes = createDoolittleRuntimeRoutes({
      services: {} as AppServices,
      config: {} as EnvConfig,
    });
    const features = routes.find((route) => route.path === "/features");
    const result = await features?.routeHandler?.({
      runtime: {
        character: {
          settings: {
            featureMap: JSON.stringify([{ platformCapability: "Memory" }]),
          },
        },
      },
    } as unknown as RouteHandlerContext);

    expect(result).toEqual({
      status: 200,
      body: {
        features: [{ platformCapability: "Memory" }],
      },
    });
  });
});
