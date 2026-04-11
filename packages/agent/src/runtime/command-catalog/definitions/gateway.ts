import type { CommandCatalogEntry } from "../types";

export const GatewayCommandCatalogEntries: CommandCatalogEntry[] = [
  {
    command: "/platforms",
    category: "gateway",
    description: "Show platform enablement and transport plugin mediation.",
  },
  {
    command: "/gateway transports",
    category: "gateway",
    description: "Show the canonical gateway transport inventory.",
  },
  {
    command: "/gateway transport <platform>",
    category: "gateway",
    description: "Show one gateway transport in detail.",
  },
  {
    command: "/gateway readiness",
    category: "gateway",
    description: "Inspect transport readiness across all messaging platforms.",
  },
  {
    command: "/gateway runtime",
    category: "gateway",
    description: "Show persisted gateway runtime lifecycle state.",
  },
  {
    command: "/gateway daemon",
    category: "gateway",
    description: "Show the daemon policy, watchdog, and restart queue state.",
  },
  {
    command: "/gateway trace limit:20",
    category: "gateway",
    description: "Inspect recent gateway trace events with filtering support.",
  },
  {
    command: "/gateway history limit:10",
    category: "gateway",
    description: "Show the full gateway journal snapshot for recent events.",
  },
  {
    command: "/gateway supervision",
    category: "gateway",
    description: "Inspect daemon-style gateway supervision records.",
  },
  {
    command: "/gateway watchdog",
    category: "gateway",
    description: "Run a gateway watchdog cycle and collect restart decisions.",
  },
  {
    command: "/gateway watch homeassistant",
    category: "gateway",
    description:
      "Run a Home Assistant watch cycle and surface observed states.",
  },
  {
    command: "/gateway restart all",
    category: "gateway",
    description:
      "Restart one or all gateway adapters through the daemon control plane.",
  },
  {
    command: "/gateway replay latest",
    category: "gateway",
    description: "Replay the most recent inbox record through the gateway.",
  },
  {
    command: "/sessions gateway",
    category: "gateway",
    description: "List gateway-routed sessions and voice state.",
  },
  {
    command: "/responses list",
    category: "gateway",
    description: "List recent stateful API transport responses.",
  },
  {
    command: "/pairing pending",
    category: "gateway",
    description: "List pending pairing requests across platforms.",
  },
];
