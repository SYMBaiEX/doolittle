import { describe, expect, it } from "vitest";
import {
  commandCompletionQuery,
  commandCompletions,
  commandCompletionText,
} from "./command-completion";

describe("command completion", () => {
  const commands = [
    {
      command: "/approvals approve <id>",
      category: "execution",
      description: "Approve a pending command.",
      aliases: ["/approve <id>"],
    },
    {
      command: "/status",
      category: "runtime",
      description: "Show runtime status.",
      disabledReason: "The local runtime is starting.",
    },
  ];

  it("only opens for a slash-command draft", () => {
    expect(commandCompletionQuery("status")).toBeNull();
    expect(commandCompletionQuery("  /stat")).toBe("/stat");
  });

  it("matches canonical commands and aliases without changing dispatch text", () => {
    expect(commandCompletions(commands, "/approve")).toEqual([commands[0]]);
    expect(commandCompletions(commands, "/status")).toEqual([commands[1]]);
  });

  it("ranks description matches through the Eliza slash-menu matcher", () => {
    const ranked = commandCompletions(
      [
        {
          command: "/workspace tree",
          category: "workspace",
          description: "Inspect the current workspace tree.",
        },
        {
          command: "/runtime",
          category: "runtime",
          description: "Inspect workspace runtime health.",
        },
      ],
      "/runtime",
    );
    expect(ranked[0]?.command).toBe("/runtime");
  });

  it("inserts a usable command prefix instead of placeholder syntax", () => {
    expect(commandCompletionText(commands[0])).toBe("/approvals approve ");
    expect(commandCompletionText(commands[1])).toBe("/status");
  });
});
