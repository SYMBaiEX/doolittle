import { ModelType, type Plugin } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { DOOLITTLE_MODEL_ROUTER_PRIORITY } from "./model-router";
import { createDoolittlePlugin } from "./plugin";

function createSurface(): Plugin {
  return { name: "doolittle-runtime", description: "test surface" };
}

describe("createDoolittlePlugin model ownership", () => {
  it("adds native routing online and guarded models during offline bootstrap", () => {
    const offlinePlugin = createDoolittlePlugin(createSurface(), {
      dataDir: "/tmp/doolittle-data",
      workspaceDir: "/tmp/doolittle-workspace",
      offlineBootstrapMode: true,
    });
    const onlinePlugin = createDoolittlePlugin(createSurface(), {
      dataDir: "/tmp/doolittle-data",
      workspaceDir: "/tmp/doolittle-workspace",
      offlineBootstrapMode: false,
    });

    expect(offlinePlugin.models?.[ModelType.TEXT_EMBEDDING]).toBeTypeOf(
      "function",
    );
    expect(offlinePlugin.models?.[ModelType.TEXT_LARGE]).toBeTypeOf("function");
    expect(onlinePlugin.models?.[ModelType.TEXT_LARGE]).toBeTypeOf("function");
    expect(onlinePlugin.models?.[ModelType.TEXT_EMBEDDING]).toBeUndefined();
    expect(offlinePlugin.priority).toBe(DOOLITTLE_MODEL_ROUTER_PRIORITY);
    expect(onlinePlugin.priority).toBe(DOOLITTLE_MODEL_ROUTER_PRIORITY);
  });
});
