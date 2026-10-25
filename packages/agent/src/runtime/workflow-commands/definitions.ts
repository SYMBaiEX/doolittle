import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";
import { isStrictlyContainedPath } from "../../utils/path-containment";
import { readRegularFileSync } from "../../utils/read-regular-file";
import { canonicalizeSlashCommandSyntax } from "../slash-command-syntax";
import { parseWorkflowFrontmatter } from "./frontmatter";
import type { WorkflowCommandDefinition, WorkflowCommandSeed } from "./types";

const MAX_WORKFLOW_FILE_BYTES = 1024 * 1024;

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
  let workspaceRoot: string;
  try {
    workspaceRoot = realpathSync(workspaceDir);
  } catch {
    return [];
  }
  const candidates = [
    join(workspaceRoot, ".doolittle", "commands"),
    join(workspaceRoot, "commands", "workflows"),
  ];
  const definitions: WorkflowCommandDefinition[] = [];

  for (const directory of candidates) {
    let canonicalDirectory: string;
    let entries: string[];
    try {
      canonicalDirectory = realpathSync(directory);
      // Repository links must not pull unrelated host files into model prompts.
      if (!isStrictlyContainedPath(workspaceRoot, canonicalDirectory)) continue;
      entries = readdirSync(canonicalDirectory);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.endsWith(".md")) {
        continue;
      }

      try {
        const path = realpathSync(join(canonicalDirectory, entry));
        if (!isStrictlyContainedPath(workspaceRoot, path)) continue;
        const markdown = readRegularFileSync(
          path,
          MAX_WORKFLOW_FILE_BYTES,
        ).toString("utf8");
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
