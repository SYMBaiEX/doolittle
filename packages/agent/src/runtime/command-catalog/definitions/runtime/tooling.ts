import { runtimeCommand } from "./shared";

export const RuntimeToolingCommandCatalogEntries = [
  runtimeCommand(
    "/runtime plugins",
    "List native ElizaOS plugin inventory and source.",
  ),
  runtimeCommand(
    "/runtime services",
    "Show native-vs-product service resolution across the stack.",
  ),
  runtimeCommand(
    "/runtime ownership",
    "Show the full native ownership snapshot, including integration, autonomous alignment, and skill hub state.",
  ),
  runtimeCommand(
    "/runtime ecosystem",
    "Show alpha-channel package alignment and native audit data.",
  ),
  runtimeCommand("/forms list", "List native forms and their current status."),
  runtimeCommand(
    "/forms templates",
    "List native form templates available from the forms service.",
  ),
  runtimeCommand(
    "/forms create <template-id> :: <json-metadata>",
    "Create a native form from a template with optional metadata.",
  ),
  runtimeCommand("/forms show <form-id>", "Inspect one native form in detail."),
  runtimeCommand("/forms cancel <form-id>", "Cancel one native form."),
  runtimeCommand(
    "/plans list",
    "List native execution plans and their linked task/workflow state.",
  ),
  runtimeCommand(
    "/plans create <title> :: <objective> [:: <json-metadata>]",
    "Create a native execution plan with optional metadata.",
  ),
  runtimeCommand("/plans show <plan-id>", "Inspect one native execution plan."),
  runtimeCommand(
    "/runtime e2b",
    "Show native E2B sandbox ownership, active sandboxes, and execution readiness.",
  ),
  runtimeCommand("/e2b list", "List native E2B sandboxes."),
];
