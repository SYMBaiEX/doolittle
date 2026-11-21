import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "../../packages/agent/src/runtime/chat";
import { persistUserTurnMemory } from "../../packages/agent/src/runtime/chat-turn/conversation-persistence";
import type { TurnState } from "../../packages/agent/src/runtime/chat-turn/state";
import { SessionService } from "../../packages/agent/src/services/session/service";

it("names chats when the first user turn is saved and keeps explicit names when reopened", async () => {
  const directory = mkdtempSync(
    join(tmpdir(), "doolittle-conversation-title-"),
  );
  try {
    const sessions = new SessionService(directory);
    const createMemory = vi
      .fn(async () => {})
      .mockRejectedValueOnce(new Error("Persistence unavailable"));
    const context = {
      runtime: { agentId: randomUUID(), createMemory },
      services: { sessions },
    } as unknown as AgentExecutionContext;
    const send = (
      sessionId: string,
      text: string,
      connectionSource = "desktop",
    ) =>
      persistUserTurnMemory({
        context,
        turn: {
          roomId: randomUUID(),
          entityId: randomUUID(),
          messageId: randomUUID(),
          localInteractive: true,
          connectionSource,
          sessionId,
        } as TurnState,
        userId: "operator",
        text,
      });

    await expect(send("new-chat", "Failed prompt")).rejects.toThrow(
      "Persistence unavailable",
    );
    expect(sessions.summarize("new-chat")).toMatchObject({
      title: undefined,
      messageCount: 0,
    });

    await send(
      "new-chat",
      'Please fix the flaky deploy job.\n\n<file_context path="/tmp/token.txt">secret=leak</file_context>',
    );
    expect(
      sessions.listSessions(10).find((row) => row.sessionId === "new-chat"),
    ).toMatchObject({ title: "Fix the flaky deploy job", messageCount: 1 });
    await send("new-chat", "Try a second prompt");
    expect(sessions.summarize("new-chat").title).toBe(
      "Fix the flaky deploy job",
    );

    sessions.rename("operator-named", "Manual project title");
    await send("operator-named", "Inspect the tests");
    await send(
      "cli-chat",
      "Use API_KEY=unsafe-placeholder for this request",
      "cli",
    );
    const reopened = new SessionService(directory);
    expect(reopened.summarize("operator-named").title).toBe(
      "Manual project title",
    );
    expect(reopened.summarize("new-chat").title).toBe(
      "Fix the flaky deploy job",
    );
    expect(reopened.summarize("cli-chat").title).toBe("Credential discussion");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
