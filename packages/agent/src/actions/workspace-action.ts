import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import {
  readEffectiveWorkspaceFile,
  runEffectiveShellCommand,
  searchEffectiveWorkspace,
  writeEffectiveWorkspaceFile,
} from "@/runtime/native/service-bridge";
import type { AppServices } from "@/services";

type WorkspaceIntent =
  | { kind: "tree" }
  | { kind: "overview"; path?: string }
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

function extractExplicitProjectPath(text: string): string | undefined {
  const quoted = normalizeQuotedSegment(text);
  if (quoted && /^(~|\/|\.{1,2}\/|(?:dev|code|projects)\/)/u.test(quoted)) {
    return quoted;
  }

  const locatedPath =
    text.match(
      /(?:located|living|sitting)\s+(?:at|in|under)\s+((?:~|\/|\.{1,2}\/|(?:dev|code|projects)\/)[^\s,;:!?]+)/iu,
    )?.[1] ??
    text.match(
      /\b((?:~|\/|\.{1,2}\/|(?:dev|code|projects)\/)[A-Za-z0-9._/-]+)/u,
    )?.[1];
  return locatedPath?.trim() || undefined;
}

function resolveLocalProjectPath(
  inputPath: string,
  workspaceDir: string,
): string | undefined {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    return undefined;
  }
  const home = process.env.HOME ?? workspaceDir;
  const expanded = trimmed.startsWith("~/")
    ? join(home, trimmed.slice(2))
    : trimmed;
  const resolved = isAbsolute(expanded)
    ? resolve(expanded)
    : /^(dev|code|projects)\//u.test(expanded)
      ? resolve(home, expanded)
      : resolve(workspaceDir, expanded);
  return existsSync(resolved) ? resolved : undefined;
}

function detectProjectKind(projectPath: string): string {
  const markers = [
    ["package.json", "Node/Bun package"],
    ["bun.lock", "Bun workspace"],
    ["pnpm-workspace.yaml", "pnpm workspace"],
    ["pyproject.toml", "Python project"],
    ["Cargo.toml", "Rust crate"],
    ["go.mod", "Go module"],
    ["Gemfile", "Ruby project"],
  ] as const;
  const detected = markers
    .filter(([file]) => existsSync(join(projectPath, file)))
    .map(([, label]) => label);
  return detected.length > 0 ? detected.join(", ") : "project directory";
}

function readProjectReadme(projectPath: string): string | undefined {
  for (const candidate of ["README.md", "README", "readme.md"]) {
    const target = join(projectPath, candidate);
    if (!existsSync(target)) {
      continue;
    }
    try {
      const preview = readFileSync(target, "utf8")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 8)
        .join("\n");
      if (preview) {
        return preview;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function summarizeLocalProject(projectPath: string): string {
  const entries = readdirSync(projectPath)
    .filter((entry) => ![".git", "node_modules", "dist"].includes(entry))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 12);
  const isGitRepository = existsSync(join(projectPath, ".git"));
  const readmePreview = readProjectReadme(projectPath);

  return [
    `Project: ${basename(projectPath)}`,
    `Path: ${projectPath}`,
    `Type: ${detectProjectKind(projectPath)}`,
    `Git: ${isGitRepository ? "yes" : "no"}`,
    entries.length > 0 ? `Top entries: ${entries.join(", ")}` : undefined,
    readmePreview ? `README preview:\n${readmePreview}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
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
  if (rawKind === "overview") {
    const path =
      nonEmptyString(record.path) ??
      nonEmptyString(record.target) ??
      nonEmptyString(record.project);
    return { kind: "overview", path };
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
  const explicitProjectPath = extractExplicitProjectPath(trimmed);
  if (
    /(workspace tree|show (?:me )?(?:the )?(?:repo|workspace) tree|list files|show files|show structure|project structure)/u.test(
      lower,
    )
  ) {
    return { kind: "tree" };
  }

  if (
    /(summari[sz]e|overview|what is|inspect|look at).*(repo|repository|project|codebase|workspace)/u.test(
      lower,
    )
  ) {
    return explicitProjectPath
      ? { kind: "overview", path: explicitProjectPath }
      : { kind: "overview" };
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
    explicitProjectPath &&
    /\b(repo|repository|project|codebase|directory|folder|overview|inspect|look at|what is)\b/iu.test(
      trimmed,
    )
  ) {
    return { kind: "find-codebase", query: explicitProjectPath };
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
  runtime: IAgentRuntime,
  services: AppServices,
  workspaceDir: string,
  intent: WorkspaceIntent,
): Promise<string> {
  if (intent.kind === "tree") {
    return services.workspace.summary(40);
  }
  if (intent.kind === "overview") {
    const projectPath = intent.path
      ? (resolveLocalProjectPath(intent.path, workspaceDir) ?? workspaceDir)
      : workspaceDir;
    return summarizeLocalProject(projectPath);
  }
  if (intent.kind === "read") {
    return String(readEffectiveWorkspaceFile(runtime, services, intent.path));
  }
  if (intent.kind === "search") {
    const results = searchEffectiveWorkspace(
      runtime,
      services,
      intent.query,
      20,
    ) as Array<{
      path: string;
      matches: string[];
    }>;
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
    return `Wrote ${String(writeEffectiveWorkspaceFile(runtime, services, intent.path, intent.content))}.`;
  }

  const query = sanitizeFindQuery(intent.query);
  if (!query) {
    return "I couldn't determine the codebase name to search for.";
  }
  const explicitProjectPath = resolveLocalProjectPath(query, workspaceDir);
  if (explicitProjectPath) {
    try {
      if (statSync(explicitProjectPath).isDirectory()) {
        return summarizeLocalProject(explicitProjectPath);
      }
      return `Found file path: ${explicitProjectPath}`;
    } catch (error) {
      return `I found ${explicitProjectPath}, but couldn't inspect it: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const searchQuery = query.includes("/") ? basename(query) : query;
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
        `[ -d "${root}" ] && find "${root}" -maxdepth 4 -type d \\( -name .git -prune -o -iname "*${searchQuery}*" -print \\) 2>/dev/null`,
    )
    .join(" ; ");
  const result = (await runEffectiveShellCommand(
    runtime,
    services,
    `${command} | head -50`,
  )) as {
    command: string;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
  };
  const matches = (result.stdout || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (matches.length === 1 && existsSync(matches[0] || "")) {
    try {
      if (statSync(matches[0] as string).isDirectory()) {
        return summarizeLocalProject(matches[0] as string);
      }
    } catch {
      // Fall back to raw command output below.
    }
  }

  return matches.length > 0
    ? [
        `Found matching local codebases:`,
        ...matches.map((line) => `- ${line}`),
      ].join("\n")
    : [
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
      runtime: IAgentRuntime,
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
        response = await executeWorkspaceIntent(
          runtime,
          services,
          workspaceDir,
          intent,
        );
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
