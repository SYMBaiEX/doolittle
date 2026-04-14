import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { canonicalizeSlashCommandSyntax } from "@/runtime/slash-command-syntax";
import { parseWorkflowFrontmatter } from "./frontmatter";
import type { WorkflowCommandDefinition, WorkflowCommandSeed } from "./types";

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

function loadBundledMarkdown(seed: WorkflowCommandSeed): string {
  try {
    return readFileSync(new URL(`./${seed.fileName}`, import.meta.url), "utf8");
  } catch {
    return seed.fallback;
  }
}

function normalizeWorkflowDefinition(
  markdown: string,
  fallbackCommand: string,
): WorkflowCommandDefinition | undefined {
  const parsed = parseWorkflowFrontmatter(markdown);
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

export function builtInWorkflowDefinitions(): WorkflowCommandDefinition[] {
  return WORKFLOW_COMMAND_SEEDS.map((seed) =>
    normalizeWorkflowDefinition(
      loadBundledMarkdown(seed),
      `/${basename(seed.fileName, ".md")}`,
    ),
  ).filter((entry): entry is WorkflowCommandDefinition => Boolean(entry));
}

export function discoverWorkspaceWorkflowDefinitions(
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
