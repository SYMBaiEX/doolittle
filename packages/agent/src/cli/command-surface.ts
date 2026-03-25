import { canonicalizeSlashCommandSyntax } from "@/runtime/command-catalog";

export interface CliHotkeyBinding {
  keys: string[];
  command: string;
  label: string;
}

const HOTKEY_DEFINITIONS: Array<{
  keys: string[];
  command: string;
  label?: string;
}> = [
  { keys: ["f2"], command: "/status" },
  { keys: ["f3"], command: "/tools summary" },
  { keys: ["f4"], command: "/delegate overview" },
  { keys: ["f5"], command: "/gateway readiness" },
  { keys: ["f6"], command: "/sessions list" },
  { keys: ["f7"], command: "/doctor" },
  { keys: ["f8"], command: "/runtime plugins" },
  { keys: ["f9"], command: "/runtime ecosystem" },
  { keys: ["f10"], command: "/gateway history limit:10" },
  { keys: ["f11"], command: "/gateway supervision" },
  { keys: ["f12"], command: "/responses list" },
];

const HELP_EXAMPLES = [
  "/skills list",
  "/execution status",
  "/theme list",
  "/theme set ghost",
  "/theme next",
  "/transport inventory",
  "/transport show telegram",
  "/transport mismatches",
  "/browser capture https://example.com",
  "/media analyze ./recordings/demo.wav",
  "/delegate create Research spike :: validate a transport path",
  "/trajectories ingest gateway label:review limit:100",
  "/accounts",
  "/accounts doctor",
  "/mode",
  "/progress",
  "/accounts connect codex",
  "/accounts connect claude-code",
  "/jobs start summarize this repo and report back",
  "!git status",
  "!uname -a",
  'eliza-agent exec -p "review the repo" --json-stream',
  'eliza-agent exec -p "scan this project" --background',
  "eliza-agent jobs list",
];

export function getCliHotkeyBindings(): CliHotkeyBinding[] {
  return HOTKEY_DEFINITIONS.map((entry) => {
    const command = canonicalizeSlashCommandSyntax(entry.command);
    return {
      keys: entry.keys,
      command,
      label: entry.label ?? command,
    };
  });
}

export function getCliHelpExamples(): string[] {
  return HELP_EXAMPLES.map((entry) =>
    entry.startsWith("/") ? canonicalizeSlashCommandSyntax(entry) : entry,
  );
}
