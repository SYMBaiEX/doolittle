import { describe, expect, it } from "bun:test";

import { getEffectiveTurnCapabilityPolicy } from "./index";

describe("effective turn capability policy", () => {
  it("falls back to curated coding tools when native policy returns an empty allowlist", () => {
    const runtime = {
      getService(name: string) {
        if (name === "tool_policy") {
          return {
            getAllowedTools: () => [],
          };
        }
        if (
          name === "coding_agent" ||
          name === "agent_orchestrator" ||
          name === "mcp"
        ) {
          return { name };
        }
        return null;
      },
    } as const;

    const policy = getEffectiveTurnCapabilityPolicy(runtime as never, "coding");

    expect(policy.preferredTools).toEqual([
      "mcp",
      "agentOrchestrator",
      "codingAgent",
    ]);
  });

  it("keeps minimal turns tool-free when native policy returns an empty allowlist", () => {
    const runtime = {
      getService(name: string) {
        if (name === "tool_policy") {
          return {
            getAllowedTools: () => [],
          };
        }
        if (name === "browser" || name === "knowledge" || name === "mcp") {
          return { name };
        }
        return null;
      },
    } as const;

    const policy = getEffectiveTurnCapabilityPolicy(
      runtime as never,
      "minimal",
    );

    expect(policy.preferredTools).toEqual([]);
    expect(policy.deniedTools.length).toBeGreaterThan(0);
  });
});
