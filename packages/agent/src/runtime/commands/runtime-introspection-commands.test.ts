import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../chat";
import { handleRuntimeIntrospectionCommand } from "./runtime-introspection-commands";

describe("runtime introspection command router", () => {
  it("reports media readiness and runtime registry queries", async () => {
    const context = {
      runtime: {},
      config: {
        falApiKey: "",
        openAiApiKey: "",
      },
      services: {
        agentSdk: {
          compatibility: async () => ({ compatible: true }),
          registry: async (refresh?: boolean) => ({
            refresh: Boolean(refresh),
          }),
          searchRegistry: async (query: string) => [{ id: "pkg-1", query }],
        },
      },
    } as unknown as AgentExecutionContext;

    const media = await handleRuntimeIntrospectionCommand(
      "/runtime media",
      context,
    );
    const search = await handleRuntimeIntrospectionCommand(
      "/runtime registry search planner",
      context,
    );
    const compatibility = await handleRuntimeIntrospectionCommand(
      "/runtime compatibility",
      context,
    );

    expect(media).toContain('"mode": "degraded"');
    expect(search).toContain('"query": "planner"');
    expect(compatibility).toContain('"compatible": true');
  });
});
