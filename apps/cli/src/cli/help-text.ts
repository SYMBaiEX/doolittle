import { getCliHelpExamples, getCliHotkeyBindings } from "./command-surface";
import { macAwareKeyLabel } from "./terminal-labels";

export function buildHelpText(agentName: string): string {
  const command = (value: string) => value.trim();
  const commandRow = (value: string, description: string) =>
    `  ${command(value).padEnd(20)}  ${description}`;
  const hotkeys = getCliHotkeyBindings();
  const hotkeyRow = (entries: typeof hotkeys) =>
    `  ${entries
      .map((entry) => `${entry.keys[0]?.toUpperCase()} ${command(entry.label)}`)
      .join(" · ")}`;
  const examples = getCliHelpExamples();
  return [
    `${agentName} operator shell`,
    "",
    "Start here:",
    "  Type a request plainly, or use !cmd for a local shell command.",
    "  Plain shell is the fast daily loop; cockpit adds fullscreen operations.",
    "  /help shows this guide. /commands opens the grouped catalog.",
    "",
    "Inspect runtime:",
    commandRow("/commands", "Browse the grouped command catalog"),
    commandRow("/status", "Runtime, provider, and startup readiness"),
    commandRow("/progress", "Current run depth, tool activity, and turn state"),
    commandRow("/accounts doctor", "Startup and linked-account diagnostics"),
    commandRow("/gateway readiness", "Transport readiness and channel state"),
    "",
    "Sessions:",
    commandRow("/resume <title>", "Resume a named session"),
    commandRow("/title <name>", "Name the current session"),
    commandRow("/sessions list", "Review recent sessions"),
    "",
    "Background jobs:",
    commandRow("/jobs", "List detached background runs"),
    commandRow("/jobs start <prompt>", "Start a detached background run"),
    commandRow("/jobs show <id>", "Replay a job log"),
    commandRow("/jobs attach <id>", "Follow a job live"),
    commandRow("/jobs cancel <id>", "Cancel a background run"),
    "",
    "Cockpit controls:",
    `  ${macAwareKeyLabel("Ctrl-P")} command palette · ${macAwareKeyLabel("Ctrl-E")} multiline composer`,
    `  ${macAwareKeyLabel("Ctrl-G")} Gateway deck · ${macAwareKeyLabel("Ctrl-B")} Jobs deck · ${macAwareKeyLabel("Alt-1..Alt-5")} switch decks`,
    "  Tab/Shift-Tab cycle panes · PageUp/PageDown scroll the focused pane",
    `  ${macAwareKeyLabel("Ctrl-Q")} quit · ${macAwareKeyLabel("Ctrl-C")} cancel/quit · Esc input · ${macAwareKeyLabel("Ctrl-L")} clear`,
    "",
    "Hotkeys:",
    hotkeyRow(hotkeys.slice(0, 4)),
    hotkeyRow(hotkeys.slice(4, 8)),
    hotkeyRow(hotkeys.slice(8, 12)),
    `  ${macAwareKeyLabel("Ctrl-T")} next theme`,
    "",
    "Examples:",
    ...examples.map((entry) => `  ${command(entry)}`),
  ].join("\n");
}
