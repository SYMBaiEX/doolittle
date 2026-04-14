import type { ParsedWorkflowFrontmatter } from "./types";

export function parseWorkflowFrontmatter(
  markdown: string,
): ParsedWorkflowFrontmatter {
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
