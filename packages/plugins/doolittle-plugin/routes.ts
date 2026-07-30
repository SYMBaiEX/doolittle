import type { IAgentRuntime, Route } from "@elizaos/core";
import type { DoolittlePluginDependencies } from "./types";

function readFeatureMap(runtime: IAgentRuntime): unknown[] {
  const configured = runtime.character.settings?.featureMap;
  if (Array.isArray(configured)) return configured;
  if (typeof configured !== "string") return [];
  try {
    const parsed = JSON.parse(configured);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createDoolittleRuntimeRoutes({
  services,
  config,
}: DoolittlePluginDependencies): Route[] {
  return [
    {
      type: "GET",
      path: "/health",
      rawPath: true,
      name: "doolittle-health",
      routeHandler: async () => ({
        status: 200,
        body: {
          status: "ok",
          name: config.agentName,
          mode: config.mode,
          processId: process.pid,
          workspaceDir: services.workspace.root(),
        },
      }),
    },
    {
      type: "GET",
      path: "/features",
      rawPath: true,
      name: "doolittle-features",
      routeHandler: async ({ runtime }) => ({
        status: 200,
        body: {
          features: readFeatureMap(runtime),
        },
      }),
    },
  ];
}
