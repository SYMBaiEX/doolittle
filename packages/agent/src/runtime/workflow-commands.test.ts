import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { parseWorkflowFrontmatter } from "./workflow-commands/frontmatter";

function readBundledWorkflowMarkdown(fileName: string): string {
  return readFileSync(
    new URL(`./workflow-commands/${fileName}`, import.meta.url),
    "utf8",
  );
}

describe("workflow commands", () => {
  it("ships the built-in workflow command prompts", () => {
    const review = parseWorkflowFrontmatter(
      readBundledWorkflowMarkdown("review.md"),
    );
    const security = parseWorkflowFrontmatter(
      readBundledWorkflowMarkdown("security-review.md"),
    );
    const release = parseWorkflowFrontmatter(
      readBundledWorkflowMarkdown("release-check.md"),
    );

    expect(review.command).toBe("/review");
    expect(security.command).toBe("/security-review");
    expect(release.command).toBe("/release-check");
  });

  it("expands bundled workflow prompts with a target", () => {
    const review = parseWorkflowFrontmatter(
      readBundledWorkflowMarkdown("review.md"),
    );
    const prompt = review.body
      .replaceAll("{{TARGET}}", "packages/agent")
      .trim();

    expect(prompt).toContain("packages/agent");
    expect(prompt).not.toContain("{{TARGET}}");
  });
});
