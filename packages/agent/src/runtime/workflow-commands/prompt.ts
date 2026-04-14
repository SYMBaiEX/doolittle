import {
  canonicalizeSlashCommandSyntax,
  normalizeSlashCommandSyntax,
} from "@/runtime/slash-command-syntax";
import { parseWorkflowFrontmatter } from "./frontmatter";
import { listWorkflowCommands } from "./listing";
import type { WorkflowCommandDefinition } from "./types";

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

  const parsed = parseWorkflowFrontmatter(definition.markdown);
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
