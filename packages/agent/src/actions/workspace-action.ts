import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import type { AppServices } from "@/services";

type WorkspaceIntent =
  | { kind: "tree" }
  | { kind: "read"; path: string }
  | { kind: "search"; query: string }
  | { kind: "write"; path: string; content: string }
  | { kind: "find-codebase"; query: string };

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeQuotedSegment(value: string): string | undefined {
  const fenced = value.match(/`([^`\n]+)`/u);
  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }
  const quoted = value.match(/"([^"\n]+)"|'([^'\n]+)'/u);
  const candidate = quoted?.[1] ?? quoted?.[2];
  return candidate?.trim() || undefined;
}

export function resolveWorkspaceIntentFromParams(
  params: unknown,
): WorkspaceIntent | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }
  const record = params as Record<string, unknown>;
  const rawKind =
    nonEmptyString(record.intent) ??
    nonEmptyString(record.action) ??
    nonEmptyString(record.mode);

  if (rawKind === "tree") {
    return { kind: "tree" };
  }
  if (rawKind === "read") {
    const path =
      nonEmptyString(record.path) ??
      nonEmptyString(record.file) ??
      nonEmptyString(record.target);
    return path ? { kind: "read", path } : undefined;
  }
  if (rawKind === "search") {
    const query =
      nonEmptyString(record.query) ??
      nonEmptyString(record.term) ??
      nonEmptyString(record.pattern);
    return query ? { kind: "search", query } : undefined;
  }
  if (rawKind === "write") {
    const path =
      nonEmptyString(record.path) ??
      nonEmptyString(record.file) ??
      nonEmptyString(record.target);
    const content =
      nonEmptyString(record.content) ?? nonEmptyString(record.text);
    return path && content ? { kind: "write", path, content } : undefined;
  }
  if (rawKind === "find-codebase") {
    const query =
      nonEmptyString(record.query) ??
      nonEmptyString(record.name) ??
      nonEmptyString(record.term);
    return query ? { kind: "find-codebase", query } : undefined;
  }
  return undefined;
}

export function resolveWorkspaceIntentFromText(
  text: string,
): WorkspaceIntent | undefined {
  const trimmed = text.trim();
  if (trimmed === "/workspace" || trimmed === "/workspace tree") {
    return { kind: "tree" };
  }
  if (trimmed.startsWith("/workspace read ")) {
    const path = trimmed.replace("/workspace read ", "").trim();
    return path ? { kind: "read", path } : undefined;
  }
  if (trimmed.startsWith("/workspace search ")) {
    const query = trimmed.replace("/workspace search ", "").trim();
    return query ? { kind: "search", query } : undefined;
  }
  if (trimmed.startsWith("/workspace write ")) {
    const payload = trimmed.replace("/workspace write ", "");
    const [path, ...contentParts] = payload.split("::");
    const relativePath = path?.trim();
    const content = contentParts.join("::").trim();
    return relativePath && content
      ? { kind: "write", path: relativePath, content }
      : undefined;
  }

  const lower = trimmed.toLowerCase();
  if (
    /(workspace tree|show (?:me )?(?:the )?(?:repo|workspace) tree|list files|show files|show structure|project structure)/u.test(
      lower,
    )
  ) {
    return { kind: "tree" };
  }

  if (
    /(read|open|show|cat|view).*(file|source|ts|js|json|md|tsx|jsx|py|rs|go|java)/iu.test(
      trimmed,
    )
  ) {
    const path =
      trimmed.match(
        /(?:read|open|show|cat|view)\s+(?:the\s+)?file\s+([^\n]+)$/iu,
      )?.[1] ?? normalizeQuotedSegment(trimmed);
    return path ? { kind: "read", path } : undefined;
  }

  if (
    /(search|find|look for).*(workspace|repo|repository|codebase|project|files?)/u.test(
      lower,
    )
  ) {
    const query =
      trimmed
        .match(
          /(?:search|find|look for)\s+(?:the\s+)?(?:workspace|repo|repository|codebase|project|files?)?\s*(?:for\s+)?([^\n]+)$/iu,
        )?.[1]
        ?.trim() ?? "";
    return query ? { kind: "search", query } : undefined;
  }

  const localCodebaseSearch =
    trimmed.match(
      /(?:search|find|look for)\s+(?:the\s+)?(?:local\s+system|machine|computer).*(?:codebase|repo|repository|project)(?:\s+(?:named|called))?\s+([^\n]+)$/iu,
    )?.[1] ??
    trimmed.match(
      /(?:search|find|look for)\s+(?:a\s+)?(?:codebase|repo|repository|project)(?:\s+(?:named|called))?\s+([^\n]+)\s+(?:on|in)\s+(?:the\s+)?(?:local\s+system|machine|computer)$/iu,
    )?.[1];
  if (localCodebaseSearch?.trim()) {
    return { kind: "find-codebase", query: localCodebaseSearch.trim() };
  }

  return undefined;
}

function sanitizeFindQuery(value: string): string {
  return value.replace(/[^a-zA-Z0-9._/\- ]/gu, "").trim();
}

export async function executeWorkspaceIntent(
  services: AppServices,
  workspaceDir: string,
  intent: WorkspaceIntent,
): Promise<string> {
  if (intent.kind === "tree") {
    return services.workspace.summary(40);
  }
  if (intent.kind === "read") {
    return services.workspace.read(intent.path);
  }
  if (intent.kind === "search") {
    const results = services.workspace.search(intent.query, 20);
    return results.length
      ? results
          .map(
            (result) =>
              `${result.path}\n${result.matches.map((line) => `  ${line}`).join("\n")}`,
          )
          .join("\n\n")
      : "No workspace matches found.";
  }
  if (intent.kind === "write") {
    return `Wrote ${services.workspace.write(intent.path, intent.content)}.`;
  }

  const query = sanitizeFindQuery(intent.query);
  if (!query) {
    return "I couldn't determine the codebase name to search for.";
  }
  const home = process.env.HOME ?? workspaceDir;
  const searchRoots = [
    `${home}/dev`,
    `${home}/code`,
    `${home}/projects`,
    workspaceDir,
  ];
  const command = searchRoots
    .map(
      (root) =>
        `[ -d "${root}" ] && find "${root}" -maxdepth 4 -type d \\( -name .git -prune -o -iname "*${query}*" -print \\) 2>/dev/null`,
    )
    .join(" ; ");
  const result = await services.terminal.run(`${command} | head -50`);
  return [
    `Command: ${result.command}`,
    result.exitCode !== undefined ? `Exit: ${result.exitCode}` : undefined,
    `STDOUT:\n${result.stdout || "(empty)"}`,
    `STDERR:\n${result.stderr || "(empty)"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function createWorkspaceAction(
  services: AppServices,
  workspaceDir: string,
): Action {
  return {
    name: "ELIZA_AGENT_WORKSPACE",
    similes: [
      "WORKSPACE_TREE",
      "WORKSPACE_READ",
      "WORKSPACE_SEARCH",
      "WORKSPACE_WRITE",
    ],
    description:
      "Explores the local workspace. Use this to list files, read a file, search the repo, or write a file when the user asks directly.",
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content?.text;
      return Boolean(text && resolveWorkspaceIntentFromText(text));
    },
    handler: async (
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ): Promise<ActionResult> => {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content?.text;
      const intent =
        resolveWorkspaceIntentFromParams(options?.parameters) ??
        (text ? resolveWorkspaceIntentFromText(text) : undefined);
      let response = "";

      if (intent) {
        response = await executeWorkspaceIntent(services, workspaceDir, intent);
      } else {
        response =
          "I can list files, read a file, search the workspace, or write a file. Try `/workspace tree` or ask `search the repo for auth middleware`.";
      }

      await callback?.({ text: response, source: "workspace-action" });
      return { success: Boolean(intent), text: response };
    },
    examples: [
      [
        {
          name: "{{userName}}",
          content: { text: "Search the workspace for linked provider auth." },
        },
        {
          name: "{{agentName}}",
          content: {
            text: "packages/agent/src/runtime/native/account-auth.ts",
            actions: ["ELIZA_AGENT_WORKSPACE"],
          },
        },
      ],
    ],
  };
}
