import {
  getCliHelpExamples,
  getCliHotkeyBindings,
} from "@/cli/command-surface";
import { macAwareKeyLabel } from "@/cli/shell-chrome";

export function buildHelpText(agentName: string): string {
  const command = (value: string) => value.trim();
  const hotkeys = getCliHotkeyBindings();
  const examples = getCliHelpExamples();
  return [
    `${agentName} command surfaces`,
    "",
    "Plain shell:",
    "  Enter            Send message or command",
    `  ${macAwareKeyLabel("Ctrl-C")}           Cancel the active turn or leave when idle`,
    "  exit / quit      Leave the shell",
    "  !cmd             Run a local shell command",
    "  /help            Show this guide",
    "  /commands        Browse slash commands and bundled workflows",
    `  ${command("/status")}        Runtime and provider status`,
    `  ${command("/resume <title>")} Resume a named session`,
    `  ${command("/title <name>")}   Name the current session`,
    `  ${command("/jobs")}          List background runs`,
    `  ${command("/jobs start <prompt>")} Start a detached background run`,
    `  ${command("/jobs show <id>")} Replay a job log`,
    `  ${command("/jobs attach <id>")} Follow a job live`,
    `  ${command("/jobs cancel <id>")} Cancel a background run`,
    "",
    "Cockpit:",
    "  q                Quit",
    `  ${macAwareKeyLabel("Ctrl-C")}           Cancel the active turn or quit when idle`,
    "  Esc              Focus command input",
    `  ${macAwareKeyLabel("Ctrl-L")}           Clear transcript and activity`,
    `  ${macAwareKeyLabel("Ctrl-R")}           Refresh status panels`,
    `  ${macAwareKeyLabel("Ctrl-G")}           Switch to Gateway control deck`,
    `  ${macAwareKeyLabel("Ctrl-B")}           Switch to Background Jobs`,
    `  ${macAwareKeyLabel("Ctrl-P")}           Open command palette`,
    `  ${macAwareKeyLabel("Ctrl-E")}           Open multiline composer`,
    `  ${macAwareKeyLabel("Ctrl-S")}           Focus last response`,
    `  ${macAwareKeyLabel("Ctrl-X")}           Export transcript to clipboard/file`,
    `  ${macAwareKeyLabel("Alt-1..Alt-5")}     Show Assist/Ecosystem/Gateway/Responses/Jobs`,
    "  Tab              Complete the top suggested command",
    `  ${macAwareKeyLabel("PageUp/PageDown")}  Scroll the focused pane`,
    "  Up/Down          Command history in input",
    "  Ctrl-N/Ctrl-P    History + list navigation",
    "",
    "Hotkeys:",
    ...hotkeys.map(
      (entry) => `  ${entry.keys[0]?.toUpperCase()} ${command(entry.label)}`,
    ),
    `  ${macAwareKeyLabel("Ctrl-T")}           Next theme`,
    "",
    "Examples:",
    ...examples.map((entry) => `  ${command(entry)}`),
  ].join("\n");
}
