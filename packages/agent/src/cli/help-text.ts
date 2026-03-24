import { platform } from "node:os";

const IS_MACOS = platform() === "darwin";

function macAwareKeyLabel(label: string): string {
  if (!IS_MACOS) {
    return label;
  }
  return label
    .replaceAll("Alt-", "Option-")
    .replaceAll("Alt", "Option")
    .replaceAll("PageUp/PageDown", "Fn-\u2191/Fn-\u2193 or PageUp/PageDown")
    .replaceAll("PgUp/PgDn", "Fn-\u2191/Fn-\u2193 or PgUp/PgDn");
}

export function buildHelpText(agentName: string): string {
  const command = (value: string) => value.trim();
  return [
    `${agentName} command surfaces`,
    "",
    "Plain shell:",
    "  Enter            Send message or command",
    `  ${macAwareKeyLabel("Ctrl-C")}           Cancel the active turn or leave when idle`,
    "  exit / quit      Leave the shell",
    "  !cmd             Run a local shell command",
    "  /help            Show this guide",
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
    "  F2  /status",
    `  F3  ${command("/tools summary")}`,
    `  F4  ${command("/delegate overview")}`,
    `  F5  ${command("/gateway readiness")}`,
    `  F6  ${command("/sessions list")}`,
    `  F7  ${command("/doctor")}`,
    `  F8  ${command("/runtime plugins")}`,
    `  F10 ${command("/gateway history limit:10")}`,
    `  F11 ${command("/gateway supervision")}`,
    `  F12 ${command("/responses list")}`,
    `  ${macAwareKeyLabel("Ctrl-T")}           Next theme`,
    "",
    "Examples:",
    `  ${command("/skills list")}`,
    `  ${command("/execution status")}`,
    `  ${command("/theme list")}`,
    `  ${command("/theme set ghost")}`,
    `  ${command("/theme next")}`,
    `  ${command("/transport inventory")}`,
    `  ${command("/transport show telegram")}`,
    `  ${command("/transport mismatches")}`,
    "  /browser capture https://example.com",
    "  /media analyze ./recordings/demo.wav",
    `  ${command("/delegate create Research spike :: validate a transport path")}`,
    `  ${command("/trajectories ingest gateway label:review limit:100")}`,
    `  ${command("/accounts")}`,
    `  ${command("/accounts doctor")}`,
    `  ${command("/mode")}`,
    `  ${command("/progress")}`,
    `  ${command("/accounts connect codex")}`,
    `  ${command("/accounts connect claude-code")}`,
    `  ${command("/jobs start summarize this repo and report back")}`,
    "  !git status",
    "  !uname -a",
    '  eliza-agent exec -p "review the repo" --json-stream',
    '  eliza-agent exec -p "scan this project" --background',
    "  eliza-agent jobs list",
  ].join("\n");
}
