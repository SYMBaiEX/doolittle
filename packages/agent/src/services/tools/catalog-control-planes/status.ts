import type { ToolDefinition } from "@/types";

export const CORE_STATUS_CONTROL_PLANES = [
  {
    id: "gateway.send",
    name: "Gateway Send",
    category: "gateway",
    description: "Send a response through the active gateway adapter.",
    enabled: true,
    transport: "adapter",
  },
  {
    id: "acp.status",
    name: "ACP Status",
    category: "protocol",
    description: "Inspect the ACP bridge and Doolittle registry surface.",
    enabled: true,
    transport: "service",
  },
] as const satisfies readonly ToolDefinition[];

export const RUNTIME_STATUS_CONTROL_PLANES = [
  {
    id: "mcp.bridge",
    name: "MCP Bridge",
    category: "mcp",
    description: "Structured MCP bridge for tool discovery and invocation.",
    enabled: true,
    transport: "native",
  },
  {
    id: "runtime.registry",
    name: "Registry Snapshot",
    category: "runtime",
    description:
      "Inspect the ElizaOS registry client snapshot and endpoint state.",
    enabled: true,
    transport: "native",
  },
  {
    id: "runtime.compatibility",
    name: "Compatibility Report",
    category: "runtime",
    description:
      "Inspect plugin-to-core compatibility results from the Eliza agent SDK.",
    enabled: true,
    transport: "native",
  },
  {
    id: "runtime.autonomous",
    name: "Autonomous Control Plane",
    category: "runtime",
    description:
      "Inspect native Eliza agent-skills, orchestrator, trajectory, and plugin-manager adoption.",
    enabled: true,
    transport: "native",
  },
] as const satisfies readonly ToolDefinition[];
