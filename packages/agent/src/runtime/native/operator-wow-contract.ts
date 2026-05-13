export type OperatorWowStatus = "covered" | "partial" | "missing";

export interface OperatorWowAcceptanceScenario {
  id: string;
  surface: string;
  trigger: string;
  requiredSignals: string[];
  verification: string[];
  currentStatus: OperatorWowStatus;
}

export interface OperatorWowImplementationTask {
  id: string;
  title: string;
  ownerSurface: string;
  files: string[];
  definitionOfDone: string[];
}

export interface OperatorWowContractPillar {
  id: string;
  title: string;
  outcome: string;
  referenceSignals: string[];
  elizaosLeverage: string[];
  doolittleSurfaces: string[];
  acceptanceScenarios: OperatorWowAcceptanceScenario[];
  currentGaps: string[];
  nextImplementationTasks: OperatorWowImplementationTask[];
}

const OPERATOR_WOW_CONTRACT: OperatorWowContractPillar[] = [
  {
    id: "first-run-to-working-assistant",
    title: "First Run To Working Assistant",
    outcome:
      "A new operator can install, configure, inspect readiness, and complete a first useful assistant turn without reading architecture docs.",
    referenceSignals: [
      "OpenClaw makes onboarding a product surface with `openclaw onboard`, daemon install, provider setup, dashboard launch, and a first chat.",
      "Doolittle keeps setup close to the terminal and exposes provider/model readiness through native CLI commands before deeper work starts.",
    ],
    elizaosLeverage: [
      "ElizaOS provider plugins own model connectivity instead of Doolittle inventing provider clients.",
      "ElizaOS runtime bootstrap and plugin assembly become the readiness source that Doolittle reports through shell, API, and gateway surfaces.",
    ],
    doolittleSurfaces: [
      "bash scripts/install.sh",
      "scripts/bootstrap.ts",
      "doolittle status",
      "doolittle doctor",
      "GET /runtime/status",
    ],
    acceptanceScenarios: [
      {
        id: "first-run-to-working-assistant.install-check",
        surface: "installer",
        trigger:
          "Run `bash scripts/install.sh --check --yes` in a clean checkout.",
        requiredSignals: [
          "Reports which files would be written without mutating them.",
          "Names provider, execution backend, gateway, and workspace decisions.",
          "Returns a nonzero exit only for a real setup blocker.",
        ],
        verification: [
          "Add an installer smoke test that asserts dry-run output contains `.env`, `.doolittle/settings.json`, and `.doolittle/gateway/gateway.json`.",
          "Run `bun test scripts/bootstrap-program.test.ts scripts/bootstrap/program/summary.test.ts`.",
        ],
        currentStatus: "partial",
      },
      {
        id: "first-run-to-working-assistant.first-chat",
        surface: "plain CLI and API",
        trigger:
          'Run `doolittle status`, then `doolittle exec -p "status" --json` after onboarding.',
        requiredSignals: [
          "Shows runtime readiness, configured model/provider, plugin hydration, and degraded surfaces separately.",
          "Uses the same runtime truth as `GET /runtime/status`.",
          "Does not claim a capability is ready when it is only installed.",
        ],
        verification: [
          "Add a one-shot invocation regression test for `status` and `exec --json` readiness shape.",
          "Run `bun test packages/agent/src/entrypoint/invocation.test.ts`.",
        ],
        currentStatus: "partial",
      },
    ],
    currentGaps: [
      "The installer and bootstrap path are strong but not yet scored against a five-minute first useful turn.",
      "Readiness output is broad, but the first-run path still needs one clear success transcript that is kept current by tests.",
    ],
    nextImplementationTasks: [
      {
        id: "first-run-decision-receipt",
        title:
          "Add provider, backend, gateway, and workspace decisions to first-run receipts.",
        ownerSurface: "bootstrap",
        files: [
          "scripts/bootstrap/answers/review.ts",
          "scripts/bootstrap/program/summary.ts",
          "docs/quickstart.md",
        ],
        definitionOfDone: [
          "Check, headless, and completed onboarding receipts name provider, execution backend, gateway mode, and workspace root.",
          "The quickstart explains how to read the receipt and which fields prove first-run readiness.",
          "`bun test scripts/bootstrap-program.test.ts scripts/bootstrap/answers.test.ts` passes.",
        ],
      },
      {
        id: "first-chat-readiness-contract",
        title: "Make first chat readiness measurable across CLI and API.",
        ownerSurface: "runtime status",
        files: [
          "packages/agent/src/entrypoint/invocation.test.ts",
          "packages/agent/src/services/operator/runtime-summary/update.test.ts",
          "docs/operator-loop.md",
        ],
        definitionOfDone: [
          "`doolittle status` and `GET /runtime/status` expose the same provider, plugin, gateway, and degraded-mode fields.",
          "The operator loop doc points to the same readiness fields.",
          "`bun test packages/agent/src/entrypoint/invocation.test.ts packages/agent/src/services/operator/runtime-summary/update.test.ts` passes.",
        ],
      },
    ],
  },
  {
    id: "terminal-operator-loop",
    title: "Terminal Operator Loop",
    outcome:
      "The everyday shell feels like a live operator console: multiline chat, slash control, shell shortcuts, streaming tool progress, interruption, and recovery.",
    referenceSignals: [
      "Doolittle creates trust with a dense terminal loop: streaming tool output, slash commands, approvals, interrupts, model switching, and resumable sessions.",
      "OpenClaw keeps chat commands such as `/status`, `/compact`, `/usage`, `/trace`, `/verbose`, and `/restart` available from chat surfaces.",
    ],
    elizaosLeverage: [
      "ElizaOS message handling remains the natural-language route; Doolittle owns shell chrome and operator commands.",
      "ElizaOS events and services provide action progress that the CLI and cockpit render without fabricating steps.",
    ],
    doolittleSurfaces: [
      "packages/agent/src/runtime/chat.ts",
      "packages/agent/src/cli.ts",
      "packages/agent/src/cli/shell-chrome.ts",
      "packages/agent/src/cli/tui-renderers.test.ts",
    ],
    acceptanceScenarios: [
      {
        id: "terminal-operator-loop.command-deck",
        surface: "plain CLI",
        trigger:
          "Start `doolittle`, run `/status`, `/tools summary`, `/runtime status`, `/doctor`, and `/gateway status`.",
        requiredSignals: [
          "Every command returns a compact operator result without leaving the runtime lane.",
          "Degraded components are named separately from ready components.",
          "The command deck includes retry, undo, compress, usage, insights, and model controls once implemented.",
        ],
        verification: [
          "Add command parser tests for each slash command and expected route.",
          "Run `bun test packages/agent/src/runtime/chat.test.ts packages/agent/src/cli/tui-renderers.test.ts`.",
        ],
        currentStatus: "partial",
      },
      {
        id: "terminal-operator-loop.interrupt-and-resume",
        surface: "plain CLI and cockpit",
        trigger:
          "Start a long-running tool turn, send a steering message, then resume or stop the run.",
        requiredSignals: [
          "The UI shows the active run id, active tool, and last observed progress.",
          "Stop and resume affect the real run controller state.",
          "The final transcript records whether the run completed, stopped, or was superseded.",
        ],
        verification: [
          "Add run-controller tests for stop, steering, and resume transitions.",
          "Run `bun test packages/agent/src/runtime/chat-turn packages/agent/src/cli`.",
        ],
        currentStatus: "missing",
      },
    ],
    currentGaps: [
      "Doolittle has useful shell and cockpit surfaces, but live session controls still need first-class retry, undo, compress, usage, and insights behavior.",
      "Interrupt and steering behavior is not yet expressed as a first-class acceptance contract.",
    ],
    nextImplementationTasks: [
      {
        id: "operator-command-surface",
        title:
          "Promote retry, undo, compress, usage, insights, and model controls into first-class slash commands.",
        ownerSurface: "operator shell",
        files: [
          "packages/agent/src/runtime/chat.ts",
          "packages/agent/src/runtime/chat-turn/provider-handler.ts",
          "packages/agent/src/cli/shell-chrome.ts",
          "docs/operator-loop.md",
        ],
        definitionOfDone: [
          "Each command has parser coverage and a compact operator response.",
          "Commands that need unavailable runtime support return a truthful degraded response.",
          "`bun test packages/agent/src/runtime packages/agent/src/cli` passes.",
        ],
      },
      {
        id: "run-interrupt-contract",
        title:
          "Make stop, steering, and resume transitions visible and test-backed.",
        ownerSurface: "run controller",
        files: [
          "packages/agent/src/runtime/chat-turn",
          "packages/agent/src/runtime/run-controller",
          "packages/agent/src/cli/tui-renderers.test.ts",
        ],
        definitionOfDone: [
          "Active runs expose id, state, active tool, and last progress timestamp.",
          "Stopping a run records an explicit terminal state in the transcript.",
          "Steering messages are queued or injected according to a documented policy.",
        ],
      },
    ],
  },
  {
    id: "real-tools-and-coding",
    title: "Real Tools And Coding",
    outcome:
      "Doolittle can inspect, edit, test, review, and explain a repository with the same reliability expected from a daily coding agent.",
    referenceSignals: [
      "Doolittle earns confidence through reliable terminal backends, file tools, browser tools, approvals, MCP, and delegation.",
      "OpenClaw showcases chat-native coding loops where work starts in a mobile channel and lands as tested changes or PR feedback.",
    ],
    elizaosLeverage: [
      "ElizaOS actions and services should own tool availability; Doolittle contributes coding context, approval policy, and verification rituals.",
      "ElizaOS skills should teach tool use for repo-specific workflows instead of hardcoding every procedure into the agent loop.",
    ],
    doolittleSurfaces: [
      "packages/plugins/doolittle-plugin/coding-agent",
      "packages/plugins/doolittle-plugin/autocoder",
      "packages/agent/src/runtime/native/service-bridge/tooling",
      "packages/agent/src/runtime/native/service-bridge/autocoder",
    ],
    acceptanceScenarios: [
      {
        id: "real-tools-and-coding.repo-fix",
        surface: "coding agent",
        trigger:
          "Ask Doolittle to fix a focused failing test in the current workspace.",
        requiredSignals: [
          "Searches before editing.",
          "Applies a minimal patch.",
          "Runs the targeted failing test and a relevant passing verification.",
          "Summarizes files changed and verification results.",
        ],
        verification: [
          "Add a fixture repository with one failing test and one expected patch.",
          "Run a deterministic coding-agent smoke test against that fixture.",
        ],
        currentStatus: "partial",
      },
      {
        id: "real-tools-and-coding.review-loop",
        surface: "review command",
        trigger:
          "Ask Doolittle to review a diff and provide correctness risks before summary.",
        requiredSignals: [
          "Findings lead the response.",
          "File and line references are included for every actionable issue.",
          "No issue is reported when the diff is clean and verified.",
        ],
        verification: [
          "Add review fixture tests with one known bug and one clean diff.",
          "Run `bun test packages/plugins/doolittle-plugin/coding-agent`.",
        ],
        currentStatus: "missing",
      },
    ],
    currentGaps: [
      "Autocoder surfaces are explicitly planning-first; they should not be marketed as production-grade mutation until fixture-backed edits exist.",
      "Coding-agent behavior needs deterministic fixtures for edit, test, review, and rollback flows.",
    ],
    nextImplementationTasks: [
      {
        id: "coding-fixture-harness",
        title: "Create a deterministic coding fixture harness.",
        ownerSurface: "coding agent",
        files: [
          "packages/plugins/doolittle-plugin/coding-agent/runtime.ts",
          "packages/plugins/doolittle-plugin/coding-agent/service.ts",
          "packages/plugins/doolittle-plugin/coding-agent/index.test.ts",
        ],
        definitionOfDone: [
          "The fixture starts with a known failing test and ends with a known passing test.",
          "The service reports search, patch, and verification events separately.",
          "The final response includes changed files and commands run.",
        ],
      },
      {
        id: "review-fixture-harness",
        title:
          "Add PR-style review fixtures that enforce findings-first output.",
        ownerSurface: "coding agent review",
        files: [
          "packages/plugins/doolittle-plugin/coding-agent/runtime.ts",
          "packages/plugins/doolittle-plugin/coding-agent/index.test.ts",
          "docs/operator-loop.md",
        ],
        definitionOfDone: [
          "A buggy fixture produces one finding with a file and line.",
          "A clean fixture produces an explicit no-findings response.",
          "The review docs match the tested output order.",
        ],
      },
    ],
  },
  {
    id: "memory-learning-skills",
    title: "Memory Learning And Skills",
    outcome:
      "Doolittle gets better with use by recalling durable preferences, finding past sessions, and proposing approved skills for repeated workflows.",
    referenceSignals: [
      "Doolittle makes learning visible through memory files, session search, skill creation, and skill improvement loops.",
      "OpenClaw's Skill Workshop pattern treats new skills as proposals that can be scanned, approved, and refreshed without a restart.",
    ],
    elizaosLeverage: [
      "ElizaOS evaluators and memory providers should capture durable facts after turns.",
      "@elizaos/skills should remain the skill format and loading engine, while Doolittle owns approval and workspace placement.",
    ],
    doolittleSurfaces: [
      "packages/agent/src/runtime/native/memory-storage-runtime.ts",
      "packages/agent/src/runtime/native/service-bridge/autonomous-skills.ts",
      "packages/skills",
      "docs/skills-hub.md",
    ],
    acceptanceScenarios: [
      {
        id: "memory-learning-skills.preference-recall",
        surface: "memory",
        trigger:
          "Tell Doolittle a durable preference, start a new session, then ask a related question.",
        requiredSignals: [
          "The preference is stored in a durable memory surface.",
          "The next session can recall it without the user restating it.",
          "The response distinguishes memory from live facts.",
        ],
        verification: [
          "Add a memory persistence test that writes, restarts the memory runtime, and retrieves the preference.",
          "Run `bun test packages/agent/src/runtime/native/memory-storage-runtime.test.ts`.",
        ],
        currentStatus: "partial",
      },
      {
        id: "memory-learning-skills.skill-proposal",
        surface: "skills",
        trigger:
          "Ask Doolittle to remember a repeatable workflow as a skill after it has completed the workflow once.",
        requiredSignals: [
          "Produces a `SKILL.md` proposal with name, description, and instructions.",
          "Scans or labels risk before writing to workspace skills.",
          "Refreshes the skill inventory after approval.",
        ],
        verification: [
          "Add a skill synthesis test with a generated skill proposal and approval gate.",
          "Run `bun test packages/agent/src/runtime/native/service-bridge/autonomous-skills.test.ts`.",
        ],
        currentStatus: "missing",
      },
    ],
    currentGaps: [
      "Memory storage exists, but active recall and post-turn learning are not yet measured by product-level acceptance scenarios.",
      "Skill synthesis is documented as a Doolittle aim, but approval, scan, write, and refresh behavior need a real harness.",
    ],
    nextImplementationTasks: [
      {
        id: "durable-memory-recall",
        title: "Add a cross-session durable memory recall test.",
        ownerSurface: "memory",
        files: [
          "packages/agent/src/runtime/native/memory-storage-runtime.ts",
          "packages/agent/src/runtime/native/memory-storage-runtime.test.ts",
          "docs/operator-loop.md",
        ],
        definitionOfDone: [
          "A saved preference survives runtime recreation.",
          "Recall metadata says where the memory came from.",
          "The operator docs explain how to inspect and correct memory.",
        ],
      },
      {
        id: "approved-skill-workshop",
        title: "Build the approved skill proposal path.",
        ownerSurface: "skills",
        files: [
          "packages/agent/src/runtime/native/service-bridge/autonomous-skills.ts",
          "packages/agent/src/runtime/native/service-bridge/autonomous-skills.test.ts",
          "docs/skills-hub.md",
        ],
        definitionOfDone: [
          "Skill proposals are written only after explicit approval or a configured trusted mode.",
          "Unsafe proposal content is rejected or quarantined.",
          "The generated skill appears in the next skill inventory snapshot.",
        ],
      },
    ],
  },
  {
    id: "gateway-everywhere-presence",
    title: "Gateway Everywhere Presence",
    outcome:
      "Doolittle can be reached from trusted messaging channels and keeps delivery, threads, attachments, and recovery visible.",
    referenceSignals: [
      "Doolittle needs broad messaging adapters and a mature gateway/session delivery loop.",
      "OpenClaw pushes this further with local-first gateway, pairing, many channels, nodes, device trust, dashboard, and channel-native behavior.",
    ],
    elizaosLeverage: [
      "ElizaOS services should host long-lived gateway adapters and expose routes for read/control planes.",
      "Doolittle should keep transport UX and security policy in the harness, not inside the model prompt.",
    ],
    doolittleSurfaces: [
      "packages/agent/src/gateway/runner/gateway-runner.ts",
      "packages/agent/src/gateway/platforms",
      "packages/plugins/doolittle-plugin/gateway-service.ts",
      "packages/agent/src/server.ts",
    ],
    acceptanceScenarios: [
      {
        id: "gateway-everywhere-presence.paired-dm",
        surface: "gateway",
        trigger:
          "Send a message from a paired Telegram or Discord identity to the Doolittle gateway.",
        requiredSignals: [
          "Authorization decision is logged.",
          "Session key is stable for the channel peer.",
          "Typing/progress/final delivery behavior is platform-aware.",
        ],
        verification: [
          "Add mocked platform adapter tests for authorization, session binding, and final delivery.",
          "Run `bun test packages/agent/src/gateway`.",
        ],
        currentStatus: "partial",
      },
      {
        id: "gateway-everywhere-presence.reconnect-replay",
        surface: "gateway runner",
        trigger:
          "Restart a running gateway while messages are queued or delivery is in progress.",
        requiredSignals: [
          "The runner records supervision state before and after restart.",
          "Queued outbound messages are replayed or marked failed with a reason.",
          "Attachment retention and transcript rewrite policy are explicit.",
        ],
        verification: [
          "Add runner tests for restart, replay, and failed delivery state.",
          "Run `bun test packages/agent/src/gateway/gateway-supervision-flow.test.ts packages/agent/src/gateway/runner`.",
        ],
        currentStatus: "partial",
      },
    ],
    currentGaps: [
      "Doolittle has gateway surfaces, but OpenClaw leads on channel breadth, device pairing, and platform-native polish.",
      "Replay and attachment semantics need stricter tests before the gateway can be treated as always-on.",
    ],
    nextImplementationTasks: [
      {
        id: "gateway-daemon-recovery",
        title: "Tighten daemon-grade reconnect and replay semantics.",
        ownerSurface: "gateway runner",
        files: [
          "packages/agent/src/gateway/runner/gateway-runner.ts",
          "packages/agent/src/gateway/gateway-supervision-flow.test.ts",
          "docs/native-experience-ledger.md",
        ],
        definitionOfDone: [
          "Restart scenarios preserve or explicitly fail queued work.",
          "Replay entries include platform, target, idempotency key, and delivery state.",
          "The native experience ledger names remaining platform-specific gaps only.",
        ],
      },
      {
        id: "channel-native-polish",
        title: "Make platform-native message behavior testable per adapter.",
        ownerSurface: "gateway adapters",
        files: [
          "packages/agent/src/gateway/platforms",
          "packages/agent/src/gateway/receive/setup.test.ts",
          "docs/native-experience-ledger.md",
        ],
        definitionOfDone: [
          "Each enabled adapter declares typing, edit, reply, thread, attachment, and voice support.",
          "Mock tests assert the declared support is reflected in delivery behavior.",
          "Unsupported capabilities produce explicit degraded metadata.",
        ],
      },
    ],
  },
  {
    id: "automation-and-daily-tasks",
    title: "Automation And Daily Tasks",
    outcome:
      "Doolittle can run scheduled work, short follow-ups, standing orders, and daily briefings with observable delivery.",
    referenceSignals: [
      "Doolittle cron jobs create fresh sessions, inject skills, execute prompts, and deliver results to configured platforms.",
      "OpenClaw separates cron, heartbeat, standing orders, webhooks, polling, and taskflow so daily automation feels intentional.",
    ],
    elizaosLeverage: [
      "ElizaOS task workers can own recurring or background execution.",
      "Doolittle scheduler and gateway services should translate task results into operator-visible delivery.",
    ],
    doolittleSurfaces: [
      "packages/plugins/doolittle-plugin/scheduler-service.ts",
      "packages/agent/src/server.ts",
      "packages/agent/src/services/gateway-session-service.ts",
      "docs/operator-loop.md",
    ],
    acceptanceScenarios: [
      {
        id: "automation-and-daily-tasks.daily-brief",
        surface: "scheduler",
        trigger:
          "Create a daily briefing job that summarizes tasks, calendar-like notes, and repo status into a target channel.",
        requiredSignals: [
          "The job has a stable id, schedule, next run, last run, and delivery target.",
          "Execution starts a bounded agent turn.",
          "Delivery result is recorded in gateway history.",
        ],
        verification: [
          "Add scheduler tests for due job execution and delivery recording.",
          "Run `bun test packages/plugins/doolittle-plugin/scheduler-service.test.ts packages/agent/src/gateway`.",
        ],
        currentStatus: "missing",
      },
      {
        id: "automation-and-daily-tasks.short-followup",
        surface: "heartbeat",
        trigger:
          "Ask Doolittle to check back in 30 minutes on the current thread.",
        requiredSignals: [
          "Creates a thread-bound follow-up instead of a detached cron job.",
          "Preserves the current session route.",
          "Can be listed, paused, or canceled from operator commands.",
        ],
        verification: [
          "Add heartbeat tests for thread-bound follow-up creation and cancellation.",
          "Run the scheduler and gateway session tests together.",
        ],
        currentStatus: "missing",
      },
    ],
    currentGaps: [
      "Scheduler service exists, but the product contract for daily tasks, standing orders, and thread heartbeats is not yet test-backed.",
      "Automation delivery should be visible in the same gateway/session history used by normal messages.",
    ],
    nextImplementationTasks: [
      {
        id: "scheduler-task-contract",
        title: "Define and test scheduled task lifecycle fields.",
        ownerSurface: "scheduler service",
        files: [
          "packages/plugins/doolittle-plugin/scheduler-service.ts",
          "packages/plugins/doolittle-plugin/scheduler-service.test.ts",
          "docs/operator-loop.md",
        ],
        definitionOfDone: [
          "Jobs expose id, schedule, nextRun, lastRun, status, target, and lastDelivery.",
          "Due jobs run bounded turns and record delivery outcomes.",
          "Operator docs include create, list, pause, resume, cancel, and inspect flows.",
        ],
      },
      {
        id: "thread-heartbeat-contract",
        title: "Add short follow-up and thread heartbeat semantics.",
        ownerSurface: "scheduler and gateway session",
        files: [
          "packages/plugins/doolittle-plugin/scheduler-service.ts",
          "packages/agent/src/services/gateway-session-service.ts",
          "packages/agent/src/runtime/chat.ts",
        ],
        definitionOfDone: [
          "Short follow-ups are attached to the current session route by default.",
          "Heartbeat entries can be canceled before firing.",
          "Delivery writes back into the originating thread or a clearly configured fallback.",
        ],
      },
    ],
  },
  {
    id: "model-provider-freedom",
    title: "Model Provider Freedom",
    outcome:
      "Operators can connect, inspect, switch, and fail over among model providers without losing runtime clarity.",
    referenceSignals: [
      "Doolittle emphasizes provider breadth, OAuth/setup flows, runtime provider resolution, model switching, and fallback chains.",
      "OpenClaw treats models as a first-class concept with provider docs, failover, auth profiles, and provider-specific media behavior.",
    ],
    elizaosLeverage: [
      "ElizaOS provider plugins should own model handlers and auth expectations, including the official Ollama plugin for local/self-hosted inference.",
      "Doolittle should expose provider readiness, linked account state, model choice, and fallback decisions in operator surfaces.",
    ],
    doolittleSurfaces: [
      "packages/agent/src/runtime/native/account-auth",
      "packages/agent/src/runtime/linked-provider-accounts/messages.ts",
      "packages/plugins/doolittle-plugin/model-fallback.ts",
      "packages/agent/src/services/operator/version.ts",
    ],
    acceptanceScenarios: [
      {
        id: "model-provider-freedom.model-switch",
        surface: "operator shell",
        trigger:
          "Run `/model list`, switch to another configured provider/model, then run a simple prompt.",
        requiredSignals: [
          "The list shows provider, model, auth state, context hints, and degraded reasons.",
          "The switch updates the active runtime selection for the session.",
          "The next run records which provider/model was used.",
        ],
        verification: [
          "Add parser and runtime summary tests for model list and switch responses.",
          "Run `bun test packages/agent/src/runtime/native/account-auth packages/plugins/doolittle-plugin/model-fallback.test.ts`.",
        ],
        currentStatus: "partial",
      },
      {
        id: "model-provider-freedom.failover",
        surface: "model fallback",
        trigger:
          "Simulate a primary provider failure with a configured fallback provider.",
        requiredSignals: [
          "The failure reason is recorded.",
          "Fallback selection is explicit.",
          "The final response names the provider actually used when verbose diagnostics are enabled.",
        ],
        verification: [
          "Add fallback tests for rate limit, auth failure, and provider unavailable cases.",
          "Run `bun test packages/plugins/doolittle-plugin/model-fallback.test.ts`.",
        ],
        currentStatus: "partial",
      },
    ],
    currentGaps: [
      "Provider package versions are current and the bootstrap is local-first on Ollama, but the operator model command surface needs to feel as direct as the rest of Doolittle.",
      "Fallback behavior exists but should be visible at run level, not only as internal configuration.",
    ],
    nextImplementationTasks: [
      {
        id: "model-command-deck",
        title: "Add model list, switch, current, and doctor commands.",
        ownerSurface: "operator shell and account auth",
        files: [
          "packages/agent/src/runtime/chat.ts",
          "packages/agent/src/runtime/native/account-auth",
          "packages/agent/src/services/operator/runtime-summary/update.test.ts",
        ],
        definitionOfDone: [
          "Operators can see all configured providers and degraded reasons.",
          "Session model switch changes the next run without editing config by hand.",
          "Doctor output suggests the exact provider setup command or env var needed.",
        ],
      },
      {
        id: "run-level-provider-proof",
        title: "Record provider and fallback proof on every run.",
        ownerSurface: "run metadata",
        files: [
          "packages/plugins/doolittle-plugin/model-fallback.ts",
          "packages/agent/src/runtime/chat-turn/provider-handler.ts",
          "packages/agent/src/cli/tui-renderers.test.ts",
        ],
        definitionOfDone: [
          "Run summaries include requested provider, resolved provider, fallback provider, and failure reason when applicable.",
          "Verbose progress surfaces show fallback decisions once.",
          "Tests cover successful primary and fallback execution metadata.",
        ],
      },
    ],
  },
  {
    id: "observability-safety-proof",
    title: "Observability Safety And Proof",
    outcome:
      "Doolittle shows what it did, why it was allowed, what changed, what failed, and what remains risky.",
    referenceSignals: [
      "Doolittle uses callbacks, approvals, session state, and trajectory-style records to make work inspectable.",
      "OpenClaw treats security defaults, pairing, audit checks, tool policies, and gateway auth as product surfaces.",
    ],
    elizaosLeverage: [
      "ElizaOS event streams, evaluators, services, and routes should provide the raw runtime evidence.",
      "Doolittle should render the evidence into operator summaries, doctor output, and acceptance artifacts.",
    ],
    doolittleSurfaces: [
      "packages/agent/src/services/diagnostics",
      "packages/agent/src/services/operator/runtime-summary",
      "packages/agent/src/runtime/native/service-bridge/tool-policy.ts",
      "scripts/check-repo-hygiene.ts",
    ],
    acceptanceScenarios: [
      {
        id: "observability-safety-proof.run-receipt",
        surface: "run summary",
        trigger:
          "Run a multi-tool task that reads, writes, and verifies a file.",
        requiredSignals: [
          "Summary includes tools used, files changed, approvals requested, commands run, and verification commands.",
          "Failures are reported as failures, not converted into vague next steps.",
          "The transcript can be inspected by run id.",
        ],
        verification: [
          "Add a fixture task that produces a run receipt with read, write, command, and verification entries.",
          "Run `bun test packages/agent/src/services/operator/runtime-summary`.",
        ],
        currentStatus: "partial",
      },
      {
        id: "observability-safety-proof.security-audit",
        surface: "doctor and audit",
        trigger:
          "Expose a gateway or tool policy misconfiguration and run `doolittle doctor`.",
        requiredSignals: [
          "Doctor reports the exact unsafe setting.",
          "The report distinguishes personal trusted mode from shared or remote exposure.",
          "The suggested fix names the config path to change.",
        ],
        verification: [
          "Add diagnostics tests for open gateway auth, permissive exec, and unpaired messaging access.",
          "Run `bun test packages/agent/src/services/diagnostics`.",
        ],
        currentStatus: "partial",
      },
    ],
    currentGaps: [
      "Doolittle has diagnostics and runtime summaries, but run receipts are not yet the normal final artifact after meaningful work.",
      "Security posture should be as visible as capability posture, especially for gateway and tool exposure.",
    ],
    nextImplementationTasks: [
      {
        id: "run-receipt-standard",
        title: "Standardize run receipts for multi-tool work.",
        ownerSurface: "runtime summary",
        files: [
          "packages/agent/src/services/operator/runtime-summary/update.test.ts",
          "packages/agent/src/services/operator/runtime-summary/ownership.test.ts",
          "packages/agent/src/runtime/chat-turn/provider-handler.ts",
        ],
        definitionOfDone: [
          "Run summaries list tools, changed files, commands, approvals, verification, and unresolved risks.",
          "The final answer can reference the run receipt without dumping raw logs.",
          "Tests cover success, partial failure, and blocked approval cases.",
        ],
      },
      {
        id: "security-doctor-contract",
        title: "Add security posture findings to doctor output.",
        ownerSurface: "diagnostics",
        files: [
          "packages/agent/src/services/diagnostics",
          "packages/agent/src/runtime/native/service-bridge/tool-policy.ts",
          "docs/operator-loop.md",
        ],
        definitionOfDone: [
          "Doctor flags open gateway auth, broad exec policy, and shared channel exposure.",
          "Each finding includes severity, config path, and a concrete remediation.",
          "Personal trusted-mode warnings are labeled differently from public-exposure blockers.",
        ],
      },
    ],
  },
];

export function listOperatorWowContract(): OperatorWowContractPillar[] {
  return [...OPERATOR_WOW_CONTRACT];
}

export function getOperatorWowContractPillar(
  id: string,
): OperatorWowContractPillar | undefined {
  return OPERATOR_WOW_CONTRACT.find((entry) => entry.id === id);
}

export function listOperatorWowAcceptanceScenarios(): OperatorWowAcceptanceScenario[] {
  return OPERATOR_WOW_CONTRACT.flatMap((entry) => entry.acceptanceScenarios);
}

export function summarizeOperatorWowContract() {
  const scenarios = listOperatorWowAcceptanceScenarios();
  const tasks = OPERATOR_WOW_CONTRACT.flatMap(
    (entry) => entry.nextImplementationTasks,
  );

  return {
    pillars: OPERATOR_WOW_CONTRACT.length,
    scenarios: scenarios.length,
    tasks: tasks.length,
    coveredScenarios: scenarios.filter(
      (scenario) => scenario.currentStatus === "covered",
    ).length,
    partialScenarios: scenarios.filter(
      (scenario) => scenario.currentStatus === "partial",
    ).length,
    missingScenarios: scenarios.filter(
      (scenario) => scenario.currentStatus === "missing",
    ).length,
  };
}
