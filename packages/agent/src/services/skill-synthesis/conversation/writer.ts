import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ConversationAnalysisInput } from "./types";

export function writeConversationSkillDocument(
  input: ConversationAnalysisInput,
): string {
  const dir = join(input.generatedDir, input.candidate.slug);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "SKILL.md");
  const excerpt = input.messages
    .slice(0, 6)
    .map((message) => `**[${message.role}]** ${message.text.slice(0, 200)}`)
    .join("\n\n");

  const content = [
    `# ${input.candidate.title}`,
    "",
    `> Auto-synthesized from session \`${input.sessionId}\` on ${input.updatedAt.split("T")[0]}.`,
    "",
    "## Category",
    input.candidate.category,
    "",
    "## When to Use",
    `Use this skill when a task resembles: "${input.candidate.title.toLowerCase()}"`,
    "",
    "## Why This Was Saved",
    input.candidate.rationale,
    "",
    "## Key Steps",
    ...input.candidate.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "## Novelty Signals Detected",
    ...input.candidate.signals.map((signal) => `- ${signal}`),
    "",
    "## Conversation Context (excerpt)",
    excerpt,
    "",
    "## Metadata",
    `- Session ID: ${input.sessionId}`,
    `- Turn count: ${input.messages.length}`,
    `- Category: ${input.candidate.category}`,
    `- Created: ${input.createdAt}`,
    `- Updated: ${input.updatedAt}`,
    "",
    "## Usage",
    "Review the key steps above and adapt them to the current task context.",
  ].join("\n");

  writeFileSync(path, content, "utf8");
  return path;
}
