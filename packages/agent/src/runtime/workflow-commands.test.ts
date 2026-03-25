import { describe, expect, it } from "bun:test";
import {
  listWorkflowCommands,
  resolveWorkflowCommandPrompt,
} from "./workflow-commands";

describe("workflow commands", () => {
  it("lists built-in workflow commands", () => {
    const commands = listWorkflowCommands().map((entry) => entry.command);
    expect(commands).toContain("/review");
    expect(commands).toContain("/security-review");
    expect(commands).toContain("/release-check");
  });

  it("expands workflow command prompts with the target", () => {
    const resolved = resolveWorkflowCommandPrompt({
      message: "/review packages/agent",
      workspaceDir: "/tmp/workspace",
    });

    expect(resolved?.definition.command).toBe("/review");
    expect(resolved?.prompt).toContain("packages/agent");
    expect(resolved?.prompt).not.toContain("{{TARGET}}");
  });
});
