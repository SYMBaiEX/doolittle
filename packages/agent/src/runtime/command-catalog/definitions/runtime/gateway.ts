import { runtimeCommand } from "./shared";

export const RuntimeGatewayCommandCatalogEntries = [
  runtimeCommand(
    "/runtime transports",
    "Show native messaging plugin, service, and live control-plane state.",
  ),
  runtimeCommand(
    "/transport inventory",
    "Show the shared canonical transport inventory.",
  ),
  runtimeCommand(
    "/transport show <platform>",
    "Inspect one transport in detail.",
  ),
  runtimeCommand(
    "/transport status",
    "Show the shared transport status summary.",
  ),
  runtimeCommand(
    "/transport mismatches",
    "Show transport mediation and readiness mismatches.",
  ),
];
