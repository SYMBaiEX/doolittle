import type { Memory } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { createSessionSearchAction } from "./session-search-action";

function message(text: string, source = "cli"): Memory {
  return { content: { text, source } } as Memory;
}

function metadataMessage(text: string, source: string): Memory {
  return {
    content: { text },
    metadata: { doolittle: { source } },
  } as unknown as Memory;
}

describe("session search action", () => {
  it("is planner-selectable and prefers structured query parameters", async () => {
    const search = vi.fn(() => [
      {
        createdAt: "2026-07-29T00:00:00.000Z",
        role: "user",
        sessionId: "session-1",
        text: "Use Nub for package scripts.",
      },
    ]);
    const action = createSessionSearchAction(6);
    const runtime = {
      getService(name: string) {
        return name === "memoryStorage" ? { searchSessions: search } : null;
      },
    };

    await expect(
      action.validate(runtime as never, message("What did we decide before?")),
    ).resolves.toBe(true);
    const result = await action.handler(
      runtime as never,
      message("What did we decide before?"),
      undefined,
      { parameters: { query: "package scripts" } },
    );

    expect(search).toHaveBeenCalledWith("package scripts", 6);
    expect(result).toMatchObject({
      success: true,
      verifiedUserFacing: true,
      data: { query: "package scripts", matchCount: 1 },
    });
    expect(result?.text).toContain("Use Nub for package scripts.");
  });

  it("retains explicit command fallback for SDK shortcut compatibility", async () => {
    const search = vi.fn(() => []);
    const action = createSessionSearchAction(4);
    const runtime = {
      getService(name: string) {
        return name === "memoryStorage" ? { searchSessions: search } : null;
      },
    };

    const result = await action.handler(
      runtime as never,
      message("/search prior decision"),
      undefined,
      undefined,
    );

    expect(search).toHaveBeenCalledWith("prior decision", 4);
    expect(result?.text).toBe("No prior session matches found.");
  });

  it("rejects Slack planner and direct handler searches without touching global history", async () => {
    const search = vi.fn(() => []);
    const action = createSessionSearchAction(4);
    const runtime = {
      getService(name: string) {
        return name === "memoryStorage" ? { searchSessions: search } : null;
      },
    };
    const slackMessage = message("What did another user decide?", "slack");

    await expect(action.validate(runtime as never, slackMessage)).resolves.toBe(
      false,
    );
    const result = await action.handler(
      runtime as never,
      slackMessage,
      undefined,
      { parameters: { query: "private decision" } },
    );

    expect(search).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      text: "Global session history is available only to a local or authenticated API operator.",
    });

    const metadataOnly = metadataMessage("Find a private decision", "slack");
    await expect(action.validate(runtime as never, metadataOnly)).resolves.toBe(
      false,
    );
    await action.handler(runtime as never, metadataOnly, undefined, {
      parameters: { query: "another private decision" },
    });
    expect(search).not.toHaveBeenCalled();
  });

  it.each(["desktop", "api"])(
    "allows the %s operator boundary to search history",
    async (source) => {
      const search = vi.fn(() => []);
      const action = createSessionSearchAction(4);
      const runtime = {
        getService(name: string) {
          return name === "memoryStorage" ? { searchSessions: search } : null;
        },
      };
      const operatorMessage = message("Find the release note", source);

      await expect(
        action.validate(runtime as never, operatorMessage),
      ).resolves.toBe(true);
      await action.handler(runtime as never, operatorMessage, undefined, {
        parameters: { query: "release note" },
      });

      expect(search).toHaveBeenCalledWith("release note", 4);
    },
  );
});
