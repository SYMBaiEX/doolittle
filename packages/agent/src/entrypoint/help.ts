import { fileURLToPath } from "node:url";

export function resolveEntrypointRepoRoot(moduleUrl: string): string {
  // packages/agent/src/index.ts -> ../../../ = repo root
  return fileURLToPath(new URL("../../../", moduleUrl));
}

export function renderTopLevelHelp(): string {
  return [
    "Doolittle",
    "",
    "Terminal-first ElizaOS-native coding agent.",
    "",
    "Daily shell:",
    "  doolittle                 Start the plain paired shell",
    "  doolittle cockpit         Open the fullscreen operator deck",
    "",
    "One-shot operator views:",
    "  doolittle status          Runtime, provider, and startup readiness",
    "  doolittle progress        Current run depth, tool activity, and turn state",
    "  doolittle tools           Show the current tool surface summary",
    "  doolittle skills          Browse installed and generated skills",
    "  doolittle runtime         Inspect native/runtime ownership surfaces",
    "  doolittle commands        Browse slash commands and bundled workflows",
    "",
    "Run once and background work:",
    '  doolittle exec -p "..."              Run one prompt and exit',
    '  doolittle exec -p "..." --json       Emit one JSON result',
    '  doolittle exec -p "..." --json-stream Stream turn events as JSON',
    '  doolittle exec -p "..." --background Detach into a background job',
    "  doolittle jobs list                   Inspect background jobs",
    "",
    "Setup and recovery:",
    "  doolittle setup           Run onboarding",
    "  doolittle doctor          Check readiness and local setup",
    "",
    "Fast examples:",
    "  doolittle status",
    "  doolittle progress",
    "  doolittle tools search browser",
    "  doolittle skills installed",
    "  doolittle runtime transports",
    '  doolittle exec -p "summarize this repo"',
    '  doolittle exec -p "/status" --json',
    '  doolittle exec -p "review the repo" --background',
    "  doolittle jobs attach <job-id>",
    "  doolittle cockpit",
    "",
    "Legacy aliases:",
    "  doolittle plain",
    "  doolittle --cockpit",
    "  doolittle --plain-cli",
  ].join("\n");
}
