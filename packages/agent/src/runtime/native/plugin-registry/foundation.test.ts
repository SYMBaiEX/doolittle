import { KnowledgeGraphService } from "@elizaos/agent/services/knowledge-graph/index";
import {
  AgentEventService,
  ApprovalService,
  PairingService,
  PluginManagerService,
  ToolPolicyService,
} from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { loadFoundationPlugins } from "./foundation";

describe("foundation plugin ownership", () => {
  it("declares every independently importable core service in plugin assembly", () => {
    const [foundation] = loadFoundationPlugins();

    expect(foundation?.services).toEqual([
      AgentEventService,
      KnowledgeGraphService,
      ApprovalService,
      PairingService,
      ToolPolicyService,
      PluginManagerService,
    ]);
  });
});
