import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  canonicalizeSlashCommandSyntax,
  normalizeSlashCommandSyntax,
} from "@/runtime/slash-command-syntax";

export interface WorkflowCommandCatalogEntry {
  command: string;
  category: "workflow";
  description: string;
}

interface WorkflowCommandSeed {
  fileName: string;
  fallback: string;
}

export interface WorkflowCommandDefinition {
  command: string;
  title: string;
  description: string;
  markdown: string;
}

const WORKFLOW_COMMAND_SEEDS: WorkflowCommandSeed[] = [
  {
    fileName: "review.md",
    fallback: `---
command: /review
title: Repo Review
description: Review the current repo or target codebase and return the important structure, entrypoints, and risks.
---
Review {{TARGET}} in the local workspace.
`,
  },
  {
    fileName: "security-review.md",
    fallback: `---
command: /security-review
title: Security Review
description: Review the current repo or target codebase for security risks and missing hardening.
---
Review {{TARGET}} for security issues and operational hardening gaps.
`,
  },
  {
    fileName: "release-check.md",
    fallback: `---
command: /release-check
title: Release Check
description: Check whether the current repo or target codebase looks ready to ship and call out blockers.
---
Run a release-readiness review for {{TARGET}}.
`,
  },
];

function parseFrontmatter(markdown: string): {
  command?: string;
  title?: string;
  description?: string;
  body: string;
} {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/u);
  if (!match) {
    return { body: markdown.trim() };
  }
  const rawFrontmatter = match[1] ?? "";
  const body = (match[2] ?? "").trim();
  const fields = rawFrontmatter
    .split(/\r?\n/u)
    .reduce<Record<string, string>>((acc, line) => {
      const separator = line.indexOf(":");
      if (separator <= 0) {
        return acc;
      }
      const key = line.slice(0, separator).trim();
      const value = line
        .slice(separator + 1)
        .trim()
        .replace(/^"(.*)"$/u, "$1");
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {});

  return {
    command: fields.command,
    title: fields.title,
    description: fields.description,
    body,
  };
}

function loadBundledMarkdown(seed: WorkflowCommandSeed): string {
  try {
    return readFileSync(
      new URL(`./workflow-commands/${seed.fileName}`, import.meta.url),
      "utf8",
    );
  } catch {
    return seed.fallback;
  }
}

function normalizeWorkflowDefinition(
  markdown: string,
  fallbackCommand: string,
): WorkflowCommandDefinition | undefined {
  const parsed = parseFrontmatter(markdown);
  const command = canonicalizeSlashCommandSyntax(
    parsed.command?.trim() || fallbackCommand,
  );
  if (!command.startsWith("/")) {
    return undefined;
  }
  return {
    command,
    title: parsed.title?.trim() || command.slice(1),
    description:
      parsed.description?.trim() ||
      `Run the ${command} workflow against the current workspace.`,
    markdown,
  };
}

function builtInWorkflowDefinitions(): WorkflowCommandDefinition[] {
  return WORKFLOW_COMMAND_SEEDS.map((seed) =>
    normalizeWorkflowDefinition(
      loadBundledMarkdown(seed),
      `/${basename(seed.fileName, ".md")}`,
    ),
  ).filter((entry): entry is WorkflowCommandDefinition => Boolean(entry));
}

function discoverWorkspaceWorkflowDefinitions(
  workspaceDir: string,
): WorkflowCommandDefinition[] {
  const candidates = [
    join(workspaceDir, ".doolittle", "commands"),
    join(workspaceDir, "commands", "workflows"),
  ];
  const definitions: WorkflowCommandDefinition[] = [];

  for (const directory of candidates) {
    if (!existsSync(directory)) {
      continue;
    }
    for (const entry of readdirSync(directory)) {
      if (!entry.endsWith(".md")) {
        continue;
      }
      try {
        const markdown = readFileSync(join(directory, entry), "utf8");
        const normalized = normalizeWorkflowDefinition(
          markdown,
          `/${basename(entry, ".md")}`,
        );
        if (normalized) {
          definitions.push(normalized);
        }
      } catch {
        // Best effort only.
      }
    }
  }

  return definitions;
}

export function listWorkflowCommands(
  workspaceDir?: string,
): WorkflowCommandDefinition[] {
  const merged = new Map<string, WorkflowCommandDefinition>();
  for (const definition of builtInWorkflowDefinitions()) {
    merged.set(definition.command, definition);
  }
  if (workspaceDir) {
    for (const definition of discoverWorkspaceWorkflowDefinitions(
      workspaceDir,
    )) {
      merged.set(definition.command, definition);
    }
  }
  return [...merged.values()].sort((left, right) =>
    left.command.localeCompare(right.command),
  );
}

export function getWorkflowCommandCatalogEntries(
  workspaceDir?: string,
): WorkflowCommandCatalogEntry[] {
  return listWorkflowCommands(workspaceDir).map((definition) => ({
    command: definition.command,
    category: "workflow",
    description: definition.description,
  }));
}

export function renderWorkflowCommandCatalog(
  workspaceDir?: string,
  query?: string,
): string {
  const normalizedQuery = query?.trim().toLowerCase() || "";
  const commands = listWorkflowCommands(workspaceDir).filter((definition) => {
    if (!normalizedQuery) {
      return true;
    }
    return (
      definition.command.toLowerCase().includes(normalizedQuery) ||
      definition.title.toLowerCase().includes(normalizedQuery) ||
      definition.description.toLowerCase().includes(normalizedQuery)
    );
  });

  if (!commands.length) {
    return normalizedQuery
      ? `No workflow commands found for query: ${query}`
      : "No workflow commands available.";
  }

  return commands
    .map((definition) => `${definition.command} — ${definition.description}`)
    .join("\n");
}

export function resolveWorkflowCommandPrompt(input: {
  message: string;
  workspaceDir: string;
}): { definition: WorkflowCommandDefinition; prompt: string } | undefined {
  const trimmed = normalizeSlashCommandSyntax(input.message.trim());
  if (!trimmed.startsWith("/")) {
    return undefined;
  }

  const [commandToken, ...rest] = trimmed.split(/\s+/u);
  const command = canonicalizeSlashCommandSyntax(commandToken || "");
  const definition = listWorkflowCommands(input.workspaceDir).find(
    (entry) => entry.command === command,
  );
  if (!definition) {
    return undefined;
  }

  const parsed = parseFrontmatter(definition.markdown);
  const target =
    rest.join(" ").trim() || "the current repo in the active workspace";
  const prompt = parsed.body
    .replaceAll("{{TARGET}}", target)
    .replaceAll("{{WORKSPACE}}", input.workspaceDir)
    .trim();

  return {
    definition,
    prompt,
  };
}
