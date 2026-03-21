import type { FeatureMapping } from "@/types";

export const featureMap: FeatureMapping[] = [
  {
    platformCapability: "Persona and system behavior",
    elizaImplementation: "ElizaOS character definition",
    notes:
      "Mapped into a dedicated `character.json` plus `packages/agent/src/character.ts` bootstrap.",
  },
  {
    platformCapability: "Persistent MEMORY.md and USER.md stores",
    elizaImplementation: "Custom memory service + provider",
    notes:
      "Preserves bounded memory snapshots and explicit user profile separation.",
  },
  {
    platformCapability: "Cross-session user and agent profile memory",
    elizaImplementation:
      "User profile service with explicit memories, dual profile cards, and operator APIs",
    notes:
      "Tracks preferences, goals, project context, constraints, explicit memories, and a first-class Eliza Agent identity profile for cross-session operator continuity.",
  },
  {
    platformCapability: "Session search across prior conversations",
    elizaImplementation: "Custom SQLite session service + `/search` command",
    notes: "Implements searchable message history for cross-session recall.",
  },
  {
    platformCapability: "Skills registry and skill browsing",
    elizaImplementation: "Custom skills service + `/skills` command",
    notes: "Loads `SKILL.md` files from a Bun-managed workspace directory.",
  },
  {
    platformCapability: "Scheduled automations and cron jobs",
    elizaImplementation: "Custom cron service + `/cron` command family",
    notes:
      "Supports intervals, one-shot delays, and 5-field cron expressions with persistent job storage, local artifact persistence, and home-channel delivery routing.",
  },
  {
    platformCapability: "Workspace exploration and file access",
    elizaImplementation: "Workspace service + `/workspace` command family",
    notes:
      "Provides tree, read, search, and write flows rooted to the configured workspace directory.",
  },
  {
    platformCapability: "Local terminal execution",
    elizaImplementation: "Terminal service + `/terminal` command family",
    notes:
      "Runs Bun-hosted shell commands locally and persists recent command history for operator continuity.",
  },
  {
    platformCapability: "Repository state inspection",
    elizaImplementation: "Repository service + `/repo` command family",
    notes:
      "Exposes git status, diff summaries, and recent commits as first-class runtime capabilities.",
  },
  {
    platformCapability: "Execution backend abstraction",
    elizaImplementation:
      "Terminal service with local, Docker, and SSH backend model",
    notes:
      "Local execution is active now, while Docker and SSH include concrete runtime configuration, health probes, and backend-specific invocation paths.",
  },
  {
    platformCapability: "Tool registry and MCP bridge",
    elizaImplementation: "Tools service + MCP service",
    notes:
      "Publishes a first-class tool inventory, supports structured MCP tool discovery, and invokes MCP tools through a local bridge command.",
  },
  {
    platformCapability: "Browser-backed web retrieval",
    elizaImplementation: "Web service with Lightpanda-first browser backend",
    notes:
      "Uses Lightpanda as the default browser backend with graceful fallback to basic HTTP fetch mode, plus richer page metadata, structured snapshots, and screenshot artifacts with metadata sidecars.",
  },
  {
    platformCapability: "Native text-to-speech and voice synthesis",
    elizaImplementation: "Official TTS plugin plus media speech bundles",
    notes:
      "Uses the first-party TTS plugin when FAL is configured and keeps the media service as a fallback and audit layer for provider-native or offline speech generation.",
  },
  {
    platformCapability:
      "Model-assisted media analysis, transcription, speech, and generation",
    elizaImplementation:
      "Media service with analysis, voice, vision, transcription, speech, and image generation bundles",
    notes:
      "Creates model-assisted reports for audio, image, and document artifacts, can transcribe audio through provider-native speech endpoints, can synthesize Eliza Agent speech audio when the provider supports it, and can emit concept image bundles or SVG fallbacks.",
  },
  {
    platformCapability: "Action benchmarks and code-generation evaluation",
    elizaImplementation:
      "Official action-bench and autocoder plugins plus trajectory benchmark flows",
    notes:
      "Adds Eliza-native benchmark actions and SWE-bench style code-generation evaluation so the research stack can compare action coverage and code quality directly inside the runtime.",
  },
  {
    platformCapability: "Trajectory export, research packaging, and evaluation",
    elizaImplementation:
      "Trajectory service with dataset, research, package, and evaluation bundle flows",
    notes:
      "Packages session histories with purpose, mode, tags, and notes metadata, then scores bundles with heuristic and model-assisted evaluation reports before assembling a research package manifest and report.",
  },
  {
    platformCapability: "Delegation task tracking",
    elizaImplementation: "Delegation service + `/delegate` command family",
    notes:
      "Tracks local and delegated task records so multi-agent orchestration can grow on top of a durable queue.",
  },
  {
    platformCapability: "Gateway/API access",
    elizaImplementation: "Bun HTTP API",
    notes:
      "Provides a clean Bun-native API surface for health checks, chat, memory, skills, and feature inventory.",
  },
  {
    platformCapability: "Provider-backed model execution",
    elizaImplementation: "Official OpenAI and Anthropic ElizaOS plugins",
    notes:
      "Uses first-party ElizaOS provider plugins when credentials are available, with offline fallback only for local bootstrap.",
  },
  {
    platformCapability: "Document ingestion utilities",
    elizaImplementation: "Official PDF ElizaOS plugin",
    notes:
      "Adds a native ElizaOS PDF service so document parsing can stay inside the runtime plugin system.",
  },
  {
    platformCapability: "Local terminal entrypoint",
    elizaImplementation: "Bun CLI loop",
    notes:
      "Exposes an interactive terminal path for local development and direct operator workflows.",
  },
  {
    platformCapability: "Tool-mediated memory nudges",
    elizaImplementation: "Custom evaluator",
    notes:
      "Detects explicit remember/save cues and writes them into the appropriate memory store.",
  },
];
