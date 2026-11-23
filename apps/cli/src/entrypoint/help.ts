import type { HelpTopic } from "./subcommand";

export function renderHelp(topic?: HelpTopic): string {
  if (topic === "exec") return renderExecHelp();
  if (topic === "jobs") return renderJobsHelp();
  return renderTopLevelHelp();
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
    '  doolittle exec -p "..."                   Run one prompt and exit',
    '  doolittle exec -p "..." --json            Emit one JSON result',
    '  doolittle exec -p "..." --json-stream     Stream turn events as JSON',
    '  doolittle exec -p "..." --background      Detach into a background job',
    '  doolittle exec -p "..." --session-id <id> Continue an existing session',
    "  doolittle exec --prompt-stdin             Read the prompt from piped stdin",
    "  doolittle exec --help                     Show every exec option",
    "  doolittle jobs list                       List recent background jobs",
    "  doolittle jobs show <job-id>              Replay a job's recorded events",
    "  doolittle jobs attach <job-id>            Follow a job live until it ends",
    "  doolittle jobs cancel <job-id>            Request a job's cancellation",
    "",
    "Setup and recovery:",
    "  doolittle --version       Print the Doolittle product version",
    "  doolittle desktop         Build and open the native desktop app",
    "  doolittle acp             Run the ACP stdio server for editors",
    "  doolittle native          Build or inspect Doolittle-owned native tools",
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
  ].join("\n");
}

export function renderExecHelp(): string {
  return [
    "Usage: doolittle exec [options] [--] [prompt...]",
    "",
    "Run one prompt and exit. `doolittle run` is an alias.",
    "",
    "Prompt:",
    "  -p, --prompt <text>   Prompt to run; otherwise positional text is used",
    "  --prompt-stdin        Read the prompt from piped stdin",
    "  --                    Treat every later argument as prompt text",
    "",
    "Output:",
    "  --json                Emit one JSON result",
    "  --json-stream         Stream turn events as JSON lines",
    "",
    "Sessions and jobs:",
    "  --session-id <id>     Continue an existing session",
    "  --background          Detach into a background job; see doolittle jobs --help",
    "",
    "Examples:",
    '  doolittle exec -p "summarize this repo"',
    '  doolittle exec -p "/status" --json',
    "  git diff | doolittle exec --prompt-stdin",
    '  doolittle exec -p "continue" --session-id <id>',
    '  doolittle exec -p "review the repo" --background',
  ].join("\n");
}

export function renderJobsHelp(): string {
  return [
    "Usage: doolittle jobs [list|show|attach|cancel] [job-id]",
    "",
    "Inspect background jobs started with doolittle exec --background.",
    "",
    "  list                  List recent background jobs (default)",
    "  show <job-id>         Replay a job's recorded events",
    "  attach <job-id>       Follow a job live until it ends",
    "  cancel <job-id>       Request a job's cancellation",
  ].join("\n");
}
