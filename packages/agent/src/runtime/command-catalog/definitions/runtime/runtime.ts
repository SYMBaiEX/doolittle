import { runtimeCommand } from "./shared";

export const RuntimeCoreCommandCatalogEntries = [
  runtimeCommand(
    "/runtime status",
    "Print the active provider, model, and plugin state.",
  ),
  runtimeCommand(
    "/mode",
    "Show the active run depth profile and configured max-iteration cap.",
  ),
  runtimeCommand(
    "/mode set <quick|standard|deep|explore>",
    "Switch the agent autonomy profile and update the effective max-iteration cap.",
  ),
  runtimeCommand(
    "/progress",
    "Show the active tool-progress mode used by the TUI, CLI, and gateway surfaces.",
  ),
  runtimeCommand(
    "/progress set <off|new|all|verbose>",
    "Set how much observed tool activity should be streamed while the agent works.",
  ),
  runtimeCommand(
    "/theme",
    "Show the active operator theme and available theme controls.",
  ),
  runtimeCommand("/theme list", "List all built-in operator cockpit themes."),
  runtimeCommand(
    "/theme next",
    "Cycle to the next built-in operator cockpit theme.",
  ),
  runtimeCommand(
    "/theme prev",
    "Cycle to the previous built-in operator cockpit theme.",
  ),
  runtimeCommand(
    "/theme set <name>",
    "Set the active operator theme and persist it in runtime settings.",
  ),
  runtimeCommand(
    "/ecosystem",
    "Show Doolittle benchmark packs, skill channels, and modeling profiles.",
  ),
  runtimeCommand(
    "/insights",
    "Show a high-level ownership, ecosystem, and operator insight snapshot.",
  ),
  runtimeCommand(
    "/runtime autonomous",
    "Show how much of the agent, skills, orchestration, and trajectory stack is running through native Eliza services.",
  ),
  runtimeCommand(
    "/runtime media",
    "Show native media ownership, including official TTS plugin readiness.",
  ),
  runtimeCommand(
    "/runtime forms",
    "Show native forms ownership, template counts, and persistence state.",
  ),
  runtimeCommand(
    "/runtime planning",
    "Show native planning ownership, linked task/workflow counts, and execution readiness.",
  ),
];
